---
title: 仓库根层整理（执行 ADR-0013 三档 + 借参照系纪律）
status: ready-for-agent
test_seam: ① 根层条目分类计数（tracked / ignored / untracked 三分，用 git ls-files 与 git check-ignore 判定）② node scripts/gate.mjs --mode full 的退出码 ③ git diff --stat 对受管包的改动面（必须为空）
---

# 仓库根层整理 产品规格

> 本规格来自 2026-09-11 的 grill-me 决策（Q1=③、Q2=②、Q3=① 三项确认）与随后的共同理解摘要确认。
> **本任务不改任何功能**：`packages/` 的 20 个包、`packaging/` 交付链、`dsh-patches/`、`81-Skills/`、`vendor/` 全程不碰。

## Problem Statement

仓库根层有 **79 个条目**，其中只有 **23 个已跟踪**；其余 **47 个被 `.gitignore` 忽略**（git 不管，但磁盘上制造噪音）、**9 个未跟踪**。
而参照系 `vendor/dsh-desktop/deepseek-harness`（pin `a66e470`）的根层是 **46 个条目**，其纪律是
**「根目录只放有明确归属的东西」**：`packages/<域>/<包>`（54 域 / 249 包）、`apps/`（可运行应用）、
`scripts/`（工具）、以及顶层的配置文件与双语文档。它**不设工作树内归档区**。

关键事实：**ADR-0013 已经把这件事决策完了**——三档处置（直接删除 / 归档出工作树 / 纳入版本管理）并明确否决了
「归档保留在工作树内」（备选方案 D）。但**执行从未发生**：`_attic/`（17 项）、`v4-ten-contact-sheet.html`（31M）、
预览 HTML 群、19 个零引用一次性脚本、52 个 `.orig` 备份，全部仍在原地。

所以本任务的真实性质是：**执行一份已确认的决策，并借参照系的纪律补齐它没覆盖的部分**，不是重新决策。

**与参照系的对比实测**

| 维度 | harness | 我方 | 判定 |
| --- | --- | --- | --- |
| 域 / 组 | 54 域 · 249 包 | 5 组 · 20 包 | 结构已同构 ✓ |
| 组级 README | 每域 1 篇 | 5 组齐全（16 行/篇） | 无差距 ✓ |
| 生成式目录墙 | 有 | `docs/catalog/` 由 `gen-catalog.mjs` 生成 | 无差距 ✓ |
| 根层整洁 | 46 项、无游离件 | **79 项：23 tracked + 47 ignored + 9 untracked** | ❌ 主要差距 |
| 双语文档 | `README.md` / `.zh.md` / `.i18n.yaml` | 中文单语（ADR-0009 已决策） | **有意不同，不跟** |
| 笔记/技能家 | `.agents/{notes,skills}` | `docs/notes` + 文档脊柱（ADR-0009） | **有意不同，不跟** |

**耦合点（动手边界，全部实测）**

- `packages/` 下 20 包之间**零 `file:` 互指**；包发现已 100% 走 `packages/`（非该布局的包 = 0）。
- `package-layout.mjs` 的 `GROUP_DIRS` **硬编码五组**——改组名必须同步改它（本任务不改组名）。
- `package-layout.mjs` 的 `TOP_LEVEL_SKIP` **未覆盖** `_attic`/`_tools`/`assets`/`generated`——若其中将来出现
  `package.json` 会被误判为受管包（实测当前均无）。
- `.dsh-types` 被 `scripts/dsh-types.mjs:51` 硬编码为 `OUT_DIR`，且该模块会为每个包建类型链接；移动它需改码并重建链接。
- `dsh-patches/`、`81-Skills/`、`packaging/` 是交付链输入，**必须留在根层**。

## Solution

按 ADR-0013 三档执行，加上参照系纪律补齐的部分；**每一项都以「有明确归属」为唯一判据**。

**G6（前置调查，先于任何处置）**：6 个**已跟踪**且非包的根目录——
`dsh-renderer-heal`、`dsh-skill-title-fix`、`dsh-rootoutlet-heal`、`dsh-reverse-skill-local`、
`explore-unknowns-local`、`write-spec-local`——逐个查清用途（读其内文件 / 最近提交 / 全仓引用），
产出逐项事实结论后再定处置。**这些已入库，移动或删除都是对版本历史的动作，不做猜测。**

**G1 直接删除**（ADR-0013 档①，仅限 0 字节残渣与被取代的零引用脚本）：

- 0 字节/误重定向残渣：`extract.jsnecho`、`Agent`、`restart.shnbash`（45B）、
  `patch-index.mjsnecho`、`patch-toggle.mjsnecho` 等 `*.jsnecho` / `*.jsnnode` / `*.shnbash`。
- 零引用一次性脚本（实测全仓零引用，仅 ADR-0013 文本提及）：`patch.js`、`patch-host.js`、
  `patch-preset-host.js`、`patch-preset-yaml.js`、`patch-ts-types.js`、`patch-ui-css.js`、`patch-ui.js`、
  `fix-ui.js`、`fix-svgs.js`、`test-icon.js`、`apply-card-polish.js`、`generate-avatars.js`、
  `build-*-avatars.js`（5 个）、`build-preview*.js`（2 个）、`verify_skill_split.py`。
- **执行前先产出待删清单交付确认**（ADR-0013 明确要求不可逆操作逐项拍板）。

**G2 归档出工作树**（ADR-0013 档②，落点 `~/project/_archive/Magpie-Horch-<日期>/`，仓库内留一行指向说明）：

- 大体量：`v4-ten-contact-sheet.html`（31M）、`project-management.univer`。
- 预览 HTML 群（13 个 `*.html`：`avatar-preview*.html`、`brand-icons-preview-*.html`、
  `new-kol-icons-preview-*.html`、`desktop-dialog.html`、`profile-create.html`、`recovery.html`、`setup-wizard.html`）。
- 目录：`_attic/`（17 项，含 `app-originals-dsh`、`dsh-chatui-fix-backup` 等）、`_tools/`、`assets/`（31 项）、
  `generated/`、`dist/`（490M）、`dsh-rootoutlet-heal/`（未跟踪）、
  `assets/`（31 项，Vite 构建产物——已核实与 `packaging/assets/` 无重叠）。
- 杂项：`err.txt`、`lark-auth-qr.png`、`.DS_Store`（后者可直接删）。

**G3 纳入版本管理**（ADR-0013 档③）：`52` 个 `.orig` 备份归位。
但**执行前必须核实两件事**（实测已发现）：
① 52 个中 **17 个在 `_attic/`、20 个在 `dsh-patches/archive/`** —— 这些会随 G2 归档或属既有归档位，不应搬进 `docs/`；
② **8 个在 `packaging/staging-src/2.0.0/`** —— 属构建暂存树的副本，随该树处置。
所以 G3 的实际对象是**仓库内其余零散的 `.orig`**（如 `packages/capabilities/dsh-overseas-skills/lib/*.orig`、
`_attic/dsh-overseas-tools/lib/*.orig`），逐一确认后再归位，**不盲目搬 52 个**。

**G4 根级脚本归入 `scripts/`**：G1 未删而仍有价值的脚本移入 `scripts/` 并改为表意名（参照系把工具集中在 `scripts/`）。

**G5 根级文档归入 `docs/`**：`P0-remediation-checklist.md` 与 `_doc-notes/` 的既有内容按
「一份事实只有一个 home」（ADR-0009）并入 `docs/`，重复副本只留一处、其余留链接。

**G7 加固（不动文件）**：`package-layout.mjs` 的 `TOP_LEVEL_SKIP` 补全为「除受管目录与白名单外一律跳过」；
退役其「历史平铺布局」兼容分支（实测非 `packages/` 布局的包 = 0，该分支已无对象）。

## User Stories

1. 作为维护者，我想在 `ls` 仓库根时只看到有明确归属的条目，这样我能一眼判断什么不该在这里。
2. 作为维护者，我想让「磁盘上有但 git 不管」的游离文件归零，因为忽略规则不等于清理——它们仍然拖慢 glob、搜索与打包扫描。
3. 作为维护者，我想在执行任何删除前看到逐项待删清单，因为 ADR-0013 说这些多数未被跟踪、删了不可恢复。
4. 作为维护者，我想让归档离开工作树而不是原地冻结，否则白名单式 `.gitignore` 会继续把它当噪音（ADR-0013 备选 D 已否决该做法）。
5. 作为维护者，我想让归档在仓库外可查（固定落点 + 仓库内一行指向），这样历史资产仍能找回。
6. 作为维护者，我想让已入库的 6 个修复过程目录在被移动前有事实结论（用途 + 是否仍需），这样我不会误删记录。
7. 作为维护者，我想让 `.orig` 备份不再处于「已跟踪却又命中忽略规则」的矛盾状态。
8. 作为审查者，我想用一条命令证明整理没有碰功能：受管包的 diff 为空。
9. 作为审查者，我想在整理前后各跑一次完整门禁，用退出码而不是叙述判断没破坏东西。
10. 作为下一个接手的人，我想在 `package-layout.mjs` 里看到「哪些顶层目录不参与包发现」是完整枚举，而不是靠碰巧没有 `package.json`。
11. 作为维护者，我想让参照系的两处差异（双语文档、`.agents/` 家）保持现状，因为它们是有意决策而非债务。

## Implementation Decisions

### 决策边界（grill-me 已确认）

| # | 决策 | 取值 |
| --- | --- | --- |
| 1 | G6 处置 | **先查清用途再定**（Q1=③），本轮只产出事实结论 |
| 2 | 范围 | ADR-0013 三档 + G4/G5/G7 对齐（Q2=②）；G6 处置不捆入 |
| 3 | 归档落点 | `~/project/_archive/Magpie-Horch-<日期>/`（Q3=①，沿用 ADR-0013） |

### 硬约束

1. **不改功能面**：`packages/` 下 20 个包、`packaging/`、`dsh-patches/`、`81-Skills/`、`vendor/`、
   `scripts/gate.mjs` 既有校验项，全部不改内容。G4 只动**根级**脚本。
2. **删除仅限 ADR-0013 档①**：0 字节/误重定向残渣，与实测零引用的一次性脚本。执行前出待删清单。
3. **归档先复制后校验再删**：确认归档目录内可见且完整后才从工作树移除（不可逆动作的常规纪律）。
4. **`.DS_Store` 直接删**（纯噪音，无需归档）。
5. **G3 逐项确认对象再搬**，不按「52 个」这个数字盲目执行（见 Solution 的三条例外）。
6. **不动** `.dsh-types`、`.dsh-vision-router`、`.dsh-root-brand-preview`、`.loopx`、`.codex`：
   前三个是生成物且已 gitignore（移动需改 `scripts/dsh-types.mjs:51` 并重建链接，收益低风险高），
   后两个是运行态状态目录（LoopX 目标状态与 Codex 运行时）。
7. **不跟参照系的两处差异**：双语文档、`.agents/{notes,skills}` 家——ADR-0009 已决策，属有意不同。

### 顺序（每步可独立验收，失败即停）

1. G6 调查 → 产出逐项事实结论（**等用户据此拍板后才动它们**）。
2. G7 加固（纯代码，无文件移动，最先把边界写死）。
3. G1 待删清单 → 用户确认 → 删除。
4. G2 归档（先复制、校验、再删）+ 仓库内留指向说明。
5. G3 逐项确认 `.orig` 对象 → 归位。
6. G4/G5 归入 `scripts/` 与 `docs/`。
7. 收尾：根层计数复核 + 完整门禁 + 未跟踪/忽略件归零。

## Testing Decisions

- **seam ①（结构收敛）**：根层条目按 `git ls-files` 与 `git check-ignore` 三分计数。
  期望值来自本规格的实测基线：**79 总 = 23 tracked + 47 ignored + 9 untracked**；
  收敛判据是 **ignored 与 untracked 的游离件归零**，tracked 项只减不增（少的是 G6 按结论处置的那些）。
- **seam ②（不改功能）**：`node scripts/gate.mjs --mode full` 的退出码（期望 0，14/15 项可因新增而变，以实际清单为准）。
- **seam ③（包未被动）**：`git diff --stat -- packages/ packaging/ dsh-patches/ 81-Skills/ vendor/` **必须为空**。
  这是本任务最重要的一条断言——「不影响任何功能」需要机器证据，不能靠叙述。
- **先例沿用**：文档链接可达性沿用既有 `resolveDocLink` 归一化规则（G5 会搬 md，链接必须复验）。
- **负向用例必须存在**：人为在根层放一个游离文件，断言 seam ① 的计数会如实变化——
  证明该计数不是恒定的、能真的发现游离件。
- **不做**：不为每个被移动文件写断言（会退化成清单副本）；不引入新测试框架。
- **最终验收**：三条 seam 全绿 + 贴出真实命令输出；归档落点用 `ls` 复核可查。

## Out of Scope

- 不改 `packages/` 下任何包的内容与 `package.json`；不改包分组名与 `GROUP_DIRS`。
- 不动 `packaging/`、`dsh-patches/`、`81-Skills/`、`vendor/`、`docs/` 既有内容（G5 只做归入与去重）。
- 不动 `.dsh-types` / `.dsh-vision-router` / `.dsh-root-brand-preview` / `.loopx` / `.codex`。
- 不跟参照系的双语文档与 `.agents/{notes,skills}` 形态（ADR-0009 已决策）。
- 不引入 `apps/` 形态改造（我方无可运行应用，`packaging/` 承担交付）。
- 不重写 git 历史；不删除已跟踪文件（G6 除外，且须用户先拍板）。
- 不动 A3（签名守卫）与 B 阶段（出 dmg）——那是另一条线，本次整理完成后另行继续。
- 不处理 `packaging/staging/`（11G）与 `_attic/` 之外的构建产物清理（属交付链范畴）。

## Further Notes

- **与 ADR-0013 的关系**：本规格是它的**执行计划**，不重新论证其结论。三档映射：
  档①→G1、档②→G2、档③→G3（含三条例外修正）。备选方案 A/B/D 的否决理由照旧有效。
- **一处需要如实登记的判断**：`.gitignore` 是白名单式，所以「被忽略」与「不存在」在 git 视角下不可区分——
  这正是 47 个游离件长期存活的原因。本任务在物理层清理，**不改 `.gitignore` 策略**（改策略会让 47 项变成
  未跟踪件出现在 `git status` 里，反而更吵）。
- **已核验并修正的一处风险**：我原先担心 `assets/`（31 项）被 `packaging/` 的品牌链引用——**实测不成立**。
  根层 `assets/` 是**构建产物**（Vite 输出的 `*.js` / `*.js.map` / `*.css` / `.woff2` 字体），
  而 `assemble.sh:115` 要的是 `$PKG_ROOT/assets/app-icon.icns` 即 `packaging/assets/app-icon.icns`（只含图标，两者无重叠）。
  全仓引用检索仅 1 处命中（`81-Skills/Skill创建器/references/best-practices.md` 讲技能包约定的通用示例，与根层无关）。
  故 `assets/` 按 G2 归档，**不需要**改归入 `packaging/`。
- **已知缺口（本轮不做）**：`package-layout.mjs` 的 `TOP_LEVEL_SKIP` 只是补全，未改为「白名单式」正向枚举——
  后者更彻底但会改包发现语义，需单独论证。
