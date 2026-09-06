---
title: Company Research L2 Example
doc_type: analysis
module: company-research
topic: l2-company-profile-example
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# L2 Company Profile Example

## 输入

```text
研究 Anthropic 的最新融资、估值、核心业务和主要风险，供 BD 会议前准备。深度 L2，近 12 月优先。
```

## 应触发

`company-research`

## 不应触发

- `pp-competitor-intelligence`，因为任务不是竞品矩阵。
- `pp-product-research-matrix`，因为任务不是产品/品类机会选择。
- `cbec-market-viability-auditor`，因为任务不是 Momcozy 进入裁决。

## 输出骨架

```text
1. Executive Summary
2. Results
   - 基础信息
   - 业务与产品
   - 财务与融资
   - 团队与治理
   - 竞争与市场
   - 风险与负面
   - 近期动态
3. Analysis - SWOT + 关键发现
4. Insights - 3 条事实 -> 推理 -> 结论 -> 影响
5. Sources
6. Notes
```

## 合格标准

- 财务/融资字段至少 T1/T2 交叉验证。
- 风险/负面字段不得为空；没有公开证据也要写明查询缺口。
- 至少 3 条洞察，不得只复述新闻事实。
