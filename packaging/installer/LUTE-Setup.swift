// LUTE Setup —— DSH Desktop × Magpie-Horch 集成包安装器（GUI 包装）
//
// 行为：定位 bundle 所在卷根（dmg 挂载点）的 install.sh，以流式日志窗口运行，
//       完成后提供「打开 TCC 系统设置」与「查看校验命令」指引。
// 提权：install.sh 内部仅对「写 /Applications」一步经 osascript 弹管理员密码框。
//
// 构建（swiftc，无第三方依赖）：
//   swiftc -O -o "LUTE Setup.app/Contents/MacOS/LUTE Setup" LUTE-Setup.swift
import AppKit
import Foundation

final class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var logView: NSTextView!
    var spinner: NSProgressIndicator!
    var installButton: NSButton!
    var tccButton: NSButton!
    var statusLabel: NSTextField!
    var process: Process?

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildUI()
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

        window.contentView = content
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func volumeRoot() -> URL {
        // bundle 位于 dmg 卷根：.../LUTE Setup.app → 卷根
        Bundle.main.bundleURL.deletingLastPathComponent()
    }

    private func appendLog(_ text: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.logView.textStorage?.append(NSAttributedString(string: text))
            self.logView.scrollRangeToVisible(NSRange(location: self.logView.string.count, length: 0))
        }
    }

    @objc private func startInstall() {
        let root = volumeRoot()
        let script = root.appendingPathComponent("install.sh")
        guard FileManager.default.isExecutableFile(atPath: script.path) else {
            statusLabel.stringValue = "未找到 install.sh（请从完整安装包运行本程序）"
            return
        }
        installButton.isEnabled = false
        tccButton.isHidden = true
        spinner.startAnimation(nil)
        statusLabel.stringValue = "安装中……写入 /Applications 时会弹出管理员授权框，请留意。"

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
