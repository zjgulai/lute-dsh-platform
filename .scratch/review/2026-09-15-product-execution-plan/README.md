# LUTE 产品项目推荐执行计划（临时 Review）

- 创建日期：2026-09-15
- 最近复核：2026-09-16（Qodo deep review + Understand 全量知识图谱 + 本地独立复核；其后同日内完成 `SEC-RT-005` 与新增的 `QG-013` 两轮）
- 状态：`active-plan`；`QG-010/QG-011` 已由 GitHub checkpoint `cc6f1ac` 固化；`QG-006A`、`PROD-UX-001/QG-012`、`SEC-RT-005`、`SEC-RT-006/007`、`QG-013`、`QG-003/004/005`、`QG-006B` 为**本地已完成但未提交**；`QG-007` 的 workflow 与离线判据（L1）已落地并**已推送到远端 main**（`623404375e95`）；`QG-008` 的 main 与 v* tag 保护**已生效**（ruleset 23564403 / 23564404），只读审计与声明全等
- 适用仓库：LUTE Agentic System / Magpie-Horch
- 当前权限：授权按轮次逐个圈定。本轮授权范围为「授权并继续下一批 QG-008」，用户在两个选项中选择了「**两步都授权**：先用 API 推 workflow 到 main，跑起来后再建 ruleset」。本轮内**未** commit 本地源码改动、未进入 live GUI、未跑 Codeup、未安装或发布。远端只做了两件事：新增 `.github/workflows/gate.yml`（一个文件）与创建两条 ruleset——两者都有变更前快照与恢复方式。

## 1. 计划目标

把 2026-09-15 的全维度产品审查结论转成可以分批授权、逐项验收、失败时可停止的执行清单。

计划的主判断是：当前项目的能力广度和本地工程纪律已经较强，下一阶段应先关闭安全与交付信任缺口，再建设统一产品旅程，最后才进入公开发行、增长和商业化扩展。

本计划不把以下概念混为一谈：

1. 仓库里有实现；
2. 当前工作树的本地检查通过；
3. 改动已提交到 `main`；
4. 远端 CI 独立通过；
5. 运行中 DSH 实例通过 live acceptance；
6. 干净客户机完成安装、升级与回滚；
7. GitHub Release 字节与 tag/manifest 闭合；
8. 客户灰度与生产效果获得接受。

## 2. 审查基线

计划基于以下只读审查快照编制：

- 分支：`main`
- HEAD：`af5f2ede6092a38fcb7d119571667771004bf416`
- 远端基线：`origin/main`、`codeup/main` 均为 `44f49940be70574519da6afbfeef3638fb0b97ad`
- 本地相对远端：超前 3 个提交
- 工作树：11 个 tracked 修改，另有 12 组 untracked 路径
- 当前候选包括 Settings Shell、ADR-0087/0088、live-presets、plugin-entry-contract 等；它们尚未提交，不能视为已交付能力
- 当前工作树本地验证：`pnpm run gate` 为 61/61，`pnpm run gate:full` 为 68/68，`git diff --check` 通过
- 最新公开 Release：v2.4.1；远端 DMG digest 与本地入库清单一致，`source_dirty=0`
- GitHub 控制面：未发现 workflow、branch protection 或 repository ruleset

上述状态可能继续变化。未来开始任一实施批次前，必须重新采集同一组基线，不得直接沿用本文件里的数字。

### 2026-09-16 Qodo 增量复核

- 工具：Qodo CLI 1.0.0，Codebase Wisdom + local full/deep review。
- 远端基线仍为 `origin/main@44f49940be70574519da6afbfeef3638fb0b97ad`；Qodo 本地审查锚为 `main@af5f2ede6092a38fcb7d119571667771004bf416`。
- Qodo 提交约 4.77 MB 本地差异并纳入 50 个当时的 untracked 文件，原始返回 16 条发现；独立复核将直接重复和同根因项归并为 11 个根因。
- Qodo 明确标记 `incomplete_context_or_coverage`：patch 超过 4 MiB checkpoint，ignored dependency/cache/staging 不在审查内，且 skills/spec/UI/persona/cross-repo reviewer 未运行。因此 Qodo 结论只作为 E0 线索，所有进入计划的项均要求本地代码证据或负向复现。
- 复核末次快照已变为 23 个 tracked 修改、52 个 untracked 文件、0 staged；并发任务在一次 `pnpm run gate` 之后继续写入，所以该次 `63/63` 绿色不能代表后续工作区。
- 当前 `git diff --check` 已被并发新增的 EOF 空行问题打红；初始基线里的 `61/61`、`68/68` 与“diff-check 通过”均为历史快照，不能复用为当前验收。
- 新增重点是第三方技能取件/准入、破坏性路径 containment、138 条全量验证与 89 条白名单意图、Settings clean-checkout 产物，以及验收仪器自校准；完整映射见 [Qodo 复核增量](QODO-REVIEW-ADDENDUM.md)。
- 本计划收口时只读快照为 23 个 tracked 修改、54 个 untracked 文件、0 staged；其中 10 个 untracked 文件属于本 review 目录，另 44 个在目录外。该数字只用于划清并发边界，不表示本计划拥有或验收目录外改动。

## 3. 使用方式

1. 先阅读 [需要用户决策](DECISIONS-REQUIRED.md)，解决会改变架构、权限、UX、发行或商业边界的选择。
2. 在 [总任务表](MASTER-TODO.md) 中只选择一个已满足依赖的批次。
3. 按对应工作流文件完成任务卡中的 Red、实现、Green、live/外部验收。
4. 将证据按 [证据与验收矩阵](EVIDENCE-MATRIX.md) 分层记录。
5. 一个批次完成后停下汇报，不自动进入下一批次。

未来执行仍遵守仓库规则：在 `main` 开发、不使用 worktree；未得到明确要求时不主动 commit、push、发布或改变远端控制面。

### 当前执行断点

- 最近已推送 checkpoint：`cc6f1ac3025fe778f636a9c049bd26e88e6bfd33`，仅在 GitHub `origin/main`；推送后复核 Codeup 仍停在 `44f49940be70574519da6afbfeef3638fb0b97ad`。
- `QG-010` 已闭合 catalog 138/138、owner 批准 whitelist 89/89 与 live 节点归属；`QG-011` 已闭合第三方 intake 互斥终态、守恒与错误非零退出。两项只代表本地工程证据，QG-007 远端 required CI 未开始。
- GitHub checkpoint 只纳入 `QG-010/QG-011` 及其 ADR/Note/计划证据；未验收的 `QG-003` candidate 没有混入。
- `QG-006A` 已新增 owned mutation fixture、迁移四类真实污染点并补齐六组临时树 cleanup；本地改动未提交。完整并发/SIGTERM/全工作树 snapshot 仍是 `QG-006B`，本轮不进入。
- `PROD-UX-001` 已把 Settings CSS 收到 parser-owned marker，并以五类非 Settings modal 负控证明无跨 dialog 污染；`QG-012` 已用 upstream 188px nav + 28×28px close 独立校准，离线状态为 14 cases/27 assertions、criteria 9/9（含 6 个 mutation control）。
- Settings 当前只能报告 `local scope contract complete; instrument verified; live unverified`：未操作 profile/DSH GUI，真实 Chrome、两种 zoom、键盘/VoiceOver、clean checkout/干净安装继续等待各自验收。
- 本批根 `test:gate` 412/412；quick 67/69、full 74/76，唯一 fail 为当前 profile 仍装载旧 Settings bundle，另一个非 pass 是 159 条 disabled live-presets typed skip。未越权执行 profile 同步，故根 gate 如实保持非零。
- Advisor 父运行时本轮不可用，没有可归因结论；Understand 全量图谱已在用户确认 `.ua/.understandignore` 后完成，新增事实、限制与校验见 [Understand 图谱证据](UNDERSTAND-GRAPH-EVIDENCE.md)。

## 4. 文件导航

| 文件 | 内容 |
| --- | --- |
| [TARGET-SPEC-AND-ROADMAP.md](TARGET-SPEC-AND-ROADMAP.md) | 整轮建议的统一目标、当前架构、阶段路线、决策门和首批权限 |
| [CURRENT-PRODUCT-ARCHITECTURE.md](CURRENT-PRODUCT-ARCHITECTURE.md) | 当前 25 单元基线、26 单元候选、产品旅程、状态/数据边界与架构热点 |
| [UPSTREAM-BASELINE-AND-MIGRATION.md](UPSTREAM-BASELINE-AND-MIGRATION.md) | DSH 基座差异、最佳更新层、兼容陷阱、paired canary 与 DMG 迁移 Spec |
| [MASTER-TODO.md](MASTER-TODO.md) | 总体阶段、依赖关系、优先级和完整任务索引 |
| [DECISIONS-REQUIRED.md](DECISIONS-REQUIRED.md) | 实施前必须由用户确认的产品、安全、发行与商业选择 |
| [EVIDENCE-MATRIX.md](EVIDENCE-MATRIX.md) | local、CI、live、clean-machine、release、canary、production 的验收分层 |
| [QODO-REVIEW-ADDENDUM.md](QODO-REVIEW-ADDENDUM.md) | Qodo 16 条原始发现的归并、独立裁决、任务映射与覆盖限制 |
| [UNDERSTAND-GRAPH-EVIDENCE.md](UNDERSTAND-GRAPH-EVIDENCE.md) | 2,037 文件全量图谱的范围、架构分层、验证、噪音边界与计划影响 |
| [01-security-runtime.md](workstreams/01-security-runtime.md) | MCP、Shopify、Team Hub、状态持久化、OAuth、子进程与请求边界 |
| [02-gates-ci.md](workstreams/02-gates-ci.md) | 三态门禁、漏检修复、无副作用测试、CI 与分支保护 |
| [03-release-distribution.md](workstreams/03-release-distribution.md) | clean source、smoke attestation、Release 字节链、公证和更新 |
| [04-product-ux.md](workstreams/04-product-ux.md) | 产品定位、能力成熟度、Settings、onboarding、信息架构、可访问性与效果评估 |
| [05-privacy-observability-commercial.md](workstreams/05-privacy-observability-commercial.md) | 隐私、telemetry、支持包、指标、治理与商业模式 |
| [BATCH-001](batches/BATCH-001-boundary-and-shopify.md) | 已关闭首批的事实快照、写入 allowlist、Red/Green 与分层执行证据 |
| [SEC-RT-001](tasks/SEC-RT-001-shopify-host-validation.md) | Shopify host 规范化与凭证外传阻断的实现/测试任务卡 |

## 5. 总体完成定义

本计划只有同时满足以下条件，才可从“内部 Beta / RC”提升为“公开生产候选”：

- 凭证不会交给未固定、未验证的运行时代码。
- 所有第三方技能、npm MCP 与 Python runtime 均绑定不可变来源、逐文件 digest、许可证和批准状态；缓存与 live 安装不能替代 provenance。
- 所有递归删除或覆盖入口在首次文件操作前验证最终名称、canonical containment 与 symlink，并在批次失败后保持目标树逐字节不变。
- Team Hub 的插件路由采用默认拒绝，并经过真实网关到 DSH 的权限测试。
- 所有门禁无射程时为明确 `skip` 或 `fail`，不能显示 `ok`。
- 全栈技能 138/138 进入安装、frontmatter、资源和调用开关验证；agent-fullstack 白名单与 tracked 产品意图清单逐项全等。
- `main` 受到 required checks 和不可绕过规则保护。
- 干净 checkout 能独立重建 Settings Shell 等运行时入口；ignored 本机产物和 live profile 不能成为唯一发布来源。
- 正式 Release 只接受 clean source、已绑定 smoke attestation、不可重制版本。
- 远端附件、哈希、manifest、tag commit 和 Latest 状态自动闭合。
- 公开分发完成 Developer ID、hardened runtime、notarization、stapling 和 Gatekeeper 验收。
- 新用户不打开终端也能从安装走到第一次成功任务。
- 产品界面明确区分 Installed、Loaded、Configured、Connected、Outcome-verified。
- 用户内容的本地索引、模型传输、telemetry 和删除方式有真实一致的披露。
- 至少三条核心业务任务有成对效果评估，并证明产品相对无增强基线不劣化。
- 灰度、回滚、客户支持和生产接受均有独立证据。

## 6. 明确暂缓事项

在 Phase 2 退出前，默认不扩大以下范围：

- 不继续以技能卡、岗位、业务系统或设置页数量作为主要迭代目标。
- 不继续执行未固定 commit、未核 blob digest、未完成许可证/权限审查的第三方技能 fetch/install/promotion。
- 不运行尚未具备路径 containment、全批预检和回滚证明的递归删除/覆盖脚本。
- 不在未公证状态下启用自动安装更新。
- 不用大型 monorepo、目录或框架重构替代已确认的边界修复。
- 不把 50 岗位描述为已获得生产授权的自治岗位。
- 不把浏览器书签型系统入口描述为已完成业务系统集成。
- 不把本地 gate green、历史 Note 或计划文档写成客户生产接受。

## 7. 临时目录生命周期

本目录是评审计划，不是长期架构事实的唯一来源。实施时产生的正式决策必须按仓库 ADR/Note 规则落位；当所有任务完成、废弃或迁入正式治理文档后，再由用户明确授权删除或归档本目录。
