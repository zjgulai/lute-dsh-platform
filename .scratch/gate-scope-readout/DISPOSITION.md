# 五项挂起提案 · 处置记录（2026-09-17）

> 起因：上一轮关于「本仓库执行会话所遇 Error 的汇总与深度分析」给出了提案清单，
> 其中五项因父会话正在写同名文件而挂起。本轮逐项取证后处置。
> 本文件只记**处置结论与证据**；被落地的事实（读数、设计、边界）一律留在
> [ADR-0102](../../docs/adr/ADR-0102.md) 与其[决策记录](../../docs/notes/implemented/contract/2026-09-17-gate-scope-is-the-denominator.md) 里。

---

## 一、逐项处置

| 提案 | 处置 | 依据 |
|---|---|---|
| **M1** 判据输出解析必须先证明非空 | **已覆盖，不重复实施** | 框架层已由 QG-001/003/004/005 实现：`gate-result.mjs` 的 `validateGateResult` 断言 `pass requires checked > 0; empty scope cannot pass` 与 `expected = checked + skipped + failed`。实例层：`gates/skill-lines.mjs:123` 空射程判红、`:136-143` 同时认 `ℹ`/`#` 两种 reporter 前缀并把解析失败显式写成「读数缺失，不是通过」 |
| **M2** 判红文案必须点名治本那一侧 | **部分覆盖；可机制化的那一半仍未做**（见 §二） | 实例已存在：`gates/package-files-coverage.test.mjs:248` 有定向断言；`gates/plugin-entry-contract.mjs:666` 的判红文案写明两种可能。但**没有任何机制要求新判据也这么做** |
| **M3** quick 摘要必须声明 full-only 射程 | ✅ **本轮落地** | 见 §二、以及 ADR-0102 决策记录的同日补记 |
| **M4'** 装载点判红与字节漂移分离 | **已覆盖，不重复实施** | `gate.mjs` 的 `profile-bundle-sync` remediation 已区分两种失败：「若报的是『期望集里的包在装载点不存在』，那是安装没落到位而不是字节漂移——先补齐装载点再谈同步」 |
| **C4** P-05 / P-06 补实例 | ⛔ **否决——我上一轮的提案基于对总账规则的误读** | 见 §三 |

---

## 二、本轮真正落地的一项：M3

**缺口是真的**（实测，不是推断）：`node scripts/gate.mjs --list` 有 83 条注册项，
而 `--mode quick` 只跑 76 条。改之前摘要只报 `ok 75/76 项通过（mode=quick；…）`，
**读者无法知道另外 7 条压根没跑**——`76` 是「这次恰好跑了哪些」，不是注册表全量。

这有前科：2026-09-16 的 typecheck 回归（10 处 TS2339 + 6 处测试类型错）正是由
full-only 的 `scripts-runnable` 守着的，那一轮只跑 quick 就声称通过（P-04 的变体）。

改动面（4 个文件）：

- `scripts/gates/gate-result.mjs`：新增 `isCheckActive()` 与 `computeNotCovered()`
  （后者是前者的**严格补集**）；`runGateChecks` / `summarizeGateResults` 接受并透出 `notCovered`。
- `scripts/gate.mjs`：`active` 与 `notCovered` 改用**同一个谓词**推出；文本摘要新增未覆盖行。
- `scripts/gates/gate-result.test.mjs`：新增 6 条（该文件由 `gate-result-selftest` 守着）。
- `scripts/gate.test.mjs`：新增 1 条 CLI 级端到端用例（**不在门禁射程内**，见 §四）。

读数（实跑）：

| 模式 | 摘要 | 守恒 |
|---|---|---|
| `--mode quick` | `ok 75/76 项通过（mode=quick，跳过 1；…）` + `本次未覆盖 7 条（仅 full）：…` | `76 + 7 = 83` ✓ |
| `--mode full` | `ok 82/83 项通过（mode=full，跳过 1；…）`，无未覆盖行 | `83 + 0 = 83` ✓ |

---

## 三、C4 为什么被否决（自我更正）

我上一轮写的是「按 playbook 门槛『同一根因复发过两次 → 补进已有条目』，P-05 补 3 个实例、
P-06 补 3 个实例」。**这句话是把总账的规则读反了。**

总账 `docs/pitfalls-playbook.md` 原文：

- 第 14 行：「**新增一条的门槛**：同一根因**复发过两次**，或第一次的代价大到不允许发生第二次。」
  ——这是**新增条目**的门槛，不是「补进已有条目」。
- 第 3–5 行：「按**根因类**组织——不按日期、不按事件。**事实（哪一次、什么读数、怎么修的）
  一律留在 ADR / Note / SOP 里**；本页只写『模式 + 拦它的机制名 + 指向事实的链接』。」
- 第 17–19 行：「**写作约定（无强制）**：不复述 ADR/Note 里的数字、读数与版本号——
  复述等于给同一条事实再造一个家，改一处漏一处就是 P-07 本身。」

所以往 P-05 / P-06 里灌「哪一次、什么报错」正是该文件明令禁止的写法。
**执行 C4 会亲手制造它要防的那个缺陷。** 否决。

另外两条相关的结构事实（同一轮实测）：

- 总账门禁要求每个条目在「已落地机制」里点名至少一个真实存在的 `gate:<名字>` 或
  `script:<路径>`。因此**没有机制可指的故障无法入账**——这是该账的结构性边界，不是疏漏。
- 那 6 个候选实例各自的正确home：`**/` 提前闭合已在 ROUND-STATUS §11.4 留痕；
  `ℹ` reporter 前缀已作为注释住在 `gates/skill-lines.mjs:136-138`（依赖它的代码旁边）；
  `node -e` / `python3 -c` 一类属 agent 侧写入通道问题（见 §五）。

---

## 四、本轮发现的一个既存缺口（比本次改动大，未处理）

**`scripts/gate.test.mjs` 不在任何门禁的射程内。**

- 每个 `scripts/gates/*.test.mjs` 都有对应的 selftest 注册项，唯独 `scripts/gate.test.mjs` 没有。
- `scripts/gates/` 里所有 `runNodeTestFile(...)` 的靶子逐个核对过，没有它。
- `scripts-runnable` 只管**受管包**的 `typecheck` / `test` / `build`，根包没有这三个脚本，
  因此根包的 `test:gate` 也不在射程内。
- 结论：`gate.test.mjs` 的 9 条 CLI 用例（摘要格式、`--list`、JSON schema、strict、
  根包身份、theme-tokens 收集器、以及本轮新增的射程守恒）**只在 `pnpm run test:gate`
  下跑**，而仓库的验收契约写的是「提交前 `gate`、推送前 `gate:full`」——两者都不跑它。

**没有接进门禁的理由**：该文件跑一次约 4.5 分钟（多条用例各自 spawn 完整门禁），
接进去会让 `quick` 从 ~50s 涨到 ~5min。代价与收益不成比例。
**建议单独立卡**，而不是在本轮顺手接上。

本轮因此把 M3 的**判据逻辑**放在 `scripts/gates/gate-result.mjs`（可导入、且被
`gate-result-selftest` 守着），而不是写在 `gate.mjs` 里——后者导入即执行 `main()`，
住在里面的逻辑没有任何门禁测得到。

---

## 五、仍然未做的（照实登记，不得读成已完成）

| 项 | 状态 | 阻塞/理由 |
|---|---|---|
| **M2 剩余部分**：要求新判据的判红点名治本侧 | 未做 | 可机制化的形态是「每个注册项必须声明非空 `remediation`」。实测 **83/83 已全部声明**，但**没有任何测试断言这件事**——第 84 条可以悄悄不写，而 `gate.mjs` 会静默不打印 `→`（P-08）。做它需要动 `gate.mjs` 的 `--list` 输出（暴露 remediation）或新增注册项 |
| **M5** CALIB 模板成为新判据的门槛 | 未做 | 需要先定义「门槛」的可判定形态；属设计变更 |
| **C2** 一个文件一个写入通道 | 未做 | 无可判据形态。且总账的结构性边界（§三）使它无法入账。候选 home 是 `~/.dsh/AGENTS.md`（跨会话本地约定），**改的是全局文件、影响所有会话**，不宜单方面写入 |
| **M4** 装载点副本改符号链接 | 未做 | R2 架构改动，需立项 |
| **C3** 重试熔断升级为 hard stop | 未做 | 宿主侧 R2/R3，需立项 |
| **§四的 CLI 层门禁覆盖缺口** | 未做 | 见 §四 |

---

## 六、并发写冲突的处置

本轮施工期间父会话（`session-72993437`，执行 `QG-NNN` 卡）**全程在写同一批文件**：
`scripts/gate.mjs`、`docs/pitfalls-playbook.md`、`docs/architecture.md`、`docs/adr/README.md`、
`.scratch/review/…/ROUND-STATUS.md`。

处置方式：

- 只写**我的改动面**，不做任何无关重构；
- 每次写入前重读、写入后立即 grep 复核改动仍在（前三次编辑后各核对一次，均在位）；
- **M2 / M4' 两项因已确认被父会话覆盖而放弃实施**——重复实施会造出「一条事实两个家」（P-07）；
- **不动 `docs/adr/README.md`、不新占 ADR 编号**：最大编号仍是 0102，父会话随时可能取 0103，
  撞号会让 `adr-index` 门禁判红或更糟——同名文件互相覆盖。M3 的留痕因此挂在**已有的**
  ADR-0102 上（同一决策、同一 home），而不是新开一篇。
