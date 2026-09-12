# Native Agent 产品形态：先给「产品」一个家，再让启动器去发现（ADR-0033）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0033](../../../adr/ADR-0033.md)。
> **状态：形态已定，实现未开始。** 本 Note 记的是决策依据与真机取证，不宣称任何功能已经跑通。

## Problem

用户的原话是「新应用里不要放岗位，只放已经通过 DSH 完成的 Agent 的产品矩阵卡片，点开可以直接在当前基座平台使用」。落到本机要先把三件事分清：

1. **卡片集合从哪来？** 抽屉今天能列的两类东西，逐个取证后都不是产品。
2. **产品长什么样？** 用户自己给了定义：功能模块组成工作流；`tools/` 按功能按钮与页面输入的组合提示词触发模型调用；结果自动填进 UI 模板；一个功能的产出是下一个功能的输入。这与本平台已有机制的关系必须说清，否则会造出第二套运行时。
3. **点开做什么？** 用户裁定「打开该产品的入口面板」，而入口面板在另一个插件里——**跨插件开面板的缝**此前在本仓库不存在。

## 取证：四个候选「事实之家」的真机读数

| 候选 | 读数（本机实测） | 能不能当判据 |
| --- | --- | --- |
| 官方 preset roster | 4 个官方（`cordis` / `minimal` / `ptc` / `standard`）+ 本机 51 个（`agt-001…050`、`lute-cordis`） | 那是**岗位**，正是用户不要的 |
| 会话使用证据 | 1027 个会话 → 9 个不同 `agentPreset`：`lute-cordis` 756、`cordis` 182、`standard` 23、`ai-product-developer` 17、`dsh-motion-deck-studio` 7、`overseas-finance` 5、`product-video-director` / `llm-wiki-fullstack` / `brand-marketing-growth` 各 1 | **不能用**：9 个里 6 个今天已不在本机 preset 目录，卡片会「点了打不开」；`kol-hunter` 也只在会话事件里出现过 |
| 岗位 manifest 的完成字段 | 50 个岗位：`lifecycleStatus` 全 `draft`、`productionAuthorized` 全 `false`、`gaps` 仅 1 个岗位非空 | **今天恒空**：字段是真字段，但语义是材料的「生产动作授权」，不是「DSH 已做完」 |
| 工作台容器 | 11 个：`paper_to_skills` / `member01` / `sikong` / `alice` / `KOL-Hunter` / `red-main` / `DTC-Agent` / `VOA` / `lark` / `workteam_info_kb` / `Magpie-Horch` | 那是**会话分组**，不是产品；且它只覆盖「有会话的目录」 |
| `/Users/lute/project/` 目录本身 | 24 个项目目录，无一份声明说明谁是产品、有哪些功能、入口在哪 | **产品没有家** —— 本 ADR 要建的正是这份事实 |

**结论：产品不是「找不到」，是「还没有」。** 所以本期不是「换个数据源渲染卡片」，而是先立声明契约。

## 取证：机制一侧全部有先例（所以缺的不是能力）

| 需求 | 已有先例 | 证据 |
| --- | --- | --- |
| 跨插件打开入口面板 | 基座自身以 `ctx.provide(...)` 提供客户端服务 | 从 shipped client bundle 提取到的服务名：`sessions` / `connection` / `locale` / `theme` / `layout` / `uiRenderer` / `modules` / `chatFileMentions` / `sessionLogDownload` / `cordisInspect` / `dynamicCordisRunner` |
| 面向会话开工 | `sessions.create({cwd\|workspaceId})` → `agentPresets.select({sessionId, agentPreset})` → `sessions.open(sessionId)` | `vendor/dsh-worktable/01_content/lib/client.js`（本机正在跑） |
| 工作流运行时 | 官方 `dsh-workflow` + `dsh-tool-workflow` + `dsh-client-ui-workflow-run` | 应用内官方包列表 |
| 技能装配 | `dsh-skill-subset` 在 preset scope 层重注册子集 | 本仓库 `packages/contract/dsh-skill-subset` |
| 逐插件栅栏 | 第一期给 worktable 的 8 条 HTTP + 1 条 WS 路由打栅栏 | ADR-0030 + `docs/notes/implemented/contract/2026-09-12-worktable-trust-fence.md` |

## 取证：用户举的例子只验到了形态

`audits.lute-tlz-dddd.top` 返回的就是 DSH web 壳本身：同一套 module loader、同一份官方插件预载清单，只在末尾多出一项 `auditscope-workbench/client.js`。**因此「产品 = 共享壳 + 一个自己的插件包」这个形态判断成立。** 但该 bundle 今天两条路径（单独与合包）都 404，读不到内部；该实例也未安装 `dsh-newapp-local`（`/api/dsh-newapp/health` 返回 `not found`）。**所以本 Note 不对该产品的功能/工作流/模板实现作任何评价**——没有证据。

## 取证：试点候选（用户在两种答案之间又补了两条约束）

用户补充的定位有两条直接改了形态，已并入 [ADR-0033](../../../adr/ADR-0033.md)：

1. **产品归属 50 个岗位之一**（岗位是垂直基座，产品挂在它下面）→ `preset` 字段由「跑在哪个 preset（可空）」改为「归属岗位（必填）」。
2. **产品技能要单独打包到对应产品中作为局部技能** → 技能从「平台技能库 + 前缀防撞名」改为**三层 + 产品局部**：L0 全局 / L1 岗位专属（preset 子集声明）/ L2 产品局部（`<产品>/skills/`，产品插件在自身 fiber scope 注册）。运行时注册这一环有现成证据：`ctx.skills.register(...)`（`packages/contract/dsh-skill-subset/lib/index.js` 正在用，且以同名遮蔽全局副本）与 `ctx.skills.registerProvider(...)`（`@deepseek-ai/dsh-skill-filesystem`）。

试点选定 `KOL-Hunter`（`/Users/lute/project/KOL-Hunter`）后的现状取证：

| 事实 | 读数 | 对本规格的意义 |
| --- | --- | --- |
| 形态 | Vite + React + TS + React Flow + Tailwind v4 + zustand，`kol-select-src/`（约 800 行） | 有真 UI 可挂，最轻的试点 |
| 成熟度 | 自称「阶段 A：浏览器可跑、全部 mock 数据、零后端」 | 恰好是 M1 要替换的那一层：把 **一个**功能的 mock 换成真链路 |
| 功能与工作流 | `功能总览.md` 已定义 **11 种节点**（① 选人条件 → ② 推荐名单 → ③ 深度分析 → ④ 内容/竞品 → ⑤ 趋势/洞察 → ⑥ 多维交叉 → ⑦ 维度切片 → 📋 简报 / ⚖️ 对比）与三种触发方式（新需求 / 选中追问 / 节点内按钮） | **等于功能与工作流的现成草稿**：`features[]` 与 `edges` 有真实来源，不用凭空设计 |
| 归属岗位 | 50 个岗位里唯一以达人为本职的是 `agt-033 结伴 · 达人与联盟合作`（业务运营 / 品牌与增长） | `preset` 字段的第一个真实取值 |

## Decision

见 [ADR-0033](../../../adr/ADR-0033.md)。要点：声明放产品自己目录（`product.json` 顶层恒 `{schemaVersion, products[]}`，`preset` = 归属岗位且必填）；技能三层、产品技能打包进产品并在产品 scope 注册；提示词骨架取技能正文 + 纯函数拼接 + 快照；模型只出结构化字段、模板确定性渲染；启动器只发现与开入口（延续 ADR-0028），逐级回退且显式说明；产品跑在本机同一实例，远程部署另立规格；抽屉合并为一个区块、未产品化显式标注。

形态规格的完整版本写在 [`.scratch/native-agent-product/spec.md`](../../../../.scratch/native-agent-product/spec.md)（含 `product.json` v1 字段、功能声明、运行缝表、四件审计证据、门禁判据与 M1–M4 分期）。

## Alternatives considered

| 方案 | 为什么不 |
| --- | --- |
| 集中一份产品登记表（启动器拥有一份清单） | 第二份事实，产品一改就漂移；与 ADR-0028「启动器只拥有连接，不拥有事实」直接冲突 |
| 点开 = 新建会话（工作台三连） | 要的是「进产品」不是「开聊天」；三连降为「声明了但包未安装」时的回退动作 |
| 用「会话跑过的 preset」当已完成判据 | 今天 9 个里 6 个已不在本机，卡片会骗人——与「点开必能用」直接矛盾 |
| 复用岗位 manifest 的 `lifecycleStatus` / `productionAuthorized` | 字段语义是材料的生产动作授权，今天恒为 draft/false；把它当「已完成」是偷换语义 |
| 提示词内联在 `product.json` | JSON 里塞长 Markdown 不可读不可复用；技能库已是这一层的家 |
| 模板由模型生成 | 模板失去「预置」含义，字段与版式随模型漂移且无法审计 |
| 产品代码收进本 monorepo | 产品是各自项目的事；本仓库只出规格、校验器、启动器 |

## Consequences

### 正面

- 卡片判据变成「产品目录里有没有声明」，**不取自人工登记**，因此不会骗人也不需要维护第二份事实。
- 提示词与模板第一次有可回放形态（快照 + 四件证据），「AI 可视化工作流」因此可审计。
- 新应用不需要预先知道有哪些产品；增删产品不动基座。

### 负面 / 未决

- **多了一次约定的写入**：每个产品要有人写 `product.json`；约定是否好写，要等 M1 用 KOL-Hunter 压一遍才知道。
- **技能三层是新语义，必须实测**：L2 产品局部技能「只在该产品挂载处可见」这一条要在真会话里验证（要证伪的是：它悄悄变成了全局可见，或与 L1 同名时遮蔽顺序反了）。
- **扫描根是新的安全面**：默认空 = 不扫；开启后必须与第一期同等对待（栅栏 + 允许根 + 负例探针）。
- **M1 试点已定**：`KOL-Hunter`，拟归岗位 `agt-033 结伴 · 达人与联盟合作`（落地前确认一次）。实现偏差应回写规格，而不是让规格与实现各说各话。
- **本期无任何功能实现**：M1–M4 的验收命令见规格 §9；本 Note 不宣称其中任何一条已通过。
