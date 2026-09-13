# 安装向导自己定位载荷：线上「未找到 install.sh」的机制、修复与可测判据

- 日期：2026-09-13
- 状态：implemented
- 对应 ADR：[ADR-0066](../../../adr/ADR-0066.md)
- 相关：ADR-0043（失败必须给出为它负责的读数）、ADR-0057（产物要么缺席要么完整）、ADR-0063（固定证书签名 / 未公证面）、ADR-0065（运行中替换 app bundle 的白屏红线）、ADR-0009（一份事实只有一个家）

## Problem

客户反馈：在挂载的 dmg 里双击 `LUTE Setup.app`，点「开始安装」后报
**「未找到 install.sh（请从完整安装包运行本程序）」**，安装无法继续。

动工前先分清「打包坏了」还是「运行环境变了」——两者会给出同一句话，而处置完全不同。

1. **先证明出货物是好的。** 挂载 `packaging/release/2.3.0/…dmg` 实测：

   ```
   -rwxr-xr-x  1 lute  staff      16831 install.sh
   drwxr-xr-x  3 lute  staff         96 LUTE Setup.app
   ```

   卷根布局与权限都对；`git log -1 -- packaging/installer/LUTE-Setup.swift` 显示该文件自
   09-06 初始基线（`3b437af`）以来未改动，出货 2.3.1 的二进制里也确实含这条错误串
   （`grep -c "未找到 install.sh"` → 1）。所以不是打包问题。

2. **再读定位代码，把它当被告。** `LUTE-Setup.swift:88-104` 只有一条路径：
   `Bundle.main.bundleURL.deletingLastPathComponent()`（bundle 的上级目录），并要求该目录下的
   `install.sh` 通过 `isExecutableFile`。三种真实情况都会落进同一句话：

   - **App Translocation（Gatekeeper 路径随机化）**：本包未公证 → dmg 从网络下载后带
     `com.apple.quarantine` → 用户**从挂载的 dmg 里**双击向导（正是我们文档教的流程）→ macOS 把
     **只有 app bundle 自己**复制进 `/private/var/folders/.../AppTranslocation/<UUID>/d/` 这个随机只读
     镜像再启动。bundle 的上级成了那个随机目录，`install.sh` 还留在 `/Volumes/…` 上。
     Apple DTS 的说法是该行为的触发条件「未公开」；社区实测（lapcat 的分解）抓到「挂载只读镜像 +
     只复制 bundle」这一步；而「从被重定位的路径反推原路径」**没有受支持的办法**。
     这一条命中每一个「下载 dmg → 挂载 → 双击向导」的用户，不是个案。
   - **用户把 `LUTE Setup.app` 拖出 dmg**：同级确实没有载荷。
   - **可执行位在转存途中丢失**（第三方解压工具 / 网盘 / Windows 转存）：文件在，但被判「不存在」。
     而向导执行脚本用的是 `/bin/bash <path>`（`LUTE-Setup.swift:115-116`）——**根本不依赖可执行位**。

3. **第三件事是最难看的**：三种原因、一个读数都没有。这违反本项目自己的规则（ADR-0043）——
   失败必须给出为它负责的读数。我们让客户看到了一句既不对、也无法据以行动的话。

## Decision

1. **定位改为多候选搜索**：同级 → `/Volumes/*`（逐子目录）→ `~/Downloads`、`~/Desktop`；候选必须满足
   **载荷指纹**（`install.sh` + `DSH Desktop.app.tar.gz` 同时存在且可读），按 `VERSION` 的 `LUTE_VERSION`
   与向导自身版本匹配消歧。搜索面用 `LUTE_SETUP_SEARCH_ROOTS` 覆盖，供自测指向临时目录。
2. **脚本检查改为「存在且可读」**：不要求可执行位。
3. **失败给读数**：自身 bundle 路径 / 是否被 AppTranslocation 重定位 / 本程序版本 / 搜索过的目录 /
   每个候选被接受或拒绝的理由；外加「复制终端命令」「打开终端」两个兜底按钮。定位成功但被重定位时也
   如实说明——否则用户会把它当成故障来报。
4. **加 `--print-payload-root` 诊断模式**：打印同一组读数并退出（找到 0 / 未找到 3）。判据必须能被脚本测。
5. **自测 + 门禁**：`packaging/scripts/setup-app-locate-test.sh` 造 7 个布局/负例，
   `scripts/gate.mjs` 的 `setup-app-locator` 硬校验。
6. **客户安装手册落成 `packaging/INSTALL-GUIDE.md` 并随包分发**：`assemble.sh` 注入 `{{VERSION}}` 后写入
   payload 根；该文件登记进 `TCC_GUIDANCE_SURFACES`（新增一处会教用户授权的地方，必须同时进清单）。

## Alternatives considered

| 备选 | 为什么不选 |
| --- | --- |
| 只改文案（告诉用户「请用终端」） | 不改假设，「双击向导」这条路永远不可用——而它正是面向无终端客户的那条路 |
| 把 `install.sh` 内嵌进向导 | 脚本 17 KB 可内嵌，但 640 MB 的四个 tar.gz 仍须定位，问题只是改名为「找 payload」 |
| 改回 `.pkg` | 交付形态 2.2.0 才收敛到 DMG 单一格式；pkg 要有像样的信任面仍然需要 Developer ID |
| 让用户先把 dmg 内容拷到本地再双击 | 隔离属性会跟着走（拷贝到 `~/Downloads` 仍可能被重定位）——给出「有时管用」的步骤比不给更坏 |
| 保留可执行位检查当「损坏信号」 | 那应由载荷自带的 `SHA256SUMS` 承担，不该由一个会挡住安装的前置检查兼职 |

## Consequences

- **实测（本机，`packaging/scripts/setup-app-locate-test.sh`）**：7 条全绿——T1 同级、T2 translocation 布局
  （从搜索根找回）、T2b 搜索根为空必须失败、T3 无 x 位仍采用、T4 两份载荷按版本选对、T5 无候选给读数并 rc=3、
  T6 残缺载荷被拒。`SETUP LOCATE TEST PASSED`，退出码 0。
- **反向对照（证明自测不是空转）**：把定位器退回旧行为——① 搜索面置空、② 对 `install.sh` 重新要求可执行位——
  同一份自测立刻变红在 T2/T3/T4（`SETUP LOCATE TEST FAILED（3 项）`，退出码 1）。即：**这条自测能抓住已经
  上线的那个缺陷**。
- 定位面变宽 → 可能选中另一个仍挂载的旧版 dmg 里的载荷。用版本匹配收窄；同版本双挂载的残余风险在读数里可见。
- 门禁首次依赖 `swiftc`（本项目构建本就需要 Xcode 命令行工具，`build-setup-app.sh` 同此）。
  机台缺失时门禁红，remediation 写明 `xcode-select --install`——**不静默跳过**。
- 已发出的 2.3.0 / 2.3.1 仍带旧向导：对这两版客户的处置写进安装卡「未找到安装包」那一行
  （终端一条命令，或装 2.3.2+）。
- 本机 `LUTE Setup.app` 的产物仍是**手动**在 staging 里构建的；新逻辑要到 2.3.2 装配时才进入 dmg。
