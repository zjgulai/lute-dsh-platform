# 完整示例

## 输入（price_data.json）

```json
{
  "XYZ-BT-SPK": {
    "amazon": {"price": 49.99, "list_price": 59.99},
    "ebay": {"price": 45.99, "list_price": 54.99},
    "walmart": {"price": 47.99, "list_price": 52.99}
  }
}
```

## 运行

```bash
python3 scripts/run.py --input price_data.json --format text
```

## 输出（节选）

```
--- Cross-Platform Price Analysis (1 products) ---
  [XYZ-BT-SPK] Platforms: 3 | Min: $45.99 | Max: $49.99 | Avg: $47.99 | Spread: $4.00
```

## 建议

- 出现 MAP 违规时先与供应商沟通，再决定是否下架。
- 竞品降价 ≥ 10% 时评估是否跟进或走差异化策略。
