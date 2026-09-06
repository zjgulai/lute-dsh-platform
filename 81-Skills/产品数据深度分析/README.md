# cbec-product-data-analyzer

基于产品与市场数据生成深度分析报告，提供面向 Momcozy 的进入决策、情景模拟和优先动作备忘录。当用户提及"Jungle Scout分析"、"Helium 10分析"、"Sorftime分析"、"竞品CSV分析"、"市场规模分析"、"品类深挖"、"选品研判"、"竞争分析"或需要数据驱动的市场决策时使用。触发词：Jungle Scout分析、Helium 10分析、Sorftime分析、竞品CSV分析、市场规模分析、品类深挖、选品研判、竞争分析。

## 快速开始

查看 [SKILL.md](./SKILL.md) 获取完整使用指南。

## 文件结构

```
cbec-product-data-analyzer/
├── README.md          # 本文件
├── SKILL.md           # 技能详细文档
├── references/        # 数据源适配参考
└── .skill-meta/
    └── manifest.yaml  # 元数据
```

## 适用场景

- Momcozy 跨境电商业务
- Amazon / Shopify DTC 运营
- 母婴品类产品开发

## 使用边界

- Skill 名表达分析能力，不绑定单一数据供应商
- 当前 `references/reference.md` 记录的是 Jungle Scout 字段对照；接入 Helium 10、Sorftime 或 CSV 时，先做字段归一化，再沿用同一分析骨架
- 它负责深度数据研判与决策备忘录，不替代 `cbec-market-insight-selector` 的轻量扫描，也不替代 `cbec-market-viability-auditor` 的最终进入裁决
