# LUTE 重构主线 · 目标与 Loop 拆解

> 本文件是重构主线的**唯一执行契约**：目标、验收标准、loop 定义与当前进度。
> 决策依据见 [ADR-0007](../adr/ADR-0007.md)（三期推进）；进度为手工维护的事实，**每周与实际门禁输出对齐一次**。

## 1. 终态目标（一句话）

**让「改坏了」在提交前被机器发现，而不是在客户现场被人工发现。**

当前仓库的真实状态是这个目标的反面：20 个受管包中曾只有 5 个能被机器证明没坏；35 个补丁的正确性由人工冒烟担保；文档与真相脱节。重构主线就是把这条从「人工判断」搬到「机器证据」。

## 2. 可度量的验收标准（终态）

| # | 标准 | 度量方式 | 当前 |
| --- | --- | --- | --- |
| A1 | 每个受管包都能被机器证明 | `gate --mode full` 的 `scripts-runnable` 零失败 | 4 条豁免未清；**typecheck 已全部 0 错** |
| A2 | 契约无隐性豁免 | `scripts/gates/exemptions.json` 为空数组 | 4 条 |
| A3 | 单命令给出全部证据 | `node scripts/gate.mjs --mode quick` 退出码 0 | ✅ 12/12 |
| A4 | 文档无重复事实 | 同一结论只有一个 home，链接由 `adr-note-links` 校验 | ✅ |
| A5 | 结构无静默失管 | `index-drift` / `nested-repos` / `dependency-links` 零失败 | ✅ |
| A6 | 基座可检索 | harness 只读参照系 + pin 一致（`pin-consistency`） | ✅ |
| A7 | 决策有留痕 | 非机械改动同 PR 附 Note；ADR 编号连续 | ✅ ADR-0001~0017 |

**A1 + A2 是主线尚未完成的两项**，也是 Loop 1–4 的全部内容。

## 3. Loop 定义

循环体固定为 **优化 → 测试 → 验收**，每轮闭环一个可独立验收的单元：

```
┌─ Loop N ─────────────────────────────────────────────┐
│ ① 优化：按证据修一个缺陷 / 补一个包的契约             │
│ ② 测试：同一测试的真实 Red → Green（禁止先写实现）     │
│ ③ 验收：包级脚本非零即失败 + 门禁全绿 + 证据入提交信息  │
└──────────────────────────────────────────────────────┘
  退出条件：该单元从 exemptions.json 移除且门禁保持 12/12
```

### Loop 1 · 契约清账（进行中）
**范围**：15 个豁免包补齐 `typecheck` + `test`，逐条删除豁免。
**顺序**：按包体量从小到大（小包先闭环，快速积累可复用的测试基建）。
**退出门**：`exemptions.json` 为空 + `gate --mode full` 全绿。

### Loop 2 · 补丁层可持续性
**范围**：`dsh-patches/` 的 35 个补丁锚点与 pin 门禁从脚本注释提升为门禁校验项。
**退出门**：锚点数与 pin 的对应关系可机器校验；上游窗口重锚有清单可依。

### Loop 3 · 能力闭环（需求侧）
**范围**：对 0 调用能力（LoopX 等）做真实试运行，跑通升正式、跑不通降 beta 并在能力墙标注。
**退出门**：每个能力有「正式 / beta / 废弃」三态标注且与真实调用一致。

### Loop 4 · 数据与记忆工程
**范围**：三记忆库（noema / 灵枢 / memory 插件）的写入策略对齐与来源域标注；V2→V3 迁移按 ADR-0006 红线制触发。
**退出门**：写入策略文档化 + 迁移结论入 ADR。

### 持续机制（每轮固定动作，非 loop）
每次上游窗口：verify 漂移探测 → 重锚预算 → 强制退役 ≥3 → manifest 冻结。

## 4. 进度

| Loop | 状态 | 备注 |
| --- | --- | --- |
| Loop 1 契约清账 | 进行中 | 达标 **17/20**，豁免 3 条；18 个受管包 typecheck 全部 0 错 |
| Loop 2 补丁层 | 未开始 | 依赖上游窗口节奏 |
| Loop 3 能力闭环 | 未开始 | 需真实业务场景 |
| Loop 4 数据工程 | 未开始 | 外部依赖：上游 0.1.5 |

### 最近闭环记录

| 包 | 测试 | typecheck | 提交 |
| --- | --- | --- | --- |
| `contract/dsh-skill-subset` | 7 | 0（修 12 处） | fb6098e |
| `platform/dsh-theme-local` | 20 | 0（修 21 处） | 074bd41 |
| `platform/dsh-ui-polish-local` | 3 | 0 | 8e41eb8 |
| `platform/dsh-rename-conversations` | 5 | 0（修 9 处） | a5b3792 |
| `platform/dsh-auto-compact-local` | 7 | 0（修 1 处：非法 tool kind） | 9446cfe |
| `platform/dsh-file-upload-local` | 9 | 0（测试改为真实注册） | 87aba04 |
| `contract/dsh-preset-lint-local` | 6 | 0（修 5 处：linter 随包发布） | 4f97139 |
| `surfaces/dsh-my-quotes` | 10 | 0（修 1 处） | f6caa1c |
| `surfaces/dsh-task-board-local` | 7 | 0（修父任务层级丢失） | ab2907b |
| `capabilities/dsh-overseas-tools` | 8 | 0（修 8 处） | 941d478 |
| `infra/dsh-team-hub` | 72（已有） | 0（修 31 处） | 7836736 |
| `capabilities/dsh-loopx-plugin` | 6 | 0（替换 8 个死脚本） | d4fd833 |
| `capabilities/dsh-browser-local` | 111 | 0（类型身份根治） | 63ad75d |
| `surfaces/dsh-agent-team-gui-local` | 119+66 | 0（本地契约） | bbf9150 |
| `capabilities/dsh-memory-local` | 10 | 0（消除假绿） | a23e84c |
| `surfaces/dsh-skill-center-local` | 74 | 0（localStorage 环境） | a23e84c |
| `capabilities/dsh-wanzh-hulian` | 10 | 0（117 → 0） | 47f8ea4 |

### 剩余豁免（3 条）

| 包 | typecheck | 卡点 |
| --- | --- | --- |
| `deepresearch-local` | **0** ✅ | test 46/48；2 个真实 Cordis 组合用例失败（`Runner failed: … reading 'id'`） |
| `browser-local` | **0** ✅ | test 111/111 通过，2 个套件需 cordis 插件装载的完整依赖闭包（`safe-buffer` 等非顶层） |
| `overseas-skills` | 未动 | 大包（1533 文件） |

**性质变化**：剩余条目的卡点已从「类型」转为「测试环境 / 依赖获取 / 大包工作量」。

### 已定位的结构性阻塞（Loop 1.4 的前置条件）

**DSH 类型经符号链接供给导致的「同一类型两个身份」问题。**

现象：在 `dsh-browser-local` 上，`@deepseek-ai/dsh-tools` 与
`@deepseek-ai/dsh-api-gateway` 的同一接口在 tsc 中分裂为两个身份，报
「同名却互不兼容」。实测过程：

| 探测 | 结果 |
| --- | --- |
| 关闭 `preserveSymlinks` | 报错按**物理路径**呈现（node_modules/…/lib/types/index） |
| 开启 `preserveSymlinks` | 报错按**包名路径**呈现（@deepseek-ai/dsh-tools） |
| 移除 `declare module` 增强、改用本地扩展接口 | `TypertGateway` 的 3 个错误**全部消除** |
| 用裸导入的 `ToolDefinition` 与注册器参数比对 | `output` 可选 vs 必需——两份同源声明内容不同 |

结论：符号链接 + `preserveSymlinks` 使「同一物理文件」在 tsc 中获得两个模块身份，
声明内容因此不可互换。**根治方向（ADR-0017 的下一步）**：从内建运行时 tgz
（`vendor/dsh-desktop/vendor/dsh-runtime/0.1.2-rc.1/*.tgz`，自带完整 `.d.ts`）
安装 DSH 依赖，并用 `paths` 统一解析——让类型检查与运行时共用同一物理路径，
消除身份分裂。`browser` / `deepresearch` / `agent-team-gui` / `wanzh-hulian`
四个包的剩余错误均属此类，建议在 Loop 1.4 一次性解决。
