# SkillOpt 经验 → /Skill优化器 融合增强 · 完整方案（已实施 2026-09-07）

> 状态：**已实施（2026-09-07）**——SKILL.md 双模式入口 + playbook 7 节 + 三脚本资产落地，验收全过。决策：分层融合（主文件薄入口 + playbook 下沉 + 脚本资产）/ 完整案例库 / 脚本拷贝入 skill / 声明与评估师分工 / 只改 skill-optimizer。
> 依据：2026-09-07 本平台 SkillOpt 实战（26 技能验证门全过 + 15 处代码修复实机复测）。

## 一、萃取清单（本次实战沉淀 → 写入内容）

### 方法论层（→ skillopt-playbook.md 主体）
1. 三层优化体系：Tier 1 结构层（静态批量）→ Tier 2 轨迹层（rollout 驱动）→ Tier 3 演进机制（留痕/SOP）。
2. 训练循环六步：任务集设计 → rollout 实机执行 → reflect/aggregate → 有界编辑 → held-out 验证门 → 版本留痕。
3. 任务设计模板：5 rollout（正面×2 / 边界×1 / 负面不触发×1 / 缺材料×1）+ 2 held-out（不参与优化的新任务）。
4. 五维打分 rubric：触发正确性 25 / 执行完整度 25 / 步骤效率 15 / 边界与安全 20 / 输出质量 15。
5. 有界编辑纪律：add/delete/replace 三原子操作；每技能每轮 ≤5 处；锚点唯一性校验（count==1 才落笔）；epoch 预算递减 5→2→1；add 幂等（标题已存在跳过）；replace_all 显式声明。
6. 验证门：held-out 严格改善才接受；技能级均分裁决；不改善回退 + 记 rejected-edits；单任务小噪音（±2）不触发回退。

### 工程教训层（→ playbook「避坑十条」）
1. 文档-实现脱节只有实机跑才能发现（假 PASS/ImportError/漏检维度）——rollout 必须真实执行工具，禁止纸面推演。
2. 编辑会引入回归（路由死循环案例）——验证门是最后防线。
3. 执行工具自身 bug 会在流水线放大（静默失败/重复插入/统计口径）——每步抽查文件状态。
4. 锚点漂移三形态：缩进/转义（\`）/行尾换行——替换前必须 grep 实际文本。
5. 跨技能路由网络是隐性资产——转交目标统一为目录实际名，禁止旧名/不存在名。
6. 数据治理：静态展示字段归插件/技能默认，用户配置只存运行时状态。
7. 快照策略：.bak（原始）+ .t1（中间基线）+ scripts.bak（代码修复前）。
8. 留痕格式：`> v1.x YYYY-MM-DD 动作：验证均分 X→Y（±Δ），接受/回退`。
9. 评分标准校准要实证：title 键非必需（官方技能实证）——硬伤/软缺分层，不拍脑袋。
10. 渐进式披露平衡：主文档≤120 行/12KB，细节下沉 references；过厚与过薄都降分。

### 实战案例层（→ playbook 案例节）
- 26 技能验证分数总表（基线→后测→Δ→裁决）。
- 典型失败案例 5 例：geo 假 PASS（类目校验）、voc 漏检维度（20% 评论簇）、seo 路由死循环（编辑引入回归）、getnote link_url 死参数（文档-契约脱节）、第 4 批重复插入（脚本幂等缺陷）。
- 15 处代码修复复测对照表（修复前症状 → 修复后行为）。

## 二、实施清单（只改 ~/.dsh/skills/skill-optimizer/）

### A. SKILL.md（主文件 +~60 行，不动现有结构）
1. frontmatter description 增补触发词：轨迹优化、行为优化、深度优化、rollout、验证门、SkillOpt 优化。
2. 「何时使用」增补两条：① 需要提升真实行为质量（触发/边界/追问等）而非仅结构合规 ② 怀疑文档与实现脱节（假 PASS/命令不可执行/声明能力缺失）。
3. 新增「## 模式二：SkillOpt 轨迹深度优化」章节（薄入口）：
   - 分诊表：有评估报告→模式一；行为质量/脱节怀疑→模式二；两者可串联（模式一先结构门，模式二后行为门）。
   - 六步快速流程 + 指向 references/skillopt-playbook.md 与 scripts/ 三脚本。
   - 纪律红线速记：实机执行、≤5 处编辑、验证门、留痕。
4. 「竞争壁垒」节增补与 skill-evaluator 的分工：六维静态评估=结构门（前置体检），五维轨迹打分=行为门，互补不冲突。

### B. references/skillopt-playbook.md（新建，~220 行）
- 第 1 节 训练循环六步（每步的可执行细节）
- 第 2 节 任务设计模板与五维 rubric（含校准实证）
- 第 3 节 有界编辑与锚点纪律（含 apply 脚本用法）
- 第 4 节 验证门与留痕格式
- 第 5 节 避坑十条
- 第 6 节 实战案例库（26 技能分数表 + 5 典型案例 + 代码修复对照表）
- 第 7 节 三层优化体系与何时用哪层

### C. scripts/（3 个已验证脚本拷贝 + README）
- `skillopt-tier1-frontmatter.py`（frontmatter 补齐：enabled/user-invocable/title + .bak 备份 + 规模报告；dry-run 默认）
- `skillopt-tier1-apply.py`（建议 JSON 应用：workflow/触发词，锚点校验 + 幂等）
- `skillopt-tier2-apply.py`（有界编辑应用：add/replace/replace_all，count==1 校验 + .t1 快照 + 幂等 add）
- `scripts/README.md`：三脚本用途、调用方式、红线（只改 SKILL.md 内容；备份先行；dry-run 先行）。

### D. 不动的部分
- 现有「何时不该使用」「安全边界」「追问澄清」「快速开始」章节不动。
- references/ 现有 7 个文件不动；examples/tests 不动。
- 不更新诊断技能引用（按决策）。

## 三、验收标准

1. `/Skill优化器` description 含新触发词；「何时使用」含行为质量与脱节怀疑两条。
2. 主文件新增「模式二」章节（≤80 行）；references/skillopt-playbook.md 完整（7 节）；scripts/ 三脚本 + README。
3. 模式一原文（评估报告驱动）一字未损。
4. 语法门：三个 python 脚本 py_compile 通过；SKILL.md frontmatter 六键完好。
5. 实测：对任一技能说「对这个技能做轨迹深度优化」→ 应路由到 skill-optimizer 模式二并产出任务集设计。

## 四、红线

- 只改 skill-optimizer 目录内文件；不动其目录结构（新增文件即可）。
- SKILL.md 改动前 .bak 备份；脚本拷贝不改内容（原样拷贝自 Magpie-Horch/scripts/）。
- 不触碰 skill-evaluator / skill-structure-doctor / skill-family-manager 等近邻技能。
