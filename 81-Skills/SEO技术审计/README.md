# SEO Technical Audit - 技术SEO审计工具

支持多种审计引擎：Lighthouse、PageSpeed Insights API、自定义爬虫。提供网站结构分析、页面速度检测、移动端适配检查。

## 快速开始

### 使用 Custom Crawler(无需配置)

```python
from audit_engines import get_audit_engine

engine = get_audit_engine('custom_crawler')
report = engine.audit('https://example.com')
print(f"SEO Score: {report.scores.get('seo', 0)}")
```

### 使用 Lighthouse(推荐)

```bash
npm install -g lighthouse
```

```python
from audit_engines import get_audit_engine

engine = get_audit_engine('lighthouse')
report = engine.audit('https://example.com', preset='desktop')
print(f"Performance: {report.scores.get('performance', 0)}")
```

## 核心功能

- **网站结构审计**: URL结构、内部链接、Sitemap、robots.txt
- **页面性能分析**: Core Web Vitals、加载速度、资源优化
- **移动端适配**: 移动友好性、响应式设计、触控元素
- **索引与抓取**: 索引状态、爬虫预算、重复内容、重定向

## 审计引擎

| 引擎 | 类型 | 安装要求 |
|------|------|---------|
| lighthouse | 本地工具 | npm install -g lighthouse |
| pagespeed_insights | API | GOOGLE_PSI_API_KEY |
| custom_crawler | 内置 | 无 |

**降级链**: lighthouse → pagespeed_insights → custom_crawler

## 输入输出

**输入**:
- 目标网站URL
- 审计引擎选择(可选)
- API凭证(如使用PSI)

**输出**:
- 技术SEO审计报告
- 问题优先级清单
- 修复建议方案
- 性能优化指南

## 关联 Skills

- 父级: [seo-main-hub](../seo-main-hub)
- 相关: [seo-content-optimizer](../seo-content-optimizer), [seo-geo-optimizer](../seo-geo-optimizer)

## 使用场景

- 网站技术诊断
- Core Web Vitals优化
- 爬虫抓取优化
- 网站架构重构

## 注意事项

1. Lighthouse需要Node.js环境
2. PageSpeed Insights有每日配额限制
3. 引擎不可用时自动降级到Custom Crawler
4. SPA/JS渲染网站需要额外检查SSR
5. 建议每月复查一次
