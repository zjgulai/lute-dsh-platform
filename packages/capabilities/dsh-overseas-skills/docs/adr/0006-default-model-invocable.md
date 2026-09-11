# ADR-0006：AI全栈技能默认模型可调用

- Context：O1 约定（营销/出海技能默认模型关）是为防营销技能自动触发干扰；全栈开发技能是开发会话的核心工作流，需要模型自动路由。
- Decision：29 个技能 frontmatter 默认 `disable-model-invocation: false` + `user-invocable: true`。
- Consequences：开发场景自动路由（如「帮我诊断这个 bug」→ diagnosing-bugs）；用户仍可在设置页关闭单个技能；与出海技能 O1 语义并存、互不干扰（不同技能集不同默认）。
