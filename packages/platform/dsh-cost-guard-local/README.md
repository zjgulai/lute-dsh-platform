# dsh-cost-guard-local — 大模型调用成本看板与预算闸门

把 DSH 事件流里**已经存在**的 token 计量折算成钱，并把降价动作暴露成可调参数。
只读插件：不写任何会话，只在 `$DSH_HOME/cost-guard/ledger.jsonl` 追加账本快照。

## 为什么需要它

会话里每一笔模型调用都留了 `request/header`（provider / model / reasoningEffort）与
`assistant/chunk` 的 `usage`（命中 / 未命中 / 输出 / 推理 token），但没有任何界面把它换算成金额。
于是「账单超预算」和「钱花在哪」之间缺一层可审计的账本，压缩、降档、限流这类动作也就无从下手。

## 计费口径（三个必须记住的事实）

1. **`totalTokens` 含输出，不能当 prompt 用。**
   在 1129 份真实会话上核过，99.8% 的调用满足
   `totalTokens = inputTokens + cacheReadTokens + outputTokens`。
   因此 prompt（输入侧）= `inputTokens + cacheReadTokens`；把它写成 `totalTokens` 会同时污染命中率与账单。
2. **命中价只有未命中价的 1/31**（flash 谷时 $0.007 vs $0.22）。
   命中率 98% 听起来很好，但剩下 2% 的未命中按 31 倍价计费，再乘 25 万 token 的 prompt，才是账单大头。
   所以本插件的收益计算一律落在「未命中 token × 调用次数」上，不看命中率的面子。
3. **DeepSeek 官方线路分峰谷**：峰时价 = 谷时价 × 2，峰时段为北京时间 09:00–12:00 与 14:00–18:00，
   周六周日全天按谷时计费。非 DeepSeek 线路（gemini / gpt / claude / glm）无峰谷。

价率可信度分两档并显式标注：`list`（官方公开价，可直接对账）与 `estimated`（第三方中转/自建，随合同变动）。
用 `config.overrides[<rateKey>]` 可替换成你的实际结算价。

## 工具

| 工具 | 作用 |
| --- | --- |
| `cg_scan` | 成本归因扫描：按日/按模型/按会话的花费排名、命中率、峰谷占比、跑飞名单，并给出四条杠杆各自的金额 |
| `cg_budget` | 预算闸门：给定会话 id 回报已花费与 `continue / downshift / compact-first / stop` 判定 |
| `cg_verdict` | 结论出口：把扫描压成可执行结论 + 阈值清单 + 业务校验项 |

### 两个收益口径，别混用

- `levers.combined`：**天花板**。把每一笔贵档调用都当作可降档，逐级施加互不重叠归因（先降非 DeepSeek
  线路 → 再降 pro 档 → 压缩 → 谷时）。直接相加各杠杆会重复计数，实测能得到 109% 的假降幅。
- `levers.portfolio`：**落地口径**。只把满足「调用 ≥200 次 + 单次输出 ≤1K token + 工具调用占比 ≥50%
  + 命中率 ≥70%」的会话判为迭代型/机械活并按 90% 分流，其余判为判断型活按 30% 分流。
  差额 `keptPremiumUsd` 是刻意留给需要保留贵档的判断型活的预算。

判据只用离线可观测、可复核的形态指标，不猜语义：这一步的取舍最终必须由业务方按任务类型确认。

## 配置

见 [cordis.patch.yml](./cordis.patch.yml)：`limits`（单会话/单任务/单日美元上限）、
`compactKeepTokens`（上下文保留阈值）、`maxSessions`、`overrides`（实际结算价）。

> `maxSessions` 默认给到 2000。按更新时间截断会把最贵的会话切在名单外——
> 实测上限设 500 时，账单最大的一条（占全量 53%）刚好被丢掉，扫出来的金额少一半。

## 验收方式

```bash
node_modules/.bin/tsc --noEmit        # 类型检查（本包 devDependencies 自带 tsc/vitest）
node_modules/.bin/vitest run          # 19 条单测：价率/峰谷/口径判定/守恒律
node scripts/e2e-live.mjs             # 用真实会话存储驱动真实插件（只读）
```

单测里刻意保留了几条**会咬人的**断言：组合收益各步之和必须等于组合收益（守恒律）、
基线账单不得被算成"已降档"的金额、`prompt` 不得等于 `totalTokens`。这三条都对应过真实 bug。
