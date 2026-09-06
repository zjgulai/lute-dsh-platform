# Lute Skills Opt

> Skill 优化师 - 基于结构化评估报告的自动修复与人机协作优化工具

## 简介

`lute-skills-opt` 是一个用于优化 Skill 质量的工具 Skill。它读取 `lute-skills-eval` 生成的**结构化 YAML 评估报告**，通过**自动修复 + 人机协作**方式执行优化，输出优化后的 Skill。

## 核心特性

- **解析结构化报告**: 读取 YAML 格式评估报告，提取问题和修复建议
- **自动修复**: 自动修复 Schema 合规性、格式、语态等问题
- **人机协作**: 复杂问题需用户确认，可预览修改前后对比
- **评分验证**: 优化后自动评估，验证是否达到目标分数
- **循环优化**: 支持 Eval-Opt 自动循环，直到达标

## 快速使用

```bash
# 方式 1: 从评估报告优化（推荐）
/lute-skills-opt /path/to/evaluation-report.yaml

# 方式 2: 直接优化（自动评估）
/lute-skills-opt /path/to/skill-folder --auto-eval

# 方式 3: 自动循环优化
/lute-skills-opt /path/to/skill --eval-loop --target-score=85
```

## 输出

- 优化后的 Skill 文件（原文件自动备份）
- `optimization-report.md` - 详细优化报告

## 支持的修复类型

### 自动修复

| 问题 | 修复 | 示例 |
|------|------|------|
| name 格式错误 | 替换下划线 | `my_skill` → `my-skill` |
| 缺少 version | 添加默认值 | `version: "1.0.0"` |
| 缺少 complexity | 自动判断 | 根据 body 长度 |
| 第二人称语态 | 自动移除 | "你应该" → 删除 |
| 目录缺失 | 自动创建 | `mkdir examples/` |

### 人机协作

| 问题 | 协作方式 |
|------|----------|
| description 优化 | 预览 diff，确认或修改 |
| 方法论审计 | 选择竞争壁垒类型 |
| 核心流程优化 | 展示建议，用户确认 |

## 目录结构

```
lute-skills-opt/
├── README.md                 # 本文件
├── SKILL.md                  # Skill 定义（优化流程）
├── .skill-meta/
│   └── manifest.yaml         # 元数据
├── scripts/                  # 可执行脚本
├── references/               # 参考文档
│   ├── optimization-patterns.md   # 优化模式库
│   └── human-collaboration-guide.md  # 人机协作指南
├── examples/                 # 示例报告
└── tests/                    # 测试用例
```

## 依赖

- `lute-skills-eval` - 生成评估报告
- `references/universal-skill-schema.md` - 优化标准
- `tools/validate-skill.py` - 验证结果

## 与 Eval 的联动

```
Eval → 生成 YAML 报告 → Opt 解析 → 自动修复 → 人工确认 → 验证 → 输出
```

支持自动循环模式，直到评分达标。

## 相关 Skill

- `lute-skills-eval` - 前置评估工具

## 版本

- 当前版本: 2.0.0
- 结构版本: 1.0
- 配套 Eval 版本: 2.0.0

### 版本历史

**v2.0.0** (2026-04-02):
- 支持六维度评估报告格式
- 新增自动循环优化模式
- 优化人机协作流程

**v1.0.0**:
- 初始版本

## 兼容性

| 平台 | 状态 | 备注 |
|------|------|------|
| Claude | native | 完整支持 |
| Cursor | native | 完整支持 |
| Kimi | native | 完整支持 |
| GPT | bridge | 支持，需适配 |
| MiniMax | bridge | 支持，需适配 |

---

**中文为主，英文为辅** | **自动 + 人机协作** | **Schema 标准**
