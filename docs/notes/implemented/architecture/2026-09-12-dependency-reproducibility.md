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

**修法**：`dsh-browser-local` 的 11 条绝对路径依赖换成精确钉到宿主实际版本（10 条 `0.1.2-rc.1`、`@deepseek-ai/cordis` `4.0.2`、`schemastery` `3.18.2`），`typescript` 从 `5.6.3` 提到 `~5.7.3`；`dsh-team-hub` 的 `package-lock.json` 换成 `pnpm-lock.yaml`；两处 `allowBuilds` 占位写成 `true`；`dsh-loopx-plugin` 新增 `pnpm-workspace.yaml`，对 5 个带构建脚本的传递依赖显式写 `false`；其余缺锁文件的补齐、过期的重生成。

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
- `dsh-browser-local` 从「照清单装出来 typecheck 红」变成：按已提交清单全新装 → `tsc -p tsconfig.json` **exit 0** → `pnpm test` **9 files / 111 tests passed** → `pnpm build` 成功，且锁文件里除了一条 `excludeLinksFromLockfile: false` 设置键之外**没有任何机器路径**。源码一个字没动。
- 24/24 个包的 `pnpm install --frozen-lockfile --lockfile-only` 退出 0（修复前 16 OK / 3 FAIL / 4 装不上）。
- 门禁从 16 项变 17 项，quick 全绿。
- 干净检出里 `gate:full` 不再因为「测试跑在未构建的产物上」而红。

**负面**

- 判据是「清单 ↔ 锁文件」的**自洽**，不是「解析结果可复现」。锁文件仍可能锁住一个已下架的版本；发现那一类问题仍需真的装一次。这条边界写在模块注释里，不假装覆盖。
- 顺序判据对 `dsh-skill-center-local`（产物未入库但测试不读产物）会白跑一次 `build`。
- 门禁多了一条要读 24 个锁文件的判据（纯文本解析，实测无 IO 压力）。

**后续**

- `dsh-deepresearch-local` 的 `@deepseek-ai/dsh-storage-sqlite` / `dsh-web-fetch-http` 在 `dependencies` 里是 `^0.1.1-rc.2`，而同名 devDependency 写的是 `^0.1.5-rc.1`（本轮删掉了不生效的那一侧，行为不变）。两者差一个大版本段，是否升到 `^0.1.5-rc.1` 需要一次带验证的迁移，不在本轮。
- 未解：`dsh-preset-lint-local` 那次 `ERR_PNPM_OUTDATED_LOCKFILE` 只出现过一次，之后三轮均绿。新门禁绕开了这层不确定性，但这个现象本身没有解释。
- 上一轮记下的 `.scratch` 明文密钥降级仍未做；本轮的现场记录只写进 `.scratch/dependency-reproducibility/README.md`，不入库。
