---
name: standard-skill
description: |
  标准 Skill 模板，适用于中等复杂度任务（2000-5000 字符）。
  当用户需要创建中等复杂度的 Skill、学习标准 Skill 结构、
  使用 references/ 和 examples/ 时使用。
  触发词：创建 skill、标准模板、中等复杂度、Skill 结构。
version: "1.0.0"
complexity: "standard"
compatibility:
  claude: { status: "native" }
  cursor: { status: "native" }
  kimi: { status: "native" }
  gpt: { status: "bridge" }
  minimax: { status: "bridge" }
---

# Standard Skill

标准 Skill 结构示例，包含 SKILL.md、references/ 和 examples/。

## When to Use / 何时使用

- 需要详细参考文档的场景
- 有多个使用示例的需求
- 中等复杂度任务（2000-5000 字符）
- 需要解释设计模式
- 需要分步骤执行的流程

## When Not to Use / 何时不该使用

- 简单任务（少于 2000 字符）→ 使用 minimal-skill 模板
- 纯一次性脚本，无需复用
- 无需参考文档的简单提示
- 需要外部脚本执行 → 使用 complex-skill

## Core Workflow / 核心流程

### Step 1: 理解需求
- 确认任务复杂度等级
- 判断是否适合 standard 模板

### Step 2: 查阅参考文档
- 检查 `references/patterns.md` 中的模式
- 学习相关设计模式

### Step 3: 设计 Skill 结构
- 规划 frontmatter 字段
- 设计 body 章节结构
- 准备 examples/

### Step 4: 编写内容
- 编写 SKILL.md
- 填充 references/
- 创建使用示例

### Step 5: 验证与测试
- 运行验证工具
- 检查兼容性声明

## Structure

```
standard-skill/
├── README.md
├── SKILL.md
├── .skill-meta/
│   └── manifest.yaml
├── references/
│   └── patterns.md
├── examples/
│   └── .gitkeep          # 使用示例
├── scripts/
│   └── .gitkeep          # 可选脚本
└── tests/
    └── .gitkeep
```

## Definition of Done / 完成标准

- [ ] frontmatter 完整（含 compatibility）
- [ ] Body 内容 2000-5000 字符
- [ ] 包含完整的 When to Use / When Not to Use
- [ ] 包含 Core Workflow（至少 3 步）
- [ ] references/ 有实际内容
- [ ] examples/ 有使用示例
- [ ] 目录结构完整

## Resources / 参考资源

### References
- `references/patterns.md` - 通用设计模式

### Examples
- `examples/` - 使用示例目录

## Methodology Audit / 方法论审计

本 Skill 采用渐进式披露模式：
1. 先给出 When to Use 快速判断
2. 再给出 Core Workflow 详细步骤
3. 最后提供 Resources 深入参考
