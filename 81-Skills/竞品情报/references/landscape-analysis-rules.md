---
title: Competitive Landscape Analysis Rules
doc_type: workflow
module: pp-competitor-intelligence
topic: competitive-landscape-analysis
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Competitive Landscape Analysis Rules

## Depth Levels

| 等级 | 用途 | 必选输出 |
|---|---|---|
| L1 | 快速判断是否值得关注 | Five Forces 摘要、定位图、至少 1 条洞察 |
| L2 | 产品或市场决策 | Five Forces、3-5 个竞品、至少 3 条洞察，其中 1 条反向 |
| L3 | 战略或融资决策 | 全框架、至少 5 个竞品、至少 5 条洞察、明确不可做方向 |

## Workflow

1. 明确市场对象、地理范围、时间窗和分析深度。
2. 选择不超过 3 个框架，默认 Five Forces + 定位图 + SWOT。
3. 结构化采集竞品、价格、渠道、产品能力、品牌叙事和用户反馈。
4. 区分事实、推断和推测。
5. 输出洞察链：事实 -> 推理 -> 结论 -> 影响。
6. 强制加入反向洞察。
7. 输出 `应做` 与 `不应做`，不只给机会清单。

## Output Template

```text
1. 结论摘要（<=200 字）
2. 行业竞争结构
3. 竞争定位
4. 关键洞察
5. 战略建议
   - 应做
   - 不应做
6. Notes
   - 信息缺口
   - 不确定性
   - 需要二次验证的数据
```

## Quality Gates

- 输出是否符合模板。
- 深度是否满足 L1/L2/L3 要求。
- 是否有反向观点。
- 核心结论是否有可追溯依据。
- 是否明确不可做方向。
