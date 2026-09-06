# ADR-0001：AI全栈技能安装范围 = 官方稳定集 29 个

- Context：mattpocock/skills 共 37 个技能，分 engineering(18)/in-progress(8)/misc(4)/productivity(7) 五桶。官方 README 明确 in-progress 为 beta：「不进插件、无文档、随时可变」，其中 retro 为 STUB、claude-handoff 依赖 Claude Code `--bg`。
- Decision：只安装 engineering+misc+productivity 共 29 个稳定集；in-progress 8 个不装。
- Consequences：页面/目录/card 数固定 29；规避 beta 变更风险与不可移植项（claude --bg）；若日后 beta 转正，增量接入管线已具备（mapping 追加即可）。
