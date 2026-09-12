# 输入框下方 · 分身能力导引（定稿 v2）· 2026-09-12

- 家（设计阶段）：`.scratch/newapp-midcol-design/`——图稿 `prototype.html`（v2）、本方案 `plan.md`。
- 状态：**R1–R8 已实施完成**（2026-09-12）。同日第二轮按用户验收意见收口两条：R1 的**交付判定**（仓库改完 ≠ 生效，判据改为装载点字节）与 R3 的**默认值**（改为默认收起）。见下「实施修正」与 [ADR-0054](../../docs/adr/ADR-0054.md) / [Note](../../docs/notes/implemented/architecture/2026-09-12-loadpoint-bytes-drift.md)。决策记录 [Note](../../docs/notes/implemented/architecture/2026-09-12-composer-role-capabilities.md)、[ADR-0053](../../docs/adr/ADR-0053.md) 已挂。R5 的**字面写法被推翻**（见下节「实施修正」）；其余按 R1–R8 落地。
- v1 的 D1–D4 中，D1（meta 为家）/D2（预填）/D3（注入行）/D4（官方色）在本轮继续有效，被 R5/R6/R7 继承或收编；本轮新增 R1/R2 扩张了范围（移除上方两胶囊、只做下方）。

## 实施修正（2026-09-12，均带实证）

| # | 原定 | 实施结论 | 依据 |
| --- | --- | --- | --- |
| R5 | `generate.mjs` 派生 `preset-capabilities.json` + 门禁校验同步 | **不派生**：`x_lute.skills.mapping` 已在每个 preset 的 `manifest.json` 里，且 `role-matrix` 的 `collect.ts` 已在读它。改为宿主路由 `GET /api/dsh-role-matrix/capabilities?preset=agt-NNN` **现读现投影** | 门禁无法重新生成派生物（材料根在仓库外）→ 新 preset 会静默渲染空面。详见 ADR-0053 |
| R8 | 视口媒体查询断点（原型稿 `@media`） | **容器查询**挂在包装层（`.dsh-hero-entry` 是容器，`__grid` 被查询） | 实测：卡片轴宽有 680px 下限，宽窗+窄会话栏下视口断点给出错误列数；容器查询只对**后代**生效，写在同元素上是空转 |
| R8 措辞 | 「992px 宽下 3 列」 | 精确化为：轴宽 984px→3 列、896px→2 列、560px→1 列；**「一列」只由窄窗口触发，不由拖窄会话栏触发** | 探针实测矩阵 |
| — | （未定）CSS 类名风格 | 用 `dsh-hero-entry__*` 前缀，不用包内惯用 camelCase | 探针把样式表**源码**逐字注入含官方样式表的页面；`.grid`/`.card` 这类通用名可能被官方规则命中，让探针测的不是产品的级联 |
| R7 | 「复用 D2 预填通道」（未细化） | 走官方 `conversation` 服务的 `input.shell(sessionId).actions.setDraft(text)`——composer 自己绑定的那条通道。**不做 DOM 兜底** | composer 是 Lexical contenteditable；戳 `textContent` 会让编辑器模型与像素分叉 |
| R1 交付判定 | 「仓库改完」＝已交付 | **不等于生效**：判据是**装载点字节**（`~/.dsh/profiles/desktop/node_modules/<包>/lib/client.js`）。仓库里两胶囊确已删除、该包测试全绿，但装载点仍是旧 bundle——`file:` 依赖的硬链接被编辑工具 tmp+mv 打断，而当时的门禁只断言「文件在不在」→ 全绿而功能没生效。已新增门禁 `profile-bundle-sync` 与 `sync-profile.mjs --apply --loadpoint`（ADR-0054） | 三份副本逐一字节比对：仓库 52,671B / 装载点 66,796B / vendor 40,533B |
| R3 默认值 | 横向列**默认全开** | **改为默认收起**：列体折叠、列头保留（名称＋等级徽标＋供给数），点列头展开。与用户此前对卡片墙的「默认收起」同一形状 | 用户验收意见「目前是展开状态，特别长」；真 Chrome 实测行高 200.5px → 50.0px，三列仍在 |


## 决策寄存器（R1–R8；R1–R7 于 2026-09-12 第二轮拍板，R8 于第三轮追加）

| # | 决策 | 结论 |
| --- | --- | --- |
| R1 | 输入框上方两胶囊 | **移除**（`dsh-overseas-skills` 客户端 `OverseasPaletteStack`：①`出海技能`（/list，四层下钻）②`AI全栈技能`（/fullstack-list，分组视图））。移除＝改注入位不卸载插件；技能中心保留两页完整层级 |
| R2 | 新增面位置 | **只在输入框下方新增**；布局沿用已认可图稿（内容列 960px / 卡 992px 同宽轴）；hero 上方除移除外不再新增任何面 |
| R3 | 展示形态 | 组头＋展开式；**横向列同显、默认收起**（2026-09-12 二次修订：用户验收意见「目前是展开状态，特别长」推翻了原「默认全开」。收起粒度＝**列体**，列头仍在——三列组头并排仍回答「这个岗位有哪些能力」，变短的只有列体；场景手册是一条 chip 行，不折）；身份一行：平面 · 责任域 · 岗位名（副题）；四层下钻留给技能中心 |
| R4 | 诚实边界 | direct/partial/gap **如实上屏**＋边界说明（skill-map `note` 逐字）；gap 显空态说明，**不放假卡**；同一供给服务多个业务技能时如实重复出现 |
| R5 | 数据链 | `generate.mjs` **同源派生** preset→capability map（role-catalog + skill-map 单一事实）；门禁校验派生物与 51 个 preset 同步 |
| R6 | 覆盖范围 | **按岗位渲染（2026-09-12 拍板，取代原「仅产品卡会话」）**：会话的 `agentPreset` 是 50 个 `agt-*` 之一就渲染；`lute-cordis`（普通模式）不是岗位故普通新会话自动不出现——**无需任何特例**。无 preset 不渲染；phase→active（首条消息发出）自然消失。判定读官方会话投影 `agentPreset`（spike②），不做 cwd→products 匹配 |
| R7 | 交互与色 | 供给卡点击＝**预填 prompt**（复用已拍板 D2 通道）；gap 卡只说明不预填；场景手册单独一组不混技能组；颜色维持官方强调色（继承 D4） |
| R8 | 下方区布局 | **不排垂直一列，至少 2–3 个横向列**：992px 宽下 3 列（列宽≈324px）→ ≤900px 降 2 列 → ≤620px 降 1 列；列＝一个业务技能组（列头含名称/徽标/计数，列体含边界说明＋供给卡纵排）；列高可不等（`align-items:start`）；场景手册在列下方横排 |

## Spike 结论（实施第 0 步；真证据已收口，2026-09-12）

**spike 目录已拆除**（2026-09-12 实施收口）：三件套各自有了产品的家——`mount-core.ts` → `shared/client/hero-entry-core.ts`，`hero-entry.css` → `packages/surfaces/dsh-role-matrix-local/src/client/hero-entry.module.css`，`probe.mjs` → `scripts/acceptance/role-hero-entry-live.mjs`（且**改指产品文件**，不再读 spike 副本）。留着就是同一事实的第二个家（ADR-0009）。
历史证据（在本目录删除前取得，现在由升格后的探针逐条复现）：真 Chrome、官方样式表**运行时**从实时安装包提取、转译并调用真核心 → **20/20**，两次变异测试均变红（证明断言非空转）。

**① 挂载契约：DOM 挂载，插在 `[data-slot="conversation.composer.bar"]` 之后。**
官方三条路全部结构性不可用——`conversation.composer.dock`（输入框 footer）被 `!hero && zone!==undefined` 门控，而本功能只在 hero 态出现；`conversation.composer` 是 overlay 链，`renderChainResult` 会把握选的 fallback（官方输入框）设成 `display:none`，注册等于替换输入框；给官方 bundle 补 slot 属改基座组件，被负面清单排除。
插为输入框出口的**紧邻后继兄弟**＝做官方 `composerStack`（flex column；hero 态带 `.composerHero`）的末子节点，因此自动继承卡片宽度轴、间距与底部留白。实测：下方 12px、与输入框同父、**同宽 984px**、三列各 320px。
锚只用官方 `data-composer-seat` / `data-slot=…`，**零 CSS-module 哈希**——探针 NC2 当场证明同一模块前缀归档副本是 `_4RFuWq_`、实时安装包已是 `uPhUma_`。

**② 岗位判定：读官方会话投影 `agentPreset`，不做 cwd 匹配。**
原假设「session.cwd → products[].cwd → product.preset」被官方能力取代：`SessionProjectionMap.agentPreset: string | null` 是一等会话投影（宿主侧即 `presetForSession(session)` = `sessionProjections.stateOf(session,'agentPreset')`），且经 `SessionSummary.projections.values` 对客户端可见。少一层匹配、少一处会漂的第二事实源。

**③ 两个当场抓到的真缺陷**（都是 jsdom 断言发现不了的那类，已修且各有断言守住）：
- **属性撞名**：诊断键 `dataset.dshHeroEntry` 落到 DOM 正是 `data-dsh-hero-entry`，与行标记同名 → `querySelector(ROW_ATTR)` 先命中挂着诊断属性的 `<html>`，「复位」变成把整个文档往 seat 里塞。行标记已改名 `data-dsh-hero-entry-row`。
- **重复挂载**：只在 `:scope >` 里认领既有行，React 把行挪出父栈后会找不到而**再插一行**。已改为按标记属性全局认领。

**④ 影响 R8 措辞的实测结论**：卡片轴宽的 content 有 **680px 下限**（`clamp(680, 会话栏×.64, 920)`），轴宽因此最低停在 744px——**「一列」不会由会话栏拖窄触发，只有窗口本身窄到 744px 以下**（轴被 `min(…,100%)` 压住）才会出现。实测矩阵：984px→3 列、896px→2 列、560px→1 列。

## 内容模型（被现有数据推出，非新增事实）

五层血统：组织平面(4) ⊃ 责任域(8) ⊃ 岗位(50) ⊃ 业务技能(151，每岗恰 3) ⊃ 平台技能供给（direct/partial/gap 三档）。
preset 选定后前两层退化为身份一行；展示主体＝业务技能组（层 1）→ 供给卡（层 2）＋场景手册组。

- 布局（R8）＝横向列：992px 下 3 列并排（≈324px／列），窄窗 2 列 → 1 列降级；列内供给卡纵排、列高可不等；场景手册在三列之下横排。
- 组＝preset 的 3 个业务技能名；组头徽标与边界说明＝skill-map 同名条目（kind + note 逐字）。
- 供给卡显示名＝技能本体 SKILL.md frontmatter `title`（ADR-0041：已安装技能本体是运行时家）；无 frontmatter title 时 fallback 技能 id（实测 pb-001/004/007 均无 title，其显示名取技能注册描述：PB-001 存量GMV联合经营 / PB-004 市场进入与合规上架 / PB-007 重大质量与账号事件）。
- 实例（agt-027 守店，真实接线）：账号诊断(partial·4 供给)、规则监测(partial·5)、申诉材料准备(partial·4)，手册 pb-001/004/007；供给卡名全部来自 frontmatter 实测。

## 实施清单（R1–R6 已完成；第 7 项留待重启后人工回归）

0. **Spike · ✅ 已完成**：① 挂载点＝DOM 挂载于 `[data-slot="conversation.composer.bar"]` 之后；② preset 判定改用官方 `agentPreset` 投影。证据：`scripts/acceptance/role-hero-entry-live.mjs`（原 spike 探针，已升格并**指向产品文件**）→ **20/20**。
1. **R1 移除 · ✅ 已完成**：hero 态不再出现 `[data-plugin="dsh-overseas-skills"]` 双卡（契约测试先 Red → Green）；技能中心两页与 overseas 完整层级不动。验收：该包 32/32 + typecheck 0。**第二轮补充**：仓库侧全绿当时并未生效——装载点的 `lib/client.js` 仍是旧 bundle，已按 ADR-0054 同步并加门禁。
2. **R5 派生 · ✅ 已完成（改为现读现投影，见上节修正）**：`src/capabilities.ts` + 路由 `capabilities`；`ROLE_PRESET_ID` 从 `collect.ts` 导出复用。验收：单测 32 条（含变异测试 6 红）+ 实况探针 **16/16**（真实安装：50 preset / 151 组 / 650 供给 / 0 undefined）。
3. **宿主路由 · ✅ 已完成**：并入 `/api/dsh-role-matrix/*`（与 list/health 同族同栅栏），未并入 newapp —— 该插件已持有 preset manifest 这个事实。`?preset=` 查询参数，400/404/403/405 各有实况断言。
4. **hero-entry 渲染者 · ✅ 已完成**：挂载核心进 `shared/client/hero-entry-core.ts`（A5，sync-shared 20 消费方 0 漂移）；样式 `hero-entry.module.css`（容器查询 + 只用官方已定义 token）；组件 `hero-entry.tsx`；探针指向产品文件后 20/20。
5. **交互（R7）· ✅ 已完成**：`prefill.ts` 走官方 `setDraft` 通道，缺失时自报不静默；gap 组为空态说明、不放占位卡（`hero.gap.empty`）。验收：`tests/prefill.spec.ts` 8 条。
6. **总验收 · ⏳ 部分完成**：
   - ✅ `gate --mode quick` **15/15**；`gate --mode full` **19/19 退出码 0**（含 20 受管包 typecheck/test/build、shared-sync、theme-tokens）。
   - ✅ 该包 **109/109** 测试 · typecheck 0 · build 通过。含 `tests/client-boot.spec.ts`：用装载器桩**装载真实 `lib/client.js` 并跑 `apply(ctx)`**——`apply` 在壳启动期执行，抛错会带走整个 GUI，而此前没有任何测试执行过真正发布的那个字节（`contract.spec.ts` 只把 bundle 当文本读）。变异测试：把 bundle 里的行标记改名 → 该测试转红。
   - ✅ 几何断言（非目测）：984px→3 列 / 896px→2 列 / 560px→1 列，含反向对照 NC3；**第二轮新增** N1–N3 收起态几何（三列仍在、列体不在 DOM、行高 200.5px → 50.0px）→ 探针 **23/23**。
   - ✅ 默认收起有双向断言：`tests/hero-entry.spec.tsx` 断言默认态与开合；变异测试把默认改回全开 → **6 条转红**，还原后 109/109 绿。
   - ✅ **第二轮新增**：门禁 `profile-bundle-sync` 断言装载点字节；变异测试（把仓库旧 bundle 留在装载点）→ 该项转红并给出修复命令。
   - ✅ 全树无新增硬色值（`theme-tokens` 项通过）。
   - ⏳ **未运行**：真实 GUI 浅/深 × hero/active 四态目视回归——需要重启 DSH Desktop 让装载点字节生效，本会话未重启（本会话就跑在这个进程上）。


## 有意不做（负面清单）

- 不卸载 `dsh-overseas-skills` 插件；不动技能中心的完整层级页。
- hero 上方除移除两胶囊外，不新增任何面（R2）。
- 无 preset 会话不渲染（R6）；gap 不放假卡（R4）。
- 不改 EmptyHero/InputBar 等基座组件；不引入新的颜色 token（维持官方强调色）。

## 风险登记

- ~~**preset 判定链**是本方案最大的未验证点~~ → **已解决（spike②）**：改为读官方会话投影 `agentPreset`，不再做 cwd→products 匹配，风险随之消失。
- phase（hero→active）切换时注入行生命周期 → **已实测**（幂等守卫 M8/M9、清掉自愈 M10、挪错复位 M11、active 相位不掉位 M12）。
- 新增风险（spike 实测得出）：**挂载点是官方 DOM 形状，不是公开契约**。`[data-composer-seat]` 与 `[data-slot=…]` 是稳定语义锚（非哈希），但上游若改 slot key 或去掉 data 属性，本行会降级不渲染。缓解：缺锚响亮自报（NC1 已验：warn + `documentElement.dataset` 诊断属性），并把探针升格为门禁验收项——上游一变就红，而不是静默消失。
- 新增风险（spike 实测得出）：**诊断属性与行标记的属性名不得撞车**（撞了会让 `querySelector` 命中 `<html>`）。两者名字已拉开，并在核心注释里写明缘由。
- `preset-capabilities.json` 与 51 preset 漂移：门禁校验兜住（同 R5 判据）。
- PB 类技能 frontmatter 无 title：显示名走注册描述 fallback，实施时把 fallback 规则写死在契约测试里（防漂移）。
- 与右栏/浮层 z 序：top layer 先例已在面板系列验证过，落地复测。
