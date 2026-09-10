# patches-manifest v2（草稿）— 2.0.5 / rc.1 重锚清单

> 状态：P1 执行蓝图 · 2026-09-10 起草 · 随重锚进展逐项转正
> 基线：官方 DSH.Desktop-2.0.5-universal.dmg 解包 → packaging staging
> 原则：内容锚点优先（编译 hash 文件名全变，禁止按文件名锚定）；每补丁 count==1 验证门 + `.orig` 备份 + 可回滚
> 权威登记簿：dsh-patches/patches-manifest.md（v1，2.0.4）；本文件为 v2 工作稿

## 0. 全局前提（D 轨道已实证）

1. profile `pnpm-workspace.yaml` 必须 `autoInstallPeers: false`（rc 生态 peer 范围 npm 不可解析）
2. 预设平面包（agent-presets cordis.yml 引用）profile override 失效 → 必须直补新 app checkout
3. cordis 4.0.2 / loader 1.0.3 / include 1.0.7 / timer 1.1.4 / group 1.0.2（全家桶升级）
4. Electron 43.3.0 不变 → TCC/codesign 行为不变

## 1. 补丁处置表（35 文件 / 32 锚点）

> 进度（2026-09-10 02:00）：P0-3 ✅（lib/index.js:1459 + lib/types/index.js:530）、P0-4 ✅（tool-subagent:634 + file-reference-local:354 + types:49）、P0-8 ✅（dsh-llm-pi-ai/lib/index.js:10-12，锚点与 alpha.1 逐字一致，pi-ai 0.84.3 dist 路径在位）。均 .orig 备份 + node --check 通过。
> **P0-7 结构性发现**：2.0.5 已移除「内嵌 Resources/dsh-profile + main.js ditto 拷贝」机制，改为 createDesktopWebProfile（PROFILE_TEMPLATES.web 合成最小 profile）+ profile-materializer（pnpm 子进程物化）。P0-7 需重新设计，方案待用户拍板（见 §5）。
> 进度（2026-09-10 03:00）：P0-1v2 ✅（electron-runtime-DLNj0vyk.js downloadAndOpenUpdate 入口守卫）、P0-2v2 ✅（main.js restoreSlot writeDurable 前 package.json 备份+日志）、P0-6v2 ✅（openExternal 白名单化仅 mailto + setPermissionRequestHandler 剪贴板白名单）、P0-6c ✅（diagnostic-export-worker .dmp 排除 + active-run.json 脱敏）。P0-7v2 已落地（main.js createFreshDesktopProfile 内嵌分支，决策 A）。
> **2.0.5 已内置项（补丁可省）**：setWindowOpenHandler→deny 两处（electron-runtime :161/:1707，上游已吸收）；startupAutoRollback 设置整体移除（生产相关补丁与 UI-4 判定过时）。

### A. 保留·重推（内容锚点）

| # | 补丁 | 2.0.5 目标 | 重锚方式 | 已知线索 |
|---|---|---|---|---|
| P0-1 | 更新器免签执行 | `lib/update-download.ts` 编译产物（update-*.js）+ electron-runtime | 内容锚点：`shell.openPath`/`launchWindowsUpdateInstaller` 自动执行块 | v2.0.5 源码仍 magic-only 校验（已核实未修） |
| P0-2 | restoreSlot 显性化 | `lib/main.js`（restoreSlot）+ dshmarket backup.js | 内容锚点：restoreSlot/restoreProfileBackup 函数体 | v2.0.5 profile-checkpoint.ts 仍无日志（已核实） |
| P0-3 | imageRequestPricing | app node_modules `@deepseek-ai/dsh-llm/lib/index.js` + `lib/types/index.js` | rc.1 源码定位 `packages/llm/llm/src/index.ts:660`（主）+ types 副本 | 源码行号已定位，编译产物按模式 grep |
| P0-4 | fiber.dispose().catch | `dsh-tool-subagent/lib/index.js` + `dsh-file-reference-local/lib/index.js`(+types) | rc.1 源码 `packages/subagent/tool-subagent/src/index.ts:675` | 源码行号已定位 |
| P0-7 | 首启 __DSH_HOME__ 占位 | 2.0.5 `lib/main.js` ditto 块 | 结构定位：ditto 拷贝后替换块（2.0.5 main.js 结构变化需重读） | LUTE 安装器语义，上游无替代 |
| UI-3 | macOS 按钮翻转 | native-ui desktop-dialog 产物 | 内容锚点：按钮生成器 | — |
| UI-4 | 危险区高亮 | `lib/client.js` ToggleRow | 内容锚点：ToggleRow + startupAutoRollback | — |
| PR-1/2/5 | 预设头像通道 | `dsh-agent-presets/lib/index.js` + `dsh-client-ui-agent-preset/lib/client.js` | 内容锚点：preset.icon / record.icon / cardHead | rc.1 同名包（已确认存在） |
| LB-1~3 | 日志按钮 log+迁移 | `dsh-session-log-export/lib/client.js` | 内容锚点：header.action 字典 | — |
| chatui×3 | 加载更早+回填 | 3 个 client bundle | 内容锚点：loadOlder 守卫 | rc.1 session-controller 源树已变，需重推语义 |
| skill-title×3 | 中文标题 | dsh-skill 等 8 包 | 内容锚点：title 字段透传 | — |
| clipboard×1 | execCommand 兜底 | `dsh-client-ui-primitives/lib/index.js` | 内容锚点 | — |
| 品牌×11 | ROOT 皮肤 | lib/client.js + web-frontend assets + native-ui | brand-replay.sh 锚点重录 | 组合 rev 按内容哈希变化 |
| apply-patches.mjs | profile 补丁 9 条 | profile 副本 | 逐条重验锚点（deepresearch 守卫在 rc.1 版 dsh-deepresearch 上需重推） | — |

### B. 语义重推（D 轨道专项验证后定稿）

| # | 补丁 | 现状 | 动作 |
|---|---|---|---|
| P0-8 | pi-ai 磁盘加载 | rc.1 的 dsh-llm-pi-ai 已重构（lazy import 消失，pi-ai ^0.84.2） | staging 冒烟实测「DeepSeek request extension preparation failed」是否复发 → 复发则按新结构重推 |
| UI-1 | ErrorBoundary 防白屏 | 上游 beta 有 renderer-health，stable 未见 | staging 实测白屏路径 → 决定保留/换实现 |

### C. 换上游实现

| # | 补丁 | 动作 |
|---|---|---|
| P0-6 | 权限/隐私 | 回移 master `local-window-policy.ts`（35 行：setWindowOpenHandler→deny + openExternal 白名单），替换本地两文件补丁 |
| P0-2 | （观察项） | master 若已加 restoreSlot 日志则同步上游写法，否则保留本地 |

### D. 不动

| # | 补丁 | 说明 |
|---|---|---|
| P0-5 | noema/记忆 | 第三方包独立维护，profile apply-patches 覆盖 |

## 2. cordis 层直补重推

| 文件 | 2.0.4 补丁 | 2.0.5 目标 |
|---|---|---|
| `@deepseek-ai/cordis/lib/index.js`（9-03 直补） | 内容待 diff 原始 .orig | 4.0.2 上按同语义重推或确认上游已修 |
| `cordis-plugin-loader/lib/index.js`（B-4 EntryGroup.update 泄漏） | fiber.uid===null 提前返回回滚 | 1.0.3 上重验（上游 rc 源树可能已修，先 diff 再动） |

## 3. P1 执行顺序（checklist）

1. [ ] 下载/挂载官方 2.0.5 DMG → packaging/staging 建 LUTE 2.0.0 app 骨架（复用 assemble.sh 步骤 1，源换 2.0.5）
2. [ ] verify-patches.sh 全量跑 → 输出漂移清单（预期 32 锚点全红）
3. [ ] 按 A 表逐补丁重推（.orig 备份 → 内容锚点定位 → 改 → node --check → 锚点验证门）
4. [ ] B 表两项在 staging 冒烟（P0-8 复发测试优先）
5. [ ] C 表：local-window-policy.ts 回移 + 删除本地两文件补丁
6. [ ] cordis 层 diff 决策（先 diff 上游 4.0.2/1.0.3 是否已含修复）
7. [ ] 预设平面直补重做（12 presets 的 cordis.yml 引用包清单 + checkout 直补 SOP）
8. [ ] brand-replay.sh 锚点重录（11 → N）
9. [ ] verify-patches v2 全绿 + L1-L4 冒烟矩阵
10. [ ] patches-manifest.md 正式转正 v2（本稿归档）

## 4. 风险登记

- 2.0.5 的 main.js 结构变化（P0-7 依赖的 ditto 块位置/形态可能已改）→ 步骤 1 后先读结构
- 编译产物 minify 变化导致内容锚点失效 → 回退源码级定位（v2.0.5 tag 源码在 /tmp/dsh-sparse 或 raw.githubusercontent）
- #858/#887/#893 在重打包后需重跑复现实验（staging 是全新安装路径）

## 5. P0-7 重设计方案（待拍板）

**事实**：2.0.5 无内嵌 profile 拷贝机制；首启空 profile 目录时由 `createDesktopWebProfile`（profile-manager-SP3bXlwi.js:101）用 `PROFILE_TEMPLATES.web`（dsh-app-boot 内置模板：bundles+patchReload）合成最小 profile，随后 profile-materializer 子进程物化 node_modules。LUTE R2b 的「内嵌 dsh-profile + ditto + __DSH_HOME__ 占位」整体失效。

**选项**：
- A（推荐）：保留内嵌兜底。assemble.sh 照旧注入 Resources/dsh-profile（LUTE 完整 payload）；新增 P0-7v2 补丁 hook 首启分支——profiles 为空且 Resources/dsh-profile 存在时 ditto 拷贝内嵌 profile + 占位替换，否则走官方合成。补丁面：1 处（create 函数调用点或 main.js 首启分支）。
- B：放弃内嵌兜底，接受「只拖 app」时 2.0.5 向导合成空 profile，安装器恢复权威。省 1 补丁，丢 R2b UX。
- C：完全自定义首启逻辑（不 hook 官方），维护成本最高，不推荐。


## 6. 进度日志（2026-09-10 轮次 3）

- ✅ skill-title ×21 处：rc.1 逐字全命中（apply.py 重放 ALL OK，9 文件）
- ✅ chatui 条目 1（loadOlder 自愈）：rc.1 仅 catch 行漂移（isRemoteFailure 别名），已适配重推；条目 2-8 由子代理适配中
- ✅ clipboard fall-through（rc.1 上游把 catch 改成 return false，需恢复 fall-through 语义）
- ✅ RECOVERY_DOCUMENT unpacked 改写
- ✅ LB-1/2/3（rc.1 结构与 alpha.1 逐字一致，原锚点直推）
- ✅ PR-1（agent-presets icon 透传 ×2）、PR-2/5（bC90nG 前缀 CSS 品牌化 + 头像 JSX 注入）
- ⚠️ UI-3 判定：生产基线中该补丁已不存在（desktop-dialog 资产与审计副本逐字节一致）；2.0.5 的 dialog 已由上游重构（profile-compatibility/advisory），macOS 按钮顺序如需翻转按新结构重做——列验证项
- ✅ 品牌 ×11：BRAND ALL VERIFIED（9 文件 LUTE 替换 + Info.plist + icon.icns + wordmark）
- 🐛 brand-replay.sh 两个 bug（待产品侧修）：$cur/$PAYLOAD 后跟中文未加花括号（bash unbound variable）；update-checker/electron-runtime 两个 hash 文件名需参数化（2.0.5 为 DaaZGYGQ/DLNj0vyk）

## 7. P3 流水线迁移日志（2026-09-10）

- ✅ assemble.sh 适配 2.0.5：CFBundleVersion 2.0.5-lute.*、DSH_BASELINE/DSD 基线、P0-8 内联块幂等化、§2b 内嵌布局改 profiles/desktop 嵌套（对齐 P0-7v2）、vendor file: 过滤兼容绝对路径、PROFILE/OUT 环境覆盖、tools 增发 verify-patches-v2.sh
- ✅ rewrite-file-deps.mjs 兼容绝对/相对 file: 前缀（package.json + pnpm-lock 双通道）
- ✅ smoke-test.sh 适配：verify 优先 v2（DSH_APP 指向安装产物）、5c 内嵌布局、overrides 断言改 file-reference-local（2.0.5 语义）
- 🐛 **Helper 缺失崩溃**：品牌改名后 Electron 按 CFBundleName 查找 "LUTE Agentic System Helper*.app"，官方 DMG 助手仍叫 "DSH Desktop Helper*" → 启动 FATAL "Unable to find helper app"。已在 brand-replay.sh 增加 3b 步骤（4 助手目录+内部 plist+二进制全量重命名，幂等）——生产 2.0.4 有此状态但 2.0.4 时代的脚本缺失该步，属回归修复
- ✅ brand-replay.sh：hash 文件名动态化（update-checker/electron-runtime 跨基座自适应）+ $cur/$PAYLOAD 花括号修复
- ✅ 产物：payload（app.tar.gz 489M / profile.tar.gz 151M / aeis 40M / skills-presets 3.9M / Setup.app / install.sh / tools）completeness=30 bundles/17 vendor/252 skills/15 presets
- ✅ L1 codesign --deep --strict；L2 verify v2 34 锚点 + BRAND ALL VERIFIED；L3 smoke 37/37 + **打包产物真实启动 healthy（health-commit/rendererStatus=healthy/0 error）**
- ⚠️ P4 必办：安装器需预写 setup-wizard skip 状态（`<userData>/profile-setup/<sha256(profileDir)>/state.json`，root 与 hash 目录均须 700 权限，否则 2.0.5 首启停在向导/报 invalid state）；smoke 冒烟环境踩坑实录（755 根目录 → "state directory permissions must be 700"）

## 8. P4 安装器迁移日志（2026-09-10）

- ✅ install.sh 适配 2.0.0：2.0.5 头注释、`LUTE_USERDATA` 环境覆盖（冒烟隔离用，客户机默认 Application Support/LUTE Agentic System）、verify 优先 v2、**3b 步骤预写 setup-wizard skip 状态**（`<userData>/profile-setup/<sha256(profileDir)>/state.json`，root+hash 双 700，只写不存在时，不覆盖用户已完成的向导决定）
- ✅ INSTALL-CARD.md → 2.0.0 / CFBundleVersion 2.0.5-lute.2.0.0
- ✅ LUTE Setup.app 随 assemble 重建（内嵌新 install.sh），无需额外改动
- ✅ 升级场景端到端验证（隔离环境）：旧 data/ 保留 ✅、manifest 替换 ✅、node_modules 落位 ✅、wizard skipped 状态 700/700 ✅、备份目录生成 ✅、**升级产物真实启动 healthy/0 error（向导已跳过，不再卡首启）**
- 结论：P4 安装器就绪；P5 = sign-and-dmg/build-pkg + 客户灰度名单
