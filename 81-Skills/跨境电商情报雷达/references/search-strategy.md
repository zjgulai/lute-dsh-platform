---
title: 跨境电商情报搜索策略
doc_type: reference
module: cbec-intelligence-radar
topic: search-strategy
status: stable
created: 2026-05-27
updated: 2026-05-27
owner: self
source: human+ai
---

# 跨境电商情报搜索策略

本文件定义 `cbec-intelligence-radar` 执行情报收集时的分渠道搜索策略。

## 渠道优先级

按以下顺序执行搜索，确保覆盖度与效率平衡：

```
P0: GitHub（ Skills 发布主阵地）
P1: 中文社区（知乎 / 知无不言 / 53AI / 亿邦动力）
P2: 国际社区（Reddit / X-Twitter / LinkedIn）
P3: 平台与工具（ProductHunt / SkillsMP / OpenClaw Registry）
P4: 视频与播客（YouTube / 播客）
```

## 渠道搜索模板

### P0: GitHub

**核心关键词组合**：

```
"claude skills" ecommerce amazon 2026
"claude skills" cross-border ecommerce supply chain
"claude skills" amazon seller listing optimization
openclaw skills amazon seller github 2026
"claude skills" gtm marketing sales 2026
```

**深度挖掘**：
- 访问本周 Star 增长异常的仓库，提取 README 中的 Skill 列表
- 关注 CHANGELOG / Releases 页面获取版本更新信息
- 检查 Issues 和 Discussions 中的实战反馈

**高价值仓库（持续关注）**：
- `openclaw/openclaw` — OpenClaw 核心框架
- `VoltAgent/awesome-openclaw-skills` — Skills 聚合目录
- `nexscope-ai/Amazon-Skills` — 亚马逊垂直 Skills
- `alirezarezvani/claude-skills` — 通用 Skills 集合
- `glebis/claude-skills` — 工作流 Skills
- `AgriciDaniel/claude-ads` — 广告审计 Skills
- `sales-skills/sales` — 销售 Skills
- `coreyhaines31/marketingskills` — 营销 Skills
- `garrytan/gstack` — YC 营销栈

---

### P1: 中文社区

**知乎**：

```
Claude Skills 跨境电商 2026
OpenClaw 龙虾 亚马逊 实战
Claude Skills 选品 运营 工具
AI 智能体 跨境电商 自动化
```

**知无不言**：

```
AI 亚马逊运营 Claude Skills
OpenClaw 跨境电商 实战案例
AI 智能体 选品 广告
```

**53AI**：

```
Claude Skills 电商
AI 亚马逊 Listing 优化
跨境电商 AI 工具
```

**亿邦动力**：

```
AI 跨境电商 Claude
OpenClaw 亚马逊
```

---

### P2: 国际社区

**Reddit**：

```
r/ClaudeCode claude skills ecommerce
r/AmazonSeller AI tools 2026
r/ecommerce claude code skills
```

**X / Twitter**：

```
#ClaudeSkills Amazon seller
#ClaudeSkills ecommerce
#OpenClaw skills
Claude Code ecommerce automation
```

**LinkedIn**：

```
Claude Skills Amazon PPC
AI ecommerce automation
Claude Code seller tools
```

---

### P3: 平台与工具

**ProductHunt**：

```
AI ecommerce tool
Claude Skills
OpenClaw
StoreClaw
```

**SkillsMP**：

```
ecommerce skills
amazon seller skills
claude skills
```

**OpenClaw Registry / ClawHub**：

```
latest skills
ecommerce category
amazon tools
```

---

### P4: 视频与播客

**YouTube**：

```
Claude Skills Amazon seller tutorial 2026
OpenClaw ecommerce setup
Claude Code Amazon FBA
```

**播客**：

```
Claude Code skills podcast
ecommerce AI automation
```

---

## 搜索执行原则

1. **广度优先**：每个渠道先执行 1-2 轮广度搜索，覆盖关键词组合
2. **深度次之**：对高价值来源（GitHub 热门仓库、 ProductHunt 榜首）进行页面深度提取
3. **时间过滤**：默认关注最近 7 天的动态，周报扩展至 14 天
4. **去重策略**：同一 Skill 在不同渠道出现时，合并信息并标注所有来源
5. **截断原则**：单渠道搜索不超过 3 轮，避免陷入信息过载

## 关键词维护

本文件随 Skill 生态演变定期更新：
- 新增热门仓库 → 加入"高价值仓库"列表
- 新平台出现 → 新增渠道章节
- 关键词失效 → 标记删除并记录原因

**最后更新**: 2026-05-27
