# ADR-0007：路由型技能移植依据（Skill 工具语义等价）

- Context：ask-matt / grill-me / grill-with-docs 是「路由/组合器」，正文为「Call the Skill tool with "grilling"」式转发，依赖平台具备按名调用技能的工具。
- Decision：判定 DSH 的 `skill` 工具与 Claude 的 Skill 工具语义等价（按精确名加载技能内容），无需改造正文即可移植；安装后以冒烟测试验证。
- Consequences：三个路由技能直接可用；若未来 DSH skill 工具语义变化，重评本 ADR。
