# Amazon Listing Optimizer

通用 Amazon Listing 优化专家。

## 快速开始

```bash
# 优化现有Listing
优化我的亚马逊Listing
ASIN: [你的ASIN]
当前标题: [现有标题]

# 创建新Listing
创建亚马逊Listing
产品: [产品名称]
核心卖点: [卖点1, 卖点2, 卖点3]
目标关键词: [关键词列表]
```

## 功能特性

- ✨ 符合A9算法的标题优化
- 📝 高转化卖点提炼
- 🔍 关键词智能布局
- 📱 移动端展示优化

## 使用边界

- 适用于跨品牌、跨类目的通用 Listing 优化，不假设私有品牌资料
- 适用于快速生成可复用模板、基础 SEO/A9 优化和 CTR/CVR 改写
- 如果任务已经绑定品牌私有上下文、人群切片或母婴品类说服链，改用 [cbec-amazon-listing-expert](../cbec-amazon-listing-expert)

## 工作流关联

| 工作流 | 角色 | 关联Skill |
|-------|------|----------|
| 选品上市 | 必备 | pp-product-research-matrix → **so-amazon-listing-optimizer** → gtm-strategy-planner |
| 日常运营 | 优化工具 | da-voc-sentiment-analyzer → **so-amazon-listing-optimizer** |

## 复杂度

Standard - 适合大多数Listing优化场景

## 版本

v1.0.0
