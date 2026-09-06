# 穿戴式吸奶器跨平台 VoC 分析完整示例

> 本文由 SKILL.md「示例」点名引用，展示完整输入→输出格式。

## 输入示例（feedback.json）

```json
{
  "amazon": [
    {"text": "I love how quiet this is! I can pump at my desk without anyone noticing.", "rating": 5, "brand": "Momcozy", "date": "2026-07-01"},
    {"text": "Suction is great but the flange doesn't fit well. Had to buy a third-party insert.", "rating": 3, "brand": "Momcozy", "date": "2026-06-15"},
    {"text": "Works well but leaks if I bend over. Disappointed for the price.", "rating": 2, "brand": "Momcozy", "date": "2026-06-20"},
    {"text": "Elvie is much quieter than my old Medela. Worth every penny.", "rating": 5, "brand": "Elvie", "date": "2026-07-05"},
    {"text": "Willow is great but cleaning is a nightmare. So many tiny parts.", "rating": 3, "brand": "Willow", "date": "2026-06-28"}
  ],
  "reddit": [
    {"text": "Should I get Elvie or Momcozy? I work in an open office and need something discreet.", "rating": 0, "brand": "", "date": "2026-07-10"},
    {"text": "Between Momcozy and Willow, I chose Momcozy because the replacement parts are way cheaper.", "rating": 0, "brand": "Momcozy", "date": "2026-07-08"}
  ],
  "tiktok": [
    {"text": "OMG this pump changed my life! I can finally walk around while pumping!", "rating": 0, "brand": "Momcozy", "date": "2026-07-12"}
  ]
}
```

## 输出示例（摘要，完整 JSON 见 scripts/run.py 输出）

### 样本说明

- 分析对象：穿戴式吸奶器品类
- 涉及品牌：Momcozy, Elvie, Willow
- 总样本量：7 条
- 来源结构：Amazon 5, Reddit 2, TikTok 1
- 时间范围：2026-06-15 至 2026-07-12

### 决策旅程摘要

- 认知触发：用户通过 TikTok 种草、Reddit 对比帖开始关注
- 比较犹豫：静音、隐蔽性、配件成本是核心犹豫点
- 使用摩擦：法兰适配、漏奶、清洗复杂度
- 价值确认：静音、可随身活动是核心价值
- 流失原因：Elvie 更静音、Willow 清洗麻烦

### 竞品 VoC 矩阵（摘要）

| 主题 | Momcozy | Elvie | Willow | 机会判断 |
|------|---------|-------|--------|----------|
| 静音 | 被表扬 | 被表扬 | 未提及 | Momcozy 在静音上与 Elvie 可竞争 |
| 法兰适配 | 被吐槽 | 未提及 | 未提及 | Momcozy 独有痛点，需优先改品 |
| 清洗 | 未提及 | 未提及 | 被吐槽 | 行业共痛点，可用配件设计降低门槛 |
| 漏奶 | 被吐槽 | 未提及 | 未提及 | Momcozy 独有痛点 |
| 配件成本 | 被表扬 | 未提及 | 未提及 | Momcozy 优势 |

### 可执行路由

- 给改品团队的约束：法兰适配（3星但吐槽）、漏奶（2星差评）→ 优先级 P0
- 给 Listing 专家的文案钩子：「静音到可以在办公桌边泵奶」「配件更便宜」
- 给客服/FAQ 的疑虑化解：清洗指南、法兰尺寸选择
- 给选品团队的信号：更低学习成本的穿戴式方案可能是下一波增长点