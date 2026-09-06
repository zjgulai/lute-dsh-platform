# dsh-genui · 本地安装说明（0.9.6，npm 安装）

> 本文件是本机安装说明。上游：https://github.com/omdsh-dev/dsh-genui（MIT，368★）。上游 README.md 保留不动。

## 一、这是什么

GenUI for DeepSeek Harness：模型在回复中用 ````dsh-ui` 代码围栏输出 JSON spec，GUI 在围栏处渲染成真实交互组件——布局、图表、绘图、表单、测验、mermaid、3D 场景，动作事件回环到模型。

## 二、使用方法

- **触发**：模型（在 `genui` 技能指导下）输出 ````dsh-ui` 围栏 + JSON spec 即渲染；无需用户请求
- **技能**：`genui` 技能已注册到 `~/.dsh/skills/genui/SKILL.md`（教模型围栏语法与组件库）
- **组件**：callout/badge/lists/keyvalue/steps/timeline/tables/mermaid/3D/charts/forms/quizzes 等
- **演示**：上游 `demo-prompts.md` 有现成提示词

## 三、相关说明

- **兼容性**：npm 0.9.6 自带完整构建产物（lib + echarts/mermaid/three 资产）；client require 集为空（无旧模块）；client inject `[slots, sessions]`、host inject `[systemPrompt]` 本机全存在；patch 仅 insert（无宿主行覆盖）→ **通过（低风险）**
- **L4 实测证据（全通过）**：`render_ui`/`validate_dsh_ui` 工具入册；fence 教学注入系统提示；`conversation.input.dock` 出现 `genui-panel`（active）；`tool.call.toolview` 出现 `render_ui`（active）；`genui` 技能入册；**实际 fence 渲染由用户确认通过**（list 组件渲染成功）。动作事件回环未覆盖（需交互触发）
- **组件字段注意**：部分组件的字段格式与直觉不同（如 callout 实测被校验丢弃），发 fence 前用 `validate_dsh_ui` 校验（≥3 节点或含表格必校验）
- **安装**：npm 依赖 + bundles 条目；技能从安装包内 SKILL.md 同步到 `~/.dsh/skills/genui/`（上游 install.sh 同款做法）
- **回滚**：移除依赖与 bundles 条目 → pnpm install → 重启；技能目录 `rm -rf ~/.dsh/skills/genui`
- **更新**：改依赖版本号 → pnpm install → 同步新 SKILL.md → 重启
- **与 dsh-theme 关系**：genui 渲染自己的组件样式（模块化 CSS），与主题 token 体系共存

## 四、迭代优化方向

1. **围栏渲染实测**：重启后用 demo 提示词实测 ```dsh-ui 围栏渲染与动作事件回环（会消耗模型 token，可选）
2. **上游追踪**：上游活跃（368★、今天仍在提交，0 issues）；版本更新频率高（0.9.x），注意 CHANGELOG 的破坏性变更
3. **模板中心**：上游有 template-center 截图（docs/screenshots/template-center.png），可探索组件模板生态
4. **e2e 套件**：上游自带 scripts/e2e.mjs + e2e-visual.mts，可在 CI 或本机复跑
