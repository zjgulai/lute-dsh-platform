# PPC 审计维度判定阈值

本文件是 `SKILL.md` 六维审计表的下钻口径，仅在需要逐维度给出证据时读取。

## Tracking（追踪与归因）

- 归因窗口：确认 7 天 / 14 天口径一致，混用会高估或低估 ACoS。
- 订单口径：广告销售（ad sales）与自然销售（organic sales）须拆分，否则 ROAS 被自然转化虚增。
- 阈值：归因窗口不一致或销售未拆分 → Tracking 记 P0 修复项。

## Structure（结构）

- Campaign 命名：品牌词 / 非品牌词 / 竞品词 / 长尾词是否分 Campaign 隔离。
- 自动 / 手动分层：自动广告作为拓词雷达，手动广告承接高转化词。
- 阈值：品牌词与非品牌词混投 → Structure 记 P1。

## Search Terms（搜索词）

- 高花费无转化词：花费超过盈亏线（通常取客单价 × 目标利润率）且 0 转化 → 否定词候选。
- 低 ACoS 扩量词：ACoS < 目标且转化稳定 → 提竞价 / 独立建 Campaign。
- 阈值：单搜索词累计花费 ≥ 目标 ACoS 对应盈亏线且无单 → 加入否定词建议。

## Bidding（竞价）

- 竞价过高：CPC 远超品类均值且 ACoS 超标 → 下调竞价。
- Top of Search 溢价：TOS 溢价过高且未带来对应转化 → 下调溢价比例。
- 动态竞价：down only / up and down 策略按品类阶段选择。

## Budget（预算）

- 日预算耗尽：高转化 Campaign 预算上限频繁触顶 → 提预算。
- 预算错配：成熟 Campaign 与测试 Campaign 比例失衡。
- 阈值：高转化 Campaign 日预算耗尽率 > 50% → 提预算 20%-30%。

## Listing Dependency（Listing 依赖）

- CTR 下滑：先查主图、标题、价格、评论，排除广告侧问题。
- CVR 下滑：先查详情页、价格、库存、评分，再做广告调整。
- 判断：广告侧指标（曝光/CPC）正常但 CTR/CVR 异常 → 优先 Listing 诊断。
