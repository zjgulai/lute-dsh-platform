# VOD 中转路由加固 · 方案与执行 TODO

> 起因：用户要求「把 设置-模型 页面新增的 vod 模型的中转路由调整通畅，不要再遇到调用 gpt-6-astra 时的报错」。
> 前置证据：`session-72993437`（本仓库，2026-09-16）874 次工具调用的全量错误盘点，见会话报告。
> 本文件只记**结论与读数**；事实的家在 `~/.dsh/settings.yaml`（provider 配置）与实测命令输出里。

---

## 0. 先说结论：用户的前提需要修正

用户把两件事合成了一件。实测证明它们**可分离，且只有一件能靠改路由解决**。

| # | 事项 | 次数 | 病因在哪一层 | 改路由配置能修吗 |
|---|---|---|---|---|
| A | 工具参数被拒（`sandbox_permissions` / 空 justification） | 47 | **模型自己发出的 tool-call 参数**，在 relay 的上游 | **不能** |
| B | 429 限流 | 3（1 次事件） | relay 返回的 HTTP 状态 | 能（退避策略） |
| C | 300s 流空闲超时 / TRANSPORT | 8 | `provider=deepseek-official`，与 vod 无关 | 不适用 |

**A 类的最硬证据**（`session-72993437` turn1 step6，同一条 assistant 消息内）：

- 文字：「刚才是我的工具参数错误：当前已是 `danger-full-access`，却仍传入了升级参数…**接下来去掉该参数**重新检查。」
- 实际发出的参数：`"sandbox_permissions": "workspace-write"`

即**诊断正确、动作相反**。这一类报错与中转线路无关——relay 从未收到过这些请求。

**路由分布**（`model/selection` × `tool/result` 交叉统计）：

| 路由 | 活跃时长 | 参数层失败 | 携 `sandbox_permissions` 的调用 |
|---|---|---|---|
| `vod/gpt-6-astra` | ≈10 min | **46** | 47 / 66 |
| `deepseek-official/deepseek-flash` | ≈3h45m | 1（切换瞬间在途） | **0 / 808** |

---

## 1. 路由实测读数（2026-09-16 23:5x–00:0x，真实调用，非推断）

中转：`https://mmu.vod-qcloud.com/v1`，模型 `gpt-6-astra`。

| 探测 | 请求 | 读数 |
|---|---|---|
| P1 | `GET /v1/models` | **200**，57 个模型；已声明的 7 个全部在列 |
| P2 | `max_tokens` 基线 | 200 |
| P3 | `max_completion_tokens`（pi-ai 默认发的字段） | **200** |
| P4 | `+ store:false` | 200 |
| P5 | `+ reasoning_effort` | 200 |
| P6 | `developer` role | 200 |
| P7 | 流式 + `stream_options.include_usage` | 200，含 usage 块 |
| P8 | 流式 + `tools` / `tool_calls` | 200，正确产生 tool_calls |
| P9 | `reasoning_effort` ∈ {minimal,low,medium,high,max} | **全部 200** |
| P10 | 连续 8 次快发 | 全部 200，**未触发限流** |
| P11 | 17,256 字符（13,511 prompt tokens）流式 | 200，首字节 2.50s，总 2.52s |
| P12 | `GET /v1/models/gpt-6-astra` | 404（**拿不到窗口字段**） |

### 由此确定的三条判断

1. **不设 `compat` 纠偏。** `pi-ai` 的 `detectCompat()` 对 `mmu.vod-qcloud.com` 不做特判（只认 deepseek/zai/moonshot/together/nvidia/cerebras/ant-ling 等），故默认发 `max_completion_tokens`、`store`、`developer` role、`reasoning_effort`、`stream_options.include_usage`——**实测这些全部被接受**。P4 的 `compat` 段是针对 `api.poyo.ai` 的 schema 定制的，**照搬会引入风险而非消除风险**（P-07 的反向：把别处的补丁搬到不需要它的地方）。
2. **唯一真实缺口是 `retryPolicy`。** `vod` 是 `settings.yaml` 里**唯一没有 `retryPolicy`** 的中转线（`lute` / `gjld` / `poyo` / `poyo-responses` 都有）。默认策略为 `maxRetries:5, initialDelayMs:500, maxDelayMs:10000, jitterRatio:0.1`，实测 429 时三次退避仅 459ms / 1098ms / 1982ms。且 **`dsh-llm` 不处理 `Retry-After`**（`grep` 源码为空）——服务端让你等多久，客户端根本不看。
3. **`defaultContextWindow` 不动。** 缺省吃 262144，而该模型真实窗口**未实测**（P12 拿不到）。按本仓库既有同类推理（`poyo` 段注释：「估低只会让压缩早触发，估高会直接 400，故宁低勿高」），**在不知道真值时不改动**——改小会改变压缩时机，是有代价的决策，需用户拍板或授权探测。

---

## 2. 执行 TODO（执行结果）

### T1 · 备份与回滚路径（R1）— ✅ 完成
- [x] 备份 → `~/.dsh/settings.yaml.bak-vod-20260917-000447`
- [x] 改动前 `settings.yaml` sha256 = `b3b64d5fc319b58cbc4d85d6504ec38b82dbc43b57b899572fdcb950c92b333e`
      （备份文件 sha256 与之一致，逐字节可回滚）
- [x] vod 段原始范围 = 第 207–218 行

### T2 · 路由配置加固（R2，本次唯一的写动作）— ✅ 完成
- [x] `vod` 补 `displayName: VOD 中转`
- [x] `vod` 补显式 `retryPolicy`：`maxRetries:5`，`backoff:{initialDelayMs:2000, maxDelayMs:30000, jitterRatio:0.2}`
- [x] P1–P12 的实测事实写成段内注释（「为什么这里没有 compat」留痕，防止下一个人照 poyo 补一遍）
- [x] **未新增** `compat` / **未改** `defaultContextWindow` / **未改**模型清单

**配置被实现接受（不是肉眼看 YAML）**：把改后的段喂给**装在本机的** `dsh-llm`：

```
新配置被接受 -> {"mode":"normal","maxRetries":5,
  "retryableCodes":["EMPTY_RESPONSE","RATE_LIMIT","SERVER","TIMEOUT","TRANSPORT"],
  "initialDelayMs":2000,"maxDelayMs":30000,"jitterRatio":0.2}
旧默认退避(ms): 500 → 1000 → 2000 → 4000 → 8000      六次总等待 15500 ms
新配置退避(ms): 2000 → 4000 → 8000 → 16000 → 30000   六次总等待 60000 ms
```

YAML 解析校验通过；provider 键顺序 `lute, gjld, kimi-coding, poyo, poyo-responses, vod` 无丢失。

### T3 · 生效性验证 — ✅ 完成（结论：**不需要重启**）

读 `@deepseek-ai/dsh-settings-file/lib/index.js`（settings.yaml 的存储实现）：

- 第 3 行 `import { watch } from "chokidar"`
- 第 180 行 `const watcher = this.spec.watch ? watch(await canonicalizeWatchPath(this.spec.filename), {…})`
- 第 188 行 `watcher.on("all", () => { … })` → 重新读取
- 模块自述：**"external edits hot-publish through the seam"**，且「每次写入都在跨进程写锁下重读文档，以保留注释的叶级 diff 打补丁」

⇒ **外部编辑 settings.yaml 会被热发布；且我写的注释在后续 UI 写入后仍然保留。**
⇒ `llm-pi-ai` 自述 `displayName` 与 `retryPolicy` 属 `registrationFacts`，改动会「原地重注册同一 adapter 实例」— 两条改动都落在热更新路径上。

**未能验证的一环（诚实标注）**：本会话没有浏览器桥（`no browser extension is connected`），
且 `vod` 不在 `subagent-model-selection.allowedModels` 里（`list_subagent_models --provider vod`
返回 `not allowed for this Session`），所以我**无法从会话内做端到端确认**。
用户可在 10 秒内自行确认：打开 设置 → 模型，`vod` 行的名字应从裸键变成 **VOD 中转**。

### T4 · 行为层（路由修不掉的那部分）— ✅ 结论已定
- [x] A 类 46 次失败与 vod 路由无关（relay 从未收到这些请求；见 §0 证据）
- [x] 可执行护栏：agent 长任务不落在 `vod/gpt-6-astra`
- [x] 已知事实：`vod` **不在** `subagent-model-selection.allowedModels` 里 → 子代理默认用不到它；
      主会话的每轮模型仍由用户/会话记录决定（`agent-default-model` = `deepseek-official/deepseek-flash`，是安全的）

### T5 · 后续提案（不在本次执行范围）
- [ ] `defaultContextWindow` 探测：需要用户授权一次 130k+ token 的真实调用以测出下界；
      成本未知，且改小会改变压缩时机 —— **属 R2，需拍板**
- [ ] 宿主侧硬化：会话已处于最宽沙箱模式且审批关闭时，从工具 schema 隐去
      `sandbox_permissions` / `justification` —— 属**基座改动**（[ADR-0008] 基座只 pin 不改），须单独立项
- [ ] `dsh-llm` 支持 `Retry-After`（当前完全忽略）—— 属上游能力，提 issue 而非本地改

---

## 3. 非目标（本次明确不做）
- 不改 `packages/` 下任何仓库代码
- 不扩列模型清单（relay 有 57 个，声明 7 个是产品决策）
- 不碰 `docs/pitfalls-playbook.md` / `scripts/gate.mjs` / `.scratch/review/`（父会话 turn 7 正在写这三处）
- 不重启 DSH

## 4. 失败边界
- 若改后 `/v1/models` 或一次最小调用返回非 200 → 立即回滚到 T1 的备份
- 若设置页仍显示裸键 `vod` → 说明外部编辑未被 watch，告知用户需重启（由用户执行，我不代劳）
