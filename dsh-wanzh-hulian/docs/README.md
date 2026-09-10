# 万物互联插件（dsh-wanzh-hulian）· 文档索引与产品形态总览

> 最后更新：2026-09-09（与当前二次开发产品形态对齐）

## 1. 当前产品形态

- **设置页「万物互联」**（settings.section order 28）：四板块卡片墙
  - **MCP 连接**：4 个服务器卡（stdio / streamable-http），工具桥接 `mcp__<server>__<tool>`；每卡静态业务清单（场景分组折叠 + 「对模型说」示例口令 + 写入/执行徽标 + mcp 原始名锚点）
    - 得到大脑（官方 MCP，38 工具）✅ 已配置
    - PixPix（AI 图像 MCP，37 工具，OAuth PKCE）⚠️ 令牌过期待重授权
    - Shopify 商店（社区 MCP，14 工具，客户端 ID+加密密钥自动换令牌）⚠️ 待应用安装
    - Apify（官方远程 MCP，12 工具，API Token Bearer）✅ 全绿
  - **API 连接**：预留
  - **企业应用**：Shopify 商店卡（域名/客户端 ID/加密密钥，probe 支持客户端凭据交换）+ Apify 卡（API Token，probe 查账号/套餐/额度）
  - **知识库**：得到大脑连接（19 个 getnote_* 原生工具 + 38 个 mcp__getnote__* 双通道，双层开关 + 默认库 + OAuth/CLI + 配额）
- **输入区知识库选择器**：左栏底部「知识库」入口 → 右侧 360px 面板（搜索/存库分段 + 精简卡片墙，选库不选笔记）
- **连接配置化**：connections.json（schemaVersion 1）+ mcp-servers.json（按 id 合并默认，用户文件只覆盖运行时状态）；新增连接 = 默认条目 + authFields/extras/probe 声明式
- **工具业务清单单一数据源**：`lib/business-meta.js`（Shopify 14 / PixPix 37 / 得到 38 / Apify 12）→ UI 静态注入 + 技能同步共用
- **认证机制**：stdio `envRefs`（凭据注入环境变量）+ streamable-http `headerRefs`（凭据注入请求头，如 Apify Bearer）+ OAuth PKCE（PixPix）
- **probe 注册表**：getnote（配额+库数）/ shopify-shop-info（客户端凭据交换+店铺信息）/ apify-user-info（账号+套餐+并发上限）
- **技能同步**（宿主幂等写入，业务黑话→mcp 工具速查表）：getnote-brain、pixpix-ecommerce、shopify-store-ops、apify-mcp 四技能

## 2. 关键文件与数据

| 项 | 位置 |
| --- | --- |
| 插件源码 | /Users/lute/project/Magpie-Horch/dsh-wanzh-hulian/（lib/index.js 宿主 / client.js 客户端 / business-meta.js 工具业务清单 / catalog.js 板块目录） |
| 连接配置 | ~/.dsh/integrations/wanzh-hulian/connections.json（0600） |
| MCP 配置 | ~/.dsh/integrations/wanzh-hulian/mcp-servers.json（0600） |
| OAuth 令牌 | ~/.dsh/integrations/wanzh-hulian/oauth-pixpix.json（0600） |
| 得到大脑状态 | ~/.dsh/integrations/getnote/config.json（0600） |
| 凭证 | credentials 服务（getnote_api_key/getnote_client_id/shopify_domain/shopify_client_id/shopify_client_secret/apify_token，动态白名单自 authFields） |
| 引导技能 | ~/.dsh/skills/{getnote-brain,pixpix-ecommerce,shopify-store-ops,apify-mcp}/SKILL.md（宿主启动安装/幂等升级） |
| 生效语义 | 宿主变更=重启；客户端变更=刷新；技能文件=watcher 热载；MCP 挂载在宿主启动时解析凭据（token 必须先于重启写入） |

## 3. 文档导航

| 文档 | 内容 |
| --- | --- |
| mcp-connections-2026-09-08.md | **最新**：业务化清单 / Shopify 客户端凭据 / Apify 接入三项改造（决策+实现+验收+待办） |
| delivery-p0-p1.md | 交付与版本历史（v0.1.0 → v0.1.5 持续更新） |
| getnote-inventory-2026-09-06.md | 得到大脑盘点 + 分类整理执行报告（132 条 + 存量优化） |
| getnote-mcp-business-plan.md / getnote-organize-plan.md | 得到大脑 MCP 业务化与分类整理方案 |
| kb-picker-analysis.md / kb-entry-redesign-analysis.md / kb-entry-redesign-v3.md | 知识库选择器三轮设计与契约（选库不选笔记） |
| p4-shopify-plan.md / p4-config-architecture.md | Shopify 接入方案（安全审查通过）与配置化架构（T2/T2b 完成） |
| p4-mcp-tools-display.md / p4-pixpix-mcp-analysis.md | MCP 工具展示与 PixPix 接入分析（业务化清单的前身） |
| daily-summary-2026-09-06.md | 今日工作总结 |
