# DSH skill `title`（中文显示名）补丁

给 skill 增加可选 `title` 字段（可为中文），让「/」选择器主行显示中文标题、模型目录也带上标题；
标识符 `name` 保持 kebab-case 不变（机器用，稳定）。

## 一句话原理

- `name` = 机器标识符（kebab-case，硬约束 `/^[a-z0-9]+(-[a-z0-9]+)*$/`，多处校验，不可中文）。
- `title` = 给人看的显示名（可选，任意字符串，中文 OK；缺省回退 `name`）。
- 「/」选择器：主行显示 `title ?? name`，副行 description；选中仍插入 `/name`（稳定标识）。
- 过滤：title + name + description 三者 `includes` 匹配（中文/英文片段都能命中）。

## 改动清单（9 文件 / 20 处，全部向后兼容）

| 包 | 文件 | 改动 |
|---|---|---|
| dsh-skill | lib/index.js | 模型加 `title`；`toSummary`/`runtimeCandidate` 透传；3 处校验（candidate/runtime/definition） |
| dsh-skill-filesystem | lib/index.js | `parseSkillFile` 解析 `title`；`discoverRoot`/`get` 透传 |
| dsh-tool-skill | lib/index.js | 模型目录：`catalogSourceEntries`/`renderCatalogEntries`/`digestCatalogEntries`/`readCatalogEntries` 带 title |
| dsh-api-session-controller | lib/index.js | `SessionSkillCatalog.list()` 返回 `title` |
| dsh-api-session-controller | lib/types/skill-catalog.js | 同上（source 副本，保持一致） |
| dsh-api-session-controller | lib/typert.host.js | zod schema + `SkillEntry` 声明加 `title` |
| dsh-api-session-controller | lib/typert.remote-client.js | zod schema 加 `title` |
| dsh-api-remotes | lib/client.js | 客户端 zod schema 加 `title` |
| dsh-client-ui-skill | lib/client.js | 选择器显示/过滤/onPick 改 title+name |

## 使用方式（业务侧）

在 SKILL.md frontmatter 加一行：

```yaml
---
name: src-hunter
title: SRC 漏洞挖掘
description: 当用户提到 src 挖洞 / bug bounty ...
---
```

不带 `title` 的 skill 行为与之前完全一致（回退显示英文 name）。

## 生效方式

- **宿主平面改动**（dsh-skill / dsh-skill-filesystem / dsh-tool-skill / dsh-api-session-controller 的 lib/index.js + typert）：需重启桌面 app。
- **客户端 bundle 改动**（dsh-api-remotes / dsh-client-ui-skill 的 lib/client.js）：Cmd+R 重载 renderer 即可；最稳妥是一次重启全部生效。
- 不要依赖 HMR 热替换。

## 回滚

```bash
ROOT="/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai"
# 单文件还原（原位 .orig 备份）
cp "$ROOT/dsh-skill/lib/index.js.orig" "$ROOT/dsh-skill/lib/index.js"
# ...（其余文件同理）
# 或从项目持久备份还原：
# backups/ 目录下按 <包>__<相对路径> 扁平化存放原始文件
```

补丁脚本：`python3 apply.py [<文件名片段过滤>]`，幂等（每处 old 精确匹配 1 次才落笔，count!=1 报错并跳过该文件写入）。

## 验证要点

1. 重启后 `rendererStatus: healthy`。
2. 给某个 SKILL.md 加 `title` → 输入「/」看主行是否显示中文标题；输入中文片段能否过滤命中。
3. 选中后输入框插入的仍是 `/name`（标识符），斜杠手势与 skill 工具照常工作。
4. 模型目录（`<available_skills>`）行变为 `` - `name`（标题）: description ``。
