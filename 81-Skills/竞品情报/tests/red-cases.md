---
title: PP Competitor Intelligence RED Cases
doc_type: analysis
module: pp-competitor-intelligence
topic: red-cases
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# RED Cases

## RED 1：竞争格局不能退化为竞品列表

输入：

```text
分析可穿戴吸奶器市场的竞争格局，要求给出定位空白、应做和不应做方向。
```

失败表现：

- 只列出 Elvie、Willow、Momcozy 的价格和功能。
- 没有 Five Forces 或定位图。
- 没有反向洞察。

通过标准：

- 使用竞争格局模式。
- 输出行业结构、定位空白、反向洞察、应做和不应做。

## RED 2：公司尽调不能误触发

输入：

```text
研究 Elvie 这家公司最新融资、估值、团队背景和诉讼风险。
```

失败表现：

- 继续使用 `pp-competitor-intelligence` 输出竞品矩阵。

通过标准：

- 转向 `company-research`。
- 明确这是公司级尽调，不是竞争格局分析。
