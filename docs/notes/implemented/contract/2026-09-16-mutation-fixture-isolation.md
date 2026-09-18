# 2026-09-16 · Mutation test 不能靠“写回旧字节”伪装成隔离

关联：[ADR-0097](../../../adr/ADR-0097.md)、[P-31](../../../pitfalls-playbook.md#p-31--finally-写回旧字节不是隔离测试会覆盖并发合法修改)

## Problem

QG-006A 的 Red 不适合直接动态复现：根 gate 自测会改真实 `package.json`，worktable 自测会改真实
`vendor/dsh-worktable.pin`，Settings 判据把固定名字的 mutant 写进仓库，局部 fullstack fixture 还会
读取真实 HOME 下的技能/profile/icon。前两者即使 finally 恢复，也可能在测试期间覆盖另一进程的合法修改；
固定路径则会让并发 case 互删。六组临时树还没有 cleanup，长期留下不归属任何任务的状态。

因此 Red 采用静态证据：锁定真实写入目标、固定路径和缺省 live root 的调用链，不执行会污染当前脏工作区的
旧 mutation。Green 必须在根外独占临时树重现同样的 checker 失败，且结束不依赖恢复真实文件。

## Decision

- `createMutationFixture()` 建立唯一 owned root 与 `repo/home/profile/tmp` 四个隔离面，记录创建时的
  canonical path、dev 与 inode；`path()` 拒绝 traversal、绝对路径和 symlink 穿越。
- `withMutationFixture()` 强制 prepare 后才能 commit，并在 setup、assertion 或 checker 异常时清理；
  cleanup 自身失败时保留原错误并附上 `cleanupError`，根身份改变就拒绝递归删除。
- 根包身份负例改为 `collectManagedManifests(tempRepo)` + `checkPackageIdentity(tempRepo, entries)`；
  这同时把“根包必须进入判定面”移到可复用收集器，而不是靠 CLI test 改真实 manifest。
- Settings 自测把 probe 与 `real-node.mjs` 复制到临时 repo，并给子进程注入临时 HOME/TMPDIR/profile；
  worktable pin 漂移在临时最小 Git repo 中制造；fullstack 局部测试显式传入临时技能、profile 与 icon 路径。
- `dsh-types`、`package-layout`、`package-collect`、`session-refs-fail-closed`、`sync-profile`、
  `sync-profile-files` 的临时根统一获得 owned cleanup。
- `mutation-fixture-selftest` 进入 quick/full 根 gate；未来 mutation ticket 的隔离采用本契约，完整聚合
  before/after、并发和 SIGTERM 仍留给 QG-006B。

## Alternatives considered

- 用 `try/finally` 恢复：无法区分“自己改的旧字节”和“并发进程刚写的新字节”。
- 继续让每个 suite 自己管理临时目录：正常路径通常能删，prepare 半失败和根被替换时没有共同 fail-closed 语义。
- 给 checker 增加隐式测试模式：会再造一套路径规则；显式注入 repo/profile roots 更容易审计。
- 本批顺便做 QG-006B：会把 fixture 基础设施与聚合并发验收混成一个不可定位的失败面，未采用。

## Consequences

- 静态 Red 的四个真实污染入口已移除；对应 Green 全部在 `/tmp` 系统临时父目录下的独占根完成。
- fixture 生命周期自测 8/8、根 `test:gate` 408/408；通过项包含合法基线、单点 mutation、空/缺失射程、
  prepare 半失败、assertion 抛错、cleanup ownership 漂移和双失败保真。
- 当前已有 QG-002/003/004/010/011/012 校准用例均不需要写真实 checkout/live profile；尚未实现的
  QG-005 mutation 必须在自身 ticket 中接入本基础设施后才可完成。
- 这只是 QG-006A 的隔离基础设施与现存 suite 迁移证据；没有声称完成 QG-006B、远端 CI、live UI、
  DMG 或发布验收。
