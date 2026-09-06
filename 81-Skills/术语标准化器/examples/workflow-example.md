# 术语标准化工作流示例

## 场景

某电商公司整合来自三个来源的商品数据，需要统一「适用对象」和「领域标签」两类字段。

## 输入数据

```json
{
  "skus": [
    {
      "id": "sku-001",
      "context": {"applicable_objects": ["财务分析", "财务报表"]},
      "custom_attributes": {"domain_tags": ["financial analysis", "财务分析"]}
    },
    {
      "id": "sku-002",
      "context": {"applicable_objects": ["Financial Statements", "财务报表"]},
      "custom_attributes": {"domain_tags": ["财报分析", "比率分析"]}
    }
  ],
  "config": {
    "fields": ["applicable_objects", "domain_tags"],
    "strategies": {"applicable_objects": "STRICT", "domain_tags": "FLEXIBLE"},
    "language": "zh",
    "case_sensitive": false
  }
}
```

## 处理步骤

1. **收集术语**：从两个 SKU 中提取 applicable_objects 和 domain_tags 的唯一值
2. **策略选择**：applicable_objects 用 STRICT，domain_tags 用 FLEXIBLE
3. **LLM 标准化**：
   - STRICT 合并「财务报表」与「Financial Statements」（同一概念）
   - FLEXIBLE 合并「财务分析」「financial analysis」「财报分析」（同义词+中英对照）
4. **应用映射**：将映射表应用到所有 SKU
5. **冲突检测**：检查一对多映射，合并数>3的来源可疑

## 输出结果

```json
{
  "mappings": {
    "applicable_objects": {
      "财务报表": "财务报表",
      "Financial Statements": "财务报表"
    },
    "domain_tags": {
      "财务分析": "财务分析",
      "financial analysis": "财务分析",
      "财报分析": "财务分析"
    }
  },
  "statistics": {
    "total_terms": 6,
    "unique_terms": 3,
    "reduction_rate": 0.50
  },
  "conflicts": []
}
```

## 关键观察

1. applicable_objects 中「财务报表」和「财务分析」未被合并（不同概念，STRICT 模式正确）
2. domain_tags 中「财务分析」「financial analysis」「财报分析」被正确合并（FLEXIBLE 模式）
3. 缩减率 50%，在合理范围（20-40% 稍高，因为样本量小）