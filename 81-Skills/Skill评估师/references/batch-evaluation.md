---
title: 批量评估指南
doc_type: reference
module: lute-skills-eval
topic: batch-evaluation
status: stable
created: 2026-05-27
updated: 2026-05-27
owner: self
source: human+ai
---

# 批量评估指南

本文件定义 `lute-skills-eval` 的批量评估模式详细规范。

## 触发方式

```bash
/lute_skills_eval /path/to/skills --batch
/lute_skills_eval /path/to/skills --batch --min-score=70    # 只评估低于70分的
/lute_skills_eval /path/to/skills --batch --output-dir=./reports
```

## 批量评估流程

### Step 1: 遍历扫描

遍历 `skills/` 目录下所有子目录，识别合法 Skill（包含 SKILL.md）。

### Step 2: 逐个评估

对每个 Skill 执行标准六维度评估，生成独立 YAML 报告。

### Step 3: 汇总统计

聚合所有评估结果：

```yaml
batch_summary:
  total_skills: 80
  evaluated: 80
  passed: 75      # >= 85分
  failed: 5       # < 85分

  score_distribution:
    excellent(95+): 45
    good(85-94): 30
    needs_optimization(70-84): 4
    needs_refactor(<70): 1

  issue_aggregation:
    schema_compliance:
      total: 12
      auto_fixable: 8
    frontmatter_quality:
      total: 23
      auto_fixable: 15
    body_quality:
      total: 18
      auto_fixable: 10
    methodology_audit:
      total: 8
      auto_fixable: 0
    quality_gate:
      total: 5
      auto_fixable: 3
    directory_structure:
      total: 42
      auto_fixable: 42
```

### Step 4: 优先修复队列

按影响排序生成修复队列：

```yaml
priority_queue:
  p0:
    - skill: cbec-example-skill
      issue: S001 name格式错误
      impact: +3分
      fix_type: auto
  p1:
    - skill: mkt-example-skill
      issue: D004 缺少references/
      impact: +1分
      fix_type: auto
```

## 批量报告输出

### 文件命名

```
batch-eval-{timestamp}.yaml       # 完整汇总报告
batch-eval-{timestamp}-summary.md  # 人类可读摘要
```

### 报告位置

默认保存到评估目录的 `eval-reports/` 子目录。

## 与 lute-skills-doctor 的联动

批量评估发现的问题可通过 `lute-skills-doctor` 批量修复：

```bash
# 1. 批量评估，生成问题清单
/lute_skills_eval ./skills --batch --output-dir=./reports

# 2. 用 doctor 批量修复结构问题
python lute-skills-doctor/scripts/skill-doctor.py ./skills --batch

# 3. 重新评估验证
/lute_skills_eval ./skills --batch
```

## 性能建议

- 80 个 Skill 的批量评估预计耗时 5-10 分钟
- 建议每周执行一次批量评估作为健康检查
- 大型仓库（>100 Skills）可分批评估

---

**最后更新**: 2026-05-27
