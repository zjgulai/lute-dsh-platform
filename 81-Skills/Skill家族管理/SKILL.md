---
name: Skill家族管理
description: |
  当用户需要管理多个 Skills、按项目分组切换、解决上下文污染，或提及「Skill管理」「项目配置」「Skill切换」「上下文治理」时使用。触发词：Skill家族管理、Skill管理、项目级Skill编排、上下文治理、批量启停、Skill切换、降噪管理、Skills整理、项目配置、Skill分组、上下文隔离。何时不用：Skills 少于 10 个、无需项目切换、单个 Skill 质量问题（使用 root-skills-doctor / root-skills-eval / root-skills-opt）、创建新 Skill（使用 root-skills-creator）。安全边界：不执行危险 shell 命令、不索要密钥或隐私数据、不越权读取文件。缺材料（Skills 列表、项目分类、场景映射）时先追问澄清，不编造。
version: "1.1.0"
license: "MIT"
last_updated: "2026-09-03"
complexity: "standard"
compatibility:
  claude: { status: "native" }
  kimi: { status: "native" }
  cursor: { status: "native" }
  gpt: { status: "bridge" }
  minimax: { status: "bridge" }
source:
  github: "https://github.com/xingkongliang/skills-manager"
  author: "xingkongliang"
ecommerce_domain:
  - 全岗位通用
business_scenarios:
  - 多项目Skill管理
  - 项目级上下文隔离
  - Skill批量启停
  - 技能编排治理
  - 降低上下文污染
  - 切换成本优化
input_requirements:
  - 已安装的Skills列表
  - 项目分类定义
  - Skill使用场景映射
output_deliverables:
  - 项目级Skill配置集
  - 启停策略
  - 上下文隔离环境
---

# Skill家族管理

## 何时使用

- 安装了10个以上Skills，需要统一管理
- 需要按项目切换不同的Skill组合
- 遇到上下文污染问题（无关Skill频繁触发）
- 希望降低Token消耗，只加载必要Skills
- 需要防止Skill误触发，提升对话质量
- 多项目并行，需要隔离不同项目的Skills

## 何时不该使用

- Skills数量少于10个（手动管理更简单）
- 无需项目切换，所有Skills都常用
- 需要解决单个Skill的质量问题（本Skill只解决编排问题）
- 不涉及多项目场景
- 不需要上下文隔离

## 核心功能

### 项目级Skill管理
- 按项目分组Skills
- 项目间快速切换
- 独立上下文维护
- 配置持久化存储

### 批量启停控制
- 一键启用项目Skill集
- 批量禁用低频Skills
- 定时自动切换
- 依赖关系管理

### 上下文治理
- 防止无关Skill触发
- 降低Token消耗
- 减少误操作风险
- 优化响应速度

## 解决的问题

| 问题 | 影响 | 解决方案 |
|------|------|---------|
| Skill过多 | 触发混乱 | 按项目分组启用 |
| 上下文污染 | 对话质量下降 | 项目级隔离 |
| 切换麻烦 | 效率降低 | 一键切换配置 |
| Token浪费 | 成本上升 | 只加载必要Skills |
| 误触发 | 体验差 | 场景边界定义 |

## 使用方式

```bash
# 克隆仓库
git clone https://github.com/xingkongliang/skills-manager

# 安装
cd skills-manager && npm install

# 初始化配置
skills-mgr init

# 创建项目配置
skills-mgr create-project [项目名称]

# 添加Skill到项目
skills-mgr add [项目] [Skill名称]

# 切换项目
skills-mgr switch [项目]
```

## 配置示例

```json
{
  "projects": {
    "amazon-listing": {
      "skills": [
        "claude-seo",
        "marketingskills",
        "nexu"
      ],
      "description": "亚马逊Listing优化项目"
    },
    "data-analysis": {
      "skills": [
        "claude-ecom",
        "ecommerce-price-monitor"
      ],
      "description": "电商数据分析项目"
    }
  },
  "global_excludes": [
    "unused-skill-1",
    "unused-skill-2"
  ]
}
```

## 测试与验证

### 基本功能测试
```
1. 创建测试项目 → 检查项目配置是否正确保存
2. 添加Skills到项目 → 检查Skill列表是否准确
3. 切换项目 → 检查上下文隔离是否生效
4. 批量禁用Skills → 检查Token消耗是否降低
```

### 预期输出验证
- 项目配置是否正确持久化
- Skill切换是否流畅
- 上下文隔离是否有效
- 误触发率是否降低

## 数据来源说明

- **GitHub仓库**: https://github.com/xingkongliang/skills-manager
- **当前Star**: ~417
- **最新版本**: 2026年3月27日发布新版
- **社区讨论**: Reddit "I got tired of 100 skills cluttering my AI coding"
- **关联岗位**: 全岗位通用

## 跨境电商项目配置建议

```yaml
# 推荐项目分组
projects:
  # 销售运营项目
  sales-ops:
    skills:
      - claude-seo
      - ecommerce-price-monitor
      - marketingskills

  # 数据分析项目
  data-insight:
    skills:
      - claude-ecom
      - skills-mgr

  # 品牌营销项目
  brand-marketing:
    skills:
      - marketingskills
      - claude-seo
      - nexu

  # 供应链管理项目
  supply-chain:
    skills:
      - agency-agents-zh
```

## 注意事项

1. **解决范围**: 本Skill解决的是编排问题，不解决单个Skill质量问题
2. **人工定义**: 需要人工定义好项目边界和场景分类
3. **备份配置**: 定期备份项目配置文件
4. **权限管理**: 注意多用户环境下的配置权限

## 错误处理

- **配置文件缺失或格式错误**: 检查 `~/.skills-mgr/config.json` 是否存在，JSON 格式是否正确，引导用户重新运行 `skills-mgr init` 初始化
- **Skill 不存在**: 添加 Skill 到项目前先校验 Skill 名称是否在当前工作区可用，不存在时提示用户确认名称或先安装
- **项目切换冲突**: 切换项目时如发现已有未保存的配置变更，先提示用户保存/放弃，避免误覆盖
- **脚本执行失败**: 参见 `references/troubleshooting.md` 中的常见问题排查指南

## 安全边界

- 不执行任何危险 shell 命令（如 `rm -rf`、`chmod 777`、`sudo`）
- 不索要或处理 API 密钥、密码、Token 等隐私数据
- 不越权读取或写入用户文件系统中的非 Skill 相关路径
- 项目配置仅保存在 `~/.skills-mgr/` 目录内，不触碰其他路径
- 外部输入（Skill 名称、项目名称）需做基本校验，防止路径遍历或命令注入

## 竞争壁垒

- **与 root-skills-manage 的边界**: `root-skills-manage` 是 root-skills 家族（creator/eval/doctor/opt/check）的全景管理器，覆盖注册、路由、生命周期与版本状态跟踪；本 Skill 面向通用多项目场景，解决任意 Skills 集合的上下文隔离与批量启停
- **与 Skill 文件夹手动管理的区别**: 手动管理靠人工复制/删除/重命名，本 Skill 提供配置化、可切换、可回滚的项目级编排，状态持久化可审计
- **不可替代的痛点**: 当 Skills 超过 10 个且涉及多个项目时，手动管理几乎必然产生误触发和上下文污染，本 Skill 是唯一的系统化解决方案

## 参考资料

- `references/troubleshooting.md` — 常见问题排查指南
- `references/config-schema.md` — 项目配置 JSON Schema 完整定义
- 本 Skill 基于 GitHub 开源项目 [skills-manager](https://github.com/xingkongliang/skills-manager)（~417 Star），社区讨论见 Reddit "I got tired of 100 skills cluttering my AI coding"

## 示例

- `examples/amazon-project-config.json` — 亚马逊 Listing 优化项目的完整 Skill 配置示例
- `examples/multi-project-config.json` — 多项目并行管理的配置示例
