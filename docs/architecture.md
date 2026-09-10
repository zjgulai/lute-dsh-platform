# LUTE Agentic System · 架构与基座契约

## 1. DSH 基座事实（2.0.4 壳 + 0.1.2-alpha.1 技能层）

- Skill 契约：`name` 必须英文 kebab（加载与运行时双重校验）；目录一层扫描；`.system` 跳过；frontmatter 首行必须是且仅是一个 `---`（重复 `---` 会静默忽略技能，见诊断案例 12）。
- 插件：`dsh.bundle` + profile `file:` 硬链接安装；bundles 列表注册。
- 设置页：`settings.section` Slot（id/order/label/locale）。
- 输入区：`conversation.input.*` / `sidebar.footer.action` / `shell.overlay`（ownerProps 以实测为准——历史教训：root 级 slot 无 inputActions）。
- 工具：`ctx.tools.register(defineTool(...))`；工具名 DeepSeek 契约（≤64 字符、[A-Za-z0-9_-]）；MCP 宿主直挂 `dsh-mcp-client`（ctx.plugin），工具名 `mcp__<server>__<raw>`（连字符原样保留）。
- 凭证：credentials 服务（resolve/set/describe），页面不回显；文件类配置 0600。
- 生效语义：宿主变更=重启；客户端变更=刷新；技能文件=watcher 热载；**MCP 挂载在宿主启动时解析凭据（token 必须先于重启写入凭据库）**。
- 同步语义：profile 副本同步一律 tmp+mv 原子替换（`cat >` 遇硬链接会双杀两文件）。

## 2. 红线（改动前必读）

1. 只用内置 alpha SDK（@deepseek-ai/*），不引入 npm 发布线（防双实例）。
2. 不碰壳内 UI 的 shadows-shipped-ui slot（替换风险）。
3. 凭证永不落仓库/日志/模型上下文；子进程环境经凭证擦洗。
4. 编辑工具会打破 file: 硬链接 inode——改后必须 tmp+mv 同步 profile。
5. 补丁（patch-cn-slash 等）锚点为精确原文，restore 会回滚全部补丁。
6. MCP 工具模型侧描述不可覆写（dsh-mcp-client 无钩子）——业务中文层走「技能速查表」桥接（宿主 ensure*Skill 幂等写入）。

## 3. 模块地图

见 README.md「平台组成」。详细文档：
- 出海：`dsh-overseas-skills/docs/`（maintenance-sop、skill-taxonomy-v2=分类 v3 终审稿、recent-changes-2026-09-08…）
- 万物互联：`dsh-wanzh-hulian/docs/README.md`（产品形态总览 + 交付历史 + 方案；最新见 mcp-connections-2026-09-08.md）

### 万物互联当前形态（2026-09-09）

- 四板块：MCP 连接（4 服务器）/ API 连接（预留）/ 企业应用（Shopify + Apify）/ 知识库（得到大脑）
- MCP 服务器：getnote（stdio 38 工具 ✅）、pixpix（streamable-http OAuth PKCE 37 工具 ⚠️ 过期待重授权）、shopify（stdio 14 工具 ⚠️ 待应用安装）、apify（streamable-http Bearer 12 工具 ✅ 全绿）
- 认证注入：stdio `envRefs`；streamable-http `headerRefs`（Apify 首创）；OAuth PKCE（PixPix）
- 工具业务清单：`lib/business-meta.js` 单一数据源（14/37/38/12），UI 静态保底 + 实时增强；ToolZone 场景分组/示例口令/读写执行徽标
- probe 注册表：getnote / shopify-shop-info（客户端凭据交换）/ apify-user-info
- 技能同步四件：getnote-brain、pixpix-ecommerce、shopify-store-ops、apify-mcp

### 出海技能体系当前形态（2026-09-09）

- 分类 v3：`manifest/taxonomy-v3.json` → 8 大场景 / 28 细分 / 222 条；AI全栈 8 组 / 29 条；胶囊卡随 v3 改名
- catalog 生成：`build_preset_catalog.py`（勿手改 lib/catalog.js）；pipeline.sh 8 阶段（阶段 8 tmp+mv 防硬链接双杀）
- 图标：lute-brand-icons 角色头像（manifest 176 条目），assign_lute_icons.py 合并写防抹自定义图标
- 新卡：agent-browser（浏览器自动化）、self-improvement（知识进）；契约三键覆盖 237/248
