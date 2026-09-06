# 订单CSV标准字段指南

## 标准字段
- order_id (订单号): 唯一标识每笔订单
- order_date (日期): YYYY-MM-DD 格式的订单日期
- order_amount (金额): 订单实付金额
- product_name / product_id (SKU): 商品名称或编码
- quantity (数量): 购买数量

## 常见列名映射
| 标准字段 | 常见别名 |
|---|---|
| order_id | 订单编号、订单号、order_id、Name、京东订单号 |
| order_amount | 订单金额、金额、实付金额、amount、Total、item-price |
| order_date | 订单日期、日期、创建时间、下单时间、date、Created at |
| customer_id | 客户、会员、customer、buyer-email、Email |
| product_name | 商品名称、商品标题、product、sku |
| product_id | 商品编码、SKU ID、sku_id、asin |
| quantity | 数量、quantity、qty、购买数量 |
