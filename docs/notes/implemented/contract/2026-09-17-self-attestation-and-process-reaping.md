# 自证：门禁的「无副作用」由快照见证与进程级回收证明

- 日期：2026-09-17
- 卡：QG-006B（聚合并发、中断与零副作用证明）
- ADR：[ADR-0103](../../../adr/ADR-0103.md)
- 前序：[2026-09-16-mutation-fixture-isolation](2026-09-16-mutation-fixture-isolation.md)（QG-006A）

## Problem

QG-006A 把 mutation fixture 迁出了真实工作树，退出条件里留了一句：并发、SIGTERM 与全工作树
零副作用由 QG-006B 证明。做 QG-006B 时这句话被实测证伪了两次，而两次的根因是同一句话的
两种说法：

**（一）回收只存在于顺利走完的那条路径上。**

```
$ TMPDIR=/tmp/qg006b-term/tmp node scripts/gate.mjs --mode quick &
$ kill -TERM $!
$ wait; echo $?
143
$ ls -1 $TMPDIR
fullstack-installer-FgZkpY
fullstack-installer-FQngOE
...（共 6 个）
wanzh-routes-UWhoPe
node-compile-cache
$ ps -Ao pid,ppid,command | grep gate
58238     1 node scripts/gate.mjs --mode quick     ← 被 init 收养，继续跑
```

然后去数真实的 `TMPDIR`（不是猜，是数）：

```
$ ls -d $TMPDIR/fullstack-installer-* | wc -l      # 1555
$ ls -d $TMPDIR/gn-check-* | wc -l                 # 438
$ ls -d $TMPDIR/wanzh-routes-* | wc -l             # 82
$ du -shc $TMPDIR/{fullstack-installer,gn-check,wanzh-routes}-* | tail -1
 35M
```

三个来源都在代码里定位到了，而且形状一致：

| 位置 | 形状 |
|---|---|
| `packages/capabilities/dsh-overseas-skills/test/install-fullstack-skills.spec.mjs` | `fixture()` 每个用例 `mkdtempSync`，**从不清理**（8 个用例 → 1,555 个根） |
| `packages/capabilities/dsh-overseas-skills/test/generic-manifest-skip.spec.mjs` | `makeTree()` 同样只建不清（438 个根） |
| `packages/capabilities/dsh-wanzh-hulian/test/oauth-routes.spec.mjs` | 有 `test.after(() => rmSync(...))`，但 `test.after` 只在正常跑完时执行（82 个根） |

**（二）「跑完没改动仓库」当时没有任何东西在核。**

`git status` 在跑前跑后是同一份脏工作树，两边看起来一样。而这次的对照实验说明了这个
形状有多危险：用**合成空 HOME** 跑 `--mode quick`，`skill-lines-selftest` 判红——
红的原因不是被测代码坏了，而是 `skill-lines.test.mjs` 的 S4–S7 用
`checkSkillLines({ repoRoot, runOne })`、`home` 走了 `homedir()` 默认值，在陌生 HOME 下
进了「环境前提不在」的早返回分支，红桩一次都没被匹配到。**判据读了真实环境**，
于是它在不同机器上给出不同读数，而那个差异看起来像代码坏了。

## Decision

见 [ADR-0103](../../../adr/ADR-0103.md)。要点与落地位置：

1. **快照契约**（`scripts/lib/repo-snapshot.mjs`，纯函数）：射程 = git tracked/untracked
   条目 + 声明根深度 1 名录 + 未声明 ignored 区域全量 + git 状态（HEAD/refs/index 字节）。
   每一次射程收缩都必须报错（空射程、目录折叠、枚举与磁盘不一致、schema 不符）。
2. **见证 harness**（`scripts/lib/repo-attest.mjs`）：起真子进程（`detached` 独立进程组，
   便于整组发信号）、before/after 快照、差异与「说不清」分开报告；证据写进见证者自己的
   临时根，**不写回被见证的仓库**。
3. **进程级回收**（`scripts/lib/mutation-fixture.mjs`）：live 根注册表 + `process.on('exit')`
   + `SIGINT`/`SIGTERM`/`SIGHUP` 先回收再默认处置重发；新增窄接口
   `mutationRoot(prefix)` 供那三个泄漏源直接替换 `mkdtempSync`。
4. **六条结束路径**各一条用例（`scripts/lib/repo-attest.test.mjs`）：正常、断言失败、
   checker 非零、fixture setup 失败、cleanup 失败、SIGTERM。
5. **聚合并发**（`scripts/lib/repo-attest-concurrency.test.mjs`）：默认 10 轮 × 2 条完整
   `gate.mjs --mode quick`，每轮见证仓库零差异 + 两条 lane 读数不得分裂 + 各自回收临时根。
6. **CLI 入口**：`node scripts/gate.mjs --attest [目标] [--mode …] [--json]`，标
   `authority: 'L2-local'`，供 QG-007 的独立 runner 复算同一契约。
7. **判据不读真实环境**：`skill-lines.test.mjs` 的 S4–S7 改用 `withSelftestHome()` 注入
   合成 HOME（被测方默认值不动）。

## Alternatives considered

| 方案 | 为什么不选 |
|---|---|
| 磁盘全量哈希当射程 | 654,616 个 ignored 文件，一次见证分钟级；且量的是开发者机器的构建产物，不是门禁行为 |
| 只在测试里见证 | QG-007 要在独立 runner 上复算，测试文件不是可调用契约面 |
| 把 `.git/*.lock` 加进忽略名单 | 「并发读锁」与「被打断的写入者残留」在单张快照里同形；忽略前者等于放掉后者。改为二次确认 |
| 继续用 `finally` 手工回收 | `finally` 覆盖不到信号——这正是 8 个根与 2,066 个历史根的成因 |
| 三个泄漏源改写成 `withMutationFixture` | 它们只要一个临时根，给 repo/home/profile/tmp 是过度耦合；`mutationRoot()` 保留原调用点形状 |
| 并发见证用合成 HOME 换完全隔离 | 合成 HOME 下 8 项走「环境不在」分支、`skill-lines-selftest` 判红，那不是并发缺陷；HOME 改为真实只读，独立变量是临时根/lane 标签/端口 |

## Consequences

**可复算的读数（本次实测）**

| 项 | 读数 |
|---|---|
| `scripts/lib/repo-snapshot.test.mjs` | 9/9 |
| `scripts/lib/repo-attest.test.mjs` | 9/9（六条路径逐条判 `identical: true`） |
| `scripts/lib/mutation-fixture.test.mjs` | 11/11（新增 SIGTERM / SIGINT / `mutationRoot` 三条） |
| `scripts/gates/skill-lines.test.mjs` | 7/7（注入合成 HOME 后 S4–S7 真的跑到被测分支） |
| 三个泄漏源迁移后重跑 | `fullstack-installer` / `gn-check` 12/12、`wanzh-routes` 4/4，前后残留计数**不变**（0 新增） |
| 聚合并发 10 轮 × 2 条完整 gate（独占 clean clone） | `✔`，245 秒，exit 0；副本跑完 `git status` 0 行、HEAD 未变 |
| 本仓库上直接跑同一条用例 | 三次两红，两次都判对——写入者分别是本会话、Codex 会话、另一个 agent 会话（见下） |
| `gate --attest` 正/负例 | 干净目标 exit 0；故意写仓库的目标 exit 1 并点名到路径 |

**正面**

- 「门禁跑完没改动仓库」从声明变成读数，且同一契约对 CI 公开。
- 三条泄漏源修在源头，修法是窄接口替换而不是框架化改造。
- 进程被打断时不再留自有根，也不再留变成 init 子进程的门禁。

**一条在实施中才暴露的边界：这个工作树长期有多个写入者**

10 轮用例在本仓库上跑过三次，两次判红，都判对了：写入者分别是本会话（一边跑一边写
ADR-0103 与测试文件）、本机并行的 Codex 会话（`refs/codex/**`）、另一个 agent 会话
（`.scratch/gate-scope-readout/SYNC-2026-09-17.md`）。这正是卡面写的失败边界，于是
稳定性读数改在**独占副本**上取（`DSH_ATTEST_REPO`）：`rsync` 出一份不含 `packaging/release`、
`packaging/staging`、`.dsh-types` 的副本并 `git init` 成单 ref、零 untracked 的基线，
10 轮一次过。

外部写入者也逼出了一处**归因修正**：`refs/codex/**` 是别的工具的命名空间，算成「门禁的
副作用」是错误归因，直接忽略又会掩盖「测的时候有人在写」。现在 ref 分两份——本仓库自己的
（heads/tags/remotes）仍进 digest、仍判红；外部命名空间只记名字与新旧 OID，进
`concurrentActivity`（如实回报、不参与判定）。

**负面 / 已知边界**

- 单次 before/after 约 1.1 秒（本机），`--attest` = 一次完整门禁 + 两次快照；
  并发 10 轮约 7–8 分钟 → 登记为 full-only 并显式抬高超时到 30 分钟。
- 快照读取非原子：与写入者赛跑可能读到撕裂条目，处置是重跑并点名 offender。
- 声明根只记深度 1 名录/类型/权限，不比对内部内容字节（479k 文件的取舍）。
- 并发见证是 L2，不是 L3：独立 runner 上的 attestation 由 QG-007 收口。
- L3 明确未做：本轮没有远端 runner、没有 CI 重放（也未被授权）。
