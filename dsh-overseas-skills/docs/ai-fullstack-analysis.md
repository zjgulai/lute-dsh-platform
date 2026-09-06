# mattpocock/skills · AI 全栈技能 深度分析与导入方案（讨论稿 v1）

> 状态：只洞察与分析（含文档），未改任何代码。仓库：github.com/mattpocock/skills（2026-09-06 clone）。

## 1. 仓库事实（MECE 盘点）

- 结构：`skills/{engineering, in-progress, misc, productivity, deprecated}` 五个桶；**37 个技能**（engineering 18 / in-progress 8 / misc 4 / productivity 7；deprecated 桶为空）。
- 官方定位：engineering+misc+productivity = 稳定集（插件与 README 收录）；**in-progress = beta**（官方声明「不进插件、无文档、随时变」），其中 `retro` 为 STUB、`claude-handoff` 依赖 `claude --bg`（Claude Code 专属）。
- 目录形态：`SKILL.md` + 附属资源（mocking.md/tests.md/ADR-FORMAT.md/HTML-REPORT.md/template.sh/issue-tracker-*.md 等）+ `agents/openai.yaml`（Claude 子代理定义）+ `scripts/`（仅 diagnosing-bugs）。
- frontmatter：name 全部 kebab ✓；15 个含未引号标量（转换时 JSON 引号化即可）；**无块标量风险**；`disable-model-invocation` 仅个别标注。
- **路由型技能**：`ask-matt`（仓库路由器）、`grill-me`（→grilling 转发存根）、`grill-with-docs`（→grilling+domain-modeling 组合器）——依赖「Skill 工具按名调用」语义，DSH 有同名 `skill` 工具，**可直接移植**。
- **与现有系统碰撞（3 个）**：`tdd`、`to-spec`、`grill-me` 已存在于「AI 产品开发工程师」预设（早期同源导入，版本较旧）。

## 2. 全栈开发视角 · 每技能作用定位（MECE 八阶段）

| 阶段 | 技能（name → 作用） |
| --- | --- |
| A 需求与澄清 | grilling（无情访谈打磨方案）、grill-me（转发存根）、grill-with-docs（访谈+ADR/词汇表落档）、wait-what（打断纠偏）、to-questionnaire（访谈转问卷）、research（高可信一手资料调研）、teach（把概念教明白并验证理解） |
| B 规格与规划 | to-spec（对话→规格落 issue tracker）、to-tickets（规格→tracer-bullet 任务卡，声明阻塞依赖）、wayfinder（超大工程→决策票地图）、ask-matt（本集路由器）、wizard（生成只有人类能做的 bash 向导） |
| C 架构与设计 | codebase-design（深模块接口词汇）、domain-modeling（领域模型/ADR/词汇表）、improve-codebase-architecture（扫描深化机会→HTML 报告→访谈）、prototype（一次性原型验证设计问题）、setup-ts-deep-modules（dependency-cruiser 深模块化） |
| D 实现 | implement（按规格/票实施）、implement-spec（单分支全规格+子代理并发+单 PR，beta）、tdd（测试先行） |
| E 质量与排查 | code-review（Standards×Suspicion 双轴评审）、diagnosing-bugs（硬 bug/性能回归诊断循环，带 scripts）、resolving-merge-conflicts（合并冲突消解）、triage（issue 状态机分流） |
| F 工程与发布基建 | setup-matt-pocock-skills（仓库接线：issue tracker/分诊标签/领域文档）、setup-pre-commit（pre-commit 钩子）、git-guardrails-claude-code（git 操作护栏）、migrate-to-shoehorn（迁移到 shoehorn 结构）、scaffold-exercises（脚手架练习题） |
| G 协作与交接 | handoff（交接文档）、claude-handoff（claude --bg 专属，beta）、retro（STUB，beta）、loop-me（多会话工作区自迭代，beta） |
| H 写作与内容 | writing-for-agents（给 agent 写文档）、writing-beats/writing-fragments/writing-shape（节拍/碎片/塑形三步写作法，均 beta）、 |

## 3. 兼容性结论（与 DSH 技能模型对照）

1. name 全部合法（kebab）✓；3 个与现有系统撞名（tdd/to-spec/grill-me）。
2. frontmatter：无块标量；15 个未引号标量——按既有转换规范 JSON 引号化即可。
3. `agents/openai.yaml`：Claude 子代理定义，DSH 无对应机制——保留为无害资源或剔除（决策点）。
4. 路由型技能依赖 Skill 工具按名嵌套调用——DSH 具备 `skill` 工具，语义等价，可移植。
5. claude-handoff（claude --bg）/ retro（STUB）不直接可移植（决策点）。
6. diagnosing-bugs/scripts 需编译/冒烟测试；wizard/template.sh 需语法检查。
7. 与出海技能目录、AnySearch 等现有 229 行目录无其他碰撞。

## 4. 页面与工程方案（复刻出海技能）

- **机制（推荐）**：扩展 `dsh-overseas-skills` 插件——新增第二个 `settings.section`「AI全栈技能」，复用 OverseasSkillsPage/卡片/搜索/开关组件（参数化为两套数据源）；Host 增加 `/api/dsh-overseas-skills/fullstack-list|toggle`（或 list 带 set 参数）；catalog 增加 `manifest/fullstack-skills.json` + 8 个新分类。
- 分类（8 组）与 §2 的 A-H 阶段一一对应，中文命名（需求澄清 / 规格规划 / 架构设计 / 实现 / 质量排查 / 工程基建 / 协作复盘 / 写作内容）。
- 图标：8 枚分类 LUTE 头像 + 37 枚技能专属头像（复用 lute-brand-icons 生成器）。
- 可选：新建「AI 全栈工程师」preset（skill-subset 白名单 = 37 名）。

## 5. 决策点（待拍板）

1. **D1 安装范围**：A 稳定 29 个（推荐）/ B 全 37 含 beta / C 精选核心。
2. **D2 撞名 3 个**：A 跳过（预设已有旧版）/ B 全局装新版、预设层旧版共存（层遮蔽）/ C 同步更新预设旧版为 repo 新版。
3. **D3 翻译**：A frontmatter+关键段汉化、正文留英文（快）/ B 全文汉译（量大，分两批）/ C 双语对照。
4. **D4 页面机制**：A 扩展 dsh-overseas-skills 复用组件（推荐）/ B 独立新插件。
5. **D5 对话卡片墙**：A 同步加入 AI 全栈胶囊组 / B 仅设置页。
6. **D6 图标**：A 分类+37 技能专属 LUTE 头像（推荐）/ B 仅分类头像。
7. **D7 默认开关**：A 全栈技能默认模型可调用（开发场景自动路由，推荐）/ B 沿用 O1 默认关。
8. **D8 不可移植项**：A 跳过 claude-handoff/retro、其余 beta 照装（推荐）/ B claude-handoff 适配 DSH 子代理机制后装。

## 6. 执行 TODO（决策后定稿）

- P1 转换管线：fullstack-mapping.json（37→DSH 名/分类/图标）+ import-fullstack.mjs（frontmatter JSON 化、翻译层、资源保真、撞名处理）
- P2 安装 + 适配测试：frontmatter 解析 37/37、diagnosing-bugs/scripts 编译、wizard/template.sh 语法、路由型技能冒烟
- P3 页面扩展：Host 端点 + catalog 双源 + client 第二 section（复刻组件）
- P4 图标：lute 生成 8+37 头像 + 分配
- P5 卡片墙（D5）+ 预设（可选）
- P6 验收：设置页/搜索/开关/斜杠/路由基准扩展 + 交付报告

---

## 7. 决策记录（2026-09-06，全部确认）

| # | 决策 | 结论 |
| --- | --- | --- |
| D1 | 安装范围 | **稳定集 29 个**（engineering 18 + misc 4 + productivity 7）；in-progress 8 个不装 |
| D2 | 撞名处置 | **全局装新版 tdd/to-spec/grill-me，预设旧版共存**（预设会话层遮蔽旧版，非预设会话用新版） |
| D3 | 翻译 | **全文汉译分两批**：第一批 29 稳定集（frontmatter 触发词/边界 + 正文逐段汉化），第二批视需要 |
| D4 | 页面机制 | **扩展 dsh-overseas-skills**：新增第二个 settings.section「AI全栈技能」，复用卡片/搜索/开关组件 |
| D5 | 卡片墙 | **同步加入**输入框上方卡片墙（AI全栈分组胶囊） |
| D6 | 图标 | **8 枚分类 + 29 枚技能专属** LUTE 头像 |
| D7 | 默认开关 | **默认模型可调用**（disable-model-invocation: false） |
| D8 | 不可移植 | claude-handoff / retro 均在 in-progress 桶，随 D1 范围天然排除 |

## 8. 执行 TODO（定稿）

- [ ] **P1 转换管线**：`fullstack-mapping.json`（29 名 → 中文 title/分类/图标/别名映射）+ `import-fullstack.mjs`（frontmatter JSON 引号化、汉译层、资源保真复制、D2 三技能处理、默认模型可调用标志）+ 原文对照暂存
- [ ] **P2 安装与适配测试**：装入 `~/.dsh/skills/`；29/29 frontmatter 解析；diagnosing-bugs/scripts 编译；wizard/template.sh 语法；路由型 3 个（ask-matt/grill-me/grill-with-docs）冒烟；碰撞回归（预设 3 技能不受影响）
- [ ] **P3 页面扩展**：Host `/api/dsh-overseas-skills/fullstack-*` 端点；`manifest/fullstack-skills.json`（8 分类 29 行）；builder 双源组装；client.js 参数化 OverseasSkillsPage → 注册第二个 `settings.section`（id: fullstack-skills, label: AI全栈技能）+ 卡片墙第二组
- [ ] **P4 图标**：lute-brand-icons 新增 8 分类 + 29 技能条目 → 生成 → `assign_lute_icons` 扩展 fullstack 分配
- [ ] **P5 验收**：设置页双页并存/搜索/开关/卡片墙双组/斜杠中文命令；重启后 verify + 路由基准扩展（29 用例）；交付报告
- [ ] 完成后重启 DSH Desktop 生效（catalog 数据 + client bundle）
