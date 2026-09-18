# 决策记录 · 交付白名单（files）相对运行时模块图的完整性

- 日期：2026-09-16
- 生命周期：implemented
- 类别：contract
- 对应 ADR：[ADR-0101](../../../adr/ADR-0101.md)
- 任务卡：`QG-013`（`2026-09-15-product-execution-plan` 第 02 工作流，2026-09-16 补立卡）

## Problem

`dsh-wanzh-hulian` 的 `package.json` `files` 清单漏了 `lib/atomic-store.js` 与
`lib/oauth-flow.js`——而 `lib/index.js` 正在 import 这两个文件（SEC-RT-006/007 新增的模块）。
这是 P-24 的**第二次**复发，而既有机制当时**全绿**：

- `gate:profile-files-sync` 只对 `files` 清单里声明过的文件说话，清单外的文件它根本不看；
- `gate:profile-bundle-sync` 判的是「装载点上缺不缺、字节一致不一致」，而装载点当时**有**这两个文件
  （上一批手工 `--apply --loadpoint` 补过）。

两项都只问「装载点上现在有什么」，没有任何一项问「按清单物化之后还会有什么」。
**机制守住了症状，没守住根因。** P-24 的条目里已经把这件事写成「仍然未落地的机制」，
本卡就是把它落地。

真正的影响面比「发布少一个文件」大得多。立项前先做了一次判别实验（真实 `pnpm`，隔离临时根）：

- 一个 `files: ["lib/a.js"]` 的包，用 `file:` 依赖安装后，`node_modules/<pkg>/lib/` 里**只有 `a.js`**；
  未声明的 `lib/b.js` 与顶层 `undeclared.txt` 都不出现；
- `npm pack --dry-run --json` 对同一 fixture 给出同一集合。

即 **`pnpm` 对 `file:` 依赖遵守 `files` 白名单**：受影响的不是「发布出去少一个文件」，
而是**本机装载点的全新安装**——而全新安装路径上没有任何同步步骤可以补救，
症状就是宿主以 `ERR_MODULE_NOT_FOUND` 进恢复模式。

## Decision

新增门禁 `package-files-coverage`（判据实现 `scripts/gates/package-files-coverage.mjs`，
自测 `scripts/gates/package-files-coverage.test.mjs`），断言：

> 包里**运行时模块图**上的每一个文件，都落在该包 `files` 白名单射程内。

判据面 = **从声明入口出发的静态可达闭包**：

- 种子：`main`、`exports` 的每个字符串叶子、`bin` 的每个目标、`dsh.bundle.patch`；
- 扩展：静态相对 `import` / re-export / `require('./x')` / 字面量 `import('./x')`，
  以及字面量 `new URL('./x', import.meta.url)`。

四条附带的具体决定：

1. **判据面刻意不做成「`lib/` 顶层所有 bundle」。** 第一版照搬了 `loadPointFiles()`
   的那条规则，第一次跑就在 `dsh-paper2skills` 上报了 5 个文件（`lib/axis.js` 等）。
   核实后是**仪器假红**：那 5 个是包内 `scripts/`、`test/` 用的开发期模块，包没有 `main`、
   没有 `dsh` 字段、也不是任何 profile 的 `file:` 依赖。`loadPointFiles()` 那条规则在
   `profile-bundle-sync` 里是对的（它要的是「装载点上哪些文件必须字节一致」，宁可过宽），
   搬到「白名单是否漏件」上就过宽了——**同一份规则在两个目的下不是同一个判据**。
   判据面之外、`lib/` 顶层的 bundle 作为**读数**进 `note`，不判红也不判 skip。
2. **判定器与真实 `npm pack` 全等，不由自己发明 glob 语义。** `files` 的射程判定只实现
   本仓库实际出现的形态，并以真实 `npm pack --dry-run --json --ignore-scripts` 对**全部**
   受管包逐文件校准（不是抽样）。校准在测试里跑，门禁本身保持不联网、不 shell 出外部工具。
3. **不能把「不适用」写成「跳过」或「判红」。** 没有 `files` 白名单的包不存在「被白名单漏掉」
   这一失效模式；唯一能把运行时文件挡在交付之外的是 ignore 文件，所以只回答那一个问题：
   核对 ignore 文件（窄子集，遇到未建模形态 fail-closed 成类型化 skip）能否命中任何运行时文件。
   命中不了 → 进 `note` 的读数；可能命中或形态未建模 → 类型化 skip。**不写成 skipped**
   是因为那会把 `gate:strict` 永久拖红，而永久红灯的噪声最终会让真信号一起被忽略。
4. **`main`/README/LICENSE 永远被打包，因而不算漏项**（npm 的 always-included 规则，实测确认）。
   这是避免假红，不是放宽判据。

## Alternatives considered

- **把判据塞进 `QG-004`（profile sync 覆盖率）**：拒绝。QG-004 从 **profile 侧**量
  「比了几个包」，本项从**交付清单侧**量「白名单漏没漏运行时文件」，两者互补不重叠，
  而且本项不需要 profile 存在、不读 `$HOME`。混在一张卡里会让「profile 不存在就 skip」
  把一条与 profile 无关的判据一起跳过。
- **判据面取「`lib/` 顶层所有 bundle」**（第一版）：被 `dsh-paper2skills` 的真实假红否决。
  详见 Decision 第 1 条；这条路会让门禁一上线就背着一个豁免，而豁免是判据腐烂的起点。
- **在门禁里直接调 `npm pack`**：判据不联网、不依赖外部工具的约定（
  `dependency-reproducibility` 明确写着「只解析已提交的文本，不 shell 出 pnpm、不联网」）
  优先于实现的省事。代价是判定器要自己实现 glob 射程——由校准测试补上这一环。
- **自己实现完整 gitignore 语义**：拒绝。锚定、`**`、取反、目录态、嵌套作用域、先后顺序
  是一整块需要独立校准的规则面，本项的目标不是重建它。窄子集 + 未建模形态 fail-closed，
  已经能把「没建模」与「建模了且没命中」分开。
- **把可达闭包之外的 `lib/` bundle 判红**：拒绝（假红），也拒绝判成 skip（永久红灯）。
  机器分不出「开发期模块」与「约定装载的运行时模块」，所以只报读数。

## Consequences

- 交付白名单漏件在**提交前**判红，判红信息点名包与文件，并明确把人引向「加进 `files`」
  而不是「去补装载点」。
- P-24 里那句「仍然未落地的机制」可以被替换为一个真实存在的门禁名。
- 已知**未建模**的残留：用变量拼路径去读的包内数据文件（如 `join(PKG_ROOT, 'data')`）
  本项看不见。这类引用无法可靠静态解析；当前仓库里此类文件都在 `files` 里有声明，
  因此不影响结论，但这是本项的边界，不是它的保证——写在模块注释里而不是留给读者推断。
- 判据面之外、`lib/` 顶层的 bundle 会被列进 `note`（当前只有 `dsh-paper2skills` 的 5 个）。
  它们是开发期模块这一判断来自人工核实，不是机器判据；将来若其中一个变成运行时模块，
  要么被入口闭包纳入（自动判红），要么只能靠这份读数被人看见。
- 校准测试依赖本机 `npm` 与 `pnpm`：两者不可用时**显式 skip 并说明「没有校准任何东西」**，
  不静默通过。
