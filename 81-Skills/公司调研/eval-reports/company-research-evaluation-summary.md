---
title: Company Research Evaluation Summary
doc_type: analysis
module: company-research
topic: evaluation-summary
status: stable
created: 2026-06-01
updated: 2026-06-01
owner: self
source: human+ai
---

# Evaluation Summary

## 结论

`company-research` 已达到正式发布门槛。

- 评分：91/100
- 状态：good
- error：0
- warning：0
- 结论：已作为正式迁移依据

## 评估依据

| 门槛 | 证据 | 结论 |
|---|---|---|
| 真实公司研究输出 | `examples/l1-nvidia-company-profile-trial-20260531.md` + `examples/allbirds-l2-strategic-pivot-trial-20260601.md` | 通过 |
| RED cases 人工试跑 | `tests/red-case-trial-20260601.md` 覆盖公司尽调正例、选品误触发、竞品矩阵误触发和 L4 公开数据降级 | 通过 |
| Duplicate map | `references/duplicate-map.md` 明确与 `pp-competitor-intelligence`、`pp-product-research-matrix`、`cbec-market-viability-auditor`、`da-amazon-sorftime-research`、`seo-competitor-analyzer` 的边界 | 通过 |
| 来源与深度规则 | `references/source-and-depth-rules.md` 定义 T1-T4 和 L1-L4 门槛 | 通过 |
| 输出模板 | `references/output-template.md` 覆盖 Executive Summary、Results、Analysis、Insights、Sources、Notes | 通过 |
| 结构验证 | `skill-doctor --check`：0 error / 0 warning；`validate-skill --strict`：100/100 | 通过 |
| 图谱校验 | `layout/scripts/validate_graph_consistency.py` 通过 | 通过 |

## 发布复验要求

- 正式迁移到 `skills/` 后，必须同步 `layout/skills_structure.csv`、`layout/skills_master_index.yaml` 和相关图谱。
- 发布提交前必须重新运行 doctor、strict validate 和 graph consistency。
- 已补 1 个真实 L2 样本；后续只在真实使用反馈出现时补 L3/L4。
- 本 Skill 只做公司研究，不替代产品选品、市场进入裁决或通用竞品矩阵。

## 发布状态

已迁移到 `skills/company-research/`，并进入正式发布复验流程。
