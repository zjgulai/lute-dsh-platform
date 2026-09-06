# DSH Desktop 2.0.4 补丁清单（Patch Manifest）

> 本文档是全部本地补丁的唯一权威登记簿。每次升级/重装后：
> 1. 跑 `./verify-patches.sh` 检查漂移；
> 2. 漂移的补丁按下方「改动」列重放；
> 3. 更新本清单。

## P0 补丁（2026-08-30 完成，7/7）

| # | 项 | 目标文件 | 改动 | 回滚 |
|---|---|---|---|---|
| P0-1 | 无签名更新器 | `app.asar.unpacked/lib/electron-runtime-DS52LbUW.js` | 移除 `shell.openPath`/`launchWindowsUpdateInstaller` 自动执行；`macInstallInstructions` 文案改「已下载」 | `cp .orig`（含 P0-1 前状态） |
| P0-2 | 静默回滚显性化 | `lib/main.js` + `dshmarket/lib/backup.js` | `restoreSlot` 与 `restoreProfileBackup` 加 `console.error` 日志 | `main.js.p02.bak` / `backup.js.orig` |
| P0-3 | compaction 崩溃 | profile override `dsh-llm@0.1.2-alpha.1-override` | `lib/index.js:1526` + `lib/types/index.js:534` 改 `imageRequestPricing?.()` | 删 override 目录 |
| P0-4 | agent-dispose 崩溃 | override `dsh-tool-subagent@0.1.2-alpha.1-override` + 现有 `dsh-file-reference-local` override | `fiber.dispose().catch` → `Promise.resolve(fiber.dispose()).catch` | 删 tool-subagent 目录 |
| P0-5 | 记忆 | `@zseven-w/dsh-noema/lib/{status-route,import-service}.js` + `dsh-memory-local/lib+src` + `cordis.patch.yml` | 状态路由恢复真实 `ok`；ledger 原子写；python3 默认；dbPath 绝对化；跳过 delegationDepth>0 自动记忆 | `.orig` / git |
| P0-6 | 权限/隐私 | `electron-runtime-DS52LbUW.js` + `diagnostic-export-worker.js` | 加 `setPermissionRequestHandler` 全拒；openExternal 仅 mailto；排除 `.dmp` | `.p06.bak` / `.orig` |
| P0-7 | 首启 profile 占位替换 | `lib/main.js`（ditto 块内） | 首启 ditto 拷贝内嵌 profile 后，把 `cordis.patch.yml` 的 `__DSH_HOME__` 替换为真实 DSH home（R2b「仅拖 app」兜底路径） | `main.js.p07.bak` |



## UI/UX Unification & Modules (2026-09-03)

| # | 项 | 目标文件 | 改动 | 回滚 |
|---|---|---|---|---|
| UI-1 | ErrorBoundary (全局防白屏) | `dsh-web-frontend/dist/index.html` | 顶层注入 `error`/`unhandledrejection` 拦截并降级原生带堆栈渲染 | 还原 `index.html` 备份 |
| UI-2 | 暗黑模式全透传 | `native-ui/assets/dsh-theme.css` 及脱机 html | 将 `design_platform_css_default` 提纯为 `prefers-color-scheme: dark` 并向 `setup-wizard` / `recovery` 等页面引流注入 | 删除 css 及 html 中 `<link>` |
| UI-3 | macOS 按钮翻转 | `native-ui/assets/desktop-dialog-C6qDR3Sk.js` | 硬劫持生成器，嗅探 `navigator.userAgent` 为 macOS 则 `reverse()` 并调优 gap | 还原 `desktop-dialog` 备份 |
| UI-4 | 危险区高亮 | `dsh-plugin-desktop` (lib/client.js) | Patch `ToggleRow` 新增 `danger` 属性，警示 `startupAutoRollback` | 还原 `client.js` 备份 |
| FIX-1 | Cordis 崩溃 | `dsh-context/lib/client.js` | 为插件补齐 `inject: ["remote.session"]`，彻底终止 session 重置白屏 | 改回原状 |
| MOD-1 | Agent Team DAG | `dsh-agent-team-gui-local/src/index.ts` | 修复 `jobs` 强制注入缺失问题，重构 Dispose 异步销毁挂载点以兼容 DSH | 重新拉代码 |
| MOD-2 | Overseas 生态入列 | `~/.dsh/profiles/desktop/cordis.yml` | 将已完备安全验证的 `dsh-overseas-tools` 及 `dsh-overseas-skills` 注入编排 | 删除末尾条目 |


## Agent Preset 品牌化改造（2026-09-04）

| # | 项 | 目标文件 | 改动 | 回滚 |
|---|---|---|---|---|
| PR-1 | 预设卡片图标通道 | `@deepseek-ai/dsh-agent-presets/lib/index.js` | preset.yml 元数据解析与 `presets.list()` 序列化增加 `icon` 字段透传 | 还原两处 `preset.icon`/`record.icon` 补丁 |
| PR-2 | 卡片头像渲染 | `@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js` | cardHead 注入 `<img class="AQuUOa_cardAvatar">`（52px 方形圆角）与标题平级对齐 | 还原 DOM 注入块 |
| PR-3 | 12 角色头像 | `~/.dsh/.agent-presets/*/preset.yml` + `manifest.json` | 类人漫画头像（爸爸/妈妈/宝宝），品牌绿 #58B848 细描边方形徽章，头部占比 80-85% | 删除 `icon:` 行 |
| PR-4 | 岗位化命名 | 同上 12 目录 | 12 个预设改名为工作岗位角色（全栈开发架构师/视觉创意主理人/跨境财务精算师等） | 还原 name/description |
| PR-5 | 卡片美化（绿渗透 8%） | `dsh-client-ui-agent-preset/lib/client.js` | 卡片左上角 8% 品牌绿径向光晕、hover 绿边+浮起、使用中绿胶囊、头像绿光环；全部 color-mix 自动适配暗/浅主题 | 还原 6 处 CSS 补丁 |

> 头像生成脚本位于 `~/project/Magpie-Horch/build-bigface-avatars.js`（当前版本），预览页 `avatar-preview-dark.html` / `avatar-preview-light.html`。


## lute-brand-icons Skill 与 55 枚品牌图标库（2026-09-04）

| # | 项 | 位置 | 说明 |
|---|---|---|---|
| SK-1 | Skill 主体 | `~/.dsh/skills/lute-brand-icons/SKILL.md` | 品牌规范/五官坐标/色板/铁律（任意 Agent 可复现同款） |
| SK-2 | 参数化引擎 | `~/.dsh/skills/lute-brand-icons/lib/generator.js` | 框架/头型/五官/发型/配饰/领型/胸口徽章函数库 |
| SK-3 | 图标目录 | `scripts/catalog.js` | 55 条：24 职业 + 12 家庭 + 14 通用 + 5 已上线预设专属 |
| SK-4 | 成品 | `assets/icons/*.svg` + `assets/manifest.json` | SVG 源文件 + base64 data URI 索引 |
| SK-5 | 总览 | `assets/preview-dark.html` / `preview-light.html` | 暗/浅双主题 55 枚总览（workspace 有副本） |
| SK-6 | 重建同步 | `~/.dsh/.agent-presets/*/preset.yml` | 已上线 12 个预设图标由新引擎统一重建 |

> 2026-09-04 增补：`kol-hunter`（深链星探）→ 中文命名「红人星探」并补品牌头像；`kol-content-expert` 粉色旧头像统一重建为品牌绿。目录增至 57 条（含 talent-scout / kol-content-expert）。

## 修复前已存在的补丁

| 项 | 位置 | 说明 |
|---|---|---|
| chatui-fix（加载更早 + ⬆️ 回填） | 3 个 client bundle（`.orig` 在旁） | `dsh-chatui-fix/apply-fixes.sh` 管理；锚点见 verify-patches.sh「chatui」3 条 |
| skill 中文标题（`title` 字段） | `dsh-skill`/`dsh-skill-filesystem`/`dsh-tool-skill`/`dsh-api-session-controller` 等 8 包 | `/` 选择器与模型目录透传 `title`；见 `dsh-skill-title-fix/`；锚点见 verify-patches.sh「skill-title」3 条 |
| 剪贴板 execCommand 兜底 | `dsh-client-ui-primitives/lib/index.js` | `navigator.clipboard` 失败时走 `document.execCommand("copy")`；锚点见 verify-patches.sh「clipboard」1 条 |
| profile `apply-patches.mjs` | `~/.dsh/profiles/desktop/apply-patches.mjs` | 5 项：dsh-memory 去 roleplay / deepresearch http 守卫 / agent-team-gui / dsh-theme inject / file-reference-local override / better-sidebar 文案 |
| 品牌替换（ROOT） | `lib/client.js`、`dsh-web-frontend/dist/assets/*`、`native-ui/*` | 升级后需重放；见 `dsh-root-brand-local` |

## 升级后的重放顺序

1. `verify-patches.sh` 报告漂移项；
2. 重放漂移补丁（按上表锚点）；
