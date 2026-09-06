---
title: Company Research Source And Depth Rules
doc_type: workflow
module: company-research
topic: source-depth-rules
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Source And Depth Rules

## Source Tier

| Tier | 来源 | 用途 |
|---|---|---|
| T1 | 公司官网、官方公告、IR、监管文件、招股书、年报、法院文书 | 关键事实锚点 |
| T2 | Reuters、Bloomberg、FT、WSJ、The Information、财新、CB Insights、PitchBook 等权威二手 | 交叉验证和行业判断 |
| T3 | 主流媒体、行业博客、LinkedIn 公开信息、券商研报 | 辅助背景 |
| T4 | 百科、聚合页、论坛、匿名短帖、转载 | 只作线索 |

规则：

- 财务、融资、估值、诉讼和监管字段至少需要 1 条 T1 或 2 条 T2。
- 战略、产品、团队字段至少需要 T1/T2/T3 中的两个独立来源。
- T4 不得单独支撑任何高影响结论。

## Depth Levels

| 深度 | 适用场景 | 必选内容 | 来源要求 | 洞察要求 |
|---|---|---|---|---|
| L1 | 会议前扫盲 | 公司名、官网、主营、总部、成立时间、员工规模 | 3-5 条，T1/T2 >= 2 | 1 条 |
| L2 | BD/竞品准备 | L1 + 融资、估值、核心产品、创始人、近 12 月大事 | 10-15 条，T1/T2 >= 5 | >=3 条 |
| L3 | 投资初筛/合作评估 | L2 + 融资序列、团队、护城河、营收线索、客户、合作、诉讼合规 | 30-50 条，T1/T2 >= 15 | >=5 条 |
| L4 | 投委会/深度研报 | L3 + 财务摘要、单位经济、市占率、专利、风险量化、融资预测 | 80+ 条，T1/T2 >= 30 | >=8 条，含反向观点 |

达不到来源要求时，不得伪装为高深度输出，必须降级或在 Notes 中声明缺口。
