# P4 · 企业应用首连 Shopify · 方案与决策（v1 讨论稿）

> 状态：调研完成，讨论稿，未改代码。背景：桌面 codex.app 已接 Shopify（官方 shopify@openai-curated 插件，OAuth 流）。

## 1. 调研结论

| 事实 | 结论 |
| --- | --- |
| codex 的 Shopify 接入 | 官方「Shopify AI Toolkit」插件（`codex plugin add shopify@openai-curated`），OAuth 授权，**凭证存在 codex 插件私有存储**（~/.codex 无明文）→ **无法直接复用** |
| Shopify 官方 MCP | 官方 MCP 面向开发者资源（Hydrogen/dev），**不是店铺运营 MCP**；商店运营走 Admin API |
| Admin API | GraphQL（2026-04 版）+ REST；**Custom App（admin-created）** 最简：后台建 App → 勾选 scopes（read_products/read_orders…）→ 生成 Admin API access token（只显示一次）→ 请求头 `X-Shopify-Access-Token` |
| 社区 shopify-mcp | `npx shopify-mcp --accessToken X --domain your-store.myshopify.com`（stdio，geli2001/shopify-mcp）——**可直接挂到 P3 MCP 基建** |
| 多 App 共存 | Shopify 支持同店多 App：给 DSH 新建一个 Custom App **不影响 codex 现有接入** |

## 2. 三条路线

| | A. 社区 shopify-mcp 挂 P3 基建（推荐） | B. 宿主直连 Admin GraphQL 自研工具 | C. 复用 codex 凭证 |
| --- | --- | --- | --- |
| 落地速度 | 最快（P3 基建 + 配置一行） | 中（自研 6-8 工具） | ✗ 不可行（私有存储，已查实） |
| 能力面 | 社区包工具全集（产品/订单/客户等，接入前 clone 审查） | 按需定制（一期只读：products/orders/customers/inventory） | — |
| 可控性 | 中（第三方包，需安全审查：确认只调 Admin API、token 走 env 不落盘） | 高（与 getnote 同构） | — |
| 凭证 | Custom App token + 域名 → credentials 服务（envRefs 注入，不落盘明文） | 同左 | — |

**推荐：A 先行**（P3 基建零新代码吃满红利）——接入前先 clone 审查社区包的工具面与安全边界；**B 作为 A 不满足时的自研路线**；C 弃用（说明：同店新建 Custom App 即可，与 codex 互不影响）。

## 3. 完整接入方法（A 路线）

1. **你操作（Shopify 后台）**：设置 → 应用和销售渠道 → 开发应用 → 创建应用（Custom App）→ 勾选 API 权限（一期建议：read_products、read_orders、read_customers、read_inventory、read_fulfillment_orders、read_discounts）→ 安装 → 复制 Admin API access token + 商店域名（xxx.myshopify.com）。
2. **设置页填凭证**：企业应用板块「Shopify」卡：商店域名 + Access Token（存 credentials 服务 refs：shopify_domain / shopify_access_token，600，页面不回显）。
3. **MCP 挂载**：mcp-servers.json 预置 shopify 条目（stdio npx shopify-mcp，envRefs 注入 token/domain，默认关闭）→ 开关打开 → 重启 → 状态「运行中」。
4. **验收**：模型调用 mcp__shopify_* 只读工具（查商品数/最近订单）→ 出报告。

## 4. 执行 TODO（待决策后实施）

- [ ] T1 clone 审查 geli2001/shopify-mcp（工具清单 + token 处理 + 网络目标）
- [ ] T2 catalog：企业应用板块 ready + shopify 连接卡（capabilities/凭证字段/状态灯）
- [ ] T3 mcp-servers.json 预置 shopify 条目（envRefs → shopify_domain/shopify_access_token）
- [ ] T4 设置页 Shopify 卡（域名+token 表单、开关联动 MCP 条目、状态）
- [ ] T5 只读冒烟（products/orders/customers 各一查）+ 验收说明
- [ ] T6 文档（delivery-p4）

## 5. 待决策问题

1. 路线：A 社区 MCP 先跑（推荐）/ B 直接自研 GraphQL 工具 / A 不行再 B？
2. 凭证：你在 Shopify 后台新建 Custom App（推荐，与 codex 共存不冲突）？token 只显示一次，务必复制保存。
3. 一期范围：只读为主（商品/订单/客户/库存/折扣查询）够吗？还是需要写操作（折扣码/库存调整）？
4. 安全审查：社区包 T1 审查通过才接入（推荐）；若你更在意可控性可改选 B。

## 6. 决策记录（2026-09-06）

| 决策 | 结论 |
| --- | --- |
| 路线 | **A**：社区 shopify-mcp 挂 P3 MCP 基建（先审查再接入，不满足再切 B 自研） |
| 凭证 | **新建 Custom App**（用户 Shopify 后台操作；token 只显示一次；与 codex 共存） |
| 一期范围 | **只读为主**：products/orders/customers/inventory/discounts 查询 |
| 安全审查 | **先审查再接入**：工具清单/token 处理/网络目标 |
