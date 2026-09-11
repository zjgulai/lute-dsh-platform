# 万物互联 · 得到大脑知识库接入分析（方案讨论稿 v1）

> 目标：设置页新增「万物互联」板块（MCP / API / 企业应用 / 知识库）；首个连接 = 得到大脑知识库，做成**可开关的轻量连接**。
> 状态：分析与决策讨论阶段，**未修改任何代码**。依据：得到大脑开放平台文档 + 官方三个开源包源码 + 本机 DSH Desktop 2.0.4 运行时实测。

---

## 1. 得到大脑侧：官方提供的全部接入面

| 通道 | 包/地址 | 形态 | 鉴权 | 前置 |
| --- | --- | --- | --- | --- |
| 官方 DSH 插件 | `@getnote/dsh-plugin` 0.1.1（github.com/iswalle/getnote-dsh-plugin，4⭐） | cordis.patch insert → 注册 DSH 原生工具（auth_status / search / save / list_notes / …）+ 引导 Skill | 复用 getnote CLI 浏览器 OAuth（模型零接触密钥） | Node ≥20；**要求 npm 发布线**：`dsh-tools >=0.1.0-rc.6 <1`、`dsh-skill-filesystem >=0.1.0-rc.6 <1`、`cordis ^4.0.1` |
| 官方 MCP | `@getnote/mcp`（90⭐） | `npx -y @getnote/mcp`，**39 个工具**：笔记 CRUD、`recall` 全局语义搜索、`recall_knowledge` 库内搜索、知识库/文件夹管理、录音转写/时间线、图片上传、博主/直播订阅、`get_quota` | 环境变量 `GETNOTE_API_KEY` + `GETNOTE_CLIENT_ID` | Node ≥20 |
| 官方 CLI | `@getnote/cli` 1.5.10（176⭐） | `getnote auth login`（浏览器授权，登录态本地持久化，可跨工具复用）、notes/search/save 等子命令 | 浏览器 OAuth 设备流 | — |
| OpenAPI | `https://openapi.biji.com/open`（文档 tab=docs） | REST：`Authorization: gk_live_xxx`（无 Bearer）+ `X-Client-ID: cli_xxx`；如 `GET /open/api/v1/resource/note/list`（游标分页） | 个人开发者 = API Key；企业 = OAuth 设备授权换 Grant ID | **仅会员**（付费硬门槛） |
| 其他 | Coze 插件；企业 Webhook/API 回流 | — | — | — |

**关键 API 事实**：知识库语义 =「topic」；`recall_knowledge` 在指定知识库内语义搜索；`list_topics` 返回知识库列表；`save_note` 支持 plain_text / link / img_text 三种类型；创建知识库每日上限 50（429 quota_daily_exceeded）；MCP 暴露 `get_quota` 查询调用配额。

## 2. 本机 DSH Desktop 兼容性事实（2.0.4 实测）

| 事实 | 结论 |
| --- | --- |
| 内置 `@deepseek-ai/dsh-mcp-client` **0.1.2-alpha.1**（随壳分发，与技能层同版本线） | DSH 原生具备 MCP 客户端：stdio / streamable-http 双传输、`mcp__<server>__<tool>` 命名桥、子进程环境凭证擦洗、工具列表变更自动重同步 |
| `dsh-acp` 的 `mountAcpMcpServers(agentCtx, options.mcpServers, cwd)` | MCP 服务器列表由 **ACP 发布方**（options.mcpServers）注入，**当前没有「设置页直配 → 会话挂载」的现成通路**；需要代码阶段确认本地 GUI 会话的发布路径再挂接 |
| profiles：仅 `desktop`（无 `web` profile）；`dsh` CLI 不在 PATH | 官方插件文档路径 `dsh plugin --profile web add …` **不能直接照搬**，需适配 desktop profile 或手动 cordis.patch |
| 官方插件 peerDeps 指向 npm 发布线（rc.6+/cordis ^4.0.1），本机内置 0.1.2-alpha.1 | **版本漂移风险**：npm 安装会拉取独立副本，可能与内置 alpha 线出现双实例/契约漂移（需实测，属高风险待验证项） |
| 现有集成先例：`~/.dsh/integrations/dsh-feishu`、`dsh-weixin`（config.json/workspaces.json/bots） | 桌面版已有「连接企业应用」的目录级先例，万物互联页可对齐该形态 |
| 现有插件基建：dsh-overseas-skills 双设置页 + `/credential` 宿主端点 + `~/.dsh/.credentials.yaml`（POSIX 引用）+ 技能 `.env`（600）+ subset flags 开关 | 开关/凭证/设置页三板斧全部现成，可复用 |

## 3. 四条技术路线对比

| | ① 官方插件+开关页 | ② 官方 MCP + 宿主桥 | ③ 轻量技能封装（anysearch 模式） | ④ 宿主直连 REST + 原生工具 |
| --- | --- | --- | --- | --- |
| 原理 | 官方插件注册 DSH 工具，我们的页面做开关/状态 | 设置页管服务器列表 → 宿主侧注入 `options.mcpServers` | `~/.dsh/skills/getnote-brain` + .env + 脚本调 CLI/API | 在我们插件宿主端写 OpenAPI 客户端 + `ctx.tools` 注册工具 |
| 能力完整度 | 高（官方全量） | 最高（39 工具，含转写/上传/订阅） | 中（按需封装，bash 通道） | 中高（一期 ~6 端点，可扩展） |
| 鉴权 | 浏览器 OAuth（CLI 登录态复用，密钥不进模型） | API Key env（或后续接 CLI 态） | 两者皆可（.env 600） | 优先复用 CLI 登录态；降级 API Key 存 credentials.yaml |
| 兼容性风险 | **高**：npm rc 线 vs 内置 alpha 线漂移；web profile 不存在 | 中：注入通路需代码阶段验证（ACP options 来源） | **低**：零新依赖，同构现有技能体系 | **低**：只用内置 alpha SDK，与 dsh-overseas-skills 同构 |
| 开关实现 | cordis.patch 增删行/config（改完需重启） | 服务器列表增删（挂载态，重启可热） | subset flag + 页面 toggle（成熟模式） | 页面 toggle + 凭证存在性（成熟模式） |
| 对万物互联的复用 | 无（仅得到大脑） | **高**（MCP 板块一次建成，未来所有 MCP 连接复用） | 低（每连接一个技能包） | 中（每连接一个宿主模块+卡片） |
| 工作量（代码阶段） | 小（适配+开关页） | 中大（注入通路+页面） | 小 | 中 |

## 4. 推荐方案（供讨论）

**一期：方案 ④ 宿主直连 REST + 原生工具**（知识库聚焦最小闭环）

- 工具集：`getnote_topics`（知识库列表）、`getnote_recall`（全局语义搜索）、`getnote_recall_kb`（指定库搜索）、`getnote_save`（存文本/链接）、`getnote_list`（最近笔记）、`getnote_get`（按 ID 读）、`getnote_quota`（配额）
- 开关：万物互联页「得到大脑」卡片 = 总开关 + 「允许模型自动调用」二级开关（对齐技能 flag 语义）+ 鉴权状态灯
- 凭证：优先复用 getnote CLI 登录态（代码阶段验证其本地 token 文件格式）；不可行则 API Key 手工填 → `~/.dsh/.credentials.yaml`（600，模型不可见）
- 理由：零 npm 漂移（只用内置 alpha SDK）、开关/凭证/页面全复用现有基建、工具宿主原生；最贴合「轻量整合到当前基座平台」

**二期：方案 ② MCP 通用基建**（万物互联 MCP 板块）

- 把「设置页 → 每会话 mcpServers 注入」通路建成，`@getnote/mcp` 作为首个 MCP 连接入驻；此后任何 MCP 连接都只是加一行配置
- 一期④的工具与二期②的 mcp__getnote__* 并存时需去重策略（关一个留一个）

**备选**：方案 ① 官方插件——若代码阶段实测 npm rc 线与内置 alpha 线兼容良好，可直接采用其工具层（省去自维护客户端），我们仍只做开关页。

## 5. 待你决策的 5 个问题

1. **鉴权方式**：A 浏览器 OAuth（推荐，密钥不进模型，需登录一次）/ B 手工填 API Key / C 两者都支持？
2. **开关语义**：只要总开关（连/断），还是要「总开关 + 模型自动调用开关」双层（推荐，与现有技能开关体系一致）？
3. **一期范围**：知识库聚焦 7 工具（推荐）够吗，还是直接要全量 39 能力（那样优先考虑方案①/②）？
4. **页面归属**：万物互联做进现有 dsh-overseas-skills 的第三 section（推荐，复用基建）还是独立新插件？
5. **会员确认**：你的得到大脑账号已开通会员？（OpenAPI 硬门槛；若未开通，一切接入只能到「鉴权成功但接口 403/提示开会员」为止）
