---
title: 2.5.0 收口：债务清场与发布收敛执行计划
status: in-progress
date: 2026-09-18
---

# 2.5.0 收口：债务清场与发布收敛执行计划

> 本文是 2026-09-18 MECE 深查（bug / 文档债务 / 工程债务 / 无用垃圾 / 深耦合 / 无用代码 / 无用备份）
> 的**统筹执行计划**。决策依据是 ADR-0121（对象库卫生）、
> ADR-0122（决策账本）、ADR-0123（收口次序与清场射程）——这三篇尚未入库，
> 故此处不写成相对链接（写了在检出提交的树上就是坏链，见门禁 docs-link-integrity）。
> 行为与发布契约的权威来源是 ADR 与 `docs/sop/dmg-release.md`；本文只负责**执行顺序与出口判据**。
> 目标状态：**装机字节 = tag 字节 = CHANGELOG 条目 = DMG 清单**（ADR-0057 / ADR-0058）。

## 0. 目标与非目标

**目标**：把仓库收敛到「可支撑二次开发的干净基线」——依赖图能表达实际边、每条静默路径都有会变红的镜子、出货链四者一致。

**非目标（本轮明确不做）**：

- 不重写 git 历史（`filter-repo` / force push 双远端）。ADR-0123 决策 3 定的次序是「先清债、再定版本号」，历史重写是独立立项。
- 不删除任何**已发布产物**（`packaging/release/<版本>/` 与仓库外归档）。ADR-0067 用户裁决 + `uchg` + `release-artifacts-intact` 门禁三重保护。
- 不给 121 篇历史 ADR 反向补机器可读决策块（ADR-0122 备选方案甲：伪造留痕）。
- 不改 `vendor/`（pin 只读参照，ADR-0008）。

## 1. 决策记录（F1–F12 的落位）

| # | 决策点 | 落位 | 依据 |
| --- | --- | --- | --- |
| F1 | 2.5.0 怎么收口 | **C：先清债、再定版本号**。清债完成前不重打同号、不升号、不打 tag | ADR-0123 决策 3；重打同号违反 ADR-0057 决策 6 |
| F2 | 发布产物归档家 | **已结案**：`~/Library/Application Support/LUTE/releases/`（`LUTE_RELEASES_ARCHIVE` 可覆盖），ADR-0067 决策 1 指定，实测存在且满员 | ADR-0067 |
| F3 | `.git` 体积 | **已执行**：定点移除 garbage pack + 含活凭证的 6.8 GB blob + 518 个 codex 独有 loose 对象。3.9 G → 80 M | ADR-0121 |
| F4 | `pitfalls-playbook.md` mode 000 | **已澄清为瞬态**：另一会话 `tmp+mv` 写入窗口态，终态 644。全仓 mode 000 实测 0 个 | ADR-0123 决策 5 |
| F5 | PR CI 跑不跑改动包测试 | 未决 → 候选方案见 §4 批 2 | — |
| F6 | `lib/`↔`src/` 字节一致性升为门禁 | **射程已重估**（原文有误，见 §5 未决 1） | — |
| F7 | 两个 legacy 生成器表态 | 未决 → §4 批 2 | — |
| F8 | `docs/notes/` class 词汇表收敛方向 | 建议 A（改 ADR-0015 声明追上事实 + 补门禁），未执行 | ADR-0015 背景已记录 |
| F9 | 根 `package.json` 的 version 是否跟随出货版本 | 未决（未核对打包链是否读该字段） | — |
| F10 | `lint-preset.mjs` 双份 | 建议 B（保留双份 + 逐字节比对门禁，与 `profile-files-sync` 同型），未执行 | — |
| F11 | `theme-tokens` 射程扩不扩到无 `src` 的包 | **执行 A（扩），原「建议 B」被证据推翻**——见 §7。不扩就等于接受 3 个幻觉 token 永远不被判 | P-41 实例④ |
| F12 | 无用备份清到什么程度 | 部分执行（对象库）；仓库外条目待逐条确认，见 §3 可删清单 | ADR-0123 决策 2 |

## 2. 现状读数（基线，2026-09-18 02:30 前后实测）

| 读数 | 值 | 命令 |
| --- | --- | --- |
| `.git` 体积 | **80 M**（原 3.9 G） | `du -sh .git` |
| 对象库 | loose 1370 / 15.26 MiB；in-pack 7840；packs 2 / 66.04 MiB；garbage 0 | `git count-objects -v` |
| 工作树未提交 | 31 M + 18 ?? + 2 D（含另一会话在飞的改动） | `git status --porcelain` |
| HEAD | `ac625fd`；2.5.0 DMG 的 `source_commit=605a159` → **落后 4 个提交** | `git log --oneline -1` / `release/*.sha256` |
| `v2.5.0` tag | **不存在**；根 `CHANGELOG.md` 里 2.5.0 **零命中**（最新停在 2.4.1） | `git tag -l 'v2.5*'` / `grep` |
| ADR | 123 篇，索引 123 行，编号连续；机器可读决策 2 篇（ADR-0122/0123）、豁免 121 篇、11 条 decision | `node scripts/gates/adr-agent-records.mjs` |
| 门禁 | 判据总数 100（quick/full 同数），full-only 8 项 | `scripts/gate.mjs` |

**出货链四者当前互不相同**：装机字节（2.5.0 DMG，源 `605a159`）≠ 仓库 HEAD（`ac625fd`）≠ 变更记录（无 2.5.0 段）≠ tag（不存在）。这是本轮第一优先级的收敛对象。

## 3. 清场射程三分（ADR-0123 决策 2）

### 3.1 受保护——不动

| 对象 | 保护来源 |
| --- | --- |
| `packaging/release/<版本>/` 9 个 DMG（约 5.7 GB，`uchg` 锁定） | ADR-0067 决策 2/3；`release-artifacts-intact` 判据（目录在、dmg 不在 → FAIL） |
| `~/Library/Application Support/LUTE/releases/`（11 个目录，约 6.7 GB） | ADR-0067 决策 1（仓库外归档） |
| `packaging/release/.archive/`（3 个留档 DMG，含**仓库外没有的** 2.3.2 取代版 640,444,432 B） | ADR-0067 决策 6「永不复用、永不删除」 |
| `.dsh-types/`（24 处引用 + 专有门禁）、`dsh-rootoutlet-heal/`（白屏手册 §6.1 回滚基线）、`.dsh-root-brand-preview/`、`.ua/` | 审计 B 已核对 |
| `dsh-patches/archive/**` 的 `.orig` | 测试真值（`official-artifacts.ts:24`） |
| `packages/*/lib/`（已入库的 3 个包：theme-local 3 / browser-local 50 / deepresearch-local 89） | 出货面 |

### 3.2 需先证明——删前必须逐字节证明盘外有同一副本

- 任何**体积型二进制**（> 50 MiB）。
- 任何「**只在对象库存在**」的路径。教训：2026-09-18 删 codex ref 前若不先查这一条，会连带毁掉 `dsh-overseas-skills/check-fragment.py`（4156 B，磁盘没有、git 未跟踪、只在对象库里；已救回并逐字节验证 `5d11147e…`）。
- `packaging/release/.archive/2.3.2-20260913-151311/`（640,444,432 B，**仓库外归档家里没有对应副本**）——若要归位，先 `cp` 到归档家再核哈希，**不是删除**。

### 3.3 可删——纯产物/备份，删前只需确认无引用

| # | 条目 | 量 | 备注 |
| --- | --- | --- | --- |
| C1 | 对象库垃圾包 | 716.63 MiB | **已执行**（ADR-0121） |
| C2 | `~/.dsh/logs` + 应用 logs | 274 MB | 建议等 B1（技能注册表洪泛）修完再删，日志是它的取证面 |
| C3 | `~/.dsh/profiles/desktop/*.bak-*` / `.orig` | 33 个 | 逐条确认后再删 |
| C4 | `~/.dsh/profiles/desktop.pre-lute-20260914-131827/` | 721 MB | 4 天前的整档；**与制品回滚基线同类，删除需你点头** |
| C5 | `~/.dsh/settings.yaml.bak-*` + `aeis-venv.pre-*` | 8 + 5 | 同上 |
| C6 | 根级散落：`.DS_Store`、`package-lock.json`（pnpm 项目里的 npm 锁）、`crib-seo-drift-plan.md`（未入库、零引用）、`packaging/assemble.sh.200.bak` | 小 | `doc/`（单数整站）删时必须同时删 `.gitignore:24` 的 `!doc/**`，否则 `gitignore-whitelist` 拒幽灵条目 |
| C7 | `packages/capabilities/dsh-browser-local/coverage/` 18 个**已入库**产物 | 小 | 每次跑测试都改写入库文件 |
| C8 | 幽灵目录 `packages/capabilities/dsh-memory-local/`（只剩 `node_modules/`，无 `package.json`） | 小 | 受管包实为 25 个不是 26 |

## 4. 批次执行计划

| 批 | 动作 | 前置 | 出口判据 | 状态 |
| --- | --- | --- | --- | --- |
| **批 0** | 并发锁与收口：等另一会话停机 → 100 项判据一次性落盘（**新判据必须与 `scripts/gate.mjs` 同一次提交**，否则 checkout 即断）→ 复跑门禁取稳定终值 | ADR-0123 决策 4 的三项读数 | `pnpm run gate` 在无人写入时 `failed=0` | **阻塞**（另一会话 02:28 仍在写 `shared/client/sidebar-entry-core.ts`） |
| **批 1** | 清场：按 §3.3 逐条处置；`~/.dsh` 侧条目需你逐条确认 | ADR-0123 决策 2 的「先查承诺、再查引用、最后查体积」 | 磁盘读数下降且**门禁不回退** | 部分完成（对象库已回收 3.7 G） |
| **批 2** | 补镜子（把静默路径变成会红的判据） | 批 1 或并行 | 每条新判据都有反向自测，且能对「应该判红」的状态判红 | 进行中（ADR-0121、ADR-0122 两条已落地） |
| **批 3** | 解耦：跨包 `../../` 穿透、平台路径两个家（`lint-preset.mjs:34` 硬编码 vs `scripts/lib/app-resources.mjs` 自称唯一家）、`yaml` 未声明、3 个包缺失 peer、`cordis` 版本偏斜、`contract-gate.js` 未进 `files` | 批 2 绿 | 依赖图能表达实际边 | 未开始 |
| **批 4** | 定版打包：定版本号 → 补根 `CHANGELOG.md` 的 2.5.0 段 → 重装配 → `sign-and-dmg.sh` → T-11 DMG 换装 → `gate:full` → 实况探针现场证据 → tag → push 双远端 → GH Release | 批 0–3 全绿 + ADR-0123 决策 3 | 装机字节 = tag 字节 = CHANGELOG 条目 = DMG 清单 | 未开始 |

**批 4 的次序修正**：**先补 CHANGELOG 再 tag**。根 `CHANGELOG.md` 里没有 2.5.0，而门禁 `changelog-release-sections` 要求「已发布版本必须有段」——先 tag 会让门禁在 tag 那一刻判红。

### 批 2 的候选项（每条都需要先量现状再决定阈值）

| 候选判据 | 针对的形态 | 现状 |
| --- | --- | --- |
| `lib` 与 `src` 的一致性 | 改了 `src` 忘 build → 装载点跑旧字节、门禁全绿 | 射程需重估，见 §5 未决 1 |
| `lint-preset.mjs` 双份逐字节比对 | 两份同 sha256、手工同步、无判据 → 改一份不改另一份静默判绿（P-08 原形） | 两份同 sha256 `eff2d6ad…`；`pipeline.sh:46` 按 `dsh-patches/` 那份调 |
| PR CI 的测试射程 | `gate.yml:121` 的 full job 是 `if: github.event_name != 'pull_request'` → PR 上一个包测试都不跑 | 未决 |
| `theme-tokens` 射程空洞 | 射程写死 `packages/*/*/src`，对无 `src` 的包**静默返回空** → 整个包不在射程内，而空射程与「全合规」同形 | **已修**（2026-09-18，见 §7）：射程按包的实际形态分流，引用侧与声明侧对齐；8 条自测 + 3 条突变验证 |
| `assemble.sh` 排除 `.DS_Store` | `assemble.sh:325` 的 rsync 没排除 | 未执行 |
| 技能 provider 的「单文件失败不停整段」 | 一个不可读文件 = 整段 provider 停（P-37 新位置） | 未执行 |
| `docs/notes` class 词汇表 | ADR-0015 声明的 6 类 vs 实测 7 类，5 类共 91 篇（74.6%）不在声明里，无门禁 | 未决（F8） |

## 5. 未决与 Unknown（诚实清单）

1. **`lib/` 的重建点在哪？** 实测 `packaging/assemble.sh` **从不构建 `packages/*/lib`**（它只跑 `yarn workspace dsh-plugin-desktop package:dir` 构建 app）；profile 用 `file:./vendor/packages/...` 引用装载点副本；`packages/*/lib` 中只有 3 个包入库、7 个未入库。因此「改 `src` 忘 build 会不会出货旧字节」取决于装载点副本怎么产生——**根因未定，故不立判据**。已确认的读数：10 个包有 `src`+`lib`+`build`，其中 80 条 `sourcesContent` 落在包内 `src/`，**当前 1 条漂移**（`dsh-newapp-local/src/client/sidebar-entry.ts`，02:31 前后波动，属另一会话在飞状态）。
2. **B1 的胜出源是谁**：`~/.dsh/skills` 里 1806 个技能中 1805 个每次扫描被判重丢弃（仅 `kami` 胜出），今日 host 日志 66,490 条 W。`DSH_BUNDLED_SKILL_DIR` 未能从进程环境读出（`pgrep -f "Contents/MacOS/DSH Desktop"` 返回空——`dead-instruments.json` 里已登记的那台盲仪器，改用 `ps -Ao` 才拿到 pid）。
3. **CI full job 在干净 runner 上能否真跑绿**：lockfile 的 `importers:` 只有根一项、无 `pnpm-workspace.yaml`、`node_modules` 未入库；ADR-0055:125 记过干净 checkout 需逐包 `pnpm install`。
4. **凭证是否曾推远端**：ADR-0121 的判定依据（从未离开本机 + 不可达自任何 ref）**是推论不是读数**——`git ls-remote` 两端都要凭据。因此「是否曾推远端」仍是 Unknown，已如实登记。
5. **118 篇 ADR 里哪些实际已无引用**：全仓扫描两次 60s 超时。
6. **`gen_bmg_preset.mjs` 的实际产出是否合法**：它有顶层 `mkdirSync`，跑一次就写盘，未授权执行。
7. **`dsh-team-hub` 会话持久化的真实落盘路径**：直接关系到三处零引用函数（X3）能不能删。
8. **`machine-path-baseline` 那 4 条可下调项**：权威读数只能在装配时由 `scan-machine-paths.mjs --root $BUNDLED` 给出。

## 6. 门禁终值的取证纪律

门禁终值只在**无并发写入**时取，且随终值一起记录取证时刻。并发下的红灯标为「并发假红」，**不计入绿**，也**不得因它是假的就记成通过**（ADR-0123 决策 5）。

已知一处对并发敏感：`repo-attest-selftest` 断言「门禁运行期间仓库零差异」。2026-09-18 实测：01:18 与 01:32 两次 `pnpm run gate` 分别读到 `failed=3` 与 `failed=1`，同一份代码给出不同终值；红的根因是另一会话在运行窗口内往 `.scratch/` 新建文件。它断言的是**环境**而非**代码**，需单独立项重新设计——本计划不假装解决它。

## 7. 批 2 执行记录 · `theme-tokens` 射程（2026-09-18 03:0x–03:5x）

### 7.1 F11 的原建议被证据推翻

原建议 B 是「不扩射程，只把『本次 N 个包未纳入射程』打印进读数」。立这个建议时**没有量过**那 N 个包里到底有没有东西。量了之后结论相反：

| 读数 | 值 | 命令 |
| --- | --- | --- |
| 无 `src` 的受管包 | **14 个** | `for d in packages/*/*/; do [ -d "$d/src" ] \|\| echo $d; done` |
| 其中在 `lib/` 里引用平台 token 的 | **5 个** | 逐包 grep `var(--(dsw\|ds\|dsh)-` |
| 射程扩大后暴露的**幻觉 token** | **3 个** | `checkThemeTokens()` 对照 396 个官方 token |

三条都是「写了字面兜底所以页面上看不出问题、只是不随主题变化」——与基线里那 7 条旧违规**同一个失效方式**。不扩射程等于接受它们永远不被判。

- `--dsw-alias-state-warning-primary` @ `dsh-overseas-skills/lib/client.js:104` —— **错别字**：官方 state 族是 `warn` 不是 `warning`，**同一个文件**另外两处（`.ovsToolGap` / `.ovpTag`）写的都是正确的 `-warn-primary`。
- `--dsw-alias-label-on-accent` @ `dsh-task-board-local/lib/client.js:169` —— 官方 label 族 9 个成员里没有 `on-accent`（`-on-` 段在全平台 396 个 token 里一次都不出现）。
- `--dsh-layer-drawer` @ `dsh-wanzh-hulian/lib/client.js:93` —— 平台没有它、仓库也没有谁定义它；官方 layer 族只有 `--dsw-alias-bg-layer-1/2/3`（背景层配色，不是层叠序）。

### 7.2 改了什么

三条全部**修在源头**（没有一条登记进基线，因为基线不该为射程扩大而增长）：

| 文件 | 改法 | 依据 |
| --- | --- | --- |
| `dsh-overseas-skills/lib/client.js` | `-warning-primary, #b26a00` → `-warn-primary`（去掉兜底） | 同文件另两处已是正确名；官方值为 `var(--dsw-static-amber-500)`，与兜底 `#b26a00` 同色系。**这是行为变化**：该徽标从固定色变为随主题 |
| `dsh-task-board-local/lib/client.js` | `--dsw-alias-label-on-accent, #fff` → `--dsw-alias-label-primary-inverted` | 该元素背景是 warn(琥珀) **或** error(红)（下一行有 destructive 覆盖），故不能用 state-specific 名；官方该 token = 浅色主题 `neutral-bluish-00` / 深色主题 `neutral-bluish-800`，与兜底 `#fff` 语义一致，官方自己的 `Toast.module.css` 也是用它配强调底 |
| `dsh-wanzh-hulian/lib/client.js` + 其 `test/client.visual-contract.spec.mjs` | `z-index:var(--dsh-layer-drawer, 2147480000)` → `z-index:2147480000`；测试正则从抓 `var(...)` 兜底改为抓字面值 | 该值是**契约**（必须小于 settings shell 的 `2147483001/2147483002`），与被 `var()` 包着无关。基线里 `--dsw-alias-radius-*` 的处置同此 |

`packages/*/lib/` 里这三处**就是源头**（三个包都没有 `src/`、没有 build 脚本），不是生成物。

### 7.3 判据侧：射程按包的实际形态分流，且两侧对齐

`walk()` 原先硬编码跳过 `lib`，`collectReferencedTokens` 又以 `src` 为根——两条叠加，无 `src` 的包**整包零读数**。改法：

- `SKIP_UNDER_SRC` / `SKIP_UNDER_LIB` 两个跳过集，`walk(dir, out, skip)` 显式传入；
- 引用侧：`existsSync(srcDir) ? walk(srcDir) : walk(lib, [], SKIP_UNDER_LIB)`；
- **声明侧（`defaultListSourceFiles`）同规则对齐**——只改引用侧会造出「引用被收下、声明看不见」的不对称，同包声明+同包引用当场被判成幻觉 token（假红）。这条例外是实测出来的：`dsh-my-quotes/lib/client.js` 声明 `--dsh-scrollbar-thumb-hover` 并在同处引用它。

**射程读数**：引用 token 76 → 90。

### 7.4 验证（全部实跑）

| 项 | 结果 |
| --- | --- |
| `node --test scripts/gates/theme-tokens.test.mjs` | **8/8 pass**（新增 3 条：无 `src` 包必须在射程内、有 `src` 包不得重复扫 `lib`、声明侧射程必须对齐） |
| 突变 M1：引用侧改回只扫 `src` | 第 6 条**判红** ✅ |
| 突变 M2：改成 `src`+`lib` 全扫（过度修法） | 第 7 条**判红** ✅（既有第 1 条同时红——重复扫 `lib` 会造假红） |
| 突变 M3：声明侧改回只扫 `src` | 第 8 条**判红** ✅ |
| `dsh-task-board-local` 定向测试 | 8/8 pass |
| `dsh-wanzh-hulian` 定向测试 | 18/18 pass |
| `dsh-overseas-skills` 契约测试 | 30/30 pass |
| `checkThemeTokens()` 复测 | 3 条已消失，剩 2 条**均非本次引入**（下表） |

**残留 2 条（并发在飞，非本次改动引入）**——用「旧射程 src-only vs 新射程 src+lib」对照跑过，两条在**旧射程下就已存在**：

- `--dsw-alias-label-inverse` @ `dsh-theme-local/src/client/studio.css`（该文件在 `git status` 里是 ` M`）
- 基线条目 `--dsw-alias-separator-primary` 已不再被引用（`dsh-root-brand-local` 有 10 个文件在 ` M`）

### 7.5 未做（诚实清单）

1. **基线的「只减不增」至今没有机制**。`theme-tokens-baseline.json` 的这条纪律只写在判据注释与 `gate.mjs` 的 remediation 文字里，**没有** `exemptions-frozen` 那样的 HEAD 比对判据。任何人往基线里加条目都无人拦。本次刻意**没有**新增基线条目，正是为了不掩盖这个缺口——补机制是独立一项。
2. **`collectRepoDefinedTokens` 仍以 `src` 为根**（第 209 行）。未改的理由：它收集的是「本仓库作为**供给方**」的映射键（`"--dsw-x": v`），而 14 个无 `src` 的包都是消费方，当前无差异。
3. **`sync-shared.mjs:66` 同型但非缺陷**：它 `existsSync(srcDir)` 后**显式 `continue`**，跳过有理由（那类包不参与共享层生成）。已写进 P-41 作为「显式跳过 ≠ 静默返回空」的对照。

## 8. 批 2 执行记录 · `changed-packages-selftest` 的假红（2026-09-18 03:5x）

**不是并发假红**——这一点推翻了本轮早先的判断（当时把它归成「环境，非代码」）。它是**判据自身的洞**，而且**只要工作树里存在任何未提交的重命名就必红**。

| 环节 | 实况 |
| --- | --- |
| 报错 | `这些路径在 git status 里，却没进解析器的账目`，点名 `…dsh-role-matrix-local/tests/sidebar-entry-split.spec.ts` |
| 期望集 | 从 `git status --porcelain=v1 -z` 独立解析，对 rename 条目**新旧两端都收**（`expected.add(entry.slice(3))` + `fields[index+1]`） |
| 实际集 | `for (…) actual.add(entry.to)` —— **只收 `to`，漏了 `from`** |
| 解析器 | `for (const path of new Set([entry.from, entry.to]))` —— **两端都收了** |

**证明**（直接调解析器，不靠推理）：`buckets.staged` 里该条目是
`status=R from=…sidebar-entry-split.spec.ts to=…sidebar-entry-stacked.spec.ts`，**两端都在账目里**。
所以解析器没有丢路径，是**断言只对了账一半**。

**为什么这条值得单列**：它报的错误指向一个**不存在的缺陷**，而它亮着的时候，真缺陷（解析器**确实**丢路径）反而无人看——这条判据存在的唯一理由正是拦后者。这是 P-42 的第三例，已登记进总账。

**改动**：`scripts/gates/changed-packages.test.mjs` 的对账循环两侧都收（`to` 与 `from` 各收一次，空值跳过）。

**验证**：

| 项 | 结果 |
| --- | --- |
| `node --test scripts/gates/changed-packages.test.mjs` | **20/20 pass**（修前 19/20） |
| 突变 M4：让解析器真的丢掉 `entry.from` | **2 条同时判红**——L2 对账 + 既有的「rename 必须同时映射旧包与新包」；恢复后 20/20 ✅ |

突变同时打红既有用例，说明修完**没有**把它变成恒真桩。
