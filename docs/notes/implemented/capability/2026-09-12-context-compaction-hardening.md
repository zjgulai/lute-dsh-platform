# 上下文压缩加固：取证、根因与落地（2026-09-12）

> 对应 ADR：[ADR-0024](../../../adr/ADR-0024.md)。本文件是本次压缩加固的**唯一事实源**。
> 所有结论附复现命令与实测输出；未实测的一律标注「未覆盖」。

## Problem

跨模型切换与硅基流动（中转站）场景下，用户反复遇到「上下文溢出、回合中止」，自动压缩疑似不触发。

取证结论：**压缩链路存在且在工作，但四重缺陷串联导致它在关键路径上失效**。

### 取证方法与证据

| 动作 | 结果 |
| --- | --- |
| 读 `dsh-compaction-basic` / `dsh-token-meter` / `pi-ai/dist/utils/overflow.js` 全量源码 | 拿到触发链路与阈值算法 |
| 解压 09-10 / 09-11 真实会话日志，关联 `compaction/*` 与 `request/context` 事件 | 拿到历史溢出完整现场 |
| 对硅基流动 `POST /v1/chat/completions` 发超长请求 | 拿到 provider 真实上限与 400 报文格式 |
| 用 deepseek 官方 tokenizer 量中文样本 | 1.81 chars/token |
| 把真实 400 报文喂进 DSH 的溢出分类器 | `false` |
| `standingKeyFor()` 真挂载校验（含对照实验） | 拿到预设互斥的平台约束 |

### 缺陷 1 · 压力触发在中文场景晚到 2.21 倍（P0）

`dsh-token-meter/lib/types/estimate.js` 用 `CHARS_PER_TOKEN = 4` 估算。实测中文密集样本（16,566 字）：

```
真实 prompt_tokens = 9160      → 1.81 chars/token
启发式 chars/4     = 4139      → 低估 2.21 倍
```

代入 `thresholdRatio: 0.75` 与 `contextWindow: 262144`：

```
名义触发 = 262144 × 0.75 = 196,608（估算口径）
换算真实 ≈ 196,608 × 2.21 ≈ 434,000 真实 token
```

即 **`thresholdRatio: 0.75` 实际等价于「真实上下文的 166% 才触发」**，永远够不着。

### 缺陷 2 · provider 溢出报文不被识别为溢出（P0）

实测硅基流动 400 报文：

```json
{"code":20015,"message":"number of input tokens (150019) has exceeded max_prompt_tokens (98304) limit."}
```

两个分类器均不匹配：

| 分类器 | 位置 | 结果 |
| --- | --- | --- |
| pi-ai `isContextOverflow` 的 24 条正则 | `pi-ai/dist/utils/overflow.js` | 全部不匹配 |
| `isContextWindowExceededError` | `dsh-llm/lib/index.js:145` | `false` |

后果链：`classifyPiAiError` 判为 `INVALID_REQUEST` → `compaction-basic` 的
`agent/request-error` 钩子首行 `if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE) return next()` 直接放行
→ `llm-retry` 对 `INVALID_REQUEST` 不重试 → **回合硬中止**。

对照：同站的 `Qwen/Qwen3.6-35B-A3B` 报文为 `This model's maximum context length is 262144 tokens.`，
命中 index 8 的正则。**同站不同模型行为不一致**，解释了「时好时坏」。

### 缺陷 3 · 摘要调用携带完整前缀，用满上下文的模型做摘要必然自锁（P0）

`buildSummarizationInput` 打包「完整 system prompt + 全部工具 schema + 全部被遮蔽对话」回发给
`summarizeWithLlm`。本项目会话 system + tools 常达数万 token，故 26 万 token 的会话做摘要时是
30 万 token 的请求 —— 打给同一个已满模型，必然再溢出。09-10 日志成对出现：

```
step compaction failed: pi-ai detected context overflow for model "zai-org/GLM-5.3"; continuing the turn
context-overflow compaction failed: pi-ai detected context overflow for model "zai-org/GLM-5.3"; preserving the original request error
```

### 缺陷 4 · 摘要模型配置未生效（P1，历史）

09-11 会话中 6 次 `compaction/summary` 的 `provider` 全部是 `gjld` / `modlens-gjld` 的 `GLM-5.3`，
而非 `settings.yaml` 声明的 `deepseek-official/deepseek-v4-flash`。时间线核对：09-10 溢出发生时
`settings.yaml` 尚无 `compaction-basic` 段，摘要落到对话路由 —— 与缺陷 3 是同一现象的两种触发方式。

### 附带发现 · 实测容量表与配置严重错配

逐模型实测（对 `/v1/chat/completions` 发超长请求，从 400 报文取精确值）：

| 模型 | 文档标称 | provider 实测 | 旧配置（默认值） | 错配 |
| --- | --- | --- | --- | --- |
| `zai-org/GLM-4.5-Air` | 131K | **98304** | 262144 | 4.4 倍必死区 |
| `zai-org/GLM-4.5V` | 131K | **65536** | 262144 | 4 倍必死区 |
| `Qwen/Qwen3.6-35B-A3B` | 262K | 262144 | 262144 | 边界 |
| `stepfun-ai/Step-3.5-Flash` | — | 262144 | 262144 | 边界 |
| `ByteDance-Seed/Seed-OSS-36B-Instruct` | — | 262144 | 262144 | 边界 |
| `zai-org/GLM-5.3` | 1049K | ≥700000 | 262144 | 过早压缩 |
| `deepseek-ai/DeepSeek-V4-Pro` | 1049K | ≥700000 | 262144 | 过早压缩 |
| `meituan-longcat/LongCat-2.0` | 1049K | ≥700000 | 262144 | 过早压缩 |
| `Pro/MiniMaxAI/MiniMax-M2.5`、`nex-agi/Nex-N2-Pro` | — | `403 Model disabled` | 262144 | 该 key 不可用 |

**结论：不能采信文档，必须实测。** 硅基流动 `/v1/models` 只返回 `id/object/created/owned_by`，
**不提供容量**，harness 无法自动校准。

### 附带发现 · 活体复现 `MAX_TOKENS` 截断（P0）

执行期用 `compact_now` 探针在本会话触发一次压缩，实测：

```
compaction/start  1789144728744
compaction/end    1789144764618  error: summarization truncated at the token cap (incomplete checkpoint)
>>> 压缩耗时 35874 ms
```

35.9 秒（不是秒退）证明是真跑满输出预算后截断，而非配置未生效。当时
`maxTokens: 16384`，而对话已 257,251 token，六段式 checkpoint 加 reasoning token
超出预算。修正为 `49152`（已实测 provider 接受 `max_tokens=65536`，200 OK）。

## Decision

1. **A1 容量表实测化**：`gjld` 路由 25 个模型逐个写入实测 `contextWindow`，
   并设 `defaultContextWindow: 65536`（站内最小值兜底，替代 pi-ai 的 262144）。
2. **A2 阈值按估算口径折算 + 摘要路由解耦**：
   `thresholdRatio 0.75 → 0.45`（真实 ≈ 99%）、`retainRatio 0.12`、`maxTokens 49152`、
   `summarizationProvider/Model` 固定到 `deepseek-official/deepseek-v4-flash`（1M 窗口、非思考、跨厂商）。
3. **B 确定性压缩后端按需切换**：安装 `@aiwayds/dsh-dcp@0.11.0`，复制发行 `cordis` 为
   `lute-cordis` 并把压缩行换成 dsh-dcp（零模型调用、CJK 感知计量、`onModelSwitch: auto`）。
   **`lute-cordis` 不设为默认**，默认保持发行 `cordis`。
4. **C 观测与验收**：`dsh-context`（已装 0.47.0）提供 Context 面板与 `/context`；验收以会话日志的
   `compaction/start → summary → end` 三件套为准。
5. **上游缺陷不本地打补丁**：缺陷 2 与平台单例约束走 issue 提报。

### 关键约束（实测，勿"修复"）

**同一进程只能挂载一个 cordis 类预设。** `dsh-tool-cordis` 的每个实例都注册进程级单例
inspect provider，而 agent preset 的常驻挂载永久存活：

```
agent-presets: preset "lute-cordis" failed to mount:
  failed to apply loader entry tool-cordis (@deepseek-ai/dsh-tool-cordis):
  Host Cordis inspect provider "Service" is already registered
```

归因实验（三次）：

| # | 对象 | 结果 |
| --- | --- | --- |
| 1 | `standingKeyFor('cordis')` | MOUNTED OK |
| 2 | `standingKeyFor('lute-cordis')`（含 dsh-dcp 改动） | FAILED |
| 3 | **逐字未改动**的 `cordis` 副本 `plain-cordis` | **FAILED** ⇒ 与本仓库改动无关，是平台约束 |
| 4 | `lute-cordis` 剥离 `tool-cordis` 行 | **MOUNTED OK**，且 `compaction-basic <- dsh-dcp，fiber=2`（真激活） |

故 `lute-cordis` 的 `tool-cordis` 行**永久 `disabled: true`**（文件内已写归因注释），
代价是本模式无 `cordis_mount` 自我改造能力。

宿主 patch **触达不到预设子树**：`--dump-config` 中预设行数为 0，`~/.dsh/cordis.patch.yml` 不存在。
故不存在"保留默认 cordis 又全局换压缩后端"的路径。

## 已落地的改动清单

| 层 | 对象 | 改动 |
| --- | --- | --- |
| 设置层 | `~/.dsh/settings.yaml` | `llm-pi-ai.providers.gjld`：25 模型 `contextWindow` + `defaultContextWindow: 65536` |
| 设置层 | `~/.dsh/settings.yaml` | `compaction-basic`：`thresholdRatio 0.45` / `retainRatio 0.12` / `maxTokens 49152` / `retries 1` / 摘要路由 deepseek-official |
| 设置层 | `~/.dsh/settings.yaml` | `agent-presets.default: cordis`（保持发行预设） |
| profile | `~/.dsh/profiles/desktop/package.json` | 依赖 + bundles 增加 `@aiwayds/dsh-dcp@0.11.0` |
| 预设 | `~/.dsh/.agent-presets/lute-cordis/` | 发行 `cordis` 的副本；压缩行换 dsh-dcp；`tool-cordis` 永久 disabled |

备份：`.scratch/compaction-hardening/backup-20260912-004029/`（settings.yaml / package.json /
cordis.patch.yml / pnpm-lock.yaml 四件套 + SHA256 指纹）。

## 验收（分层）

| 层 | 检查 | 结果 |
| --- | --- | --- |
| L1 语法 | `js-yaml` 解析 settings.yaml | ✅ 15 顶层键 |
| L1 组合 | `dsh --dump-config --profile desktop` | ✅ 181 行，无解析错误，`dsh-dcp` 落位 |
| L1 形状 | 预设 YAML + 行名完整性（注册 `!!js` 标签） | ✅ 31 行 / 3 组 / 0 坏行；与发行原件差异仅 compaction 一行 |
| L2 契约 | `dsh-dcp` 上游测试套件 | ✅ 101/101 |
| L2 契约 | ESM 解析：harness base 解析 6 个依赖；预设行绝对路径可 import；`DcpEngine.Config` 接受合并配置 | ✅ ALL PASS |
| L3 挂载 | `agentPresets.standingKeyFor('lute-cordis')` | ✅ MOUNTED OK，后端 = dsh-dcp，`fiber=2` |
| L4 运行时 | 本会话压缩事件（修正前） | ❌ `compaction/end.error = summarization truncated at the token cap (incomplete checkpoint)`，35,874 ms，无 summary |
| L4 运行时 | 本会话压缩事件（修正后） | ✅ `compaction/end` 无 error；`compaction/summary` 产出 14,736 字符；摘要以 `<compacted-summary>` 注入下一请求；会话续跑未溢出 |
| — | `dsh-context` Context 面板目视 | 未覆盖（需 GUI 观察） |
| — | 硅基流动模型实测对话（改容量表后） | 未覆盖（需用户实际切换模型使用） |

## Alternatives considered

- **改 `dsh-llm` 溢出正则（profile override）** —— 否决，见 ADR-0024。
- **改 `dsh-token-meter` 的 `CHARS_PER_TOKEN`** —— 否决。它是全局共享估算器，改常数会影响所有
  路由与 UI 上下文环；用阈值折算达到同等效果且零核心改动。
- **把 `lute-cordis` 设为默认** —— 否决，代价是失去自我改造能力；改为按需切换。
- **只用官方 compaction-basic** —— 保留为默认路径，因为 A 层已覆盖八成故障，且确定性后端
  丢失语义摘要能力。
- **等上游修 `max_prompt_tokens` 正则再动手** —— 否决。上游观察窗（ADR-0006）以月计，
  而容量表与阈值折算是本地可立即闭环的。

## Consequences

- 正面：长中文会话与频繁切模型场景下，「压缩从不触发 → provider 拒绝 → 回合中止」链条被切断。
- 正面：确定性后端把「摘要模型调用失败」整类故障归零。
- 负面：多一个预设与一条使用约定（结构改造用创造模式 / 长会话用压缩加固模式）。
- 负面：新增外部运行时依赖 `@aiwayds/dsh-dcp`，版本漂移风险登记在案（其 peer 声明
  `>=0.1.5-rc.2`，本机 `0.1.2-rc.1`；实测 6 个覆盖点全部存在，属文本漂移）。
- 待跟进：上游 issue 两条（溢出报文正则 / inspect provider 单例）。
- 待复验：`maxTokens: 49152` 后本会话压缩是否成功（见会话日志 `compaction/*`）。

## L4 运行时复验（2026-09-12，会话 c9d8e26b）

同会话、同对话内容下的**干净 A/B 对照**——唯一变量是 `maxTokens`（`16384` → `49152`），
改动落盘于本地 00:58:14（= 16:58:14Z），第二次压缩执行于 17:00:27Z，顺序确定。

| # | compactionId | 起点 (UTC) | 耗时 | summary | error |
| --- | --- | --- | --- | --- | --- |
| 1 | `1e5dcda1…` | 16:38:48.744 | 35,874 ms | 无 | `summarization truncated at the token cap (incomplete checkpoint)` |
| 2 | `9976ad12…` | 17:00:27.471 | 21,820 ms | 14,736 字符 | 无 |

闭环链条（seq 为会话日志序号）：

1. `115101 turn/end` → `115102 compaction/start`（`turn: null`，即回合末触发的压缩）
2. `115103 agent/inbox/spliced` → `115104 compaction/summary`（14,736 字符）
3. `115105 user/message`（15,077 字符）= 包装后的 `<compacted-summary>`，正文以
   `This is an automatically generated checkpoint condensing an earlier span…` 开头
4. `115106 compaction/end`（无 error）→ `115107 turn/start` → `115114 request/header`

要点：

- 第 2 次**更快**（21.8s < 35.9s）且产出更短，说明第 1 次是**撞满输出预算被截断**，
  而非自然写完。原 16,384 的输出预算里含 reasoning token，实际可用于 checkpoint 的更少。
- 摘要确实被注入：`compaction/summary` 的内容与 `user/message` 逐字一致，只是外面包了
  checkpoint 前言与 `<compacted-summary>` 标签。
- `request/header` 中**不含**摘要正文属预期：该事件只记录 `config`/`adapterDefaults`/
  `system`/`tools` 静态部分，对话历史不在其中，不能据此判断注入失败。

