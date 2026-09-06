# Cursor Automation Setup (Step by Step)

下面是把 `lute-llm-tech-research` 转成 Cursor automation 的落地步骤。

## Step 1: 新建 Automation

在 Cursor 的 Automations 页面创建一个新任务（建议命名）：

- `lute-llm-tech-research-daily`

## Step 2: 设置触发器

建议先用保守配置：

- Trigger 类型：`Schedule`
- 频率：`Daily`
- 时间：`09:30`（你本地时区）

后续可再加事件触发（例如 GitHub webhook）做专题版。

## Step 3: 设置运行仓库上下文

确保 automation 运行在这个仓库：

- `/Users/pray/project/lute_skills_starlink`

## Step 4: 填入任务指令

把以下文件中的完整指令粘贴到 automation task：

- `skills/lute-llm-tech-research/references/cursor-automation-task.md`
- 或直接使用最终可粘贴版本：
  - `skills/lute-llm-tech-research/references/cursor-automation-task-final.md`

## Step 5: 设置输出约束（关键）

在 automation 说明里明确以下硬约束：

- 输出路径固定为：`skills/lute-llm-tech-research/tests/`
- 文件名必须是：`YYYY-MM-DD-序号.md`
- `test/` 仅允许实际学习总结，禁止评估报告

## Step 6: 手动试跑一次

先手动触发（Run now）验证：

1. 是否成功生成新文件
2. 是否正确递增当日序号
3. 内容是否是学习总结而不是评估报告

## Step 7: 开启每日自动运行

手动试跑通过后，再开启正式 schedule。

## Step 8: 每周检查一次质量

每周快速检查 `test/` 目录：

- 是否每天都有产出
- 是否仍然保持“可学习、可实践”风格
- 是否出现评估型内容混入（若有，立即修正指令）

## 推荐运行模式

- 平日：每日自动跑 1 次
- 有重大更新日：手动加跑 1 次（同日序号 +1）
- 每周末：人工挑选 1-2 篇高质量总结，沉淀回 skill/references
