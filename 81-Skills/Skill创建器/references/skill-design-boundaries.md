---
title: Skill Design Boundaries
doc_type: knowledge
module: lute-skills-creator
topic: skill-design-boundaries
status: stable
created: 2026-05-31
updated: 2026-05-31
owner: self
source: human+ai
---

# Skill Design Boundaries

## 核心判断

Skill 不是普通文档、提示词集合或工具说明。Skill 的价值在于让 agent 在特定场景下稳定改变行为。

每句话都必须通过这个测试：

```text
如果没有这句话，agent 是否容易做错、误触发、漏触发、遗漏领域判断或输出低质结果？
```

如果答案是否，删除或移动到外部文档。

## 创建前检查

先识别失败模式，再写 Skill。

- 哪些真实用户请求必须触发该 Skill？
- 哪些相邻请求不应触发该 Skill？
- 模型默认已经知道什么，不需要重复教学？
- 没有该 Skill 时，agent 通常会犯什么具体错误？
- 哪些判断是长期稳定、可维护、跨任务复用的？

不要为以下内容创建 Skill：

- 通用命令或常识性工具用法。
- 系统提示词已经覆盖的机械约束。
- 一次性项目上下文。
- 变化快到无法维护的外部信息。
- 只靠模板填空、没有非平凡判断的流程。

## Description 边界

`description` 是路由触发器，不是功能摘要。

强 description：

- 描述何时加载，而不是 Skill 包含什么。
- 使用接近真实用户请求的表达。
- 明确相邻但不应触发的场景。
- 短、密、具体，避免抢走相邻 Skill 流量。

禁止在上线后随意拓宽 description。每次拓宽都必须补 positive loading 和 negative loading evals。

## Body 边界

写给有能力的 agent，不写给初学者。

保留：

- 行为改变规则。
- 领域偏好和决策边界。
- 常见失败模式和 gotchas。
- 需要读 accessory file 的条件。

删除：

- 通用背景介绍。
- 模型本来知道的常识。
- 易碎的低价值命令列表。
- 与全局指令重复的内容。

## Progressive Loading

保持 `SKILL.md` 短而高信号。

- `references/`：长规则、领域资料、检查清单、troubleshooting。
- `assets/`：模板、schema、输出格式。
- `scripts/`：确定性逻辑，避免 agent 重复发明。
- `examples/`：高质量输入输出样例。
- `tests/`：RED/GREEN、loading、boundary、regression cases。

主文件只说明何时读取这些资源，不默认加载全部细节。

## Gotchas 规则

Gotcha 必须写成“错误 + 修正”。

强模式：

- 不要把 X 当成 Y；先检查 Z。
- 如果用户只要 A，不要加载本 Skill，除非同时出现 B。
- 当 X 发生时，先读 `references/example.md`。
- 避免 X，因为它会导致 Y。
- 本 Skill 不处理 X，即使措辞看起来相似。

弱模式：

- “注意质量”
- “小心触发”
- “多检查”

## 维护规则

Skill 上线后优先追加 gotchas、evals 和 examples，不优先重写 description。

维护闭环：

1. 域内任务失败：补 gotcha。
2. 误触发：收紧 description，补 negative loading eval。
3. 漏触发：加入真实用户措辞，补 positive loading eval。
4. 全局规则变化：删除重复或冲突内容。
5. accessory file 未被读取：补明确读取条件和 accessory-file eval。

## 交付清单

创建或重构 Skill 时，至少交付：

- 文件夹结构。
- 简洁 `SKILL.md`。
- 必要 accessory files。
- positive 和 negative loading evals。
- boundary cases。
- kept / removed / moved 的说明。
