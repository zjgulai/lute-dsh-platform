---
title: E-Commerce ML Model Selection Rules
doc_type: knowledge
module: da-ecommerce-ml-modeling-advisor
topic: model-selection
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# Model Selection Rules

## 先定义任务，再选模型

模型选择必须排在业务决策、标签、样本窗口和验证指标之后。

如果用户只说“用 GBDT 分析一下”，先追问或显式设定：

- 预测对象：用户、订单、商品、评论、售后单。
- 预测时点：模型在什么时间点打分。
- 表现窗口：预测未来 7 天、30 天、90 天还是其他周期。
- 业务动作：优惠券、召回、推荐、客服干预、库存预警或风险拦截。

## 任务到模型族

| 任务 | 典型标签 | 推荐模型族 | 关键指标 |
|---|---|---|---|
| 复购预测 | 未来 N 天是否有效下单 | Logistic Regression baseline、LightGBM、XGBoost、CatBoost | AUC、PR-AUC、Precision@TopK、Recall@TopK、Lift、ROI |
| 流失预警 | 未来 N 天未购买或活跃下降 | Logistic Regression baseline、GBDT、Random Forest | PR-AUC、Recall@TopK、Lift、召回成本 |
| 优惠券响应 | 触达后是否转化 | Uplift model、GBDT、CatBoost | Incremental lift、ROI、redeem rate |
| LTV/金额预测 | N 天收入、订单金额、购买频次 | GBDT regression、Random Forest regression | MAE、RMSE、MAPE、分层 ROI |
| 风险/售后预测 | 退款、退货、投诉、拒付 | GBDT、CatBoost、Random Forest | PR-AUC、Precision@TopK、人工复核命中率 |
| 推荐/交叉销售 | 点击、加购、购买、相关品类 | Candidate scoring、learning-to-rank | NDCG、MAP、Hit Rate、转化率 |
| 用户分群/VOC 聚类 | 无监督群组或主题 | KMeans/HDBSCAN baseline、bagging stability | Silhouette、cluster stability、可解释性 |

## 模型族规则

- Logistic Regression：强 baseline，适合验证标签、特征方向和校准需求。
- Random Forest/Bagging：适合噪声较高、需要稳定性的分类或回归方案。
- GBDT/LightGBM/XGBoost：适合结构化电商 tabular prediction，不适合直接做无监督聚类。
- CatBoost：适合高基数类别特征较多的场景，如品牌、类目、国家、渠道、营销活动。
- Averaging/Bagging：适合提高分群、VOC 聚类或弱模型结果的稳定性。
- Stacking：只在单模型和 baseline 有明确不足时引入，避免默认复杂化。

## 常见误用

- 只因为来源文档提到 GBDT，就把所有问题都建成 GBDT 任务。
- 未定义标签就讨论参数。
- 用随机切分评估带时间顺序的用户行为预测。
- 只看 AUC，不看 TopK、Lift、PR-AUC 和业务 ROI。
- 把模型分数输出给业务，却没有动作分层和复盘指标。
