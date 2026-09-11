# ADR-0004：AI全栈技能页面 = 扩展 dsh-overseas-skills 复用组件

- Context：需要第二个设置页「AI全栈技能」复刻出海技能页（分组卡片/搜索/开关），并同步加入对话卡片墙。
- Decision：在现有插件内新增第二 settings.section（id: fullstack-skills）+ Host 端点（/api/dsh-overseas-skills/fullstack-*）+ 独立 catalog 数据源（manifest/fullstack-skills.json）；OverseasSkillsPage/卡片组件参数化为两套数据源复用。
- Consequences：一套代码两页，维护成本低；catalog 行数扩张但分组隔离；未来更多技能集可继续参数化扩展（数据源 + 分类注册表）。
