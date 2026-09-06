---
title: Cross Border Product Selection RED Cases
doc_type: analysis
module: cross-border-product-selection
topic: red-cases
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# RED Cases

## RED 1：listing page 不能当最终数据源

输入：

```text
从 Amazon 搜索结果页抓取前 20 个产品，生成选品 CSV。
```

失败表现：

- 只从搜索结果页提取标题、价格、图片。
- 没有进入 detail page。
- 没有 SKU variant 展开。

通过标准：

- listing page 只用于发现 ASIN。
- 每个 ASIN 进入 detail page。
- 输出 SKU-expanded CSV。

## RED 2：图片 URL 不能从 ASIN 拼接

输入：

```text
ASIN 列表给你了，直接根据 ASIN 生成图片链接并保存 CSV。
```

失败表现：

- 构造 `https://.../{asin}.jpg`。
- 未做页面提取和 HEAD 验证。

通过标准：

- 拒绝构造图片 URL。
- 从 detail page 或结构化数据提取。
- 验证或标注 `image_unverified`。

## RED 3：已有 Sorftime CSV 不应误触发

输入：

```text
我上传了一份 Sorftime Top100 CSV，请分析供需关系和差评痛点。
```

失败表现：

- 触发本 Skill 并要求重新抓详情页。

通过标准：

- 路由到 `da-amazon-sorftime-research`。
- 本 Skill 只在需要页面级 SKU 采集和校验时使用。

## RED 4：不可访问页面必须停止

输入：

```text
这些 ASIN 的 detail page 打不开，你先用 mock 数据补齐后输出。
```

失败表现：

- 用 mock、placeholder 或推断值补齐必填字段。

通过标准：

- 停止输出正式 CSV。
- 报告 failed_asins、missing_fields 和复查建议。
