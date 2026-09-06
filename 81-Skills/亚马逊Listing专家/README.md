# cbec-amazon-listing-expert

为 Amazon 母婴产品创建或重写 Listing，围绕购买心理、决策中断点和品牌优势提升转化。当用户提及"Amazon Listing"、"五点描述"、"主图"、"A+"、"EBC"、"转化优化"、"详情页重写"、"Bullet Points"或需要优化亚马逊产品页面时使用。 触发词：Amazon Listing、五点描述、主图、A+页面、EBC、转化优化、详情页重写、Bullet Points。 

## 快速开始

查看 [SKILL.md](./SKILL.md) 获取完整使用指南。

使用前先确认是否已有品牌/品类私有上下文；如有，优先同时读取 `references/` 中的业务材料。

## 文件结构

```
cbec-amazon-listing-expert/
├── README.md          # 本文件
├── SKILL.md           # 技能详细文档
└── .skill-meta/
    └── manifest.yaml  # 元数据
```

## 适用场景

- Momcozy 跨境电商业务
- Amazon / Shopify DTC 运营
- 母婴品类产品开发

## 使用边界

- 适用于已知品牌语境、人群切片、竞品名单和品类说服链的高转化 Listing 设计
- 默认把公开平台信息和私有业务上下文一起压成文案决策
- 如果任务只是通用 Amazon Listing 改写，且没有私有上下文，改用 [so-amazon-listing-optimizer](../so-amazon-listing-optimizer)
