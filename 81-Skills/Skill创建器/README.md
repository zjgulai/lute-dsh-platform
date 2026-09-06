# Lute Skills Creator

> 创建生产级 Agent Skill，整合 Iron Law Testing、CSO 优化、质量评估与自动优化的完整闭环

## 简介

`lute-skills-creator` 是一个 Skill 生产力工具，整合了：
- **Skill 创建**：Iron Law Testing + CSO 优化 + 设计边界 + Universal Skill Schema 标准
- **质量评估**：六维度深度评估（`lute-skills-eval`）
- **自动优化**：基于评估报告的自动修复（`lute-skills-opt`）

适用于 Claude、Kimi、Cursor 核心联盟及 GPT/MiniMax 桥接。

## 核心功能

- **Iron Law Testing**：RED→GREEN→REFACTOR 严格测试流程
- **CSO 优化**：可发现性优化，确保 Skill 正确触发
- **设计边界审查**：判断何时该做 Skill、何时只是普通文档或提示词优化
- **标准化创建流程**：10步完整流程，从需求分析到发布
- **多复杂度支持**：minimal / standard / complex 三级模板
- **跨平台兼容**：核心联盟 + GPT/MiniMax 桥接
- **渐进式披露**：优化上下文使用效率
- **评估优化闭环**：eval → opt → re-eval 自动化流程

## 快速开始

### 3步创建 Skill

```bash
# 1. 选择模板
cp -r assets/templates/standard-skill ./my-skill

# 2. 编辑 SKILL.md
# - 填写 name（kebab-case）
# - 编写 description（功能 + 触发词）
# - 声明 complexity（minimal/standard/complex）

# 3. 验证
python scripts/validate-skill.py ./my-skill
```

## 目录结构

```
lute-skills-creator/
├── README.md                 # 本文件
├── SKILL.md                  # Skill 定义（核心文档）
├── .skill-meta/
│   └── manifest.yaml         # 元数据
├── references/               # 详细指南
│   ├── step-by-step-guide.md    # 10步完整流程
│   ├── iron-law-testing.md      # Iron Law 测试法
│   ├── cso-optimization.md      # CSO 优化指南
│   ├── skill-design-boundaries.md # 设计边界与 gotchas
│   ├── skill-types.md           # Skill 类型框架
│   ├── best-practices.md        # 最佳实践
│   ├── troubleshooting.md       # 常见问题
│   └── cross-model-adaptation.md # 跨模型适配
├── examples/                 # 使用示例
├── scripts/                  # 工具脚本
├── assets/
│   └── templates/            # Skill 模板
│       ├── minimal-skill/    # 最简结构
│       ├── standard-skill/   # 标准结构
│       └── complex-skill/    # 完整结构
└── tests/                    # 测试用例
```

## 核心原则

### 1. Iron Law Testing

**NO SKILL WITHOUT A FAILING TEST FIRST**

```
RED → GREEN → REFACTOR → PUBLISH
(基线失败) → (最小修复) → (加固闭环) → (通过后发布)
```

### 2. CSO 优化

**description 描述触发条件，而非工作流**

高质量的 description 包含：功能 + 时机 + 触发词

### 2.5 设计边界

**Skill 必须改变 agent 行为**

创建前先证明没有该 Skill 时会失败；上线后变更 description 必须补 positive/negative loading evals。

### 3. 渐进式披露

```
Metadata → SKILL.md → Resources
(始终)   → (触发时) → (需要时)
```

### 4. 复杂度分级

| 级别 | 最大长度 | 适用场景 |
|------|----------|----------|
| minimal | < 2000 字符 | 简单知识型 Skill |
| standard | < 4000 字符 | 大多数 Skill |
| complex | < 8000 字符 | 复杂工作流 |

### 5. Skill Types

| 类型 | 定义 |
|------|------|
| Technique | 有明确步骤的方法 |
| Pattern | 思维框架或决策模型 |
| Reference | 可检索知识库 |

## 相关工具

| 工具 | 路径 | 功能 |
|------|------|------|
| validate-skill.py | `scripts/validate-skill.py` | 验证 Skill 结构 |
| convert-for-model.py | `scripts/convert-for-model.py` | 跨模型转换 |
| lute-skills-eval | `skills/lute-skills-eval/` | 六维度质量评估 |
| lute-skills-opt | `skills/lute-skills-opt/` | 自动优化 |

## 完整工作流

```
1. 需求分析 → 2. 架构设计 → 3. Iron Law RED
     ↓
4. 编写 SKILL.md → 5. Iron Law GREEN
     ↓
6. 添加资源 → 7. 验证 → 8. Iron Law REFACTOR
     ↓
9. 评估 (lute-skills-eval) → 10. 优化 (lute-skills-opt)
     ↓
   发布
```

详细流程见 `references/step-by-step-guide.md`

## 评估-优化闭环

```bash
# 评估 Skill
/lute-skills-eval /path/to/skill

# 根据报告优化
/lute-skills-opt /path/to/evaluation-report.yaml

# 重新评估验证
/lute-skills-eval /path/to/skill
```

## 兼容性

| 平台 | 支持状态 | 说明 |
|------|----------|------|
| Claude | ✅ Native | 完整功能支持 |
| Cursor | ✅ Native | 通过 Claude API |
| Kimi | ✅ Native | 完整功能支持 |
| GPT | ⚠️ Bridge | 渐进式披露需模拟 |
| MiniMax | ⚠️ Bridge | 需中文优化 |

## 版本

- 当前版本: 3.1.0
- 结构版本: 1.0
- 最后更新: 2026-05-31

## 参考资源

- **技术规范**: `references/universal-skill-schema.md`
- **评估清单**: `docs/skill-evaluation-checklist.md`
- **快速迭代**: `docs/quick-iteration-guide.md`

---

**文档版本**: 3.1.0 | **核心联盟**: Claude 🤝 Kimi 🤝 Cursor
