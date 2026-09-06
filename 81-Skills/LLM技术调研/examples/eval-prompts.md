# Eval Prompts

这批提示词用于试跑 `lute-llm-tech-research`，重点检查触发准确性、来源纪律、去重能力和实践导向输出。

## Trigger-Oriented Prompts

### Prompt 1

给我做一份过去 24 小时的 Cursor 和 Claude Code 最新实操简报。重点不要写泛新闻，要写今天就能试的技巧。

### Prompt 2

帮我追踪本周 Claude Code Skills 的新用法和写法变化。优先看官方和 GitHub，其次再补 Reddit 和中文社区。

### Prompt 3

我想知道最近 MCP、Agents、Rules、Workflows 有没有什么值得马上纳入现有开发流程的新方法，给我一份高信噪比总结。

### Prompt 4

做一份面向实践的周报，只看 Cursor 官方站点、官方文档、官方 GitHub 和官方 X。不要引用二手媒体。

### Prompt 5

请帮我查最新的 Claude Code 使用技巧，但要把“高置信更新”和“待验证信号”分开写。

## Quality-Oriented Prompts

### Prompt 6

围绕 “Cursor background agents” 做一个最近 7 天的专题追踪。每条结论后面都附上来源，并在最后给我 5 条可以实际试验的动作。

### Prompt 7

帮我调研最近关于 Claude Code skill description 写法的变化。我要的是“怎么写更容易触发”的具体做法，不要只讲概念。

### Prompt 8

请查一下最近中文社区和英文社区关于 Claude Code Skills 的讨论，有没有出现互相矛盾的说法。如果有，保留分支，不要强行统一。

### Prompt 9

给我一份只关注“会影响今天工作流”的最新总结。筛掉所有没有明确行动价值的讨论。

### Prompt 10

请做一份过去 72 小时的 LLM 开发工具情报简报，主题是 Cursor、Claude Code 和 MCP。每个重要结论都要告诉我为什么值得关注、怎么用、有什么风险。

## Should-Not-Trigger Examples

这些提示词不应优先触发本 skill，或至少不该把它当成唯一核心技能：

- “帮我解释一下什么是 Cursor”
- “写一个 Python 脚本抓网页标题”
- “把这段 React 代码改成 TypeScript”
- “给我介绍一下 GitHub 是什么”
- “帮我写一篇关于 AI 趋势的泛泛文章”

## 试跑观察点

- 是否自动收紧到高信源优先
- 是否主动区分高置信和待验证
- 是否会把同一条消息重复计入
- 是否能产出至少 3 条具体实践建议
- 是否明显优于普通网页摘要
