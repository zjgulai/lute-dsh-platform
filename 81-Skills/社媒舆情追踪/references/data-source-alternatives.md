# Social Sentiment Tracker - 数据源替代方案

本Skill原生支持社媒监听工具，但为解耦外部依赖，提供以下替代方案。

## 方案一：手动数据导入（推荐）

无需外部工具，直接导入从社媒平台导出的数据。

### 支持的数据格式

#### 1. Twitter/X数据导出

从Twitter Analytics或第三方工具导出：

```csv
date,mention_count,sentiment,engagement,reach,content
2026-04-01,5,positive,234,1500,"Love this product!"
2026-04-01,2,negative,12,800,"Not working properly"
```

#### 2. Reddit数据

从Reddit搜索或监控工具导出：

```csv
subreddit,date,title,content,upvotes,comments,sentiment
electronics,2026-04-01,"Great speaker","Just bought this...",45,12,positive
```

#### 3. 通用格式

```csv
platform,date,mention,author,sentiment,engagement,content
twitter,2026-04-01,@user,JohnDoe,positive,234,"Great product!"
reddit,2026-04-01,r/electronics,User123,neutral,45,"Review post"
```

## 方案二：平台API直连

使用各平台官方API获取数据。

### Twitter API (X)

```bash
# 配置
export TWITTER_BEARER_TOKEN="your_token"

# 运行
python scripts/social-data-collector.py \
  --platform twitter \
  --query "YourBrand" \
  --days 7 \
  --output twitter_data.csv
```

### Reddit API

```bash
# 配置
export REDDIT_CLIENT_ID="your_id"
export REDDIT_CLIENT_SECRET="your_secret"

# 运行
python scripts/social-data-collector.py \
  --platform reddit \
  --subreddit electronics,headphones \
  --query "keyword" \
  --output reddit_data.csv
```

### YouTube API

```bash
python scripts/social-data-collector.py \
  --platform youtube \
  --query "product review" \
  --output youtube_data.csv
```

## 方案三：第三方工具导出

支持主流社媒监听工具的数据格式：

| 工具 | 支持状态 | 说明 |
|-----|---------|------|
| Brandwatch | ✅ | 标准CSV导出 |
| Sprout Social | ✅ | 报告导出 |
| Hootsuite | ✅ | 分析导出 |
| Mention | ✅ | CSV导出 |
| Brand24 | ✅ | 数据导出 |

### 转换脚本

```bash
# 转换第三方工具数据为标准格式
python scripts/format-converter.py \
  --input brandwatch_export.csv \
  --format brandwatch \
  --output standard_data.csv
```

## 方案四：手动数据录入

对于小规模监控，使用提供的模板手动录入。

见 `manual-data-template.md`

## 数据格式规范

### 标准格式字段

| 字段 | 类型 | 说明 | 必需 |
|-----|------|------|-----|
| platform | string | 平台名称 | ✅ |
| date | date | 发布日期 | ✅ |
| mention | string | 提及标识 | ✅ |
| author | string | 作者 | ✅ |
| sentiment | string | 情感标签 | ✅ |
| engagement | int | 互动数 | ❌ |
| content | string | 内容 | ❌ |

### 情感标签

- `positive` - 正面
- `negative` - 负面
- `neutral` - 中性

## 数据收集建议

| 场景 | 推荐方案 | 频率 |
|-----|---------|------|
| 日常监控 | API直连 | 每日 |
| 活动追踪 | 手动导入 | 活动期间 |
| 深度分析 | 第三方工具 | 月度 |
| 快速检查 | 手动录入 | 按需 |

## 隐私和合规

- 仅收集公开数据
- 遵守各平台服务条款
- 注意数据保留期限
- 尊重用户隐私设置
