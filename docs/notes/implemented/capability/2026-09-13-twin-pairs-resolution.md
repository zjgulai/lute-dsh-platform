# 孪生对处理落地：合并为主、区分描述为辅（skill-map 覆盖层）

- 日期：2026-09-13
- 关联评审：`../../../../.scratch/twin-pairs/overview.md`（678 对枚举与 11 对合并候选）
- 关联 ADR：无新增（机制级改动，复用 [ADR-0015](../../../adr/ADR-0015.md) 决策留痕规则）

## Problem

算法技能页面「本岗已接线」只有 326 张（1338 张已安装卡），且同一岗位同一 L3 下挂着多张「内容近重复」的卡导致模型错选（situational 准确率 87.5% vs 独苗 100%）。678 对孪生里 11 对是标题近重复（Dice≥0.45），其中 3 对是假孪生（法规/对象/静态动态不同），另有 agt-045 的三卡身份簇。需要在不破坏 paper_to_skills 材料管线的前提下，处理真重复、区分假孪生、并试点「每 L3 留 N 张」的供给配额。

## Decision

四项用户拍板 + 落地方式：

1. **合并为主、区分描述为辅**：11 对里 8 对合并（含 agt-045 三卡簇 3→1）、3 对区分描述。
2. **技能库侧落地、深度解耦**：处理表 `scripts/role-presets/skill-map.overrides.json` 是独立于 `skill-map.json` 的覆盖层，由 `packages/capabilities/dsh-paper2skills/scripts/apply-skill-map-overrides.mjs` 应用。只动 skill-map supply、preset subset（经 `generate.mjs` 同步）与安装态 `~/.dsh/skills/*/SKILL.md` 的 whenToUse；**材料侧（paper_to_skills 原项目、vault）零改动、被并卡不删安装**。管线顺序：`wire-skill-map.mjs`（只追加）→ `apply-skill-map-overrides.mjs`（去重+配额+文本覆盖，幂等可 `--revert`）→ `generate.mjs`（同步 manifest）。
3. **三卡簇合并**：`cross-platform-user-identity`（keep）吸收 `-resolution` 与 `multi-source-user-identity-unification`；`entity-resolution-kg-dedup`（商品侧）独立保留，与 keep 互斥点名。
4. **试点岗每 L3 留 2 张**：agt-016 知量（需求预测/补货模拟/供需协调）、agt-032 点火（投放诊断/预算分配/广告实验）各 L3 收窄为「1 原生平台技能 + 1 论文方法卡」。

被并卡（9 张）保留在材料与安装态，仅从 supply/subset 摘除；keep 卡 whenToUse 追加「〔孪生处理 v1〕」锚点的吸收句与互斥点名，锚点保证幂等重放。

## Alternatives considered

- **材料侧合并**（改 vault 源卡后重跑 S2 合成管线）：语义最干净，但成本高一个量级，且下轮 S2 重跑才能生效，与「材料是上游事实」的原则冲突。弃。
- **每 L3 只留一张**（激进配额）：会丢 365−N 张卡的能力面，违反「合并只动真重复」原则。弃。
- **改 wire-skill-map.mjs 加黑名单**：把处理逻辑写进管线本体，处理表与管线耦合，撤销困难。弃，选独立覆盖层。

## Consequences

- 本岗已接线 326 → 309（9 张被并卡摘除 + 试点两岗 15 张收窄），wiredAnywhere 483；试点岗子集从 15/17 张收窄到 8/7 张。
- 下轮 `wire-skill-map.mjs` 重跑（只追加）会尝试复活被并卡 → 必须重放 `apply-skill-map-overrides.mjs`；脚本幂等（锚点 + 全 supply 残留校验）。
- 材料侧重装 SKILL.md 会丢 whenToUse 覆盖 → 同样重放覆盖层即可恢复。
- 667 对同域邻接对已于同日阶段 2 推广完成：见 `2026-09-13-twin-pairs-quota-rollout.md`；已归位未接线卡（配额后 1184 张）同日拍板保持不接线：见 `2026-09-13-unwired-coverage-decision.md`。
- 撤销路径：`node packages/capabilities/dsh-paper2skills/scripts/apply-skill-map-overrides.mjs --revert` + 重跑 `generate.mjs`。
