---
name: minimal-skill
description: |
  最简 Skill 模板，适用于简单知识型任务（少于 2000 字符）。
  当用户需要创建简单 Skill、学习基础结构、理解最小可行 Skill 时使用。
  触发词：简单 skill、最小结构、基础模板、快速创建。
version: "1.0.0"
complexity: "minimal"
compatibility:
  claude: { status: "native" }
  cursor: { status: "native" }
  kimi: { status: "native" }
  gpt: { status: "native" }
  minimax: { status: "native" }
---

# Minimal Skill

最简 Skill 模板，仅包含必需的 SKILL.md 文件，适合简单知识型任务。

## When to Use / 何时使用

- 学习 Skill 基础结构
- 创建简单知识型 Skill（少于 2000 字符）
- 理解最小可行 Skill（MVS）
- 快速原型验证
- 单一职责的简单任务

## When Not to Use / 何时不该使用

- 需要脚本的任务（使用 complex-skill）
- 需要参考文档的任务（使用 standard-skill）
- 内容超过 2000 字符
- 需要多步骤工作流

## Core Workflow / 核心流程

1. **理解需求** - 确认任务属于简单知识型
2. **创建 SKILL.md** - 填写 frontmatter 和 body
3. **验证** - 确保内容少于 2000 字符
4. **测试** - 验证 Skill 可正常触发

## Structure

```
minimal-skill/
├── README.md
├── SKILL.md
├── .skill-meta/
│   └── manifest.yaml
├── references/
│   └── .gitkeep      # 预留，可选填充
├── examples/
│   └── .gitkeep      # 预留，可选填充
├── scripts/
│   └── .gitkeep      # 预留，可选填充
└── tests/
    └── .gitkeep
```

## Definition of Done / 完成标准

- [ ] SKILL.md frontmatter 完整（name, description, version, complexity, compatibility）
- [ ] Body 内容少于 2000 字符
- [ ] 包含 When to Use 和 When Not to Use
- [ ] 目录结构符合标准

## Resources / 参考资源

- `references/` - 预留目录，可添加基础指南
- `examples/` - 预留目录，可添加使用示例
