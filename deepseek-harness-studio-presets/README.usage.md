# Preset 广场预设 · 本地安装说明

> 本文件是「deepseek-harness-studio 的 Preset 广场」内置预设在本机（anywhere-labs DSH Desktop）的安装说明。上游：https://github.com/fufankeji/deepseek-harness-studio（MIT，561★）。

## 一、来源与本机落地方式

「Preset 广场」是赋范空间桌面发行版的内置功能（固定源在线目录 dshdesktop.com + 7 套内置工作流预设），**不是独立可安装插件**。本机等价落地：把 7 套内置 Agent Preset 安装到本机官方预设根 `~/.dsh/.agent-presets/<presetId>/`，由桌面花名册直接发现与使用。

## 二、已安装的 7 套预设

| presetId | 名称 | 用途 | 组成 |
| --- | --- | --- | --- |
| ai-product-developer | AI 产品开发工程师 | 需求澄清→规格→TDD→浏览器验收的 Web 产品开发 | 1 预设 + 3 Skills（grill-me / to-spec / tdd） |
| ai-report-analyst | AI 数据叙事分析师 | Excel 剖析、图表选择、离线交互报告 | 1 预设 + 1 Skill（build-ai-report） |
| llm-wiki-fullstack | LLM Wiki 全栈工程师 | 企业知识库分阶段开发 | 1 预设 + Skills |
| dsh-motion-deck-studio | DSH 动效演示导演 | 8 页结构动效 HTML 生成与验收 | 1 预设 + Skills |
| product-video-director | AI 产品视频导演 | 简报→分镜→HyperFrames→横屏 MP4 | 1 预设 + Skills |
| ai-content-image-studio | DSH AI 内容视觉编辑 | 图文卡片风格确认与 PNG 生成验收 | 1 预设 + Skills |
| feishu-digital-employee | 飞书数字员工 | 对话创建真实飞书任务（飞书 MCP + 时间 MCP） | 1 预设 + Skill + 2 个 MCP 行 |

## 三、相关说明

- **验证证据**：花名册实测 11 个预设（4 出厂 + 7 新装，路径与描述正确）；7 套 `agentPresets.resolve` 全部通过；**挂载实测 6/6 成功**（私有测试 Agent 逐套 `agentPresets.mount`，组合行全部激活无错误；飞书套因缺凭据未测）；Skills 以文件级证据为准（每套自带 skills/ 目录含 SKILL.md，随 preset 的 customSkillDirs 加载；探针的会话作用域 skills 列表为空属视图范围问题，建议试用会话时观察）
- **使用方法**：设置 → Agent 预设 → 选中预设 → 新建会话即以该预设装配；各预设自带的 Skills 经 skill-filesystem 的 customSkillDirs 随预设加载
- **⚠️ 飞书预设注意**：其 mcp-feishu 行 `failOnStartupError: true`——未配置 `FEISHU_APP_ID/FEISHU_APP_SECRET/FEISHU_DEFAULT_OPEN_ID` 凭据时该预设挂载会失败；需在桌面凭据设置中配置后使用
- **版本**：manifest `sourceDshVersion: 0.1.0-rc.8`（本机 alpha.1 更新；组成引用为标准包，实测 resolve 通过）
- **更新**：从上游重新下载 `apps/desktop/resources/preset-square/presets/<slug>/` 覆盖对应 `~/.dsh/.agent-presets/<presetId>/`
- **回滚**：`rm -rf ~/.dsh/.agent-presets/<presetId>`（仅删除 7 个新装目录，勿动出厂预设）

## 四、迭代优化方向

1. **在线目录接入**：上游广场的在线目录（dshdesktop.com/api/v1/presets）无法在本机桌面直接使用；如需在线浏览，可考虑为 dshmarket 或本机 Agent 预设页提案「预设目录」扩展
2. **飞书凭据配置后实测**：配置凭据后实测飞书 MCP 行挂载与任务创建
3. **预设实际运行验证**：各预设的实际会话运行（挂载 + Skills 加载）建议逐套试用；静态解析通过不代表运行时无兼容差异
4. **上游追踪**：赋范官方持续更新广场预设（repo 活跃），可定期同步
