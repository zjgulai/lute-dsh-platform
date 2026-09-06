# Complex Skill

复杂 Skill 示例，适用于多步骤工作流。

## Structure

```
complex-skill/
├── README.md
├── SKILL.md
├── .skill-meta/
│   └── manifest.yaml
├── references/
│   ├── patterns.md
│   ├── advanced.md
│   └── api-reference.md
├── examples/
│   └── .gitkeep
├── scripts/
│   └── .gitkeep
└── tests/
    └── .gitkeep
```

## Features

- 分阶段工作流（Phase-based workflow）
- 多参考文档支持
- 脚本执行能力
- 完整错误处理
- 兼容性矩阵

## Usage

Copy this template for complex skills with multi-step workflows.

## Compatibility

| 模型 | 状态 | 限制 |
|------|------|------|
| Claude | native | 无限制 |
| Cursor | native | 无限制 |
| Kimi | native | 无限制 |
| GPT | bridge | 脚本执行需适配 |
| Minimax | bridge | 多步骤需简化 |
