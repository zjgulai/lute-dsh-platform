# 决策旅程五阶段与标注关键词表

> 本文由 SKILL.md「第三步：按决策旅程标注」点名引用，用于把零散反馈标注到决策阶段。

## 五阶段定义

| 阶段 | 英文 key | 用户在做什么 | 输出用途 |
|------|----------|--------------|----------|
| 认知触发 | cognitive_trigger | 开始关注品类、被种草 | 广告与内容切入 |
| 比较犹豫 | comparison_hesitation | 对比品牌、迟迟不下单 | Listing 和 FAQ |
| 使用摩擦 | usage_friction | 体验受阻、抱怨缺陷 | 改品与客服脚本 |
| 价值确认 | value_confirmation | 认可价值、愿意推荐 | 复购与口碑传播 |
| 流失/替代 | churn_signal | 转向别家、退货退款 | 竞品策略与产品迭代 |

## 标注关键词表（与 scripts/core.py `_STAGE_KEYWORDS` 一致）

- **cognitive_trigger**: first time / looking for / need a / considering / researching / 推荐 / 第一次 / 想买 / 求推荐 / should I get
- **comparison_hesitation**: vs / versus / compare / difference / 犹豫 / 对比 / 不知道选 / which one / better than / or / between / not sure
- **usage_friction**: difficult / hard to / annoying / uncomfortable / loud / noisy / bulky / 不容易 / 不好用 / 麻烦 / 太重 / 太吵 / leak / broken / doesn't work
- **value_confirmation**: love / amazing / great / perfect / best / worth / recommend / game changer / 满意 / 很好 / 推荐 / 值得 / 方便 / 超好用
- **churn_signal**: return / refund / switched to / 退货 / 退款 / 换了 / 换成 / 不如 / disappointed / regret / not worth / overpriced

## 叠加标签（每条反馈可多标签）

- 用户画像、使用场景、正面亮点、负面痛点、未满足期望、购买动机、放弃理由

## 采样规则

- 不能只抓 5 星；3 星评论优先级高（最易暴露「差一点成交/差一点满意」）
- 记录来源、日期、星级或互动强度
- 明确样本属于竞品 / Momcozy / 泛品类讨论
