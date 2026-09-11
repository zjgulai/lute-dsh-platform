# LoopX 能力试运行与三态标注（Loop 3.1）

> 本文件是 LoopX 能力状态的**唯一事实源**（ADR-0009）。
> 实测时间：2026-09-11。每条结论后附复现命令。

## 0. 三态标注

| 能力 | 标注 | 依据 |
| --- | --- | --- |
| **LoopX CLI（`loopx` 命令）** | ✅ **正式** | 安装成功、`doctor` 全项通过、`connect`/`status` 真实建库并校验契约 |
| **DSH 侧 `dsh-loopx-plugin` 绑定闭环** | 🟡 **beta（收窄）** | 绑定侧已实测打通（见 §4）；差「Driver 激活 + GoalBar 渲染」最后一跳——被 preset 技能遮蔽挡住，待重启 DSH 后验证 |
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

- **GoalBar 渲染未验证**：绑定侧已打通（§4），但 Driver 激活被 preset 技能遮蔽挡住；
  升级 preset 后需重启 DSH，在会话内真实调用一次 `loopx` 技能，确认 GoalBar 出现。
  升正式的条件就是这一步跑通。
- `loopx slash-commands --install` 未执行（LoopX 建议的技能交付修复）。
- 本 Loop 只覆盖 LoopX；「其余 0 调用能力」尚未盘点。

## 4. 真实 goal 实测（2026-09-11 第二轮）

在**本仓库内**建真实 goal 并绑定当前会话（不再用空探针目录）：

| 步骤 | 命令 | 实测结果 |
| --- | --- | --- |
| 引导包 | `loopx_cli.py start-goal --guided` | `read_only: true`，返回 ordered steps / 身份闸门 |
| 建项目状态 | `bootstrap --project . --goal-id magpie-horch-goal …` | 写出 `.loopx/registry.json` + `.codex/goals/magpie-horch-goal/ACTIVE_GOAL_STATE.md` |
| 注册身份 | `register-agent --goal-id … --agent-id magpie-horch-native-1 --require-new --execute` | `changed=true`、`registration_readback.verified=true`、全局 registry 同步 |
| 绑定 thread | `bind-agent-thread --thread-id "$DSH_SESSION_ID" --host-surface deepseek-harness-native --execute` | `binding.status = bound` |
| 复算绑定 | `resolve-agent-thread`（Driver 同款命令） | `status=bound`、`goal_id=magpie-horch-goal`、`matches=1` |
| 状态契约 | `loopx status` | `contract: ok=True, errors=0, warnings=0` |
| 插件通道 | `curl -i :43120/loopx` | `HTTP 401 unauthorized`（通道已注册且鉴权加固生效） |
| 插件 CLI 面 | 调插件自身 `resolvePluginLoopXCommand` | `python3 ~/.agents/runtime/dsh-loopx-plugin/loopx_cli.py`（`loopx 0.5.4`）——**不是 PATH 上的 `loopx`** |

`.loopx/` 与 `.codex/` 落在仓库内但**未被 git 看见**：`.gitignore` 是白名单式（`*` + `!*/`），天然排除，无需新增规则。

**Driver 未激活的根因（已定位）**：agent preset `ai-product-developer` 的 `dsh-skill-subset`
配 `skills: ['grill-me','tdd','to-spec']` + `hideOthers: true`，把该 preset 作用域内**其余全部技能**
（含 `loopx`）注册为 `modelInvocable: false` / `userInvocable: false`。实测 `skill(loopx)` 报
`not available for model invocation` → 两种 typed 激活证据都无从产生 → Driver 永不合格。
已把 `loopx` 加入该 preset 的技能子集（`~/.dsh/.agent-presets/ai-product-developer/agent.cordis.yml`，
备份 `.bak-pre-loopx`）；preset 的 skill-subset 行只在 DSH 进程启动时挂载，**需重启生效**。

> 设计契约（GoalBar 协议、延迟原子性限制、激活边界与上述反例）已落成文档：
> [`docs/plans/2026-08-20-dsh-native-skill-driver.md`](../../../plans/2026-08-20-dsh-native-skill-driver.md)（ADR-0009 单一事实源）。

## 5. 决策记录：补写被引用的设计文档（2026-09-11 第三轮）

### Problem

`dsh-loopx-plugin/README.md` 第 35 行把 GoalBar 协议与延迟原子性限制指向
`docs/plans/2026-08-20-dsh-native-skill-driver.md`，但该文件不存在、且**从未进入 git 历史**（`git log --all -- docs/plans` 为空），
上游 tgz 内也未带 docs，内容不可恢复。实测进一步发现**第二处缺陷**：README 经 `a813982` 按能力五组归位后，
其 `../../docs/plans/` 解析到 `packages/docs/plans/`（需要 `../../../`）——归位让相对层级失效，
即补上文档也仍指向错误目录。两处缺陷叠加的结果是：**关键契约在仓库内没有可核对来源，而死链能通过门禁 12/12。**

### Decision

1. 在仓库根写就 `docs/plans/2026-08-20-dsh-native-skill-driver.md`，只覆盖 README 点名的事——
   **GoalBar 协议**（版本字面量、四个端点、三分支读模型、隐私下的 sourceRevision）与**延迟原子性限制**
   （`applied_with_warning` / `unknown` 各分支的语义与「不静默成功、不凭空回滚、不确定就说不知道」三条立场）。
2. 写入本轮实测的三条硬约束（插件实际调用的 CLI 面、绑定要求恰一条匹配、Driver 的两种 typed 证据）与一个**反例**
   （preset 技能遮蔽 → Driver 永不合格），使文档从「重述 README」变成有实测依据的版本化设计。
3. README 的唯一改动是把 `../../` 补成 `../../../`（层级修正），**不改措辞、不删链接、不改链接文字**。
4. **不在本次加门禁校验**：本切片产物是文档、无机器接缝，同切片内既加校验又加被校验对象会让 Red/Green 变成自我发证。
   「门禁缺通用 Markdown 链接校验」记为已知缺口，另开一轮。

### Alternatives considered

- **A 重建完整设计文档**（含 Driver 全部边界）：否决——会凭空「重建」一份没有原始输入的上游文档，容易写成事后合理化。
- **C 只消灭死链**（把链接改指 `lib/types/goalbar/protocol.d.ts`）：否决——README 那句
  「specified in the versioned … design」会变成指向类型声明文件，语义不成立。
- **把文档建在 README 字面量指向的 `packages/docs/plans/`**：否决——那是在为一个错误路径将错就错，
  且把文档放到了 `docs/` 主脊柱之外。
- **登记为门禁豁免**：不可行——`scripts/gates/exemptions.json` 已是空数组（三期达标），
  且该文件只减不增、到期即拒（ADR-0014）。

### Consequences

- 正面：README → 文档 → 事实源 Note 形成可达闭环；两条关键约束第一次在仓库内有据可查；
  README 的层级缺陷被同一个断言抓住（该断言还当场抓出我本 Note 里写错的一处 `../../`）。
- 负面/代价：文档没有机器接缝，实现漂移不会自动报警——与「门禁缺 doc-links 校验」同一根因，接受并登记为已知缺口。
- 后续动作：下一轮独立评估是否给 `scripts/gate.mjs` 加 `doc-links` 校验（会立刻扫全仓，需先决定既有死链是修还是登记）。
