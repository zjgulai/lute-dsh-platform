# LUTE Agentic System · 架构与基座契约

本页是**有序地图**：只写组合、能力归属、扩展点与门禁契约；类型定义、逐包细节、决策理由一律在被链接的文档里（分层规则见根 [AGENTS.md](../AGENTS.md)）。

## 0. 仓库构成与门禁（2026-09-11 起）

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 基座参照系 | `vendor/dsh-desktop/deepseek-harness/` | pin 到 `a66e470`（runtime 0.1.2-rc.1）的上游源码，**只读、不参与构建**（[ADR-0008](adr/ADR-0008.md)） |
| 壳层 fork | `vendor/dsh-desktop/` | 嵌套仓库，pin 见 `vendor/dsh-desktop.pin`；改 pin 与行为变更分开提交 |
| 运行时来源 | `vendor/dsh-runtime/0.1.2-rc.1/*.tgz` | 打包与 profile 实际使用的运行时产物 |
| 二开插件 | `packages/<能力组>/<包>/` | 19 个受管包按能力归入 5 组（[ADR-0011](adr/ADR-0011.md)）。**二期迁移已完成且兼容分支已退役**：`package-layout.mjs` 只认 `packages/<组>/<包>` 一种布局（2026-09-11 G7，此前「历史平铺」分支已无对象） |
| 出海技能创作源 | `~/project/81-Skills/`（**仓库外**） | 81 个中文名原文，经 `dsh-overseas-skills/scripts/import-81skills.mjs` 转换后安装进 `~/.dsh/skills/`。2026-09-11 迁出仓库，与同包其余 3 个 importer（accio / marketing / fullstack）的「源在仓库外」设计一致 |
| 门禁 | `scripts/gate.mjs` | 单命令聚合校验，退出码即契约（[ADR-0014](adr/ADR-0014.md)） |

**归档出工作树的资产不在仓库内**：按 [ADR-0013](adr/ADR-0013.md) 的「归档出工作树」档，根层游离件（旧 bundle、预览 HTML 群、已完成的补丁项目等）移至 `~/project/_archive/Magpie-Horch-<日期>/`，**该目录内的 `README.md` 是归档索引**（逐项列来源与去向）；仓库内不再保留副本，回溯时去那里找。刻意**未**归档的两项也记在该索引里：`dsh-rootoutlet-heal/`（白屏手册 §6.1 的运行时回滚基线）与 `.dsh-types/`（ADR-0017 的生成物）。

门禁契约（`pnpm run gate` / `pnpm run gate:full`）：

| 校验项 | 阻塞 | 依据 |
| --- | --- | --- |
| `package-identity` | 是 | 每个受管 `package.json` 必含 `luteOrigin` / `luteOwner` / `lutePublish`（ADR-0012） |
| `pin-consistency` | 是 | `vendor/dsh-desktop.pin` 的 `harness-submodule` 必须等于子模块实际 HEAD（ADR-0008） |
| `gitignore-whitelist` | 是 | 白名单条目必须指向真实路径，禁止幽灵条目（ADR-0013） |
| `adr-index` | 是 | ADR 编号连续、索引与文件一致（ADR-0015） |
| `adr-note-links` | 是 | ADR 的「决策记录」链接可达，且 Note 正文回引该 ADR 编号（ADR-0015） |
| `exemptions-frozen` | 是 | 豁免条目只减不增、期限不延后、到期即失败（ADR-0014） |
| `profile-files-sync` | 是 | profile 副本必须与包 `package.json` 的 `files` 清单一致：清单声明但源码无（陈旧清单）、源码有而副本缺（真缺件）都失败。盯 `node_modules`（真实装载点）；`vendor` 侧由既有 `profile-metadata-sync` 负责（见 `docs/notes/implemented/contract/2026-09-11-preset-lint-and-profile-files-sync.md`） |

退出码：`0` 全部通过 · `1` 存在失败校验 · `2` 用法错误。`--list` 输出全部校验项名称。

## 1. DSH 基座事实（双基座：生产 2.0.4/alpha.1 · 发行 2.0.0=2.0.5/rc.1）

> 2026-09-10 更新：发行线已迁移到 DSH Desktop 2.0.5 + runtime 0.1.2-rc.1（LUTE 2.0.0，
> 35 补丁重锚、34→35 锚点 verify v2、smoke 37/37）；生产机仍是 2.0.4/alpha.1（灰度期双基座漂移，
> 见 docs/research/09-audit-architecture.md C 类与 10-debt-solution.md 段 C）。下方契约两基座通用，
> 差异处以「2.0.5」标注。

- Skill 契约：`name` 必须英文 kebab（加载与运行时双重校验）；目录一层扫描；`.system` 跳过；frontmatter 首行必须是且仅是一个 `---`（重复 `---` 会静默忽略技能，见诊断案例 12）。
- 插件：`dsh.bundle` + profile `file:` 硬链接安装；bundles 列表注册。
- 设置页：`settings.section` Slot（id/order/label/locale）。
- 输入区：`conversation.input.*` / `sidebar.footer.action` / `shell.overlay`（ownerProps 以实测为准——历史教训：root 级 slot 无 inputActions）。
- 工具：`ctx.tools.register(defineTool(...))`；工具名 DeepSeek 契约（≤64 字符、[A-Za-z0-9_-]）；MCP 宿主直挂 `dsh-mcp-client`（ctx.plugin），工具名 `mcp__<server>__<raw>`（连字符原样保留）。
- 凭证：credentials 服务（resolve/set/describe），页面不回显；文件类配置 0600。
- 生效语义：宿主变更=重启；客户端变更=刷新；技能文件=watcher 热载；**MCP 挂载在宿主启动时解析凭据（token 必须先于重启写入凭据库）**。
- 同步语义：profile 副本同步一律 tmp+mv 原子替换（`cat >` 遇硬链接会双杀两文件）。**`file:` 依赖的副本是安装时刻的硬链接快照——安装之后新增的文件不会自动进去**，必须按 `files` 清单补（漏补的症状是「功能静默不生效 + 日志一句 warn」，2026-09-11 的 preset lint 全失效即此因）。
- **可选服务的读法**：`ctx.get(name, false)` 读不到就是 `undefined`（正常态）；**属性读 `ctx.<name>` 对未 inject 的服务会抛** `cannot get property "…" without inject`（cordis 的代理陷阱）。所以「可选」的判据一律包保护，且失败态按**最保守结论**走——栅栏读不到配对服务 = 拒绝，不是放行（[ADR-0038](adr/ADR-0038.md)；2026-09-12 实测：共享栅栏在生产里因此抛异常，被 webserver 兜成 400，其 `403` 分支不可达）。

## 2. 红线（改动前必读）

1. 只用内置 alpha SDK（@deepseek-ai/*），不引入 npm 发布线（防双实例）。
2. 不碰壳内 UI 的 shadows-shipped-ui slot（替换风险）。
3. 凭证永不落仓库/日志/模型上下文；子进程环境经凭证擦洗。
4. 编辑工具会打破 file: 硬链接 inode——改后必须 tmp+mv 同步 profile。
5. 补丁（patch-cn-slash 等）锚点为精确原文，restore 会回滚全部补丁。
6. MCP 工具模型侧描述不可覆写（dsh-mcp-client 无钩子）——业务中文层走「技能速查表」桥接（宿主 ensure*Skill 幂等写入）。
7. **官方 UI 改写锚禁止钉哈希**：对官方 DOM 的改写（隐藏或替换官方文案/角标等）必须**运行时**解析类名——用官方样式标签的包路径锚 `style[data-plugin-css="<包路径>/<模块>.module.css"]`，配模块局部名负向断言算出完整类名；禁止把 CSS-module 哈希前缀写进产品代码或测试断言；解析失败必须自报（`console.warn` + `document.documentElement.dataset` 诊断属性），最坏表现是降级而非静默失效。依赖哈希的改写每次上游重建必失效（DSH 2.0.4→2.0.5 的 `_37cUPa_*`→`zNic4G_*`、`q2FAPq_root`→`bxNl9a_root` 即实例，见 [ADR-0019](adr/ADR-0019.md)）；上游改**模块文件名**才需重锚模块 id，改哈希前缀无需维护。

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
