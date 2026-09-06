# lute-llm-tech-research

> 正式区研究型 skill，用于持续跟踪 Cursor、Claude Code、Claude Code Skills 及相邻主题的最新实践，并生成面向实操的 Markdown 简报。

## 简介

`lute-llm-tech-research` 面向“高时效 + 多来源 + 强实践导向”的研究任务。它不是普通资讯摘要器，而是一个研究 workflow：优先查一手来源，记录证据卡，去重与冲突处理，然后把结果压缩成可立即采取行动的简报。

## 当前阶段

当前版本位于 `skills/`，已迁入正式发布区。

这意味着：

- 默认按正式 Skill 管理，而不是孵化态试验品
- 仍可继续通过真实任务小步迭代 description、workflow 和参考资料
- 如方法论或边界发生明显变化，应重新走 `lute-skills-eval` / `lute-skills-opt` 闭环

## 研究主题

默认核心主题：

- `Cursor`
- `Claude Code`
- `Claude Code Skills`

可扩展相邻主题：

- `MCP`
- `Agents`
- `Rules`
- `Workflows`

## 输出目标

每次输出都应尽量回答这三个问题：

1. 最近有哪些值得关注的高价值变化？
2. 这些变化会怎样影响今天的使用方式？
3. 有哪些动作现在就值得尝试？

## 目录结构

```text
lute-llm-tech-research/
├── README.md
├── SKILL.md
├── .skill-meta/
│   └── manifest.yaml
├── references/
│   ├── cursor-automation-task.md
│   ├── cursor-automation-task-final.md
│   ├── cursor-automation-setup.md
│   ├── source-priority-and-scoring.md
│   ├── dedup-and-conflict-handling.md
│   └── report-template.md
├── examples/
│   ├── daily-report-example.md
│   └── eval-prompts.md
├── scripts/
│   └── .gitkeep
└── tests/
    ├── 2026-04-02-01.md
    ├── ...
    └── README.md
```

## Cursor Automation 化

已提供可直接落地的 Cursor automation 方案：

- `references/cursor-automation-task.md`：可直接粘贴的 automation 任务指令
- `references/cursor-automation-setup.md`：一步步配置说明

这套 automation 约束了输出路径和命名，并明确 `tests/` 目录只存放实际学习总结内容。

## 测试存档

`tests/` 目录只用于保存每天实际跑出来的 Markdown 学习总结。

这里应该存放真正的内容产物，例如“今天值得学什么”“哪些技巧今天就能试”“高价值更新与来源整理”，而不是评估报告、试跑诊断或优化复盘。

命名规则统一为：

- `YYYY-MM-DD-01.md`
- `YYYY-MM-DD-02.md`

也就是“日期 + 当天序号”。这样后续连续跑几天后，可以直接回看每天沉淀下来的可学习内容。

## 试跑建议

优先用这些任务检验它：

- “给我一份过去 24 小时的 Cursor + Claude Code 实操更新简报”
- “只看官方和 GitHub，给我一份本周 Claude Code Skills 变化总结”
- “帮我追踪 MCP 和 Agent workflow 的新用法，但只保留能立刻试的部分”

## 持续维护建议

- 触发词是否足够准确
- 报告是否明显优于普通网页摘要
- Source Log 是否能支撑回溯
- 实践建议是否具体，而不是口号
- 连续几天运行后是否还能保持结构稳定
- `tests/` 中是否持续沉淀了真正值得学习和复用的内容
