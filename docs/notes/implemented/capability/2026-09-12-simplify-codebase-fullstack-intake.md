# simplify-codebase 入库 AI 全栈技能：全栈管线落点清单首次成文

> 分类：capability · 生命周期：implemented · 关联决策：[ADR-0052](../../../adr/ADR-0052.md)（B 策略与「挂岗或通用型」规则；本次是其全栈路径的首次执行）
> 落地位置：`dsh-overseas-skills/docs/maintenance-sop.md` §12.9（全栈入库变体）、`~/.dsh/skills/simplify-codebase/README.usage.md`（技能接口文档）

## Problem

用户要求把 `tt-a1i/simplify-codebase`（MIT，466★，证据驱动的代码库简化 skill）安装为 DSH 技能并归入 **AI 全栈技能**。ADR-0052 定下的入库 SOP §12 只覆盖**出海技能**路径（`overseasNames` + `manifest/skills.json` + metadata 溯源块）；AI 全栈技能走的是另一条管线（`fullstackNames` + 全栈双映射 + `verify-fullstack` 闸门），落点清单此前从未成文，且两条路径在 frontmatter 形态上有硬冲突。

## Decision

一、归入 AI 全栈技能入口（`/fullstack-list`），分组 **fs-architecture 架构设计**（与 `improve-codebase-architecture` 互为镜像：一个找深化、一个找简化）；taxonomy 映射 `h2-agent-skill`（全栈技能共享 8/28 体系的既有约定）；归位判 **`GENERIC_METHOD`**（跨仓库通用的工程方法论，不承载任一岗位三条责任，对照锚 = codebase-design / tdd）。

二、落地动作（全部已执行）：

1. **frontmatter 用全栈标准形态**（name/title/description/enabled/disable-model-invocation/user-invocable）——`verify-fullstack.mjs` 的逐行正则只允许纯标量行，**出海路径的 metadata 溯源块会被判「非法fm行」**；溯源改写入技能目录 `README.usage.md`。
2. **汉译注入**：`staging/translations/simplify-codebase.body.md`（正文汉译；references 6 篇保真英文原文，渐进披露资源）。
3. **`import-fullstack.mjs` 增加源根多路回退**：`staging/third-party/<name>/`（仓库内锚定 tarball 缓存）优先，`/tmp/mattpocock-skills/skills` 兜底——上游 tarball 按 SOP §12.2 锚定 SHA `5da55efc`（= main HEAD 2026-09-04）缓存进仓库，安装可重放、不依赖 /tmp 存续。
4. **四张表 + 计数**：`scripts/fullstack-mapping.json`（安装/图标管线事实源）、`manifest/fullstack-skills.json`（catalog 构建读）、`taxonomy-v3.json`（mapping + `fullstackNames`）、`role-assignments.json`（`catalog: fs` + `scenario: fs-architecture` + GENERIC_METHOD + coverage 252→253）；`verify-fullstack.mjs` 的「29/29」硬编码计数同步 +1。
5. **专属头像**：lute-brand-icons `catalog.js` 加 `sk-fs-simplify-codebase`（scissors emblem，匹配「修剪」语义）→ `node scripts/build.js` 重建 247 条 → `assign_lute_icons.py` 写入 `skill-icons-fs.json`。

## Alternatives considered

- **出海路径硬套（overseasNames + skills.json + metadata 块）**：与全栈技能页（`fullstack-list`）的消费管线脱节，且 metadata 块会被 verify-fullstack 正则拒绝——不成立。
- **只改 `manifest/fullstack-skills.json` 不进 `scripts/fullstack-mapping.json`**：`assign_lute_icons.py` 从后者读技能重建 `skill-icons-fs.json`，不入前者就没有专属头像，且下次 pipeline 会把手工图标条目抹掉——不成立。
- **汉译省略（英文正文直接装）**：可过闸门（汉译只统计不强制），但与全栈技能 30/30 已汉译的既有形态不一致，中文环境路由体验差——否决。
- **修复 `verify-fullstack.mjs` 的「预设副本丢失」既有债**（`ai-product-developer` 预设已被 `agt-*` 体系取代，检查指向废弃路径）：判定为与本次无关的既有环境漂移（上一轮 pipeline 同样吞掉），不混入本次提交，留待单独处置。

## Consequences

**正面**

- 全栈技能入库路径首次成文（SOP §12.9 对照表），下一次第三方全栈技能入库可机械执行。
- `import-fullstack.mjs` 多根回退是通用扩展：后续第三方技能缓存进 `staging/third-party/` 即可幂等重装，不再依赖 `/tmp`。
- 运行层验收通过：`/fullstack-list` 的 fs-architecture 组 4→5 项，卡片 `title=代码库简化`、`installed=true`、`modelEnabled=true`、专属头像；`verify_static` 通过（8 大场景/28 细分 + FS 8 组 / 223+30 行 / 382 条路由引用无悬空）；契约测试 32/32（含 coverage 一致性与 role-map 精确投影）。
- **如实记录**：`staging/` 整目录按仓库既有约定不入 git（`.gitignore:44`，历史 29 个汉译文件同样如此），tarball 缓存与汉译文件只存在于本机；缓存丢失时按接口文档 §2.3 重新拉取上游即可重放。

**代价与约束**

- `verify-fullstack.mjs` 的计数与 `fullstack-mapping.json` 的技能数耦合，新增/删除技能必须同步改（已在 SOP §12.9 标注「易漏」）。
- 上游 `$simplify-codebase` 调用语法是 Codex 习惯，DSH 按目录标题/描述路由——已在技能接口文档说明。
- 遗留既有债：`verify-fullstack.mjs` 的预设副本检查指向已废弃的 `ai-product-developer`，需单独决策修复（本 Note 不留悬念，但不动手）。
