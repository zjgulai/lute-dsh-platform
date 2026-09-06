# 库存预测示例 / Forecast Example

## 示例数据

以下是可用于测试库存预测的示例CSV数据格式：

```csv
date,quantity
2026-01-01,450
2026-01-02,420
2026-01-03,510
2026-01-04,480
2026-01-05,530
2026-01-06,460
2026-01-07,490
```

## 运行脚本

```bash
# 基本补货计划
python3 scripts/run.py --input examples/sample-data.csv --product-id SKU-001 --lead-time 7 --periods 30

# 安全库存计算
python3 scripts/run.py --input examples/sample-data.csv --product-id SKU-001 --lead-time 14 --service-level 0.99 --safety-stock-only

# 大促备货
python3 scripts/run.py --input examples/sample-data.csv --product-id SKU-001 --lead-time 7 --promo-multiplier 3.5 --periods 30
```