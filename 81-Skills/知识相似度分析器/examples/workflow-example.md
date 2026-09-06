# 知识相似度分析器 - 工作流示例

## 场景：知识库去重

假设你有一个包含 5 条知识单元的知识库，其中存在重复和冲突，需要做相似度分析。

### 输入数据

```json
{
  "skus": [
    {
      "id": "sku-001",
      "applicable_objective": "计算物流成本",
      "core_logic": "获取运输距离、重量、体积 → 查询承运商费率表 → 计算总成本",
      "expected_output": "运费金额（元）",
      "tags": ["物流", "成本", "计算"]
    },
    {
      "id": "sku-002",
      "applicable_objective": "估算物流运费",
      "core_logic": "获取运输距离、重量、体积 → 查询承运商费率表 → 计算总成本",
      "expected_output": "预估运费（元）",
      "tags": ["物流", "成本", "估算"]
    },
    {
      "id": "sku-003",
      "applicable_objective": "计算物流成本",
      "core_logic": "获取运输距离、重量 → 查询快递费率 → 计算快递费",
      "expected_output": "快递费（元）",
      "tags": ["物流", "成本"]
    },
    {
      "id": "sku-004",
      "applicable_objective": "计算物流成本",
      "core_logic": "获取运输距离、重量 → 协商承运商折扣 → 最低运费",
      "expected_output": "最低运费（元）",
      "tags": ["物流", "谈判", "折扣"]
    },
    {
      "id": "sku-005",
      "applicable_objective": "评估供应商资质",
      "core_logic": "收集供应商资质文件 → 检查认证 → 评估评级",
      "expected_output": "供应商评级（A/B/C）",
      "tags": ["供应商", "评估", "资质"]
    }
  ]
}
```

### 分析结果

```json
{
  "summary": {
    "total_skus": 5,
    "total_pairs_analyzed": 10,
    "duplicate_pairs": 1,
    "conflict_pairs": 1,
    "related_pairs": 2,
    "independent_pairs": 6
  },
  "duplicate_groups": [["sku-001", "sku-002"]],
  "conflict_groups": [["sku-001", "sku-004"]],
  "pairs": [
    {
      "sku1_id": "sku-001", "sku2_id": "sku-002",
      "similarities": {"anchor": 0.92, "logic": 0.88, "outcome": 0.95},
      "relationship": "DUPLICATE"
    },
    {
      "sku1_id": "sku-001", "sku2_id": "sku-003",
      "similarities": {"anchor": 0.95, "logic": 0.65, "outcome": 0.78},
      "relationship": "RELATED"
    },
    {
      "sku1_id": "sku-001", "sku2_id": "sku-004",
      "similarities": {"anchor": 0.88, "logic": 0.42, "outcome": 0.25},
      "relationship": "CONFLICT"
    },
    {
      "sku1_id": "sku-001", "sku2_id": "sku-005",
      "similarities": {"anchor": 0.05, "logic": 0.02, "outcome": 0.00},
      "relationship": "INDEPENDENT"
    }
  ]
}
```

### 执行动作

1. **重复合并**：sku-001 和 sku-002 合并为一条，保留更完整的表述
2. **冲突标记**：sku-001 和 sku-004 标记为冲突，创建分支逻辑（何时用直接费率、何时用协商折扣）
3. **关联建立**：sku-001 和 sku-003 建立 RELATED 关联边

## 使用 CLI 工具

```bash
# 安装依赖
pip install numpy

# 批量分析
python scripts/run.py --input skus.json --format text

# 指定阈值
python scripts/run.py --input skus.json --thresholds '{"high": 0.9, "medium": 0.5, "low": 0.3}'

# 分析特定配对
python scripts/run.py --input skus.json --pair 0 1 --format json
```