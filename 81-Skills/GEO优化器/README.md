# SEO GEO Optimizer - GEO/AI搜索优化工具

提供AI搜索结果占位、Product Schema优化、AI Shopping可见性提升、结构化数据生成等AI时代SEO方案。

## 快速开始

### 使用 Mock 适配器(无需配置)

```python
from platforms import create_geo_checker

# Mock 适配器始终可用
checker = create_geo_checker(use_mock=True)
results = checker.check_all('https://example.com', 'best wireless earbuds')
```

### 生成结构化数据

```python
from schema_generator import ProductSchema

product = ProductSchema({
    'name': 'YourBrand Pro Wireless Earbuds',
    'description': '40-hour battery life wireless earbuds',
    'offers': {'price': '149.00', 'currency': 'USD'}
})
print(product.to_json_ld())
```

## 核心功能

- **AI搜索优化(GEO)**: AI Overview占位、生成式搜索优化、Featured Snippet
- **Product Schema优化**: 产品结构化数据、价格/库存/评价标记
- **AI Shopping可见性**: Google Shopping优化、产品feed优化
- **多模态搜索**: 图片搜索、视频内容、语音搜索适配

## 平台适配器

| 适配器 | 类型 | 配置要求 |
|--------|------|---------|
| google_sge | API | GOOGLE_SEARCH_CONSOLE_API_KEY |
| bing_copilot | API | BING_SEARCH_API_KEY |
| mock_* | 内置 | 无(模拟数据) |

## 输入输出

**输入**:
- 产品/页面信息
- 目标AI平台(Google SGE/Bing Copilot等)
- 当前Schema标记(如有)

**输出**:
- Schema标记方案
- AI优化建议
- 结构化数据代码
- AI可见性提升策略

## 关联 Skills

- 父级: [seo-main-hub](../seo-main-hub)
- 相关: [seo-technical-audit](../seo-technical-audit), [seo-content-optimizer](../seo-content-optimizer)

## 使用场景

- AI搜索可见性优化
- AI Shopping占位
- 生成式引擎优化
- 语音搜索优化

## 注意事项

1. Google SGE和Bing Copilot需要API密钥
2. Mock数据用于测试，不反映真实可见性
3. 生成的Schema建议用Google Rich Results Test验证
4. GEO优化需定期复查，建议每月检查
