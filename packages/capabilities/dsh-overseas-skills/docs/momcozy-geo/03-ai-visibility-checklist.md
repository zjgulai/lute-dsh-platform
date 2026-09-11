# momcozy.com AI 可见性优化清单（P0-P3）

- **P0 Product+FAQ Schema**：旗舰产品页补 Product（字段见 02 模板）；帮助中心 FAQ 补 FAQPage（HowTo 用于「怎么清洗/怎么组装」指南页）
- **P1 权威实体强化**：Organization 补 sameAs（TikTok/IG/YouTube/百科）、logo、foundingDate；「Global No.1 / 6M+ moms」做成 1-2 句可直接引用的事实段
- **P2 AI Shopping 占位**：feed 补 google_product_category；白底主图（视觉搜索）；价格/库存实时标记；Bing Copilot 偏好参数型对比表
- **P3 月度复查**：每月跑一次 geo-optimizer 检查（真实 API 需 GOOGLE/BING key，否则 Mock 演示）
- 生成命令（字段填好后）：`python3 ~/.dsh/skills/geo-optimizer/scripts/run.py --product 02-product-config.template.json --output product-schema.html`
- 校验：Google Rich Results Test / Bing Markup Validator
