# 依赖层的可复现：24 个包里 7 个锁文件是坏的，而主仓的绿有一部分是本机那份 node_modules 给的

- 日期：2026-09-12
- 状态：implemented
- 决策记录：ADR-0055
- 相关设计稿：[.scratch/dependency-reproducibility/README.md](../../../../.scratch/dependency-reproducibility/README.md)（口径、逐条失败原文、复跑命令；不入库）
- 上一轮：[2026-09-12-loadpoint-bytes-drift.md](2026-09-12-loadpoint-bytes-drift.md)（ADR-0054 与 ADR-0044 收尾，本条由那次干净检出验收的结论触发）

## Problem

上一轮的干净检出验收得到一句话结论：**「干净检出全绿」成立，「全新克隆可复现绿」不成立。**

量下去之后，那句话背后的东西是三个病，不是九个。

**一、锁文件契约：7 个包是坏的。** 判据用 `pnpm install --frozen-lockfile --lockfile-only --ignore-scripts`（`--lockfile-only` 不碰 `node_modules`，`--frozen-lockfile` 保证不一致时**报错而不改写**）。第一次扫描，21 个有锁文件的包跑完 `git status -- '*lock*'` 为空——测量本身没有副作用。结果是 16 OK / 3 FAIL / 4 装不上：

- **没有锁文件**：`dsh-loopx-plugin`（22 devDeps）、`dsh-overseas-skills`（4）、`dsh-role-matrix-local`（16）；
- **清单改过、锁文件没跟上**：`dsh-skill-subset`（`typescript` 锁 `^5.6.3` / 清单 `5.6.3`）、`dsh-auto-compact-local`（3 条 peerDependencies 不在锁里）；
- **格式不对**：`dsh-team-hub` 只有 `package-lock.json`，pnpm 报 `ERR_PNPM_NO_LOCKFILE`；
- 两者都有：`dsh-browser-local`。

上一轮口头说的「7 个包缺锁文件」措辞不准：**缺的是 3 个，坏的是 7 个。**

**二、`dsh-browser-local` 是唯一「钉与消费方配置互相矛盾」的包，而且被本机依赖掩盖了。**

`typescript` 在三个地方是三个数字——清单 `5.6.3`、锁文件 `^6.0.3`→`6.0.3`、`node_modules` 里 `5.7.3`。它的 `tsconfig.json` 要 `"target": "ES2024"` 与 `"rewriteRelativeImportExtensions": true`，两者都要 ≥ 5.7。

这一条是**可证伪的一枪**：在 `/tmp` 干净副本里按已提交清单装，装出来就是清单钉的 `5.6.3`，然后

```
tsconfig.json(3,15): error TS6046: Argument for '--target' option must be: … 'es2023', 'esnext'.
tsconfig.json(18,5): error TS5023: Unknown compiler option 'rewriteRelativeImportExtensions'.
src/index.ts(217,42): error TS2802: … needs '--target' of 'es2015' or higher.
src/server.ts(264,26): error TS2802: …
src/server.ts(559,33): error TS2802: …
src/session-deferral.ts(54,31): error TS2802: …
src/session-purge.ts(32,100): error TS1501: This regular expression flag is only available when targeting 'es6' or later.
exit=2
```

也就是说：**照已提交清单装出来的树，这个包的 typecheck 是红的。** 主仓之所以绿，是因为它的 `node_modules` 里躺着清单根本不许可的 `5.7.3`。

同一个包还有第二个病：11 条 devDependency 写的是 `/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/…` 这台机器上的绝对路径。24 个包里只有它这么写（`grep -rln '"file:/\|": "/Applications\|": "/Users' packages/*/*/package.json` 只命中它）。pnpm 把该目标记成相对形式，而相对前缀取决于安装深度——上一轮换深度重装时它从 5 个 `..` 变成 6 个，锁文件因此不可能跨目录移植。真实形状（`HEAD:c1f9572` 的锁文件）：

```
specifier: /Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/cordis
version: link:../../../../../Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/cordis
```

**三、`pnpm install` 本身在两处失败；产物入库状态与门禁步骤顺序不自洽。**

- `dsh-role-matrix-local` 与 `dsh-skill-center-local` 的 `pnpm-workspace.yaml` 里留着 pnpm 交互式审批写下的占位串 `esbuild: set this to true or false`。对照实测：

  ```
  dsh-role-matrix-local    allowBuilds=set this to true or false  install exit=1
  dsh-skill-center-local   allowBuilds=set this to true or false  install exit=1
  dsh-algo-skills-local    allowBuilds=true                       install exit=0
  dsh-newapp-local         allowBuilds=true                       install exit=0
  ```

- 9 个包有 `build` 脚本，其中 5 个的 `lib/` 没有入库，而 `scripts/gate.mjs:369` 把顺序写死为 `['typecheck', 'test', 'build']`。干净检出里 `lib/` 不存在，`test` 看到的是「文件不存在」。把 `lib/` 移开再跑真实 vitest（不删——它被硬链接进装载点，重建会拆链接）：

  | 包 | `lib/` 缺席时 | 退出码 |
  | --- | --- | --- |
  | role-matrix | 10 failed / 99 passed | 1 |
  | algo-skills | 8 failed / 125 passed | 1 |
  | newapp | 6 failed / 106 passed | 1 |
  | root-brand | 4 failed / 1 passed（文件） | 1 |
  | skill-center | 74 passed | 0 |
  | agent-team-gui | 185 passed（host+client） | 0 |

  而 `tsc --noEmit` 在 `lib/` 缺席时仍退出 0——所以循环恰好死在 `test` 这一步。

**顺带修正上一轮的两个计数。** 上一轮说「`lib/` 未入库的 6 个包」——正确的是 **5 个**（`skill-center` 是近似项：同样未入库、同样配置，但它的测试从不读产物，所以今天是绿的，一旦有人照抄兄弟包的 `contract.spec.ts` 就会红）。上一轮说「7 个包缺锁文件」——见上，缺 3 坏 7。

## Decision

**把依赖层写成一条可以离线、确定判定的契约，并让它进主门禁。**

新增 `deps-reproducible`（`scripts/gates/dependency-reproducibility.mjs` + 22 条单元测试），判四条：清单声明了依赖就必须有锁文件；逐条 specifier 与锁文件 importer `.` 记的完全相等；依赖 spec 不得是机器绝对路径、锁文件不得含逃出包目录或绝对的 `file:`/`link:` 目标；同一个名字不得在多个依赖字段里重复声明。

**判据刻意不 shell 出 pnpm、不联网**，只解析已提交的文本。两条理由：`file:` 与注册表混合的树离线跑不出结论；而 `pnpm install --frozen-lockfile` 实测**在同一棵树上给过不一致的结论**——`dsh-preset-lint-local` 首轮扫描报 `ERR_PNPM_OUTDATED_LOCKFILE`，第二轮扫描与随后单包连跑三次都是 `Already up to date`，其间该锁文件在 git 里始终干净。最可能是并发写入（本仓此刻多个会话在改，`git status` 70 条），但**没找到能稳定复现的路径**，所以记为未解、不作为结论使用——而一个会漂的判据不能当门禁。

**重复声明单列一条违规。** 实测 pnpm 只让优先级最高的一侧生效：`dsh-browser-local` 的 `@deepseek-ai/schemastery` 写在 `dependencies(^3.18.1)` 与 `devDependencies(3.18.2)` 两处，锁文件只记 `^3.18.1`；`dsh-deepresearch-local` 的 `dsh-storage-sqlite` / `dsh-web-fetch-http` 同形。被忽略的那一侧不报错也不生效，是写给下一个读的人看的谎。

**peerDependencies 只在「该名字没在本地声明过」时才要求锁文件记录它**——这也是 pnpm 的实际行为：`dsh-browser-local` 的 7 条 `*` peer 因为都已在 devDependencies 出现而被放行，`dsh-auto-compact-local` 的 3 条则被要求进锁文件。

**修法**：`dsh-browser-local` 的 11 条绝对路径依赖按 **ADR-0017** 分两类落地——9 个 `@deepseek-ai/dsh-*` 改成内建运行时 tgz（`file:../../../vendor/dsh-desktop/vendor/dsh-runtime/0.1.2-rc.1/deepseek-ai-<name>-0.1.2-rc.1.tgz`），`@deepseek-ai/cordis` 用注册表精确钉 `4.0.2`（运行时 tgz 里没有 cordis 本体与 schemastery，它们本来就是宿主的第三方依赖）；`typescript` 从 `5.6.3` 提到 `~5.7.3`。`dsh-team-hub` 的 `package-lock.json` 换成 `pnpm-lock.yaml`；两处 `allowBuilds` 占位写成 `true`；`dsh-loopx-plugin` 新增 `pnpm-workspace.yaml`，对 5 个带构建脚本的传递依赖显式写 `false`；其余缺锁文件的补齐、过期的重生成。

**full 模式的逐包脚本顺序改成判据驱动**（`packageScriptOrder`）：有 `build` 且产物根目录（由 `main`/`exports` 推导，本仓 9 个包全是 `lib`）**未入库** → `typecheck → build → test`；否则保持 `typecheck → test → build`。

## Alternatives considered

- **用 `pnpm install --frozen-lockfile` 当门禁判据。** 最贴近事实，但要联网，且实测会漂。离线解析 + 用 `--frozen-lockfile` 做人工复核，同时拿到「确定」与「贴近事实」。
- **无条件改成 `typecheck → build → test`。** 简单，但会掩盖已入库产物的漂移：`dsh-browser-local` / `dsh-deepresearch-local` / `dsh-theme-local` 的 `lib/` 是**已提交的交付物**，先构建就发现不了「src 与提交的 bundle 不一致」。
- **机械判据用「测试是否 import `lib/`」。** 更贴题，但要静态分析每个测试的解析路径，而且很容易写错——实测 5 个包里有 3 个既 import `src/` 又执行 `lib/`，走的是 `import '../lib/client.js'` 副作用导入与 `readFileSync('lib/client.js')` 这类 grep 抓不到的形态。按「产物入没入库」判，机械、可离线、不会漏。
- **把机器路径这条写进 `scripts/gates/exemptions.json` 开局豁免。** 该文件只减不增、到期即拒绝（ADR-0014），而这条能当场修干净：11 条依赖对应的版本全在 npm 上，换完之后 `tsc` 零错误、111 个测试全过、构建正常。
- **顺手把 `dsh-deepresearch-local` 的 `^0.1.1-rc.2` 升到 `^0.1.5-rc.1`。** 不做：本轮只清掉「不生效的那一侧声明」，保持 pnpm 实际生效的解析结果不变。动版本是另一件事，要它自己的验证。

## Consequences

**正面**

- 新规则的可证伪对照：把清单与锁文件倒回 `c1f9572`，同一条规则报 **25 条违规、覆盖全部 7 个包**；当前状态报 **0 条**。两次都是同一条命令。
- `dsh-browser-local` 从「照清单装出来 typecheck 红」变成：按已提交清单全新装 → `tsc -p tsconfig.json` **exit 0** → `pnpm test` **9 files / 111 tests passed** → `pnpm build` 成功；锁文件里 9 个 `file:` 目标全部落在仓库内，机器路径 0 条。源码一个字没动。
- 24/24 个包的 `pnpm install --frozen-lockfile --lockfile-only` 退出 0（修复前 16 OK / 3 FAIL / 4 装不上）。
- 门禁从 16 项变 17 项，quick 全绿。
- 干净检出（`git worktree add --detach 8f8cbdd` + 逐包 `pnpm install --frozen-lockfile`，23 OK / 1 FAIL / 0 空装）里 `gate:full` 收到 **19/20**；先前的「测试跑在未构建的产物上」不再出现。

**负面**

- 判据是「清单 ↔ 锁文件」的**自洽**，不是「解析结果可复现」。锁文件仍可能锁住一个已下架的版本；发现那一类问题仍需真的装一次。这条边界写在模块注释里，不假装覆盖。
- 顺序判据对 `dsh-skill-center-local`（产物未入库但测试不读产物）会白跑一次 `build`。
- 门禁多了一条要读 24 个锁文件的判据（纯文本解析，实测无 IO 压力）。
- **接受标准没有完全达成**：干净检出里 `scripts-runnable` 仍红 5 个包。见下。

**后续**

- **下一轮的对象（本轮量清楚了，但没修）**：干净检出里 `scripts-runnable` 红 5 个包——`dsh-deepresearch-local`（`TS2741` MarkdownLabels 缺字段）、`dsh-overseas-tools` 与 `dsh-wanzh-hulian`（`TS2307` 找不到 `@deepseek-ai/dsh-tools`）、`dsh-theme-local`（`TS7006` 隐式 any）、`dsh-agent-team-gui-local`（`TS2305` `ConnectionRpcResult` / `TS2554`，且它的 `prepare` 让 `pnpm install` 退出 1）。
  它们的病是同一个，而且**已经被 ADR-0017 判过**：`node_modules/@deepseek-ai/*` 是指向 `/Applications/DSH Desktop.app/…`（overseas-tools / wanzh-hulian / overseas-skills / deepresearch-local）或指向仓库根那份 gitignore 的 `.dsh-types/`（theme-local / agent-team-gui-local）的**手做绝对符号链接**；其中 7 条对应的包在清单里**根本没声明**（`overseas-skills` 2 条、`overseas-tools` 2 条、`wanzh-hulian` 3 条）。`pnpm install` 不会造出这些链接，所以「按清单全新装」必然红——这不是新病，是 ADR-0017 决策 1 还没被执行完。browser-local 现在就是那份样板。
  `.dsh-types/` 本身是合规的（`.gitignore:78` 引 ADR-0017：「从内建运行时 tgz 解出的 DSH 类型来源，可重建，不入库」），问题只在于**没有任何入库的东西记录它怎么重建、也没有哪个包的清单声明它**。
- `dsh-deepresearch-local` 的 `@deepseek-ai/dsh-storage-sqlite` / `dsh-web-fetch-http` 在 `dependencies` 里是 `^0.1.1-rc.2`，而同名 devDependency 写的是 `^0.1.5-rc.1`（本轮删掉了不生效的那一侧，行为不变）。两者差一个大版本段，是否升到 `^0.1.5-rc.1` 需要一次带验证的迁移，不在本轮。
- 未解：`dsh-preset-lint-local` 那次 `ERR_PNPM_OUTDATED_LOCKFILE` 只出现过一次，之后三轮均绿。新门禁绕开了这层不确定性，但这个现象本身没有解释。
- 上一轮记下的 `.scratch` 明文密钥降级仍未做；本轮的现场记录只写进 `.scratch/dependency-reproducibility/README.md`，不入库。

---

# 第二轮（同一天）：5 个包的宿主类型改走内建运行时 tgz —— 以及为什么其中一个要整份闭包

## Problem

第一轮的接受标准没达成：干净检出里 `scripts-runnable` 红 5 个包。根因已量清——这 5 个包的 `@deepseek-ai/*` 是**手做的机器本地符号链接**（`/Applications/DSH Desktop.app/…` 或仓库根的 `.dsh-types/`），`pnpm install` 不会造出它们。

第二轮把类型来源换掉之后，暴露出三层此前看不见的东西：

1. **类型的语义第一次真实生效**。旧链接指向应用打包产物，那里**不带 `.d.ts`**（ADR-0017 的背景），加上 `noImplicitAny: false`，`defineTool` 之类全是 `any`——`tsc` 绿不代表查过。换上真类型后，两个包立刻报出真实错误：`dsh-overseas-tools` 的 `renderExa` 返回 `{type: string}` 未收窄（`TS2322`）；`dsh-wanzh-hulian` 19 个工具共用的 `additionalProperties: true` 输出 schema 被推成 `Record<string, JsonValue>`，而「可能缺席的可选字段」在 TS 里归一成 `?: undefined`，`undefined` 不是 `JsonValue`——19 个工具 × 2 条，一个都过不了。
2. **`.dsh-types` 不是多余的，但它的可用性依赖「同名包必须是符号链接」**：`.dsh-types/node_modules/@deepseek-ai/` 是完整的扁平 251 个包，包内 symlink 的 realpath 落在那棵树里，任何传递 import 都能解析。一旦同名包以**实体目录**装进 `node_modules`，realpath 不再落在供给树里，机制静默失效——干净检出里 `dsh-agent-team-gui-local` 的 `TS2305 ConnectionRpcResult` 正是这个。
3. **`tsc -b` 的增量状态会给出假绿**。`dsh-deepresearch-local` 的 `typecheck` 是 `tsc -b`：主仓里它退出 **0**，而 `tsc -b --force` 立刻报 `src/client/ResearchView.tsx(559,50): TS2741 Property 'labels' is missing`。干净检出（没有 `lib/*.tsbuildinfo`）报的正是后者。**「绿」必须用 `--force` 或干净检出定义**，否则量的是缓存。
4. **宿主包的 `.d.ts` 互相 import，闭包不小**：`dsh-agent-team-gui-local` 的 client 半只 import 6 个入口包，而这 6 个的 `lib/types/**/*.d.ts` 引用闭包实测 **54 个包**；并入这些包 `dependencies`/`peerDependencies` 中运行时存在者得 **72 个**。

## Decision

1. **宿主类型逐条从内建运行时 tgz 声明**（`file:../../../vendor/dsh-desktop/vendor/dsh-runtime/0.1.2-rc.1/deepseek-ai-<name>-0.1.2-rc.1.tgz`，ADR-0017 决策 1 的落地）。`dsh-overseas-tools` 1 条、`dsh-wanzh-hulian` 2 条、`dsh-theme-local` 5 条、`dsh-deepresearch-local` 24 条。deepresearch 那 24 条同时把它原先从**注册表 npm 发布线**拉的 `^0.1.5-rc.1` 整条清掉——那条线是 ADR-0017 明确否决过的（「只用内置 alpha SDK，不引入 npm 发布线（防双实例）」），而且它与随应用交付的运行时不是同一份字节：源码一直是对着运行时写的，`@deepseek-ai/dsh-client-ui-primitives@0.1.5-rc.1` 的 `MarkdownText` 要 `labels`、运行时的那份不要，`TS2741` 就是这么来的。
2. **类型图有传递依赖的包按闭包声明**：`dsh-agent-team-gui-local` 的 72 条逐条 tgz。少一个不是警告而是**静默变 any**：`dsh-client-ui-slots` 的 `SessionStandardProps` 是**空接口**，`sessionId` / `useSessions` 由 `dsh-client-ui-session` 的 `declare module` 合并进来；该包不在树里时 `skipLibCheck` 把未解析的 import 静默转成 `any`，报错落在源码上（`TS2339`），看不出病根。
3. **判据不是「`tsc` 绿」，是「没有解析失败」**：`tsc --traceResolution` 里 `@deepseek-ai/*` 的解析失败条数（实测 0）。
4. **上游声明的三条缺口写进入库的模块增强**：`Session.events`、`SessionHeader.seedLength`、`JsonValue` 重导出（运行时真有、`.d.ts` 里没有）。`scripts/gates/dsh-types.mjs::augmentDeclarations()` 一直在 `.dsh-types/` 里补这三条；走 tgz 直装的包看不到那份生成物，所以同样三条以 `packages/surfaces/dsh-agent-team-gui-local/types/upstream-declaration-gaps.d.ts` 表达，由 tsconfig 的 `files` 纳入。两处同源、交叉引用，上游修复后一起删。
5. **`MarkdownText` 的 `labels` 按 locale 供一次、引用稳定**：新增三个 locale 键（`markdown.codeCopy` / `markdown.codeCopied` / `markdown.footnotes`），在 `ReportPane` 里用 `useMemo(..., [t])` 构造。上游声明写明这个对象必须引用稳定（换身份会丢掉流式渲染缓存），现造一个对象是不合规的。
6. **真实类型错误修在类型上，不压掉**：`renderExa` 补显式 `@returns`；`textOutput()` 的输出 schema 从开放改成闭合五键（`ok`/`text`/`error`/`data`/`disconnected`——全部 execute 返回值的并集，静态枚举过）。

## Alternatives considered

- **沿用 `.dsh-types` 的符号链接供给。** 它其实是被低估的机制（见 Problem 2），而且不需要在 24 个清单里各写一遍类型来源。放弃的理由：那份供给是 gitignore 的生成物，`pnpm install` 不造它（`scripts/dsh-types.mjs --apply` 才会，而它没有被写进任何上手步骤）；更要紧的是它与「按清单装出来的实体目录」互斥——干净检出里 5 个包红正是这套机制被实体目录挡住的结果。tgz 直装把「类型从哪来」变成清单里可读的一行。
- **只装直接依赖，传递的交给 `skipLibCheck`。** 就是 Problem 2 里描述的静默 any：绿与不绿都不说明类型检查真的跑过。ADR-0017 的立意正是「类型检查要有真实语义」。
- **给 agent-team 加一条 `paths` 回落到 `.dsh-types`（实测不可行）。** `paths` 的替换是**字面路径**、不走 package `exports`：`@deepseek-ai/dsh-client-ui-session/client` 会去找 `.dsh-types/…/dsh-client-ui-session/client` 这个不存在的目录（真路径是 `lib/types/client`）——子路径导入一律落空。加 `baseUrl` 也一样。
- **把 agent-team 的 client 半排除出 typecheck。** 最省事，等于承认它的类型是空的；而这个包的 client 半正是它的主体。
- **用 `as any` / 放宽 tsconfig 压掉那 4 条新报的错误。** 那几条是真实缺陷被首次看见，压掉就等于把 ADR-0017 的收益重新交回去。

## Consequences

**正面**

- **接受标准达成**：干净检出（`git worktree @ 84aba6d` + 本轮 5 包改动 + 接上嵌套 vendor 仓）里逐包 `pnpm install --frozen-lockfile` **24/24 退出 0**、`gate` quick **16/16**、`gate:full` **20/20**。中间那轮 19/20 的唯一红项是 `scripts-runnable` 的 `dsh-deepresearch-local`（`TS2741` `labels`），修掉后复跑得到 20/20。
- 5 个包在**主仓树**里全绿（`dsh-deepresearch-local` 用 `tsc -b --force` 判定）：`dsh-overseas-tools` typecheck 0 / test 8 passed；`dsh-wanzh-hulian` typecheck 0（此前 38 条 `TS2322`）/ test 10 passed；`dsh-theme-local` typecheck 0 / test 20 passed；`dsh-deepresearch-local` `tsc -b` 0 / test 38 passed；`dsh-agent-team-gui-local` typecheck 0 / test **66 + 119** passed（含 `prepare` 里的完整构建）/ client program 解析失败 **0 条**。
- 新门禁 `deps-reproducible` 在 quick 模式下对 24 个包报 0 条违规；`profile-metadata-sync` / `profile-files-sync` / `profile-bundle-sync` 按门禁提示同步后一并转绿，quick **17/17**。
- `dsh-deepresearch-local` 从「typecheck 红」变成「按运行时 tgz 装出来 `tsc -b --force` 零错误、48 个测试全过」——顺带证明它的源码一直是对着内建运行时写的，注册表那条线才是漂移源；它的测试也从「`dsh-session` 被 peer 自动装成 **0.1.0-rc.8**、与运行时的 `dsh-llm` 对不上（`CallId` 在 0.1.2-rc.1 已改名 `ToolCallId`）」变成稳定。

**负面**

- `dsh-agent-team-gui-local` 的 `devDependencies` 从 23 条宿主 pin 涨到 87 条（闭包 72 + 工具链）。这是「DSH 运行时是个扁平完整集」的直接代价：宿主包之间不声明彼此的依赖，所以谁的类型图跨包，谁就得自己把闭包写全。换运行时版本时要整体重生成。
- `dsh-wanzh-hulian` 的 19 个工具输出 schema 由开放收紧成闭合五键。现有返回路径的键全在这五个之内（静态枚举过），但这是一次**运行时 schema 收紧**，不是纯类型改动。
- cordis 插件族仍有 peer 版本告警（`cordis-plugin-loader` 1.0.2 vs `^1.0.3`、`cordis-plugin-include` 1.0.6 vs `^1.0.7`），`pnpm install` 退出 0，本轮未处理。
- **未做成门禁的那一条，量与做法都记下来**：本轮病（清单没声明、`node_modules` 里手做符号链接）只在**干净检出**里暴露，本机树上看不见。离线可判的版本是「扫 `src/`+`lib/` 里的 `@deepseek-ai/*` import，不在任一依赖字段里且不等于包自身名字即违规」——实测全仓命中 **1 个包**（`dsh-file-upload-local` → `@deepseek-ai/dsh-client-ui-primitives`），另有两处噪声需先排除（deepresearch 的自引用 `@deepseek-ai/dsh-deepresearch/remote`、browser-local 全在 `tests/` 里的 10 条）。没落这一条是因为它要改 `scripts/gate.mjs`，而那个文件当时有另一会话的在途改动；留作下一轮第一件事。
- **干净检出验收的口径要改**：`git worktree` 检出**不含嵌套 vendor 仓**（外层只 track `vendor/dsh-desktop.pin`），而 `file:` tgz 全在那棵树里。缺了它，6 个包的 `pnpm install` 直接崩（pnpm 读不到 tgz 目标），`scripts-runnable` 连带报 127「脚本执行体不存在」——这不是包的问题，是验收姿势的问题。干净检出必须把 `vendor/dsh-desktop` 接上。
