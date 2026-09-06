---
title: Company Research Workflow
doc_type: workflow
module: company-research
topic: seven-step-research
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# 七步公司研究工作流

## 1. 意图澄清与深度定级

先确认：

- 研究对象：公司、母公司、子品牌、创始人还是赛道。
- 使用场景：会议前扫盲、BD 准备、投资初筛、尽调、投委会材料。
- 时效范围：近 3 月、近 12 月、历史全量。
- 输出深度：L1、L2、L3、L4。

## 2. 查询矩阵生成

至少覆盖三种语言或信息环境：

| 语言/环境 | 公司画像 | 财务/融资 | 竞争/市场 | 风险/负面 |
|---|---|---|---|---|
| 中文 | 必查 | 必查 | 必查 | 必查 |
| 英文 | 必查 | 必查 | 必查 | 必查 |
| 本地语言/垂直源 | 按需 | 按需 | 按需 | 必查 |

风险/负面维度包括诉讼、裁员、召回、处罚、数据泄露、合规争议、关键人物离职。

## 3. 分层搜索

| 层级 | 目标 | 用途 |
|---|---|---|
| 广度层 | 发现长尾来源 | 建立候选 source pool |
| 权威层 | 锁定 T1/T2 | 交叉验证关键事实 |
| 时效层 | 捕捉近 12 月变化 | 避免过期画像 |

## 4. 来源分级与筛选

使用 `source-and-depth-rules.md`。T4 只作为线索，不进入关键事实支撑。

## 5. 字段提取

每个字段都记录：

```text
value | source_url | source_tier | extracted_quote | confidence
```

`extracted_quote` 只保留短片段，避免复制长文。

## 6. 交叉验证与洞察推理

关键事实必须交叉验证。冲突时按 source tier、发布日期、原始披露优先级仲裁，并写入 Notes。

洞察使用四段式：

```text
事实 -> 推理 -> 结论 -> 影响
```

## 7. 自审与输出

按 `self-review.md` 自审，再使用 `output-template.md` 输出。
