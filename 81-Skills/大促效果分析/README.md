# 大促效果分析

电商大促活动效果分析工具，输入活动期订单CSV，输出活动效果评估、ROI分析、流量转化分析、优化建议。

## 快速开始

```bash
# 活动效果评估
python3 scripts/run.py --input orders.csv \
  --campaign-config '{"dates": {"pre_heat": ["2026-03-01","2026-03-03"], "peak": ["2026-03-04","2026-03-06"], "return": ["2026-03-07","2026-03-08"]}}'

# ROI 分析（含成本）
python3 scripts/run.py --input orders.csv \
  --campaign-config '{"dates": {...}, "costs": {"ad_spend": 680000, "discount_cost": 852000}}' \
  --format json
```

## 功能特性

- **活动效果评估**: 销售额达成、订单量增长、客单价变化、新客获取
- **ROI深度分析**: 投入产出比、流量成本、促销折扣成本、净利润估算
- **流量转化分析**: 流量来源分布、各渠道转化率、转化漏斗
- **时段与节奏分析**: 预热期/爆发期/返场期对比、峰值分析

## 输入要求

- 活动期订单CSV（含活动标记）
- 活动前同期数据（对比基准）
- 活动投入成本数据
- 活动目标设定

## 输出内容

- 活动效果评估报告
- ROI计算与分析
- 流量与转化分析
- 活动优化建议

## 依赖

- Python 3.8+，pandas（`pip install pandas`）

## License

MIT
