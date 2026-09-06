# GEO优化器 端到端示例

本文给出 Product Schema 与 FAQ Schema 的完整生成示例，与 `references/schema_generator/` 与 `scripts/run.py` 输出对齐。

## 1. Product Schema 输入（product.json）

```json
{
  "name": "YourBrand Pro 无线降噪耳机",
  "description": "40 小时续航无线降噪耳机，支持 ANC 主动降噪。",
  "image": "https://example.com/product.jpg",
  "sku": "YB-PRO-001",
  "brand": { "name": "YourBrand" },
  "offers": {
    "price": "149.00",
    "priceCurrency": "USD",
    "availability": "in_stock"
  },
  "aggregateRating": { "ratingValue": 4.8, "reviewCount": 2400 }
}
```

生成命令：

```bash
python3 scripts/run.py --product product.json --format pretty
```

输出（JSON-LD，略去 `@context` 缩进）：

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "YourBrand Pro 无线降噪耳机",
  "sku": "YB-PRO-001",
  "brand": { "@type": "Brand", "name": "YourBrand" },
  "offers": {
    "@type": "Offer",
    "priceCurrency": "USD",
    "price": "149.00",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.8,
    "reviewCount": 2400
  }
}
```

## 2. FAQ Schema 输入（faqs.json）

```json
[
  { "question": "电池续航多久？", "answer": "连续播放 40 小时。" },
  { "question": "支持主动降噪吗？", "answer": "支持，内置 ANC Pro 技术。" }
]
```

生成命令：

```bash
python3 scripts/run.py --faqs faqs.json --format pretty
```

输出：

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "电池续航多久？",
      "acceptedAnswer": { "@type": "Answer", "text": "连续播放 40 小时。" }
    },
    {
      "@type": "Question",
      "name": "支持主动降噪吗？",
      "acceptedAnswer": { "@type": "Answer", "text": "支持，内置 ANC Pro 技术。" }
    }
  ]
}
```

## 3. AI 搜索可见性检查（Mock 适配器）

```python
from platforms import create_geo_checker

checker = create_geo_checker(use_mock=True)
results = checker.check_all('https://example.com/products/wireless-earbuds-pro', 'best wireless earbuds')
for platform, report in results.items():
    if report and report.is_visible:
        print(f"{platform}: 位置 #{report.position}")
```
