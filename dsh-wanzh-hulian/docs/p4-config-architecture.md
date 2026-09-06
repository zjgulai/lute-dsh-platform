# T2-T6 配置化架构 · 兼容性方案与执行 TODO（v1 讨论稿）

> 目标：企业应用（及后续全部连接）改为**配置驱动**——新增一个连接 = 加一条配置，零代码。
> 状态：讨论稿，未改代码。

## 1. 配置模型

**`~/.dsh/integrations/wanzh-hulian/connections.json`**（0600，schemaVersion: 1）：

```json
{
  "schemaVersion": 1,
  "connections": [
    {
      "id": "shopify",
      "board": "enterprise",
      "title": "Shopify 商店",
      "subtitle": "店铺运营只读",
      "enabled": false,
      "kind": "mcp",
      "mcpServerId": "shopify",
      "authFields": [
        { "ref": "shopify_domain", "label": "商店域名", "placeholder": "xxx.myshopify.com" },
        { "ref": "shopify_access_token", "label": "Admin API Token", "placeholder": "shpat_xxx", "secret": true }
      ],
      "probe": { "kind": "shopify-shop-info" },
      "capabilities": ["商品查询", "订单查询", "客户查询", "库存查询", "折扣查询"],
      "note": "只读（Custom App 仅 read_* scopes，写操作被平台拒绝）"
    }
  ]
}
```

**MCP 条目**继续在 `mcp-servers.json`（shopify 预置：stdio npx shopify-mcp，envRefs SHOPIFY_ACCESS_TOKEN/MYSHOPIFY_DOMAIN）；连接卡「启用」联动其 mcpServerId 的 enabled。

## 2. 兼容性设计（DSH 契约）

| 层 | 设计 | 兼容依据 |
| --- | --- | --- |
| 配置存储 | connections.json 0600 + schemaVersion + 缺省回退（文件损坏→内置默认） | 与 config.json/mcp-servers.json 同款先例 |
| 凭证 | 每连接声明 authFields → CREDENTIAL_REFS 白名单**动态收集**（不再硬编码）；写入仍走 /credential | 沿用 credentials 服务契约 |
| 探测 | probe.kind 注册表（shopify-shop-info：宿主直连 `GET https://{domain}/admin/api/2026-04/shop.json` + X-Shopify-Access-Token；getnote：quota+topics 现有实现） | 只读 REST，token 仅请求头 |
| 开关 | 连接 enabled → 联动 MCP 条目 enabled（统一开关语义，避免两处打架）；静态挂载重启生效 | 与 P3 静态挂载一致 |
| 客户端 | **通用连接卡渲染器**：按 authFields 渲染表单、按 state 渲染状态灯、按 probe 渲染测试按钮；getnote 卡迁移到通用渲染器（双层开关/默认库下拉/OAuth 按钮作为 getnote 专属扩展控件保留） | 单渲染器减少硬编码，视觉统一 |
| 执行层分发 | kind=mcp → 工具来自 P3 MCP 桥（零代码）；kind=builtin（getnote）→ 宿主 19 工具（保留） | 工具注册机制不变 |

## 3. 执行 TODO（T2-T6 · 配置化版）

- [ ] **T2.1** 定义 connections.json schema + 内置默认（shopify 条目 + getnote 元数据迁入）
- [ ] **T2.2** 宿主：连接注册表加载/校验/回退；CREDENTIAL_REFS 动态化；probe handler 注册表（shopify-shop-info 实现）
- [ ] **T2.3** mcp-servers.json 预置 shopify 条目（envRefs 两字段）；连接 enabled ↔ mcp 条目联动
- [ ] **T2.4** 客户端：通用连接卡渲染器；企业应用板块上线；getnote 卡迁移（回归：双层开关/默认库/OAuth 按钮/配额显示不缩水）
- [ ] **T3** 冒烟：shopify 只读三查（商品/订单/客户）+ getnote 全功能回归
- [ ] **T4** 文档：delivery-p4 + connections.json 说明

## 4. 待决策问题

1. 配置化范围：A 全部连接统一配置化（getnote 元数据一并迁入，推荐）/ B 仅企业应用配置化、getnote 保持现状？
2. 开关语义：A 连接 enabled 联动 MCP 条目（统一，推荐）/ B 两者独立开关？
3. 客户端重构：A getnote 卡迁移到通用渲染器（视觉统一但需回归，推荐）/ B 新增通用渲染器只服务新连接、getnote 卡不动（零回归风险但两套卡片代码）？
4. probe 兜底：token 未配置时状态灯显示「未配置凭证」+ 提示（推荐），连接仍可启用（工具存在但调用报未配置）？

## 5. 决策记录（2026-09-06）

| 决策 | 结论 |
| --- | --- |
| 配置化范围 | **A 全部统一**：connections.json 统一管全部连接（getnote 元数据迁入），一套配置模型 |
| 开关语义 | **A 联动统一**：连接 enabled ↔ 其 mcpServerId 条目 enabled |
| 客户端 | **A 迁移统一**：通用连接卡渲染器；getnote 卡迁移后全功能回归 |
| 未配置凭证 | **A 软状态**：状态灯「未配置凭证」+ 引导；可启用，工具调用时返回配置指引 |

## 6. 最终执行 TODO（待「开始」）

1. **T2.1 配置模型**：connections.json（schemaVersion 1）+ 内置默认（shopify 条目 + getnote 元数据迁入）
2. **T2.2 宿主**：连接注册表加载/校验/损坏回退；CREDENTIAL_REFS 动态化；probe 注册表（+shopify-shop-info 实现）
3. **T2.3 MCP 联动**：mcp-servers.json 预置 shopify 条目（envRefs SHOPIFY_ACCESS_TOKEN/MYSHOPIFY_DOMAIN）；enabled 联动
4. **T2.4 客户端**：通用连接卡渲染器 + 企业应用板块；getnote 卡迁移（双层开关/默认库/OAuth/配额不缩水）
5. **T3 冒烟**：shopify 只读三查（商品/订单/客户）+ getnote 全功能回归
6. **T4 文档**：delivery-p4 + connections.json 说明
7. 全程：重启/刷新生效语义、0600 权限、loopback、凭证不回显——沿用既有红线

## 7. T2 实施完成（2026-09-06）

已落地（本轮）：
- **T2.1** connections.json（schemaVersion 1）+ 内置默认（getnote 元数据迁入 + shopify 条目：authFields 两字段、probe=shopify-shop-info、kind=mcp、mcpServerId=shopify）。
- **T2.2** 宿主：readConnections 合并回退（损坏→内置默认）；CREDENTIAL_REFS 动态收集；probe 注册表（getnote / shopify-shop-info：GET admin/api/2026-04/shop.json）；/probe 按 id 分发；/toggle 通用化（enabled 写配置 + 联动 MCP 条目；modelInvoke 仅 getnote）。
- **T2.3** mcp-servers.json 预置 shopify 条目（npx shopify-mcp，envRefs SHOPIFY_ACCESS_TOKEN/MYSHOPIFY_DOMAIN，默认关）。
- **T2.4a** 客户端：通用连接卡渲染器（authFields 动态表单/连接开关/测试连接/管理后台链接/能力 chips/状态灯）；企业应用板块上线；boards 徽章计数动态化；/open 白名单补 Shopify 域。
- **待办（T2b）**：getnote 卡迁入通用渲染器（extras：model-invoke/oauth-button/default-topic 三类扩展控件）；shopify 只读三查冒烟（等你的 Custom App 凭证）；delivery-p4 文档。

验收（重启后）：企业应用板块见「Shopify 商店」卡（未配置状态）；填域名+token → 保存 → 测试连接 → 状态灯；getnote 卡行为不变。

## 8. T2b 完成（2026-09-06 · getnote 卡迁入通用渲染器）

- GenericConnCard 扩展三类 extras：model-invoke（双层开关第二层）/ oauth-button（浏览器授权登录）/ default-topic（默认知识库下拉，fetch /topics）。
- getnote 卡迁移完成：知识库板块与通用卡同一渲染器；旧 GetnoteCard 组件与旧 saveCreds(key, clientId) 删除——**顺带修复了 saveCreds 双定义冲突**（此前新 jobs 版覆盖旧版，getnote 卡的「保存凭证」按钮会崩）。
- getnote 状态灯保留 CLI 两态（credSource=cli / cliAuthed 回退提示）。
- 回归点：双层开关 / 默认库下拉 / OAuth 按钮 / 测试连接（probe 注册表 getnote 分支）/ 凭证保存——全部走通用路径。
- profile 已同步；刷新页面即生效（无需重启，客户端 bundle 随刷新重载；宿主未变）。
