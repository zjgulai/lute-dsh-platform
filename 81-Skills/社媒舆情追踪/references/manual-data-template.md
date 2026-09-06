# 手动数据录入模板

适用于小规模社媒监控或快速分析场景。

## 使用说明

1. 复制下方的模板
2. 根据监控的平台填写数据
3. 保存为CSV格式
4. 上传给Skill进行分析

## 模板

```csv
platform,date,mention,author,sentiment,engagement,content
twitter,2026-04-09,@username1,User1,positive,45,"Love this product! Best purchase ever."
twitter,2026-04-09,@username2,User2,negative,12,"Not happy with the quality..."
reddit,2026-04-08,r/subreddit,User3,neutral,89,"Has anyone tried this? Looking for reviews."
instagram,2026-04-08,#hashtag,User4,positive,234,"Check out my new setup!"
```

## 字段说明

| 字段 | 填写示例 | 说明 |
|-----|---------|------|
| platform | twitter, reddit, instagram | 平台名称 |
| date | 2026-04-09 | 发布日期 (YYYY-MM-DD) |
| mention | @username, #hashtag, r/subreddit | 提及标识 |
| author | User1, @handle | 作者名 |
| sentiment | positive, negative, neutral | 情感判断 |
| engagement | 45 | 点赞/评论/转发数 |
| content | "Love this!" | 内容摘要 |

## 情感判断指南

### Positive
- 包含赞美词汇: love, great, amazing, best, awesome
- 推荐意图: "You should buy this"
- 满意度表达: "Very satisfied", "Exceeded expectations"

### Negative
- 包含抱怨词汇: bad, terrible, worst, disappointed, broken
- 退货/投诉: "Returning this", "Waste of money"
- 问题描述: "Not working", "Poor quality"

### Neutral
- 询问信息: "Does anyone know...", "Looking for..."
- 客观陈述: 无情感倾向的事实描述
- 转发/分享: 无评论的转发

## 批量录入表单

复制下方表格，每行一条记录：

| Platform | Date | Mention | Author | Sentiment | Engagement | Content |
|---------|------|---------|--------|-----------|------------|---------|
| twitter | 2026-04-09 | @user1 | Name1 | positive | 50 | Love it! |
| twitter | 2026-04-09 | @user2 | Name2 | negative | 10 | Not good |
| reddit | 2026-04-08 | r/xxx | Name3 | neutral | 100 | Question? |

## 示例数据

见 `../examples/sample-social-data.csv`

## 注意事项

1. **样本量**: 建议至少30条记录以获得有意义的分析
2. **时效性**: 数据越新越好，建议1周内
3. **多样性**: 尽量覆盖多个平台和作者
4. **客观性**: 如实记录情感，避免偏见
