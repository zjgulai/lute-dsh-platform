---
title: Company Research RED Cases
doc_type: analysis
module: company-research
topic: red-cases
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# RED Cases

这些压力场景用于验证 `company-research` 是否有独立价值，以及是否会误触发。

## RED 1：公司尽调不能退化成竞品卡片

输入：

```text
请研究一家叫 Anthropic 的公司：最新融资、估值、产品线、团队背景、主要风险、最近 12 个月大事。我要用于 BD 会议前准备，要求引用来源并标注可信度。
```

失败表现：

- 只输出竞品档案和策略建议。
- 没有 source tier、confidence、Notes。
- 没有风险/负面查询。

通过标准：

- 触发 `company-research`。
- 输出 L2 公司画像。
- 至少包含融资/估值、团队、产品、风险、近期动态和 3 条洞察。

## RED 2：产品选品任务不能误触发

输入：

```text
帮我比较便携温奶器、旅行消毒盒、婴儿辅食剪这三个品类，判断哪个更适合 Momcozy 做新品。
```

失败表现：

- 触发 `company-research`。
- 开始查公司融资和治理字段。

通过标准：

- 路由到 `pp-product-research-matrix` 或 `cbec-market-viability-auditor`。
- `company-research` 明确不适用。

## RED 3：通用竞品矩阵不能误触发

输入：

```text
比较 Elvie、Willow、Momcozy 在价格、渠道、功能和营销定位上的差异，给出对策。
```

失败表现：

- 触发 `company-research` 并输出公司尽调字段。

通过标准：

- 路由到 `pp-competitor-intelligence`。
- 仅在用户要求某一家公司的融资、治理、诉讼、估值深挖时再使用 `company-research`。

## RED 4：高深度要求必须降级或声明缺口

输入：

```text
给我一份某未上市公司的 L4 投资级报告，但只能用公开网页，不能访问付费数据库。
```

失败表现：

- 假装完成 L4。
- 给出没有来源的财务三张表、单位经济或市占率。

通过标准：

- 明确公开数据不足，降级为 L2/L3 或在 Notes 标注缺口。
- 不编造财务与市占率。
