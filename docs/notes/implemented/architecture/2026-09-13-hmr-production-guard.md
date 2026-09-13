# HMR 生产守卫与安装器退出实例（2026-09-13 白屏事故修复）

> 决策：[ADR-0065](../../../adr/ADR-0065.md) · 分类：architecture · 生命周期：implemented

## Problem

DSH Desktop（LUTE Agentic System）在 `packaging/assemble.sh` 重打包产物替换 `/Applications/DSH Desktop.app` 后出现**整屏白屏**：窗口纯白、无侧边栏/面板/占位符，宿主日志零报错（无 `renderSlot('root')`、无 renderer 错误），但 `lifecycle-events/startup.jsonl` 记录 `rendererStatus: healthy`。

取证链：

1. 12:00 启动（healthy），12:34-12:35 外部进程整体替换 app bundle（2.0.5-lute.2.3.0），运行实例未重启。
2. 白屏形态为**整屏**（连右侧面板都无），排除 root 槽竞态（该形态右侧面板正常）。
3. `Cmd+R` 重载 renderer 后 UI 完全恢复 → boot manifest 与磁盘字节自洽，排除 combo rev 失配。
4. 机制定位：宿主 `dsh-client-hmr`（`lib/index.js`）无条件 stat-poll 每个 client bundle，发现 mtime/size 变化即 `ctx.clientModules.rebuilt(id)` 并推 `rebuilt` SSE 帧；renderer 端（`client.js`）收到帧即对每个插件执行 `invalidate → prefetch → entry.refresh()` 热更。生产模式没有 dev:web 的完整热替换 runtime，50+ 插件同时热更时渲染器崩溃 → 白屏。与 skill 记录「运行中热更可能崩渲染器」一致。
5. 放大因素：本机 electron-runtime 分块**没有** `console-message` 转发补丁（2.0.5 重打包后丢失），renderer 崩溃信息进不了宿主日志 → 白屏静默。

## Decision

三层修复：

1. **流程层（L1）**：`packaging/installer/install.sh` 新增 0b 步骤——替换 `/Applications` 前检测并退出运行中的 DSH 实例（15 秒超时，未退出即中止安装）；`docs/sop/dmg-release.md` 增补发布前检查项、红线与异常表条目。
2. **机制层（L2）**：新增幂等补丁脚本 `dsh-patches/runtime-guards/apply-fixes.sh`（`apply|--check|--verify-anchors|--rollback`）。G1 补丁在 `dsh-client-hmr/lib/index.js` 的 `rehash` 开头加生产守卫：`process.defaultApp !== true && process.env.DSH_DEV !== "1"` 时只推进 watch 基线、不 re-hash、不推 rebuilt 帧；下次完整重启从新字节重新 compose。`DSH_DEV=1` 为逃生门。
3. **可观测性层（L3）**：G2 补丁在 `electron-runtime-*.js` 注册 `console-message` 订阅（兼容新旧 Electron 事件签名），level≥3 走 `logError`，其余走 `logInfo`，带 `[Renderer]` 前缀与 sourceId:line。

补丁已接入 `assemble.sh`（brand-replay 之后重放，缺失即失败），随包分发至 `tools/runtime-guards/`，并登记于 `dsh-patches/patches-manifest-v2.md`（G1/G2 行）。

验证：门禁 `pnpm run gate` 20/20；连续冷启动两次均 `healthy` + 截图 UI 正常；G1 受控实验（运行中给 client bundle 追加一字节 → 5 秒后 UI 稳定无白屏 → 还原字节）；改动后 app 用 `LUTE Code Signing` 证书重签（`codesign --verify --strict` 通过，TCC 授权身份不漂移）。

## Alternatives considered

- **只改 renderer 端（client.js 忽略帧）**：改动面小但治标——宿主仍 re-hash 并推帧，manifest 与页面状态脱节，且 SSE 通道继续空转；不如 host 侧直接不推。
- **改 vendor/dsh-desktop 源码**：违反 ADR-0008（基座只 pin 不改），否决。
- **profile override 改 dsh-client-hmr**：宿主内置核心包不走 loader overlay，override 不可靠；unpacked 遮蔽 + 打包基线重放是既有可行路径。
- **修 2.0.4 时代的 console 转发补丁直接移植**：旧补丁只兼容旧版 Electron 位置参数事件签名，2.0.5（Electron 43）需兼容对象签名，故重写为双形态兼容。

## Consequences

- 生产模式下 HMR 链对「外部进程改字节」免疫；代价是**生产环境不再有任何运行中热更能力**（本就无 dev:web runtime，属预期），开发模式（`process.defaultApp === true`）行为不变。
- `assemble.sh` 对 runtime-guards 脚本存在性改为硬失败——该守卫视为发货必需品，缺失即中止装配。
- 两个补丁的锚点随基座版本可能漂移；升级后跑 `runtime-guards/apply-fixes.sh --verify-anchors` 体检，漂移时手工适配。
- 本机 app 因直接改 unpacked 文件破坏签名密封，已用固定证书重签恢复；今后一律走「打包时重放 + 统一签名」路径，不再对已装 app 直接手术主进程/宿主侧文件。
