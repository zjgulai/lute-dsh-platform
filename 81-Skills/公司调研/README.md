---
title: Company Research
doc_type: workflow
module: company-research
topic: skill
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Company Research

`company-research` 是公司级调研与尽调正式 Skill。

## 独立边界

它服务“公司本身”的深度研究，不服务“产品/品类/Listing/SEO/价格”的运营研究。

核心差异：

- L1-L4 深度分级。
- source tier 与关键事实交叉验证。
- 字段级 confidence。
- 风险/负面查询强制纳入。
- 洞察必须从事实推导到影响。
- Notes 必须记录冲突、缺口和反向观点。

## 发布门槛

- 通过 `skill-doctor --check`。
- 通过 `validate-skill --strict`。
- 至少完成 3 个 RED cases 的人工试跑记录。
- 至少有 1 个真实公司研究任务输出。
- 明确没有被 `pp-competitor-intelligence`、`pp-product-research-matrix` 或 `cbec-market-viability-auditor` 覆盖。

## 试跑记录

| 日期 | 类型 | 输出 | 结果 |
|---|---|---|---|
| 2026-05-31 | L1 company profile | `examples/l1-nvidia-company-profile-trial-20260531.md` | 通过：T1 来源覆盖基础信息、财务、团队和风险；未越界到选品或通用竞品矩阵 |
| 2026-06-01 | L2 strategic pivot profile | `examples/allbirds-l2-strategic-pivot-trial-20260601.md` | 通过：SEC/IR 和公开二手来源覆盖业务转型、资产出售、资金安排、治理、风险和近 12 月动态；Notes 标注股东会与交割刷新缺口 |

## RED Case 试跑记录

| 日期 | 输出 | 结果 |
|---|---|---|
| 2026-06-01 | `tests/red-case-trial-20260601.md` | 通过：公司尽调正例触发，选品、竞品矩阵和公开数据不足的 L4 请求均按边界处理 |

## 发布评估记录

| 日期 | 报告 | 分数 | 结论 |
|---|---|---:|---|
| 2026-06-01 | `eval-reports/company-research-evaluation-report.yaml` | 91/100 | 通过：无 error、无 warning，达到正式发布门槛 |
| 2026-06-01 | 发布复验 | 100/100 | 通过：正式迁移、索引同步和图谱一致性校验完成 |
