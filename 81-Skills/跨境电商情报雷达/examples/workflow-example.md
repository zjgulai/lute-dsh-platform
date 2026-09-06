---
title: 情报雷达工作流示例
doc_type: example
module: cbec-intelligence-radar
topic: workflow-example
status: stable
created: 2026-09-03
updated: 2026-09-03
owner: self
source: human+ai
---

# 情报雷达工作流示例

一个完整的日报生成执行示例，展示从需求确认到输出归档的标准流程。

## 场景

用户原话：「帮我生成一份今天的跨境电商 Claude Skills 情报日报，覆盖全部 6 个岗位方向。我没有资料提供，请自行搜索资料并作答。」

## 第一步：需求确认

| 参数 | 取值 | 依据 |
|------|------|------|
| 简报类型 | 日报 | 用户说「日报」 |
| 岗位范围 | 6 大岗位全量 | 用户说「覆盖全部 6 个岗位」 |
| 日期范围 | 最近 24-48 小时 | 日报默认值 |

## 第二步：分渠道搜索

按优先级执行（示例关键词）：

1. **P0 GitHub**：`"claude skills" ecommerce amazon 2026`、`"claude skills" cross-border supply chain`
2. **P1 中文社区**：知乎「Claude Skills 跨境电商」、知无不言「AI 亚马逊运营 Claude Skills」
3. **P2 国际社区**：Reddit `r/ClaudeCode claude skills ecommerce`、X `#ClaudeSkills Amazon seller`
4. **P3 平台**：ProductHunt「AI ecommerce tool」、SkillsMP「ecommerce skills」

## 第三步：信息提取与分类

把搜到的 Skills 按 6 大岗位分类，单一归属优先：

- 销售运营：Listing 优化类 Skill
- 数据洞察：选品分析类 Skill
- 产品企划：Tech Pack 生成类 Skill
- 品牌营销：品牌声音 / 文案类 Skill
- 供应链：FBA 费用 / 库存类 Skill
- GTM：ICP / 外联类 Skill

无动态岗位标注「今日暂无」。

## 第四步：结构化整理

填充 7 大板块（引用 `output-template.md`）：

1. Top 3 最热 Skills（按 D1-D5 评分）
2. GitHub Star 增长异常
3. 岗位专项动态
4. 实战案例速报
5. 风险提示
6. 明日值得关注
7. 检索关键词存档

## 第五步：输出与归档

1. 生成 Markdown 简报
2. 保存到 `drafts/analysis/skills-intelligence-daily-YYYYMMDD/`
3. 向用户汇报关键发现：Top 3 + 岗位动态摘要 + 风险提示

## 输出片段示例

```markdown
# Claude Skills 跨境电商每日简报

**日期**: 2026-09-03
**简报类型**: 日报
**覆盖岗位**: 销售运营 / 数据洞察 / 产品企划 / 品牌营销 / 供应链 / GTM

---

## 今日最热 Skills（Top 3）

### 1. amazon-listing-optimizer
- **所属岗位方向**: 销售运营 - Listing 优化
- **核心功能**: 优化 Amazon Listing 的标题、卖点与关键词布局
- **为什么今天热**: 近 3 天发布 v2.1.0 版本更新（D1 +5）

### 2. competitive-intelligence
- **所属岗位方向**: 数据洞察 - 竞品分析
- **核心功能**: 多源竞品情报收集与分析
- **为什么今天热**: 3+ 平台出现讨论（D3 +3）

### 3. brand-voice-extractor
- **所属岗位方向**: 品牌营销 - 品牌声音
- **核心功能**: 提取并定义品牌声音指南
- **为什么今天热**: 有可量化的效率提升案例（D4 +3）
```

## 局限性说明（必填）

由于中文社区内容覆盖可能不足，本简报主要基于 GitHub 与国际社区来源，中文社区动态可能不完整。
