# PoYo 中转站接入：工具能力既不由 schema 声明决定，也不由模型档次决定——旗舰 Claude 全线不可用

> **⚠️ 2026-09-13 修订（拿到可用 key 后）**：本条最初的核心断言「29 个对话模型里只有 3 个声明了工具」**已被实测推翻**，属**假阴性**。schema 不声明 `tools` ≠ 服务端不支持工具调用：实测 11 个对话模型能稳定产出合法 `function_call`，其中 `kimi-k3` / `deepseek-*` / `gemini-*` / `gpt-5` / `grok-4.6` 的 schema 里都没有工具字段。
>
> 更反直觉的是方向：**全部 Claude Opus / Sonnet 系（含 `claude-opus-5`）才是真正不可用的那一批**——它们接受 `tools` 参数却从不产出 `tool_calls`，把调用写成正文文本。按档次挑模型在这里会正好挑错。
>
> 下方 Problem 节保留原始推断过程（它记录了「读 schema 下结论」这个失误是怎么发生的），失效处均已就地标注撤销；实测数据见文末「修订：实测结论」。

- 日期：2026-09-13
- 状态：implemented
- 决策记录：ADR-0059
- 相关：[2026-09-12-context-compaction-hardening.md](2026-09-12-context-compaction-hardening.md)（ADR-0024；容量表必须实测、文档值不可信——本条把同一条方法论推到「工具能力」这一维）、[2026-09-12-llm-cost-guard.md](2026-09-12-llm-cost-guard.md)（同属模型路由治理面）

## Problem

### 用户的问题是「能不能加」，答案取决于一个没被问出口的前提

用户持有 `poyo.ai`（一家中转站）的 API key，问能不能加进「设置 → 模型」，并要求给出接入建议。

「能不能加」的机制层答案很快就是肯定的：本机 DSH 的模型设置页支持「添加自定义提供方」，Provider ID 只校验小写 kebab（`/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`），端点和协议可手填，key 经 `credentials.set` 只写入凭据服务。用户自己的 `settings.yaml` 里已经有三条自建路由（`lute` / `gjld` / `kimi-coding`），这条路早就走通了。

真正的问题在下一层：**加进去之后它能做什么。** 而这一层不能靠读营销页回答。

### 该站有三个互不相同的 API 面，混在一起看就会做错决定

| 面 | 端点 | 实测 | 与「设置 → 模型」的关系 |
| --- | --- | --- | --- |
| 异步任务（图/视频/音乐/TTS/3D） | `POST /api/generate/submit` → `data.task_id` | 站方文档自述「所有生成任务都是异步的，`200` 只代表任务已创建」 | **无关**。它不吃对话协议，塞进 `llm-pi-ai` 是接错了面 |
| OpenAI 兼容对话 | `/v1/chat/completions`、`/v1/responses` | 无 key 均 `401 Invalid API key` | 相关 |
| Anthropic 原生 | `/v1/messages` | 无 key `401 Invalid API key` | 相关（但见下） |

另实测一条：`GET /v1/models` 是 **`404`**，该站根本没有模型列表端点。这直接决定了一个可观察后果——

**设置页的「获取可用模型」按钮必然失败。** 它调的是 `{baseURL}/models`，即 `https://api.poyo.ai/v1/models`。模型 ID 只能手填，或从站方的机器可读 catalog 拷：

```
GET https://api.poyo.ai/v1/catalog/models?service_type=chat     # 免 key，分页（next_cursor/has_more）
```

### ~~决定性的一条：29 个对话模型里只有 3 个声明了工具~~ ❌ 本节结论已撤销

> **撤销说明**：本节由 `input_schema` 推断工具能力，实测证明该推断是**假阴性**。保留原文以记录失误路径，**不要据此决策**；正确结论见文末「修订：实测结论」。下面表格的「schema 里有 tools？」一列是真实的，但它**不能**推出「服务端不支持工具」。

拉全 catalog（2 页、29 条）后逐条核 `input_schema.properties`：

| 模型族 | 数量 | 协议 | schema 里有 `tools`？ |
| --- | --- | --- | --- |
| `claude-*`（含 opus-5 / fable-5-1 / sonnet-5） | 12 | `openai-chat`, `anthropic` | ❌ |
| `gemini-3.x` | 6 | `openai-chat`, `gemini` | ❌ |
| `deepseek-v4-pro` / `v4-flash` / `deepseek-flash` | 3 | `openai-chat`（+`openai-responses`/`anthropic`） | ❌ |
| `gpt-5` / `5.4` / `5.5` / `grok-4.6` | 4 | `openai-chat`, `openai-responses` | ❌ |
| `kimi-k3` | 1 | `openai-chat` | ❌ |
| **`gpt-5-6-luna` / `terra` / `sol`** | **3** | **仅 `openai-responses`** | **✅ `tools` + `tool_choice` + `parallel_tool_calls`** |

无工具那 26 个不只「没声明 tools」，它们的 `messages[].role` 枚举只有 `system|user|assistant`——连 `tool` 角色都没有。这不是文档疏漏，是这一面**结构上不接受**工具消息。

> ❌ **本段推理已作废。** `role` 枚举里没有 `tool` 只能说明**该站不打算接收「工具结果回填」形态的消息**，不能说明它不产出 `tool_calls`。实测：这些模型收到 `tools` 后确实会产出 `function_call`。补充一条相关事实——`reasoningEfforts` 的 `off` 键在 responses 面 schema 里同样是「未声明但可用」。**schema 缺字段 ≠ 服务端未实现**，这两个命题在本站被反复证伪。

而 DSH 的 agent 主循环靠 `bash` / `read` / `write` / 技能这些工具调用运转。落在没有工具的模型上，结果是**能聊天、不能干活**：加了路由、能选中、能出字，但一句「帮我读一下这个文件」都做不到。

顺带核了价格（1 USD = 200 credits，由 `kimi-k3` 的 $2.28 ↔ 456 credits 反推，`billing.input_credits` 字段逐模型可读）：

| 模型 | 输入 $/M | 输出 $/M | 工具 |
| --- | --- | --- | --- |
| `gpt-5-6-luna` | **0.056** | 0.336 | ✅ |
| `deepseek-v4-flash` | 0.114 | 0.228 | ❌ |
| `deepseek-v4-pro` | 0.342 | 0.684 | ❌ |
| `gemini-3.8-flash` | 0.600 | 3.000 | ❌ |
| `claude-sonnet-5` | 0.850 | 4.275 | ❌ |
| `claude-opus-5` | 2.000 | 10.000 | ❌ |
| `kimi-k3` | 2.280 | 11.400 | ❌ |

价格优势真实存在，但**恰好集中在唯一有工具的那一族**（`gpt-5-6-luna` 是全场最便宜），这让「值不值得接」的答案从「看价格」变成「看工具」。

### pi-ai 的自动探测对这家站是错的，而且是 5 处错

`@earendil-works/pi-ai` 的 `detectCompat` 按 provider 名与 baseURL 做特判，名单是 deepseek / zai / moonshot / together / nvidia / cerebras / cloudflare / ant-ling 等。`api.poyo.ai` **不在任何一条分支里**，于是落到默认值，而默认值与站方 schema 有 5 处不一致：

| pi-ai 默认会发 | 该站 chat 面 schema | 处置 |
| --- | --- | --- |
| `max_completion_tokens` | 只声明 `max_tokens` | `compat.maxTokensField: max_tokens` |
| `stream_options: {include_usage:true}` | 未声明该字段 | `compat.supportsUsageInStreaming: false` |
| `store: false` | 未声明 `store`（responses 面才声明） | `compat.supportsStore: false` |
| `reasoning_effort` | 未声明 | `compat.supportsReasoningEffort: false` |
| `developer` role | `role` 只有 `system/user/assistant` | `compat.supportsDeveloperRole: false` |

同一份探测在 responses 面还有一处：`cacheRetention !== "none"` 时会发 `prompt_cache_key`（由 sessionId 派生），而该站 responses schema 未声明此字段 → 路由上设 `cacheRetention: none` 即可（`getPromptCacheRetention` 在非 `long` 时本就返回 undefined，`prompt_cache_key` 是唯一多出来的）。

这 5+1 处都不是「大概没问题」，是逐条对着 schema 核出来的。写进 `compat` 段而不是靠默认值，代价是 5 行 YAML，收益是省掉一类最难排查的 400。

## Decision

见 **[ADR-0059](../../../adr/ADR-0059.md)**。要点：~~工具声明升为准入判据~~（**已修正为「准入判据 = 逐模型实测工具调用」**）；PoYo 拆 `poyo`（`openai-completions`）与 `poyo-responses`（`openai-responses`）两条路由、共用一个凭据引用；pi-ai 的探测纠偏显式写死；不写进 `agent-default-model`、不给读图位。两条路由的**模型清单以实测工具能力筛选**，见文末修订节。

## 落地与验收

改动本身只有一处：`~/.dsh/settings.yaml` 的 `llm-pi-ai.providers` 增加两条路由（备份 `settings.yaml.bak-20260913-020013`）。该文件由 `dsh-settings-file` 用 chokidar `awaitWriteFinish` 监听，热发布、不需重启。

验收不靠「文件看着对」，靠真实装载路径的读数：

1. **YAML 往返**：除 `llm-pi-ai` 外其它 14 个命名空间逐值等价；既有 3 条路由的 profile 体**逐字节相同**（新路由是纯增量）。
2. **真实 schema**：用 `yaml@2.9.0`（settings 实际用的解析器，而非 PyYAML）解析后喂给插件的 `Config`——`SCHEMA OK · routes: lute, gjld, kimi-coding, poyo, poyo-responses`。
3. **真实 apply**：在 `process.resourcesPath` 下加载真插件并调用 `apply(ctx, resolved)`——它内部会跑 `resolveProfiles → resolveRouteModels → buildProvider → createProvider` 全链，两条新路由 materialize 成功，既有路由未受影响。

**2026-09-13 补记：模型清单按实测收窄后，在真实运行进程里复验了一次装载链路。**

前三条验收都发生在「离线加载真插件」的语境里；本轮改完清单后补了一条更强的读数——**对那个已经跑了 6 个多小时、从未重启的 DSH 进程**，用一个临时 Cordis 探针插件读它的运行时注册表：

| 读数 | 值 | 说明 |
| --- | --- | --- |
| `PROVIDER_COUNT` | 10 | 含两条 PoYo 路由 |
| 列表中的名称 | `PoYo（对话·有工具）`、`PoYo（Responses·有工具）` | **已是本轮改后的 `displayName`** ⇒ 热重载确实生效 |
| `MODELS[poyo]` | `count=11`，逐项与 `settings.yaml` 一致 | 含 `claude-fable-5`、`gemini-3.7-flash` 等新行 |
| `MODELS[poyo-responses]` | `count=3`：`gpt-5-6-luna`/`terra`/`sol` | 与配置一致 |
| `llm.listProviders()` 返回值 | **显示名**（`PoYo（对话·有工具）`），不是路由 id | 故按 id 字符串比对会得到 `HAS_POYO=false` 的假阴性；**判据要用 `listModels(routeId)` 能否返回模型**，它成功返回 11 个即证明路由键就是 `poyo` |

这条读数把「文件写对了」与「运行时装载了」彻底分开：DSH 进程启动于 20:13、配置文件改于 02:39，中间没有重启——所以这次装载**只能**来自 `dsh-settings-file` 的热发布路径。探针插件用完即 `cordis_undefine` 删除（它常驻进程且每次 apply 都会写文件，不该留在运行时）。

顺带记一个解析器差异，它差点让我把正确的配置改坏：**`off:` 这个键在 YAML 1.1（PyYAML）里是布尔 `False`，在 YAML 1.2（`yaml@2`，settings 实际用的）里是字符串 `"off"`。** 我按 PyYAML 读出来是 `{False: None, ...}`，一度以为 `reasoningEfforts.off` 需要加引号；实测 `yaml@2.9.0` 解析为字符串键，官方 README 里不引号的写法是对的。判据必须用**运行时会用的那个解析器**。

## Alternatives considered

- **只接对话面、不接媒体面** —— 用户的原问题是「加进设置页」，故必须回答；但媒体面（异步任务）才是这家站的主场，且它对工具能力零要求。保留为主用法。
- **只建一条 `poyo` 路由** —— 会留下一个「能选中、能出字、干不了活」的模型位，比不接更坏。
- **让 `claude-*` 走 Anthropic 面绕开工具缺口** —— DSH 确实支持 `anthropic-messages`，但站方给这 12 个 claude 模型只提供**一份** schema（`openai-chat` 形状），却同时宣称支持 `anthropic` 协议；这份 schema 无法证明工具能力，拿它当验收依据等于猜。留作拿到 key 后的显式实验。
- **按模型族估高 `defaultContextWindow`** —— 该站不公开上下文窗口数字。估高直接 400，估低只让压缩早触发，代价不对称，故取保守下界 131072 并明确标注未实测。
- **全量登记 29 个模型** —— ~~26 个无工具，全量只会让模型选择器变噪音~~。**修正后的理由仍然成立但依据不同**：29 个里只有 14 个实测具备工具能力（11 个放行且工具稳定 + 3 个 responses），其余 15 个要么不产 `tool_calls`、要么上游 500。选择器里不该出现不能干活的行。

## Consequences

**已知未验证（本条最该被记住的部分）**

- **`openai-responses` 面的 SSE 事件协议未经证伪**：站方文档只列了 6 个事件，而 pi-ai 需要完整的 `response.output_item.done` / `response.completed.response.output` 才能恢复工具调用参数。这一步在 N1 尝试时被**网关层前置拦下**（见下），仍未验证，而它正是「PoYo 能否当 agent 用」的唯一开关。
  > **2026-09-13 已解**：三个 responses 模型（`gpt-5-6-luna`/`terra`/`sol`）流式路径实测返回 `response.created` 与完整的 `response.completed` 事件序列，且非流式下 `output[].type == "function_call"` 携带合法 `arguments` JSON。SSE 协议这一关**通过**。详见文末修订节。
- 非流式响应信封（站方 OpenAPI 描述为 `{code, data:{...}}`）未实测；pi-ai 走 SSE 流式路径，读的是原始 `chunk.choices`，有机会不受影响——「有机会」，不是「已验证」。
- `defaultContextWindow: 131072` 是保守值，非实测值。
- 站方自述「overall stability may be slightly lower than official providers」，对 agent 主循环这种一断就整轮重来的场景，风险未量化。

### N1 首次尝试的实测读数：凭据通过、网关拒绝，且拒绝原因可被证伪

用户在设置页写入 key 后，N1 的流式 function call 探针打出的不是协议数据，而是一个**入站拦截**。关键是这组对照读数——它把「key 有问题」与「IP 未放行」彻底区分开：

| 请求 | 读数 | 推论 |
| --- | --- | --- |
| 无 `authorization` | `401 Invalid API key` | 鉴权发生在 IP 之前 |
| 伪造 key（12 字符） | `401 Invalid API key format (length: 12)` | **格式闸**：长度不合规根本走不到 IP 检查 |
| 真实 key（65 字符，`sk-p…`，JWT 形） | `403 Access denied: IP 61.141.171.202 not in whitelist` | **格式闸通过 ⇒ key 有效**；被按来源 IP 拦在业务面之外 |
| 三条面（`/responses`、`/chat/completions`、`/messages`）带真实 key | 全部同一份 `403` | 不是某条协议的缺口，是整站入站策略 |

因此这条 `403` **不是**「key 填错了」的同义词。它同时是本站第二个「设置页会骗你」的点：设置页保存成功、路由装载成功、模型能在选择器里选中，而首次真实调用会拿到 `403`——报错文本里的 `whitelist` 才是唯一线索。

同时实测排除了一条误判路径：本机系统代理（ClashX，`127.0.0.1:7890`，HTTPS 代理已开）对 poyo **走的是直连规则**——`--noproxy '*'` 与经代理两条路径，poYo 网关看到的都是同一个 `61.141.171.202`。所以 403 与代理无关。

但出口 IP 存在**多出口读值不一致**：`ipinfo.io` / `ifconfig.me` 连续读到 `61.141.171.200`，`icanhazip.com` 稳定读到 `61.141.171.202`，而 poyo 网关连续 6 次读到的都是 `61.141.171.202`。

它不是「逐请求轮换」——各目标各自的读数在四轮采样里零变化。正确模型是**按目标 IP 稳定分配出口**：同一目标恒定，不同目标落到同一个 `/24` 里的不同地址。poyo 因此是一个**已确定的**目标：放行 `61.141.171.202` 即对当前链路有效。

剩余风险不是「分钟级漂移」，而是**家宽重新拨号/换约时出口池整体变化**——那时会换到同 `/24` 内的其它地址（`.200` 亦在池中，实测过）。故：填 `61.141.171.202`（可加 `.200` 作余量）对现在有效；站方若支持 CIDR，放行 `61.141.171.0/24` 才是抗换约的稳态。

### 白名单控制台的确切契约（从控制台前端 i18n 提取，非猜测）

站方文档只说「IP whitelist support」，没有契约。以下取自 `poyo.ai/dashboard` 打包文案，是控制台自己的说法：

| 契约项 | 原文 / 事实 | 对决策的意义 |
| --- | --- | --- |
| 作用域 | 表格列 `table_ip_whitelist` = "IP Whitelist"，位于 **API key 行**，经 "Edit API Key" → "Manage IP Whitelist" 编辑 | **per-key**，不是账号级。多把 key 时加错行就会「明明加了却不通」 |
| 输入格式 | 占位符 `Enter IP address (e.g., 192.168.1.100)`；按钮 "Add IP Address" | 单个 IPv4 明文。**不支持 CIDR**——所以「放行 /24」这条建议在本站不可行 |
| 容量 | `Max 10 IPs allowed` | 出口池若超 10 个地址就无法靠白名单覆盖 |
| 空列表语义 | `ip_whitelist_empty_warning` = "No IP addresses added to whitelist. All IPs are currently allowed." | **加 IP 本身就是开关**，没有独立的启用/停用开关。清空 = 放行所有 |
| 保存反馈 | `success_update_ip` = "IP whitelist updated successfully" | 有明确成功提示，可据此排除「忘记保存」 |

### 覆盖范围：白名单拦的不只是对话面

带真实 key 逐端点实测：

| 端点 | 读数 | 是否受白名单约束 |
| --- | --- | --- |
| `POST /v1/responses`、`/v1/chat/completions`、`/v1/messages` | `403 … not in whitelist` | **是** |
| `POST /api/generate/submit`（媒体面，站方主场） | `403 … not in whitelist` | **是** |
| `GET /v1/models` | `404` | 端点在鉴权前就不存在 |
| `GET /v1/catalog/models?service_type=…` | `200` | **否**（公开端点） |
| `POST /mcp`（`initialize`） | `200`，返回 JSON-RPC 握手 | **否**（握手层公开） |

两条重要推论：

1. **IP 白名单是本路由的第三个准入维度，且它排在凭据之前生效**——账号被锁时，连站方主场的媒体面也一起锁死。此前「退回去只当媒体后端」的退路**不成立**：那不是一条绕开白名单的路径。
2. **MCP 不能当逃生通道**：虽然 `/mcp` 的 `initialize` 免鉴权，但任何一个要鉴权的 MCP 方法（`poyo_account`、`poyo_chat`）都返回同一份 `403`——白名单拦的是鉴权后的所有业务调用，与走哪条协议无关。

### MCP 是本站唯一稳定的机器可读接口，可用来验能力而绕开白名单

`POST https://api.poyo.ai/mcp` 是 MCP 服务器（`serverInfo: PoYo AI Models v1.29.1`），8 个工具：`poyo_search_models` / `poyo_get_model_schema` / `poyo_get_pricing` / `poyo_chat` / `poyo_run_model` / `poyo_submit_job` / `poyo_check_job` / `poyo_account`。前三个**免鉴权**，因此可以在账号被锁期间照常核对模型能力。

用它核到的 `gpt-5-6-luna` schema 事实（这些是 `openai-responses` 路由的配置依据）：

- 顶层属性：`text`、`user`、`input`、`store`、`tools`、`top_p`、`prompt`、`include`、`metadata`、`reasoning`、`background`、`max_tokens`、`truncation`、`temperature`、`tool_choice`、`instructions`、`service_tier`、`max_output_tokens`、`parallel_tool_calls`、`previous_response_id`。
- **`store` 确实存在**（`{type: boolean}`）——此前按 chat 面的判断推断 responses 面也不需要它，结论对了，但当时是推断，现在是读数。
- **`reasoning` 是 `additionalProperties: true` 的对象**，不是枚举——所以 `reasoningEfforts` 的写法不与它冲突。
- **`tools.items` 为 `additionalProperties: true`**，只强制 `type`（示例值 `web_search_preview`）。这**不排斥** function tool 的 `name`/`description`/`parameters`；但不能据此认为函数调用一定可用——`tools` 非鉴权 schema 只证明「字段形状不拒绝」，不证明「服务端实现了」。
- `input[].role` 枚举含 **`developer`**（`system`/`developer`/`user`/`assistant`）——与 chat 面不同。但这不改变 `poyo`（chat）路由 `supportsDeveloperRole: false` 的结论，那是另一条面的 schema。

### ~~未解决的矛盾：地址正确、名单非空、仍被拒~~ → 已解决（三层依次解开）

最硬的一条读数，当时无法用已有假设解释：

| 事实 | 来源 | 状态 |
| --- | --- | --- |
| 网关稳定报来源 IP = `61.141.171.202`（8 次连续 + 12 次连续两轮，零漂移） | 网关自身报错文本 | 实测 |
| 控制台该 key 的 IP Whitelist 列**确实显示 `61.141.171.202`** | 用户目视确认 | 用户陈述 |
| 只有一把 key，白名单加在这把上 | 用户确认 | 用户陈述 |
| 仍返回 `403 … 61.141.171.202 not in whitelist` | 实测 | 实测 |
| 401（无 key）带 `www-authenticate: Bearer or API-Key`；403 无该头，`x-process-time` 仅 ~6ms | 响应头 | 实测 |

6ms 的判定耗时说明比对发生在边缘节点的快速路径上。当时列了三个候选解释：**(a)** 边缘缓存未失效；**(b)** 比对用的来源 IP 与回显的不是同一来源；**(c)** 白名单保存成功但未绑定到这把 key。

**判决实验的执行与结果：**

| 步骤 | 动作 | 读数 | 排除了什么 |
| --- | --- | --- | --- |
| 1 | 冻结出口 IP 归属验证 | 伪造 `X-Forwarded-For: 1.2.3.4` → 网关报 `IP 1.2.3.4 not in whitelist`；**它信任该头** | 排除了 (b)：回显的 IP 就是比对用的 IP。同时暴露一个安全事实——该头可被客户端任意改写 |
| 2 | 清空该 key 白名单 | 仍全端点 `403`（`/v1/chat/completions`、`/v1/responses`、`/api/generate/submit`、`/api/generate/status/*`、MCP `poyo_account` 全部同一句） | 排除了 (a)：不是缓存延迟。**但推出 (c) 的理由仍不充分**——见下 |
| 3 | 换一把全新 key（无白名单、无模型限制） | `403` 文案**换人了**：`Model is not allowed for this API key` | **这就是 (c) 的证据**，且揭示了本站有**两个独立维度** |
| 4 | 再换一把（全模型放行） | 21/29 模型 `200` | 链路打通 |

**关键更正——第 2 步的推断曾经是错的。** 当时把站方控制台文案 `ip_whitelist_empty_warning = "No IP addresses added to whitelist. All IPs are currently allowed."` 当作契约，据此认定「清空 = 放行所有」。实测**不是**：清空后依旧全盘 403。站方**从未在任何文档里定义空列表语义**（官方仅称 "IP whitelist support, allowing only approved server IPs to access the API"），那句警告文案只是控制台 UI 提示，不是服务端判据。

**由此得到两条可复用的机制事实：**

1. **白名单是账号级、全端点统一的入站策略**，且它排在凭据校验**之后**（无 key → `401`，有效 key → 才进白名单判定）。它同时拦住媒体面与 MCP 业务方法，因此「退回去只当媒体后端」和「走 MCP 绕过」两条退路**都不成立**。
2. **「允许模型」是独立于 IP 的第二个准入维度**，且错误码可区分：`403 permission_error`（responses 面）与 `403 invalid_request_error`（chat 面）文案相同 `<model> is not allowed for this API key`。诊断时**必须先分清是 IP 层还是模型层**，否则会在错误的方向上反复改控制台。

### 修订：实测结论（2026-09-13，key `sk-gsty`）

**工具能力不能从 schema 读出来，只能逐模型打。** 对 29 个对话模型 × 两条路由做「可达性 → 流式 → 工具调用」三维实测（`/tmp/poyo_probe/audit_new.py`、`bench_tools.py`、`bench_auto.py`）：

| 判定 | 数量 | 模型 |
| --- | --- | --- |
| ✅ chat 路由工具稳定 | 11 | `kimi-k3`、`claude-fable-5`、`claude-fable-5-1`、`gpt-5.5`、`grok-4.6`、`gemini-3.8-flash`、`gemini-3.7-flash`、`gemini-3-flash-preview`、`deepseek-v4-pro`、`deepseek-v4-flash`、`deepseek-flash` |
| ✅ responses 路由工具稳定 | 3 | `gpt-5-6-luna`、`gpt-5-6-terra`、`gpt-5-6-sol` |
| ❌ 不产 `tool_calls` | 7 | `claude-haiku-4-5-20251001`、`claude-opus-4-6`、`claude-opus-4-7`、`claude-opus-4-8`、**`claude-opus-5`**、`claude-sonnet-4-6`、**`claude-sonnet-5`** |
| ⚠️ 不稳定 | 1 | `gemini-3.1-pro-preview`（两轮中一轮响应非 JSON） |
| ❌ 上游 500 | 4 | `claude-opus-4-5-20251101`、`claude-opus-4-7-thinking`、`claude-sonnet-4-5-20250929`、`gemini-3.5-flash` |

**三条最该记住的结论：**

1. **工具能力与模型档次负相关。** 全部 Claude Opus / Sonnet 系（含最新的 `claude-opus-5`）**接受 `tools` 参数、返回 200、却永不产出 `tool_calls`**——它们把调用写成正文文本，例如 `get_weather({"location": "Shenzhen"})`，注意它连参数名都编错了（schema 里是 `city`）。而 `kimi-k3`、`deepseek-v4-flash` 这类中低档模型反而完全正常。**按「旗舰更能干活」挑模型，在本站会系统性地挑错。**
2. **`tool_choice: "required"` 会制造假阴性，测工具能力必须用 `auto`。** 最具欺骗性的是 `claude-fable-5-1`：在 `required` 下报 `Server exception`，在 `auto` 下两轮全部正确产出 `function_call`。`deepseek-flash` / `gemini-3.1-pro-preview` 也有同类现象。`required` 是非标准偏置参数，中转站对它的实现普遍不完整。
3. **同一模型在两条路由上的工具能力可以不同。** `deepseek-flash` 与 `grok-4.6` 在 chat 路由工具正常，在 responses 路由却返回**参数非 JSON**的 `function_call`。因此路由不能按模型族批量迁移。

**另记两条运维读数（非本平台可控）：**

- `gpt-5.4` 在 responses 面报 `402 insufficient_quota`，但**账号余额充足**（`/api/user/balance` 返回 8775 credits）——这是**PoYo 自己的上游 OpenAI 账号欠费**，用户侧无法修复，只能等站方或改用别的模型。
- 站方自述「stability may be slightly lower than official providers」。本轮实测到 4 个 500 + 1 个 402，均为不可控的上游转发失败，对「一断就整轮重来」的 agent 主循环是真实风险——**故 PoYo 不写进 `agent-default-model`，只作可选路由**（与 ADR-0059 决策 5 一致，理由从「工具未验证」改为「上游稳定性未达标」）。

**后续动作**

- ~~**N1**：流式 function call 判活~~ —— ✅ **已完成**。两条路由的流式路径 + `function_call` 解析均已通过实测（见上）。
- **N2**：把准入判据落成可执行脚本。判据链修正为：**逐模型实测工具调用（`auto` 模式）→ 协议匹配 → 上游可达性 → 容量 → 凭据 → 入站 IP 放行 → 模型级白名单**。本轮脚本在 `/tmp/poyo_probe/`（`audit_new.py` / `bench_tools.py` / `bench_auto.py`），尚未收进仓库。
- **N3**：媒体生成面仍未接。注意媒体面同样受 IP 白名单约束，且本轮已确认它不是绕开封锁的退路。
- **N4（新）**：settings.yaml 的两条 PoYo 路由清单已按实测收窄为 11 + 3 行，非机械改动已就地留痕（见 `~/.dsh/settings.yaml` 注释；该文件不在本仓库内）。

（本节完）
