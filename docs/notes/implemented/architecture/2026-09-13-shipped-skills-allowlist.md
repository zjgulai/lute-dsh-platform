# 技能出货面：引用集之外补一份产品级白名单（ADR-0074）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0074](../../../adr/ADR-0074.md)。
> 前一条（预设出货面改白名单）见 [ADR-0073](2026-09-13-shipped-preset-scope-and-payload-guard.md)。

## Problem

### 触发条件：前一条修完，掉出 15 个技能

ADR-0073 把本机自有的机器人助理智能体预设 `bobo-cto` 排除出出货面，重切 2.3.3 后技能数
**349 → 334**。A/B 对照读数（同一个脚本、只换 `PRESET_ROOT`）：

```
$ node packaging/scripts/select-skills.mjs --report            # 本机 ~/.dsh/.agent-presets（含 bobo-cto）
  被引用   350
  ★ 实际出货 349

$ PRESET_ROOT=<出货 payload 解开的 presets> node ... --report    # 51 个，无 bobo-cto
  被引用   335
  ★ 实际出货 334
```

逐名比对（两次 `--copy` 到临时目录再 `diff`）得到**恰好 15 个**：

```
agent-browser                 handoff
code-review                   improve-codebase-architecture
codebase-design               macos-harness
diagnosing-bugs               resolving-merge-conflicts
domain-modeling               simplify-codebase
dsh-plugin-acquire            wait-what
git-guardrails-claude-code    writing-for-agents
grilling
```

这 15 个的引用者**只有 `bobo-cto` 一个**（在出货 presets 里逐个 grep：命中预设数 0）。

### 为什么这不是「规则的正确结果」就完事

按当时的规则（「被出货预设引用 + 无受限许可」）算，334 确实正确。但同族的工程工艺技能
**本来就在出货面里**：

| 技能 | 引用它的出货岗位 |
| --- | --- |
| `tdd` | agt-013 |
| `to-spec` | agt-012 |
| `to-tickets` | agt-009 |
| `write-spec` | agt-009 |
| `prototype` | agt-013 |
| `research` | agt-048 |

于是产品拿到的是**一半工艺层**。分界线画在哪，取决于打包那台机器的引用图恰好长成什么样——
这不是任何人决定的结果。根因与 ADR-0073 同源，只是形态更隐蔽一层：
那里的出货边界是**一个目录列表**（本机有什么就发什么），这里是**一张引用图**（谁引用了就发谁）。
两者都是机器状态，都答不了「**产品要不要发它**」——引用图能证明的只有「有人用」。

## Decision

见 [ADR-0074](../../../adr/ADR-0074.md)：

1. `select-skills.mjs` 的选择式改为 **`(被引用 ∪ 产品级白名单) − 受限许可`**，白名单是新的
   `packaging/shipped-skills.json`（15 条，每条带 `why`）。
2. 白名单自己的四种腐烂形态各有判否：名字不存在（rc=1）、与受限许可同名（rc=1）、缺 `why`（rc=2）、
   **文件缺失不得按空名单继续**（rc=2）。
3. `--check` 从「只看受限许可」升为「**逐名等于选择结果**」；`--copy` 找不到源即中止。
4. 装配（`--copy`）与盘点（`--report`）都打印「救回未被引用几条 / 其中几条已冗余」。

## Alternatives considered

- **把 15 个技能接到 `agt-*` 的 `skill-map.json` 上。** 被否：那是改**岗位能力面**，
  会顺带动岗位 `manifest` 与 ADR-0072 的「白名单生效性」读数。产品意图与岗位接线是两件事。
- **把 `bobo-cto` 请回 `allow`（回到 52 预设 / 349 技能）。** 被否：它引用的材料根
  `/Users/lute/project/BoBo` 在客户机上不存在——发出去是一个装上了但指向空材料的预设；
  且用户已明确它不参与打包。
- **存全量白名单（349 条）。** 被否：ADR-0009，第二份事实会随引用图静默漂移。
- **`--check` 维持原语义。** 被否：那样「选择说发 N 个、树里只有 N−1 个」无人发现，
  而本条 ADR 的 A/B 读数正是靠逐名比对才做得出来。
- **让自测用环境变量替换仓库映射文件。** 被否：夹具改用 `zzfx-` 前缀假技能名即可确定性，
  不必为测试在生产脚本上开一个能让「被引用集」失真的口子。

## Consequences

- 出货技能面回到 349，而这次是**显式表态**的结果；「救回未被引用 15 条」成为装配日志的一等读数。
- `--check` 变严后只对**本次选择结果**有意义；对历史版本的出货树跑它必然判否。
- 冗余条目会长期存在（岗位也在用同一批技能），所以它是**告警式读数、不是失败**。
- `grill-me` / `grill-with-docs` / `ask-matt` 等转发器仍不在出货面内——本次批复只覆盖掉出的 15 个。

## 验证读数

自测与选择判据：

- `bash packaging/scripts/select-skills-test.sh` → **13 通过 0 失败**（S1–S9、P1、M1）。
- `PRESET_ROOT=<出货 presets> node packaging/scripts/select-skills.mjs --report` → 被引用 335、
  **白名单救回未被引用 15 条**、实际出货 **349**。
- `--copy` 后 `--check` → `✓ 落位技能树 ≡ 选择结果（349 个），且无受限许可技能`。
- 与排除 `bobo-cto` 前的出货面逐名比对：`diff` 差异**恰好 15 条**（即救回的就是掉出的那 15 个）。

## 重切 2.3.3（第二次同名归档）——装配与出货读数

装配（`SMOKE PASSED`，退出码 0）：

```
[skills] 已拷贝 349 个到 …/.sp/skills（源 1612 = 本机 1612 + 官方 12；剔除未引用 1262、受限许可 1）
[skills] · 产品级白名单 15 条，其中救回未被引用 15 条：agent-browser、code-review、…、writing-for-agents
[skills] ✓ 落位技能树 ≡ 选择结果（349 个），且无受限许可技能
completeness: bundles=39 vendor=23 skills=349 presets=51
[smoke:ok] skills all present: 349, presets all present: 51
SMOKE PASSED
```

出货 DMG（`release/2.3.3/DSH-Desktop-LUTE-2.3.3-mac-arm64.dmg`，611M / 640902391B，
sha256 `7fb2d4771a0f5b04bd451df6436c03563c7984a761604f8f4c3933147947d724`，挂载后直读）：

| 检查 | 第一次重切（334） | 本次（349） |
| --- | --- | --- |
| `completeness.json` 的 `skills` | 334 | **349** |
| `completeness.json` 的 `presets` | 51 | 51（`bobo-cto` 不在其中） |
| DMG 内 `skills-presets.tar.gz` 的 15 个白名单技能 | 0/15 | **15/15** |
| DMG 内文本文件含 `/Users/lute` | 0 | **0** |
| 其中占位符处数 | 173 | **182**（新增的 15 个里 2 个自带构建机路径） |
| 出货 tarball 守卫（`--tarball`） | `✓ 无新增（0 条）` | `✓ 无新增（0 条）`，`exit 0` |
| 载荷 `SHA256SUMS` 四个 tarball | OK | OK |

旧副本两份都留着（未删除）：

- `packaging/release/.archive/2.3.3-20260913-172037`（52 预设，含 `bobo-cto`）
- `packaging/release/.archive/2.3.3-20260913-174848`（51 预设 / 334 技能）
- 仓库外归档 `~/Library/Application Support/LUTE/releases/2.3.3.superseded-20260913-172040` 与
  `2.3.3.superseded-20260913-174851`；现役 `…/releases/2.3.3` 已 `uchg` 锁定（ADR-0067）。

**`source_dirty=1`（如实记录，与上一版同类）**：装配那一刻工作树上有**并行会话**的未跟踪文件
（`packages/capabilities/dsh-paper2skills/eval/` 的 F6/F7 评测工具链）。已逐项核查**没有进载荷**：
`dsh-paper2skills` 既不在 `completeness.json` 的 `bundles` 也不在 `vendor`，
`profile.tar.gz` 与 `DSH Desktop.app.tar.gz` 里 `dsh-paper2skills/eval` 命中均为 **0**。
即：脏的是**构建输入清单**，不是出货内容。装配期间那个会话还把 F7 提交了（`1d20ef0`），
所以**清单落盘时工作树已经干净**——`source_dirty` 记的是**装配时刻**的状态（ADR-0058 的口径），
不是清单提交时刻的状态。

**门禁**：`pnpm run gate` **36/36**（新增的 `shipped-skills-scope-selftest` 在列）。
