# SEO Main Hub - SEO与GEO优化主协调器

整合技术SEO审计、内容优化、竞品分析、多语言SEO、AI搜索优化五大模块。

## 快速开始

### 方式一：直接调用子模块

```
# 技术诊断
使用 seo-technical-audit: https://example.com

# 内容优化
使用 seo-content-optimizer: 页面URL + 目标关键词

# 竞品分析
使用 seo-competitor-analyzer: 我的网站 + 竞品列表
```

### 方式二：协调器智能路由

```
我需要提升独立站的自然流量
→ 协调器分析需求
→ 建议调用 技术审计 + 内容优化 + 竞品分析
→ 输出整合优化方案
```

## 子 Skills

| 模块 | Skill | 核心功能 | 适用场景 |
|------|-------|---------|---------|
| 技术SEO | [seo-technical-audit](./seo-technical-audit) | 网站结构、性能、索引诊断 | 网站技术问题 |
| 内容优化 | [seo-content-optimizer](./seo-content-optimizer) | 关键词、Title/Meta、内容质量 | 页面级优化 |
| 竞品分析 | [seo-competitor-analyzer](./seo-competitor-analyzer) | 竞品对比、关键词差距、外链 | 竞争情报 |
| 多语言SEO | [seo-multilingual](./seo-multilingual) | hreflang、多语言架构 | 跨境多语言站点 |
| GEO/AI优化 | [seo-geo-optimizer](./seo-geo-optimizer) | AI搜索、Schema、AI Shopping | AI时代搜索可见性 |

## 典型工作流

### 新站SEO启动
```
seo-technical-audit → seo-content-optimizer → seo-competitor-analyzer → seo-geo-optimizer
```

### 跨境电商多语言SEO
```
seo-multilingual → seo-content-optimizer → seo-technical-audit
```

### 全面SEO审计
```
并行: seo-technical-audit + seo-content-optimizer + seo-competitor-analyzer
→ 整合输出SEO优化路线图
```

## 模块选择指南

| 你的需求 | 推荐模块 | 输入 |
|---------|---------|------|
| 网站速度慢 | seo-technical-audit | 网站URL |
| 关键词排名差 | seo-content-optimizer | 页面URL + 关键词 |
| 想了解竞品策略 | seo-competitor-analyzer | 竞品URL |
| 做多语言站点 | seo-multilingual | 多语言页面列表 |
| AI搜索不可见 | seo-geo-optimizer | 产品/页面信息 |

## 注意事项

1. 建议优先进行技术审计，再优化内容
2. 多模块分析时确保数据基准一致
3. SEO是长期工作，按优先级分阶段执行
4. 定期复查，根据数据调整策略
