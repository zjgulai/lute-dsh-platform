# 孪生对处理阶段 2：667 邻接对配额制全库推广

- 日期：2026-09-13
- 关联评审：`../../../../.scratch/twin-pairs/overview.md`（§3 拥堵排名、§4 判定标准）
- 前置记录：`2026-09-13-twin-pairs-resolution.md`（阶段 1：8 合并 / 3 区分 / 试点配额）
- 决策源：`.scratch/twin-pairs/stage2-decisions.py`（125 条目逐条 keep 判定，可审计）
- 关联 ADR：无新增（同一机制覆盖层的推广，复用 [ADR-0015](../../../adr/ADR-0015.md)）

## Problem

阶段 1 处理了 678 对孪生中的 11 对真重复，但主体（667 对同 L3 共域邻接）未动：125 个 L3 条目挂着 3–6 张卡，模型在同一 L3 内错选（situational 87.5% vs 独苗 100%）。配额机制已在知量/点火两岗跑通（幂等、可撤销、门禁绿），需要把「每 L3 留 2 张」推广到全部拥堵 L3。

## Decision

按用户拍板「各自都留 2 张（按实际情况）」推广，判定规则三条：

1. **基线：每 L3 留 2 张 = 1 原生平台技能（业务底盘）+ 1 论文方法卡**（110 条）。原生选与 L3 业务动作最贴切的底盘卡，论文方法卡选覆盖核心方法的卡。
2. **例外 1 · 多平台面**（2 条）：L3 内多个原生卡是互不替代的平台/工具面，全留 + 1 方法卡。`平台运营`（Etsy/TikTok/Shopify 三平台）、`业务工具实现`（插件构建/Apify/Accio 三工具）。
3. **例外 2 · 阶段 1 保留对**（3 条）：区分保留对（静态/动态捆绑、COPPA/GDPR-CCPA、商品实体消歧）与合并 keep 卡在对应 L3 必须保留，宁多不丢。

另做 11 处**岗内去重**：同一张卡占同岗两个 L3 的坑位时，只留最贴切的一处，另一 L3 换用该 L3 自己的候选（如 `amazon-listing-expert` 归商品诊断，Listing优化换 `multi-platform-listing-generator`）。

落地方式与阶段 1 完全一致：处理表 `scripts/role-presets/skill-map.overrides.json` 的 `quota` 段扩到 45 岗 125 条目（version 2），经 `apply-skill-map-overrides.mjs` 幂等应用，再 `generate.mjs` 同步 50 岗 manifest。材料侧、安装态技能零改动；被裁卡不删安装、不删 supply 之外的一切。

## Alternatives considered

- **只推试点两岗、其余不动**：667 对的主体问题不解决，错选率维持。弃。
- **按「覆盖方法差异」逐 L3 手调 N（3–5 张）**：更细但 125 条目无统一判据，评审成本高一个量级，且与用户「留 2 张」的明示相悖。折中为上文三类例外。
- **配额写进 wire-skill-map.mjs 本体**：与阶段 1 同理弃（覆盖层可撤销、管线本体不可）。
- **同时处理 978 张未接线卡的接线率**：独立议题（已归位未接线的覆盖率提升），需另行拍板，本轮不动。

## Consequences

- 125 个拥堵 L3 条目全部收窄：基线 2 张/条目，多平台面 4 张/条目，区分保留对 3 张/条目；共裁 323 个 card-slots。
- 运行时实测（`/api/dsh-algo-skills/tree`）：wiredAnywhere 483 → **258**（-225 张 distinct）；按卡分类归属岗的 wired 127；50 岗每岗子集收敛到 6 张左右（4 L3 岗 8 张，区分保留对岗 7 张）。
- 每个 L3 现在只有 1 个原生底盘 + 1 个方法卡，模型岗内错选空间从 3–6 卡收窄到 2 卡。
- 被裁卡仍全部安装且可在任意 preset 显式装配：配额只影响「本岗默认接线」，不破坏能力库总量（1338 张安装不变）。
- 撤销路径不变：`node packages/capabilities/dsh-paper2skills/scripts/apply-skill-map-overrides.mjs --revert` + 重跑 `generate.mjs`。
- 遗留：① 已归位未接线卡（配额后 1184 张）同日已拍板保持不接线，见 `2026-09-13-unwired-coverage-decision.md`；② AGT-011 砺器 / AGT-025 联商 本岗 0 张卡（矩阵空白岗，非本轮引入）；③ 下轮 `wire-skill-map.mjs` 只追加会复活被裁卡，必须重放覆盖层（管线顺序已写死在两篇记录里）。
