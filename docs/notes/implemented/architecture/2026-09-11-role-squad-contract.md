# Agent Note: 岗位小队的编队契约与装配边界（ADR-0020）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0020](../../../adr/ADR-0020.md)。

## Problem

需求原话是「未来我会通过同时添加多个 Preset 的方式来组成小队办公」。这句话在 DSH 里落不下地，
而且**三处硬约束彼此独立**，每一处单独就足以否掉它：

1. **一个会话挂一个 preset。** preset 是会话级组合，`agentPresets.mount()` 只在 agent factory 的
   `setup(agentCtx)` 里被调用，即会话创建那一刻。会话跑过一轮之后 host 直接拒绝换 preset——
   因为该会话的历史是在原组合的 tools 与 prompt 段落下产生的。
2. **子 Agent 只能 bind，不能 mount。** `composeFrom(agentCtx, parentCtx)` 的原文注释是
   "This is how a child agent inherits its parent's capabilities. **It is a bind, not a mount**"，
   且会拒绝一个已经 join 过 preset 的 context。所以「给每个子 Agent 配一个岗位 preset」这条路
   在语义上被封死，不是配置问题。
3. **standing mount 按 preset id 单飞**，同一 preset 的多个会话共享同一个组合实例；
   组合本身是共享的，不是每会话一份。

材料侧却早就给出了答案。`ADR-0003`（D-020 已确认）写的是：

> 50 表示逻辑 AI 岗位分身与责任契约；每张紧耦合场景工单只运行一个 Case Agent、
> 绑定一个主岗位人格并按需加载 Skills，**不采用 LLM 多 Agent 路由或岗位 Agent 互聊**。

把两边一对照，"小队"的正确形态是**收敛的而不是妥协的**：小队不是"同时挂载多个 preset"，
而是"一个人格 + 一份技能并集"。`dsh-skill-subset` 本来就是吃 skills 数组的工具，
所以小队 = 一个 preset，其 `skill-subset` 是若干岗位技能集的并集。无需任何新机制。

但在把这句话写成契约之前，实测暴露了两个必须先修的问题：

- **`can_be_primary` 是硬编码的常量。** 首版生成器对所有 50 个岗位都写了 `true`，
  而材料的 `collaboration-graph.json` 里只有 **12 个**岗位的 `primary_eligible_flow_ids` 非空
  （AGT-001/008/016/018/021/023/024/025/027/034/037/047），另外 **38 个只能贡献**。
  一个读这份契约的编队生成器会据此选出一个永远当不了队长的岗位当队长——而且全程无声。
- **"小队 = 全流程贡献岗位的并集"这个天真做法有多大，没人量过。** 实测（下表）：
  单岗位 `skill-subset` 是 2–13 项、均值 7.6；而整条流程的贡献岗位并集是 **47–104 项**，
  FLOW-02 高达 **104 项**。这不是"大一点"，是把一份流程的全部技能目录塞进一个 preset scope。

| FLOW | 队长（selector 目标） | 候选贡献岗位 | 队长自身技能 | 并集 | 其中业务技能 | 手册 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| FLOW-01 | AGT-021 / 023 / 024 / 025 | 19 | 13 | 87 | 79 | PB-001 |
| FLOW-02 | AGT-008 | 26 | 8 | **104** | 96 | PB-002 |
| FLOW-03 | AGT-016 | 13 | 6 | 49 | 41 | PB-003 |
| FLOW-04 | AGT-024 | 20 | 10 | 89 | 81 | PB-004 |
| FLOW-05 | AGT-034 / 037 | 14 | 8 | 59 | 51 | PB-005 |
| FLOW-06 | AGT-047 | 12 | 6 | 47 | 39 | PB-006 |
| FLOW-07 | AGT-018 / 027 | 19 | 6 | 67 | 59 | PB-007 |
| FLOW-08 | AGT-001 | 17 | 9 | 60 | 52 | PB-008 |

（对照：50 个岗位全量并集 156 项，技能库 272 项。）

## Decision

1. **小队 = 一个 preset**：编排人格 + N 个岗位的技能并集 + 成员职责引用。
   不是多 preset 挂载，也不是岗位 Agent 互聊。
2. **契约落在 `manifest.json` 的 `x_lute.squad`。** 它是 LUTE 自有格式（`format: "dsh-preset"`），
   官方 `@deepseek-ai/dsh-agent-presets` 不读，因此扩展它不违反任何 schema；
   而 `preset.yml` 严格只保留官方三字段（`name`/`description`/`order`）。
3. **`can_be_primary` 必须由材料算出，不得是常量**：取
   `role_contributions[].primary_eligible_flow_ids` 是否非空。修正后实测 12 `true` / 38 `false`。
4. **新增 `lead_rules`**：逐条取自各流程的 `primary_role_selector.rules` 中 targets 为本岗位的规则，
   并带上 `selector_status` 与 `zero_or_multiple_match_disposition`，
   使每个岗位对"我什么时候能当队长"自足，不必回查流程记录。
5. **生成器的硬约束：零匹配或多匹配一律 WAIT，绝不 fallback 到贡献岗位当队长。**
   材料对全部 8 条流程定的都是 `WAIT`。其中 3 条流程的队长取决于业务范围条件：
   FLOW-01（`amazon_scope` / `direct_to_consumer_scope` / `other_marketplace_scope` /
   `retail_or_b2b_scope`）、FLOW-05（`lifecycle_or_retention_scope` / `single_service_case`）、
   FLOW-07（`quality_incident` / `account_incident`）。这些 predicate 尚未编译
   （`selector.status = requires_executable_predicates`），所以目前无法自动裁决。
6. **成员集合不自动推导。** 材料自己把 flow-scenario 绑定标注为未验证候选，
   且流级 `required_skill_contract_refs` 为空、`skill_contract_mapping_status = not_instantiated`。
   首版小队要么由人显式指定成员，要么等该契约实例化——不允许从 `collaboration-graph.json`
   的候选贡献者名单直接推出一份"自动编队"。
7. **技能并集必须有预算。** 47–104 项不可直接装配。成员数应按技能并集预算反向裁剪，
   而不是按"该流程的全部贡献岗位"。
8. **本轮只落契约与闸门**：不实现生成器、不改挂载机制、不碰 `agents` / `subagents` 宿主平面。

## Alternatives considered

**同时挂载多个 preset。** 被 DSH 语义否决（本 Note「Problem」第 1 条）：一个会话一个 preset，
且会话跑过一轮后 host 拒绝更换。

**子 Agent 各带一个岗位 preset。** 被 `composeFrom` 的 bind 语义否决（第 2 条）：
它是"继承父方那个已经组合好的实例"，不是"给子方挂一个新组合"，并且拒绝已 join 的 context。

**用 `dsh-agent-team-gui` 的 team 承载小队。** 被否决——它的 member 各自携带
model / role / fallback route / token limit / tool policy，是"多模型并行分工"模型。
把岗位塞进 member，等于重新引入材料 ADR-0003 明确取消的多 Agent 路由与岗位互聊；
而材料要的是"一个人格 + 按需 Skills"。两者形态相似、语义相反。

**小队 = 全流程贡献岗位的技能并集。** 被实测数字否决：47–104 项（见上表），
目录税过高，且与材料「按需 Skill 装配」的原则相悖（启动上下文只暴露名称与描述，但 104 条
名称本身已是显著开销）。

**在 preset 目录里再加一个 `squads/` 子目录登记小队。** 被否决——官方 roster 只扫一层
预设目录，子目录不进 roster；且会与 `manifest.json` 形成第二份事实源（ADR-0009）。

**把 `can_be_primary` 直接删掉、让生成器每次回查 `collaboration-graph.json`。**
被否决——那会让每个岗位 preset 无法自证编队资格，且把"谁是队长"这一判断散落到生成器里。
正确做法是留字段但**算准**它。

## Consequences

- **正面**：小队形态与材料架构同构，且不需要任何新运行时机制；`manifest.json` 成为可机器装配的
  单一事实源；L9 断言把"契约与材料漂移"从静默变成红灯；修正了一个会静默产出错误编队的 bug
  （`can_be_primary` 硬编码 50/50，实为 12/38）。
- **负面/代价**：
  - FLOW-01 / 05 / 07 三条流程的队长依赖未编译的 predicate，**目前无法自动编队**，只能 WAIT。
  - 成员集合仍依赖人工指定，或等材料补齐 `required_skill_contract_refs`。
  - 技能并集预算阈值尚未定，因此"小队最多几个成员"目前没有可执行的答案。
- **后续动作**（四条齐备后才实现生成器）：
  1. 编译 3 条流程的 selector predicate，使 `requires_executable_predicates` 变为可判定；
  2. 实例化流级 `required_skill_contract_refs`，让"该流程需要哪些 Skill 契约"有权威清单；
  3. 定技能并集预算阈值（实测区间 47–104，单岗位 2–13，起点建议 ≤40）；
  4. 在此之前，小队只能由人显式给出成员名单。

## Verification

- `manifest.x_lute.squad` 在 50 份 manifest 中字段齐备；
  `can_be_primary` 实测 **12 true / 38 false**，与材料的
  `role_contributions[].primary_eligible_flow_ids` 一致。
- `lead_rules` 共 **13 条**（5 条 `unconditional_default`、7 条条件规则、1 条 AGT-024 同时是
  FLOW-01 条件与 FLOW-04 默认），逐条与 `collaboration-graph.json` 的 selector 规则 deepEqual，
  且每条都带 `zero_or_multiple_match_disposition = "WAIT"`。
- `scripts/role-presets/verify-lossless.mjs` 新增 **L9 编队契约**层：逐份校验
  `can_be_primary` 由材料算出、`primary_flows` / `eligible_flows` / `lead_rules` 与材料一致、
  `lead_rules` 只指向本岗位参与的流程、且处置必须为 `WAIT`。
  实测 **3909 条断言全部通过**（L9 新增 226 条）。
- 本轮**没有**任何小队运行时代码：无小队 preset、未改挂载机制、未碰 `agents` / `subagents`。
