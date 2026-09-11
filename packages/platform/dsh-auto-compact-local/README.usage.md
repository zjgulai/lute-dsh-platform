# dsh-auto-compact 使用说明（本地安装记录）

> 上游：[wangxiang0605qvq/dsh-auto-compact](https://github.com/wangxiang0605qvq/dsh-auto-compact)（MIT，main@2026-08-13 锁定）。
> 安装机制 A（profile 本地副本 + cordis.patch.yml insert），2026-08-30 完成评估与安装。
> 本文档不覆盖上游 README，仅记录本机用法与迭代方向。

## 使用方法

- **触发**：模型在回合内调用 `compact_now` 工具（无参数）。返回：
  - `{ ok: true, status: "scheduled" }` —— 已调度，**当前回合结束后**（agent 空闲时）自动执行压缩；
  - `{ ok: false, reason }` —— 压缩服务不可用（如 minimal 预设）。
- **结果**：压缩 checkpoint（`compaction/start` 标记 + 摘要）写入会话日志，模型可从后续上下文看到。
- **适用场景**：模型预感到上下文即将吃紧、或刚完成一个大阶段，主动腾空间——与官方"压力触发"自动压缩、"`/compact`"手动命令互补。

## 相关说明

- **安装位置**：`~/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-auto-compact`（private 包，不走 pnpm）+ `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾 `- insert: [{id: auto-compact, name: "@deepseek-ai/dsh-auto-compact"}]`。
- **生效**：重启 DSH Desktop 后生效；启动健康 `rendererStatus: healthy`，日志无 auto-compact 报错。
- **兼容性评估结论**（对照本机 alpha 0.1.2-alpha.1 逐项实测，全部通过）：`defineTool` 契约、`ManualCompactionError("busy")`、`agents.requireInitiator()`（返回 ReactLoopAgent，含 `whenIdle`/`runMaintenance`）、`compaction.compactNow(agent, signal)`、服务 `tools/agents/timer`。
- **回滚**：从 `cordis.patch.yml` 删除 `auto-compact` insert 段 + 删除 `node_modules/@deepseek-ai/dsh-auto-compact` 目录，重启。
- **升级后重装**：桌面升级重打包会清掉 profile 副本 → 从本目录重新 `cp -R . ~/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-auto-compact/`，patch 条目若被重置则重加。
- **已知小瑕疵**：后台压缩若最终失败，其错误结果被丢弃（工具已提前返回 scheduled）；但成功时 checkpoint 正常入日志，失败时也**不会**影响主回合。

## 2026-08-30 修复：alpha.1 隔离域寻址（compact_now 返回 "compaction service is unavailable"）

**根因**：0.1.2-alpha.1 把 compaction 后端从宿主平面移走——`@deepseek-ai/dsh-web-app` 的 bundle 补丁将宿主行 `compaction-basic` / `command-compact` 置为 `disabled: true`，改由每个 agent 预设（standard/cordis）在 entry-local `isolate` 域内挂载。dsh-agent-presets 源码明示：该域对「agent 自身的 scope ctx 与宿主」均不可见。本插件（rc.6 时代上游）用 `agent.ctx.get("compaction")` 取服务，在 alpha.1 上必然返回 undefined → 工具报"压缩服务不可用"。

**修复**：`execute()` 改用预设名册的官方只读通道 `ctx.get("agentPresets")?.serviceFor(agent, "compaction")`（dsh-agent-presets 服务，web-app 补丁插入宿主根），并保留 `agent.ctx.get("compaction")` 回退以兼容 rc.6 宿主平面组合。已同步至 `~/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-auto-compact/lib/index.js`。

**生效**：重启 DSH Desktop（loader 行在启动时挂载，patchReload live 只热载补丁 YAML，不热载模块代码）。重启后在会话中调用 `compact_now` 验证：应返回 `{ok:true, status:"scheduled"}`，回合结束后会话日志出现 `compaction/start` 标记与摘要。

## 迭代优化方向

1. 后台任务结果回报：`runWhenIdle()` 的终态（done/failed/no-compactable-history）目前被丢弃，可改为写入会话日志的一条可读消息（让模型知道压缩最终成败）。
2. 与官方溢出恢复的联动：溢出发生且官方恢复重试耗尽时，可提示模型调用 `compact_now`。
3. 上游维护较弱（1★、单次提交）——长期可 fork 至自有仓库锁定提交，或等官方提供"模型主动压缩"入口后退役本插件。
