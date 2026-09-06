# ecom-monthly-review

电商月度复盘分析工具，输入30天订单CSV，输出月度KPI报告、趋势分析、环比对比、问题诊断。

## 快速开始

```bash
# 月度复盘
使用 ecom-monthly-review: 生成本月经营复盘

# KPI诊断
使用 ecom-monthly-review: 分析KPI完成情况

# 趋势分析
使用 ecom-monthly-review: 分析销售趋势
```

## 功能特性

- **KPI完整分析**: 销售额、订单量、客单价、转化率、复购率
- **趋势深度分析**: 日销售趋势、周中vs周末对比、季节性因素
- **环比对比**: 与上月同期对比、同比增长分析
- **问题诊断**: 未达标分析、异常波动原因、改进建议

## 输入要求

- 30天订单CSV文件
- 上月同期数据（用于环比）
- 月度目标设定值

## 输出内容

- 月度KPI报告
- 趋势分析图表（文本描述）
- 环比对比分析
- 问题诊断与建议

## 依赖

- 父技能: ecom-main-hub
- 相关技能: ecom-daily-report, ecom-quarterly-strategy, ecom-csv-processor
