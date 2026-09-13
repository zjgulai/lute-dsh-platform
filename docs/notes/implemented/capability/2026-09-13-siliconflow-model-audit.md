# 硅基流动模型清单收窄 25 → 9：「能聊天」和「能干活」之间还隔着两条判据

- 日期：2026-09-13
- 状态：implemented
- 决策记录：ADR-0060
- 相关：[2026-09-13-poyo-relay-route-intake.md](2026-09-13-poyo-relay-route-intake.md)（ADR-0059；本条把同一套准入判据用到第二个提供方，并**补上两条 PoYo 那轮没暴露的判据**）、[2026-09-12-context-compaction-hardening.md](2026-09-12-context-compaction-hardening.md)（ADR-0024；容量表以实测为准）

## Problem

### 用户要的是「照 PoYo 那套再测一遍」，而这一轮的读数推翻了原清单的大半

硅基流动（`gjld`，`https://api.siliconflow.cn/v1`，`api: openai-completions`）是用户 `settings.yaml` 里三条自建路由之一，原清单 25 条。用户要求：用与 PoYo 相同的方法逐模型实测，只保留能测通的、每种类型里最好的。

实测 72 个模型（原清单 25 条 ∪ 站内 `sub_type=chat` 目录 63 条，去重）后，**原 25 条里只有 4 条活到了最后**。原清单的问题不是「挑得不够好」，而是三类硬伤：

| 硬伤 | 条目 | 证据 |
| --- | --- | --- |
| **根本不是对话模型**（图像/视频/ASR/rerank），塞进 `openai-completions` 路由必然失败 | `Tongyi-MAI/Z-Image`、`Z-Image-Turbo`、`Wan-AI/Wan2.2-T2V-A14B`、`XingChenAGI/XingChenASR-V3.2`、`-Ultra`、`-Diarize-V3.0`、`Pro/BAAI/bge-reranker-v2-m3`（7 条） | 对 `/v1/chat/completions` 一律 `400 Model does not exist.` |
| **站方已禁用** | `nex-agi/Nex-N2-Pro`、`Pro/MiniMaxAI/MiniMax-M2.5`（2 条） | `400 Model disabled.`（注意：这两条**已不在**站内 catalog 里，目录层面就查无此模型） |
| **是对话模型但站方不支持工具调用** | `PaddlePaddle/PaddleOCR-VL-1.5`、`deepseek-ai/DeepSeek-OCR`、`tencent/Hunyuan-MT-7B`、`LoRA/Qwen/Qwen2.5-7B-Instruct`（4 条） | `400 Function call is not supported for this model.` |

剩下 12 条虽然能产出 `tool_calls`，仍有 8 条该走：世代太旧（2024 年的 Qwen2.5 系与 `LoRA/` 适配器变体）、与保留项功能完全重叠、或**行为不合规**（见下）。

### 这一轮新发现的两条判据：PoYo 那轮的三关不够

PoYo 那轮的判据是「真发带 `tools` 的请求、看有没有 `tool_calls`，且必须用 `tool_choice: "auto"`」。这轮在硅基流动上撞到两种**能过这一关、却仍然不能干活**的情况：

**① tool_call 的「形状」可以不合规，而且只在多轮里才暴露。** `Qwen/Qwen3.6-35B-A3B` 两轮都产出了 `get_weather` 调用，单看第一关是满分。但把它的 `tool_calls[0]` 原样回灌进下一轮（agent 主循环必然会这么做）时，服务端返回 `400`：

```
0.ChatCompletionMessageFunctionToolCallParam.type
  Input should be 'function' [type=literal_error, input_value=None, input_type=NoneType]
```

即**它返回的 tool_call 对象缺 `type` 字段**。对比同站合规样本 `deepseek-ai/DeepSeek-V4-Pro`：

```json
{"index":0,"id":"01a096f7…","type":"function","function":{"name":"get_weather","arguments":"{\"city\": \"Shenzhen\"}"}}
```

**单轮测试永远发现不了这个**——只有「回灌 tool 结果」这一步才会让服务端校验这个字段。DSH 的 agent 循环每轮都要回灌，所以这条不合格 = 每次工具调用后的那一轮必崩。

**② 间歇性失败会被两轮测试蒙混过去。** 对 `Qwen/Qwen3.6-35B-A3B` 追加 6 轮重复：**4 轮正常、2 轮完全不产 tool_call**（33% 静默失败）。同一批次里它两轮全过，正是靠运气。

于是判据从 PoYo 的两关升为**四关**（见「决策」1）。

### 附带确认：站内「免费/付费档」与「模型新旧」都不是质量信号

- `Pro/` 前缀 = 付费档，无前缀 = 免费档。**保留的 9 条全部是无前缀免费档**，包含旗舰 `DeepSeek-V4-Pro`。付费档在这轮实测里没有一条赢过免费档（`Pro/zai-org/GLM-5.1`、`Pro/deepseek-ai/DeepSeek-R1`、`Pro/moonshotai/Kimi-K2.6` 都通过了门禁，但在同族里都不是最优）。
- 同名族的「Instruct」版本反而更差：`Qwen/Qwen3-VL-{8B,30B-A3B,32B}-Instruct` 三个**全部不产 `tool_calls`**，而同尺寸的 `-Thinking` 版本全部通过。这与 PoYo 那轮「旗舰/Instruct 反而不可用」同型。

## Decision

### 1. 准入判据升为四关，逐关实测，缺一不可

| 关 | 判据 | 为什么不能省 |
| --- | --- | --- |
| ① 上游可达 | `/v1/chat/completions` 非 400/404 | 挡掉非对话模型与已禁用模型 |
| ② 工具产出 | `tool_choice:"auto"` 下产出 `tool_calls`，且名字正确 | 挡掉「能聊天不能干活」；**必须 `auto`**，`required` 会造假阴性 |
| ③ 形状合规 | 该 `tool_call` 带 `type:"function"`，**回灌 tool 结果后仍 200 且正文非空** | 单轮测不出；agent 循环每轮都要回灌 |
| ④ 稳定性 | 重复 ≥3 轮全部通过 | 挡掉间歇静默失败（实测见过 33%） |

另设 3 项**同分决胜抽测**（不是准入门槛，只用于并列时的排序）：不该调工具时是否乱调、严格 JSON 输出、约 1 万 token 海捞针。

### 2. 清单收窄为 9 条：每族留一条当代最好的 + 每个不重叠角色一条

| 模型 | 上下文（实测） | 角色 | 门禁中位延迟 |
| --- | --- | --- | --- |
| `zai-org/GLM-5.3` | 1048576 | GLM 旗舰 | 1074 ms |
| `deepseek-ai/DeepSeek-V4-Pro` | 1048576 | DeepSeek 旗舰 | 2264 ms |
| `deepseek-ai/DeepSeek-V4-Flash` | 1048576 | DeepSeek 快速层 | 728 ms |
| `Qwen/Qwen3.5-122B-A10B` | 262144 | Qwen 旗舰（全表最快） | 562 ms |
| `Qwen/Qwen3-VL-32B-Thinking` | 65536 | 视觉 | 2045 ms |
| `moonshotai/Kimi-K2.7-Code` | 262140 | 代码 | 2290 ms |
| `tencent/Hy4-preview` | 1048576 | 混元新代 | 1115 ms |
| `stepfun-ai/Step-3.5-Flash` | 262144 | 阶跃轻量 | 995 ms |
| `meituan-longcat/LongCat-2.0` | 1048576 | 长上下文 | 2498 ms |

9 条全部通过四关，且 3 项抽测满分。4 条原清单幸存（`GLM-5.3`、`DeepSeek-V4-Pro`、`Step-3.5-Flash`、`LongCat-2.0`），5 条新补。

### 3. 剔除 21 条，逐条给理由

前 13 条见 Problem 的三类硬伤（7 条非对话 + 2 条禁用 + 4 条不支持工具）。其余 8 条：

| 条目 | 剔除理由 |
| --- | --- |
| `Qwen/Qwen3.6-35B-A3B` | **③ 形状不合规**（tool_call 缺 `type`，回灌 400）+ **④ 不稳定**（6 轮里 2 轮不产 tool_call） |
| `zai-org/GLM-4.5V` | 抽测 2/3：把工具调用语法当正文吐出来（`<|begin_of_box|>get_weather\n<arg_key>city</arg_key>…`），海捞针答案也被 `<|begin_of_box|>` / `<|end_of_box|>` 包裹——控制符漏进用户可见文本 |
| `ByteDance-Seed/Seed-OSS-36B-Instruct` | ③ 回灌后 `200` 但**正文为空**，agent 循环走不下去 |
| `zai-org/GLM-4.5-Air` | 过四关且 3/3，但同族 `GLM-5.3` 更强且**快一倍**（1074 vs 2197 ms），重复 |
| `LoRA/Qwen/Qwen2.5-{14B,32B,72B}-Instruct`、`Pro/Qwen/Qwen2.5-7B-Instruct` | 过第一关，但属 2024 年 Qwen2.5 世代（`LoRA/` 还是适配器变体），与保留的当代旗舰完全重叠 |
| `deepseek-ai/DeepSeek-OCR` | 已含在上面（站方明确不支持工具） |

未被保留但**确实可用**的同族备选（供将来替换，不是废品）：`zai-org/GLM-5.2`、`Pro/zai-org/GLM-5.1`、`deepseek-ai/DeepSeek-V3.2`、`Pro/deepseek-ai/DeepSeek-R1`、`Qwen/Qwen3.8-27B`、`Qwen/Qwen3.5-35B-A3B`、`Pro/moonshotai/Kimi-K2.6`——全部四关通过、抽测 3/3。

### 4. 上下文窗口一律实测，不用文档值

方法：向 `/v1/chat/completions` 发 ~130 万 token 的超长 prompt，从 `400` 报文取精确值（**被拒请求不计费**，因此这一维度的测量是免费的）。例：

```
number of input tokens (1300006) has exceeded max_prompt_tokens (1048576) limit.
This model's maximum context length is 262144 tokens. However, you requested 8 output tokens and your prompt contains at least 262137 input tokens…
```

`moonshotai/Kimi-K2.7-Code` 实测 `262140`（不是文档常写的 262144），照实写入。未声明的模型继续落到 `defaultContextWindow: 65536` 兜底。

### 5. 验收以「运行中的进程读到了」为准

`settings.yaml` 写入后，用动态 Cordis Host 包直读活着的 `llm` 注册表：`gjldCount=9`，9 条 id 与文件逐项一致——**DSH 进程未重启**（`providerCount=10` 不变），证明是热重载生效。

## Alternatives considered

- **全量保留 25 条。** 否决：其中 13 条在当前 API 上必然报错，模型选择器里出现不能用的行 = 每次误选都是一次失败回合。
- **只按「能不能连上」筛（即只留 ① 关）。** 否决：这样会留下 `Qwen3.6-35B-A3B` 这类「测试能过、真跑就崩」的模型——正是这一轮最有价值的发现。
- **只做两轮工具测试（沿用 PoYo 判据）。** 否决，且这正是本轮踩到的坑：两轮全过的 `Qwen3.6-35B-A3B` 在 6 轮里暴露 33% 静默失败、在回灌时暴露 400。判据不升级就发现不了。
- **保留付费档旗舰当兜底。** 否决：实测没有一条付费档在同族里胜出，多留只会让清单变长。若将来免费档限流成为问题，`Pro/` 三条（`GLM-5.1` / `DeepSeek-R1` / `Kimi-K2.6`）已记录可随时补位。
- **把视觉位留给 `zai-org/GLM-4.5V`（原清单里的那条）。** 否决：它把工具调用语法漏进正文；`Qwen/Qwen3-VL-32B-Thinking` 四关全过、抽测 3/3，是更干净的替换。
- **把 `Qwen/Qwen3.8-27B` 也留下（更新一代）。** 否决：角色与 `Qwen3.5-122B-A10B` 完全重叠，而后者更大、且快 4.5 倍。按「每族留最好一条」剔除，并记进备选名单。

## Consequences

**正面**

- 模型选择器里不再有必然报错的行；25 → 9 的每一条剔除都带可复现的证据（HTTP 状态码或逐轮读数）。
- 准入判据从三关补到四关，**新增的第 ③ 关（回灌验证）和第 ④ 关（多轮重复）是在这一轮才被发现的**，对任何后续接入（第三方中转或首方聚合站）都直接可用。第 ③ 关尤其重要：它检查的是 agent 循环的**第二步**，单轮测试覆盖不到。
- 容量表全部实测，且测量方法被证明是**零成本**的（被拒请求不计费），可以随时复测。
- 「Instruct 版比 Thinking 版差」在这两个提供方上重复出现（PoYo 的 Claude 系、这里的 Qwen3-VL 系），已可作为接入时的先验。

**负面 / 待办**

- 清单从 25 条砍到 9 条，**同族没有冗余**：某一条上游抖动时没有同族替补。备选名单已写入本文档，但「自动降级」没做。
- `tencent/Hy4-preview` 名字里带 `preview`，站方可随时下架或改行为；它通过了四关与抽测，但 preview 语义本身不受控。
- 本轮只测了**工具链路**，没有测代码/推理质量。9 条之间「谁更聪明」没有结论——抽测 3 项在同分区间内**没有区分度**（18 个候选里 15 个满分）。延迟数字只反映轻量请求，不代表长上下文表现。
- `Pro/` 付费档全部落选是**本轮免费档额度充裕**前提下的结论；限流策略变化后需重测。
