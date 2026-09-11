---
title: DSH 原生 LoopX 驱动与 GoalBar 设计
status: current
date: 2026-08-20
---

# DSH 原生 LoopX 驱动与 GoalBar 设计

> 本文是 `packages/capabilities/dsh-loopx-plugin/README.md` 第 35 行所引用的版本化设计文档，
> 只对 README 明确点名的两件事负责：**GoalBar 协议**与它的**延迟原子性限制**。
> 文档描述的是**当前实现**（`status: current`），不是提案；每条约束都指向仓库内的真实字面量。
> README 本身仍是行为与安装契约的权威来源，本文不重述它。
> 能力状态（三态标注与实测读数）的唯一事实源是
> [`docs/notes/implemented/capability/2026-09-11-loopx-capability-trial.md`](../notes/implemented/capability/2026-09-11-loopx-capability-trial.md)。

## 分层与职责边界

```text
浏览器 GoalBar（client 行）
   │  /loopx Connection 通道（loopback-only，鉴权后可用）
   ▼
插件 Host（loopx-goalbar 行，包根 = dsh.client 的发现锚点）
   │  固定 argv 的 LoopX CLI 读/写
   ▼
LoopX（Goal / Agent / Todo / quota / thread-binding 的唯一权威）
```

三个 Loader 行的声明在 `cordis.patch.yml`：`loopx-goalbar`、`loopx-init-command`、`loopx-driver`；
`package.json` 的 `dsh.bundle.patch` 指向该文件，`dsh.client.inject` 声明四个客户端依赖。
插件**不自建** Goal/Todo/绑定旁路状态——这是全部设计的前提。

## GoalBar 协议

### 版本与端点字面量

来源：`lib/types/goalbar/protocol.d.ts`。

| 项 | 值 |
| --- | --- |
| 请求版本 | `loopx_goalbar_request_v2` |
| 响应版本 | `loopx_goalbar_response_v2` |
| Connection 通道 | `/loopx` |
| 端点 | `goalbar/read`、`goalbar/watch`、`goalbar/start`、`goalbar/pause` |

四个端点对应四种 op，请求是判别联合（discriminated union）：

- `read`：入参只有 `sessionId`。返回 `GoalBarReadResultV1`。
- `watch`：入参 `sessionId`、`afterSessionEventSeq`、`sourceRevision`、`expected`、`agentStatus`。返回 `GoalBarWatchResultV1`。
- `start` / `pause`：入参 `sessionId` + `expected`（`{ goalId, loopxAgentId }`）。返回 `GoalBarActionResultV1`。

### 读模型：只有唯一活体绑定才渲染

`read` 的结果是三分支，**没有第四种「猜一个」**：

| 结果 | 含义 |
| --- | --- |
| `hidden` / `binding_missing` | 该会话没有绑定 → 不渲染 |
| `hidden` / `binding_ambiguous` | 绑定不唯一（带 `uniquePairCount`）→ 不渲染 |
| `present` | 恰好一条绑定 → 渲染 `GoalBarSnapshotV1` |
| `fault` / `code` | 读失败，六个码之一 |

六个读故障码（`GOALBAR_READ_FAULT_CODES`）：`session_unavailable`、`cli_unavailable`、
`binding_read_failed`、`activation_read_failed`、`todo_read_failed`、`protocol_mismatch`。
四个动作拒绝码（`GOALBAR_ACTION_REJECTION_CODES`）：`binding_mismatch`、`binding_validation_failed`、
`not_actionable`、`action_in_flight`。

绑定的解码规则在 `decodeThreadAgentBindingResolutionV0`：**同一精确 pair 的重复记录先折叠，再做 0 / 1 / >1 判定**；
进程状态（`exitCode`）参与校验，不被吞掉。`Kind` 取值 `missing` / `bound` / `ambiguous`（带 `uniquePairCount`）/ `unavailable`。

### 本地权威路径与隐私

来源：`lib/types/goalbar/read-model.d.ts`。

| 常量 | 值 |
| --- | --- |
| `GOALBAR_HOST_SURFACE` | `deepseek-harness-native` |
| `GOALBAR_PROJECT_REGISTRY` | `.loopx/registry.json` |
| `GOALBAR_ACTIVE_STATE_ROOT` | `.codex/goals` |
| `GOALBAR_ACTIVE_STATE_FILE` | `ACTIVE_GOAL_STATE.md` |

`computeGoalBarSourceRevision` 的约束是**只哈希固定的权威路径**——内容与本地绝对路径都不上线：

1. 读前、读后各观察同一批权威字节，只有两次一致才接受该读模型（`readStableGoalBarModel`）。
2. 并发等长写入或原子替换会让整个模型重读，而不是返回半个快照。
3. `sourceRevision` 变化是客户端重读的唯一触发器；`watch` 的 `source_changed` 语义由此而来。

### watch 契约

`watch` 返回四种结果之一：`source_changed`、`runtime_changed`（带 `agentStatus`）、`timeout`、`fault/session_unavailable`。
`timeout` 不是错误——它是「这段时间没有变化」的正式表达，客户端据此在**有界**读上收口，而不是无限轮询。

## 延迟原子性限制

这一节回答：**一次 `start` / `pause` 动作的结果，插件被允许对外表达成什么。**

### 动作结果联合

`GoalBarActionResultV1` 的关键分支：

| 分支 | 字面量 | 含义 |
| --- | --- | --- |
| `succeeded` | — | LoopX 变更成功，且带回新快照与 `sourceRevision` |
| `rejected` | 四个拒绝码 | 明确拒绝，无副作用 |
| `unknown` | `operation_result_unknown` | **结果不确定**——不知道 LoopX 是否落盘 |
| `applied_with_warning` | `driver_sync_failed` | LoopX 已变更，但会话未同步 |
| `applied_with_warning` | `post_read_failed` | LoopX 已变更，但最新状态读不到 |

### 为什么叫「延迟」原子性

DSH 的会话存储与 LoopX 的注册表**不是同一个事务**，没有两阶段提交。因此插件在实现上取了三个可证伪的立场：

1. **不静默成功**：只要没有拿到与 `expected` 一致的精确绑定，就不回 `succeeded`，也不会渲染成已生效。
2. **不凭空回滚**：LoopX 已落盘而会话未同步时，插件**不**撤销 LoopX 的变更（那会造出第二个不确定），
   而是回 `applied_with_warning` + `driver_sync_failed`，把「需要重新读一次」这件事交给客户端。
3. **不确定就说不知道**：超时或读不回来时回 `unknown/operation_result_unknown`，前端文案要求用户
   **刷新后再判断**，而不是替用户猜。

这三个立场的直接后果：GoalBar 的动作是**至少一次**语义，而不是恰好一次。人类操作者、
Pause、`dispose`、或 pre-step 检查在开工前失败，都不会伪造出写回、花费或作废收据——这条边界与
Driver 的 `onPreStep` 重放检查共同成立（见 `lib/types/driver.d.ts` 的 `LoopXContinuationDriver`）。

### 与 Driver 的衔接

`CONTINUATION_SCHEMA = "loopx_dsh_continuation_v0"` 是自动续跑消息的 schema；
`evaluateActivatedSession` / `cancelQueued` 由 GoalBar 与 Driver 之间的 bridge 共用，
所以「人在 GoalBar 上暂停」与「Driver 计划续跑」落在同一套收据语义里，不会各说各话。

## 激活边界（2026-09-11 实测）

本节记录约束的来源与**反例**，避免后人重复排查。

### Driver 只认两种 typed 会话证据

1. 一条 `user/message`，其 `source` 恰为 `skill-invocation`、`name` 恰为 `loopx`、`form` 恰为 `instructions`；
2. 一次模型 `tool/call`，名为 `skill`、JSON 入参 `name` 恰为 `loopx`，
   且按 call id 配对到一条**成功**的 `tool/result`。

**不算证据**：技能目录里存在该技能、散文里提到它、shell 文本、`/loopx-init`、插件自造的 init 或 heartbeat 消息、
失败/畸形/未配对/被取代的模型调用，以及「CLI / registry / Goal / 绑定 / 项目文件存在」。

### 实测约束一：插件实际调用的 CLI 面

插件解析出的可执行面（`resolvePluginLoopXCommand`）为
`python3 ~/.agents/runtime/dsh-loopx-plugin/loopx_cli.py`，版本 `loopx 0.5.4`——
**即插件托管的副本站，不是 PATH 上的 `loopx`**。解析顺序是：`LOOPX_BIN` → 托管 launcher → `loopx` → `python3 -m loopx.cli`，
逐个跑 `--version` 并要求输出以 `loopx ` 开头。据此排障时不要只看 `which loopx`。

### 实测约束二：绑定解析要求恰一条匹配

Driver 侧的绑定解析走 `resolve-agent-thread`（`--host-surface deepseek-harness-native` + `--thread-id <DSH_SESSION_ID>`），
并要求**恰好一条** Goal/Agent 匹配。实测一次真实 goal：
`status=bound`、`goal_id=magpie-horch-goal`、`agent_id=magpie-horch-native-1`、`matches=1` → 满足渲染前提。
0 条落到 `binding_missing`，多于 1 条落到 `binding_ambiguous`。

### 反例：环境遮蔽会让 Driver 永远不合格

2026-09-11 实测发现，agent preset 的技能子集（`dsh-skill-subset` + `hideOthers`）会把该 preset 作用域内的
其他技能注册为 `modelInvocable: false` / `userInvocable: false`。此时 `loopx` 技能**存在但不可调用**：
`skill(loopx)` 报 `not available for model invocation`，于是两种 typed 证据都无从产生，Driver 永不合格。

**排查顺序**：先确认技能**可调用**，再确认「CLI 可跑、绑定唯一」。
只证明后者会得出「一切就绪但 Driver 就是不启动」的错误结论。安装插件、启动 DSH、建出 goal、
存在 registry，**都不创建绑定、也不激活 Driver**。

## 已知缺口

- `docs/architecture.md` 承诺的「文档相对链接与锚点可达」这条契约级校验尚未在 `scripts/gate.mjs` 落地
  （目前只有 `adr-note-links` 覆盖 ADR→Note 一条链）。本文所属链接曾因此长期失效而门禁全绿，
  且包归位（`a813982`）造成 README 相对层级失效时同样无人拦截。
- 本文没有机器接缝：实现漂移不会自动报警。上述缺口与它是同一根因。
