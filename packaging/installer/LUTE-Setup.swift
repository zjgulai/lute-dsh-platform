// LUTE Setup —— DSH Desktop × Magpie-Horch 集成包安装器（GUI 包装）
//
// 行为：定位安装载荷（install.sh 所在目录），以流式日志窗口运行，完成后提供
//       「打开 TCC 系统设置」与「查看校验命令」指引。
// 提权：install.sh 内部仅对「写 /Applications」一步经 osascript 弹管理员密码框。
//
// 构建（swiftc，无第三方依赖）：
//   swiftc -O -o "LUTE Setup.app/Contents/MacOS/LUTE Setup" LUTE-Setup.swift
//
// ── 为什么不能在「bundle 的上级目录」里找 install.sh（2026-09-13 线上缺陷）──────
// 原实现只有一条定位路径：`Bundle.main.bundleURL.deletingLastPathComponent()`，
// 并要求该目录下的 install.sh 带可执行位。三种真实情况下它都会失败，而失败信息只有
// 一句「未找到 install.sh（请从完整安装包运行本程序）」，用户与我们都无从下手：
//
//   ① App Translocation（Gatekeeper 路径随机化）：本包未公证，dmg 从网络下载后带
//      com.apple.quarantine；用户在**挂载的 dmg 里**双击本程序（正是我们文档教的流程）
//      时，系统会把**只有 app bundle 自己**复制进 /private/var/folders/.../AppTranslocation/
//      <UUID>/d/ 这个随机只读镜像再从那里启动。于是 bundle 的上级目录成了那个随机目录，
//      真正的 install.sh 还留在 /Volumes/… 上——**不再是同级文件**。
//      这与「用户拖错位置」在输出上不可区分，但它是每个用户都会踩的那一种。
//   ② 用户把 app 拖出 dmg：同级确实没有 install.sh。
//   ③ install.sh 在、但可执行位在转存途中丢了（第三方解压工具 / 网盘 / Windows 中转）。
//      而本程序是用 `/bin/bash <path>` 执行脚本的——**根本不依赖可执行位**，那道门是白加的。
//
// 因此：定位改为「同级 → 挂载卷/下载/桌面」的多候选搜索（按载荷指纹 + 版本匹配），
// 脚本检查改为「存在且可读」，失败时把**读数**打给用户（ADR-0043：失败必须给出为它
// 负责的读数）。另加 `--print-payload-root` 诊断模式，使这条判据可以被脚本测。
import AppKit
import Foundation

// MARK: - 载荷定位

/// 一个候选载荷目录的读数。`ok == false` 时 `detail` 说明它为什么被拒。
struct PayloadCandidate {
    let root: URL
    let version: String?
    let ok: Bool
    let detail: String
}

/// 载荷指纹：这两个文件同时可读，才算「这是一个完整安装包」。
/// 只有 install.sh 不够——真被拖出来的单文件目录同样满足，而它跑不起来。
let PAYLOAD_REQUIRED_FILES = ["install.sh", "DSH Desktop.app.tar.gz"]

func readPayloadVersion(_ root: URL) -> String? {
    let url = root.appendingPathComponent("VERSION")
    guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
    for line in text.split(separator: "\n") {
        if line.hasPrefix("LUTE_VERSION=") {
            return String(line.dropFirst("LUTE_VERSION=".count)).trimmingCharacters(in: .whitespaces)
        }
    }
    return nil
}

/// 本程序自带的版本（Info.plist CFBundleVersion = `2.0.5-lute.<版本>`）。
func appVersion() -> String? {
    guard let raw = Bundle.main.infoDictionary?["CFBundleVersion"] as? String else { return nil }
    guard let range = raw.range(of: "lute.") else { return raw }
    return String(raw[range.upperBound...])
}

func inspectCandidate(_ root: URL) -> PayloadCandidate {
    var missing: [String] = []
    var unreadable: [String] = []
    let fm = FileManager.default
    for name in PAYLOAD_REQUIRED_FILES {
        let path = root.appendingPathComponent(name).path
        if !fm.fileExists(atPath: path) {
            missing.append(name)
        } else if !fm.isReadableFile(atPath: path) {
            unreadable.append(name)
        }
    }
    if !missing.isEmpty {
        return PayloadCandidate(root: root, version: nil, ok: false, detail: "缺少 \(missing.joined(separator: " / "))")
    }
    if !unreadable.isEmpty {
        return PayloadCandidate(root: root, version: nil, ok: false, detail: "不可读 \(unreadable.joined(separator: " / "))")
    }
    return PayloadCandidate(root: root, version: readPayloadVersion(root), ok: true, detail: "完整")
}

/// 搜索根：每个根下面**逐个子目录**看一遍（dmg 挂载点、下载、桌面都是「一层里放载荷」）。
/// `LUTE_SETUP_SEARCH_ROOTS`（冒号分隔）可覆盖——自测用它把搜索面指向临时目录。
func payloadSearchRoots() -> [URL] {
    let env = ProcessInfo.processInfo.environment["LUTE_SETUP_SEARCH_ROOTS"]
    if let env, !env.isEmpty {
        return env.split(separator: ":").map { URL(fileURLWithPath: String($0)) }
    }
    var roots = [URL(fileURLWithPath: "/Volumes")]
    let home = FileManager.default.homeDirectoryForCurrentUser
    roots.append(home.appendingPathComponent("Downloads"))
    roots.append(home.appendingPathComponent("Desktop"))
    return roots
}

func isTranslocatedBundle() -> Bool {
    Bundle.main.bundlePath.contains("/AppTranslocation/")
}

/// 定位结果：选中的载荷 + 全部读数（无论成败都要能打印出来）。
struct PayloadResolution {
    let chosen: URL?
    let candidates: [PayloadCandidate]
    let scanned: [String]
    let note: String
}

func resolvePayload() -> PayloadResolution {
    var candidates: [PayloadCandidate] = []
    var scanned: [String] = []

    // ① 同级目录（未发生 translocation 的正常情形）
    let sibling = Bundle.main.bundleURL.deletingLastPathComponent()
    scanned.append(sibling.path)
    let siblingFinding = inspectCandidate(sibling)
    if siblingFinding.ok { candidates.append(siblingFinding) }

    // ② 挂载卷 / 下载 / 桌面下的逐个子目录
    let fm = FileManager.default
    for root in payloadSearchRoots() {
        guard let children = try? fm.contentsOfDirectory(
            at: root, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) else { continue }
        for child in children {
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: child.path, isDirectory: &isDir), isDir.boolValue else { continue }
            if child.path == sibling.path { continue }   // ①已看过
            scanned.append(child.path)
            let finding = inspectCandidate(child)
            if finding.ok { candidates.append(finding) }
        }
    }

    guard !candidates.isEmpty else {
        return PayloadResolution(chosen: nil, candidates: [], scanned: scanned,
                                 note: "没有任何目录同时含 \(PAYLOAD_REQUIRED_FILES.joined(separator: " + "))")
    }

    // ③ 选：版本与本程序一致者优先；否则唯一候选直接用；多候选取版本最高并念出其余的
    let mine = appVersion()
    if let mine, let exact = candidates.first(where: { $0.version == mine }) {
        let others = candidates.filter { $0.root != exact.root }
        let note = others.isEmpty ? "版本匹配 \(mine)"
            : "版本匹配 \(mine)；另有 \(others.count) 个其它候选未采用"
        return PayloadResolution(chosen: exact.root, candidates: candidates, scanned: scanned, note: note)
    }
    if candidates.count == 1 {
        let only = candidates[0]
        let note = only.version.map { "唯一候选（版本 \($0)，与本程序 \(mine ?? "未知") 不同）" } ?? "唯一候选（读不出版本）"
        return PayloadResolution(chosen: only.root, candidates: candidates, scanned: scanned, note: note)
    }
    let sorted = candidates.sorted { ($0.version ?? "") > ($1.version ?? "") }
    return PayloadResolution(chosen: sorted[0].root, candidates: candidates, scanned: scanned,
                             note: "\(candidates.count) 个候选且无一与版本 \(mine ?? "未知") 匹配——取版本最高的一个")
}

func describeResolution(_ r: PayloadResolution) -> String {
    var lines: [String] = []
    lines.append("本程序位置：\(Bundle.main.bundlePath)")
    lines.append("是否被 macOS 随机重定位（AppTranslocation）：\(isTranslocatedBundle() ? "是" : "否")")
    lines.append("本程序版本：\(appVersion() ?? "读不出")")
    lines.append("搜索过的目录（\(r.scanned.count)）：")
    for path in r.scanned { lines.append("  · \(path)") }
    if r.candidates.isEmpty {
        lines.append("可用安装包：无——\(r.note)")
    } else {
        lines.append("可用安装包（\(r.candidates.count)）：")
        for c in r.candidates {
            lines.append("  · \(c.root.path)（版本 \(c.version ?? "读不出")，\(c.detail)）")
        }
        lines.append("采用：\(r.chosen?.path ?? "无")——\(r.note)")
    }
    return lines.joined(separator: "\n")
}

// MARK: - 无界面诊断模式

/// `--print-payload-root`：只打印读数并退出。
/// 存在的理由：这条判据（「能不能找到安装包」）必须能被脚本测，而不是只能靠人双击看窗口；
/// 同时它是现场取证入口——用户一条命令就能把下面这些读数发回来。
func runDiagnosticMode() -> Int32 {
    let r = resolvePayload()
    print(describeResolution(r))
    if let chosen = r.chosen {
        print("chosen=\(chosen.path)")
        return 0
    }
    print("chosen=")
    return 3
}

if CommandLine.arguments.contains("--print-payload-root") {
    exit(runDiagnosticMode())
}

// MARK: - GUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var logView: NSTextView!
    var spinner: NSProgressIndicator!
    var installButton: NSButton!
    var tccButton: NSButton!
    var copyButton: NSButton!
    var terminalButton: NSButton!
    var statusLabel: NSTextField!
    var process: Process?
    var payloadRoot: URL?

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildUI()
        let r = resolvePayload()
        payloadRoot = r.chosen
        if r.chosen == nil {
            reportLocatorFailure(r)
        } else if isTranslocatedBundle() {
            appendLog("""
            [setup] ⚠ 本程序正被 macOS 从随机只读位置运行（App Translocation）。
                    dmg 未公证时这是标准行为：系统只把 app 本体复制到临时镜像里再启动，
                    所以同级目录已经没有安装包了。已自动在挂载的磁盘映像中定位到它：

            """)
            appendLog(describeResolution(r) + "\n\n")
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func buildUI() {
        let rect = NSRect(x: 0, y: 0, width: 620, height: 440)
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered, defer: false)
        window.title = "LUTE Setup"
        window.center()

        let content = NSView(frame: rect)

        let title = NSTextField(labelWithString: "LUTE Agentic System 安装器")
        title.font = NSFont.boldSystemFont(ofSize: 16)
        title.frame = NSRect(x: 20, y: 398, width: 400, height: 24)
        content.addSubview(title)

        statusLabel = NSTextField(labelWithString: "准备就绪。点击「开始安装」。")
        statusLabel.font = NSFont.systemFont(ofSize: 12)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.frame = NSRect(x: 20, y: 378, width: 580, height: 16)
        content.addSubview(statusLabel)

        let scroll = NSScrollView(frame: NSRect(x: 20, y: 64, width: 580, height: 306))
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        logView = NSTextView(frame: scroll.contentView.bounds)
        logView.isEditable = false
        logView.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        logView.autoresizingMask = [.width]
        logView.textContainerInset = NSSize(width: 6, height: 6)
        logView.minSize = NSSize(width: 0, height: 0)
        logView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        logView.isVerticallyResizable = true
        logView.isHorizontallyResizable = false
        logView.autoresizingMask = [.width]
        logView.textContainer?.widthTracksTextView = true
        scroll.documentView = logView
        content.addSubview(scroll)

        spinner = NSProgressIndicator(frame: NSRect(x: 20, y: 34, width: 20, height: 20))
        spinner.style = .spinning
        spinner.isDisplayedWhenStopped = false
        content.addSubview(spinner)

        installButton = NSButton(title: "开始安装", target: self, action: #selector(startInstall))
        installButton.frame = NSRect(x: 486, y: 24, width: 114, height: 32)
        installButton.bezelStyle = .rounded
        installButton.keyEquivalent = "\r"
        content.addSubview(installButton)

        tccButton = NSButton(title: "打开系统设置（授权）", target: self, action: #selector(openTCC))
        tccButton.frame = NSRect(x: 300, y: 24, width: 176, height: 32)
        tccButton.bezelStyle = .rounded
        tccButton.isHidden = true
        content.addSubview(tccButton)

        // 兜底：定位失败时至少给一条走得通的路（把命令放进剪贴板，用户只需粘贴回车）。
        copyButton = NSButton(title: "复制终端命令", target: self, action: #selector(copyTerminalCommand))
        copyButton.frame = NSRect(x: 20, y: 24, width: 140, height: 32)
        copyButton.bezelStyle = .rounded
        copyButton.isHidden = true
        content.addSubview(copyButton)

        terminalButton = NSButton(title: "打开终端", target: self, action: #selector(openTerminal))
        terminalButton.frame = NSRect(x: 164, y: 24, width: 110, height: 32)
        terminalButton.bezelStyle = .rounded
        terminalButton.isHidden = true
        content.addSubview(terminalButton)

        window.contentView = content
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func appendLog(_ text: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.logView.textStorage?.append(NSAttributedString(string: text))
            self.logView.scrollRangeToVisible(NSRange(location: self.logView.string.count, length: 0))
        }
    }

    /// 定位失败 = 把读数摆到用户面前（而不是一句「未找到」）。
    private func reportLocatorFailure(_ r: PayloadResolution) {
        statusLabel.stringValue = "未找到可用的安装包。下面是取证读数——把它发给我们即可定位。"
        installButton.isEnabled = false
        copyButton.isHidden = false
        terminalButton.isHidden = false
        appendLog("[setup] ✗ 未找到可用的安装包\n\n")
        appendLog(describeResolution(r) + "\n\n")
        appendLog("""
        可以这样做：
          ① 点左下「复制终端命令」→「打开终端」→ 粘贴回车（终端方式不经过 Gatekeeper，最稳）；
          ② 或者确认 dmg 已挂载，且不是把 LUTE Setup.app 拖出 dmg 后单独运行。

        """)
    }

    @objc private func startInstall() {
        guard let root = payloadRoot else {
            reportLocatorFailure(resolvePayload())
            return
        }
        let script = root.appendingPathComponent("install.sh")
        // 只要求「存在且可读」：下面用 /bin/bash 执行脚本，可执行位不是必要条件。
        // 旧实现在这里用 isExecutableFile，于是「文件在、只是没有 x 位」会被报成
        // 「未找到 install.sh」——把一种可修的情况说成了不存在。
        guard FileManager.default.isReadableFile(atPath: script.path) else {
            reportLocatorFailure(resolvePayload())
            return
        }
        installButton.isEnabled = false
        tccButton.isHidden = true
        spinner.startAnimation(nil)
        statusLabel.stringValue = "安装中……写入 /Applications 时会弹出管理员授权框，请留意。"
        appendLog("[setup] 安装包：\(root.path)\n")

        let proc = Process()
        process = proc
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = [script.path]
        proc.currentDirectoryURL = root

        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { return }
            if let s = String(data: data, encoding: .utf8) { self?.appendLog(s) }
        }
        proc.terminationHandler = { [weak self] p in
            DispatchQueue.main.async {
                guard let self else { return }
                self.spinner.stopAnimation(nil)
                self.installButton.isEnabled = true
                if p.terminationStatus == 0 {
                    self.statusLabel.stringValue = "安装完成。请重新授权 TCC 后重启 DSH Desktop。"
                    self.tccButton.isHidden = false
                } else {
                    self.statusLabel.stringValue = "安装失败（详见日志）。可重试或截图日志反馈。"
                }
            }
        }
        do { try proc.run() } catch {
            statusLabel.stringValue = "启动安装脚本失败: \(error.localizedDescription)"
            spinner.stopAnimation(nil)
            installButton.isEnabled = true
        }
    }

    /// 给用户的终端兜底命令（定位成功用它，失败则给出挂载卷的通用形态）。
    private func terminalCommand() -> String {
        if let root = payloadRoot {
            return "cd \"\(root.path)\" && bash install.sh"
        }
        let version = appVersion() ?? "<版本>"
        return "cd \"/Volumes/DSH Desktop LUTE \(version)\" && bash install.sh"
    }

    @objc private func copyTerminalCommand() {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(terminalCommand(), forType: .string)
        statusLabel.stringValue = "命令已复制。点「打开终端」，粘贴后回车即可。"
    }

    @objc private func openTerminal() {
        NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app"))
    }

    @objc private func openTCC() {
        NSWorkspace.shared.open(
            URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
