# 完整示例：Momcozy 场景（脱敏演示）

## 输入

```
目标 ACoS: 25%
归因窗口: 7 天
品类阶段: 成熟期（已有自然排名）
搜索词报告（节选）:
keyword, impressions, clicks, spend, sales, orders, acos
"breast pump", 12000, 800, 2450.00, 9800.00, 120, 0.25
"wearable breast pump", 4500, 320, 1100.00, 3400.00, 38, 0.32
"pump parts", 3000, 90, 410.00, 0, 0, 0.00
"manual breast pump", 2500, 150, 520.00, 1300.00, 16, 0.40
"milk collector", 1800, 60, 210.00, 0, 0, 0.00
```

## 输出

```markdown
## Amazon Ads Health Score
- Overall: 68/100
- ACoS health: 72/100（整体 ACoS 24%，接近目标 25%）
- ROAS health: 78/100
- CTR health: 65/100
- CVR health: 60/100
- Impression share: 71/100

## 浪费花费识别
- "$pump parts"：$410 花费、0 转化 → 否定词候选（精确否定）
- "milk collector"：$210 花费、0 转化 → 否定词候选
- 合计可回收浪费花费约 $620

## 优化建议
1. P0: 无（追踪口径一致，销售已拆分）
2. P1: 对 "pump parts"、"milk collector" 添加否定词
3. P1: 下调 "manual breast pump" 竞价（ACoS 40% 超标）
4. P2: 给 "breast pump" 独立建 Campaign 并提预算（高转化扩量）
5. P3: 检查 CTR/CVR 下滑是否与主图、评论相关

## 预期效果
- 浪费花费回收 $620
- 优化后预计整体 ACoS 降至 22%
```

## 说明

- 所有建议均需人工审核后执行；本技能不直接改竞价、暂停广告或批量添加否定词。
