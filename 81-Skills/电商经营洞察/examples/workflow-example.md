# 完整经营复盘工作流示例

本文件为「电商经营洞察」的渐进式披露材料，展示从 CSV 输入到 REVIEW.md 报告产出的完整工作流。

## 场景

用户提供一份电商订单 CSV，要求做 90 天经营复盘。

## 输入

```csv
Name,Created at,Lineitem name,Lineitem quantity,Total,Email
ORD-001,2026-01-05,Product A,2,158.00,cust1@example.com
ORD-002,2026-01-06,Product B,1,72.00,cust2@example.com
...
```

分析周期：90 天（2026-01-01 至 2026-03-31）

## 工作流步骤

### Step 1: 字段识别

识别核心列：`Name`→order_id、`Created at`→order_date、`Lineitem name`→product_name、`Lineitem quantity`→quantity、`Total`→order_amount、`Email`→customer_id。

### Step 2: 数据质量门槛检查

- 日期可解析 ✅
- 金额字段完整 ✅
- 客户 ID 存在 ✅（Email 可作为客户 ID）
- 样本量充足 ✅

### Step 3: 确定性计算

先算出可复核数字（GMV、订单数、AOV、复购率、退款金额），再生成报告。

### Step 4: 生成 REVIEW.md 报告

```markdown
# E-Commerce Business Review

## Executive Summary
90 天 GMV $1.2M（↑15% vs 上季），转化率 12.3%（↓0.5pp vs 目标），AOV $45.6（↑8%）。

## Data Scope and Quality Gate
- 总行数：12,500
- 可解析：12,480
- 缺客户 ID：0

## KPI Tree
| 层级 | 指标 | 值 |
|---|---|---|
| 北极星 | GMV | $1.2M |
| 增长来源 | Orders / AOV | 1,850 单 / $45.6 |
| 客户质量 | New vs Returning | 62% / 38% |
| 商品结构 | Top SKU | Product A ($320K) |

## 30d / 90d / 365d Trend Review
（多窗口趋势对比）

## Red / Green Signals
🔴 转化率低于目标：主因移动端体验问题
🟢 AOV 提升：捆绑销售策略奏效

## Root Cause Hypotheses
- Volume effect: 订单量变化贡献 +12%
- Price effect: 客单价变化贡献 +8%

## Priority Action Plan
1. 优化移动端结账流程
2. 扩大高转化产品库存
3. 调整广告预算分配

## Metrics to Recheck Next Cycle
- 验证数据完整性与字段映射
- 确认退款率计算口径一致性
```

## 边界处理示例

### 缺客户 ID 时
输入无 customer_id → 不计算复购率和新老客拆分，报告中明确标注「复购率 N/A（缺客户 ID）」。

### 缺订单金额时
输入无 order_amount → 不计算 GMV、AOV、渠道 ROI，只输出字段修复建议。

### 样本量过小时
输入 < 100 条 → 标注「低可信度」，不输出强结论。