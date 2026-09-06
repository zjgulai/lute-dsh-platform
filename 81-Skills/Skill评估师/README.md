# Lute Skills Eval

> Skill 评估师 - 基于 Universal Skill Schema 的六维度深度评估工具

## 简介

`lute-skills-eval` 是一个用于评估 Skill 质量的工具 Skill。基于 Universal Skill Schema v1.1.0 对给定的 Skill 进行**六维度深度评估**，并检查 loading/routing quality，生成结构化的 YAML 评估报告供优化工具使用。

## 核心特性

- **六维度评估**（内容导向）：
  - Schema 合规性 (20%)
  - Frontmatter 质量 (25%)
  - Body 内容质量 (30%)
  - 方法论审计 (15%)
  - 质量门槛达标 (10%)
  - 目录结构 (5%) ⭐ 已压低

- **结构化输出**: YAML 格式，供 `lute-skills-opt` 直接解析
- **标准化评分**: 严格遵循 Universal Skill Schema v1.1.0
- **联动优化**: 评估报告可直接作为优化工具的输入
- **路由质量评估**: 检查 positive loading、negative loading、boundary cases 和 accessory-file-read cases

## 快速使用

```bash
/lute-skills-eval /path/to/skill-folder
```

## 输出文件

- `{skill-name}-evaluation-report.yaml` - **结构化评估报告**（供 opt 使用）
- `{skill-name}-evaluation-summary.md` - 人类可读摘要

## 评分体系

### 六维度权重

| 维度 | 权重 | 说明 |
|------|------|------|
| Schema 合规性 | 20% | 符合 Universal Skill Schema 规范 |
| Frontmatter 质量 | 25% | name、description、version、complexity、compatibility |
| Body 内容质量 | 30% | 核心结构、写作风格、渐进式披露 |
| 方法论审计 | 15% | 差异化价值、竞争壁垒、同质化检测 |
| 质量门槛达标 | 10% | DoD 检查清单 |
| 目录结构 | 5% ⭐ | 目录完整性（已从 15% 降至 5%） |

### 发布门槛

- **优秀 (excellent)**: 95-100 分
- **良好 (good)**: 85-94 分，可以发布
- **需要优化**: 70-84 分，必须优化后再发布
- **需要重构**: < 70 分

## 目录结构

```
lute-skills-eval/
├── README.md                 # 本文件
├── SKILL.md                  # Skill 定义（六维度评估流程）
├── .skill-meta/
│   └── manifest.yaml         # 元数据
├── scripts/                  # 可执行脚本
├── references/               # 参考文档
│   ├── evaluation-guide.md   # 详细评估指南
│   ├── scoring-criteria.md   # 评分标准详解
│   └── loading-routing-evaluation.md # 加载与路由评估模板
├── examples/                 # 示例报告
└── tests/                    # 测试用例
```

## 评估流程

1. **解析 SKILL.md**: 提取 frontmatter 和 body
2. **六维度评分**: 按 Schema 标准逐项评分
3. **问题分类**: error / warning / info
4. **生成报告**: YAML 结构化输出

## 依赖

- `references/universal-skill-schema.md` - 评估标准源文档
- `tools/validate-skill.py` - 基础验证工具

## 与 Opt 的联动

```bash
# 方式1: 评估后自动生成优化计划
/lute-skills-eval /path/to/skill --auto-opt

# 方式2: 先评估，再优化
/lute-skills-eval /path/to/skill
/lute-skills-opt /path/to/skill-evaluation-report.yaml
```

## 相关 Skill

- `lute-skills-opt` - 基于评估报告执行优化

## 版本

- 当前版本: 2.1.0
- 结构版本: 1.0
- Schema 版本: 1.1.0

### 版本历史

**v2.1.0** (2026-05-31):
- 新增加载与路由质量评估模板
- 明确 negative loading 和 boundary cases 对评分的影响

**v2.0.0** (2026-04-02):
- 重构为六维度评估体系
- 目录结构权重从 15% 降至 5%
- 新增 Schema 合规性、方法论审计、质量门槛维度
- 输出结构化 YAML 报告

**v1.0.0**:
- 初始版本
- 五维度评估（目录结构权重 15%）

## 兼容性

| 平台 | 状态 | 备注 |
|------|------|------|
| Claude | native | 完整支持 |
| Cursor | native | 完整支持 |
| Kimi | native | 完整支持 |
| GPT | bridge | 支持评估，输出需适配 |
| MiniMax | bridge | 支持评估，输出需适配 |

---

**中文为主，英文为辅** | **内容导向** | **Schema 标准**
