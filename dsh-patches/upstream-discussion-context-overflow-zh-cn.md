# 自动压缩在中文密集会话与大陆中转站下失效：两类根因 + 实测证据

**环境**：DSH Desktop 2.0.5 / harness `0.1.2-rc.1`（macOS arm64）
**触发场景**：中文为主的编码会话 + 硅基流动（`api.siliconflow.cn/v1`，openai-completions 协议）+ 跨模型切换
**症状**：上下文溢出后回合直接中止；`/compact` 或 `compact_now` 也失败

我在本机做了完整取证，确认这是**两个互相独立的根因**，都会让自动压缩在关键路径上静默失效。源码行号按 `0.1.2-rc.1`。

---

## 根因 1（P0）：provider 的溢出报文不被 `isContextWindowExceededError` 识别 → 溢出恢复分支永不执行

### 实测报文

硅基流动在超长输入时返回 HTTP 400：

```json
{"code":20015,"message":"number of input tokens (150019) has exceeded max_prompt_tokens (98304) limit."}
```

### 分类结果

`@deepseek-ai/dsh-llm` 的 `isContextWindowExceededError`（`lib/index.js:145`）
与 pi-ai 的 24 条 `OVERFLOW_PATTERNS`（`pi-ai/dist/utils/overflow.js`）**全部不匹配**：

```
$ node --input-type=module -e "import {isContextWindowExceededError} from './dsh-llm/lib/index.js';
  console.log(isContextWindowExceededError('number of input tokens (150019) has exceeded max_prompt_tokens (98304) limit.'))"
false
```

对照：同站另一模型的报文格式是命中的，所以**同站不同模型行为不一致**（这解释了「时好时坏」的观感）：

```
$ node ... "This model's maximum context length is 262144 tokens. ..."
true     # 命中 OVERFLOW_PATTERNS[8] /maximum context length is \d+ tokens/i
```

### 失败链

1. `classifyPiAiError` 把 HTTP 400 判为 `INVALID_REQUEST`，不是 `CONTEXT_WINDOW_EXCEEDED`
2. `dsh-compaction-basic` 的溢出恢复钩子首行即放行：
   `if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE || signal.aborted) return next()`（`lib/index.js:805`）
3. `dsh-llm-retry` 对 `INVALID_REQUEST` 不重试
4. → **回合硬中止，从不压缩、从不重试**

### 建议

把这类报文纳入分类器。最小改动是给 `OVERFLOW_PATTERNS` 与 `isContextWindowExceededError`
补两条模式（`max_prompt_tokens` 与「N input tokens 超过 max_prompt_tokens(M)」），
并考虑纳入 `max_prompt_tokens` / `max_input_tokens` 这类「输入侧上限 ≠ 模型上下文长度」的措辞。

---

## 根因 2（P0）：`token-meter` 的 `chars/4` 估算让中文会话的阈值晚到 2.21 倍

`dsh-token-meter/lib/types/estimate.js` 用固定 `CHARS_PER_TOKEN = 4`。

### 实测

取本机一天前真实会话中 12 段中文密集内容（16,566 字），用 deepseek 官方 tokenizer 实测：

```
真实 prompt_tokens = 9160      → 1.81 chars/token
启发式 chars/4     = 4139      → 低估 2.21 倍
```

### 后果

`compaction-basic` 的 `thresholdRatio` 是**估算口径**的比例，于是：

```
thresholdRatio: 0.75, contextWindow: 262144
名义触发 = 196,608（估算口径）
换算真实 ≈ 196,608 × 2.21 ≈ 434,000 真实 token
```

**`thresholdRatio: 0.75` 实际等价于「真实上下文的 166% 才触发」** —— 永远够不着，
provider 早在真实上限处就拒绝了。中文比重越高越严重（英文会话偏差小得多）。

这同时解释了为什么加 `maxOverflowRetries` / `compactionRetries` 都没用：
压力触发根本没到，而溢出的那条路被根因 1 切断了。

### 建议

不必改全局常数（它同时服务 UI 上下文环，改动面太大）。可用其中任一：
- 在 `estimate.ts` 里对 CJK 区间按加权密度估算（例如按 CJK 字符占比在 4 与 ~1.8 之间插值）；
- 或让 `thresholdRatio` 的语义改为「真实口径」，由 `compaction-basic` 内部按同一估算器做折算；
- 至少应在文档里写明 `thresholdRatio` 是估算口径，并在 CJK 会话下提示折算系数。

---

## 附带（同类故障，供参考）：摘要调用自身溢出 → 自锁

`buildSummarizationInput` 把「完整 system prompt + 全部 tool schema + 全部被遮蔽对话」
打包后回发给摘要模型。本机 system + tools 常达数万 token，因此 26 万 token 的会话做摘要时
是一个 30 万 token 的请求 —— 若摘要走对话路由，必然再溢出一次：

```
step compaction failed: pi-ai detected context overflow for model "zai-org/GLM-5.3"; continuing the turn
context-overflow compaction failed: pi-ai detected context overflow for model "zai-org/GLM-5.3"; preserving the original request error
```

已在本地用「摘要路由固定到 1M 上下文模型」绕过。建议上游考虑在摘要输入超预算时先裁剪
（而非整段回发），或至少把这条失败标注成「摘要输入溢出」以便区分。

另外一条实测（非 bug，但值得写进文档）：`maxTokens` 默认 8192 对中文六段式 checkpoint 偏小。
本机 25.7 万 token 会话实测：

```
compaction/start  1789144728744
compaction/end    1789144764618  error: summarization truncated at the token cap (incomplete checkpoint)
耗时 35874 ms
```

35.9 秒（非秒退）证明是真跑满输出预算后截断，且输出预算里还含 reasoning token。
提到 48K 后解决。

---

## 附：大陆中转站的容量事实（harness 无法自动获知）

硅基流动 `GET /v1/models` 只返回 `id/object/created/owned_by`，**不含容量**，故
`llm-pi-ai` 的 `contextWindow` 只能手配。而我实测的 provider 真实上限与官方文档标称**不一致**：

| 模型 | 文档标称 | provider 实测 |
| --- | --- | --- |
| `zai-org/GLM-4.5-Air` | 131K | **98304** |
| `zai-org/GLM-4.5V` | 131K | **65536** |
| `Qwen/Qwen3.6-35B-A3B` | 262K | 262144 |
| `zai-org/GLM-5.3` | 1049K | ≥700000（700K 实测通过） |

而 `dsh-llm-pi-ai` 对未声明容量的模型回落 `defaultContextWindow: 262144`
（`DEFAULT_CONTEXT_WINDOW`，`lib/index.js:857`）。对上面两个小窗口模型，这个默认值是
**危险值**：压力触发按 75% 算是 196,608，而 provider 在 65536/98304 就拒绝了。

建议：文档里明确「未声明容量 ≠ 安全默认」，并建议中转站路由显式设置
`defaultContextWindow` 为站内最小值。

---

## 复现清单

```bash
# 1) 分类器判定（需本机 harness 安装路径）
node --input-type=module -e "
import {isContextWindowExceededError} from '<app.asar.unpacked>/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
console.log(isContextWindowExceededError('number of input tokens (150019) has exceeded max_prompt_tokens (98304) limit.'))"

# 2) provider 真实上限（任意 OpenAI 兼容端点的超长请求都会回显精确值）
curl -s https://api.siliconflow.cn/v1/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"zai-org/GLM-4.5-Air","max_tokens":4,"messages":[{"role":"user","content":"<150K token 填充>"}]}'

# 3) 中文 chars/token（对任意 OpenAI 兼容端点）
#    发一段中文取 usage.prompt_tokens，与 字符数/4 对比即可复现 2.21 倍偏差
```

同一 DSH 版本下，把 `thresholdRatio` 折到 0.45、把 `summarizationProvider/Model`
固定到大窗口独立路由、并给每个中转站模型显式写实测 `contextWindow` 之后，
本机长中文会话的溢出中止已停止复现。
