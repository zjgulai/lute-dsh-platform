---
title: Cross Border Product Selection Workflow Example
doc_type: analysis
module: cross-border-product-selection
topic: workflow-example
status: stable
created: 2026-09-03
updated: 2026-09-03
owner: self
source: human+ai
---

# 完整采集工作流示例

## 输入

```text
ASIN list: B0B1234567, B0B2345678, B0B3456789
目标：跨境选品 SKU 级采集，输出 JSON + CSV
```

## Step 1：判断入口类型

类型 = `asin_list`。三个 ASIN 均为合法格式（`^[A-Z0-9]{10}$`）。

## Step 2：提取候选 ASIN + 记录来源

- `B0B1234567` → 来源 `asin_list`
- `B0B2345678` → 来源 `asin_list`
- `B0B3456789` → 来源 `asin_list`

## Step 3：逐个进入 detail page

每个 ASIN 进入详情页提取字段：product_id、product_title、detail_url、brand、rating、review_count、selling_points、specs。

## Step 4：展开 SKU variants

`B0B1234567` 有 3 个颜色 × 2 个尺寸 = 6 个变体，每个变体独立 primary：
- `B0B1234567_black_m` → price=29.99, image=页面结构化数据 URL
- `B0B1234567_white_m` → price=31.99, image=页面结构化数据 URL
- …

## Step 5：硬校验

- Gate 4 必填字段完整率 100%。
- SKU count = 6（= variant count 之和）。
- 图片 URL 来自页面结构化数据，HEAD 验证 200。

## Step 6：输出

- `products.json`：产品级聚合。
- `sku_expanded.csv`：6 行 SKU。

## Step 7：Notes

- `failed_asins: [B0B3456789]`（详情页不可访问，停止并记录）
- `missing_fields: []`
- `image_verification_failures: []`

## 失败与拒绝示例

- 详情页不可访问 → 停止该 ASIN，不 mock 补齐。
- 用户要求绕过登录 → 拒绝，仅处理公开或授权数据。
- 用户要求从 ASIN 拼接图片 URL → 拒绝，须从页面提取。
