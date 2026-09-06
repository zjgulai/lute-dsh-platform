# 工作流编排示例

本文件提供 电商分析主控 的典型多步分析编排示例。

## 示例1：日常数据监控（1-7天）

```
输入: 昨日订单CSV
步骤:
1. ecom-csv-processor 预处理（清洗、字段统一）
2. ecom-daily-report 生成日报
输出: 日报（销售额、订单量、退货率、异常预警）
```

## 示例2：月度经营复盘（30天）

```
输入: 30天订单CSV + 上月对比数据
步骤:
1. ecom-csv-processor 预处理
2. ecom-monthly-review 月度复盘（KPI、趋势、问题诊断）
输出: 月度复盘报告
```

## 示例3：大促活动复盘（活动期）

```
输入: 活动期订单CSV + 成本数据
步骤:
1. ecom-csv-processor 预处理
2. ecom-promo-analysis 活动分析（ROI、流量转化、促销优化）
输出: 活动效果报告
```

## 示例4：季度战略会议（90天）

```
输入: 90天订单CSV
步骤:
1. ecom-csv-processor 预处理
2. ecom-monthly-review 月报×3（按月拆解）
3. ecom-quarterly-strategy 季度战略（总结、规划、年度对比）
输出: 季度战略报告
```
