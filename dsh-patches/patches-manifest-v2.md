# DSH Desktop 2.0.5 补丁清单 v2（Patch Manifest v2 · LUTE 2.0.0 权威登记簿）

> 基线：官方 DSH.Desktop-2.0.5-universal.dmg 解包 → packaging/staging/2.0.0/app
> 校验：`packaging/verify-patches-v2.sh`（38 锚点，2026-09-13 ALL VERIFIED，含 G1/G2 运行时守卫）
> v1（2.0.4）见 [patches-manifest.md](patches-manifest.md)——**已标注为历史、非权威**；本清单是 2.0.0 的唯一权威登记簿
> 纪律延续：.orig 备份 + count==1 锚点门 + node --check + 品牌 BRAND ALL VERIFIED

## A. 宿主壳层（lib/）

| # | 项 | 目标文件 | 锚点（行/标记） | 备份 |
|---|---|---|---|---|
| P0-1v2 | 更新器守卫 | electron-runtime-DLNj0vyk.js | downloadAndOpenUpdate 入口 throw | .p01.orig |
| P0-2v2 | 恢复显性化 | main.js | restoreSlot writeDurable 前 package.json 备份+日志 | .p02.orig |
| P0-6v2 | 外链白名单+权限门 | electron-runtime-DLNj0vyk.js | setWindowOpenHandler 仅 mailto + setPermissionRequestHandler 剪贴板 | .p06.orig |
| P0-6c | 诊断导出隐私 | diagnostic-export-worker.js | .dmp 排除 + active-run.json 脱敏 | .p06c.orig |
| P0-7v2 | 首启内嵌兜底 | main.js + profile-manager-SP3bXlwi.js | createFreshDesktopProfile 内嵌分支（创建/恢复 UI 流）+ materializeDefaultDesktopProfile 内嵌分支（**首启真实路径**，实测官方合成路径绕过 main.js 钩子后重锚） | .p07v2.orig / .p07v2b.orig |
| P0-7v2c | wizard 状态保护（发货级） | main.js | **根因修复**：首启清除点（5391 行 clearDesktopProfileUsageHistory 内含 clearDesktopSetupWizardStateSync）会删除 install.sh 预写的 wizard skip 状态 → 向导重弹并无限等待（全新 userData 首启卡死，实测根因+对照实验）。修复：内嵌拷贝物化 profile（vendor/ 判别）跳过清除；5329 行内嵌分支残留清除同步移除 | .p07v2c.orig |
| RECOVERY | recovery.html 路径 | main.js | RECOVERY_DOCUMENT replace asar→unpacked | .recovery-doc.orig |
| 品牌×10 | ROOT/LUTE 品牌 | 9 文件 + Info.plist + icon.icns（另含 wordmark / index.html 标题；Helper 重命名随包判定） | brand-replay.sh（2.0.5 文件名参数化版）。**2026-09-11 退役 1 锚**：原 `hero.headline` 改写（品牌句的第二条真相源）已删除，品牌句唯一真相源改为 dsh-root-brand 插件（ADR-0019） | — |

## B. 运行时层（app node_modules/@deepseek-ai/）

| # | 项 | 目标文件 | 锚点 | 备份 |
|---|---|---|---|---|
| P0-3 | imageRequestPricing 可选调用 | dsh-llm/lib/index.js:1459 + lib/types/index.js:530 | `imageRequestPricing?.(provider, model)` | .p03.orig ×2 |
| P0-4 | fiber.dispose 包装 | dsh-tool-subagent/lib/index.js:634、dsh-file-reference-local/lib/index.js:354 + lib/types/index.js:49 | `Promise.resolve(fiber.dispose())` | .p04.orig ×3 |
| P0-8 | pi-ai 磁盘加载 | dsh-llm-pi-ai/lib/index.js:10-12 | 三行 lazy import → await import(process.resourcesPath…)（锚点与 2.0.4 逐字一致，pi-ai 0.84.3） | .p08.orig |
| P0-9 | RootOutlet 白屏兜底 | dsh-client-ui-renderer/lib/client.js:886 | root 未注册**不再 throw** → `console.error` 保留诊断文本 + 渲染 `data-slot-waiting="root"` 的全屏「UI 正在装载… / UI is mounting…」占位（用官方 token `--dsw-alias-label-secondary` / `--dsw-alias-bg-base`；`useSyncExternalStore` 已订阅 root 槽，注册到达即自动重渲染）。来源：2026-09-07 的就地修复、2026-09-10 随 2.0.5 重打，**2026-09-12 固化为 NM 补丁**——此前它只存在于开发机 app，源码构建路径（BASE=source）发的是 pristine（`throw`），即客户机的白屏兜底一直是缺的。取证见 `.scratch/pre-dmg-diagnosis/diagnosis-report.md` B3 与 `docs/dsh-desktop-white-screen-playbook.md` §6.1 | .p09.orig |
| cordis-clamp | 索引钳位 | cordis/lib/index.js:183 | `Math.max(0, index - info.offset)`（4.0.2 未修） | .cordis-fix.orig |
| loader-B4 | EntryGroup 回滚 | cordis-plugin-loader/lib/index.js:98 | uid===null 提前返回前回滚 newMap（1.0.3 未修） | .b4.orig |
| G1 | HMR 生产守卫（2026-09-13 白屏机制修复） | dsh-client-hmr/lib/index.js | `rehash` 开头加 `process.defaultApp !== true && DSH_DEV !== "1"` 守卫：生产模式只推进 watch 基线、不 re-hash、不推 rebuilt 帧（防「运行中替换 app bundle → HMR 热更崩渲染器 → 整屏白屏」） | runtime-guards/apply-fixes.sh |
| G2 | renderer console 转发（可观测性） | electron-runtime-Bn05n5V2.js | `setPermissionRequestHandler` 与 `ready-to-show` 之间插 `console-message` 订阅，兼容新旧 Electron 事件签名，level≥3 走 logError | runtime-guards/apply-fixes.sh |
| skill-title×21 | 中文标题透传 | 9 文件（dsh-skill/skill-filesystem/tool-skill/api-session-controller×4/api-remotes/client-ui-skill） | apply.py 重放 ALL OK（rc.1 逐字命中） | .skill-title.orig ×9 |
| chatui×8 | 加载更早+上箭头回填 | api-session-controller/client.js + client-ui-chat/client.js + client-ui-conversation/client.js | loadOlder 自愈/lastOwnMessage/按钮门/recallPrevious；唯一漂移：arbitrate `=== "consumed"` → `!== "pass"`（语义等价，已适配） | .chatui.orig ×3 |
| clipboard | execCommand fall-through | dsh-client-ui-primitives/lib/index.js | catch 不再 return false（rc.1 上游回归，恢复 LUTE 语义） | .clipboard.orig |
| PR-1 | preset icon 透传 | dsh-agent-presets/lib/index.js | record.icon/preset.icon 两处 | .pr1.orig |
| PR-2/5 | 卡片头像+品牌绿 | dsh-client-ui-agent-preset/lib/client.js | bC90nG_cardAvatar + radial-gradient 品牌绿（rc.1 前缀 bC90nG，CSS 全量重写 delta） | .pr25.orig |
| LB-1~3 | log 按钮迁移 | dsh-session-log-export/lib/client.js | header.action=log ×2 + 迁移器 ctx.effect | .lb.orig |

## C. 判定项（无需补丁 / 上游已吸收）

| 项 | 判定 | 证据 |
|---|---|---|
| P0-6 窗口 deny | 2.0.5 已内置（electron-runtime :161/:1707 两处 setWindowOpenHandler→deny） | 上游吸收 |
| UI-4 危险区高亮 | startupAutoRollback 设置被上游整体移除 | 过时 |
| UI-3 macOS 按钮翻转 | 生产基线中已不存在该补丁（资产与审计副本逐字节一致）；2.0.5 dialog 已重构 | 列为验证项：如客户反馈按钮顺序再按新结构做 |
| better-sidebar 文案 | 0.18.1 上游逐字吸收 LUTE 文案 | apply-patches 规则变 no-op |
| noema status/ledger | rc.3 上游吸收 | 同上 |
| dshmarket restore 日志 | 1.45.1 上游吸收（console.error 行在位） | 同上 |
| dsh-context 归类 | 0.47.0 锚点仍在，apply-patches 规则照常生效 | 保留 |

## D. profile 层（apply-patches.mjs 10 规则，rc 时代全量验证通过）

- 本地 file: 插件 6 规则：源已打 → already applied ✅
- 上游已吸收 3 规则（better-sidebar/noema/dshmarket）：no-op，保留无害 ✅
- modlens readImageTool：生产 3.26.1 实测 [patched] 成功（rc-eval 未装该包，非漂移）✅
- dsh-context 归类：0.47.0 锚点验证在位 ✅
- ⚠️ P3 打包注意：预设平面包（tool-subagent/skill-filesystem/tool-skill 等）必须以 checkout 直补为准（profile override 对预设平面失效）；本清单 B 段已全部直补 app checkout。

## E. 品牌重放（2.0.5 适配版）

- brand-replay.sh 两个修复：$cur/$PAYLOAD 花括号 + 两个 hash 文件名参数化（update-checker-DaaZGYGQ.js / electron-runtime-DLNj0vyk.js）——待作为产品侧 PR（与 PR #1 同批或独立）。
- 结果：BRAND ALL VERIFIED（9 文件 LUTE 替换 + Info.plist + icon.icns + wordmark）。

## F. 验证与转正

- verify-patches-v2.sh：**34 锚点 ALL VERIFIED**（2026-09-10）
- 本清单即转正登记簿；v1 保留为 2.0.4 历史。
- 后续升级重放顺序：verify-patches-v2.sh 报告漂移 → 按本表锚点重放 → brand-replay --apply → L1-L4 冒烟。
