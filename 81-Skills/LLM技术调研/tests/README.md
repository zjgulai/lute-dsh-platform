# Test Archive

这个目录只用于存放 `lute-llm-tech-research` 每天实际跑出来的学习型总结内容。

这里保存的应该是“值得学习、值得复用、可以直接拿去实践”的 Markdown 总结，不是评估报告、诊断记录、问题清单或优化备忘。

## 文件命名规则

统一使用：

`YYYY-MM-DD-序号.md`

示例：

- `2026-04-02-01.md`
- `2026-04-02-02.md`
- `2026-04-03-01.md`

说明：

- `YYYY-MM-DD` 表示试跑日期
- `序号` 表示当天第几次运行，固定使用两位数，如 `01`、`02`、`03`

## 内容边界

应放入 `test/` 的内容：

- 当天真正产出的学习简报
- 面向实践的技巧总结
- 可直接复用的操作建议
- 带来源的高价值更新整理

不应放入 `test/` 的内容：

- 评估报告
- 试跑诊断
- 触发率分析
- “哪里写得不好”的复盘记录
- 后续优化计划

## 每日存档建议

每份实际总结至少包含这些内容：

- 本次使用的 prompt
- 时间窗口，例如 `24h` 或 `7d`
- 主题范围
- 真正值得学习的结论
- 今天就能尝试的实践动作
- 关键来源

## 推荐结构

```markdown
# 今日 LLM 开发工具情报简报

## Prompt

...

## Run Configuration

- Time window: 24h
- Topics: Cursor, Claude Code

## Executive Summary

...

## High-Confidence Updates

...

## New Tactics You Can Use Today

...

## Suggested Experiments

...
```
