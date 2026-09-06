# 万物互联插件 · 得到大脑知识库连接 兼容性适配方案（定稿 v1）

> 状态：方案定稿，**代码未动**。前序分析见 `wanzh-hulian-getnote-analysis.md`。
> 用户决策（2026-09-06）：鉴权=API Key 与 OAuth 双通道；开关=双层（总开关+模型自动调用）；一期=知识库聚焦 7 工具；页面=独立新插件；会员=已开通。

---

## 1. 决策记录（ADR-风格）

| # | 决策 | 选择 | 依据 |
| --- | --- | --- | --- |
| D1 | 接入技术路线 | 一期方案④（宿主直连 REST + 原生工具）；二期方案②（MCP 通用基建） | 零 npm 版本漂移；复用现有 alpha SDK；开关/凭证/页面基建同构 |
| D2 | 插件形态 | 独立新插件（暂名 `dsh-wanzh-hulian`），不扩展现有出海插件 | 万物互联管四类连接，独立内聚；出海插件已重 |
| D3 | 鉴权 | API Key 直连 + getnote CLI 登录态复用，双通道 | 用户选定；API Key 落 credentials.yaml（600），OAuth 密钥不入上下文 |
| D4 | 开关语义 | 双层：连接总开关 + 模型自动调用开关 | 与现有技能 flag 体系一致 |
| D5 | 一期能力 | 7 工具：知识库列表 / 库内语义搜索 / 全局语义搜索 / 存笔记 / 最近笔记 / 按 ID 读 / 配额 | 最小闭环，跑通后按需扩 |

## 2. 架构设计

```
设置页「万物互联」（settings.plugin.item 新 section，四个板块卡片墙）
 ├─ MCP 连接（二期起，管理 stdio/http 服务器声明 → 注入 ACP mcpServers）
 ├─ API 连接（得到大脑 OpenAPI 类；凭证+端点+开关）
 ├─ 企业应用（飞书/微信类，对齐 ~/.dsh/integrations/* 先例）
 └─ 知识库（首卡：得到大脑 · 7 工具 · 状态灯 + 双层开关 + 配额显示）

宿主端（新插件 dsh-wanzh-hulian）
 ├─ /credential 端点（得到大脑凭证读写 → ~/.dsh/.credentials.yaml，POSIX 引用，600）
 ├─ REST 客户端（openapi.biji.com/open；Authorization: gk_live_xxx + X-Client-ID: cli_xxx）
 ├─ ctx.tools 注册 7 个 getnote_* 原生工具（内置 alpha SDK：dsh-tools/schemastery）
 └─ 双层开关状态持久化 + 生效语义
```

## 3. 一期工具集（schema 草案，代码阶段细化）

| 工具 | 参数 | 对应 OpenAPI/MCP |
| --- | --- | --- |
| `getnote_topics` | scope? | list_topics（知识库列表） |
| `getnote_recall` | query, limit≤10 | recall（全局语义搜索） |
| `getnote_recall_kb` | topic_id, query, limit≤10 | recall_knowledge（库内搜索） |
| `getnote_save` | content, title?, tags?, link_url? | save_note（plain_text/link） |
| `getnote_list` | limit≤100, cursor? | list_notes（游标分页） |
| `getnote_get` | note_id | get_note（详情） |
| `getnote_quota` | — | get_quota（配额） |

## 4. 双层开关的 DSH 兼容实现（两条路径，代码阶段择一并实测）

- **路径 A（静态开关）**：开关写入插件 config → 变更后「重启生效」提示（与 catalog/client 变更同语义，DSH 契约最稳）。连接开关=关 → apply 时不注册工具；模型开关=关 → 工具仍注册但描述前缀「需用户明确要求才使用」（对齐 disable-model-invocation 语义）。
- **路径 B（热开关）**：apply 时始终注册，`execute()` 入口读运行时状态文件（插件自有 storage），关闭时返回标准提示不执行。热切换零重启，但要自管状态一致性与模型侧缓存。
- 默认建议：**先 A 后 B**（A 保证契约稳定，B 在用户体感验证后作为优化）。绝不在工具名上做动态增删（DSH 工具名契约稳定优先）。

## 5. 鉴权双通道设计

| 通道 | 流程 | 凭证落点 | 模型可见性 |
| --- | --- | --- | --- |
| API Key | 页面表单填 gk_live_xxx + cli_xxx → 宿主写 credentials.yaml（600，POSIX 引用） | `~/.dsh/.credentials.yaml` 新增 `getnote` 条目 | 不可见（宿主注入请求头，工具结果只回数据） |
| OAuth/CLI 态 | 页面按钮引导 `npx @getnote/cli@latest auth login`（浏览器授权）→ 宿主读 CLI 本地登录态（代码阶段验证其存储位置/格式；不可读则明确降级提示走 API Key） | CLI 自有存储（不复制、不解析进上下文） | 不可见 |

安全红线：凭证绝不进入模型上下文与日志；子进程环境走 DSH 的凭证擦洗（dsh-subprocess scrubbedParentEnv 已有先例）；页面只显示凭证尾号/状态灯。

## 6. 兼容性红线清单（对齐 DSH 2.0.4 契约，阶段验证项）

1. 插件必须 `dsh.bundle` + profile `file:` 硬链接安装（现有 dsh-overseas-skills 同款），不碰 app.asar 内部文件。
2. 只用内置 alpha SDK（cordis/dsh-tools/schemastery/dsh-skill-filesystem 按需）；**不引入** npm 发布线 @deepseek-ai 包（避免双实例）。
3. 工具名/参数遵守 DeepSeek 函数名契约（≤64 字符、`[A-Za-z0-9_-]`）；开关变更不动态改工具名。
4. 设置页 section 注册走 Slot 契约（settings.plugin.item，order 排布），客户端 bundle 走现有 client 构建链。
5. 凭证走 credentials.yaml POSIX 引用 + 600 perms；进程 env 擦洗。
6. 重启/刷新语义：catalog/client/宿主端点变更需重启+刷新——验收文档注明。
7. 会员/配额/429（quota_daily_exceeded）错误要在工具输出中结构化透传，不吞错。

## 7. 阶段划分（代码阶段按此推进）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 | 新插件骨架 + 万物互联设置页（四板块 + 得到大脑卡片墙）+ profile 安装 | 页面可见、bundle 无白屏、preset lint 过 |
| P1 | API Key 通道 + 7 工具 + 配额显示 | 7 工具冒烟（真实账号）；开关行为正确 |
| P2 | OAuth/CLI 登录态通道 + 状态灯 | auth login 后可自动识别登录态 |
| P3 | MCP 板块基建（方案②：设置页→会话 mcpServers 注入通路） | @getnote/mcp 或其他测试 MCP 可挂载 |
| P4 | 企业应用/更多连接（飞书、微信等对齐 integrations 先例） | 按需 |

## 8. 待办（代码阶段启动前）

- [ ] 验证 getnote CLI 本地登录态文件位置与格式（决定 P2 通路）
- [ ] 实测官方插件 npm rc 线与内置 alpha 线是否兼容（若兼容，P1 可借其 CLI runner 思路；不影响 D1 决策）
- [ ] 确认设置页 Slot 在独立插件中的注册契约（参照出海插件 client.js）
- [ ] 确认 OpenAPI 7 端点的确切路径与响应 schema（以 tab=docs 接口文档为准，代码阶段逐端点核对）

## 9. 阶段状态更新（2026-09-06 收工）

| 阶段 | 状态 |
| --- | --- |
| P0 插件骨架 + 设置页 | ✅ 完成（四板块卡片墙；后经 v4 重设计：知识库右停靠面板 + 侧栏入口） |
| P1 API Key 通道 + 7 工具 | ✅ 完成（后扩展至 19 工具，含分类整理 12 个 + 真移动语义） |
| P2 OAuth/CLI 登录态通道 | ✅ 完成（~/.getnote/config.json 回退 + 浏览器授权登录 + 状态灯） |
| P3 MCP 板块基建 | ✅ 完成（宿主直挂内置 dsh-mcp-client；@getnote/mcp 预置默认关） |
| P4 企业应用 | 🔄 进行中（Shopify 首个连接：配置化架构 T2/T2b 完成，等 Custom App 凭证 → T3 冒烟 → T4 文档） |
| 技能卡片结构化引导 | ✅ 完成（L1 30 模板 + L2/L3 兜底，卡片墙 + 斜杠选择器双入口） |
| 得到大脑分类整理 | ✅ 完成（第一阶段 132 条 + 第三阶段存量优化；「产品经理」「VOA」空库待 App 端删除） |
