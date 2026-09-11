# momcozy M9 采集与校验报告（2026-09-06）

> 依据 cross-border-selection 的 detail-page-first 与 6 道校验门执行。站点为 momcozy 自有 DTC（Shopify），数据取自详情页自带 JSON-LD 与页面公开内容；未使用任何 mock/推断值。

## Run summary

| 项 | 值 |
| --- | --- |
| 入口 | `https://momcozy.com/collections/all` → sitemap → 详情页 |
| 详情页 | `https://momcozy.com/products/momcozy-mobile-flow-hands-free-breast-pump`（M9 旗舰泵） |
| Product 数 / SKU 数 | 1 / 4（Double×2 色 + Single×2 色） |
| 失败数 | 0 |
| 采集方式 | 站点公开 JSON-LD（Product）+ 公开页面；站点另提供 UCP 协议（`/.well-known/ucp`，search_catalog 需 agent profile，未使用） |

## 校验门结果

| Gate | 结果 |
| --- | --- |
| G1 访问 | HTTP 200 ✓ |
| G2 详情页优先 | 所有字段取自详情页 JSON-LD（非列表页）✓ |
| G3 SKU 展开 | 4 个变体独立行（`05-m9-sku-expanded.csv`），每行独立 price/sku/gtin/URL ✓ |
| G4 必填字段 | name/sku/price/currency/image/rating 全部非空 ✓ |
| G5 图片验证 | 主图 HEAD 200，image/jpeg，55217 bytes ✓（4 个变体共用同一主图，未做变体级图片验证 → 标注 image_unverified-per-variant） |
| G6 输出完整性 | JSON（`04-m9-collection.json`）+ CSV + 本报告 ✓ |

## 三组目标字段（真实数据）

| 组 | 字段 | 值 | 来源 |
| --- | --- | --- | --- |
| ① 名称+SKU | name | Momcozy Mobile Flow™ Hands-Free Breast Pump \| M9 | 详情页 JSON-LD |
| | sku（默认变体） | BP266-NR71BA-A | 详情页 JSON-LD（4 变体各有独立 SKU） |
| ② 价格+币种 | price | Double $215.99 / Single $135.99（USD） | 详情页 JSON-LD Offer |
| | priceValidUntil | 2026-09-16（到期后需复核） | 详情页 JSON-LD |
| ③ 主图+评分 | image | `.../cdn/shop/files/MomcozyMoblieFlow_BreastPump_7.jpg?...width=1024`（HEAD 200 ✓） | 详情页 JSON-LD |
| | aggregateRating | 4.7（654 条，best 5 / worst 1） | 详情页 JSON-LD |

## 产物

- `02-product-config.m9.json` — 真实配置（brand 已按 geo-optimizer 脚本契约改为对象）
- `02-product-config.template.json` — 模板同步修正 brand 契约
- `product-schema-m9.html` — 可注入页面的 Product JSON-LD（含 `<script>` 包裹）
- `product-schema-m9.jsonld` — 裸 JSON（供校验/程序使用）
- `04-m9-collection.json` — 采集原始结构化数据
- `05-m9-sku-expanded.csv` — SKU 展开表

## Notes

1. **脚本契约修正**：geo-optimizer `core.py` 的 `_normalize_availability` 对已是完整 URL 的值会双重前缀（`https://schema.org/https://schema.org/InStock`）——已修（`startswith("http")` 直接返回）。校验器对 image 数组报 warning（schema.org 允许数组，属校验器局限，非阻断；`is_valid: true`，0 errors）。
2. **次要价格未采用**：Offer 内 `priceSpecification.price`（Double 173 / Single 109）与主 price 不一致，疑似会员/订阅价，主价格采用 Offer.price，该差异列入未验证项。
3. **SKU 命名**：`BP266-*` 为 Shopify variant SKU（JSON-LD `sku` 字段），变体级 image 未逐个 HEAD 验证。
4. **站点 GEO 现状**：站点已有 Product/FAQPage/BreadcrumbList/Organization JSON-LD 与 `agents.md`（UCP 协议），本次 schema 与站点现有实现互补；如后续替换站点 schema，建议用 `product-schema-m9.html` 内容核对字段完整性。
