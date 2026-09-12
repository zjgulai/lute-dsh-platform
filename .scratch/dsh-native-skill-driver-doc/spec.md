---
title: 补写 DSH 原生 LoopX 设计文档（消除 README 死链）
status: ready-for-agent
test_seam: packages/capabilities/dsh-loopx-plugin/README.md 的相对链接 → 磁盘上的 docs/plans/2026-08-20-dsh-native-skill-driver.md
---

# 补写 DSH 原生 LoopX 设计文档 产品规格

> 本规格来自 2026-09-11 的 grill-me 决策（Q1=B、Q2=A、Q3=B 三项全部确认），
> 只综合已确认事实，不重新访谈。文档路径与文件名由 README 自身字面量决定（见 Implementation Decisions 第 1 条）。

## Problem Statement

`packages/capabilities/dsh-loopx-plugin/README.md` 第 35 行写着 GoalBar 协议与延迟原子性限制
「specified in the versioned [DSH native LoopX design](../../docs/plans/2026-08-20-dsh-native-skill-driver.md)」，
但该目标文件**不存在，且从未在 git 历史中存在过**：

- `docs/plans/` 目录不存在；`git log --all -- docs/plans` 为空 → 属「从未提交」，不是「被删」。
- 该引用是全仓唯一一处（全仓 grep 仅 1 命中）。
- 文档内容不可恢复：`_attic/dsh-loopx-plugin.tgz` 只含 `package/{lib,README,LICENSE,NOTICE}`，上游包内未带 docs。
- **第二个缺陷（TDD Red 阶段实测追加）**：该相对路径**本身就少一层**。README 自 `a813982` 起位于
  `packages/capabilities/dsh-loopx-plugin/`，`../../docs/plans/` 解析到 `packages/docs/plans/`；而 `docs/` 在仓库根，
  需 `../../../`。上游位置为浅一层的 `dsh-loopx-plugin/README.md`，`../../` 当时是对的——**包归位让层级失效**。
  即：即使补上文档，链接仍会指向错误目录。

后果有两层：读者被指向一个死链，两个**关键约束**（GoalBar 协议形状、延迟原子性限制）在仓库内没有可核对的来源；
而 2026-09-11 这次真实 goal 实测已经产出足以定案这三件事的一手事实，却没有落点。

## Solution

在 README 指向的**确切路径**写作 `docs/plans/2026-08-20-dsh-native-skill-driver.md`，只对两件 README 明确点名的事负责：

1. **GoalBar 协议**——版本常量、四个 endpoint、read/watch/start/pause 的请求/响应形状，以及「不精确的绑定不渲染」这条硬条件。
2. **延迟原子性限制**——动作结果的 `applied_with_warning` / `unknown` 分支，以及为什么「写成功但会话未同步」被表达为警告而不是静默成功或凭空回滚。

并按 Q2=A 写入本次实测得到的三条硬约束，使文档从「重述 README」变成「有实测依据的版本化设计」。
**不改 README 语义**：不删链接、不改措辞、不改路径——本次的修复目标是让既有链接成立，而不是改写它的说法。

## User Stories

1. 作为读者，我从 `dsh-loopx-plugin/README.md` 第 35 行点进链接，能打开一篇真实存在的设计文档，而不是 404。
2. 作为读者，我想在文档里读到 GoalBar 协议的确切形状（请求/响应版本字面量、四个 endpoint、四种 op），这样我不必反编译 `lib/` 下的打包产物。
3. 作为读者，我想在文档里读到「延迟原子性限制」到底限制了什么——哪些动作结果被容许为不确定、失败时对外表达成什么——这样我能判断插件会不会静默吞掉一次起停动作。
4. 作为维护者，我想让文档里的每条设计约束都能追溯到仓库内的真实字面量（`lib/types/**` 的声明、`packages/*/package.json` 的 `dsh` 块），这样文档不会与实现漂移。
5. 作为维护者，我想让「只有唯一一条活体绑定才渲染」这条硬条件写在文档里，因为它是 GoalBar 存在的全部前提，也是 2026-09-11 实测中被逐条验证过的部分。
6. 作为维护者，我想让 Driver 的两种 typed 激活证据（`skill-invocation` 的 `user/message`；`skill` 工具的成功 `tool/call`+`tool/result`）有书面来源，这样升级会话后「为什么 Driver 不启动」有可查的解释路径。
7. 作为维护者，我想让「环境遮蔽也会导致 Driver 不可激活」这类**反例**留在文档里（2026-09-11 实测：agent preset 的 `dsh-skill-subset` 把 `loopx` 技能标为不可调用，Driver 因此永不合格），这样后人不必重复踩坑。
8. 作为审查者，我想用一条命令证明 README 的链接可达，而不是靠肉眼看文档标题。
9. 作为下一个开发轮次的人，我想在规格里看到「门禁缺通用 Markdown 链接校验」这个已知缺口被明确记为不在本次范围，这样我不会误以为死链类问题已被系统性拦住。

## Implementation Decisions

1. **文档路径 = 仓库根 `docs/plans/2026-08-20-dsh-native-skill-driver.md`，并修正 README 的层级数（TDD Red 阶段实测追加）**：
   README 现居 `packages/capabilities/dsh-loopx-plugin/`，其 `../../docs/plans/…` 解析到 `packages/docs/plans/…`（不存在），
   需 `../../../docs/plans/…` 才落在仓库根 `docs/plans/`。实测：`new URL('../../docs/plans/…', 'file:///…/packages/capabilities/dsh-loopx-plugin/README.md')`
   → `/…/packages/docs/plans/…`；该行自 `a813982`（包按能力五组归位）起字面量从未改过，
   即**归位导致层级失效**——上游位置为 `dsh-loopx-plugin/README.md`（浅一层），`../../` 当时正确。
   故本次对 README 的唯一改动是补一层 `../`，不改任何措辞、不删不换链接。
   （grill-me 阶段曾确认「不改 README 链接目标」，其前提「路径正确、只是文件没建」经实测为假，按新事实修正。）
2. **只覆盖两件事 + 三条实测**（Q1=B、Q2=A）：GoalBar 协议、延迟原子性限制；以及本次实测得到的
   （a）插件实际调用的 CLI 面由 `resolvePluginLoopXCommand` 解析、（b）绑定解析要求恰一条匹配、
   （c）Driver 只认两种 typed 会话证据。
3. **不加门禁校验**（Q3=B）：`scripts/gate.mjs` 的 `CHECKS` 注册表本次**不新增** `doc-links` 项。
   理由已确认：本切片产物是文档、无可机器断言的 seam，同切片内既加校验又加被校验对象会使 Red/Green 变成自我发证。
4. **文档要引用的确切字面量**（写作时以仓库现状为准，不凭记忆）：
   - `lib/types/goalbar/protocol.d.ts`：`GOALBAR_REQUEST_VERSION`、`GOALBAR_RESPONSE_VERSION`、
     `GOALBAR_ENDPOINTS`（`goalbar/read|watch|start|pause`）、`GoalBarReadFaultCode` 六个值、
     `GoalBarActionRejectionCode` 四个值、`GoalBarActionResultV1` 的 `applied_with_warning` / `unknown` 分支。
   - `lib/types/goalbar/read-model.d.ts`：`GOALBAR_HOST_SURFACE`、`GOALBAR_PROJECT_REGISTRY`、
     `GOALBAR_ACTIVE_STATE_ROOT`、`GOALBAR_ACTIVE_STATE_FILE`、`computeGoalBarSourceRevision` 的「只哈希固定权威路径」隐私约束。
   - `lib/types/driver.d.ts`：`CONTINUATION_SCHEMA`、`LoopXContinuationDriver` 的 `onPreStep` / `evaluateActivatedSession`。
   - `package.json` 的 `dsh.bundle.patch` 与 `dsh.client.inject`（三个 Loader 行的声明来源）。
5. **文档头部 frontmatter**：至少含 `title` 与 `status`（取值 `current`，表示描述的是当前实现而非提案）；
   与 README 的链接互相指向，形成单向引用闭环（README → 文档；文档内回链 README 对应章节）。
6. **行文语言**：与仓库主脊柱一致，中文；代码标识符、schema 版本字面量保持原样英文。
7. **不新增 ADR**：本次是「补写既有引用的目标」，不是新决策；`docs/adr/` 与 `docs/notes/` 均不改动。

## Testing Decisions

- **唯一 seam**：`packages/capabilities/dsh-loopx-plugin/README.md` 中的相对链接。
  可观察的公开行为是「该链接归一化后的仓库根路径指向磁盘上真实存在的文件」。
- **期望值来源**：README 第 35 行的链接字面量（`../../docs/plans/2026-08-20-dsh-native-skill-driver.md`），
  以及 README 点名的两个内容承诺（GoalBar 协议、延迟原子性限制）——不复制文档正文。
- **先例沿用**：门禁侧已有 `scripts/gates/checks.mjs` 的 `resolveDocLink(fromPath, link)` 把相对链接归一化为
  仓库根相对路径，`checkAdrNoteLinks` 已用它校验 ADR→Note 链接；本次的链接断言沿用同一归一化规则，
  不新写一套路径解析。
- **负向用例必须存在**：先证明「文档不存在时该断言会失败」（Red 必须是能力缺失，而不是路径写错或选择器问题），
  再让同一断言在文档写就后转绿（Green）。
- **不做的事**：不为文档正文做逐句断言（会把测试变成正文副本）；不在本次引入全仓 Markdown 链接扫描器。
- **最终验收**：Shell 执行 `node scripts/gate.mjs --mode quick` 取得真实退出码与摘要；
  文档本体按仓库既有「非机械改动留痕」要求不替代验收（本次不改产品行为，无需浏览器验收）。

## Out of Scope

- 不改 `README.md` 的任何措辞或链接文字；唯一允许的改动是把链接的 `../../` 补成 `../../../`（层级修正，见 Implementation Decisions 第 1 条）。
- 不在门禁新增通用 Markdown 相对链接/锚点校验（`doc-links`），不做全仓死链清扫。
- 不重建或推测那份「原始」上游设计文档的内容——只写本次有真实依据的契约与实测。
- 不修改 `dsh-loopx-plugin` 的任何代码、类型声明、`package.json` 或 `lib/` 产物。
- 不新增 ADR、不改 `docs/notes/`、不改 `docs/architecture.md` 的既有承诺清单。
- 不处理本次实测发现的另外两件事：插件仍标 beta（待重启 DSH 后验证 GoalBar 渲染）、
  `/loopx` 技能被 agent preset 遮蔽（环境侧已改，待重启生效）。

## Further Notes

- **已知缺口（下一轮独立候选）**：`docs/architecture.md` 承诺的「文档相对链接与锚点可达」这条契约级校验
  在 `scripts/gate.mjs` 中未实现——目前只有 `adr-note-links` 覆盖 ADR→Note 一条链。
  正因如此本案的死链才能通过 quick 门禁 12/12。这是本案的**直接成因**，但按 Q3=B 明确不在本次范围。
- **本规格与 2026-09-11 实测的关系**：实测记录在 `docs/notes/implemented/capability/2026-09-11-loopx-capability-trial.md`
  与 `.loopx/registry.json`（goal `magpie-horch-goal` / agent `magpie-horch-native-1`）。
  本次写入文档的三条实测约束均可在其中复核。
- **风险**：文档写就后若实现漂移，本文件不会自动报警（无 seam）。该风险与已知缺口同一根因，接受并登记。
