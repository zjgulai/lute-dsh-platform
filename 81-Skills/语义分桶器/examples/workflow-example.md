# 完整工作流示例

以下是从 SKU 输入到分桶报告输出的完整流程。

## 输入 SKU 数据

```json
[
  {
    "id": "sku-001",
    "context": {"applicable_objects": ["pdf", "docx"]},
    "custom_attributes": {"domain_tags": ["finance", "legal"]},
    "core_logic": {"logic_type": "extraction"}
  },
  {
    "id": "sku-002",
    "context": {"applicable_objects": ["pdf", "docx"]},
    "custom_attributes": {"domain_tags": ["finance", "legal"]},
    "core_logic": {"logic_type": "classification"}
  },
  {
    "id": "sku-003",
    "context": {"applicable_objects": ["csv", "json"]},
    "custom_attributes": {"domain_tags": ["medical"]},
    "core_logic": {"logic_type": "summarization"}
  },
  {
    "id": "sku-004",
    "context": {"applicable_objects": ["csv", "json"]},
    "custom_attributes": {"domain_tags": ["medical"]},
    "core_logic": {"logic_type": "generation"}
  }
]
```

## 执行分桶

```bash
python scripts/run.py --input skus.json --threshold 0.5 --output buckets.json --pretty
```

## 输出报告（buckets.json）

```json
{
  "buckets": [
    {
      "bucket_id": "bucket-0",
      "sku_ids": ["sku-001", "sku-002"],
      "size": 2,
      "shared_features": ["pdf", "docx", "finance", "legal"],
      "feature_union": ["pdf", "docx", "finance", "legal", "type:extraction", "type:classification"],
      "cohesion": 0.857
    },
    {
      "bucket_id": "bucket-1",
      "sku_ids": ["sku-003", "sku-004"],
      "size": 2,
      "shared_features": ["csv", "json", "medical"],
      "feature_union": ["csv", "json", "medical", "type:summarization", "type:generation"],
      "cohesion": 0.857
    }
  ],
  "statistics": {
    "total_skus": 4,
    "total_buckets": 2,
    "avg_bucket_size": 2.0,
    "max_bucket_size": 2,
    "singletons": 0
  }
}
```

## 结果解读

- sku-001 和 sku-002 共享 pdf/docx/finance/legal 特征，逻辑类型不同（extraction vs classification），但归入同桶 —— 说明逻辑类型不是强区分特征
- sku-003 和 sku-004 共享 csv/json/medical，归入另一个桶
- 两个桶之间无共享特征，边界清晰，无传递关系
- cohesion 均为 0.857，桶内聚度高

## 大桶细分示例

若某桶超过 max_bucket_size（如 32），系统自动将阈值提高到 1.5 倍重新分桶，递归直到所有桶都 ≤ 32。
