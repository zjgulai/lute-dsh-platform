# Qodo 复核增量与任务映射

- 复核日期：2026-09-16
- 状态：`active-plan`；部分根因已进入本地实现，未完成项与远端证据继续按任务卡跟踪
- Qodo operation：`79cbe315-e172-4c52-a8a8-2bcd002b7ce8`
- 工具版本：Qodo CLI 1.0.0
- 使用能力：Codebase Wisdom、local full/deep review
- 本文件用途：保存 Qodo 原始发现的归并、独立裁决、实施任务映射与证据边界
- 本轮变更边界：只更新本临时 review 目录；不修改产品代码、测试、门禁、配置、profile、用户数据或发布状态

## 1. 审查锚与覆盖限制

Qodo 审查使用了以下时点事实：

- `origin/main`：`44f49940be70574519da6afbfeef3638fb0b97ad`
- local `main` HEAD：`af5f2ede6092a38fcb7d119571667771004bf416`
- 本地提交内容：约 4.77 MB patch，包含当时 50 个 untracked 文件
- ignored 文件：Qodo 统计约 654,073 个，未进入 patch；其中包含 dependency、cache、coverage、staging 和生成产物
- 原始 finding：16 条
- 覆盖标记：`full (incomplete_context_or_coverage)`
- 未运行或未完成：skills、spec、UI、persona、cross-repo reviewer；超过 4 MiB checkpoint 后的上下文也可能不完整

因此，本次结果不是“全仓已完整证明”的同义词。16 条 finding 先视为 E0 线索，再由本地代码读取、集合对账和负向推演归并为 11 个根因。Qodo 未报告的区域仍可能有问题，Qodo 报告的问题也必须在实施时通过 Red fixture 重新证明。

复核期间工作树持续被另一任务写入。末次观察为 23 个 tracked 修改、52 个 untracked 文件、0 staged；这些数字只描述当时时点，未来实施不能沿用。

## 2. 16 条 finding → 11 个根因

| 根因 | 原始条数 | 独立裁决 | 主要证据面 | 已映射任务 |
| --- | ---: | --- | --- | --- |
| R01 `remove-preset` 可路径逃逸 | 2 | 接受；两条是同一根因的重复表述。`--ids` 未验证 final name，后续直接 `join(userRoot,id)` 并递归删除；archive target 同样由输入组成。 | `scripts/role-presets/remove-preset.mjs` | `SEC-RT-003A` |
| R02 Settings CSS 选择器过宽 | 1 | 接受。候选 CSS 直接命中所有 `[role="dialog"][aria-modal="true"]`，与 JS 的“必须含直接子 `nav`”锚不等价，存在改写非 Settings modal 的风险。 | `packages/platform/dsh-settings-shell-local/src/client/shell.css`、`src/client/anchors.ts` | `PROD-UX-001`、`QG-012` |
| R03 installer 的 `--only` 范围不完整 | 2 | 接受；两条重复。过滤只用于 68 条 extra，70 条 mapping 总会进入 tasks，因此“只装一个 repo”仍可能改写既有 70 条。 | `install-fullstack-skills.mjs` 的 tasks 合成 | `SEC-RT-003A` |
| R04 third-party intake accounting 不守恒且可 exit 0 | 1 | 接受。already-installed 被追加到 skip 后又单独计数；更关键的是 accounting problems 在前一次退出检查之后才追加，可能打印成功并以 0 退出。 | `build-third-party-intake.mjs` | `QG-011` |
| R05 skill installer 非事务、资源可能部分丢失 | 3 | 接受；三条分别描述边写边校验、先删后复制、既有条目只写 `SKILL.md` 的共同失败边界。任一后段失败都可能留下半批状态，且没有 batch rollback。 | `install-fullstack-skills.mjs` | `SEC-RT-003A` |
| R06 Settings AX 校准恒等式假绿 | 1 | 接受。`zoom = medianHeight / 40` 后再计算 `medianHeight / zoom` 必然得到 40；目标控件同时充当校准锚与被验收对象。 | `scripts/acceptance/settings-shell-live.mjs` | `QG-012` |
| R07 第三方取件只以可变 HEAD/size 证明缓存 | 1 | 接受。tree 与 raw 都引用可变 `HEAD`；cache hit 只比较 size，tree 的 blob SHA 没有被逐文件复算，文本读取也不能覆盖二进制原字节。 | `fetch-third-party-skills.mjs` | `SEC-RT-002`、`QG-011`、`DEC-009` |
| R08 Fullstack verifier 只覆盖 70/138 | 2 | 接受；两条重复。`verify-fullstack.mjs` 的唯一输入是 mapping 70，extra 68 没进入同一逐项安装/frontmatter/资源/flags 校验。 | `verify-fullstack.mjs` | `QG-010`、`PROD-UX-003` |
| R09 live-presets 跳过 bare package name | 1 | 接受。行筛选只把 `cordis:`、scope、相对/绝对路径和 `file:` 当候选，普通裸包名不会进入解析检查。 | `scripts/gates/live-presets.mjs` | `QG-002` |
| R10 Settings 仅在脏工作树可构建/解析 | 1 | 部分改写后接受。当前本机 `lib` 存在且 profile/loadpoint 可对账，因此不能写成“现在一定不能加载”；真正缺口是整个包仍 untracked、`lib/` 被 ignore，exact commit 的 clean checkout 不能独立证明同一入口可重建。 | Settings `package.json`、`.gitignore`、build/loadpoint | `QG-003`、`REL-001`、`DEC-010`、`PROD-UX-001` |
| R11 skill invocation flag 契约冲突 | 1 | 条件接受。installer 保留上游 flags，而产品/host 的开关语义倾向 `user-invocable: true`；本次已检查样本未证明当前 live 条目触发冲突，所以不是已发生事故，但缺少显式准入和 whitelist 契约。 | installer `readFlags`、host `rebuildFrontmatter`、agent-fullstack verifier | `QG-010`、`DEC-009` |

计数复核：`2+1+2+1+3+1+1+2+1+1+1 = 16`；归并后为 11 个根因。没有 finding 被静默删除。

## 3. 每个根因的实施前 TODO

这些动作是任务卡的索引，不替代对应 workstream 的完整 Red/Green、故障注入、clean-machine 和 live 边界。

### R01 / R03 / R05：破坏性路径与事务

- [x] 先完成 `BASE-001`，冻结当前候选归属和禁止覆盖文件。
- [x] 对 `--ids` 与 `installAs` 使用同一 final-name 规则，拒绝 `..`、separator、绝对路径、NUL/control、Unicode/case collision。
- [x] root、parent、source、target、archive 分别 canonicalize，并拒绝 symlink/无法证明的 hard-link 边界。
- [x] 在第一笔 payload 写入前完成全批 preflight；最后一项无效时前面所有项目也零写入。
- [x] 使用 staging、内容 digest、同文件系统 swap、journal 和 fault-point rollback；没有用“finally 清理”替代事务正确性。
- [x] 真实 `~/.dsh` 未获独立授权时只运行 `--dry-run`/审批拒绝；所有 mutation 使用临时 HOME/root 与根外 canary。
- [x] 以 `SEC-RT-003A` 的退出条件统一收口，没有分别做三个局部 patch；live/UI 与 SEC-RT-002 依赖按证据边界保留。

### R04：intake 对账与退出码

- [x] 把 upstream/imported/skipped/already-installed 建成互斥 set，并按唯一 ID 验证双向差集。
- [x] 所有 problems 必须在成功输出和写文件前统一决定 exit code。
- [x] `--check` 必须只读；生成模式只在零问题后原子替换。
- [x] 保留“69 被算成 72”“37 被算成 66”作为 Red 线索，并在实施时重采为 `69=63+3+3`、`37=5+3+29`，没有把旧错误加总写成目标常量。
- [x] `QG-011` checker 已接入本地 root quick/full gate。
- [ ] 由 `QG-007` 把该 checker 设为远端 required CI；本地结果不替代该证据。

### R07 / R11：第三方来源、批准与调用权限

- [ ] 用户先完成 `DEC-009`：确定 quarantine/approved 状态、reviewer、license、模型自动调用与用户显式调用政策。
- [ ] tree、raw/blob、provenance 必须绑定同一个 resolved commit；逐文件复算 Git blob OID 与 SHA-256。
- [ ] cache hit 与首次取件走同一验证；二进制按原始 bytes，不用 text round-trip。
- [ ] 来源 commit、license、权限声明或任一资源变化时自动撤销 approval。
- [x] `QG-010` 对 89 ID whitelist 做批准集合全等；scope 明确为 preset composition。
- [ ] invocation flag 的产品策略仍归 `DEC-009`；QG-010 只校验字段存在、布尔类型与 `respectFileFlags:true`，不擅自统一取值。
- [ ] 只有 `SEC-RT-002` 的离线 clean-machine、profile 与 release 三层证据齐全后，才能把第三方字节写成可交付。

### R08：138 catalog 与 89 产品意图

- [x] 70 mapping + 68 extra 形成唯一 canonical 138 set，先检查跨源重复和 ID 归一化冲突。
- [x] 138 条全部进入相同的安装、frontmatter、资源、脚本和调用开关检查。
- [x] owner 明确签核后，把批准的 89 项产品选择物化为 tracked whitelist；没有从当前安装结果自动反推。
- [x] 对 89 做双向集合全等；同数替换、少一、多一、重复与批准指纹漂移都必须打红。
- [x] `QG-010` 已完成 138 catalog 与 89 approved set 的本地工程闭合。
- [ ] 大目录的发现效率、错误恢复和性能预算仍由 `PROD-UX-003` 完成，不能用 QG-010 替代。

### R02 / R06 / R10：Settings 实现、产物与验收仪器

- [ ] 用户先完成 `DEC-010`，选择 Settings 的 artifact policy 和正式发布权威输入。
- [x] `PROD-UX-001` 把 CSS 锚收窄到已确认的 Settings 容器，保留非 Settings dialog 负控。
- [ ] `QG-003` 和 `REL-001` 在 exact commit 的 clean checkout 中构建、解析 `main`/`exports`/`files` 和 DSH entry；开发机 ignored `lib` 不能作唯一证据。
- [x] `QG-012` 使用不包含目标按钮尺寸的独立 AX/CSS 锚；目标尺寸 mutation 必须稳定打红。
- [x] 代码修复与验收仪器已分别给出 Red/Green，且 probe mutation 位于 QG-006A owned fixture。
- [ ] build contract 仍由 `QG-003`/`REL-001` 在 clean checkout 独立出证据，不能用本批 package build 代替。

### R09：live-presets 射程

- [x] `QG-002` 使用结构化 row 解析枚举插件，不再用模块说明符前缀猜射程。
- [x] bare/scoped/file/relative/absolute/builtin、disabled 与未知表达式分别进入 checked、typed skip 或 failed。
- [x] `expected = checked + typed skipped + failed`，根存在但零行不能报告健康。
- [x] `QG-006A` 已补齐 owned fixture 与现存 suite 隔离；`QG-006B` 的聚合并发、SIGTERM 与全工作树零副作用证明仍待独立批次，不反向撤销 QG-002 的本地契约结果。

## 4. Qodo 未覆盖但独立审查保留的高优先级项

| 独立发现 | 为什么不能因 Qodo 未报而删除 | 任务 |
| --- | --- | --- |
| `installAs` 自身未验证 | R03 关注 `--only`，但最终目标名才是路径 containment 的真实输入。 | `SEC-RT-003A` |
| Shopify host 凭证边界 | 涉及 credential exfiltration，不能由此次大 patch 覆盖缺失推断安全。 | `SEC-RT-001` |
| Wanzh 配置、OAuth、Team Hub session 原子性 | 属于运行时状态与故障恢复，不在 Qodo 主要 diff 焦点。 | `SEC-RT-006..008` |
| Team Hub GET/plugin proxy default-allow | 是权限边界；必须按 GET/POST/upgrade 真实路径证明 default-deny。 | `SEC-RT-004` |
| My Quotes 默认扫描、全文索引和 LLM 传输 | 涉及用户内容、既有数据迁移与 consent，Qodo coverage 不能代替产品决策。 | `PRIV-002`、`DEC-011` |
| CI/ruleset 未建立 | 本地 gate green 不证明独立 runner 或远端不可绕过。 | `QG-007`、`QG-008` |
| dirty source、最终 DMG、N-1 与 rollback | payload smoke、历史 Release 或开发机 loadpoint 都不是最终客户安装证明。 | `REL-001..004`、`REL-009`、`DIST-002..004` |
| New App / Team Hub Admin 恢复路径 | UI/persona reviewer 未运行；本地独立 UX 审查仍发现 retry、async error 和危险确认缺口。 | `PROD-UX-004`、`PROD-UX-005` |

## 5. 证据与停止规则

- Qodo finding 只能作为 E0；任务实施必须从当前 commit/worktree 重新建立 Red，不能把本文件描述当作当前复现。
- Qodo 的 `full` 表示审查模式，不表示完整覆盖；必须同时保留 `incomplete_context_or_coverage`。
- 历史 `pnpm run gate`、`gate:full`、live Note 或 Release hash 在代码/工作树变化后不会自动续期。
- clean-checkout、CI、live DSH、final DMG、远端 Release、canary 和 production acceptance 各自使用 [EVIDENCE-MATRIX.md](EVIDENCE-MATRIX.md) 的独立层级。
- 任一根因若实施时被证明不成立，记录反证、影响版本和关闭理由；不得为“完成率”编造 patch。
- 任一需要真实删除/覆盖、profile mutation、外部取件、远端 ruleset、Developer ID、公证、上传或客户机操作的步骤，必须停下获取对应范围的新授权。

## 6. 计划完成检查

- [x] 16 条原始 finding 全部归入 11 个根因。
- [x] 每个根因均有一个或多个 task ID，没有静默丢弃。
- [x] 条件项 R11 与事实项分开，不把未触发风险写成已发生事故。
- [x] R10 区分“当前本机可加载”和“clean checkout 可重建”。
- [x] Qodo 覆盖限制与工作树并发漂移被保留。
- [x] 高优先级独立发现未因 Qodo 未报而从计划删除。
- [x] 本文件不授权或执行任何产品代码、真实安装/删除或外部状态变更。
