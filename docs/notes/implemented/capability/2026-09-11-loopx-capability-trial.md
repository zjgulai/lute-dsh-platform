# LoopX 能力试运行与三态标注（Loop 3.1）

> 本文件是 LoopX 能力状态的**唯一事实源**（ADR-0009）。
> 实测时间：2026-09-11。每条结论后附复现命令。

## 0. 三态标注

| 能力 | 标注 | 依据 |
| --- | --- | --- |
| **LoopX CLI（`loopx` 命令）** | ✅ **正式** | 安装成功、`doctor` 全项通过、`connect`/`status` 真实建库并校验契约 |
| **DSH 侧 `dsh-loopx-plugin` 绑定闭环** | 🟡 **beta** | CLI 与插件均就位，但「活体 Session 里建 goal 并让插件渲染 GoalBar」未验证——需一次真实长程会话，本轮未做 |
| 其余 0 调用能力 | 未评估 | 本 Loop 只覆盖 LoopX |

**为什么插件是 beta 而不是正式**：验收标准是「跑通升正式」。CLI 那半跑通了；
插件那半要求「一个确切的活体 `(goalId, loopxAgentId)` 绑定」，而该绑定只在
真实 Session 里产生——**没有验证过的事不标正式**。

## 1. 安装（可复现）

LoopX 的宿主前置是 **Python 3.11+**（本机 3.14.7 满足），PyPI 包名 `loopx`。

```bash
python3 -m venv ~/.dsh/loopx-venv
~/.dsh/loopx-venv/bin/python -m pip install --upgrade pip
~/.dsh/loopx-venv/bin/python -m pip install loopx
# 让默认 PATH 可见（见下「为什么不用 --user」）
ln -sf ~/.dsh/loopx-venv/bin/loopx ~/.local/bin/loopx
```

**为什么不用 `pip install --user`**：本机 Homebrew Python 受 PEP 668
（externally-managed-environment）保护，`--user` 安装被拒。改用「独立 venv +
`~/.local/bin` 符号链接」——`~/.local/bin` 已在默认 PATH 中，且 venv 的入口
shebang 指向 venv 内的解释器，因此链接后从任何 shell 调用都能正常启动。

**复现验证**：

```bash
loopx --version          # → loopx 1.0.3
command -v loopx         # → /Users/lute/.local/bin/loopx
```

## 2. 试运行证据

### 2.1 `loopx doctor`（安装自检）

```
- ok: `True`
- python: `/Users/lute/.dsh/loopx-venv/bin/python`
- typescript_control_plane: `ready`
- command_available (required): `True`
- runtime_projection_routes_healthy: `True`
- skill_delivery_status: `repair_recommended`
```

`skill_delivery_status: repair_recommended` 是 LoopX 自报的技能交付建议状态，
修法是 `loopx slash-commands --install`（本 Loop 未执行——它改动宿主技能文件，
属独立动作，需单独确认）。

### 2.2 真实操作：`connect` + `status`

在空目录里跑（不改本仓库）：

```
$ loopx connect
# LoopX Bootstrap
- ok: `True`
- project: `/private/tmp/loopx-probe-c2S4`
- goal_id: `loopx-probe-c2s4-goal`
- registry: `.../.loopx/registry.json`
- state_file: `.../.codex/goals/<goal>/ACTIVE_GOAL_STATE.md`

$ loopx status
- goals: `1`
- runs: `0`
- contract: ok=True, errors=0, warnings=0, checks=7
- global_registry: available=True, ok=True, findings=0, high=0
- runtime_projection_routes: healthy=True
```

**即**：`connect` 真的建出了 registry 与 goal 状态文件（`.loopx/`、`.codex/goals/`），
`status` 的契约校验 7/7 通过、无 error/warning。这是「跑通」的证据，不是安装成功的
推断。探针目录已删除；`~/.codex/loopx`（LoopX 运行时根）保留。

### 2.3 仓库侧集成

`dsh-loopx-plugin`（本仓库 `packages/capabilities/dsh-loopx-plugin`）是 **DSH 的集成层**，
不是 LoopX 本体——它提供回环受限的 `/loopx` 连接通道与一个 GoalBar 客户端组件。
其 README 写明两个关键语义：

- 安装插件并启动 DSH「**既不创建绑定也不激活 Driver**」；
- GoalBar「只对一个确切的活体 `(goalId, loopxAgentId)` 绑定渲染」。

因此**插件能否闭环，取决于一次真实会话**。这是把它标为 beta 的原因。

## 3. 未竟项

- **DSH 插件绑定闭环未验证**：需在真实 Session 里建 goal、让插件检出 LoopX 入口并
  渲染 GoalBar。升正式的条件就是这一步跑通。
- `loopx slash-commands --install` 未执行（LoopX 建议的技能交付修复）。
- 本 Loop 只覆盖 LoopX；「其余 0 调用能力」尚未盘点。
