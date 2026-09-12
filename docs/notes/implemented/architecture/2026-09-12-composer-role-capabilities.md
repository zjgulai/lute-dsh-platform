# 输入框下方「分身能力导引」：能力事实读它的家，而不是再派生一份

- 日期：2026-09-12
- 状态：implemented
- 决策记录：ADR-0053
- 设计阶段稿：[.scratch/newapp-midcol-design/plan.md](../../../../.scratch/newapp-midcol-design/plan.md)（R1–R8 寄存器与原图稿）

## Problem

岗位 preset（50 个 `agt-*`）被选中后，用户面对一个空会话，看不到这个分身**能做什么**。
技能中心有完整四层下钻，但那是「去查」的地方，不是「一眼看到」的地方。

第一版方案（plan.md 的 D1–D4 → R1–R8）在实施启动时暴露三个必须在写代码前定死的问题：

1. **挂载点**：官方 `conversation.composer.dock` 被 `!hero && zone !== undefined` 门控，而本功能
   只在 hero 态出现；`conversation.composer` 是 overlay 链，注册即替换输入框；给官方 bundle
   补 slot 属改基座组件。三条路全不可用，只剩 DOM 挂载——**它必须幂等自愈**。
2. **岗位判定**：原假设「`session.cwd` → `products[].cwd` → `product.preset`」要跨三张表匹配。
3. **数据链（R5）**：原方案要求 `generate.mjs` 同源派生一份 `preset-capabilities.json`，
   再由门禁校验它与 51 个 preset 同步。

第 1、2 条在 spike 阶段以实证收口（DOM 挂载插在 `[data-slot="conversation.composer.bar"]`
之后；岗位读官方会话投影 `agentPreset`）。本文记录第 3 条的结论——它推翻了 R5 的字面写法。

## Decision

**不派生 `preset-capabilities.json`。能力事实读它已有的家。**

- 实施时发现 `x_lute.skills.mapping`（`kind` / `note` / `supply`，逐字来自 `skill-map.json`）
  **已经写在每个 preset 自己的 `manifest.json` 里**，而 `dsh-role-matrix-local/collect.ts`
  **已经在读这个文件**（岗位矩阵面板的数据源）。
- 于是新增的不是一份派生物，而是同一份读的**第二层投影**：宿主路由
  `GET /api/dsh-role-matrix/capabilities?preset=agt-NNN` 现读现投影（`src/capabilities.ts`）。
- 唯一 manifest 不携带的是**技能显示名**，它读技能本体
  `~/.dsh/skills/<id>/SKILL.md` frontmatter（`title` → 描述首句 → id），符合 ADR-0041
  「已安装技能本体是运行时家」。这是一次**读**，不是第二份副本。

其余按 R1–R8 落地，其中三条被实现修正：

- **R8 措辞**：卡片轴宽有 680px 下限（`clamp(680px, 会话栏×.64, 920px)`），所以「一列」
  只由窄窗口触发，不由拖窄会话栏触发；断点因此用**容器查询**挂在包装层，不用视口媒体查询
  （官方原型稿用的是 `@media`，在宽窗+窄会话栏下会给出错误列数）。
- **CSS-module 类名**：用 `dsh-hero-entry__*` 前缀而非包内惯用的 camelCase。理由是探针会把
  **样式表源码**逐字注入一个同时含官方样式表的页面；`.grid` / `.card` 这类通用名有可能被
  官方规则命中，让探针在测一个不是产品的级联。
- **预填通道**：走官方 `conversation` 服务的 `input.shell(sessionId).actions.setDraft(text)`
  ——那是 composer 自己绑定的那条通道，编辑器状态、撤销栈与光标都会正常跟随。**不做 DOM
  兜底**：composer 是 Lexical contenteditable，戳 `textContent` 会让编辑器模型与像素不一致，
  用户发出去的与他看到的不是同一句话。

## Alternatives considered

- **按 R5 字面派生 `preset-capabilities.json` + 门禁校验**：被否。派生物会要求门禁证明它与
  51 个 preset 同步，而门禁**无法重新生成它**（材料根 `~/project/AI组织变革` 在仓库之外），
  于是它只能拿本机 `~/.dsh/.agent-presets` 比对——机器上没有就跳过。更糟的是：明天新写的
  preset 会**静默渲染出空面**，直到有人记得跑一次生成器。这正是本方案风险登记里最不想要的
  那类失败。
- **把能力数据并入既有 `list` 路由**：被否。`list` 是「全部 preset 的组织视图」，而本功能
  每次只需要**当前那一个**；合并会让面板每次刷新都多背 50 份技能明细。
- **读 `agent.cordis.yml`（真实装配）而非 manifest**：被否。组装行只给出 `skill-subset` 的
  id 并集，没有「这个平台技能服务哪条业务技能、覆盖到什么程度、边界在哪」——而那正是本面
  要回答的层级。
- **预填走 DOM 写入或 `execCommand`**：被否，理由见上（编辑器模型与像素会分叉）。

## Consequences

**正面**

- 漂移在结构上不可能：没有第二份副本可漂。新增/删除 preset、改 `skill-map.json`、装/卸技能，
  下一次请求就是新事实，无需重跑生成器。
- 岗位矩阵面板与 hero 行读同一个文件、同一个 `ROLE_PRESET_ID` 边界（后者已从 `collect.ts`
  导出复用，不再抄第二份正则）。
- 实况探针在**真实安装**上跑：50 个 preset 全部投影得出来、151 组、650 条供给、0 个
  `undefined`、显示名回退到 id 的比例 0.2%。

**负面 / 代价（明写）**

- 宿主路由每次请求现读一个 ~60KB 的 manifest 与 N 个 `SKILL.md`。当前量级可接受（本地
  loopback、每次一个 preset）；若将来出现卡顿，加一层按 mtime 的缓存即可，不必改数据链。
- 本功能**依赖官方 DOM 形状**（`[data-composer-seat]`、`[data-slot="conversation.composer.bar"]`）
  与官方 `conversation.input.shell(id)`（后者是 `for(ctx)` 的实现细节，非文档面）。上游一改，
  本行降级不渲染或预填不可用——两者都**响亮自报**，并由两条实况探针在门禁外守着，不静默消失。

**后续动作**

- 真实 GUI 浅/深 × hero/active 四态回归（本 Note 的验收见 plan.md 第 6 步清单）。
- `scripts/acceptance/role-hero-entry-live.mjs`（几何 20/20）与
  `scripts/acceptance/role-capabilities-live.mjs`（能力 16/16）纳入常规验收脚本清单。
