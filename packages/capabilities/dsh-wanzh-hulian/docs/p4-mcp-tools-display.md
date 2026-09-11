# MCP 工具能力展示 · 方案讨论稿 v1

> 痛点：MCP 卡只有名称/开关/状态，用户不知道连接能干什么、有哪些工具、怎么用。
> 状态：讨论稿，未改代码。

## 1. 数据从哪来（三种来源）

| 方案 | 机制 | 优点 | 代价/风险 |
| --- | --- | --- | --- |
| A 实时抓取 | 挂载时对 streamable-http 服务器自行 initialize + tools/list（pixpix 已实测可行：37 工具 + name/description + instructions）→ 缓存进内存 → /mcp-servers 返回 | 永远真实、自动跟随服务端更新；连服务说明(instructions)一起拿 | 挂载时 +2 请求；stdio 服务器要另做探测（本期可不做）；失败需降级 |
| B 静态配置 | mcp-servers.json 每条目手写 capabilities 摘要（如 pixpix 10 条能力）+ 工具总数 | 零新机制、最稳 | 服务端更新不同步；人工维护 |
| C 混合（推荐） | 静态 capabilities chips 兜底 + A 实时清单（成功则显示全量 name+description，失败回退静态） | 稳 + 真 | A 的实现工作量 |

## 2. 展示形态（客户端）

MCP 卡增加「工具能力区」：
- 徽章行：`37 个工具 · mcp__pixpix_*`
- **可展开清单**：点击展开全部工具（原始名 generate_image + 一行描述 + 模型面名称 mcp__pixpix_generate_image），默认收起
- **使用引导**（若拿到 instructions）：折叠引用块展示服务自述（pixpix：「当用户需求与任一能力匹配时使用对应工具；生成工具异步返回任务 ID…」）
- 状态灯语义不变；全部只读展示，无新交互态

## 3. 兼容与稳定性红线

- 抓取失败/超时 → 静默回退静态 capabilities，**绝不阻塞挂载**；抓取走 token 复用（pixpix oauth 已有），stdio 型服务器本期只显示静态摘要
- 工具数据仅内存缓存（重启重抓），不新增持久化文件
- 不把工具清单注入模型上下文（模型自己从 ToolRuntime 拿 schema）；展示层纯 UI
- 展示名称同时给 raw name 与 mcp__ 前缀名，用户可直接引用

## 4. 待决策问题

1. 数据来源：A 实时抓取 / B 静态配置 / **C 混合（推荐）**？
2. 展示粒度：A 全量清单可展开（37 条）/ B 只显示精选能力 chips / **C chips + 可展开全量（推荐）**？
3. 使用引导（instructions 服务自述）要不要展示？
4. 本期范围：pixpix 先做（streamable-http 可行），stdio 服务器（getnote/shopify MCP）静态摘要即可——同意吗？

## 5. 决策记录与最终方案（2026-09-06）

| 决策 | 结论 |
| --- | --- |
| 数据来源 | **C 混合**：静态 capabilities 兜底 + 挂载时实时 tools/list（失败静默回退，不阻塞挂载） |
| 展示粒度 | **C**：卡片默认精选 chips，点击展开全量清单（raw 名 + 一行描述 + mcp__ 前缀名） |
| 使用引导 | **展示 instructions**：折叠引用块展示服务自述 |
| 范围 | **A 分型**：streamable-http（pixpix）实时抓取；stdio（getnote/shopify）静态摘要 |

### 实施清单（待「开始」）

1. 宿主（lib/index.js）：
   - mcp-servers.json 的 pixpix 条目补 `capabilities` 静态摘要（11 条精选能力）+ `toolCount: 37`
   - mountMcpServers 对 streamable-http + oauth-pkce 条目：ensureOauthToken 后自行 initialize + tools/list（复用 token，Accept: application/json, text/event-stream + Session-Id 流程，已实测）→ 取 {tools:[{name,description}], instructions} → 缓存 `globalMcpToolMeta[serverId]`；失败静默
   - /mcp-servers GET 每服务器附 `toolMeta: {tools, instructions, source: "live"|"static"}`
2. 客户端（McpBoard）：
   - 卡片加「工具能力」区：chips（静态 capabilities）+ 徽章 `N 个工具 · mcp__<id>_*` + 「展开全部」折叠清单 + instructions 折叠引用块
   - 展开状态本地 useState；全部只读
3. 红线：抓取超时 15s、失败回退、不阻塞挂载、不注入模型上下文
4. 验收：重启后 PixPix 卡显示 11 chips + 37 工具可展开（含描述）+ 服务自述；getnote/shopify 卡显示静态摘要

## 6. 实施完成（2026-09-06）

- 宿主：pixpix 条目补 capabilities（11 条精选）+ toolCount 37；新增 fetchMcpToolMeta（initialize→Session-Id→tools/list→{tools,instructions}，15s 超时、失败静默、不阻塞挂载）；/mcp-servers 附 toolMeta。
- 客户端：MCP 卡新增「工具能力区」ToolZone 组件——薄荷底绿描边工具卡（品牌一致）：`N 个工具 · mcp__<id>_*` 徽章 + 精选能力 chips + 「查看全部工具」折叠清单（raw 名/描述/模型面名称）+ instructions 服务自述引用块；hover 交互全部 dsw token。
- 规范修复：工具区独立组件化（避免 map 内 useState 违反 hooks 规则）。
- 生效：重启 DSH → MCP 板块 PixPix 卡应显示 11 chips + 37 工具可展开 + 服务自述；getnote/shopify（stdio）显示静态 chips。

## 7. 修复：readMcpServers 按 id 合并（2026-09-06 收尾）

- 问题：`readMcpServers` 文件存在时整体返回文件内容——用户 mcp-servers.json 只有 getnote 一条时，pixpix/shopify 卡片整体消失。
- 修复：按 id 合并——用户文件条目覆盖运行时状态（enabled），默认条目补齐静态元数据（capabilities/toolCount/auth/url）。
- 补齐静态摘要：shopify（6 chips / 45 工具）、getnote（6 chips / 39 工具）；pixpix 已有（11 chips / 37 工具）。
- 效果：重启后 MCP 板块恒显示三张卡；未启用卡片以静态摘要呈现能力，启用后 streamable-http 实时覆盖。

## 8. PixPix 业务化改造（2026-09-06 决策后实施）

决策：卡片 + 业务技能双管齐下；业务名为主 + 技术名副标；37 个工具全部业务化。

### 8.1 网页 ↔ MCP 映射核查（实测）

- 网页 9 个电商工具中 8 个有 MCP 对应：hot-seller-replicate→bestseller-replica、product-image-set→product-suite、apparel-set→apparel-set、model-try-on→apparel/footwear/lingerie-try-on+ai-wear-anything、detail-page→a-plus-detail、product-retouch→product-retouch(+recolor+hd-image)、seller-video→viral-ecommerce-video、video-replicate→video-replication。
- 唯一缺口：synthetic-performer-tagger（亚马逊 AI 合成人像合规标记）为纯浏览器本地免费工具，MCP 未暴露 → 卡片 note 已注明并提供网页路径。
- MCP 链路实测通过（list_generation_models 返回 GPT Image 2 / Nano Banana / Seedream / Midjourney 等模型目录）。

### 8.2 实施内容

1. 宿主：PIXPIX_BUSINESS_META（37 条：业务名/业务描述/场景分组）；fetchMcpToolMeta 对每个工具附加 businessName/businessDesc/scene；capabilities chips 改 8 个业务分组；note 更新缺口说明。
2. 客户端：ToolZone 展开清单改「业务名（主，600 加粗）+ 技术名副标（等宽，截断）+ 业务描述（两行截断）」；按钮改「查看全部 37 项能力」；新增 whToolTitle flex 行。
3. 技能：新增 pixpix-ecommerce（ensurePixpixSkill 幂等安装，保 flags）——业务黑话速查表（23 行映射）+ 标准工作流（上传→提交→轮询→展示→成本）+ 注意事项（异步轮询/积分/真人授权/合规标记网页端）。
4. 模型面描述不改（dsh-mcp-client 原样透传，架构红线）。

## 9. 得到大脑 MCP 业务化（2026-09-06 实施）

决策：38 个全部业务化（实测官方 MCP 实际暴露 38 个）/ 技能路由（原生优先、MCP 补全）/ 6 组业务分组。详见 getnote-mcp-business-plan.md。

- 实测 spawn @getnote/mcp（带 CLI 凭证）→ tools/list = 38 工具，映射表按实测清单核对。
- 宿主：GETNOTE_MCP_BUSINESS_META（38 条）+ GETNOTE_SCENE_CHIPS（6 组）；getnote 默认条目 capabilities/toolCount(38)/note 业务化；/mcp-servers GET 对 getnote 注入合成 toolMeta（source: "static"）→ ToolZone 零改动获得可展开能力。
- 技能：getnote-brain SKILL_TEMPLATE 增补「官方 MCP 路由（38 工具）」章节；ensureSkill 升级检测条件改为缺该章节才重写；本地 SKILL.md 已立即升级（flags 保留）。
- 数据治理：用户 mcp-servers.json 三条目清除 note/capabilities/toolCount 静态字段，统一由插件默认提供（防旧文案覆盖业务化版本）。
