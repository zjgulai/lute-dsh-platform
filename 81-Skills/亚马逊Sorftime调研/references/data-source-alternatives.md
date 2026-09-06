# Amazon Sorftime Research - 数据源替代方案

本Skill原生支持Sorftime数据，但为解耦外部依赖，提供以下替代方案。

## 方案一：CSV导入（推荐）

无需Sorftime，直接使用标准CSV格式数据。

### 支持的CSV格式

```csv
asin,title,category,price,rating,review_count,bsr,brand,features
B08XXXXX,Product Title,Electronics,29.99,4.5,1234,150,BrandA,"feature1,feature2"
```

### 必需字段

| 字段 | 说明 | 示例 |
|-----|------|------|
| asin | Amazon标准识别码 | B08N5WRWNW |
| title | 产品标题 | Portable Bluetooth Speaker |
| category | 类目 | Electronics |
| price | 价格 | 29.99 |
| rating | 评分 | 4.5 |
| review_count | 评价数 | 1234 |
| bsr | 畅销排名 | 150 |

### 可选字段

| 字段 | 说明 |
|-----|------|
| brand | 品牌名 |
| features | 产品特性 |
| images | 图片数量 |
| seller | 卖家名 |
| date_first_available | 上架日期 |

## 方案二：Amazon SP-API

使用Amazon官方API获取数据。

### 配置步骤

1. 注册Amazon SP-API开发者账号
2. 获取IAM凭证和refresh token
3. 配置config.yaml

```yaml
# config/sp-api.yaml
aws_access_key: YOUR_ACCESS_KEY
aws_secret_key: YOUR_SECRET_KEY
refresh_token: YOUR_REFRESH_TOKEN
role_arn: YOUR_ROLE_ARN
marketplace_id: ATVPDKIKX0DER  # US marketplace
```

### 使用脚本

```bash
python scripts/fetch-amazon-data.py \
  --category "Electronics" \
  --output "top100.csv" \
  --config "config/sp-api.yaml"
```

## 方案三：Keepa API

使用Keepa作为数据源。

### 配置

```yaml
# config/keepa.yaml
api_key: YOUR_KEEPA_API_KEY
domain: 1  # 1=US, 2=UK, 3=DE, etc.
```

### 使用

```bash
python scripts/fetch-amazon-data.py \
  --source keepa \
  --asins B08XXXXX,B08YYYYY \
  --output "data.csv"
```

## 方案四：公开数据抓取（合规）

使用合规的公开数据抓取。

### 限制

- 仅抓取公开可见数据
- 遵守robots.txt
- 控制请求频率

### 使用

```bash
python scripts/fetch-amazon-data.py \
  --source web \
  --category "Portable Speakers" \
  --pages 5 \
  --output "data.csv"
```

## 数据格式规范

无论使用哪种数据源，最终都需要转换为标准CSV格式。见 `csv-format-guide.md`

## 数据质量检查

使用提供的脚本验证数据完整性：

```bash
python scripts/validate-data.py --input "your-data.csv"
```

## 推荐组合

| 场景 | 推荐方案 | 成本 |
|-----|---------|------|
| 快速测试 | CSV手动导入 | 免费 |
| 定期监控 | Keepa API | $/月 |
| 大规模分析 | SP-API | 免费/按量 |
| 一次性研究 | 公开抓取 | 免费 |
