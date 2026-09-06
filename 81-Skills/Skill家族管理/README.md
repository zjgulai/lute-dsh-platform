# lute-skills-manage

Claude Skills项目管理器。把不同项目的Claude Skills做成可切换、可按项目启停的统一管理器，解决100+Skills后的上下文污染和切换麻烦问题。

## 快速开始

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

## 功能特性

- **项目级Skill管理**: 按项目分组Skills，项目间快速切换
- **批量启停控制**: 一键启用项目Skill集，批量禁用低频Skills
- **上下文治理**: 防止无关Skill触发，降低Token消耗

## 解决的问题

| 问题 | 影响 | 解决方案 |
|------|------|---------|
| Skill过多 | 触发混乱 | 按项目分组启用 |
| 上下文污染 | 对话质量下降 | 项目级隔离 |
| 切换麻烦 | 效率降低 | 一键切换配置 |
| Token浪费 | 成本上升 | 只加载必要Skills |
| 误触发 | 体验差 | 场景边界定义 |

## 配置示例

```json
{
  "projects": {
    "amazon-listing": {
      "skills": ["claude-seo", "marketingskills", "nexu"],
      "description": "亚马逊Listing优化项目"
    },
    "data-analysis": {
      "skills": ["claude-ecom", "ecommerce-price-monitor"],
      "description": "电商数据分析项目"
    }
  }
}
```

## 数据来源

- GitHub: https://github.com/xingkongliang/skills-manager
- Star: ~417
- 最新版本: 2026年3月27日
