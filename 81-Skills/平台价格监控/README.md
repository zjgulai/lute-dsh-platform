# ecom-platform-price-monitor

电商价格监控与竞争情报工具，监控Amazon、eBay、AliExpress等平台价格变化，支持预警、历史追踪和重定价数据输出。

## 快速开始

```bash
# 使用 Mock 模式测试
使用 ecom-platform-price-monitor: 测试 Mock 模式

# 添加监控产品
使用 ecom-platform-price-monitor: 添加 ASIN B08N5WRWNW

# 查看价格报告
使用 ecom-platform-price-monitor: 生成价格报告

# 导出CSV
使用 ecom-platform-price-monitor: 导出价格数据
```

## 功能特性

- **多平台监控**: Amazon、eBay、AliExpress
- **数据提供者架构**: 解耦外部依赖，支持API/Scraper/Mock
- **预警系统**: 价格下降、促销活动、竞品上新、库存变化
- **降级策略**: 缓存回退、Mock模式、跳过失败

## 支持的提供者

| 提供者 | 类型 | 状态 |
|--------|------|------|
| amazon | API | 需配置 |
| ebay | API | 需配置 |
| aliexpress | API | 需配置 |
| mock | Mock | 可用 |

## 配置

```yaml
# .skill-meta/data-providers.yaml
providers:
  amazon:
    type: api
    enabled: true
  ebay:
    type: api
    enabled: true
  mock:
    type: mock
    enabled: true
    fallback_enabled: true
```

## 数据来源

- GitHub: https://github.com/openclaw/skills/tree/main/skills/g4dr/ecommerce-price-monitor
- 所属组织: openclaw/skills
- 作者: g4dr
