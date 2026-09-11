# preset lint 静默失效与 profile 副本缺件通道（2026-09-11）

> 本文件是本次修复的决策记录（ADR-0015 的 Note 侧；决定本身延伸 ADR-0014 的「契约级一律阻塞」，因而不新增 ADR）。
> 规格：`.scratch/preset-lint-repair/spec.md`（status: ready-for-agent）。

## Problem

DSH 启动日志里 **15 个 preset 每一个**都出现同一行：

```
[W] [dsh-preset-lint-local] preset-lint: lint failed for <preset>/agent.cordis.yml:
    Cannot find module '.../profiles/desktop/node_modules/dsh-preset-lint-local/lib/lint-preset.mjs'
```

即 preset 组合词汇校验**整体静默失效**。根因不是代码错误，而是「profile 副本同步断层」：

- 仓库侧 `lib/lint-preset.mjs` 存在，且与 `dsh-patches/lint-preset.mjs` 逐字一致；
- profile 侧 `node_modules/dsh-preset-lint-local/lib/` **只有 `index.js`**；
- 两处 `index.js` 是**同一 inode**（links=4）——`file:` 依赖在 profile 里是**硬链接实体副本**而非符号链接，
  **安装之后新增的文件不会进副本**；
- 插件按 `new URL("./lint-preset.mjs", import.meta.url)` 相对自身解析，副本侧解析不到 → 抛错 → 被 `catch` 成那句 warn。

包内 6 个测试全绿却拦不住，原因已定位：`test/preset-lint.spec.mjs` 显式注入
`DSH_LINT_PATH = <packageRoot>/lib/lint-preset.mjs`，**测试把出问题的那条解析路径整个绕开了**。

**这是类问题**：对 19 个受管本地包普查，6 个与 `package.json` 的 `files` 清单不一致，且分两个相反方向——
清单陈旧（声明了但源码里也没有：`dsh-theme` 4 项、`@yuxianglin/dsh-bridge-browser` 的 `lib/invariant.js`）
与真缺件（源有副本无：`dsh-preset-lint-local`、`dsh-rename-conversations`、`dsh-ui-polish`、`dsh-team-hub`）。
现有 `planSync` **明确不处理**后者的注释（「不追加副本缺失的文件」）正是 linter 永远补不进去的原因。

## Decision

1. **把 `files` 清单当作契约，两个方向都在门禁校验**。新增 `checkProfileFilesSync`
   （放在 `scripts/gates/sync-profile.mjs`，与 `planSync`/`applySync`/`checkProfileMetadata` 同家），
   在 `scripts/gate.mjs` 注册为第 13 项 `profile-files-sync`，quick 与 full 都跑。
   它同时报出「清单声明但源码无」（陈旧清单）与「源码有而副本缺」（真缺件），违规信息点名具体文件。
2. **盯 `node_modules` 而不是 `vendor`**。`file:` 依赖的**真实装载点**是 `profiles/desktop/node_modules/<name>`
   （实测报错路径即此处）；`vendor/` 是另一份命名不同的副本，同样缺该文件。
   既有的 `profile-metadata-sync` 仍看 `vendor/`，本次不动它——两侧各查各的，差异如实登记。
3. **补真缺件一律 tmp+mv**（架构红线 4），复用 `applySync`：`dsh-preset-lint-local@lib/lint-preset.mjs`、
   `dsh-rename-conversations@lib/globals.d.ts`、`dsh-ui-polish@lib/globals.d.ts`、`dsh-team-hub@tsconfig.json`。
4. **改陈旧清单而非造缺失文件**：`dsh-theme-local` 删 4 项（源码侧是重命名后的 `README.local.md`）、
   `dsh-browser-local` 删 `lib/invariant.js`。改后跑 `sync-profile.mjs --apply --only-metadata`
   把 `vendor/` 侧的 `package.json` 追平，使既有校验重新转绿。
5. **linter 新增两条 subset 规则**：`skills` 中每个名字必须在 `skillsDir` **或 preset 自带的 `skills/`** 下有
   `SKILL.md`；`positiveSource: 'dir'` 而 `skillsDir` 不存在即报错。
6. **不把 preset lint 接进 `scripts/gate.mjs`**：门禁校验仓库内产物，preset 在用户家目录，混入会破坏门禁语义。

## Alternatives considered

- **只修 dsh-preset-lint-local 一个包**：否决——19 个包里 6 个已中同一形态，且症状是「功能不生效 + 一句 warn」，
  极难定位；只补一个等于把同一颗雷留给其余包。
- **把「副本缺失文件」交给 `planSync` 的既有语义（不追加）**：否决——那正是让 linter 永远缺失的机制。
  但直接全量同步副本又会写入构建产物，所以改为**以 `files` 清单为界**：既不遗漏，也不越界。
- **把 preset lint 接进门禁（grill-me 的 Q1=C）**：否决——门禁的语义边界是仓库内产物；且客户机上没有那些 preset。
- **在 linter 里只查 `~/.dsh/skills`（第一版实现）**：**被实测否决**——6 个 preset 的技能只存在于各自自带的
  `skills/` 目录（preset 的 `skill-filesystem` 行经 `customSkillDirs` 读它），漏掉第二个来源会把 6 个正确配置
  误报成错误。修法是把 preset 目录透传进规则，两个来源都查。
- **登记为门禁豁免**：不可行——`scripts/gates/exemptions.json` 是空数组，且该文件只减不增（ADR-0014）。

## Consequences

- 正面：preset lint 从「整体静默失效」恢复为真实校验，实测 15/15 preset 给出 `[ok]`；`files` 清单成为可校验契约，
  新增文件忘同步、清单写陈旧都会在提交前转红；19 个受管本地包的 `files` 清单文件源与副本**全部一致**。
- 负面/代价：
  - 副本缺件本是**我自己的同步脚本**的盲区（只补缺失、漏内容漂移），本轮已改为走 `planSync` 的
    diverged + absentInTarget 两侧——但该脚本仍是 `/tmp` 下的临时件，未入库；
  - `profile-files-sync` 是新增阻塞项，本地包新增文件后不同步必然转红（这是设计意图）；
  - 同步范围外溢：为消除漂移，另外 5 个包（`dsh-agent-team-gui`、`dsh-overseas-skills`、`dsh-skill-subset`、
    `dsh-wanzh-hulian`、`dsh-theme-local`）的副本文件也被刷新到与仓库源一致。方向是「副本跟上源」，
    但确实超出了「修 preset lint」的字面授权范围，如实登记。
- 后续动作：
  - **`docs/architecture.md` 的门禁清单尚未登记 `profile-files-sync`**（规格 Further Notes 记了这条要求），
    否则后人不知道它为何失败；
  - `vendor/` 侧仍有一批构建产物漂移（`client.js`、`tsbuildinfo` 等），本次按范围排除；
  - `dsh-theme-local` 的 `README.local.md` 未进 `files` 清单、`dsh-team-hub@tsconfig.json` 属开发用文件，
    两处「该不该声明」未决，本次只做一致性修复不做取舍。
