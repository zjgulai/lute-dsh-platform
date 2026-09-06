# Report Template

默认使用这份 Markdown 模板输出研究结果。重点是“结论 + 实践 + 来源”，不是新闻搬运。

## Template

```markdown
# 今日 LLM 开发工具情报简报

## Executive Summary

- 用 3-5 条短句概括今天最重要的变化
- 优先写会影响使用方式、工作流和判断标准的内容

## High-Confidence Updates

### [主题名称]
- **What changed**: 用一句话说明发生了什么
- **Why it matters**: 说明这件事为什么值得关注
- **How to use it**: 给出具体操作方向
- **Confidence**: High / Medium
- **Sources**: [来源名称](URL)

## New Tactics You Can Use Today

### Tactic 1
- **Action**: 今天就能尝试的动作
- **When to use**: 适用场景
- **Expected benefit**: 可能获得的收益
- **Caveat**: 使用前需要注意什么

### Tactic 2
- **Action**: ...
- **When to use**: ...
- **Expected benefit**: ...
- **Caveat**: ...

## Signals Worth Watching

- 写仍在演化、证据不足但值得关注的信号
- 明确标记为 `待验证`

## Risks / Caveats

- 写可能误读、灰度发布、版本差异、样本偏差等问题

## Suggested Experiments

1. 写 3-5 条可执行实验
2. 尽量让每条实验都能在今天开始
3. 尽量说明预期验证目标

## Source Log

| Topic | Source Type | Publisher | Date | Confidence | URL |
|------|-------------|-----------|------|------------|-----|
| 主题A | official_docs | Cursor | 2026-04-02 | High | https://... |
| 主题B | reddit | r/cursor | 2026-04-02 | Medium | https://... |
```

## Writing Rules

- `Executive Summary` 写结论，不写铺垫
- `High-Confidence Updates` 只放相对可靠的信息
- `New Tactics You Can Use Today` 必须是动作，不是观点
- `Signals Worth Watching` 用来放早期线索，不混入高置信结论
- `Source Log` 必须足够清晰，方便回查

## Quality Check

输出前快速自检：

- 是否至少包含 3 条有动作性的实践建议？
- 是否每个重要结论都有来源？
- 是否清楚区分了高置信和待验证内容？
- 是否能让读者快速回答“今天值得试什么”？
