# KPI 指标定义与计算口径

本文件为「电商经营洞察」的渐进式披露材料，存放 KPI 指标定义、计算口径与边界条件。

## 核心指标

### GMV（总销售额）
- **公式**：Σ(订单金额)（含退款/取消的订单金额）
- **口径**：按订单创建时间，不做退款剔除
- **参考字段**：`order_amount`（或 `Total`、`revenue`）

### Net Revenue（净收入）
- **公式**：GMV - 退款金额
- **口径**：退款以 `is_refunded` 字段标记为准；无退款字段时不拆分
- **参考字段**：`is_refunded`、`refund_amount`

### Orders（订单数）
- **公式**：COUNT(order_id)
- **口径**：不含取消订单（如有 `status` 字段）；缺少状态字段时默认全量计入

### AOV（客单价）
- **公式**：GMV / Orders
- **口径**：退货订单不计入分母（如可区分）；无客户维度时，Orders 指订单行

### Conversion Rate（转化率）
- **公式**：Orders / Visitors
- **口径**：需要流量数据（`visitors` 或 `sessions` 字段）；数据中没有流量时只分析订单侧 proxy

### Repeat Purchase Rate（复购率）
- **公式**：重复购买客户数 / 总客户数（或 老客订单数 / 总订单数）
- **口径**：需要客户 ID（`customer_id` 或 `Email`）；缺客户 ID 时标记为 N/A

### Retention Rate（留存率）
- **公式**：首单后 N 天内再次下单的客户数 / 首单客户数
- **口径**：需要客户 ID + 充足时间窗口（≥30d）；样本量不足时标注低可信度

### Refund Rate（退货率）
- **公式**：退款订单数 / 总订单数（或 退款金额 / GMV）
- **口径**：以 `is_refunded` 字段为准；无该字段时标记为 N/A

## 对比基准

所有百分比变化必须说明对比基准：
- **MoM（Month over Month）**：vs 上月同期
- **QoQ（Quarter over Quarter）**：vs 上季同期
- **YoY（Year over Year）**：vs 上年同期
- **vs Target**：vs 目标值

## 边界条件

- 样本量 < 100 条：标注低可信度，不输出强结论
- 时间窗口 < 7 天：引导到日报
- 时间窗口 > 90 天：引导到季度战略
- 日期字段不可解析：停止趋势和留存结论
- 缺客户 ID：不计算复购率和新老客拆分
- 缺订单金额：不计算 GMV、AOV