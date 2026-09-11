# 记忆系统收敛：卸载灵枢、保留 Noema（2026-09-11）

> 本 Note 记录一次**不可逆的能力取舍**：在实测两套记忆系统后卸载其一。
> 决策由用户在「只保留 1–2 套记忆」的前提下确认（方案 A）。

## Problem

本机跑着两套面向 agent 的长期记忆系统，而仓库 ADR-0009 的纪律是「一份事实只有一个家」——
两套系统会各自往系统提示注入记忆、各写各的库，正是本仓库一直在消灭的「同一事实多份副本」形态。
用户要求收敛到 1–2 套，并要求给出兼容性与质量的最终方案。

**实测取证（决定性，非印象）**：

| 维度 | Noema（`@zseven-w/dsh-noema` 0.1.0-rc.3） | 灵枢（`@furongjun1999/dsh-memory` 0.4.0，仓库内 `dsh-memory-local`） |
| --- | --- | --- |
| 召回实测（同一 query） | 4 条**真项目事实**：`dsh-ui-polish` 锚点与装载方式（`detailsCol`/`dsh-tb-viewport`/`--dsh-chat-content-width`）、Loop 3 试运行与 `_attic` 恢复路径、rc-eval 的 `userData` 隔离补丁与 `autoInstallPeers:false` | 5 条 **seed 身份文档** + 1 条 consolidation 日志 + 4 条**会话琐事**（「继续」「已经重启」「同意建议」） |
| 库内容 | 高价值项目知识 | 无一条项目事实 |
| 写入纪律 | `write_policy: review`（候选进审阅队列） | `userMessage: true` → **无差别自动沉淀**（README:506/541 明示：真实用户消息 → `remember`，importance 0.6） |
| 召回精度 | 4/6 直接命中项目知识 | seed 靠 `access_count=4033` 霸占前排（被注入轮次推高，非真实检索） |
| 库活跃 | 08-31 后未增（本轮有主动写入） | 今天仍在写（写的是琐事） |

另有两项结构性发现：**灵枢的 seed 是「灵枢是谁」的哲学身份文档**（identity / protocol / charter / values），
**不是项目知识**；而 `dsh-memory-local` 是 `luteOrigin: internalized` 的受管包（53 个文件受版本控制、
`lutePublish: false`），它还用 `LING_SRC` 参数、smoke 断言、目录墙分组、`profile-apply-patches.mjs`
第 1 条补丁规则（移除灵枢的角色扮演 web 面）被交付链与打包链引用。

## Decision

**保留 Noema，卸载并删除灵枢；其身份层转为文档保留。**

1. **抢救身份层**：5 条 seed 全文导出为
   [`docs/notes/implemented/architecture/lingshu-identity-seed.md`](lingshu-identity-seed.md)——
   工作层是噪声、身份层是有价值的成文文档，故拆分为「文档保留 + 插件卸载」。
2. **备份数据**：`lingshu.db` + `-wal`(4.1MB) + `-shm` → `~/project/_archive/Magpie-Horch-20260911/lingshu-memory/`。
3. **profile 卸下**：`dependencies` 与 `dsh.profile.bundles` 双条目移除 → `node_modules/@furongjun1999/` 删除 →
   宿主内置 pnpm `install --lockfile-only`（lock 残留 0）→ `data/`（三件）归档后清空移除。
4. **仓库删包**：`packages/capabilities/dsh-memory-local/`（53 文件 `git rm`），受管包 20 → 19。
5. **连带修正四处活引用**（不改会断链或产生假绿）：
   - `scripts/gen-catalog.mjs` 的分组注册表移除该条目（否则目录墙生成失败）；
   - `packaging/scripts/smoke-test.sh` 两处 `vendor/dsh-memory-local` 断言改指 `dsh-theme-local`，
     并移除失效的 `LING_SRC` 传参；
   - `packaging/installer/install.sh` 移除失效的 `LING_SRC` 环境变量；
   - `dsh-patches/profile-apply-patches.mjs` 移除第 1 条（灵枢）补丁规则。
6. `docs/architecture.md` 更正包数为 19，并顺带更正 G7 之后已失效的「保留历史平铺兼容分支」表述。

## Alternatives considered

- **方案 B：只留灵枢**。否决——需先导出 Noema 那 4 条真项目事实（否则真知识丢失），且必须改配置
  `userMessage: false` 才能解决噪声；而灵枢库里并没有等价的项目知识可以补偿。
- **方案 C：两套都留，划清职责**。否决——灵枢需关掉 `userMessage` 才能降噪，但两套仍在往上下文注入
  记忆，「两个家」与 token 成本的问题只是被降低而非消除；与 ADR-0009 冲突。
- **只卸 profile、保留仓库内的 `dsh-memory-local` 包**。否决——那会留下一个「不装却仍在维护」的包：
  门禁的 `changed-packages`/`scripts-runnable` 仍会为它跑 typecheck/test，且它的补丁规则与 smoke 断言
  会持续指向一个已卸载的插件。
- **直接删库不导出 seed**。否决——seed 是用户侧哲学资产（「灵枢是谁」的成文自我认知），
  删除不可逆；导出为文档的成本仅一次。

## Consequences

- 正面：记忆系统收敛为**单一家**（Noema）；消除了「每轮自动沉淀用户消息」这一类上下文污染源；
  受管包 20 → 19，交付链少一个需要打补丁的插件。
- 负面/代价：
  - **灵枢的运行时能力消失**（`lingshu_*` 工具、知识飞轮、递归反思、盲区机制、AEIS Python 引擎联动）。
    重启 DSH 后生效；其 seed 内容仅以文档形式存在，不再参与召回。
  - Noema 此前**未被主动使用**（`noema_review_list` 为空）——收敛只是减了负担，不等于记忆能力自动变强。
    若要它真正承担项目记忆，需把 `write_policy` 从 `review` 调为 `auto-safe` 并开始主动写入。
  - `dsh-patches/upstream-issues.md` 的 C-2 与 `docs/research/0*` 里的灵枢条目成为历史记录，
    已按惯例不改写（属当时的现状描述）。
- 后续动作：
  1. **重启 DSH** 使卸载生效；
  2. 决定 Noema 的写入策略（`review` → `auto-safe`？）——这决定它是否真能积累项目知识；
  3. `packaging/scripts/release/1.2.0/` 与 `dsh-patches/package-manifest.json`（2.0.4）仍含灵枢引用，
     属发布存档与失效遗留档，本次不动。
