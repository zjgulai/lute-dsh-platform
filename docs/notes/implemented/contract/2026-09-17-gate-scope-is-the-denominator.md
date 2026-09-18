# 门禁的分母必须是「被检查对象的完整集合」（QG-003 / QG-004 / QG-005）

- 日期：2026-09-17
- ADR：[ADR-0102](../../../adr/ADR-0102.md)
- 生命周期：implemented
- 类别：contract

## Problem

三张卡各自被实测出一个 Red。形状不同，根因是同一个：**射程变小与「没有问题」在读数上同形**。

**QG-005（`changedPackages` 射程）**。旧实现用三个来源取改动文件：

```
git diff --name-only HEAD
git diff --name-only --cached
git diff --name-only main...HEAD
```

在临时 Git 仓库里实测（本地 `main` 超前 `origin/main` 两个提交、两个包被改）：
`main...HEAD` 在 `main` 上就是 `main...main`——**自比较**，恒为空；另外两个来源在没有未提交
改动时也是空的。三条来源合起来仍然返回**空集**。在真实仓库上再测：31 个 untracked 文件
一个都不在集内，其中 `packages/infra/dsh-team-hub/src/bounded-body.mjs` 与它的测试
是本轮新增的包文件——**新包在被 `git add` 之前对变更包门槛完全隐形**。三个来源还各自
`try/catch` 吞掉失败，`main` 引用不存在时静默少一个来源。

**QG-003（`plugin-entry-contract`）**。旧实现把入口硬编码成 `<dir>/lib/index.js`，
读到就查、读不到就 `continue`，不导出 `apply` 也 `continue`，最后只报一句
「核对 21 个 Cordis 入口（23 个带 dsh.bundle.patch 的包）」而门禁退出 0。实测这三条
都不是假设：

- `dsh-task-board-local` 的清单入口是 `./index.js`（一个 `export * from './lib/index.js'`
  的转出口壳），旧实现读的是 `lib/index.js`——**读对了纯属巧合**；
- `dsh-deepresearch-local` 与 `dsh-agent-team-gui-local` 的默认导出是 Cordis `Service`
  子类（类体内 `static inject`），旧实现把它们当「库形态」跳过。它们**是插件**，
  只是不长 `apply` 的样子；
- 更根本的是：这个模块**从来没有被任何东西 import**。它是「写了但从没跑到」的形态（P-04），
  所以那 2/23 的缺口在任何报告里都不存在。

**QG-004（profile 覆盖率）**。`installedProfileDependencies()` 的失败路径是
`catch { return {} }`——「清单坏了」与「没有 file: 依赖」返回同一个值。用假 HOME 跑真实的
`node scripts/gate.mjs --mode quick --json` 实测：三个 profile 门禁**全部绿**
（`files-sync` 一个字不报、`bundle-sync` 自述「对比 0/0 个 file: 依赖」、
`metadata-sync` 走自己的 skip）。`bundle-sync` 的射程守卫写的是
`fileDeps > 0 && pairs.length === 0`，它防的是「声明了却一个都没对上」，
**防不住「声明本身就没了」**。另外两个面还各自用 `entry.dir.split('/').pop()`（扁平
basename）拼目标路径，basename 撞车时两个包会互相顶替。

## Decision

三处统一成一条契约：**分母 = 被检查对象的完整集合，每个对象落在且只落在一个桶里**
（`expected = checked + skipped + failed`），空射程只能报 `skip`、不能报 `pass`。

1. **`changed-packages`** 新增 `scripts/gates/changed-packages.mjs`：基线按
   「CI 事件 SHA → 分支 upstream → `origin/main`」解析，**不含本地 `main`**；
   四类来源（committed / staged / unstaged / untracked）分别列账，rename 同时映射旧、新路径；
   路径归属按**分段边界**（`packages/a/b` 不冒领 `packages/a/bc`）；根治理文件按已登记规则
   归类，工作区级的（根 `package.json`）把射程扩到全部包。基线不可解析 → 判红，不返回空集。
   `checkChangedPackages` 从老式 `{passed}` 改成规范三态；**无改动时报 `skip`**
   （旧行为会被规范化成 `checked=1`，把「没看」记成「看过且没问题」）。
2. **`plugin-entry-contract`** 重写：入口从清单解析（`exports['.']` 条件目标 → `main`），
   跟随 `export * from` 转出口（深度上限 + 环检测），候选分四类且**四类都进分母**；
   注释与字符串先剥离再扫（`ctx.credentials` 写在字符串里不算命中），正则字面量按上一个
   有效字符启发式识别 + **括号平衡自检**兜底；`ctx.<服务>` 的缺陷形状收窄到**未加 `try`
   防护**的属性访问；Service 型核对 `inject` 是否为 **static** 字段。模块接进 `scripts/gate.mjs`
   （此前从未接线），并配一个反向自测项。
3. **`profile-*`** 新增 `scripts/gates/profile-coverage.mjs`：期望集从 profile 的声明推出，
   按完整相对路径后缀对齐受管包；manifest 解析失败直接判红；期望集里的包在目标缺失判红；
   三个断言面共用期望集、各自结账。**只允许一种 skip**：profile 根整体不存在。
   `installedProfileDependencies()` 删除，不留同名「安全版本」。

## Alternatives considered

- **各卡各修，只补断言不改记账**：射程收缩本身仍不产生读数，下次换一种收缩方式依然静默。
  三处各有各的收缩路径（自比较的 diff 表达式、读不到就 `continue`、解析失败吞成 `{}`），
  这正是「按根因修而不是按症状修」的理由。
- **把「受管包没被这份 profile 声明」也判红**：本机 profile 裁剪是合法的。把合法状态判红
  只会换来一条豁免，而豁免会让真信号一起失效（ADR-0014 的豁免只减不增正为此）。
  实测本机 profile 声明了 24/25 个受管包，未声明的那个是 `dsh-paper2skills`——
  它有 `exports` 但没有 `dsh` 字段，是纯库而不是 profile 成员。它因此只进读数，
  且**带 `dsh` 声明却未被声明**的包会被单独点出来（那才是真信号）。
- **引入 YAML / ES 模块解析库**：没有新增依赖的许可。改写成「只认仓库里实际出现的形态 +
  不认识的形态一律判红（`unresolved`）」。这条比「宽松解析」更安全：不认识的语法变成红灯，
  而不是变成「没有这个导出」。
- **`plugin-entry-contract` 先接线再看**：卡面的证据层级要求「只有 L1/L2 通过后才允许把 L3
  接入 required gate」。本轮先让 L1（内存 fixture）与 L2（临时文件树变异）全绿，
  再接线；接线的同时补反向自测项。

## Consequences

- 实测读数：`plugin-entry-contract` 23 个候选 **23 核对 / 0 跳过 / 0 失败**
  （`plugin-apply=21 plugin-service=2`）；三个 `profile-*` 各 **24/24**；
  `changed-packages` 12 个对象（8 个包 + 4 条治理规则）。
- 反向自测：`changed-packages.test.mjs` 20 条（关掉 untracked 来源 → 5 条判红）、
  `plugin-entry-contract.test.mjs` 28 条、`profile-coverage.test.mjs` 18 条
  （关掉目标缺失判红 → 7 条判红）。三个 selftest 都已接进门禁。
- 未做 / 未验证：没有 commit / push；没有触发任何真实安装；没有改真实 profile
  （QG-004 的 Red/Green 全部在假 HOME 上跑，Red 用的是截断 JSON，没有碰 `~/.dsh`）。
- 已知边界（写在模块注释里，不留给人推断）：模板字面量 `${…}` 插值里的 `ctx.x` 看不见
  （漏报不是误报）；正则字面量识别失败会被括号平衡自检拦下归入 `unresolved`；
  `plugin-service` 只核对 inject 的字段形态，不核对它要哪些服务。
- 顺带记录一条本批发现、但不属于本批范围的事实：`pnpm-lock.yaml` **被 `.gitignore` 忽略**
  （该文件是白名单式忽略，第 14 行 `*` 起手），因此它永远不出现在 `git diff` / `git status` 里。
  治理规则表里因此**没有**为它登记条目——登记一条永远匹配不到的规则就是造一个死规则。
  工作区依赖图这一后果由根 `package.json` 承担。

---

## 补记（同日第二处应用）：同一原理在**模式维度**上还有一个实例

上面三处修的是「一个判据内部的**对象**射程」。同一原理在一层之上还有第二个实例，
同日单独修掉，记在这里而不新开一篇：**决策是同一个（ADR-0102），换的只是应用层级**。

### Problem

`gate.mjs` 有 `quick` / `full` 两个模式，7 条校验项声明为 `modes: ['full']`
（`scripts-runnable`、`release-published`、`patch-anchors`、`staging-freshness`、
`worktable-fence`、`theme-tokens`、`theme-tokens-selftest`）。改之前 quick 的摘要只报：

```
ok 75/76 项通过（mode=quick，跳过 1；objects: ...）
```

**76 是「这次恰好跑了哪些」，不是注册表全量 83。** 它会被读成「门禁看过了 76 项，
其余不存在」——射程变小与「没有问题」在读数上同形，只是这次缩的不是对象而是**校验项**。

这不是假想的风险，它有前科：2026-09-16 的 typecheck 回归（`dsh-wanzh-hulian` 10 处
TS2339 + 测试 6 处类型错）正是由 full-only 的 `scripts-runnable` 守着的，那一轮只跑了
`--mode quick` 就声称通过——P-04 的变体：**用的是没有覆盖该分支的那档命令**，
而读数里没有任何东西提示它漏了。

### Decision

摘要的分母补上另一半：`summarizeGateResults()` 接受 `notCovered`；`gate.mjs` 按
`check.modes && !check.modes.includes(mode)` 从 `CHECKS` 算出未覆盖项并传下去；
文本摘要**逐条点名**，JSON 摘要带 `summary.notCovered`。

三条约束：

1. **它不参与 `exitCode`**——「这次没跑它」与「它失败了」是两件事，把两者压进同一个
   退出码正是 QG-001 收掉的那种坍缩。未覆盖只让射程可见，不改变任何判据的结论。
2. **「仅 full」由 `MODES` 的反集算出**，不写死：加第三个模式时写死的那个词会静默说谎（P-06）。
3. **未覆盖必须是激活谓词的严格补集**。`isCheckActive(check, mode)` 与
   `computeNotCovered(checks, mode)` 共用同一个谓词（后者是前者的补集），而不是各写一遍
   判断条件：两者一旦分叉，就会出现「既没跑、也没报未覆盖」或「跑了却被报成未覆盖」的项，
   而守恒（跑到的 + 未覆盖的 = 注册表全量）**正是这条读数唯一的判据**。补集由构造保证守恒，
   重写一遍判断条件只能靠两份代码永远同步——那是纪律，不是机制（P-08）。

### Alternatives considered

- **只在文档里补一节「quick 不覆盖 full-only」**：否决。文档不会跟着 `CHECKS` 变，
  而读摘要是提交前门禁的常规动作——提示必须长在**读数**上，不是长在旁边的文档里（P-20 同族）。
- **让未覆盖项也令门禁判红**：否决。那等于取消 quick 模式，并且把「我选了快档」这个
  合法决定判成缺陷；把合法状态判红只会换来一条豁免（ADR-0014）。
- **写死「仅 full」**：否决，见 Decision 第 2 条。

### Consequences

| 模式 | 摘要 | 守恒 |
|---|---|---|
| `--mode quick` | `ok 75/76 项通过（mode=quick，跳过 1；objects: ...）` + `本次未覆盖 7 条（仅 full）：scripts-runnable、release-published、patch-anchors、staging-freshness、worktable-fence、theme-tokens、theme-tokens-selftest` | `76 + 7 = 83` ✓ |
| `--mode full` | `ok 82/83 项通过（mode=full，跳过 1；objects: ...）`，**无**「未覆盖」行 | `83 + 0 = 83` ✓ |

反向自测：`gate-result.test.mjs` 新增六条（未覆盖不改退出码、`runGateChecks` 透传、
非字符串项被丢弃；以及 `computeNotCovered` 的三条：补集正确性、`modes` 形态异常、
垃圾输入不抛）——该文件由 `gate-result-selftest` 开着，真在门禁射程内。

**边界（本轮实测发现，不是本次改动引入的）**：计算逻辑刻意住在
`scripts/gates/gate-result.mjs` 而不是 `gate.mjs`，因为后者**导入即执行 `main()`**，
住在里面的逻辑没有任何门禁测得到。实测 `node scripts/gate.mjs --list` 的 **83 个注册项里，
没有一条跑 `scripts/gate.test.mjs`**——它只挂在 `pnpm run test:gate` 上。因此：

- CLI 级那条端到端用例（守恒式 + 逐条点名）写在 `scripts/gate.test.mjs`，
  **只在 `pnpm run test:gate` 下跑，不在 `pnpm run gate` 的射程内**，不得记作「已接线」；
- 门禁真正守着的是上表那六条**单元**用例。

**未做**：没有把 `scripts/gate.test.mjs` 接进门禁——它跑一次约 4.5 分钟（四条用例各自
spawn 完整门禁），接进去会让 `quick` 从 ~50s 涨到 ~5min，代价与收益不成比例。
「CLI 层没有门禁覆盖」是一个**比本轮改动大得多**的既存缺口，应单独立卡。
