# Cursor Automation Task (Daily Run)

把下面整段作为 Cursor Automation 的任务指令使用。

## Automation Instruction

```markdown
你正在仓库 `/Users/pray/project/lute_skills_starlink` 中执行每日研究自动化任务。

目标：
- 产出一份“值得学习、可立即实践”的 Markdown 学习简报
- 主题聚焦：Cursor、Claude Code、Claude Code Skills（可补充 MCP/Agents/Rules/Workflows）
- 输出存档到 `skills/lute-llm-tech-research/tests/`
- 注意：这里只允许写“实际总结内容”，禁止写评估报告、诊断复盘或优化备忘

执行步骤：
1. 优先检索官方来源：
   - Cursor 官方 changelog / docs / blog
   - Claude Code 官方 docs（changelog、skills、best practices、permission modes）
   - Anthropic 官方 engineering / blog 页面
2. 再补充社区来源用于信号观察（Reddit、GitHub 讨论、中文社区等），但不能作为唯一主证据。
3. 按以下结构输出：
   - Executive Summary
   - High-Confidence Updates
   - New Tactics You Can Use Today
   - Signals Worth Watching
   - Risks / Caveats
   - Suggested Experiments
   - Source Log
4. 如果严格 24h 没有足够高置信更新，明确写出该情况，并回退到近 7d 的最值得学习内容。
5. 生成输出文件名：
   - 目录：`skills/lute-llm-tech-research/tests/`
   - 格式：`YYYY-MM-DD-序号.md`（序号两位，如 01、02）
   - 同一天多个文件按递增序号写入
6. 写文件前先检查当日已有文件，避免覆盖。
7. 完成后输出一句总结：`已生成: <完整文件路径>`

质量要求：
- 重点写“今天怎么用”，不是资讯搬运
- 每个关键结论尽量附来源
- 至少给 3 条今天可执行的动作
- 明确区分高置信信息和观察信号
```

## Optional Arguments (for manual runs)

可以在 automation 指令末尾追加参数化约束，例如：

- `时间窗口优先 24h，必要时 fallback 到 7d`
- `今天重点只看 Claude Code Skills`
- `只使用官方来源，不补社区来源`
- `输出语言改为英文`
