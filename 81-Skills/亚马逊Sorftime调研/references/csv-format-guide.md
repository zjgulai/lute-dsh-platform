# CSV格式规范

## 标准格式

```csv
asin,title,category,price,rating,review_count,bsr,brand,features,date_first_available
B08N5WRWNW,"Bluetooth Speaker, Portable Wireless Speaker",Electronics,29.99,4.5,1234,150,BrandA,"portable,bluetooth,wireless",2021-03-15
```

## 字段说明

### 必需字段

| 字段 | 类型 | 说明 | 约束 |
|-----|------|------|------|
| asin | string | Amazon Standard Identification Number | 10字符，以B开头 |
| title | string | 产品标题 | 最长200字符 |
| category | string | 类目名称 | - |
| price | float | 当前价格 | USD |
| rating | float | 星级评分 | 1.0-5.0 |
| review_count | int | 评价数量 | >=0 |
| bsr | int | Best Sellers Rank | >=0 |

### 可选字段

| 字段 | 类型 | 说明 |
|-----|------|------|
| brand | string | 品牌名 |
| features | string | 产品特性，逗号分隔 |
| images | int | 图片数量 |
| seller | string | 卖家名 |
| date_first_available | date | 上架日期 (YYYY-MM-DD) |
| variations | int | 变体数量 |
| fulfillment | string | 配送方式 (FBA/FBM) |

## 示例文件

见 `../examples/sample-data.csv`

## 常见问题

### Q: 如何获取ASIN列表？
A: 从Amazon类目页手动收集，或使用工具导出。

### Q: 评价数据如何获取？
A: 使用voc-sentiment-analyzer Skill配合。

### Q: 可以只提供部分字段吗？
A: 必需字段必须提供，可选字段缺失会用空值填充。
