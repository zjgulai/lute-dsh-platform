---
title: 修 preset lint 静默失效 + 堵住 profile 副本缺件通道
status: ready-for-agent
test_seam: ① packages/contract/dsh-preset-lint-local 的 node --test（不设 DSH_LINT_PATH 时 linter 仍可解析并给出判断）② node scripts/gate.mjs --mode quick 的退出码与 violations 输出
---

# 修 preset lint 静默失效 + 堵住 profile 副本缺件通道 产品规格

> 本规格来自 2026-09-11 的 grill-me 决策（Q1=B、Q2=B、Q3=C 三项全部确认）与随后确认的共同理解摘要。
> 只综合已确认事实与工具核验结果，不重新访谈。

## Problem Statement

DSH 启动日志里，**15 个 preset 每一个**都出现同一行：

```
[W] [dsh-preset-lint-local] preset-lint: lint failed for <preset>/agent.cordis.yml:
    Cannot find module '.../profiles/desktop/node_modules/dsh-preset-lint-local/lib/lint-preset.mjs'
```

即 preset 组合词汇校验**整体静默失效**。根因经工具核验为「profile 副本同步断层」，不是代码错误：

- 工作区 `packages/contract/dsh-preset-lint-local/lib/lint-preset.mjs` 存在（inode `252388648`）、内容与 `dsh-patches/lint-preset.mjs` 权威副本**逐字一致**；
- 但 profile 安装副本 `~/.dsh/profiles/desktop/node_modules/dsh-preset-lint-local/lib/` **只有 `index.js`**，没有 linter；
- 两侧 `index.js` 是**同一 inode**（`242152693`，links=4）——即 pnpm 的 `file:` 依赖是**硬链接实体副本**，不是符号链接；**安装之后新增的文件不会进副本**。
- 插件运行时按 `new URL("./lint-preset.mjs", import.meta.url)` 解析（相对本模块），在副本侧解析不到 → 抛错 → 被 `catch` 成那句 warn。

包内 6 个测试 `pass 6 fail 0`（退出码 0）却拦不住它，原因已定位：`test/preset-lint.spec.mjs:54` 显式注入
`process.env.DSH_LINT_PATH = <packageRoot>/lib/lint-preset.mjs`——**测试把出问题的那条解析路径整个绕开了**。

**这是类问题，不是孤例**：对 19 个受管本地包做普查，6 个的 profile 副本与 `package.json` 的 `files` 清单不一致，
且分两种相反方向：

| 包 | 清单陈旧（源里也没有） | 真缺件（源有、副本无） |
| --- | --- | --- |
| `dsh-preset-lint-local` | — | `lib/lint-preset.mjs` ← 本案 |
| `dsh-rename-conversations` | — | `lib/globals.d.ts` |
| `dsh-ui-polish` | — | `lib/globals.d.ts` |
| `dsh-team-hub` | — | `tsconfig.json` |
| `@yuxianglin/dsh-bridge-browser` | `lib/invariant.js` | — |
| `dsh-theme` | `README.md`、`README.zh.md`、`docs/theme-design.md`、`assets/readme/deepseek-harness.svg` | — |

现有工具**明确不处理**「副本缺文件」这一侧：`planSync` 的注释写着「只比较副本中已存在的文件内容，
**不追加副本缺失的文件**」。理由是怕覆盖运行所需内容——但那恰恰让 `lib/lint-preset.mjs` 永远补不进去。

## Solution

三条并列的修复，共用一个「`files` 清单即契约」的语义：

1. **让 linter 在真实宿主里可解析**：把 `lib/lint-preset.mjs` 同步进 profile 副本（tmp+mv 原子替换，遵守红线 4），
   使插件不依赖 `DSH_LINT_PATH` 也能工作。
2. **让 linter 有权拦下今天这两类误操作**：新增两条规则——`dsh-skill-subset` 的 `skills` 列表中每个名字
   必须在 `skillsDir` 下有 `SKILL.md`；`positiveSource: 'dir'` 时 `skillsDir` 必须真实存在。
3. **堵住缺件通道**：门禁新增一项，以包 `package.json` 的 `files` 清单为契约，同时校验
   「清单里的文件在源码中存在」与「源码中存在且被清单声明的文件在 profile 副本中存在」。
   现有 6 个包按分类清账：清单陈旧的改清单，真缺件的补副本。

## User Stories

1. 作为维护者，我在 DSH 启动日志里不再看到 15 个 preset 的 `lint failed`，而是每个 preset 一行真实结论（`OK` 或具体错误）。
2. 作为维护者，我想让 preset 的组合词汇错误在**保存后 1.5 秒内**出现在宿主日志里，而不是等我重启后靠肉眼发现问题。
3. 作为维护者，我想在 `dsh-skill-subset` 的 `skills` 列表写了一个不存在的技能名时被立即告知，这样不会等到会话里 `skill(x)` 报 `unknown or no longer available` 才发现。
4. 作为维护者，我想在把 `positiveSource` 改成 `'dir'` 而 `skillsDir` 不存在时被立即告知，因为这条路径会让技能以缺失字段的形态注册，点开即抛 `loaded skill "x" source must be a string`。
5. 作为维护者，我想让包 `package.json` 的 `files` 清单成为可校验的契约：清单声明了但源码里不存在的条目导致门禁失败，这样陈旧清单不会长期潜伏。
6. 作为维护者，我想让「源码里存在、清单也声明了、但 profile 副本缺失」的文件导致门禁失败，这样新增文件不会静默丢失。
7. 作为维护者，我想在门禁失败信息里看到**具体是哪个包的哪个文件、哪一侧缺失**，这样修复不需要再手工普查一遍。
8. 作为维护者，我想让包内测试覆盖**真实解析路径**（不设 `DSH_LINT_PATH` 时 linter 仍可加载），这样「linter 没随包发布」这类缺陷会被测试抓住而不是被测试绕过。
9. 作为维护者，我想让 `lib/lint-preset.mjs` 与 `dsh-patches/lint-preset.mjs` 的「一份事实一个 home」约束继续由测试守护，避免两份副本漂移。
10. 作为客户，我希望安装后的插件行为与仓库一致——不在我的机器上出现「功能不生效但只有一行 warn」的静默失效。
11. 作为下一个改 preset 的人，我想在改坏 `skills`/`positiveSource` 时被 lint 拦住，而不是把 DSH 打个半死再回滚。

## Implementation Decisions

### 决策边界（grill-me 已确认）

| # | 决策 | 取值 |
| --- | --- | --- |
| 1 | 范围 | 修通道 **+** 新增两条 subset 规则；**不**把 preset lint 接进 `scripts/gate.mjs` |
| 2 | profile 同步范围 | 修**机制**（按 `files` 清单校验/同步），不只修一个包 |
| 3 | 测试 seam | 两层：包内 `node --test` 测行为；门禁测交付形态 |

### 通道修复

1. 同步 `lib/lint-preset.mjs` 到 `~/.dsh/profiles/desktop/node_modules/dsh-preset-lint-local/lib/`。
   **必须 tmp+mv 原子替换**（`scripts/gates/sync-profile.mjs` 的 `applySync` 已经实现该语义，复用它，不要 `cat >`）。
2. 插件侧**不改解析逻辑**：`new URL("./lint-preset.mjs", import.meta.url)` 是正确写法（相对本模块，客户机可移植）。
   缺陷在交付形态，不在代码。
3. 包内测试**不再无条件注入 `DSH_LINT_PATH`**：新增用例必须在**不设**该变量时验证 `apply()` 能真实完成 lint
   （即 linter 确实随包可解析）。保留注入能力用于隔离测试，但产品路径必须有覆盖。

### linter 新增规则（`lib/lint-preset.mjs`）

4. 规则作用对象是 `dsh-skill-subset` 行（`name === 'dsh-skill-subset'`）的 `config`：
   - `config.skills` 为字符串数组时，每个名字必须在 `config.skillsDir ?? ~/.dsh/skills` 下存在 `<name>/SKILL.md`；
   - `config.positiveSource === 'dir'` 时，`config.skillsDir ?? ~/.dsh/skills` 目录必须存在。
5. 违规分级：技能名找不到 `SKILL.md` → **error**（会让会话里点不开）；`skillsDir` 不存在 → **error**。
   两者都进 `errors`，从而由既有 `[fail]` 汇总与退出码 1 表达。
6. 不改 `lintRow` 现有 6 条规则的行为，不重构其结构；新规则以独立函数加入并由 `lintRow` 或入口处调用。
7. 依赖不新增：继续用宿主已装的 `yaml`，沿用同一 `createRequire` 绝对路径写法。
   **已知风险记入文档**：该绝对路径指向 `DSH Desktop.app/.../node_modules/yaml`，换机器或宿主升级会失效——本次不改，但规格留痕。

### 门禁新增校验（交付形态）

8. `scripts/gate.mjs` 的 `CHECKS` 注册表新增一项，名称待定（建议 `profile-files-sync`），
   **quick 与 full 两种模式都跑**（它是纯静态检查，代价低，且二期门禁默认 quick 才是提交前主路径）。
9. 校验输入与既有 `profile-metadata-sync` 同源：从 live profile 的 `package.json` 取 `file:` 依赖（`spec.slice(5)` 得源目录），
   源目录名与 `collectManifests()` 的 `entry.dir` 对应；profile 副本路径为 `<profileVendor>/<包目录名>`。
10. 校验语义（**两个方向都要**，这是本案的关键）：
    - **清单陈旧**：`files` 里声明的条目在**源码目录**中不存在（通配条目按其静态前缀目录判定）→ 违规；
    - **副本缺件**：条目在源码中存在、且在 profile 副本中不存在 → 违规；
    - **副本多余**：`files` 声明的运行时文件（`.js`/`.mjs`/`.cjs`）在源码中不存在但在副本中存在 → 违规
      （对应 `@yuxianglin/dsh-bridge-browser` 的 `lib/invariant.js` 形态）。
11. **profile 未安装该包时跳过**，与 `checkProfileMetadata` 的既有语义一致（`if (!existsSync(join(targetDir, file))) continue`）。
12. 违规信息必须包含**包名 + 具体文件 + 缺失侧**，让修复不必再普查。
13. 新增的 `checkProfileFilesSync` 放在 `scripts/gates/sync-profile.mjs`（与 `checkProfileMetadata`、`planSync`、`applySync` 同家），
    由 `gate.mjs` 注册调用；不新建文件。

### 存量清账（本次一并做完，使门禁一次转绿）

14. 清单陈旧 → 从源码 `package.json` 的 `files` 中删除不存在条目：
    - `@yuxianglin/dsh-bridge-browser`（`packages/capabilities/dsh-browser-local`）：删 `lib/invariant.js`；`src` 目录同样不存在，一并处理；
    - `dsh-theme`（`packages/platform/dsh-theme-local`）：删 `README.md`、`README.zh.md`、`docs/theme-design.md`、`assets/readme/deepseek-harness.svg`（源目录只有 `README.local.md`）。
15. 真缺件 → 用 `applySync` 的 tmp+mv 语义补进 profile 副本：
    `dsh-preset-lint-local`（`lib/lint-preset.mjs`）、`dsh-rename-conversations`（`lib/globals.d.ts`）、
    `dsh-ui-polish`（`lib/globals.d.ts`）、`dsh-team-hub`（`tsconfig.json`）。
16. `scripts/gates/exemptions.json` 保持 `[]`：本项是契约级校验，按 ADR-0014 一律阻塞，不登记豁免。
17. 不动这 6 个包的**业务内容**；只改清单或补副本文件。

## Testing Decisions

- **seam ①（包行为）**：`packages/contract/dsh-preset-lint-local` 的 `node --test test/*.spec.mjs`。
  可观察行为 = 「`apply()` 在真实解析路径下完成一次 lint 并把结论写进 `ctx.logger`」。
  期望值来自 preset 文件字面量（技能名、`positiveSource` 取值），不复制 linter 内部算法。
- **seam ②（交付形态）**：`node scripts/gate.mjs --mode quick`（及 `--mode full`）的退出码与 violations 文本。
  期望值来自包 `package.json` 的 `files` 字面量与 profile 依赖字面量。
- **先例沿用**：包行为用 `node --test`（同 `dsh-loopx-plugin/test/artifact-integrity.spec.mjs`）；
  交付形态由门禁兜（同 `profile-metadata-sync`）；同步语义复用 `applySync`/`planSync`，不新写文件复制逻辑。
- **负向用例必须存在**：
  - seam ①：故意把 `DSH_LINT_PATH` **指向不存在路径**时 `apply()` 只应记 warn 而不崩（既有行为）；
    而**不设**该变量时必须真实 lint 成功——后者是本案 Red。
  - seam ①（新增规则）：用好/坏两份 `dsh-skill-subset` fixture 测 `lintFile`——
    坏 fixture 必须在 `errors` 里报出**技能名**（新规则 Red 的直接来源）；
    好 fixture 必须**不报**该行错误（防止规则写成一味报错）。
    规则用 fixture 里显式给出的 `config.skillsDir` 指向临时目录，**不读真实 `~/.dsh/skills`**，保证测试自包含。
  - seam ②：构造一个「副本缺件」的包对，断言 `checkProfileFilesSync` 返回 `passed: false` 且 violations 含具体文件名。
- **每轮保留同一测试的真实 Red 与 Green**；Red 必须因能力缺失（文件缺失/规则不存在），不得靠改选择器或 mock 制造。
- **最终验收**：`pnpm run gate:full` 退出码 0；重启 DSH 后日志里 15 行 `preset-lint` 从 `lint failed` 变为真实结论；
  并用今天那个坏配置（`positiveSource: 'dir'` + 不存在的 `skillsDir`）实测新规则报 error。

## Out of Scope

- **不把 preset lint 接进 `scripts/gate.mjs`**（门禁校验仓库内产物，preset 在用户家目录；客户机上没有这些 preset）。
- 不改 linter 现有 6 条规则的行为与 `lintRow` 结构。
- 不引入新的 lint 依赖，不改 `createRequire` 的 DSH 应用绝对路径（只记风险）。
- 不改 `dsh-patches/lint-preset.mjs` 的权威副本地位；两份必须继续一致（测试已守）。
- 不修 `dsh-theme` / `dsh-team-hub` / `dsh-rename-conversations` / `dsh-ui-polish` / `dsh-browser-local` 的任何业务内容。
- 不处理「副本里存在但 `files` 未声明」的其余文件（可能是构建产物或备份，`planSync` 的既有注释已说明该边界）。
- 不做 19 个包之外的全仓普查扩展（本次普查范围就是 `file:` 依赖的受管本地包）。
- 不新增 ADR；归入既有 `docs/notes/` 归属 Note（ADR-0015 允许「更新已有归属 Note」）。

## Further Notes

- **未确认就停的一点已消解**：第 14/15 条会动到 4 个包的清单或副本，属超出「修 preset lint」字面范围的清扫；
  grill-me 的 Q2=B 已把「修机制而非单包」确认为推荐并获得用户同意，故纳入本次。
- **与 Loop 3 的未竟依赖无关**：本案不依赖 DSH 重启来验证门禁，但 seam ① 的端到端证据（启动日志 15 行变化）
  需要一次宿主重启；重启同时可验证 `dsh-loopx-plugin` 的 GoalBar（另一条线）。
- **风险**：`checkProfileFilesSync` 会成为新增阻塞项，任何本地包新增文件后忘同步都会转红——这是设计意图（把静默变显式），
  但需要在 `docs/architecture.md` 的门禁清单里登记，否则后人不知道它为何失败。
- **计数口径**：本次普查的「受管本地包」= live profile `package.json` 中 `file:` 前缀的依赖，共 19 个。
