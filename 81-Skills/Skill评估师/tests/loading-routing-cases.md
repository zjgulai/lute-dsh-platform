---
title: Loading Routing Evaluation Cases
doc_type: analysis
module: lute-skills-eval
topic: loading-routing-cases
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Loading Routing Evaluation Cases

## Positive Loading

### Case 1

User:

```text
帮我评审一下这个 SKILL.md 写得好不好。
```

Expected:

评估应要求加载 Skill 质量评估能力，并检查 description、body、progressive loading、evals 和发布门槛。

Reason:

用户明确要求 Skill review。

### Case 2

User:

```text
这个 skill 经常误触发，帮我优化 description。
```

Expected:

评估应检查 routing quality，并要求补 negative loading evals。

Reason:

用户明确描述 false positive。

## Negative Loading

### Case 1

User:

```text
帮我写一个客服质检报告。
```

Expected:

不应触发 Skill 设计或评估；这是任务输出本身，不是 reusable Skill。

Reason:

普通业务报告不等于 Skill 资产。

### Case 2

User:

```text
总结这篇关于 Agent Skill 的文章。
```

Expected:

不应触发 Skill 设计或评估，除非用户要求提炼成 Skill。

Reason:

总结文章不是创建、维护或评审 Skill。

## Boundary Cases

### Case 1

User:

```text
帮我把这个 SOP 变得更适合 AI 执行。
```

Expected:

只有当目标是封装为 Skill 或模块化 agent instruction 时才触发；如果只是改写 SOP，不触发。

Reason:

SOP 优化和 Skill 设计相邻但不等价。

### Case 2

User:

```text
帮我优化这个提示词，让模型更稳定。
```

Expected:

只有当用户要求包装成 Skill、工作流或 reusable capability 时才触发。

Reason:

Prompt 优化不一定需要 Skill 设计。

## Accessory File Case

User:

```text
请评估这个 Skill 的 description 是否会误触发，并给出测试用例。
```

Expected file read:

`references/loading-routing-evaluation.md`

Reason:

任务要求 routing precision 和 positive/negative loading case。
