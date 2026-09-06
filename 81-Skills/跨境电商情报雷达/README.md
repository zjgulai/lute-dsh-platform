---
title: 跨境电商情报雷达 - 快速开始
doc_type: readme
module: cbec-intelligence-radar
topic: quickstart
status: stable
created: 2026-05-27
updated: 2026-05-27
owner: self
source: human+ai
---

# cbec-intelligence-radar

跨境电商 Claude Skills 每日情报简报生成器。

## 一句话说明

按标准化流程搜索、分类、整理跨境电商领域 Claude Skills 最新动态，输出结构化情报简报。

## 何时触发

- "生成今日 Skills 简报"
- "情报雷达"
- "跨境电商 Claude Skills 动态"
- "今日最热 Skills"
- "Skills 情报收集"

## 快速用法

```
/cbec_intelligence_radar
```

默认生成日报，覆盖 6 大岗位全量。

### 自定义参数

```
/cbec_intelligence_radar weekly                    # 生成周报
/cbec_intelligence_radar daily --roles=sales,scm   # 仅销售运营和供应链
/cbec_intelligence_radar topic --target=claude-ads # 专题追踪 claude-ads
```

## 输出示例

简报保存到 `core_skills_library/跨境电商_Claude_Skills_战略摘要_YYYYMMDD.md`

包含 7 大板块：
1. Top 3 最热 Skills
2. GitHub Star 增长异常
3. 6 大岗位专项动态
4. 实战案例速报
5. 风险提示
6. 明日值得关注
7. 检索关键词存档

## 参考资源

- `references/search-strategy.md` — 搜索策略
- `references/role-taxonomy.md` — 岗位分类
- `references/output-template.md` — 输出模板
- `references/hot-skill-criteria.md` — 热度判定

## 依赖

- Web 搜索能力（Claude / Kimi / Cursor 原生支持）
- 文件写入权限（保存简报到 `core_skills_library/`）
