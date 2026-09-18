# DSH Desktop 2.0.10 补丁清单 v3（Patch Manifest v3 · LUTE 2.5.0 权威登记簿）

> 基线：官方 v2.0.10（upstream 697e7d782，no-ASAR）+ runtime 0.1.5-rc.2 + cordis 4.0.2
> 校验：`packaging/verify-patches-v2.sh`（脚本名不变——dmg-layout gate 等按文件名引用；锚集已是 v3）
> v1/v2 见 [patches-manifest.md](patches-manifest.md) / [patches-manifest-v2.md](patches-manifest-v2.md)——**均已标注为历史、非权威**；本清单是 2.5.0 出货的唯一权威登记簿
> 结构性变化（v2→v3，源码构建语义）：
> 1. **宿主壳层补丁由 vendor LUTE 源码提交承载**（lute-v2.0.10 分支），dist 由源码编译产出——不再是装配期对官方壳的 .js 改写。锚点校验因此直接指向 dist chunk（hash glob 捕捉）。
> 2. **运行时层 NM 补丁**仍在装配期重放（packaging/patches/nm/ → pristine dist node_modules），但对 0.1.5-rc.2 pristine 全量重锚。
> 3. 资源根双形态（no-ASAR `Resources/app` ⇄ 旧 `app.asar.unpacked`）判定唯一家 `scripts/lib/app-resources.mjs`。

## A. 宿主壳层（dist lib/，hash glob 捕捉）

| # | 项 | 目标 chunk | 锚点 | vendor LUTE 提交 |
|---|---|---|---|---|
| P0-1v2 | 更新器守卫 | electron-runtime-*.js | `Update installation is disabled for security` | 95b9cf83e |
| P0-2v2 | 恢复显性化 | **profile-channel-admission-\*.js**（2.0.10 从 main.ts 拆出；v2 钉 main.js 已失效） | `Profile checkpoint restored: package.json will be modified.` | 4d53eabe5 |
| P0-6v2 | 外链白名单+权限门 | electron-runtime-*.js | openExternal 仅 mailto + setPermissionRequestHandler 仅剪贴板 | 17f7d461e |
| P0-6c | 诊断导出隐私 | diagnostic-export-worker.js | .dmp 排除 + active-run.json 脱敏 | 8b934d3b2 |
| P0-7v2b | 首启内嵌兜底（首启真实路径） | profile-manager-*.js | `embeddedRoot`（materializeDefaultDesktopProfile） | 097eef46e |
| ~~P0-7v2(main.js)~~ | **降级/退役**：2.0.10 的 main.ts:727 createFreshDesktopProfile 不再有 2.0.5 的内嵌注入分支；唯一真实路径只剩 P0-7v2b。main.js 变体从校验器删除 | — | — | — |
| P0-7v2c | wizard 状态保护 | profile-manager-*.js（否定式断言） | **语义已随 P0-7v2b port 落在 2.0.10**：materializeDefaultDesktopProfile 不调 clearDesktopProfileUsageHistory（vendor 源注 2026-09-10 兜底实测教训）；dist 实测物化 chunk 无 clear 符号（`ckn` 否定断言） | 097eef46e（含 p07v2c 语义） |
| RECOVERY | recovery.html 路径 | main.js | `app.asar.unpacked`（no-ASAR 下 replace 是 no-op，import.meta URL 已直指 Resources/app/lib/native-ui/recovery.html——2.0.10 上语义意外成立，锚串保留；见 E-3） | 7791496f0 |
| 品牌×9 | ROOT/LUTE 品牌 | updates/update-checker/recovery/setup-wizard/desktop-dialog/client/electron-runtime/main（8 文件 hash glob + main.js userData 路径豁免）+ wordmark JS + index.html | brand-replay.sh（**glob 参数化**：electron-runtime-\*/update-checker-\* 随基座 hash 变化自动捕捉；**D0+L0 → N/A**：上游可能整文件移除品牌串（desktop-terminal.js 实证），旧矩阵把无判定面误报 DRIFT；`${rel}` 花括号修复 macOS bash3.2 多字节变量名吞噬） | 66de2dc6b |

## B. 运行时层（NM patch，packaging/patches/nm/，对 0.1.5-rc.2 pristine 重锚）

| # | 包 | 锚 | 2.0.10 重锚说明 |
|---|---|---|---|
| P0-3 | dsh-llm | `imageRequestPricing?.(provider, model)` ×2 | 未漂，原样命中 |
| P0-4 | dsh-tool-subagent / dsh-file-reference-local | `Promise.resolve(fiber.dispose())` ×3 | 未漂 |
| P0-8 | dsh-llm-pi-ai | PI_AI_API_DIR | 未漂 |
| P0-9 | dsh-client-ui-renderer | data-slot-waiting | **上游 0.1.5-rc.2 已吸收**（raw tgz grep=1）；NM patch 报 skip（patch --forward 判 already-applied），保留作 2.0.5 双基线兼容 |
| cordis-clamp | cordis | `Math.max(0, index - info.offset)` | 4.0.2 未修，锚未漂 |
| loader-B4 | cordis-plugin-loader | `Object.keys(newMap).reverse()` | 1.0.3 未修，锚未漂 |
| G1 | dsh-client-hmr | `Production guard (2026-09-13)` | runtime-guards/apply-fixes.sh，锚未漂 |
| G2 | electron-runtime-*.js | `console-message` | **重锚**：2.0.10 权限门目标收窄为 `this.compatibilityShell?.webContents ?? window.webContents`；G2 订阅挂同一目标（apply-fixes.sh G2_OLD/G2_NEW 随基座换锚） |
| skill-title×5 | dsh-skill / skill-filesystem / tool-skill / api-session-controller / api-remotes | 各包 .patch | 未漂 ×4；**ui-skill 重锚**：上游过滤改 `rankByName(skills, query)`，改回 LUTE 三域检索（`needle`小写包含 title/name/description）+ `title ?? name` 展示 + `skillName` 保底（onPick `/candidate.skillName ?? candidate.name`） |
| chatui×3 | api-session-controller / client-ui-chat / client-ui-conversation | loadOlder / 按钮门 / 上箭头 | **conversation 重锚**（5 段：up-key 分支、lastOwnMessage selector、useRef+gate.current 双对象补 empty/editable/lastOwnMessage、pasteText 旁 recallPrevious 实现；pristine gate 两对象以 `uploadsPending,showToast,t` 尾锚区分） |
| clipboard | client-ui-primitives | fall through | 未漂 |
| PR-1 | dsh-agent-presets | record.icon/preset.icon | 未漂 |
| PR-2/5 | dsh-client-ui-agent-preset | **S6drYq_cardAvatar**（v2 钉 bC90nG 前缀已随上游换前缀失效）+ 品牌绿晕 | **重锚**：css 常量五处品牌化（brand 变量/卡片底/hover/active/头像类）+ JSX cardHead 头像 img，S6drYq_ 前缀 |
| LB | dsh-session-log-export | dsh-log-btn-fix + relocate beside sidebar settings | **重锚**：patch 缩单 hunk（迁移块）；"header.action"→上游 `header.more`+`menu.download` 菜单模式，文案两 hunk 退役（E-1） |
| dsh-fs-local | fs-ext stat 形态 | statModeBits/mtimeNs ?? mtimeMs | **上游 0.1.5-rc.2 已吸收**（raw grep：mtimeNs ?? mtimeMs=1、statModeBits=3）；NM patch 报 skip，保留作 2.0.5 双基线兼容 |

## C. 判定项（无需补丁 / 上游已吸收 / 语义意外成立）

1. P0-7v2(main.js)：2.0.10 无此分支（A 节表内已述）。
2. **上游 0.1.5-rc.2 已吸收的 NM 项**（raw tgz 直证）：fs-local（statModeBits/mtimeNs ?? mtimeMs）、P0-9 renderer（data-slot-waiting）——NM patch 以 `--forward` 判 already-applied 报 skip；applier `_classify` 修复后不再把 skip 误报 FAIL。 Cordis-clamp / loader-B4 **未**吸收（B 节）。
3. RECOVERY：no-ASAR 下 `app.asar` 子串不存在 → replace no-op，路径由 import.meta.url 直指 Resources/app——锚串 `app.asar.unpacked`（源码中 replace 表达式）仍在 main.js 命中。若上游日后改写该表达式，按锚门失败暴露。
4. pocket D-track 双修复（2.10.6 升级 + web-rpc）：走 profile 层（apply-patches.mjs 步骤 11），不入 NM 树——见 [13 号计划 §11](../docs/research/13-upgrade-2.0.10-execution-plan.md)。
4. pocket D-track 双修复（2.10.6 升级 + web-rpc）：走 profile 层（apply-patches.mjs 步骤 11），不入 NM 树——见 [13 号计划 §11](../docs/research/13-upgrade-2.0.10-execution-plan.md)。

## D. 本版已知缺口与判定史（gate 显性化）

1. **P0-7v2c 误判纠正（2026-09-17 12:20）**：本轮早先把它登记为「2.0.10 未移植」并自造 marker 钉 verify——仪器对着自造 marker 而非真实保护面（pitfalls 原性重现，当场发现并撤）。2.0.10 真实保护面：`materializeDefaultDesktopProfile`（profile-manager）不调 clear（P0-7v2b port 内嵌该语义，dist 物化 chunk 连 clear 符号都不存在）；`main.ts:727`/`host-bootstrap.ts:56` 两处 `createFreshDesktopProfile` 只服务**用户命名**的 selection 新建 profile，不触及预写 wizard skip 键（2.0.5 症状的触发面是全新 userData 首启物化默认 profile，即 P0-7v2b 路径）。verify 改否定式 `ckn`：物化 chunk 出现 clear 符号 = 红。
2. **session-log 迁移块在 2.0.10 运行时为无害空转（Fact）**：SEL 锚类 `pTsq1a_sessionLogButton`/`sessionLogButton` 在全 pristine NM 树零命中（0.1.5-rc.2 渲染 = `ZgAT2q_moreButton` ⋯ 菜单 + id:"download" 菜单项）→ 块退化为 ~96s 轮询 + 常驻 MutationObserver + 空规则 style 元素，UI 导出入口实际由上游菜单承载。本轮**逐字保留**（裁掉属行为取舍，无浏览器证据不做）；裁剪决策登记给 T-10 冒烟期（届时有真实 UI 观察）。
3. ui-skill：`rankByName` 相关性排序被 LUTE 三域检索取代（LUTE 语义本意）；`skill.title` 是否随 catalog 提供 = Unknown（`??` 兜底在，降级安全）。

## E. 退役与迁移说明

1. session-log header.action 两个 hunk：上游 0.1.5-rc.2 已换 `header.more` + `menu.download` 菜单模式，"Session 日志"/"Session log" 键不存在 → 按钮文案交上游菜单模式，LUTE 只保留迁移块（v3 patch 单 hunk）。
2. PR-2/5 类名 bC90nG→S6drYq：上游 CSS-in-JS 前缀随版本变化，v3 起锚串钉语义前缀外的新类（cardAvatar）并随基座换前缀；下一轮基座再变前缀时按同样手法重锚。
3. verify 脚本名保持 `verify-patches-v2.sh`（dmg-layout gate / smoke-test / assemble.sh 按文件名引用）；「锚集 v3」以本清单为准。
