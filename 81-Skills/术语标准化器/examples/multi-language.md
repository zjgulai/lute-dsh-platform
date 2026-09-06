# 示例：多语言术语标准化

## 场景

合并来自中英文两个文档的知识库，统一术语表达。

## 输入

**Doc A (中文)**:
```json
{
  "applicable_objects": ["财务报表", "利润表", "资产负债表"],
  "domain_tags": ["财务分析", "会计", "比率分析"]
}
```

**Doc B (English)**:
```json
{
  "applicable_objects": ["Financial Statements", "Income Statement", "Balance Sheet"],
  "domain_tags": ["financial analysis", "accounting", "ratio analysis"]
}
```

## 配置

```python
config = {
    "fields": ["applicable_objects", "domain_tags"],
    "strategies": {
        "applicable_objects": "STRICT",
        "domain_tags": "FLEXIBLE"
    },
    "language": "zh"  # 标准术语使用中文
}
```

## 处理过程

### Step 1: 收集术语

```python
all_objects = [
    "财务报表", "利润表", "资产负债表",
    "Financial Statements", "Income Statement", "Balance Sheet"
]

all_tags = [
    "财务分析", "会计", "比率分析",
    "financial analysis", "accounting", "ratio analysis"
]
```

### Step 2: 标准化

#### applicable_objects (STRICT)

经过 LLM 分析：
- "财务报表" = "Financial Statements" ✅ （同一概念）
- "利润表" = "Income Statement" ✅ （同一概念）
- "资产负债表" = "Balance Sheet" ✅ （同一概念）

映射表：
```json
{
  "财务报表": "财务报表",
  "Financial Statements": "财务报表",
  "利润表": "利润表",
  "Income Statement": "利润表",
  "资产负债表": "资产负债表",
  "Balance Sheet": "资产负债表"
}
```

#### domain_tags (FLEXIBLE)

经过 LLM 分析：
- "财务分析" = "financial analysis" ✅ （中英对照）
- "会计" = "accounting" ✅ （中英对照）
- "比率分析" = "ratio analysis" ✅ （中英对照）

映射表：
```json
{
  "财务分析": "财务分析",
  "financial analysis": "财务分析",
  "会计": "会计",
  "accounting": "会计",
  "比率分析": "比率分析",
  "ratio analysis": "比率分析"
}
```

### Step 3: 应用映射

**Doc A 标准化后**:
```json
{
  "applicable_objects": ["财务报表", "利润表", "资产负债表"],
  "domain_tags": ["财务分析", "会计", "比率分析"]
}
```

**Doc B 标准化后**:
```json
{
  "applicable_objects": ["财务报表", "利润表", "资产负债表"],
  "domain_tags": ["财务分析", "会计", "比率分析"]
}
```

## 输出统计

```json
{
  "statistics": {
    "total_terms": 12,
    "unique_terms": 6,
    "reduction_rate": 0.50,
    "fields_normalized": {
      "applicable_objects": {
        "before": 6,
        "after": 3
      },
      "domain_tags": {
        "before": 6,
        "after": 3
      }
    }
  }
}
```

## 关键观察

1. **双语统一**: 中英文术语统一为中文（根据配置）
2. **策略差异**: Objects 和 Tags 都可以用 FLEXIBLE，但 Objects 使用 STRICT 更保险
3. **可追溯**: 保留映射表，可以反向查找原始术语
