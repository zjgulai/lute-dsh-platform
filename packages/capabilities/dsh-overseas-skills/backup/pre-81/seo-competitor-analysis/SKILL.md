---
name: seo-competitor-analysis
title: "SEO竞争对手分析"
description: "- 执行深度 SEO 竞争对手分析，包括关键词研究、外链检查和内容策略映射。当用户想要分析网站竞争对手或通过研究竞争对手来提升自身 SEO 排名时使用。 边界：竞品关键词/外链/内容对标；发现新词走 seo-keyword-research"
disable-model-invocation: true
whenToUse: "竞品关键词/外链/内容对标；发现新词走 seo-keyword-research"
---


# SEO 竞争对手分析技能

此技能自动化识别和分析 SEO 竞争对手的过程，为内容和排名策略提供信息。

## 工作流程

1. **识别竞争对手**：如果未提供，搜索目标域名并识别在相似关键词上排名靠前的网站。
2. **分析关键词**：使用 `web_search` 查找排名关键词和搜索量（如果可通过摘要获取）。
3. **内容差距分析**：将用户的内容与竞争对手进行比较，识别缺失的主题。
4. **生成报告**：将发现总结为结构化报告。

## 使用工具

- `web_search`：用于查找竞争对手及其排名内容。
- `web_fetch`：用于从竞争对手页面提取内容进行深度分析。
- `browser`：用于需要 JavaScript 或手动导航模式的复杂页面。

## 脚本

- `scripts/competitor_finder.py`：（可选）使用搜索 API 自动发现竞争对手的逻辑。

## 参考资料

- `references/seo_metrics_guide.md`：SEO 术语定义及解读方法。
- `references/report_template.md`：最终 SEO 分析报告的标准结构。
