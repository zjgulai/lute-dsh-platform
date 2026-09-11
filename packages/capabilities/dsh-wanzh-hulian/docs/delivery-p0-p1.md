# 万物互联插件 · P0+P1 交付说明（dsh-wanzh-hulian v0.1.0）

> 落地范围：P0 骨架 + 设置页四板块 + P1 API Key 通道 + 7 工具 + 双层开关 + 引导技能。
> 依据方案：`docs/wanzh-hulian-getnote-plan.md`（D1-D5 决策）。

## 已交付

| 文件 | 内容 |
| --- | --- |
| `dsh-wanzh-hulian/package.json` + `cordis.patch.yml` | 插件包声明；dsh.bundle patch（insert 行）；无第三方依赖（@deepseek-ai/dsh-tools 由宿主内置 alpha 解析，零版本漂移） |
| `lib/catalog.js` | 四板块（MCP/API/企业应用/知识库）+ 得到大脑连接卡（官方 favicon logo data URI） |
| `lib/index.js` | 宿主：loopback 围栏路由 `/list` `/toggle` `/credential` `/probe`；7 个 `getnote_*` 工具（直连 openapi.biji.com，16 位大整数保真、30s 超时、连接开关执行期热闸门）；状态持久化 `~/.dsh/integrations/getnote/config.json`（600） |
| `lib/client.js` | 设置页「万物互联」（settings.section order 28）：四板块 pills + 卡片墙 + 得到大脑卡（logo/状态灯/双层开关/凭证表单/OAuth 提示/配额测试） |
| `skills/getnote-brain/SKILL.md` | 引导技能（宿主启动时安装至 ~/.dsh/skills/getnote-brain/）；「模型自动调用」开关实时改写其 disable-model-invocation（watcher 热加载） |
| `scripts/install-profile.mjs` | 幂等注册：profile 依赖 + bundles + pnpm install（硬链接） |

## 开关语义（与方案 D4 一致）

- **连接总开关**：写入 config.json；关闭后 7 个工具执行入口立即返回「已断开」提示（热生效，无需重启）。
- **模型自动调用**：写入 config.json + 同步改写引导技能 flag；开=模型可自动按需调用，关=仅用户点名得到大脑时使用（对齐官方插件「引导技能控制模型行为」的同款设计）。

## 安全

- 凭证走 credentials 服务（`getnote_api_key` / `getnote_client_id`），页面不回显、模型不可见；Authorization 头按官方文档无 Bearer 前缀。
- 路由仅接受 loopback（socket + Host 双重校验，同出海插件）。
- OAuth 通道（P2）：页面提示终端执行 `npx @getnote/cli@latest auth login`，登录态复用留待 P2 接入。

## 验收步骤（重启后）

1. 重启 DSH Desktop → 设置页出现「万物互联」（出海技能/AI全栈之后）。
2. 卡片显示官方 logo 与「未配置」状态灯；切到 MCP/API/企业应用板块显示「规划中」。
3. 填入 API Key（gk_live_xxx）与 Client ID（cli_xxx，来源 https://www.biji.com/openapi 应用管理）→ 保存 → 状态灯变「已连接」。
4. 点「测试连接 + 配额」→ 显示配额与知识库总数（需会员）。
5. 对话中试：`帮我看看得到大脑里有哪些知识库`、`帮我记一下：下周三前完成设计稿`、`搜一下我笔记里的会员分层`。
6. 关「连接总开关」再让模型执行 → 应收到「已断开」提示；「模型自动调用」开关关/开对照触发行为。

## 已知边界

- 语音笔记等仅 App/Web 端创建（官方限制）；MCP 板块（P3）未建；企业应用（P4）未建。
- 工具为宿主静态注册，模型侧可见性由引导技能 flag 约束（DSH 工具运行时不支持无重启增删）。

## v0.1.1 修复（2026-09-06 · 首轮人验反馈）

1. **「打开开放平台」不生效**：设置页内 `<a target="_blank">` 被 Electron 壳拦截。改为宿主 `/open` 路由（loopback + https + biji 域名白名单 + 系统默认浏览器 `open`），客户端按钮 POST 调用。
2. **维护语义补记**：编辑工具重写源文件会产生新 inode，打破 `file:` 硬链接 —— 改动后需 `cat src > profile副本` 同步（出海插件 pipeline.sh 同款语义），本插件新增 `scripts/sync-profile.mjs` 之外的快速做法见上。
3. **模型调用实测**：7 工具已注册并对模型可见；getnote_quota / getnote_topics 真实调用通过（配额、11 个知识库返回正确）；模型自动调用开关 → 引导技能 flag 写入链路正确。

## v0.1.3（2026-09-06 · P2 OAuth/CLI 登录态通道）

1. **CLI 凭证回退**：宿主 resolveCreds 在手工 API Key 缺失时自动读 `~/.getnote/config.json`（api_key/client_id，0600）——用户「浏览器授权登录」后无需手填表单；来源标注（form/cli）进 /list。
2. **授权入口**：设置卡新增「浏览器授权登录」按钮 → POST /auth-login → 宿主 spawn `getnote auth login`（detached，系统浏览器打开授权页）；状态灯显示「CLI 已登录（将自动回退）」「已连接（CLI 登录态）」。
3. 前置：getnote CLI 已全局安装（/opt/homebrew/bin/getnote，v1.5.10）。
4. 验收：重启 → 卡片点「浏览器授权登录」→ 浏览器完成授权 → 状态灯变「已连接（CLI 登录态）」→ 「测试连接 + 配额」通过即全链路闭环（全程零手工 API Key）。

## v0.1.4（2026-09-06 · P3 MCP 板块基建）

1. **方案落地**：本地 GUI 会话不传 ACP mcpServers（源码核实）→ 改为**宿主直挂内置 dsh-mcp-client**（`ctx.plugin(McpClient, config)`，同 alpha 版本线零漂移），工具以 `mcp__<server>__<tool>` 注册。
2. **配置源**：`~/.dsh/integrations/wanzh-hulian/mcp-servers.json`（0600）；凭证 env 经 envRefs 引用 credentials 服务（不落盘明文）。
3. **预置首个连接**：@getnote/mcp（npx，stdio）默认关闭——与 getnote_* 原生工具能力重叠，建议二选一；启用后获得 39 工具全套。
4. **设置页**：MCP 板块卡片墙（名称/传输/命令/启用开关/状态徽章/重启提示）；变更写配置 → 重启生效（静态挂载，DSH 契约稳）。
5. 验收：重启 → MCP 板块见「得到大脑（官方 MCP）」卡 → 打开开关 → 重启 → 状态「运行中」→ 对话中出现 mcp__getnote_* 工具（与 getnote_* 并存时注意去重选择）。

## v0.1.5（2026-09-06 收工 · 分类整理 + 配置化 + 卡片迁移）

1. **分类整理能力**：+12 工具（改笔记/加删标签/批量移入移出库/建库/库内笔记列表/文件夹查建改删/删笔记回收站），总 19；`getnote_move_to_topic` 升级真移动语义（自动定位原库→移出→重入，≤20/批，内置限频）；getnote_get 嵌套修复、getnote_list 带标签/所属库。
2. **知识库选择器 v4 + 修复**：CSS 作用域修复（面板/侧栏选择器去 whRoot 前缀 + 缩略图 HTML 尺寸双保险）；入口与「深度研究」逐像素同款（42px/14px/圆角 12/hover 同 token）。
3. **T2 配置化**：connections.json + 动态 CREDENTIAL_REFS + probe 注册表（shopify-shop-info）+ /toggle 通用化 + MCP 条目联动 + boards 徽章动态计数 + 企业应用板块 + /open 白名单补 Shopify。
4. **T2b 卡片迁移**：getnote 卡迁入通用连接卡渲染器（extras：model-invoke/oauth-button/default-topic）；修复 saveCreds 双定义冲突（getnote 保存凭证按钮曾会崩）。
5. 全部回归：双层开关/默认库/OAuth/配额/测试连接/凭证保存——通用路径；profile 已同步。
