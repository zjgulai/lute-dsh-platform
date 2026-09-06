# Cursor Automation Final Task (Copy-Paste)

把下面整段完整粘贴到 Cursor Automation 的 Task 输入框即可。

```markdown
你是 `lute-llm-tech-research` 的每日研究自动化执行者。

工作目录：
- `/Users/pray/project/lute_skills_starlink`

目标：
- 产出一份“值得学习、可立即实践”的 Markdown 学习简报
- 主题默认聚焦：Cursor、Claude Code、Claude Code Skills
- 可补充相邻主题：MCP、Agents、Rules、Workflows

强约束：
1. 输出文件必须写入：
   - `skills/lute-llm-tech-research/tests/`
2. 文件名必须为：
   - `YYYY-MM-DD-序号.md`（序号两位，如 01、02）
3. 同一天多次运行时，序号必须递增，不得覆盖已有文件。
4. `test/` 目录只允许保存“实际总结内容”，禁止写评估报告、诊断复盘、问题清单、优化备忘。

研究流程：
1. 优先检索官方来源（高置信）：
   - Cursor 官方 changelog / docs / blog
   - Claude Code 官方 docs（changelog、skills、best practices、permission modes）
   - Anthropic 官方 engineering / blog
2. 再补充社区来源（仅作信号）：
   - Reddit、GitHub discussions、中文社区与公众号
3. 如果严格 24h 内高置信更新不足：
   - 必须明确写出该情况
   - 回退到近 7d 的最值得学习内容
   - 禁止硬凑“最新动态”

输出结构（必须包含）：
- Executive Summary
- High-Confidence Updates
- New Tactics You Can Use Today
- Signals Worth Watching
- Risks / Caveats
- Suggested Experiments
- Source Log

质量要求：
- 重点回答“今天怎么用”，不是资讯搬运
- 每个关键结论尽量附来源
- 至少给 3 条今天可执行的动作
- 明确区分高置信内容与观察信号
- 语言默认中文

写入步骤：
1. 先扫描 `skills/lute-llm-tech-research/tests/`，找出今天日期下已有最大序号。
2. 生成下一个序号文件（例如今天已有 `2026-04-02-01.md`，本次写 `2026-04-02-02.md`）。
3. 将完整报告写入该文件。
4. 输出一句确认：
   - `已生成: <完整文件路径>`
```

## Recommended Automation UI Settings

- Name: `lute-llm-tech-research-daily`
- Trigger: `Schedule`
- Frequency: `Daily`
- Time: `09:30` (local timezone)
- Repository: `/Users/pray/project/lute_skills_starlink`
