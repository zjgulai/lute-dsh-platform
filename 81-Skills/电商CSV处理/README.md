# ecom-csv-processor

电商订单CSV数据预处理工具，支持字段映射、数据清洗、格式标准化。

## 快速开始

```bash
# 处理单平台CSV
使用 ecom-csv-processor: 处理淘宝订单CSV

# 多平台合并
使用 ecom-csv-processor: 合并淘宝+京东+拼多多CSV

# 数据质量检查
使用 ecom-csv-processor: 检查数据质量
```

## 功能特性

- **字段映射**: 自动识别常见平台字段格式
- **数据清洗**: 重复订单检测、异常值识别、缺失值处理
- **多平台合并**: 支持淘宝/京东/拼多多/抖音/自建站
- **数据质量报告**: 生成详细的数据质量分析报告

## 标准输出字段

- `order_id`: 订单号
- `order_date`: 订单日期 (YYYY-MM-DD)
- `amount`: 订单金额
- `sku_id`: SKU编号
- `sku_name`: SKU名称
- `quantity`: 数量
- `platform`: 平台来源

## 依赖

- 父技能: ecom-main-hub
- 相关技能: ecom-daily-report, ecom-monthly-review, ecom-promo-analysis
