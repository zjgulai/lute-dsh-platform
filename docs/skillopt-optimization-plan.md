# SkillOpt 式深度优化 · 完整方案（待实施）

> 状态：方案定稿。决策：三层全做 / 严格改善才接受 / 26 个精选轨迹优化 / 允许动资源文件内容（目录结构不动）/ 分批渐进+汇报。
> 依据：microsoft/skillopt v0.2.0（PyPI），论文 arXiv:2605.23904，52 评测单元全胜。

## 一、方法论落地（SkillOpt 核心能力 → DSH 执行形态）

| SkillOpt 概念 | 落地形态 |
| --- | --- |
| 冻结目标模型 | 基座 deepseek-v4-pro 不动，只训练 SKILL.md 文本 |
| rollout 打分轨迹 | subagent 执行构造任务，按五维打分（见下） |
| executive 优化器 | 本会话主模型：读轨迹 → 反思聚合 → 有界编辑 |
| 有界编辑 | add/delete/replace 原子编辑，epoch 预算递减（5→2→1，文本学习率） |
| held-out 验证门 | 每 skill 留 2 个不参与优化的验证任务，编辑后重跑，严格改善才接受 |
| 拒绝编辑缓冲 | references/rejected-edits.md |
| 紧凑工件 | 优化后 SKILL.md 保持 ≤12KB，超限合并到 references/ |
| epochs | 每 skill ≤3 epochs 或验证门连续拒绝即止 |

### 训练循环（每 skill）

1. **任务集**：5-7 个任务 = 3-5 rollout 训练任务 + 2 held-out 验证任务。类型：正面触发（业务诉求→正确执行）、负面不触发（何时不用场景→不误触发）、边界（模糊→正确追问而非编造）。
2. **rollout**：subagent 注入「任务 + 目标 SKILL.md」执行，产出轨迹（步骤/工具调用/最终输出）。
3. **打分（0-100）**：触发正确性 25 + 执行完整度 25 + 步骤效率 15 + 边界与安全 20 + 输出质量 15。
4. **reflect→aggregate**：executive 读全部轨迹找失败模式（触发词缺失/歧义、步骤缺失/冗余、描述误导、边界不清）。
5. **update**：产出 ≤5 处 add/delete/replace 编辑（第 2 epoch ≤2 处，第 3 epoch ≤1 处）。
6. **evaluate**：编辑后重跑 2 个 held-out 验证任务；验证分**严格 > 编辑前**才接受，否则整轮回退 + 记入拒绝缓冲。

## 二、三层执行计划

### Tier 1 全量结构层（246 个，静态零 rollout）

- 输入：diagnose.sh 体检基线（软缺 143）+ skill-evaluator 六维度（简化）。
- 动作（只改 SKILL.md 内容）：
  a. frontmatter 补齐 title/enabled/user-invocable（软缺 143 个）
  b. description 规范：触发词 + 何时不用 + 安全边界（对齐 81-skills 标准格式）
  c. workflow 键：没有的补 ≤5 步流程摘要（从正文提炼，不新造）
  d. 规模：>12KB 的 SKILL.md 把历史细节合并到 references/
- 产出：Tier1 修复报告（逐 skill 改动摘要 + 统计）。

### Tier 2 轨迹层（26 个精选，5 批）

名单草案（实施时按实际目录确认）：

- 自建 3：dsh-dev-platform-diagnostics、getnote-brain、pixpix-ecommerce
- 81 电商核心 10：amazon-listing-expert、bestseller-pattern-decoder、amazon-ppc-campaign-manager、amazon-competitor-monitor、amazon-fba-inventory-optimizer、geo-optimizer、voc-sentiment-analyzer、jtbd-analyzer、product-research-matrix、multi-platform-listing-generator
- 营销核心 8：ad-creative、influencer-marketing、seo-writing、cold-email、paid-advertising、public-relations、marketing-content-suite、gtm-strategy-planning
- 工程常用 5：code-review、tdd、diagnosing-bugs、handoff、rename-conversations

每批 5-6 个；每批完成汇报：rollout 分数、编辑清单、验证门结果（改善/回退）、收敛状态。

### Tier 3 演进机制

- 每个被优化 skill 加「维护 SOP + 留痕」小节（诊断 skill 格式为准）。
- 留痕：`> v1.1 2026-09-07 SkillOpt epoch1：验证分 X→Y（+N），接受/回退`。
- 拒绝编辑缓冲：references/rejected-edits.md。

## 三、红线（按决策）

1. **目录结构不动**：不增删目录、不移动文件。
2. SKILL.md 内容可改（frontmatter + 正文）。
3. references/examples 资源文件**内容**可改（拆规模、记缓冲）；文件名与位置不动。
4. 每个改动前 `.bak` 原地备份；回滚 = 还原 .bak。
5. 不碰基座官方技能（~/.agents/skills）；不碰 81-skills 的 examples/references 内既有案例内容（除非规模合并需要）。

## 四、成本与节奏

- Tier1：一轮批处理（主模型多 skill 批提炼 workflow），无 rollout。
- Tier2：26 skill ×（5 rollout + 2 验证 + ≤2 轮再验证）≈ 每 skill ≤11 次 subagent 执行；subagent 并行 3-4 个，共 5 批。
- 每批结束向用户汇报一次；全部完成出总报告 `docs/skillopt-optimization-report.md`。

## 五、验收标准

- Tier1：软缺 143 → 0（title 可选键除外）；description 规范率 ≥95%；无规模超限。
- Tier2：26 个 skill 每轮验证分严格改善或明确回退留痕；拒绝缓冲文件建立；SKILL.md 保持 ≤12KB。
- 红线零破坏：81 个标准目录结构 diff 为空（除 SKILL.md 与允许的资源内容）。
