# Reference Notes

## 一、推荐的基础表

### posts
存主帖级信息。

建议字段：

- post_id
- platform
- community
- page_type
- post_type
- post_title
- post_author
- created_at
- post_content
- has_image
- has_video
- has_external_link
- brand_main
- product_main
- post_intent
- stance_main

### comments
存评论级信息。

建议字段：

- comment_id
- post_id
- parent_id
- author
- comment_level
- content
- is_op_reply
- stance
- evidence_strength
- issue_type
- mentions_brand
- mentions_product
- mentions_competitor
- action_signal

### topic_tags
存议题标签。

建议字段：

- source_id
- source_type
- topic_category
- topic_subcategory
- severity
- evidence_strength
- lifecycle_stage
- actionable

### brand_mentions
存品牌与竞品提及。

建议字段：

- source_id
- brand_name
- product_model
- mention_type
- sentiment
- comparison_target
- migration_intent

## 二、推荐补充表

### evidence_items
适合记录：

- 图片证据
- 拆解过程
- 使用时长
- 维修过程
- 故障现场
- 可复现步骤

### migration_signals
适合记录：

- 原品牌
- 目标品牌
- 迁移动机
- 迁移阶段
- 明确弃购信号

### decision_signals
适合记录：

- 购买前犹豫
- 被说服
- 放弃购买
- 改买竞品
- 推荐给别人

### risk_flags
适合记录：

- 安全风险
- 耐久风险
- 清洁风险
- 适配风险
- 误用风险
- 售后争议风险

### content_actions
适合记录：

- FAQ 主题
- 帮助中心补充项
- 社区回应要点
- 使用边界说明
- 风险教育内容
- 售前解释素材

### monitoring_followups
适合记录：

- 应纳入的 VOC 标签
- 后续复查条件
- 竞品迁移监控点
- 是否需要升级到批量舆情追踪
- 是否需要产品或客服 owner 跟进

## 三、推荐分析维度

- 主议题 / 次议题
- 情绪 / 证据强度
- 故障模式 / 使用场景
- 初体验 / 长期体验
- 客服体验 / 信任修复
- 品牌提及 / 竞品替代
- 价格 / 质量预期落差
- 用户自行 workaround / 可维修性需求
- 购买动机 / 决策犹豫点
- 适配性 / 人群边界

## 四、典型高价值信号

- “本来想买，结果放弃”
- “用了 1 个月 / 4 个月 / 7 个月后坏了”
- “保修很好，但还是不会再买”
- “需要特别小心使用才能不坏”
- “自己修好了”
- “别人也遇到相同问题”
- “某竞品像行业基准一样被提及”
- “初期觉得很好，长期才暴露问题”
- “参数看起来不错，但实际很难对位 / 很难清洁 / 不适合我的身体条件”
- “用户误解集中出现，且可以转化为 FAQ、帮助中心或社区回应”

## 五、推荐的枚举值示例

### post_type
- complaint
- consultation
- comparison
- recommendation
- troubleshooting
- post_purchase_review

### evidence_strength
- low
- medium
- high

### severity
- low
- medium
- high
- critical

### mention_type
- primary_product
- competitor_recommendation
- competitor_comparison
- migration_target
- industry_benchmark

### migration_intent
- low
- medium
- high
