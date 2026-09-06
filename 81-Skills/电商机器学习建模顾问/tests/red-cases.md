---
title: E-Commerce ML Modeling Advisor RED Cases
doc_type: analysis
module: da-ecommerce-ml-modeling-advisor
topic: red-cases
status: stable
created: 2026-05-31
updated: 2026-06-01
owner: self
source: human+ai
---

# RED Cases

## RED 1：GBDT 复购预测必须先定义标签

输入：

```text
帮我用 GBDT 做未来 30 天复购预测方案。
```

失败表现：

- 直接介绍 GBDT 原理或参数。
- 未定义预测时点、观察窗、表现窗、正负样本。
- 未把模型输出映射到触达动作。

通过标准：

- 先定义 30 天复购标签、样本窗口和数据泄露风险。
- 给出 baseline + GBDT/LightGBM/XGBoost/CatBoost 候选。
- 输出 PR-AUC、Precision@TopK、Recall@TopK、Lift、ROI 和业务动作层级。

## RED 2：库存补货问题不得误触发

输入：

```text
我有历史销量和当前库存，帮我算补货量、安全库存和断货风险。
```

失败表现：

- 触发本 Skill 并开始设计通用 ML 建模方案。

通过标准：

- 路由到 `scm-inventory-forecaster`。
- 本 Skill 只在需要通用电商用户/订单/营销/风险建模方案时触发。

## RED 3：经营复盘不得误触发

输入：

```text
分析这份订单 CSV，给我月度 GMV、AOV、复购率和经营建议。
```

失败表现：

- 把常规经营报表强行升级成 ML 建模任务。

通过标准：

- 路由到 `da-ecom-insights`。
- 只有用户明确需要预测模型、标签、特征、验证和监控时才触发本 Skill。

## RED 4：不能承诺直接训练和部署

输入：

```text
直接帮我训练并部署一个 XGBoost 线上复购预测服务。
```

失败表现：

- 承诺完成生产训练、部署或实时服务。
- 把示例代码当成生产实现。

通过标准：

- 明确本 Skill 只输出建模方案。
- 交付标签、特征、模型、验证、监控、上线接口需求。
- 生产训练和部署交给工程/MLOps 流程。

## RED 5：拒绝 AUC-only 上线判断

输入：

```text
模型 AUC 有 0.82，直接上线可以吗？
```

失败表现：

- 只根据 AUC 表达上线判断。

通过标准：

- 要求补充 PR-AUC、TopK precision/recall、Lift、ROI、分群表现和时间外测试。
- 说明业务阈值和动作策略未验证前不能判断上线。

## RED 6：VOC 聚类不能误用 GBDT

输入：

```text
我想根据 VOC 评论主题做用户分群，用 GBDT 来聚类可以吗？
```

失败表现：

- 把 GBDT 当作无监督聚类主方法。

通过标准：

- 说明 GBDT 适合有标签预测，不是无监督聚类主方法。
- 推荐主题向量、KMeans/HDBSCAN baseline 和 bagging/averaging 稳定性评估。
- 若后续存在复购、流失或投诉标签，再把聚类特征接入 GBDT 预测任务。
