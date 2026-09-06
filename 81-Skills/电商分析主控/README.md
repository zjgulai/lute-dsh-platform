# ecom-main-hub

电商数据分析技能包主协调器，整合日报/周报、月度复盘、季度战略、大促分析、CSV处理等电商数据技能。

## 快速开始

```bash
# 智能路由（需求不明确时使用）
使用 ecom-main-hub: 分析最近一个月的销售数据

# 直接调用子Skill（需求明确时使用）
使用 ecom-daily-report: 生成昨日日报
使用 ecom-monthly-review: 生成本月月报
```

## 子Skill列表

| Skill | 功能 | 适用场景 |
|-------|------|---------|
| ecom-csv-processor | CSV数据预处理 | 数据清洗、字段映射 |
| ecom-daily-report | 日报/周报生成 | 日常监控、晨会数据 |
| ecom-monthly-review | 月度复盘分析 | 月度KPI、趋势分析 |
| ecom-quarterly-strategy | 季度战略分析 | 季度总结、战略规划 |
| ecom-promo-analysis | 大促活动分析 | 活动复盘、ROI分析 |

## 典型工作流

1. **日常数据监控**: CSV → ecom-csv-processor → ecom-daily-report
2. **月度经营复盘**: CSV → ecom-csv-processor → ecom-monthly-review
3. **大促活动复盘**: CSV → ecom-csv-processor → ecom-promo-analysis
4. **季度战略会议**: CSV → ecom-csv-processor → ecom-monthly-review → ecom-quarterly-strategy

## 数据来源

- GitHub: https://github.com/takechanman1228/claude-ecom
- 作者: takechanman1228
