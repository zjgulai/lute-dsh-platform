# 发布清单：为什么「客户手上那版对应哪份源码」在 2.2.0 上已经答不出来

- 日期：2026-09-13
- 状态：implemented
- 决策记录：ADR-0058
- 相关：[2026-09-12-release-atomic-publish.md](2026-09-12-release-atomic-publish.md)（ADR-0057；本条的「清单先于 tag」正是它第 4 条那条契约缺的另一半）、[2026-09-12-shipping-surface.md](2026-09-12-shipping-surface.md)（ADR-0056；机读判据同一条方法论）

## Problem

### 起因是一个看起来很小的问题

用户问：仓库里 `release/`、`packaging/`、`packages/` 三个目录各是什么、能不能合并。查下去才发现，仓库根 `release/` 自初始提交 `3b437af`（2026-09-06）起**只有一个 README**，而它首行写着自己是「DMG 哈希清单目录」。

### 同一件事，两个说法，其中一支从未执行

- `docs/release-process.md`（初始提交起、十天内未改）：`shasum -a 256 <dmg>` → 写入 `release/<version>.sha256` 清单（**入库**）。
- `docs/adr/ADR-0002.md`（证据重建）：产物落在 `packaging/release/<版本>/`，附 `SHA256SUMS`；`release/` 目录本身**不入库**。

实测：全仓没有任何 `.sha256` 文件。实现走的是后一条路——`sign-and-dmg.sh` 把 `SHA256SUMS` 写进 `packaging/release/<版本>/`，而 `packaging/.gitignore:3` 的 `release/` 把它忽略了（`git check-ignore` 实测确认）。

哈希的**值**并非完全没记录，但散在 7 处，且**唯一机读的那份不入库**：

| 位置 | 形态 | 可否校验 |
| --- | --- | --- |
| `packaging/release/2.2.0/SHA256SUMS` | 完整 | ✅ 但被 gitignore |
| `packaging/CHANGELOG.md:11` | 完整 64 位 | ❌ 散文 |
| 根 `CHANGELOG.md:32` | 截断 `e74fb6d0…` | ❌ |
| `ADR-0057.md:21` / Note（×3）/ `PLAN.md:7` | 截断 | ❌ |

七个家，没有一家能跑 `shasum -c`——这本身就是 ADR-0009「一份事实只有一个家」的反面。

### 让这件事从「文档不一致」升级为「契约破损」的，是 2.2.0 的载荷

核对过程中撞到一件更要紧的事，并且做了双向验证：

| 对象 | `probeChannels`（诊断探针） | 行数 |
| --- | --- | --- |
| tag v2.2.0（`afe641c`） | 0 —— 没有 | 337 |
| HEAD（`80f40a0`） | 0 —— 也没有 | 337 |
| 2.2.0 载荷（`staging/2.2.0/payload/profile.tar.gz` 解出） | **有**，出现在 4 个文件里 | **377** |

载荷内的 `vendor/packages/surfaces/dsh-newapp-local/src/client/launcher.ts` 与当时**工作区那份未提交文件逐字节相同**。多出的 40 行里既有诊断探针（`dsh-newapp-probe`），也有一个**功能性**改动（`agentPresets` 双载体回退：先试 `ctx.get('agentPresets')`，再退回 `connection.api.agentPresets`）。探针命中 4 个文件：vendored 源码、vendored `lib/client.js` 及其 `.map`、以及 `node_modules/dsh-newapp-local/lib/client.js` 及其 `.map`。

结论很直白：**客户手上那份 2.2.0，不对应任何提交，也无法由任何提交重建。** 而 ADR-0057 第 4 条写下「版本号 = git tag = 打包版本」时给的理由，正是「同号不同字节一旦流出去，客户手上那版对应哪份源码就无法回答」——那句话所防的事，已经发生在正在交付的这一版上。

### 顺带查实的另外两条

- **DMG 走出仓库的通道是飞书。** ADR-0057 取证时留下的扩展属性 `com.apple.quarantine: 0082;6aa56c42;Feishu;` 说明一切。字节离开仓库之后，仓库侧唯一还能认领它的东西，就是一份入库清单。
- **GitHub Releases 里没有 v2.2.0**（`gh release list` 最新为 v2.0.0，`gh release view v2.2.0` → release not found），而 `README.md:28` 正告诉客户从 Releases 下载。

### 一条必须写准的更正

排查中我先得出过「v2.2.0 的 tag 根本不在任何远端」这一结论，并把它当作推荐「甲」的理由之一。**它是错的**：`git ls-remote` 显示 origin 与 codeup 都有 `refs/tags/v2.2.0` → `afe641c`。真实情况是——那个观察取自同会话早先一次 push **之前**，而那次 push（用户要求推 codeup + GitHub）已经把 tag 带上去了。我把「push 前的观察」当成了现状。

这条更正之所以要写进 Note：若不复核，一个错误事实会以「已取证」的身份进入 ADR。本仓库已有同类先例——ADR-0057 的 Note 专门纠正过「是那一行 `rm -rf` 干的」这个误判，并写明「这一条必须写准，否则会留下一个错误的事故史，把后续维护者的注意力引到错误的防线上」。同一条纪律适用于本条的更正。

## Decision

已在 ADR-0058 固化，要点与实现位置：

1. 仓库根 `release/<version>.sha256` 是**清单唯一入库的家**；`packaging/release/` 是产物的家（不进 git）。两个同名目录分工写进 `release/README.md` 与 `sign-and-dmg.sh` 头部。
2. 清单由 `sign-and-dmg.sh` 的**§7** 在原子就位之后生成（`packaging/sign-and-dmg.sh`），不再依赖 SOP 的人工步骤。
3. 清单带源凭据：`version` / `dmg` / `build` / `source_commit` / `source_dirty` / `profile_snapshot`。
4. `assemble.sh` 的**§6** 在写 `VERSION` 时记录 `SOURCE_COMMIT` 与 `SOURCE_DIRTY`（装配时刻取 HEAD），并加断言 `grep -q '^SOURCE_COMMIT='`；dirty 时当场把未提交改动念出来但不中止。
5. 注释行与哈希同住一个文件——macOS `shasum` 跳过 `#` 行（6.02 实测 `exit 0`），所以清单仍是 `shasum -a 256 -c` 可直接消费的格式。
6. 时序写进 SOP：**构建 → 提交清单 → 打 tag → 发 Release**（`docs/release-process.md` 第 1、2 节重排）。
7. `packaging/scripts/release-publish-guard-test.sh` 新增 **G7** 组（8 项断言）守护上述语义。
8. 2.2.0 的清单为**事后补录**（`release/2.2.0.sha256`），如实标注 `source_reconstructible=no`。

## Alternatives considered

- **乙：订正 SOP、删掉根 `release/`。** 被否决，且它的「低成本」是假的：删目录必须同时删 `.gitignore:73` 的 `!release/**`，否则 `checkGitignoreWhitelist`（`scripts/gates/checks.mjs:41-56`）把 `release/**` 剥成 `release` 后查不到磁盘路径，判「幽灵条目」直接红。更根本的是——乙会把这个状态固定下来，客户手上的字节从此永远无法被仓库认领。
- **只入库哈希、不带源凭据。** 那会得到一份「能证明字节是我们发的、却答不出从哪个提交来」的记录。2.2.0 出事的恰好是后者，所以这一条被否得最干脆。
- **清单与产物一起原子就位。** 做不到：两者分属不同父目录。于是显式选定失败方向——「产物完好、清单缺失」可以接受，「清单描述不存在的产物」不可接受。
- **由 `sign-and-dmg.sh` 取 HEAD 当 `source_commit`。** 否决：源是在**装配**时刻被读走的（`assemble.sh` §0 的 APFS 快照），制 dmg 时再取会记下更晚的提交。用一个更晚的提交去描述更早的字节，是把错误答案写进凭据。
- **纯哈希文件 + 另开 provenance 文件。** 否决：同一件事两个家（ADR-0009），且注释行实测可被 `shasum -c` 容忍，没有拆的理由。
- **dirty 时中止构建。** 本轮不做：升级为硬失败属于门禁职责（ADR-0058 N1），现在就让构建在既有工作流里变红会打乱发布节奏。本轮先保证「记录不撒谎 + 当场告警」。
- **改写 `CHANGELOG`/`PLAN` 里那些截断的哈希散文。** 本轮不做：它们是已发布版本的史料，改写属于独立的编辑决定（ADR-0058 N4）。

## Consequences

**已验证的证据**

`bash packaging/scripts/release-publish-guard-test.sh` —— **37 项断言全通过，退出码 0**（ADR-0057 的 G1–G6 共 29 项 + 新增 G7 共 8 项）。G7 逐项：

| 断言 | 结果 |
| --- | --- |
| 清单已生成（仓库根 `release/<ver>.sha256`） | PASS |
| 清单逐字带出 `source_commit` | PASS |
| 清单逐字带出 `source_dirty=1` | PASS |
| 清单逐字带出 `profile_snapshot` | PASS |
| 清单逐字带出 `build` | PASS |
| 清单哈希 = 产物实际哈希 | PASS |
| 清单可被 `shasum -c` 校验（`#` 注释行被跳过） | PASS |
| 失败版本无清单（不描述不存在的产物） | PASS |

其中「逐字带出」那四项是刻意做强的：合成载荷的 `VERSION` 带了全套源凭据（`deadbeef…` / `1` / `0123456789abcdef` / `20260913-999999`），断言要求清单里出现的正是这些字面值——否则字段会静默退化成 `unknown`，而「清单有 source_commit 这一行」和「清单记对了 source_commit」并不是同一件事。

测试全程沙箱化：`REPO_ROOT` 同样由 `PKG_ROOT/..` 推出，落在临时目录，因此**仓库根 `release/` 也全程未被触碰**。

**在真实产物上取得的证据**

- `bash -n` 语法检查：`sign-and-dmg.sh` OK、`assemble.sh` OK。
- 补录清单对真实产物校验：在 `packaging/release/2.2.0/` 下执行
  `shasum -a 256 -c .../release/2.2.0.sha256` → `DSH-Desktop-LUTE-2.2.0-mac-arm64.dmg: OK`，`exit=0`。
- 补录清单的哈希行与产物内 `SHA256SUMS` **逐字节一致**（`e74fb6d0…4ac86e`）。
- 载荷取证用临时解包目录完成，用后即删（1.2 MB，已确认无残留），未改动任何产物。

**正面**

- 客户手上的字节第一次可被仓库认领。
- tag 第一次同时担保源码与字节——因为清单必须先于 tag 入库。
- 「装配时工作树是否干净」第一次有字段说出，而不是等人事后翻 610 MB 载荷去发现。
- 清单从「人的一步」变成流水线产出（ADR-0056 同一条方法论）。

**负面 / 代价**

- 每次发布多一次提交，是有意保留的摩擦。
- `source_dirty` 判据保守（含未跟踪文件），长期高频开发时会较常为 `1`；误报方向上是安全的。
- 清单与产物无法一起原子就位，接受了「产物完好、清单缺失」这个失败方向。

**后续动作**

- **N1**：把「载荷源码保真」做成门禁（比对 payload 内 `vendor/` 树 vs tag 的树），并把 `source_dirty=1` 升级为硬失败。这道判据才**能**抓到 2.2.0 那件事——哈希抓不到。
- **N2**：2.2.0 的处置未决：补发 2.2.1（从干净提交装配）或维持「不可回溯」标注。
- **N3**：GitHub Releases 缺 v2.2.0，而 README 指向该渠道。
- **N4**：哈希的散文副本宜改为指向清单，而非复述数值。
