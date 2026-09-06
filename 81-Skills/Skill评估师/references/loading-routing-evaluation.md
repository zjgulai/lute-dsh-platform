---
title: Loading And Routing Evaluation
doc_type: workflow
module: lute-skills-eval
topic: loading-routing-evaluation
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Loading And Routing Evaluation

## 评估目标

Skill 质量评估必须同时检查任务质量和路由质量。

一个 Skill 如果能完成单个任务，但经常误触发，会污染整个 agent 系统；如果经常漏触发，则无法稳定复用。

## 必备 Eval 类型

| 类型 | 目的 | 最低要求 |
|---|---|---|
| Positive Loading | 证明应触发场景能触发 | 3-5 个真实用户措辞 |
| Negative Loading | 证明相邻但不相关场景不会触发 | 3-5 个高风险 false positive |
| Boundary Cases | 检查模糊边界和相邻 Skill 路由 | 至少 3 个 |
| Accessory File | 检查是否读取正确 references/assets/scripts | 至少 1 个 |
| End-to-End | 检查加载后最终产出是否更好 | 至少 1 个真实任务 |

## Eval Template

```md
# Loading Evaluation

## Positive Loading Evals

### Case 1

User:

Expected:

Reason:

## Negative Loading Evals

### Case 1

User:

Expected:

Reason:

## Boundary Evals

### Case 1

User:

Expected:

Reason:

## Accessory File Evals

### Case 1

User:

Expected file read:

Reason:

## End-to-End Evals

### Case 1

User:

Expected behavior:

Rubric:
- ...
- ...
- ...
```

## Positive Loading 检查

Positive case 必须接近真实用户表达，不要只写内部关键词。

好例子：

- “我有一份内部流程文档，帮我改成一个 Agent Skill。”
- “这个 Skill 经常误触发，帮我优化 description。”
- “把这套每周运营复盘流程整理成可复用能力。”

差例子：

- “load skill creator”
- “使用某某 Skill”
- “做一个东西”

## Negative Loading 检查

Negative case 应覆盖高风险相邻场景。

例子：

- 用户只要普通报告，不要可复用 Skill。
- 用户只要概念解释，不要创建、评审或维护 Skill。
- 用户只要普通 Markdown 模板，不要 Agent Skill。
- 用户只要 prompt 优化，不要求封装成 reusable capability。

## Boundary Case 检查

Boundary case 的 expected 不能只有“触发/不触发”，必须说明判断条件。

示例：

```text
User: "帮我把这个 SOP 变得更适合 AI 执行。"
Expected: 只有当用户要封装成 Skill 或模块化 agent instruction 时才触发；如果只是改写 SOP，不触发。
Reason: SOP 优化与 Skill 设计相邻但不等价。
```

## 评分建议

评估报告中至少写明：

- 是否存在 positive loading cases。
- 是否存在 negative loading cases。
- 是否存在 boundary cases。
- description 是否被 negative cases 证明不过度触发。
- description 是否被 positive cases 证明不过度收窄。
- 是否有 accessory-file-read case 证明 progressive loading 能被正确执行。

缺少 negative loading cases 时，Frontmatter Quality 不应给满分。

缺少 boundary cases 时，Quality Gate 不应给满分。
