# 万物互联插件（dsh-wanzh-hulian）· 文档索引与产品形态总览

> 最后更新：2026-09-06（与当前二次开发产品形态对齐）

## 1. 当前产品形态

- **设置页「万物互联」**（settings.section order 28）：四板块卡片墙
  - **MCP 连接**：服务器卡片墙（stdio/HTTP），工具桥接 `mcp__<server>__<tool>`；预置 @getnote/mcp（默认关）、shopify-mcp（默认关，与企业应用连接联动）
  - **API 连接**：预留（规划中）
  - **企业应用**：Shopify 商店连接（配置化：connections.json 驱动；kind=mcp 走 MCP 桥；只读由 Custom App scopes 平台层强制）——待凭证冒烟
  - **知识库**：得到大脑连接（19 个 getnote_* 工具 + 双层开关 + 默认库 + OAuth/CLI 双通道 + 配额）
- **输入区知识库选择器**：左栏底部「知识库」入口（与深度研究同款样式）→ 右侧 360px 面板（搜索/存库分段 + 精简卡片墙，选库不选笔记）
- **连接配置化**：connections.json（schemaVersion 1）——新增连接 = 加一条配置（authFields/extras/probe/kind/mcpServerId 声明式）
- **技能卡片结构化引导**（dsh-overseas-skills 侧）：L1 30 个人工模板 + L2/L3 兜底

## 2. 关键文件与数据

| 项 | 位置 |
| --- | --- |
| 插件源码 | /Users/lute/project/Magpie-Horch/dsh-wanzh-hulian/（lib/index.js 宿主 / client.js 客户端 / catalog.js 板块目录） |
| 连接配置 | ~/.dsh/integrations/wanzh-hulian/connections.json（0600） |
| MCP 配置 | ~/.dsh/integrations/wanzh-hulian/mcp-servers.json（0600） |
| 得到大脑状态 | ~/.dsh/integrations/getnote/config.json（0600） |
| 凭证 | credentials 服务（getnote_api_key/getnote_client_id/shopify_domain/shopify_access_token 等，动态白名单） |
| 引导技能 | ~/.dsh/skills/getnote-brain/SKILL.md（宿主启动安装/幂等升级） |
| 生效语义 | 宿主变更=重启；客户端变更=刷新；补丁=重启/刷新 |

## 3. 文档导航

| 文档 | 内容 |
| --- | --- |
| delivery-p0-p1.md | 交付与版本历史（v0.1.0 → v0.1.5 持续更新） |
| getnote-inventory-2026-09-06.md | 得到大脑盘点 + 分类整理执行报告（132 条 + 存量优化） |
| getnote-organize-plan.md | 分类整理能力扩展方案与决策 |
| kb-picker-analysis.md / kb-entry-redesign-analysis.md / kb-entry-redesign-v3.md | 知识库选择器三轮设计与契约（选库不选笔记） |
| p4-shopify-plan.md / p4-config-architecture.md | Shopify 接入方案（安全审查通过）与配置化架构（T2/T2b 完成） |
| daily-summary-2026-09-06.md | 今日工作总结 |
