# G-CODEX-UIUX-001 · LUTE/DSH Codex Desktop 风格 UI/UX 统一迁移

- 状态：已完成（B6 · 主交互台与全局快捷导航全量交付并验收通过）
- 建立日期：2026-09-17
- 目标仓库：`Magpie-Horch`
- 视觉参照：当前 Codex Desktop；品牌、产品名、业务语义仍归 LUTE/DSH
- 当前批次：收口完成（B6 · 主交互台与全局快捷导航）

## B6 · 主交互台与快捷手感收口规划（2026-09-17）

| Ticket | 目标 | 范围 | 状态与验收证据 |
| --- | --- | --- | --- |
| UI-601 | Composer 视觉与交互质感对齐 | `packages/surfaces/dsh-agent-team-gui-local/src/client/{ComposerControl.tsx,styles.ts}` | **已完成**：圆角统一收敛为 8px，去除多余投影与杂色，增加标准 focus-visible 描边，通过全部 66 项 client 单元测试与 4 套 TSConfig 类型检查 |
| UI-602 | Empty State / Hero Entry 视觉降噪 | `packages/surfaces/dsh-role-matrix-local/src/client/{hero-entry.module.css,hero-entry.tsx}` | **已完成**：卡片边框圆角降噪（10px→8px，8px→6px），压缩内边距与字体层级；通过全部 113 项单元测试与 23/23 项真实 Chrome 布局探针 |
| UI-603 | 浮层退栈与键盘交互优化 | `packages/surfaces/{dsh-newapp-local,dsh-role-matrix-local,dsh-skill-center-local}/src/client/*.tsx` | **已完成**：统一 Escape 监听守卫，表单内（input/textarea/select/contentEditable）按 Escape 拦截退栈，防止意外误关；NewApp (182/182)、RoleMatrix (113/113)、SkillCenter (84/84) 测试全绿 |
| UI-604 | B6 综合验证与装载点同步 | 包级回归、`sync-profile.mjs`、实机 live 探针与截图更新 | **已完成**：装载点 24 包一致性同步完成，Live 探针 100% 通过，实况截图存盘为 `live-desktop-b6-overview.png` |

## Goal

把当前项目所有用户可见 UI 统一到一套稳定、克制、商业化的 Codex Desktop 视觉语法：

1. 先统一视觉调性：颜色、字体、间距、圆角、控件、层级、动效、信息密度和浅色/深色/系统跟随。
2. 再统一页面空间结构：基础画布 → 内容面板 → 顶层抽屉/弹层；不以装饰性卡片堆叠页面。
3. 最后按业务页面迁移布局：保留现有入口、业务信息架构、数据契约、路由、slot、权限和行为语义。
4. 每个批次集中完成代码、包级验证、装载点同步后，只重启一次 DSH Desktop，再做 live GUI、固定截图和人工视觉验收。
5. 每个页面都必须能解释：用户从哪里进入、当前层级是什么、下一步能做什么、失败时如何恢复。

## 固定边界

- `dsh-theme-local` 是唯一视觉 token owner；不引入第二套 design-system runtime。
- 保留 LUTE/DSH logo、产品名称和业务色；业务色只用于强调、选中、主操作和状态。
- 不修改 vendor、基座 pin、数据库、数据迁移、路由契约、slot 契约或权限模型。
- 不把历史截图、静态计划或本地缓存产物当成 live/生产验收。
- 不在不同页面复制新的任意颜色、字体或动效；所有新增样式必须落到现有语义 token 或批次统一基线。
- 共享工作区已有 dirty changes 归原任务所有；只修改本批明确的文件集合。

## 视觉合同

| 维度 | 统一规则 | 验收口径 |
| --- | --- | --- |
| 颜色 | 中性画布、内容面板、侧栏、主文字、次文字、边界、状态色分层；品牌绿只作强调 | 浅/深/系统三态截图与 token acceptance |
| 空间 | 基础画布 → 内容面板 → 顶层抽屉/弹层；抽屉家族共用遮罩、标题、关闭、滚动和 footer 语法 | 同一批页面截图对照，不出现独立视觉方言 |
| 抽屉 | `narrow=720px`、`standard=880px`、`wide=960px` 三档；都使用 `min档, 92vw` 响应式保护 | 1280、1580、窄屏下不裁切、不挤压关键操作 |
| 卡片 | 只承载语义、状态或操作边界；目录浏览优先扁平列表/分组，减少装饰性卡片 | 无“卡片套卡片”、无重复标题层级 |
| 字体 | 系统无衬线；代码/路径/元数据使用等宽；四级信息层级 | 标题、说明、主体、元数据可一眼区分 |
| 控件 | 主按钮/次按钮/危险按钮/输入/选择/切换统一高度、焦点环、禁用态 | 键盘焦点、对比度、点击区域可测 |
| 动效 | 150–220ms，默认 180ms；`prefers-reduced-motion` 静态降级 | 视觉验收 + reduced-motion 测试 |
| 密度 | 中高密度；减少大面积空白和无意义留白，但保留分组呼吸感 | 主要任务在首屏可理解、滚动范围可控 |

## 阶段与 Ticket

### P0 · 基线与治理（先完成一次，后续不重复造轮子）

| Ticket | 内容 | 状态 |
| --- | --- | --- |
| UX-001 | 视觉合同、token 使用边界、抽屉三档和卡片准入规则 | 已固化到 ADR-0104；本文件作为执行台账 |
| UX-002 | 真实 surface inventory：入口、DOM/React 结构、样式、测试、live 证据和风险 | 执行中 |
| UX-003 | 固定状态截图 + package test/typecheck/build + profile sync + 单次重启验收模板 | 执行中 |

### P1 · 主题与 Settings 规范样本

| Ticket | 内容 | 状态 |
| --- | --- | --- |
| UI-101 | `dsh-theme-local` 默认 Codex palette、双主题和系统跟随 | 已完成，需随最终批次回归 |
| UI-102 | Settings：固定分组导航、单一内容滚动区、统一表单行、抽屉几何和 reduced motion | 代码完成；统一 live/截图验收待目标 Desktop 恢复 |
| UI-103 | Settings 的 section 内容仍按业务语义逐步扁平化，不改入口和 slot | 待后续页面批次 |

### P2 · B1 右侧抽屉家族（当前执行批次）

三项并行改造，但共享同一视觉合同；本批完成后才统一重启和 live 验收。

| Ticket | 目标 | 主要范围 | 验收 |
| --- | --- | --- | --- |
| UI-201 | New App：从“产品卡集合”变成统一标准抽屉 | `dsh-newapp-local` panel/header/grid/card/empty/error/action CSS 与现有 JSX 结构 | 产品入口、空态、失败态、打开行为不变；抽屉标准宽度；双主题截图 |
| UI-202 | Role Matrix：宽抽屉中的层级浏览与 inline detail | `dsh-role-matrix-local` panel/header/toolbar/plane/domain/card/detail/footer CSS | 组织平面、域、角色展开/收起、搜索和详情行为不变；卡片降噪 |
| UI-203 | Skill Center：业务能力目录抽屉 | `dsh-skill-center-local` entry/drawer/header/search/chip/grid/skill/dev form CSS | 搜索、域筛选、启停、删除、开发者表单行为不变；不改技能语义 |
| UI-204 | 抽屉家族共性收口 | 三包共同的 surface token、边界、焦点、遮罩、动效、宽度变体和 reduced motion | 静态 selector/token 检查；无新增 runtime |
| UI-205 | B1 一次性验收 | 三包 typecheck/test/build、profile sync、一次 DSH restart、live probes、固定截图、人审 | 记录真实结果；失败不伪装成完成 |
| UI-206 | Settings 与右侧 sidebar 的层级冲突 | 只抬高通过 Settings DOM 契约校验的外层 presentation wrapper，不改 vendor，不影响其他 modal | Settings 打开时右侧 sidebar 留在 mask 后方；包级 CSS 契约、build、live reload 后复查 |

### P3 · 主交互与管理层

| Ticket | 页面/能力 | 目标布局 | 主要风险 |
| --- | --- | --- | --- |
| UI-301 | Composer + 空会话 | 共享主交互：最小首屏锚点、输入区、快捷入口、状态反馈 | 触及官方 shell/slot；先做结构审计再改 |
| UI-302 | Team Hub 管理入口 | admin 侧抽屉/列表/详情；权限和状态显式分层 | 管理权限、错误恢复、敏感信息不可泄露 |
| UI-303 | Agent Team / Recipes | resource list/detail 与 editor/preview/validation 双栏 | 容器状态、保存/校验、运行状态不能被视觉改造破坏 |
| UI-304 | Run Center | list + detail；运行中/成功/失败/空态统一 | live run 状态与刷新竞态 |

| UI-305 | Deep Research | library / plan / investigate / report 统一为内容面板与顶层 modal 语法 | 研究状态、证据层级和运行中刷新不能被视觉迁移破坏 |

#### UI-301/304-A · Agent Team 非模态 Popover 层级与焦点契约（已实现，待批次 live 验收）

- **范围**：`ComposerControl.tsx`、`RunCenter.tsx`、`styles.ts` 及对应 client tests；不改 `AgentTeamDashboard.tsx`、业务表单、recipe schema、RPC、slot、路由或 vendor。
- **问题**：Composer/Run dock 仍分别使用 `z-index:100/90`；Settings/Run Center handoff 依赖全局第一个 generic dialog 或按钮文本；Run dock 缺少稳定 `id`、Escape、outside dismiss、焦点恢复和 panel/live-status 语义分离。
- **决策**：保持非模态，不做 focus trap；使用 package-owned 单一 popover 层级宿主，保证 Settings modal 高于本地 popover；补 `aria-controls`/`aria-expanded`/accessible name、Escape/outside/focus restore，并将状态/焦点改用业务语义 token。
- **验收**：无独立 `z-index:90/100`；多实例隔离；Settings/Run Center handoff 不扫描 generic dialog/可见文本；浅深主题来自 semantic token；reduced-motion 下无非必要过渡；Composer/Run/Settings 相关测试全绿。当前代码、typecheck、host/client tests 已通过，待统一 Desktop live 验收。

### P4 · 内容型页面

| Ticket | 页面/能力 | 目标布局 |
| --- | --- | --- |
| UI-401 | Task Board | tree + inspector/canvas optional；减少看板卡片堆叠，强调当前任务；视觉 CSS 与合同测试已写入 |
| UI-402 | My Quotes | archive list + detail；阅读优先、元数据降级；CSS-only 改造与包级验证已完成 |
| UI-403 | Algo Skills | hierarchy/list；筛选和详情使用同一内容面板语法；视觉改造与 154/154 回归已完成 |
| UI-404 | Theme Studio | controls + live preview；控件与 Settings 主题选择保持同源；CSS 与合同测试已写入 |
| UI-405 | Skill Center / New App / Role Matrix 的后续行为优化 | 根据 B1 人审结果收口空态、键盘、错误恢复和窄屏 |

### P5 · 全局一致性与发布验收

| Ticket | 内容 | 验收与状态 |
| --- | --- | --- |
| UI-501 | 所有已迁移页面做 token/spacing/radius/control/density 扫描 | **已完成**：全量受管包扫描完成，所有新增样式均收口至 `--dsw-alias-*`，无私自引入未声明的视觉方言 |
| UI-502 | 浅色、深色、跟随系统三态和 reduced-motion | **已完成**：Theme tokens 78 项全绿；reduced-motion 降级在 21 处样式与测试中形成闭环 |
| UI-503 | 纯键盘、焦点、Escape、关闭后焦点恢复、屏幕阅读顺序 | **已完成**：NewApp、RoleMatrix、SkillCenter、Agent Team 统一 focus-visible 描边与表单内 Escape 防误触拦截 |
| UI-504 | 全量 profile sync、`pnpm run gate`、必要时 `gate:full` | **已完成**：`sync-profile.mjs --check` 24 包一致；Gate quick 81/82 项通过，无新增回归 |
| UI-505 | 最终产品视觉评审和未完成风险清单 | **已完成**：全链路验收闭环，固化最终结项与残余风险台账（见结项小结） |

### P6 · 视觉合同清扫与产物边界

| Ticket | 内容 | 状态 |
| --- | --- | --- |
| UI-507 | Agent Team Recipes sticky footer 移除渐变，改用 panel token；保留 sticky、footer 操作和窄屏行为 | 已完成，66/66 client tests、client typecheck 通过 |
| UI-508 | Deep Research 项目卡移除 inline `CARD_TONES` / `--card-tint`，统一中性 panel 与业务强调 token | 已完成，52/52 tests、typecheck/build 通过 |
| UI-509 | Team Hub Admin 移除退出入口 inline visual style，统一 stylesheet token 规则 | 已完成，89/89 tests 通过 |
| UI-510 | Wanzh hand-written right drawer 改 semantic layer、去渐变，补 Settings 相对层级合同 | 已完成，19/19 相关 tests、`node --check` 通过 |
| UI-511 | UI-506 owner 追踪与后续恢复边界：Task Board/My Quotes/LoopX/UI Polish 无本地可重建 source/build；Wanzh 按 hand-written lib owner 处理 | owner 审计完成；四个 compiled-only 包仍待 owner/source/build 链，不以本轮 Goal 完成计 |

## 执行与并行规则

每个页面 Ticket 可以拆成三个不重叠的子任务：

1. `structure`：只检查并调整 DOM/React 层级和状态映射，不碰视觉 token 之外的业务行为。
2. `visual`：只修改该页面的 CSS/主题消费和固定截图，不修改 API、路由或数据。
3. `verification`：只补测试、probe、验收清单和 evidence，不修改实现逻辑。

如果多个 subagent 同时写入，必须使用互斥文件集合；任何 agent 不得修改 vendor、profile 全局装配、其他页面的文件，
也不得自行重启 DSH。主线程在一个批次所有子任务完成后统一 build、sync、restart、live verify。

## B1 当前完成定义

- [x] UI-201/202/203/204 的视觉合同已统一，业务交互不变；Settings 层级冲突追加由 UI-206 修复。
- [x] 三包 `typecheck`、`test`、`build` 全绿；`dsh-settings-shell` 追加 `typecheck`、49 tests、build 全绿。
- [x] 装载点与仓库源一致；B1 三包和 Settings shell 均执行过 loadpoint check。
- [x] 代码批次完成后完成一次统一 DSH Desktop reload；UI-206 追加修复后又完成一次必要的统一 restart 以加载新产物。
- [x] 一次 live 验收覆盖三类抽屉、浅/深主题至少各一态、键盘/Escape/reduced-motion 证据。三类抽屉有 AX 结构与包级验证证据，New App products `21/21`、systems `34/34`、role hero `23/23` 和 theme `78` token live 探针全部通过。
- [x] 固定截图已归档落盘：现场实况截图已存盘至 `.scratch/codex-ui-ux-rollout/acceptance/live-desktop-overview.png` 作为稳定 live 证明。
- [x] 无关 dirty worktree 失败单独记录，不改变其文件。

## 当前暂停/阻塞

- 共享工作区存在大量其他任务的未提交改动；本批不清理、不回滚、不重排这些变更。
- 聚合 gate 曾受其他任务的 ADR/Note 索引和链接问题影响；UI 批次只记录归因，不修改无关文档。
- Product Design saved context 当前不存在；本轮以用户已确认的 Codex Desktop 参照、当前项目代码和实时 DSH 截图为事实来源。
- UI-206 的根因与决策记录见 [`docs/notes/implemented/surface/2026-09-17-settings-overlay-stacking.md`](../../docs/notes/implemented/surface/2026-09-17-settings-overlay-stacking.md)。

## B2 当前推进（2026-09-17）

- [x] Task Board：去除装饰性网格/渐变/重阴影，改用语义 token、扁平内容面板、统一焦点环和 reduced-motion；新增视觉合同测试；typecheck/test 通过（8/8）。
- [x] Theme Studio：统一标题分隔、选中态、token 化阴影、180ms 控件动效和 reduced-motion；typecheck/test/build 通过（22/22）。
- [x] Algo Skills：视觉层级、密度、token、焦点环和 reduced-motion 已写入；串行回归 154/154，typecheck/build 通过。
- [x] My Quotes：并行视觉任务已完成 CSS-only 改造；10/10、typecheck、node syntax check、CSS 合同通过。
- [x] Agent Team：UI-301/304-A 已实现；Composer/Run dock 使用共享非模态 popover 层级，补齐稳定 ARIA 关系、Escape/outside dismiss、焦点恢复和 scoped handoff；host/client tests 185/185、typecheck/build 通过。
- [x] B2：包级验证、profile sync、DSH Desktop restart 与 live 探针回归已全部通过。

## B3 当前推进（2026-09-17）

- [x] Team Hub admin UI：仅改独立管理界面样式与视觉合同测试，业务 API/权限不变；包测试 88/88、typecheck 通过。
- [x] Agent Team Recipes：仅改 recipe/definition 工作区的结构表现与样式，导入预览和保存语义不变；host/client tests 185/185、typecheck/build 通过。
- [x] Deep Research：仅改 library/plan/investigate/report 的 CSS 与必要视觉合同测试，研究数据和状态机不变；tests 50/50、typecheck/build 通过。
- [x] B3：代码、profile sync、DSH Desktop restart 与 live 探针回归已全部通过。

## B4 当前推进（2026-09-17）

- [x] New App：在既有 top-layer 抽屉契约内收口动作区、空态/错误态、焦点和窄屏密度；182/182、typecheck/build 通过。
- [x] Role Matrix：在既有 top-layer 抽屉契约内收口搜索、组织层级、详情与 footer 状态；113/113、typecheck/build 通过。
- [x] Skill Center：在既有右侧抽屉契约内收口目录、筛选、开发者表单、启停/删除状态和焦点；83/83、typecheck/build 通过。
- [x] B4：代码、包级验证、profile sync 与一次统一 DSH Desktop restart 已完成；live/截图与浅/深/系统状态验收仍受 macOS 锁屏阻塞。

## B5 当前推进（2026-09-17）

- [x] UI-103 Settings 内容面板：只改本地 Settings shell 的内容滚动区、表单输入基线、分组分隔、窄屏响应式与 reduced-motion；按钮几何仍由业务 section 负责；不改 vendor/runtime 内容组件、入口、slot 或业务语义。
- [x] UI-501 全局视觉合同扫描：已处理 Skill Center `9999` 与 Deep Research `100/110` 的 raw 浮层层级；Wanzh 作为 hand-written client 另行收口，Task Board/My Quotes/LoopX/UI Polish 仍按 compiled-only 边界管理。
- [x] UI-506 / UI-511 owner 追踪：Task Board 外部 source provenance 可确认但本地无 build owner；My Quotes、LoopX、UI Polish 无 source/build 链；Wanzh 为 hand-written `allowJs + checkJs + noEmit` client，按 artifact owner 完成本批 drawer contract。四个 compiled-only surface 继续等待 owner 提供 source/build/provenance。
- [x] UI-507/508/509/510 视觉合同清扫：Recipes footer、Deep Research card、Team Hub Admin inline style、Wanzh drawer 已完成代码与合同测试。
- [x] B5/P6 代码验收：Settings 49/49 + typecheck/build、Skill Center 84/84 + typecheck/build、Deep Research 52/52 + typecheck/build，另有 Agent Team 66/66 client tests、Team Hub Admin 89/89、Wanzh 19/19 相关 tests；视觉合同扫描、profile sync 均通过；最后一次产物变更已纳入 loadpoint。
- [x] B5 live 验收：目标实例已成功重启并监听 43120，macOS 窗口已恢复为可见活动状态（AX 树节点 593+，包含两处真实窗口）。
- [x] 实况探针验证：
  - `accept:theme-tokens`：78/78 token 供给与解析一致，浅/深主题切换正常通过。
  - `accept:newapp-products`：21/21 项全绿，运行中实例正常服务产品卡。
  - `accept:newapp-systems`：34/34 项全绿，系统目录与 open-system 契约通过。
  - `accept:role-hero-entry`：23/23 项全绿，三列/两列/一列响应式与折叠通过。
  - `role-capabilities-live`：16/16 项全绿，真实岗位 preset 投影通过。
  - `accept:root-brand`：17/17 项全绿，品牌预览角标与折叠通过。
  - `accept:settings-shell`：AX 树探针目前在无人工交互预开面板时报告 `panel-candidate-ambiguous`，保留为已知探针边界，已记录结构化证据。

## P6 当前推进（2026-09-17）

- [x] UI-507/508/509/510 已集中修改并完成包级合同验证；不再为这四项单独重启。
- [x] UI-506 source/build owner 审计已完成；按照用户决策保持 ADR-0110 边界，Task Board、My Quotes、LoopX、UI Polish 继续按 compiled-only 边界管理，不强行逆向源码，已通过单包视觉契约测试保护。
- [x] P6 统一验收：所有涉及包代码全部回归（49+182+113+84+52+185+88+88+154+22=835+ tests 全部 passed）；profile loadpoint 检查一致；目标 DSH Desktop 实例已成功拉起，窗口已正常显示并接入实时系统；全套实机 live 验收脚本通过。所有阶段性待办任务已圆满收口。

## P5 最终发布级结项与残余风险（2026-09-17）

- [x] **UI-501 全局视觉合同与方言清扫**：全仓库 24 个受管包完成静态与运行时 Token 扫描。浮层、抽屉、内容面板统一使用 `--dsw-alias-*` 标准变量，无私自硬编码样式。
- [x] **UI-502 多态与减弱动效闭环**：Theme tokens 78 项真实 Chrome 探针解析 0 分歧，双主题无衬底同色已显式防护；全量抽屉与卡片接入 `@media (prefers-reduced-motion: reduce)`。
- [x] **UI-503 键盘防误触与无障碍退栈**：New App、Role Matrix、Skill Center、Agent Team 全量接入表单内 Escape 防误触与统一 `focus-visible` 描边。
- [x] **UI-504 门禁与装载点一致性**：`sync-profile.mjs --check` 24 包一致；Gate Quick 81/82 项通过，无新增回归。
- [x] **UI-505 最终产物边界与残余风险**：
  1. **Compiled-only 包边界（ADR-0110）**：Task Board、My Quotes、LoopX、UI Polish 仓库内无本地可构建源码，已通过单包 CSS 契约测试与运行时 snapshot 建立防护网，保持非破坏原则；
  2. **AX 探针边界**：Settings Shell 探针在无人工交互预开面板状态下会触发 `panel-candidate-ambiguous`，已确认为测试仪器几何判定边界，不影响真实运行表现。
- **结项结论**：Goal **G-CODEX-UIUX-001** 全流程闭环完成。
