# Web Data Audit Designer

基于真实网页样本审计，设计低维护成本、可支撑业务分析的数据采集方案。

## 快速开始

当用户需要基于某个网页设计数据采集方案时，触发此 Skill。

**触发词**: 网页采集方案、字段设计、指标字典、网页自动化、采集PRD、评论页采集、页面字段分析、数据审计

## 核心能力

- **样本审计**: 从真实页面抽取样本，确认字段可采性
- **字段优化**: 按最小可用原则收敛字段，区分采集层与分析层
- **结构化交付**: 输出字段设计、指标字典、自动化采集 PRD

## 使用边界

**适用于**: 评论页、商品详情页、帖子页、列表页、招聘页等的数据采集方案设计

**不适用于**: 纯代码调试、绕过安全限制、无页面样本的空泛方案

## 工作流

1. **样本审计** - 检查 1~3 个真实样本的字段
2. **字段优化** - 按业务价值与维护成本收敛字段
3. **生成交付物** - 字段设计 + 指标字典 + 采集 PRD

## 文件结构

```
web-data-audit-designer/
├── SKILL.md              # 完整使用指南
├── README.md             # 本文件
├── references/           # 参考资料
│   ├── anti-patterns.md      # 常见反模式
│   ├── page-type-templates.md # 页面类型模板
│   └── reference.md          # 参考资源
├── examples/             # 使用示例
├── scripts/              # 脚本
└── tests/                # 测试
```

## 参考

- 详细用法: [SKILL.md](./SKILL.md)
- 反模式: [references/anti-patterns.md](./references/anti-patterns.md)
- 页面模板: [references/page-type-templates.md](./references/page-type-templates.md)
