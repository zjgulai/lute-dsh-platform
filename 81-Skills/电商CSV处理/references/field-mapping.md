# 平台字段映射规则

本文件记录电商订单 CSV 各平台的字段映射规则，供字段映射与标准化时查阅。

## 标准字段

order_id / order_date / order_time / amount / sku_id / sku_name / quantity / customer_id / province / city / platform / is_promo

## 淘宝

| 原始字段 | 标准字段 |
|---------|---------|
| 订单编号 | order_id |
| 买家会员名 | customer_id |
| 订单创建时间 | order_date |
| 付款时间 | order_date |
| 订单金额(元) | amount |
| 实付金额 | amount |
| 商品标题 | sku_name |
| 商品编码 | sku_id |
| 购买数量 | quantity |
| 收货省份 | province |
| 收货城市 | city |
| 订单状态 | order_status |

## 京东

| 原始字段 | 标准字段 |
|---------|---------|
| 京东订单号 | order_id |
| 下单时间 | order_date |
| 商品名称 | sku_name |
| 商品编号 | sku_id |
| 数量 | quantity |
| 实付金额 | amount |
| 收件人省份 | province |
| 收件人城市 | city |
| 买家昵称 | customer_id |

## 拼多多

| 原始字段 | 标准字段 |
|---------|---------|
| 订单号 | order_id |
| 商品 | sku_name |
| 商品ID | sku_id |
| 数量 | quantity |
| 实付金额 | amount |
| 收货人 | customer_id |
| 省 | province |
| 市 | city |
| 下单时间 | order_date |

## 抖音

| 原始字段 | 标准字段 |
|---------|---------|
| 订单ID | order_id |
| 商品名称 | sku_name |
| 下单时间 | order_date |
| 商家 | platform |
| 实付金额 | amount |
| 数量 | quantity |
| 收货人手机号 | customer_id |

## Amazon

| 原始字段 | 标准字段 |
|---------|---------|
| order-id | order_id |
| purchase-date | order_date |
| product-name | sku_name |
| asin | sku_id |
| quantity | quantity |
| item-price | amount |
| buyer-email | customer_id |

## Shopify

| 原始字段 | 标准字段 |
|---------|---------|
| Name | order_id |
| Created at | order_date |
| Lineitem name | sku_name |
| Lineitem sku | sku_id |
| Lineitem quantity | quantity |
| Total | amount |
| Email | customer_id |

## 异常检测规则

- 测试/刷单订单：金额 ≈ 0.01 元
- 负金额：amount < 0
- 超大金额：amount > 100000
- 缺失金额：amount 为空
- 重复订单：order_id 完全重复
