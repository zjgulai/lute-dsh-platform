# 孪生对评审材料（节点 1 · 只读盘点）

> ✅ 已执行（2026-09-13）：用户拍板「合并为主（8 对+三卡簇 3→1）/ 区分描述为辅（3 对）/ 试点岗每 L3 留 2 张」。
> 落地：`scripts/role-presets/skill-map.overrides.json`（处理表）+ `apply-skill-map-overrides.mjs`（幂等应用脚本）。
> 决策记录：`docs/notes/implemented/capability/2026-09-13-twin-pairs-resolution.md`。
> 本页 §2 的逐对初判即执行依据；执行后本岗已接线 326 → 309。
>
> ✅ 阶段 2 已执行（2026-09-13 继续）：667 邻接对配额制全库推广——125 个拥堵 L3 条目按「1 原生底盘 + 1 论文方法卡」收窄（例外：多平台面 2 条、区分保留对 3 条、岗内去重 11 条）。
> 决策记录：`docs/notes/implemented/capability/2026-09-13-twin-pairs-quota-rollout.md`；决策源：`.scratch/twin-pairs/stage2-decisions.py`。
> 运行时实测：wiredAnywhere 483 → 258，50 岗子集收敛到 ~6 张/岗；撤销同阶段 1 路径。
>
> ✅ 阶段 3 已执行（2026-09-13 继续执行）：1184 张已归位未接线卡（配额后口径，配额前为 978）**保持不接线**——全量接线会撤销配额拍板并买回错选空间；可达性由 Case Control 按需装配 + 管线幂等追加两条通道保证。
> 决策记录：`docs/notes/implemented/capability/2026-09-13-unwired-coverage-decision.md`。孪生对程序三阶段全部闭环。

> 生成：`node .scratch/twin-pairs/export-twin-pairs.mjs`（只读 4 个数据源，未改任何仓库/技能库文件）
> 机读附件：`pairs.json`（678 对全量+差异摘要）、`pairs.tsv`（平铺）、`l3-groups.json`（按 L3 聚合）、`sample-top20.json`（评审样本）

## 0 · 数据对账

| 口径 | 本次枚举 | 实测发布值（eval/out/static-routing.json） | 判定 |
| --- | ---: | ---: | --- |
| 孪生对总数 | 678 | 678 | ✅ 一致，现场未漂移 |
| 受影响 preset | 47 | 47 | ✅ |
| 有孪生的卡 | 365 | 365 | ✅ |

枚举口径与实测完全一致：同一 preset 内两张卡共享 ≥1 个 L3（复刻 `eval/static-routing.mjs` M3 逻辑）。

## 1 · 三个关键发现（先讲透，再评审）

**发现一：678 对里只有 11 对是「内容近重复」，其余 667 对是「同 L3 共域邻接」。**
标题 Dice≥0.45 的合并候选仅 11 对（涉 22 张卡）；全库 0 对标题完全相同、0 对触发词重叠 ≥0.5。
即：孪生问题的主体不是「抄出来的重复卡」，而是**同一岗位的同一业务域下，挂了几张不同方法/不同切面的卡**（如知量岗需求预测 6 张卡互相成 15 对）。这正对应实测错选机制：situational 准确率 87.5%（有孪生）vs 100%（独苗）。

**发现二：11 对合并候选里有 3 对是「假孪生」**——标题相似但问题对象或法规不同：
- `privacy-compliant-data-collection-gdpr-ccpa` ↔ `privacy-coppa-compliance`：GDPR/CCPA 成年用户采集架构 vs COPPA 儿童隐私，不同法规不同红线；
- `cross-platform-user-identity-resolution` ↔ `entity-resolution-kg-dedup`：用户身份解析 vs 商品实体消歧，同一技术不同对象；
- `bundle-pricing-strategy` ↔ `dynamic-bundle-pricing`：静态策略 vs 动态定价（边界见 §2 初判）。
这 3 对正是「区分描述」选项的典型：合并不对，但 `whenToUse` 必须互斥点名对方。

**发现三：agt-045 主数据治理有一个三卡簇**：`cross-platform-user-identity`、`cross-platform-user-identity-resolution`、`multi-source-user-identity-unification` 三张都是「跨平台用户 ID 统一」（另有 `entity-resolution-kg-dedup` 是商品侧消歧）。簇内 6 对里有 5 对标题 Dice ≥ 0.26，其中 2 对超合并线。

## 2 · 11 对合并候选 · 逐对初判

> 完整差异摘要（user_summary / workflow / ① 正文节选）在 `pairs.json` 对应条目；此处给初判与理由，供你逐对拍板。

| # | 岗位 | 共享 L3 | A ↔ B | 初判 | 理由 |
| --- | --- | --- | --- | --- | --- |
| 1 | agt-027 守店 | 规则监测 | `regulatory-change-auto-monitor` ↔ `regulatory-change-monitoring` | **合并** | 同一主题「法规变更监控」拆两张：一张做 24h 预警推送，一张做品类/SKU 影响映射，属同一论文两个切面；实测错选正是这对 |
| 2 | agt-031 绘影 | 视频制作协作 | `aquarius-brand-video-generation` ↔ `brand-video-generation` | **合并** | 「Aquarius」是论文名前缀，功能都是品牌视频生成（多市场本地化版 vs 全链路版） |
| 3 | agt-030 | 创意简报 | `ai-product-video-script-generator` ↔ `ai-video-script-generation` | **合并** | 都是短视频脚本生成：VOC 痛点模板 vs 分层 CoT 叙事弧，产出同物 |
| 4 | agt-016 知量 | 供需协调 | `bullwhip-effect-kalman-mitigation` ↔ `bullwhip-effect-mitigation` | **合并** | 同一问题「牛鞭效应抑制」，方法差异（Kalman vs LNN+XGBoost）可并进一张卡 |
| 5 | agt-026 衡价 | 价格敏感性 | `bundle-pricing-strategy` ↔ `dynamic-bundle-pricing` | 合并（备选：区分） | 同一决策问题「套餐价定多少」；若业务上静态策略与动态定价是两个动作，则走区分 |
| 6 | agt-023 自航 | 转化优化 | `abandoned-cart-recovery-ml` ↔ `abandoned-cart-recovery-trigger` | **合并** | 弃购挽回同一运营问题：ML 分型触达 vs T+2/24/48h 时序序列，机制互补不互斥 |
| 7 | agt-002 枢衡 | 预算分配 | `ltv-acquisition-budget-gate` ↔ `ltv-cac-acquisition-gate` | **合并** | 最确定的一对：功能完全相同（LTV/CAC 阈值熔断/开闸+护栏），仅护栏细节不同 |
| 8 | agt-044 | 隐私需求分析 | `privacy-compliant-data-collection-gdpr-ccpa` ↔ `privacy-coppa-compliance` | **区分** | 假孪生：GDPR/CCPA vs COPPA 法规不同、适用对象不同；whenToUse 互斥点名 |
| 9 | agt-036 | 选购指导 | `long-term-preference-memory` ↔ `shopping-companion-agent` | **合并** | 同名「Shopping Companion」偏好记忆购物助手，同一论文/同一切面 |
| 10 | agt-045 | 主数据治理 | `cross-platform-user-identity` ↔ `multi-source-user-identity-unification` | **合并** | 同一功能「跨平台用户 ID 统一」；且与 `-resolution` 构成三卡簇 → 3 合 1 |
| 11 | agt-045 | 主数据治理 | `cross-platform-user-identity-resolution` ↔ `entity-resolution-kg-dedup` | **区分** | 假孪生：用户身份解析 vs 商品实体消歧，同技术不同对象 |

**合并的净影响**：8 对合并 + 三卡簇 3→1，全库约减 **10 张卡**（1338 → ~1328，0.7%）。
**明确不采纳**「每 L3 只留一张」的激进合并（Note 里被否的选项）：那会丢 365−N 张卡，且违反「合并只动真重复」的原则。

## 3 · L3 拥堵排名（对×L3 贡献，前 20）

> 一对多 L3 时会出现在多组，故组内计数之和 ≥678。

| 排名 | L3 | 对贡献 | 涉卡 | 排名 | L3 | 对贡献 | 涉卡 |
| --- | --- | ---: | ---: | --- | --- | ---: | ---: |
| 1 | 规则监测 | 28 | 8 | 11 | 主数据治理 | 15 | 6 |
| 2 | 安全事件处理 | 28 | 8 | 12 | 分群 | 14 | 10 |
| 3 | 数据管道 | 21 | 7 | 13 | 运行监测 | 11 | 6 |
| 4 | 转化优化 | 18 | 9 | 14 | 资金预测 | 11 | 6 |
| 5 | 体验分析 | 16 | 8 | 15 | 证据复核 | 11 | 7 |
| 6 | 趋势监测 | 15 | 6 | 16 | 竞品研究 | 11 | 7 |
| 7 | 需求预测 | 15 | 6 | 17 | 供应商评估 | 11 | 7 |
| 8 | 库存分层 | 15 | 6 | 18 | 素材版本管理 | 11 | 7 |
| 9 | Listing优化 | 15 | 6 | 19 | 容量管理 | 11 | 7 |
| 10 | 价格敏感性 | 15 | 6 | 20 | 异常冻结与恢复 | 10 | 5 |

**试点岗现状**（阶段 2 的起点数据）：
- agt-016 知量：preset 内 9 张 p2s 卡 → 26 对孪生（涉全部 9 张）；需求预测 6 卡互成 15 对、补货模拟 5 卡 10 对、供需协调 3 卡 3 对；
- agt-032 点火：9 张卡 → 15 对；投放诊断 5 卡互成 10 对、广告实验 3 卡 3 对、预算分配 3 卡 3 对、素材版本管理 2 卡 1 对；
- 全库 50 岗共暴露 374 卡次，中位 8 张/岗。

## 4 · 判定标准建议（请拍板）

| 选项 | 判据 | 动作 |
| --- | --- | --- |
| **合并** | 同一业务问题 ∧ 同一方法族/论文源，方法差异可写进一张卡 | 技能库侧：从 skill-map supply 与 preset skill-subset 移除冗余卡，保留卡吸收被并卡的能力面；**不动材料侧、不删安装**（防止下轮 S2 重跑把卡复活，需在 Note 记录映射） |
| **区分描述** | 问题或对象不同（用户 vs 商品）、法规不同（GDPR vs COPPA）、静态 vs 动态有业务意义 | 双侧 `whenToUse` 互斥点名对方（「何时不用：要 X 用「Y」」），不动供给 |
| **排名降级** | 同 L3 多卡各有独立场景，暂不改文本 | 调整 preset 内 L3 供给配额/排名（阶段 2 机制），邻接对纳入配额制 |

三选一的结果落一张**处理表**（独立于 skill-map，可单独撤销），`pairs.json` 的 `idx` 即处理表主键。

## 5 · 供讨论的问题

1. **判定标准**按 §4 表执行？11 对我的初判是 **8 合并 / 3 区分**（§2 表格），请逐对确认或改判。
2. **合并的落地范围**：技能库侧（推荐，supply+preset 去重，材料侧保留双卡并记映射）vs 材料侧（改源站 playbook/skills html 后重跑 S2 合成管线，成本高一个量级）。
3. **三卡簇**（agt-045 主数据治理）：3 张身份卡合 1，`entity-resolution-kg-dedup`（商品侧）保留——同意？
4. **667 对邻接对的配额**：试点岗每 L3 留几张卡？（知量现状：需求预测 6 / 补货模拟 5 / 供需协调 3；点火现状：投放诊断 7）——建议按「覆盖方法差异」定 N，具体数字下个节点给方案。
