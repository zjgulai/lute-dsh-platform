# Agent Note: LUTE 二开平台重构三期推进

Status: implemented

## Problem

当前二开仓库有 20 个插件、2,755 个文件、125,580 行代码，但缺少三根工程骨架，导致「改坏了」只能在客户现场或人工冒烟测试时被发现。

- **无验证平面**：仓库根目录没有 `package.json`，因此没有 `pnpm test` / `lint` / `typecheck` / `check` 之类的聚合门禁；`.github/` 下只有 PR 模板，没有任何工作流文件；20 个插件中 11 个没有 `test` 脚本、12 个没有 `typecheck`。基座升级的正确性完全依赖 35 个补丁的锚点文字加上人工运行 `smoke-test.sh`。
- **无包平面**：20 个插件平铺在仓库根目录。目录名与包名使用了 6 种不同的命名空间（`dsh-*`、`@deepseek-ai/dsh-*`、`@yuxianglin/*`、`@furongjun1999/*`、`@etony668/*`，以及一个没有包名的 `dsh-skill-title-fix`），版本号散布在 15 个不同的值上。仓库里「自研的代码」和「从 npm 装进来的依赖」混在一起，没有清晰的边界。
- **无文档脊柱**：`docs/`、各插件自己的 `docs/`、`_doc-notes/`、`doc/` 四套体系并存。同一个事实有多份副本（`docs/dsh-desktop-white-screen-playbook.md` 和 `_doc-notes/` 下的同名文件内容完全相同，SHA 都是 `dddfb43fd62c`）；README 里有一句话与事实不符——它声称「各插件 package.json 同步对齐」，但实测版本号有 15 个不同的值。
- **基座不可检索**：`vendor/dsh-desktop/.gitmodules` 声明了 `deepseek-harness` 子模块，但该目录是空的，pin 文件记录为 `NOT-INITIALIZED`，运行时改用预打包的 tgz 产物。补丁重锚时只能人工反查产物，每个上游窗口花 3 到 5 人日。
- **仓库自相矛盾**：42 个已经被 git 跟踪的文件同时命中了 `.gitignore` 规则，其中包含 `*.orig` 备份文件。`.gitignore` 的白名单里还列着 5 个磁盘上根本不存在的路径。

## Decision

按上游 DeepSeek Harness 的八层范式（组合层 / Slot 平面 / 能力缝 / 包平面 / 文档脊柱 / 知识工程 / 验证平面 / 工程规范）分三期建立骨架。不改基座，不重写业务功能，不改动已经跑通的 pkg/dmg 交付链。

| 期 | 范围 | 交付物 |
| --- | --- | --- |
| 一期（骨架） | 只读参照系、文档脊柱、事实源去重、包身份元数据、门禁骨架 | harness 子模块 pin 到 `a66e470`、根 `AGENTS.md`、`docs/architecture.md`、`docs/notes/`、根 `package.json` + `scripts/gate.mjs`、`scripts/gates/exemptions.json`、ADR-0007 ~ ADR-0015 |
| 二期（结构收敛） | 能力组归位、生成式目录墙、门禁接 git 钩子、引入 lint | 5 个能力组与组 README、`scripts/gen-catalog.mjs` 与生成物、`profile-manifest` |
| 三期（契约与清账） | typecheck/test 逐包补齐、豁免清空、历史 ADR 归档、资产分级处置 | 豁免文件为空且门禁拒绝非空、历史 6 篇 ADR 归档、`_attic/` 与大文件移出工作树 |

十一项决策各自记录在 ADR-0007 ~ ADR-0017 中：
1. 三期推进（ADR-0007）
2. harness 子模块初始化但仅作只读参照系（ADR-0008）
3. 主脊柱中文单语，仅客户安装使用一条链出独立用户向文档（ADR-0009）
4. 包平面三分治理：自研 / npm 外部 / 处置候选（ADR-0010）
5. 能力五组归位，不引入 pnpm workspace 与子包 typecheck 分裂（ADR-0011）
6. 包名不改、目录名归一、新增身份三元组门禁（ADR-0012）
7. 资产分级处置：删除 / 归档出工作树 / 纳入版本管理（ADR-0013）
8. 门禁全量硬门槛 + 只减不增的临时豁免（ADR-0014）
9. ADR 与本地 Notes 双轨分职并强制留痕（ADR-0015）
10. 嵌套仓库治理：受管目录不得含未声明的独立仓库（ADR-0016）
11. 类型检查指向内建运行时的类型而非应用内打包产物（ADR-0017）

门禁的公开契约是 `scripts/gate.mjs` 的退出码：`--mode quick` 用于提交前，`--mode full` 用于推送前。门禁的校验项与阻塞级别见 [docs/architecture.md](../../../architecture.md) 第 0 节。

一期的门禁落地同时暴露并修复了一处既有事实错误：`docs/adr/README.md` 索引登记了 ADR-0001 ~ ADR-0004，但这四篇文件从未提交到仓库（`git log -- docs/adr/ADR-0001.md` 为空）。这四篇已按仓库事实重建，状态标注为「原文未入库，本篇为证据重建」，其中 ADR-0003 重建时记录的「插件版本与平台版本对齐」承诺，经实测已漂移到 15 个不同版本值——该缺口由 ADR-0012 的身份元数据与 ADR-0014 的门禁接管。

平台侧的既有四项决策见 ADR-0001（monorepo 与发布载体）、ADR-0002（DMG 发布与哈希清单）、ADR-0003（版本策略）、ADR-0004（收录范围）。

## Alternatives considered

**全量同构重构。** 一次性把目录、命名、测试与文档全部对齐上游形态。估算 6 到 10 人日以上，且与当前的 DSH 2.0.5 灰度窗口叠加；中途没有任何机器兜底，一旦出错难以判断是哪一层出的问题。

**最小治理。** 只补根 `AGENTS.md` 与一条聚合门禁，目录与代码形态一律不动。成本最低，但命名与结构漂移会继续增长，而且门禁缺少可以依附的包平面——校验项没有稳定的对象。

**先重构代码、后补门禁。** 这正是当前债务的成因路径：先有实现，没有验证。审计已证明其代价——12 个包无法证明自己没坏。

**门禁先补齐、后开门（N5 的 A1 方案）。** 门禁文件先提交但默认不阻塞，等 12 个包全部补齐后统一切换为硬阻塞。补齐期可能长达 3 周，期间防线是空的；而且「哪天算补齐完成」缺少客观判定点。最终采用硬门槛加只减不增的豁免文件，终态与 A1 相同，但防线从第一天就生效。

**拆包分级（A3）。** 契约级包先行硬门槛，重型包三期收口。分级本身会长期充当新的豁免理由——「为什么这个包可以例外」无法收敛，于是采用带期限、带 owner、禁止新增条目的豁免文件。

**ADR 全量迁移为 Agent Notes 格式。** 需要重写 6 篇 ADR 并修复全部入站链接，约 1 人日，还会丢掉 ADR 编号这一稳定引用锚。改为双轨分职：ADR 管编号时间线，Note 管「为什么与放弃了什么」。

**只用 ADR，不引入 Notes。** ADR 缺少决策被推翻或归档的生命周期，也没有「备选方案必须存在」的机器校验——而这两点正是今天反复返工的成因。

## Consequences

**收益。** 每期结束时仓库的可验证性单调上升，一期就能把基座升级与补丁重锚从人工核对变成机器校验。包平面归位后「某个能力归谁拥有」有 3 分钟内的答案。事实源去重后更新一处就足够。债务以可机器审计的形式存在——带期限、带 owner、只减不增。

**代价。** 三期总周期拉长到 3 周量级，期间存在「骨架已建、存量未补齐」的过渡态。豁免条目到期未补齐会阻塞整个仓库，这是刻意设计——但也会在补齐期造成摩擦。ADR 与 Note 需要维护互链一致性。二期归组会改变 `file:` 依赖路径与硬链接 inode，迁移脚本必须走 tmp+mv 原子替换，不能用 `cat >` 直接覆盖。

**验证。** 一期验收以真实命令输出为准：门禁对每个契约级校验项都能在无效输入下返回非零（负向用例），而不仅仅是在正常情况下返回零。三期终点验证豁免文件清空后门禁对非空文件返回非零。规格见 `.scratch/lute-refactor/spec.md`。

## Verification

三期的门禁 `scripts-runnable` 在 `full` 模式真实运行每个包的 `typecheck` 与 `test`，首次运行即暴露 7 处此前不可见的问题：2 个空转脚本（退出码 127）、1 个带真实类型错误的 typecheck（退出码 2）、4 个 test 失败。其中 `dsh-browser-local` 的 11 个套件全部收集失败被定位为相对符号链接因目录层级变化失效，修复后 9 个套件 111 项测试恢复通过。

`dsh-skill-subset` 是首个完成闭环的包：新增 7 项契约测试与 JSDoc 类型契约，`tsc --noEmit` 退出码 0、`node --test` 7/7 通过，豁免条目已删除。

## Loop 1.3 收官：dsh-wanzh-hulian 的契约清账（2026-09-11）

### Problem

`dsh-wanzh-hulian` 是 20 个受管包里的最大包（host 1,916 行 + client 822 行），在豁免清单上挂了整整一轮，理由是「缺少 typecheck 与 test 脚本」。真实状况比这句话复杂三层：

- **类型检查此前无从运行**：包内没有 `tsconfig.json`、没有 `node_modules`。首次接入（copy 同侪包的可复现依赖 + 从内建运行时取类型）后 `checkJs` 实测 **117 错**：client 73 错来自「bundle 入口契约未声明」——bundle 不使用 ES import，靠宿主 ModuleLoader 注入 `require`，因此 `window`/`require('react')` 全无类型；host 44 错来自外部响应边界未声明形状（`await res.json()` 落在 `{}`）与 `catch (e)` 的未知类型。
- **同一事实有两个家**：`lib/catalog.js` 保存了「连接」与「工具清单」两份手工快照，而运行时真源是 `lib/index.js` 的 `DEFAULT_CONNECTIONS` 加用户落盘的 `~/.dsh/integrations/wanzh-hulian/connections.json`。两份副本**已经实际漂移**：仓库版 4,133 字节、已部署版 5,077 字节，两者对 `board.connections` 的取值不同。
- **部署副本与仓库副本是两份实体**：profile 以 `file:` 依赖安装本包，解出的 `node_modules` 副本是独立实体（inode 不同）。因此「仓库改了、GUI 就在跑新代码」这一直觉不成立——实测运行中的 `/api/dsh-wanzh-hulian/list` 跑的是 9 月 10 日的旧副本，且新增的模块文件不会随 `sync-profile.mjs` 进入副本（该脚本按设计不追加副本缺失的文件）。

### Decision

把「可被机器证明」当成设计约束倒推实现形态，而不是事后补测试：

1. **边界抽成无 I/O 的纯函数**（新 `lib/host-util.js`）：`errorMessage` / `resolveShopifyToken` / `pickBoardConnections` / `buildBoards` / `mergeRegisteredTools`。它们不依赖 cordis 运行时与凭证服务，因此 `node --test` 可直接验证行为契约；宿主 `lib/index.js` 改为调用它们，而不是各留一份内联实现。
2. **工具清单与板块清单只从运行时注册表派生**：工具名取自 `Object.keys(toolDefs)`，板块连接取自 `loadConnections()`；`lib/catalog.js` 整个删除（仅保留板块定义与 logo 到新 `lib/boards.js`）。同一事实收敛到一个家（ADR-0009），漂移在结构上不再可能。
3. **客户端 bundle 的宿主契约显式声明**（新 `lib/globals.d.ts` + `lib/**` 纳入 tsconfig，与 `dsh-ui-polish-local` 同型）：声明 `window.__ModuleLoader__.load` 与 `require`，React 类型显式取自 `@types/react`，负载形状用 `@typedef` 集中声明——`useState(null)` 曾把状态类型锁成 `null`，使整条渲染链退化为 `never`。
4. **顺手修掉两处真实缺陷**：`loadedRef[1] = true` 直接给 setter 赋值，覆盖掉 setter 本身，「已加载」闩锁永不生效（面板每次重开都重新拉取）；`handleOpenUrl` 用 `spawn` 启动浏览器，而 `spawn` 的启动失败以 `error` 事件上报、同步 `try` 捕不到——接口会返回「已打开」而实际什么都没发生。改用 `execFile`→`spawn`+`error`/`spawn` 事件两分支。
5. **不新建 ADR 编号、不新建独立 Note**：本次没有引入新的决策类别。ADR-0017 已确立「类型来源单一化」，本条是其必然应用；Note 按 ADR-0015「一次决策一篇」落在本篇内。按 ADR-0009，进度事实只写在 `docs/REFACTOR-MAINLINE.md`，本 Note 不复制。

**一次需要自我更正的中间结论。** 我在过程中一度断言「`GETNOTE.tools` 把两个凭证 ref 当成工具播报」，并据此写了回归测试。逐项核对后该断言**不成立**：`getnote_api_key` / `getnote_client_id` 从不在 `tools` 数组内（它们只出现在 `authFields[].ref`），我看到的「21 项」是把 `authFields` 的 ref 一起 grep 进来的产物。测试与注释已按事实改写为「工具清单只来自注册表，快照残留不影响播报」——该断言可证伪、且对本次删除快照的动作有真实守卫价值，而原断言是空转的。

### Alternatives considered

**为两个 plane 各建一套测试桩，如实测运行时的 cordis 组合。** `lib/index.js` 的 `apply(ctx)` 依赖 `@deepseek-ai/dsh-mcp-client` 等运行时模块，如实装载需要完整的 cordis 依赖闭包——这正是 `dsh-browser-local` 剩 2 个套件被卡住的同一堵墙。改为把边界抽成纯函数：覆盖面从「端到端」缩到「边界判定」，但**可测且可长期维持**，且抽出的函数同时消除了内联重复实现。

**保留 `lib/catalog.js`，只补一份测试来防漂移。** 测试能发现漂移，但不能消除漂移；每加一个连接就要同步三处。删除第二份快照把「同步」这件事本身删掉了。

**让 `sync-profile.mjs` 追加副本缺失的文件。** 该脚本是「只替换副本中已存在的文件」，为的是不把构建产物与副本独有文件搅乱。为一个包改变这条语义会波及全部 20 个包，风险与收益不成比例——正确做法是让包本身的 `files` 清单与入口自洽，部署通过 `pnpm install` 重解 `file:` 依赖完成。

**加深 capture 的收尾逻辑来治冒烟测试的偶发空串。** 我把 `close` 改造为「额外等 stdout/stderr 的 `end`」，结果失败率从偶发升到 12/12。根因根本不在收尾时序：在 pnpm 生命周期脚本下 `process.execPath` 是宿主 Electron 可执行文件而非 node，用它 spawn 出来的是 Electron，子进程没有 stdout。改造已完整回滚，改为在测试中从 PATH 解析 node 并校验 `node --version` 应答。

### Consequences

**收益。** 受管包达标从 16/20 升到 **17/20**；本包 `typecheck` 117 → 0 错（退出码 0），`test` 10/10（退出码 0）；豁免从 4 条降到 3 条。两处真实缺陷有回归测试或结构性守卫。工具清单与板块清单不再有第二份事实源。

**代价与遗留。** 纯函数边界的代价是**端到端路径仍无自动化覆盖**：`/api/dsh-wanzh-hulian/list` 的真实 HTTP 响应只有人工 curl 证据，`apply()` 的装载路径要等 `dsh-browser-local` 那堵依赖闭包的墙被推倒后才能进测试。`lib/boards.js` 里的 logo 是 1.6 KB base64 常量，属于「生成物入库」，未纳入本次范围。

**验证。** Red→Green 用同一测试：新增 9 项失败 → 实现后 10/10 通过（追加的回归项另有其独立 Red）。`tsc -p tsconfig.json` 由 117 错到 0 错。`node scripts/gate.mjs --mode full` 13/13、退出码 0。端到端人工证据：`curl http://127.0.0.1:43120/api/dsh-wanzh-hulian/list` 返回 `ok:true`，板块连接与运行时 `connections.json` 一致，工具清单 19 项。

**过程中暴露并一并修复的既有缺陷**（非本次引入，已用命令确认根因）：`dsh-agent-team-gui-local` 的 `typecheck` 因引用已在运行时 rc.1 移除的包 `@deepseek-ai/dsh-host-apiproxy/api`、以及 `i18n.ts` 的 `NS` 已改名，整条脚本无法运行——修复后 typecheck 退出码 0、host 119/119、client 66/66；其冒烟测试的空串失败率由「偶发」变为可复现后根治（见上）。这两项使 `gate --mode full` 从 12/13 回到 13/13。

## Loop 1.3 续：dsh-overseas-skills 的契约清账（2026-09-11）

### Problem

`dsh-overseas-skills` 是最后一个「未动」的受管包，豁免理由只有一句「缺少 typecheck 与 test 脚本」。它的体积被误读了：目录下 1,653 个文件里，1,483 个在 `staging/`（导入用的技能素材）、42 个在 `docs/`、34 个在 `scripts/`、24 个在 `eval/`——**可类型检查的代码只有 `lib/` 的 1,383 行**（index 319 / client 817 / templates 242 / catalog 5），且没有 `src/`，`lib/` 就是手写源。所以「大包」这个判断来自文件计数，不是代码规模。

接入 tsconfig 后的实测：**31 错**，全部属两族——client 24 错是「bundle 入口契约未声明」（`window.__ModuleLoader__` 无类型、`useState(null)` 把状态锁成 `null` 使渲染链退化为 `never`），host 7 错是 `catch (e)` 的 `e` 在 checkJs 下为未知类型却直接读 `.message`。

### Decision

1. **边界抽成无 I/O 纯函数**（新 `lib/host-util.js`）：`errorMessage` / `isValidSkillName` / `rebuildFrontmatter` / `findCatalogInconsistencies`，宿主改为调用它们。
2. **`rebuildFrontmatter` 的抽取以「零行为变更」为前提**：它重写的是用户 `~/.dsh/skills` 下的**真实 SKILL.md**，写坏了就是用户资产损坏。因此测试里保留原内联实现作为参照，逐字节比对 5 组输入 × 2 种开关状态，抽取等于不可见。同时覆盖此前没有保护的四类边界：重复调用必须幂等（否则每切一次开关就多一行重复键）、无 frontmatter 时必须返回 null 而不是写坏文件、CRLF 输入、正文不得被触碰。
3. **客户端 bundle 宿主契约显式声明**（新 `lib/globals.d.ts`），并把负载形状用 `@typedef` 集中声明，与 `dsh-ui-polish-local` / `dsh-wanzh-hulian` 同型（ADR-0017 的延续）。

**typecheck 当场抓到一处真实缺陷（本次最有价值的产出）。** 搜索分支重建分组对象时漏了 `scenario` 字段，而无查询分支带着它——用户一旦在搜索框输入关键词，分组标题会**静默丢掉场景前缀**，标题在有无查询之间无谓跳变。这不是推断：两个分支的差异就在源码里，且搜索输入确实写入同一个 `q`。修复为让两个分支产出同一形状。

同一处我最初还断言「搜索分支多做了一层未过滤的 items，所以会显示未安装技能」——**该断言错误**：`installed` 在 553 行已按 `it.installed === true` 过滤，`.filter` 保序保真，搜索并不溢出。已更正。

### Alternatives considered

**把 `staging/` 的 1,483 个文件纳入类型检查范围。** 它们是素材（markdown / python / 数据），不是本包的代码；纳入只会制造噪音错误并拖慢每次门禁。`tsconfig` 的 include 明确限定 `lib/**` 与 `test/**`。

**为 `rebuildFrontmatter` 换一套更「正确」的行尾归一化。** 现有实现对 CRLF 输入会产出混合行尾。实测该混合行尾**不影响任何下游读取**：`frontmatterBlock` 解析出的块内不含 `\r`，`readSkillMeta` 的开关正则仍匹配，round-trip 正确。顺带「修好」它等于在用户资产写入路径上引入未经验证的行为变更——抽取阶段只做等价搬运，外观问题留给需要时的独立改动。

**为客户端 bundle 建 node --test 测具（伪造 `window.__ModuleLoader__` + React 桩）。** 能覆盖搜索交互，但要复刻宿主加载契约与 React 渲染语义；在本次预算内，`scenario` 缺陷已由 typecheck 直接抓到并修复，测试测具的边际价值不足以挤占本轮。记为后续项。

### Consequences

**收益。** 受管包达标 17/20 → **18/20**；本包 `typecheck` 31 → 0 错（退出码 0）、`test` 11/11（退出码 0）；豁免 3 条 → **2 条**。搜索丢场景前缀的真实缺陷被修复，开关重写首次有了契约保护（幂等 / 不写坏文件 / 行为等价）。Loop 1 只剩 deepresearch 与 browser 两条「测试环境」类豁免。

**代价与遗留。** 客户端的搜索交互仍无自动化覆盖（见上）。`lib/catalog.js` 是 222 + 29 项的快照数据，`findCatalogInconsistencies` 已能机器发现「引用了不存在的分类/子场景/重复登记」，但尚未接入门禁——它现在只是可用的工具，不是被强制的校验项。

**验证。** Red→Green 同一测试：新增 10 项全部失败 → 实现后 11/11通过（含行为等价项）。`tsc -p tsconfig.json` 31 → 0 错。`node scripts/gate.mjs --mode full` 13/13、退出码 0（其中 `profile-metadata-sync` 先按门禁自己的 remediation 跑了 `node scripts/sync-profile.mjs --apply --only-metadata`）。

## 构建产物 lib/types 的入库边界（ADR-0018，2026-09-11）

### Problem

`lib/types/` 同时是「包对外声明的类型接口」（`exports` 与 `files` 都指向它）和「构建产物」，这条边界仓库里从未定过，于是同一件事出现了三种做法：`dsh-browser-local`（48 文件）、`dsh-deepresearch-local`（80 文件）、`dsh-loopx-plugin`（15 文件）入库；`dsh-agent-team-gui-local`、`dsh-skill-center-local` 不入库（由打包流水线产出）。

三种做法各自都成立，所以问题不是谁做错了，而是没有规则——而且入库的那两个包已经在漂移。实测（`tsc -b --force` 后看 `git status`，三次复现一致）：`dsh-deepresearch-local/lib/types/index.d.ts` 的入库版本缺 `Service` 导入、多一个 `[x: number]: () => Promise<void>` 索引签名；`lib/types/client/index.js` 不含源码里新增的注释。门禁看不到这件事——`index-drift` 管 `docs/`，`catalog-fresh` 管目录墙，没有任何校验项覆盖 `lib/types/`。

### Decision

**入库边界按「有无源码」划分**，而不是按包身份：有 `src/` 的包，`lib/types/` 入库——理由不是「应该入库」，而是交付链的现实约束：受管包以 `file:` 依赖被 profile 安装，pnpm 按 `files` 打包，构建不会在安装时自动跑，产物不入库则装出来的包没有类型。无源码的纯预构建包（`dsh-loopx-plugin`）里，`lib/types/` 是**作者手写内容**，必须入库。因此 agent-team-gui / skill-center 不入库不算违规。

**`build` 必须被门禁真实执行**：`scripts-runnable`（ADR-0014）原先只验证 `typecheck` 与 `test`，`build` 从未被跑过。已把 `build` 纳入该校验项——「产物能不能生成」此前完全没有校验覆盖。

**产物新鲜度校验（`types-fresh`）实现后主动撤回。** 原计划重新构建并与入库内容比对，实测发现它无法非空转地成立：`dsh-browser-local` 的 build（`tsc -b && tsdown`）退出码 0 却**不改动** `lib/types/index.d.ts`（md5 与 mtime 前后一致），即 build 并非该产物的权威生成者，比对恒为空转；`dsh-deepresearch-local` 的 build 因自身 5 个类型错误退出码 1，新鲜度无从判定。恒真的校验项比没有校验项更糟——它给的是假信心，故连同其纯函数与测试一并撤回，复现方式写进 ADR，避免后人重走。

### Alternatives considered

**全部移出跟踪（一律不入库）。** 最干净，但打断 `file:` 交付链：不入库又不在安装时构建，装出来的包就没有 `lib/types/`。要修就得给每包加 `prepare` 并在安装时构建——那是把「产物可能过期」换成「安装时构建可能失败」这个新的失败面。

**全部入库。** 与现状一致，但等于承认产物可以漂移，正是要解决的问题。

**并入 ADR-0017 的类型统一供给。** 方向对但解决的是另一个问题：ADR-0017 管「类型从哪来」，本条管「入库的产物是否与源码一致」。即便来源统一，入库产物仍可能过期。

**用「构建后 git diff 为空」代替独立校验项。** 已实现并实测，随后撤回——原因见上。剩下唯一能让 `types-fresh` 真正成立的路径是**为每个包声明 `typegen` 脚本**（权威生成其类型产物的命令，而不是复用可能并不产出这些文件的 `build`），本轮不引入，属独立工作量，与 `types-fresh` 一并推迟。

### Consequences

「有源码的包，产物入库」从三种习惯变成一条规则，边界由 `src/` 与 `files` 推导而非人工维护；`build` 首次纳入门禁校验。**未竟项要说清楚**：入库产物的新鲜度仍无机器校验——本 ADR 只解决了「怎么放」，没解决「是否过期」，这是明确推迟而非遗漏。后续：先逐个确认每个包的权威生成命令（不是复用 `build`），再引入按包声明的 `typegen` 与 `types-fresh`；`dsh-loopx-plugin` 无源码，其 `lib/types/` 是作者手写内容，不参与任何产物校验。
