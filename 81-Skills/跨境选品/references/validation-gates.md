---
title: Cross Border Product Selection Validation Gates
doc_type: workflow
module: cross-border-product-selection
topic: validation-gates
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Validation Gates

## Gate 1：Access And Scope

- 目标 URL 可访问。
- 数据是公开或用户授权范围内。
- 不绕过登录、验证码、风控或平台限制。
- 已定义入口类型：keyword、category/ranking page、ASIN list。
- 非 Amazon detail page 可作为 `detail_page` 输入，但必须记录平台 product id。

失败则停止。

## Gate 2：Detail Page First

- listing page 只记录 ASIN 或 platform product id、入口排名和来源 URL。
- 每个 ASIN 或 platform product id 必须进入 detail page。
- 最终字段不得只来自 listing page。

失败则停止。

## Gate 3：SKU Expansion

- 每个 variant 独立成行。
- SKU count 等于所有 variant count 之和。
- 每个 SKU 必须有独立属性组合。

失败则停止。

## Gate 4：Required Fields

核心字段不得为空：

- product_id
- product_title
- detail_url
- sku_id
- variant_attributes
- price
- rating
- review_count
- image_url
- source_url

缺失则停止，除非字段在页面上明确不存在并写入 Notes。

## Gate 5：Image Verification

- 不得从 ASIN 拼接图片 URL。
- 图片 URL 必须来自页面或结构化数据。
- 可访问时执行 HTTP HEAD 或等价验证。
- 无法验证时标注 `image_unverified`，不得标为有效。

## Gate 6：Output Integrity

- JSON 可解析。
- CSV 行数等于 SKU 数。
- 必填字段完整率达到 100%，或明确停止。
- Notes 包含失败 ASIN 和原因。
