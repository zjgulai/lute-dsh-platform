# MCP 连接三连：业务化清单 / Shopify 客户端凭据 / Apify 接入（2026-09-08~09）

> 记录 2026-09-08 至 09-09 万物互联 MCP 连接板块的三项改造：工具业务化清单、Shopify 客户端凭据认证、Apify 官方 MCP 接入。本文与代码状态对齐，供明日继续二开。

## 1. MCP 工具业务化清单（business-meta 单一数据源）

**背景**：PixPix 工具介绍曾依赖实时抓取远端 MCP；OAuth 令牌过期后「查看全部能力」按钮消失。Shopify 从未有工具介绍，且 toolCount 45 与实际 14 不符。

**决策（用户拍板）**：
- 数据层：`lib/business-meta.js` 单一数据源，四张清单（Shopify 14 / PixPix 37 / 得到 38 / Apify 12），条目结构 = 业务名 / 何时用 / 场景 / 读写标记 / 示例口令
- UI 层：静态保底永远显示（`/mcp-servers` 注入 `source: "static"`），实时抓取仅增强；场景分组折叠 + 卡片顶部「对模型说」示例口令 + 写入/执行琥珀徽标 + mcp 原始名锚点
- 模型层：技能侧速查表（宿主幂等写入 SKILL.md），不碰 app 核心 mcp-client
- 技能同步四件：getnote-brain、pixpix-ecommerce、shopify-store-ops、apify-mcp

**实现**：
- `lib/business-meta.js`：四份 META + SCENE_CHIPS + EXAMPLE + `MCP_STATIC_TOOL_META` + `staticToolMetaFor()`
- `lib/index.js`：`/mcp-servers` 三卡→四卡静态注入；`fetchMcpToolMeta` 业务映射按服务器 id 泛化（去 pixpix 硬编码）；`ensureShopifySkill` / `ensureApifySkill` 新增
- `lib/client.js` ToolZone：场景分组（只读在前、写入/执行在后）+ 示例口令 + 徽标（写入/执行）
- toolCount 修正：shopify 45→14（用户 mcp-servers.json 同步修正防旧值压顶）

**验收**：`/mcp-servers` 四卡 toolMeta = static/14、static/37、static/38、static/12；技能目录四技能齐；PixPix 模板 v2 升级标记。

## 2. Shopify 客户端凭据认证改造

**背景**：新版 shopify-mcp v1.0.8 支持 Dev Dashboard 应用「客户端凭据」流（client_id + client_secret 自动换访问令牌、24h 续期），旧配置只认静态 shpat_ token。

**实现**：
- authFields：商店域名 + 客户端 ID + 加密密钥（替代 Admin API Token）
- `DEFAULT_MCP_SERVERS.shopify.envRefs` → `SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET / MYSHOPIFY_DOMAIN`
- probe `shopify-shop-info`：优先客户端凭据交换（`POST /admin/oauth/access_token` grant_type=client_credentials）再查 shop.json；兼容旧 token
- 技能 shopify-store-ops：14 行速查表（8 写 6 读）+ 写护栏「先确认、只读 scope 失败如实告知」

**当前状态**：代码完成并已同步 profile；**待收尾**——应用未安装到店铺（token 交换实测返回 `app_not_installed`），需用户在 Shopify 后台安装应用后写入三项凭据（域名 aibobo.myshopify.com 已提供，客户端 ID/加密密钥已提供）。

## 3. Apify 官方 MCP 接入（全绿）

**分析结论**（实测）：`https://mcp.apify.com/` 用 API Token 直接 `Authorization: Bearer` 可用，无需 OAuth；默认 URL 含 12 工具（含预置 apify--web-fetch / apify--rag-web-browser）。

**决策（用户拍板）**：API Token 认证；新建 apify-mcp 技能；付费护栏「告知成本+确认后调用」；保留预置双工具；URL 保持官方原样。

**实现**：
- 新机制 `headerRefs`（与 stdio envRefs 同构）：把凭据注入请求头 `authorization: Bearer <token>`
- `DEFAULT_MCP_SERVERS.apify`：streamable-http + headerRefs；企业应用卡 authFields=apify_token；probe kind `apify-user-info`（GET /v2/users/me）
- business-meta：APIFY 12 条 / 5 场景（找工具/跑任务/取结果/网页直取/文档与反馈）；call-actor/abort/report 标「执行」徽标
- 技能 apify-mcp：速查表 + 工作流（fetch-actor-details 先拿 schema → call-actor → get-actor-run 轮询 → get-dataset-items）+ 付费护栏

**验收（端到端全绿）**：probe 通过（账号 complex_homage · SCALE · $199/月 · 128 并发）；12 个 `mcp__apify__*` 工具注册进会话；实测 apify--web-fetch 抓取 example.com → SUCCEEDED 3.15s → get-dataset-items 取回 Markdown。

**坑记录**：MCP 请求头在宿主启动挂载时解析一次——token 必须在重启前写入凭据库，否则挂载缺 Bearer、mcp-client 重试 10 次仍失败，需再重启一次。

## 4. 当前状态总表（2026-09-09 21:20）

| 连接 | 类型 | 工具 | 认证 | 状态 |
| --- | --- | --- | --- | --- |
| 得到大脑 | stdio @getnote/mcp | 38 | API Key + Client ID | 已配置 ✓（原生 getnote_* 19 个双通道） |
| PixPix | streamable-http | 37 | OAuth PKCE | ⚠️ 令牌过期，待「浏览器授权」重授权 |
| Shopify | stdio shopify-mcp | 14 | 客户端 ID+加密密钥 | ⚠️ 待应用安装 + 凭证写入 |
| Apify | streamable-http | 12 | API Token（Bearer） | ✅ 全绿 |

## 5. 明日待办

1. Shopify：用户安装应用到 aibobo 店铺 → 写入三项凭据 → probe 通过 → mcp__shopify__* 14 工具注册 → 端到端实测
2. PixPix：设置页「浏览器授权」重授权，恢复 37 工具实时清单
3. （可选）dsh-team-hub 局域网域名化、dsh-my-quotes 持久性复查
