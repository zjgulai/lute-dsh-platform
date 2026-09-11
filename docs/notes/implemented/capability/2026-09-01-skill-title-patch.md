# Skill 中文 title 添加与调用 — 全过程回顾

> 目标：让业务用户在 DSH Desktop 输入 `/` 查找技能时，能看懂要执行哪个功能。
> 结论：不给 `name` 加中文（它是机器标识符），而是新增可选显示名字段 `title`，实现「标识符与显示名分离」。
> 日期：2026-09-01。宿主：DSH Desktop 内置 `0.1.2-alpha.1`（未发布 alpha，与 npm `0.1.1-rc.x` 分叉）。

## 1. 关键洞察

- `name` 被硬约束为 kebab-case：`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`，在 5 处强校验，并贯穿注册表 key、skill 工具参数、`<skill_content name>`、斜杠手势正则、模型目录。
- 因此「把 name 改成中文」是错方向；正确做法是加可选 `title`，缺省回退 `name`。
- `/` 选择器真实行为：主行显示 `item.name`，过滤 `skill.name.startsWith(query)`，`onPick` 插入 `/${name}`。

## 2. 完整改动链路（9 文件 / 20 处）

| 层 | 改动 |
|---|---|
| 核心模型 | `dsh-skill`：加 `title` + `toSummary`/`runtimeCandidate` 透传 + 3 处校验 |
| 文件系统 | `dsh-skill-filesystem`：解析 frontmatter `title`，`parseSkillFile`/`discoverRoot`/`get` 透传 |
| 模型目录 | `dsh-tool-skill`：目录行 `` `name`（标题）: desc ``，digest/readCatalog 同步 |
| 线上协议 | `dsh-api-session-controller`（index + types 副本 + typert.host + typert.remote-client）、`dsh-api-remotes` 客户端 schema |
| 选择器 | `dsh-client-ui-skill`：主行 `title ?? name`、title+name+description 过滤、`onPick` 仍插 `/name` |

## 3. 踩坑与机制（最有价值的沉淀）

1. **重启不重载客户端 bundle**：启动 rev 是 `randomBytes(8)` nonce，非内容哈希；改完重启后渲染器仍可能跑旧代码。可靠生效 = 改 bundle 内容 → `client-hmr` 500ms 轮询 → `rebuilt()` → rev 变内容哈希 → SSE 推 `rebuilt` 帧 → 渲染器热更；兜底 Cmd+R。
2. **typert wire schema 三份副本**：`typert.host.js` / `typert.remote-client.js` / `dsh-api-remotes/lib/client.js`，`result.mode:'strict'` 下缺一处 → 字段被裁或响应被拒。
3. **bundle 内联 vs 源副本**：`lib/index.js` 用 `//#region lib/types/xxx.js` 内联源；`lib/types/*.js` 是运行时通常不加载的源副本，但两处都要改保持一致。
4. **模型目录 digest 一致性**：`digestCatalogEntries` 纳入新字段后，`readCatalogEntries` 必须同步读取，否则目录每轮重发。
5. **免审批宿主探针**：`ctx.get('clientModules').graph()/clientPath(id)` 看 bundle 路径与 rev；`ctx.get('sessionSkillCatalog').list({sessionId})` 验证线上出口——注意 session id 带 `"session-"` 前缀。
6. **动态插件沙箱限制**：无 `logger`/`AbortController`；工具须 `harness.defineTool` + `registerTool`；返回值不能含 `undefined`。
7. **诊断工具**：`node --check`、`cat -et`（看 tab）、grep count==1 锚点、`diff -u`、`npx @electron/asar list`、`screencapture`+`tesseract`。

## 4. 验证手段（分层）

- 宿主管线：模型目录 `<available_skills>` 显示 `（标题）`（本会话注入目录即可见，最强宿主证据）。
- 线上出口：`sessionSkillCatalog.list()` 探针返回 `titledCount: 6`。
- 客户端热更：`clientModules.graph()` 的 rev 从 nonce 变内容哈希。
- 最终人工确认：`/` 菜单主行显示中文标题（用户确认「是中文」）。

## 5. 可复用资产

- `/Users/lute/project/Magpie-Horch/dsh-skill-title-fix/`：`apply.py`（幂等重放）、`README.md`、`backups/`（+ 原位 `.orig`）。
- 已优化技能：`~/.dsh/skills/build-deepseek-harness-plugin/references/skill-subsystem-and-checkout-patching.md`（沉淀完整改动面与验证方法）。
