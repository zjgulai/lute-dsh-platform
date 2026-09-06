# modsearch · 本地安装说明（5.10.0，npm 安装）

> 本文件是本机安装说明。上游：https://github.com/liustack/modsearch（MIT，320★）。上游 README.md 保留不动。

## 一、这是什么

liustack 出品的免费联网搜索桥（与已装的 modlens 同作者）：为没有原生联网能力的模型补上搜索。免注册免 API key（Firecrawl keyless，每月 1000 免费额度），支持网页搜索、X 搜索、网页抓取，返回结构化 JSON 证据。

## 二、使用方法

- **搜索/抓取**：安装后本机 `web_search` / `web_fetch` 工具改走 modsearch 后端（Firecrawl keyless 抓取 + Exa 搜索 + X 降级）——返回结构化证据
- **设置**：设置 → 插件 → modsearch 卡片（settings.plugin.item）
- **CLI**（可选）：`modsearch` 命令（bin），供其他 agent 客户端使用
- **技能**（可选）：上游含 `skills/modsearch/SKILL.md`，供 Codex/Claude 等其他 agent 使用

## 三、相关说明

- **⚠️ 搜索后端切换**：bundle patch 会把宿主 `web` 行 `searchProvider` 从 `deepseek-official` 改为 `modsearch`——已获用户授权；如需切回，在 profile `cordis.patch.yml` 追加 `- id: web` + `config: { searchProvider: deepseek-official }` 覆盖（patch 后置层优先）
- **兼容性**：host 零 @deepseek-ai 导入（原生 JSON-Schema 注册工具，规避版本漂移）；inject `[tools, web]` 本机全存在；client require = react + primitives（基线）；注册 settings.plugin.item
- **依赖**：commander + undici（npm）；engines node >=22.13 ✓
- **安装方式**：`"@liustack/modsearch": "5.10.0"` 依赖 + bundles 条目；npm 安装，无构建
- **回滚**：移除依赖与 bundles 条目 → pnpm install → 重启 Desktop（自动恢复官方搜索）
- **更新**：改依赖版本号 → pnpm install → 重启
- **与 deepresearch 关系**：deepresearch 自挂 fetch provider（若缺）；modsearch 替换 search provider——不同 seam，无冲突

## 四、迭代优化方向

1. **后端质量观察**：切换后观察 web_search 结果质量（Firecrawl keyless 免费额度、X 降级行为），不理想可用 profile patch 切回官方
2. **上游追踪**：320★ 活跃项目；更新时注意 `searchProvider` patch 语义是否变化
3. **agent skill 接入**：如需，可把 `skills/modsearch/SKILL.md` 同步到 `~/.dsh/skills/`（当前 DSH 安装仅 bundle，本会话用内置 web_search 工具即已走 modsearch 后端）
