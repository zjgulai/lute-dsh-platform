---
title: LUTE 二开平台架构重构（三期骨架化）
status: ready-for-agent
test_seam: scripts/gate.mjs（根级单命令聚合门禁，退出码即契约）
---

# LUTE 二开平台架构重构 产品规格

> 本规格来自 2026-09-11 与用户的 grill-me 决策树（三轮，共 10 项决策全部确认）。
> 决策记录：ADR-0007 ~ ADR-0015（docs/adr/）。本规格不重新访谈，只综合已确认事实。

## Problem Statement

当前二开仓库（`/Users/lute/project/Magpie-Horch`，20 个插件 / 2,755 文件 / 125,580 行）缺的不是某个插件的代码质量，而是三根工程骨架，导致「改坏了」这件事只能在客户现场或人工 smoke 时被发现：

1. **无验证平面**：仓库无根 `package.json`、无 CI（`.github/` 仅 PR 模板）、20 个插件中 11 个无 `test` 脚本、12 个无 `typecheck`；基座升级的正确性由 35 个补丁的锚点文字与人工 `smoke-test.sh` 共同担保。
2. **无包平面**：20 个插件平铺在仓库根，目录名与包名分叉（6 种命名空间），版本分散在 15 个不同值，无能力分组、无组地图。
3. **无文档脊柱**：`docs/` 平铺 + 手写索引 + 各插件各自 `docs/` + `_doc-notes/` 草稿四套体系并存；同一事实有重复副本（`docs/` 与 `_doc-notes/` 的白屏手册同名同 SHA `dddfb43fd62c`），且有与真相不符的表述（README 称插件版本与平台版本同步对齐，实测 15 个不同值）。
4. **基座不可检索**：`vendor/dsh-desktop/.gitmodules` 声明了 `deepseek-harness` 子模块，但目录为空、pin 文件记为 `NOT-INITIALIZED`，运行时改走预打包 tgz；补丁重锚只能靠人工反查产物，每次上游窗口成本 3-5 人日。
5. **仓库自相矛盾**：42 个已跟踪文件命中 `.gitignore`（tracked+ignored 漂移，含 `*.orig` 备份）；`.gitignore` 白名单指向 5 个不存在的路径。

## Solution

按上游 DeepSeek Harness 的八层范式（组合层 / Slot 平面 / 能力缝 / 包平面 / 文档脊柱 / 知识工程 / 验证平面 / 工程规范）分三期建立骨架，**不改基座、不重写业务功能、不改已跑通的交付链**：

- **一期（骨架）**：harness submodule 只读参照系 + 三层文档脊柱 + 事实源去重 + 包身份元数据 + 聚合门禁骨架（含只减不增的豁免文件）。
- **二期（结构收敛）**：20 个插件按 5 个能力组归位 + 生成式目录墙替代人工索引 + 门禁接 git 钩子 + 引入 lint 规范。
- **三期（契约与清账）**：typecheck 与 test 逐包补齐至全量硬门槛（豁免文件清空并被门禁拒绝非空）+ 历史 6 篇 ADR 归档 + 资产分级处置。

终态：一条命令给出机器证据，替换今天的人工判断。

## User Stories

1. 作为维护者，我想在提交前运行一条根级命令就得到「这次改动是否破坏契约」的确定答案（真实退出码），这样我不必再靠人工 smoke 判断。
2. 作为维护者，我想让门禁对**本次改动的包**立即生效（typecheck + test），这样新增退化当场被拦。
3. 作为维护者，我想让存量未补齐的包以**带期限、带 owner、只减不增**的豁免条目登记，这样不会出现「全红导致无法提交」的死锁，也不会出现无限期豁免。
4. 作为维护者，我想在门禁文件里看到豁免条目的字面量可被校验（禁止新增条目、禁止延长已登记期限），这样「债」是可审计的而不是隐性的。
5. 作为维护者，我想让 `vendor/dsh-desktop/deepseek-harness` 子模块初始化并 pin 到 `a66e470`，但**不参与构建**，这样补丁重锚与架构文档有源码参照系，交付链行为不变。
6. 作为维护者，我想在 pin 文件与子模块实际 sha 不一致时被构建流程拒绝，这样「跟着上游走错版本」不可能静默发生。
7. 作为维护者，我想让架构文档引用**真实可打开的源码路径**（而不是 tgz 产物或文字描述），这样升级评估可以基于源码完成。
8. 作为维护者，我想让每个受管的 `package.json` 声明来源（self / internalized / npm-pinned）、owner、是否发布三字段，这样命名空间分叉从「混乱」变成「有记录的显式事实」。
9. 作为维护者，我想让新增包在缺少身份三元组时被门禁拒绝，这样分叉不会继续增长。
10. 作为维护者，我想让能力清单、工具清单、slot 占用、skill 计数由生成器产出，这样文档不会与代码漂移，手改生成物会被拒绝。
11. 作为维护者，我想让同一事实只存在于一个文档家，其余位置只留链接，这样更新一处就足够。
12. 作为维护者，我想让文档内的相对链接与锚点被校验，这样重命名文档不会留下死链。
13. 作为维护者，我想让非机械改动都附带一篇决策记录（ADR 编号 + 本地 Note），并在门禁层被强制，这样「为什么改、放弃了什么」不会随会话丢失。
14. 作为维护者，我想让 ADR 与 Note 双向互链并有索引校验，这样两个体系不会各自长草。
15. 作为维护者，我想让 20 个插件按能力归入 5 个组并各有组 README，这样我能在 3 分钟内找到「某个能力归谁拥有」。
16. 作为维护者，我想让 `_attic/` 与根级游离资产按分级规则处置（删除 / 归档出工作树 / 纳入版本管理），这样真实资产不被噪音淹没。
17. 作为客户，我在升级安装后不应感受到重建带来的行为变化——pkg/dmg 交付链与运行时行为与重构前一致。
18. 作为审查者，我想让每期结束时看到真实 Red/Green 命令输出与构建验收证据，而不是文字总结。

## Implementation Decisions

### 决策边界（grill-me 已确认，每项对应一篇 ADR）

| # | 决策 | ADR |
| --- | --- | --- |
| 1 | 三期推进：骨架 → 结构收敛 → 契约与清账 | ADR-0007 |
| 2 | harness submodule 初始化但仅作只读参照系，不参与构建 | ADR-0008 |
| 3 | 文档主脊柱中文单语，仅客户安装使用一条链出独立用户向文档 | ADR-0009 |
| 4 | 包平面三分治理：自研 / npm 外部 / 处置候选 | ADR-0010 |
| 5 | 能力按 5 个组归位，不引入 pnpm workspace 与子包 typecheck 分裂 | ADR-0011 |
| 6 | 目录名归一、包名不改、新增身份三元组门禁 | ADR-0012 |
| 7 | 资产分级：删除 / 归档出工作树 / 纳入版本管理 | ADR-0013 |
| 8 | 门禁全量硬门槛 + 只减不增的临时豁免（N5=A2） | ADR-0014 |
| 9 | ADR 与本地 Notes 双轨分职（N6=C） | ADR-0015 |

### 一期交付物（本次开发范围）

1. `vendor/dsh-desktop/deepseek-harness/` 初始化为 pin 到 `a66e4702047846cdaa10c66c9d3df3951f5ea70d` 的只读参照系；pin 文件 `harness-submodule` 字段由 `NOT-INITIALIZED` 更新为已初始化并可校验。
2. 三层文档脊柱：
   - 根 `AGENTS.md`：常驻规则（每会话必读），每条 1-3 行并链接其归属文档。
   - `docs/architecture.md`：有序地图（组合、能力组、seam、扩展点），改造现有文档使其符合「有序地图」定位。
   - `docs/notes/`：本地决策记录目录，`{lifecycle}/{class}/yyyy-mm-dd-topic.md` 形态，含 `## Problem / ## Decision / ## Alternatives considered / ## Consequences`。
3. 事实源去重：
   - `_doc-notes/dsh-desktop-white-screen-playbook.md` 与 `docs/` 副本合一，保留单一 home，另一处留链接。
   - `.gitignore` 白名单中 5 个幽灵路径（`dsh-noema-local`、`dsh-bridge-protocol-local`、`dsh-browser-extension-local`、`archify-local`、`deepseek-harness-studio-presets`）清除。
   - 42 个 tracked+ignored 漂移文件归位（`*.orig` 备份移入受管目录，不再处于漂移态）。
   - README 中「插件版本与平台版本同步对齐」的失实表述改为事实描述。
4. 包身份元数据：全部受管 `package.json` 增加 `luteOrigin`（self / internalized / npm-pinned）、`luteOwner`、`lutePublish`（true / false）。
5. 根 `package.json` + `scripts/gate.mjs`：单命令聚合门禁，只依赖 Node 内置模块（一期不引入 lint 依赖）。
6. `scripts/gates/exemptions.json`：豁免登记（每条含 `package` / `reason` / `owner` / `deadline`），门禁校验其「只减不增」。
7. `docs/adr/ADR-0007.md` ~ `ADR-0015.md`：9 篇决策记录 + `docs/adr/README.md` 索引更新。

### 门禁分层（一期实现的校验项）

| 级别 | 校验 | 阻塞 |
| --- | --- | --- |
| 契约级 | 包身份三元组完整且取值合法 | 是 |
| 契约级 | `files` 清单与实际产物一致（海外技能 PR #1 同型问题） | 是 |
| 契约级 | pin 文件 sha 与子模块实际 sha 一致 | 是 |
| 契约级 | 生成式目录墙与再生成结果一致（手改即拒绝） | 是 |
| 契约级 | 文档相对链接与锚点可达 | 是 |
| 契约级 | 事实源去重清单（禁止重复副本回流） | 是 |
| 契约级 | 豁免文件只减不增、期限未过期 | 是 |
| 契约级 | ADR 编号连续、索引与文件一致、ADR↔Note 双向互链 | 是 |
| 变更包级 | 本次改动包的 typecheck | 是 |
| 变更包级 | 本次改动包的 test | 是 |
| 存量 | 未达标的包按豁免条目登记并输出清单 | 否（报告） |

### 运行时行为

- 门禁默认 `quick` 模式（提交前，秒级），`full` 模式用于推送前（含全部校验）。
- 门禁必须在使用者传入非法用例时返回非零（负向用例验证，防止门禁空转）。
- 重构不得改变 pkg/dmg 交付链、不得改变任何插件的运行时行为。

## Testing Decisions

- **唯一公开 seam**：`scripts/gate.mjs` 的命令行契约——`node scripts/gate.mjs --mode quick` 的退出码与 stdout 摘要。所有一期测试通过这个 seam 观察，不测内部函数。
- **期望值来源**：规格字面量（如 pin sha `a66e4702047846cdaa10c66c9d3df3951f5ea70d`、豁免文件字段名、能力组名），不复制实现算法。
- **先例沿用**：仓库既有测试风格有二——`dsh-browser-local` / `dsh-deepresearch-local` / `dsh-skill-center-local` 用 vitest，`dsh-team-hub` 用 `node --test`。一期门禁是 Node 脚本，采用 `node --test`（零新依赖）。
- **每个纵切保留同一测试的真实 Red 与 Green**，Red 必须因能力缺失而非选择器/依赖问题。
- **负向用例必须存在**：至少一个测试证明门禁会拒绝无效输入（如写入非法 `luteOrigin` 后门禁返回非零）。
- **三期终点验证**：豁免文件清空后，门禁对非空豁免文件返回非零。
- **最终验收**：Shell 执行真实构建 + 浏览器验收（DSH Web GUI 与受影响插件页面），不以外观描述代替。

## Out of Scope

- 不升级或改动基座（deepseek-harness、dsh-desktop 的 pin 与补丁集保持不变）。
- 不引入 pnpm workspace、不引入子包 typecheck 分裂（上游为 140 包规模设计的机制，本仓库不适用）。
- 不做双语文档（除客户可见的安装/使用一条链）。
- 不重写任何业务功能、不改插件对外行为、不改 pkg/dmg 交付链。
- 不追上游 master（按 ADR-0006 月度观察窗 + 红线触发制）。
- 不在本次补齐 12 个缺失 typecheck 的包（属三期，且以豁免文件登记为债）。
- 不删除 `_attic/` 与历史资产（属三期，本次仅登记处置规则）。

## Further Notes

- 本规格与决策记录的关系：ADR 记「决定是什么」，`docs/notes/` 记「为什么与放弃了什么」，两者以编号与路径双向互链。
- 未决外部依赖：无。一期全部工作可在本机离线完成。
- 上游参照：`/tmp/harness`（浅克隆 master，含 215 个 `scripts/verify-*` 门禁与 2,920 篇 Agent Notes），仅作范式参照，不复制其治理体量。
- 风险：门禁首次落地可能暴露既有漂移（预期内），处理方式为登记豁免条目而非关规则。
