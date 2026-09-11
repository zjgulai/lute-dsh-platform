# LoopX 能力试运行与三态标注（Loop 3.1）

> 本文件是 LoopX 能力状态的**唯一事实源**（ADR-0009）。
> 实测时间：2026-09-11。每条结论后附复现命令。

## 0. 三态标注

| 能力 | 标注 | 依据 |
| --- | --- | --- |
| **LoopX CLI（`loopx` 命令）** | ✅ **正式** | 安装成功、`doctor` 全项通过、`connect`/`status` 真实建库并校验契约 |
| **DSH 侧 `dsh-loopx-plugin` · 技能可调用 + Driver 激活** | ✅ **正式** | 技能在会话目录内可加载；Driver 认下 typed 证据并把心跳任务真实排进本会话（见 §5） |
| **DSH 侧 `dsh-loopx-plugin` · GoalBar 渲染** | 🟡 **beta（仅剩此项）** | 渲染需浏览器观察，本会话 browser bridge 无扩展连接，无法取证 |
| 其余 0 调用能力 | 未评估 | 本 Loop 只覆盖 LoopX |

**为什么 GoalBar 仍单独标 beta**：验收标准是「跑通升正式」，而 GoalBar 的可见性只在浏览器里成立。
它的读通道已确认存在且鉴权加固（`curl :43120/loopx` → 401），但「是否渲染出那一行」**没有实测过的事不标正式**。
插件整体可视为「本地闭环已通、UI 面待一次目视确认」。

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

## 5. Driver 激活实录（2026-09-11 第四轮）

第 4 节留下的最后一跳在本轮打通。三次重启各自暴露一层问题，**每一层都只能靠实测发现**：

| 轮次 | `skill(loopx)` 结果 | 真实成因 |
| --- | --- | --- |
| 初始 | `not available for model invocation` | preset 的 `dsh-skill-subset` 把该技能注册为 `modelInvocable: false` / `userInvocable: false` |
| 改白名单后 | `unknown or no longer available` | 遮蔽项消失，但 `~/.dsh/skills` **不在 preset 作用域**（`includeDefaultRoots: false`），技能彻底不可见 |
| 再把 `positiveSource` 改 `'dir'` | 技能可见，点开抛 `loaded skill "loopx" source must be a string` | subset 插件自己 `register()` 的对象**缺 `source`/`provider`**，点开即触发 `dsh-skill` 的 `validateDefinition` |
| 最终（两条腿分职） | ✅ **成功加载 2388 字节 SKILL.md** | 文件系统 provider 供技能（带完整字段）+ subset 只做白名单遮蔽（`positiveSource: 'none'`） |

**最终配置**（`~/.dsh/.agent-presets/ai-product-developer/agent.cordis.yml`，相对原始仅两处改动）：

```yaml
- id: skill-subset
  config:
    skills: ['grill-me', 'tdd', 'to-spec', 'loopx']   # ← 加 loopx
- id: skill-filesystem
  config:
    customSkillDirs:
      - !!js "...new URL('skills/', baseUrl)..."       # preset 自带（原有）
      - !!js "...homedir() + '/.dsh/skills/'..."       # ← 加全局技能目录（loopx 在这里）
```

**Driver 激活的实测证据链**（按顺序，全部为真实读数）：

1. 技能目录里出现 `loopx`（会话目录已更新）。
2. 一次成功的 `skill` 工具调用 —— 满足 Driver 认的第二种 typed 证据（`tool/call` name=`skill` + 配对的成功 `tool/result`）。
3. 绑定仍为唯一：`resolve-agent-thread` → `status=bound`、`matches=1`。
4. **Driver 把心跳任务真实排进了本会话**，正文以 `Advance magpie-horch-goal from the registry-declared active state` 开头，
   携带 `LOOPX_TURN=dsh-loopx-48350045-…`、`quota should-run` 命令、`settlement_plan` 引用与写回契约。
   这是「插件与 LoopX 双向接通」的直接证据，而非配置推断。
5. `quota should-run`（带该 turn-instance-id）→ `execution_obligation.must_attempt_work: true`、
   `interaction_contract.mode: bounded_delivery`、`agent_channel.must_attempt: true`。

**同轮发现的两处契约落差（如实登记，均未修）**：

- 心跳正文要求「execute `interaction_contract.cli_channel.settlement_plan.ordered_steps`」，
  但实际收据中 **`settlement_plan` 不存在**（全文 `settlement_plan` 出现 0 次、`ordered_steps` 0 次），
  且 `next_cli_actions` 为空、`spend_allowed_now` 与 `spend_after_validation` 均为 `false`。
  即「按 todo 绑定后应当给出结算计划」这一步在 LoopX 1.0.3（插件托管面 0.5.4）上**没有真的产出**。
  本轮据此改为按 `protocol_action_packet` 的 `agent_action` 执行 bounded slice 并用 `todo complete --evidence` 写回。
- `agent_channel.resolution_trace.summary` 报 `source=agent_lane drift=true`，但同一份收据的
  `agent_lane_next_action` 又给出了确切条目——两处口径不一致，未追究。

### `loopx check` 的 29 条 findings：逐条定性（全部不可行动）

`loopx check --scan-root <repo>` 返回 `ok=false`、`errors=29 / warnings=0 / checks=6`（退出码 1），
`goal_errors` 为空、**29 条全在 `global_errors`**，`code` 只有两种。逐条定性后**没有一条落在可写的受管范围**：

| 条数 | 位置 | 性质 | 可否行动 |
| --- | --- | --- | --- |
| 12 | `vendor/`（+2 条 `local_private_path`） | pin 住的只读上游参照系 `a66e470` | ❌ ADR-0008：参照系只读 |
| 6 | `.dsh-types/` | 生成物（类型输出，非手改目标） | ❌ 重生成即覆盖 |
| 6 | `packaging/` | 构建暂存快照 | ❌ 暂存产物 |
| 3 | `packages/` | 环境变量间接引用示例（`` !!js '`Bearer ${process.env.MCP_TOKEN}`' ``） | ❌ 非字面量秘密 |
| 2 | `vendor/…/docs/postmortem/0003-*.md:17`（`local_private_path`） | 上游文档记录的**他人**机器路径（`/Users/tn.shen/…`） | ❌ 上游内容且不含本机信息 |

两条独立反向核验支持「误报」判定：受管 `packages/` 下**零**高熵凭据模式
（`sk-` / `ghp_` / `AKIA` / `xox*`）；被 `check` 命中的 29 个文件里**没有**「字段名 + ≥24 字符字面量」形态。
`check` 自身也报告 `credential references downgraded: 56 non-literal hits`。

### Driver 驱动回合暴露的四处 LoopX 契约落差（均未修，附复现）

自动续跑一共跑了两个 turn，每一步都撞在控制面与文档不一致的地方。全部为实测，附错误码与复现要点：

| # | 现象 | 错误码 / 证据 | 影响 |
| --- | --- | --- | --- |
| 1 | 心跳正文要求执行 `interaction_contract.cli_channel.settlement_plan.ordered_steps`，但收据里 `settlement_plan` **不存在**（全文 0 次），`next_cli_actions` 为空、两个 spend 闸门皆 `false` | 全文搜 `settlement_plan` / `ordered_steps` 均 0 命中 | 照文执行无从下手；实际有序步骤要**再跑一次** `quota should-run --todo-id … --material-change` 才产出 |
| 2 | 产出的 ordered steps 里 `todo_id` 指向**下一条**待办而非已结算那条 | `settlement binding does not match the original quota guard: receipt todo=todo_f92fed2643a6 … requested todo=todo_fa501099a20c` | 逐字照抄 `next_cli_actions` 必然失败；换成 guard 收据身份后两步均 `appended=true` |
| 3 | 同一 turn 内二次 `quota should-run` 无法提交收据 | `error_code=heartbeat_receipt_identity_conflict`、`state=blocked_health`、`heartbeat_receipt.status=write_failed`、`reason=…settlement identity conflicts with the current autonomous replan obligation`、退出码 1 | 与 `repair-patterns.md` 的 `scheduler_followup_turn_projection_gap` 一致（「Todo-less replan Turn 一旦 durable 结算，应由 fresh Turn 接管」）——**换新 turn 身份即 committed、退出码 0**，故属 turn 作用域而非全局死锁 |
| 4 | `completed_advancement_without_successor` 义务：三条 todo 全部 `--no-follow-up` 结清后，**新 turn 仍要求 `autonomous_replan_required`** | `trigger_count=5`、`replan_obligation.obligation_id=replan-fbc72c7f13570993`、`must_attempt_work=true` | 无真实可执行后继时该义务不会因 settle 而收敛；契约本身写着「otherwise record an accepted typed semantic or coverage-backed terminal outcome」，但 CLI 未给出对应命令 |

**这四条都不该由本仓库修**（LoopX 是独立开源项目，且插件托管面 0.5.4 落后于 PATH 上 1.0.3）。
登记在此是为了让下一次遇到同样现象的人能立刻对上号，而不是重新排查一遍。

### 终结义务的正确写法（可复用，含一个会拦人的陷阱）

`autonomous_replan_required` 义务**不会**因 `todo complete --no-follow-up` 而清除。它的收敛是**分批**的
（实测 `trigger_count` 单调下降：5 → 2 → 1），最后需要一个 **coverage-backed terminal outcome**。
下面这组参数是实测通过（`ok=true, appended=true`，`vision_checkpoint.decision=patched`、
`delivery_boundary=semantic_closeout`）的确切形状：

```bash
loopx refresh-state --goal-id <goal> \
  --progress-scope agent_lane --classification bounded_replan_progress \
  --progress-result-class no_followup \
  --progress-surface-id <surface> --progress-hypothesis-id <hypothesis> \
  --progress-probe-kind read_only_cli_verification \
  --progress-coverage-scope-id agent_lane_todo_set --progress-coverage-complete \
  --progress-evidence-id <evidence> \
  --repair-delta-kind no_followup --autonomous-replan-recorded \
  --agent-vision-json <PATH-TO-JSON> --agent-id <agent>
```

逐级被拒的过程本身就是文档（每一步的报错都指明了缺什么）：

1. `--progress-result-class no_followup` 单独用 → 要求 `--progress-coverage-scope-id`；
2. 补上后 → 要求 `agent_vision.state=no_followup` **且** `path_delta.outcome=stop`；
3. 缺 `path_delta.prior_assumption` / `observed_reality`（各限 220 字符）→ 补上即通过；
4. `--agent-vision-json` 收的是**文件路径**不是 JSON 字符串（直接传字符串会报 `File name too long`）。

**陷阱（实测踩中，会拦住任何写入者）**：`loopx/authority.py` 的 `PRIVATE_TEXT_PATTERNS` 里有一条
`\bAuthorization\b`（大小写不敏感），于是**普通英文词 "authorization" 也会被判为私有值**并整条拒绝写入。
同类还会误伤的是 `Bearer`、`token =`、`password`、`secret`、`/Users/`。我把 "owner authorization" 改成
"owner sign-off" 才通过。写 `--vision-*` 字段前建议先用解释器把 payload 过一遍这批正则：

```python
from loopx.authority import PRIVATE_TEXT_PATTERNS   # 需先 sys.path 指向插件托管面 site-packages
```

**仍未取证的一项**：GoalBar 是否在会话底部渲染出 `Goal magpie-horch-goal` + 进度。需要浏览器侧目视。

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
