# 技能中心优化方案（侧边栏 · 新会话按钮下方）

> 状态：方案已与业务方逐项决策确认，待实施。本方案不含任何代码改动。
> 日期：2026-09-10

---

## 1. 背景与目标

**现状痛点**
- 技能中心（`@linxin666/dsh-client-ui-skill-explorer` v0.3.6，第三方 npm 插件）侧边栏入口位于「新会话按钮」下方，但整体是开发者视角：入口文案「浏览与管理已加载的 skill」、7 个按文件路径分的来源分组（.dsh/skills、~/.agents/skills…）、卡片直接展示写给模型看的几百字 description（触发词清单/安全边界）。
- 卡片标题显示英文 `name`（如 `scenario-driven-product-scout`），中文 `title`（251/252 覆盖）闲置未用。
- 业务用户（非技术）在斜杠「/」菜单与技能中心里都无法快速理解「这个技能能帮我干什么」——与「0831｜功能｜技能中文名支持」会话的原始痛点一致。

**目标**
1. 技能中心从「技能管理台」转型为「业务能力目录」：中文、功能介绍为主、提示性引导性。
2. 斜杠菜单同步业务化（本次做低风险的正规定制路径）。
3. 零兼容性风险：不改模型触发语料（description）、不动技能加载/注入语义、不用 DOM hack 改结构。

---

## 2. 现状事实（已查证）

| 项 | 事实 |
| --- | --- |
| 技能中心插件 | `@linxin666/dsh-client-ui-skill-explorer` 0.3.6（BSD-3-Clause），desktop profile 已装 |
| 入口机制 | DOM 注入（MutationObserver 自愈），插在「新会话按钮」与「工作区列表」之间；官方 shell 此位置无 Slot，该机制保留 |
| 面板形态 | 居中 overlay modal，两 tab（技能 / 创建），7 来源分组 |
| 数据链 | SKILL.md frontmatter（name/title/description/whenToUse/disable-model-invocation/user-invocable）→ dsh-skill 注册表 → 技能中心自有 HTTP 路由（loopback 围栏） |
| 技能资产 | `~/.dsh/skills/` 252 个（技能中心扫描根）；其中 81 个来自 `Magpie-Horch/81-Skills/`（中文名源）经 `dsh-overseas-skills/scripts/import-81skills.mjs` 转换导入（英文 name + 中文 title） |
| title 覆盖 | 251/252 有中文 `title` 字段 |
| 斜杠菜单 | 官方客户端插件 `dsh-client-ui-input-trigger`（conversation.input.overlay slot "slash-menu"）+ `dsh-client-ui-skill`（"skill" source）；卡片渲染 `name + title + description`；`whenToUse` 不渲染 |
| 官方定制点 | `ctx.inputTriggers.registerSource()`（正规定制新源）；slots 官方 shadow 语义（`priority:-1` 可遮蔽 slash-menu，官方 runner 内置示例）；`ctx.remote.skills.list({sessionId})` 提供同源数据（含 title/whenToUse/modelInvocable） |
| 既有先例 | dsh-overseas-skills：host `webServer.register()` 自建路由 + settings.section 页；dsh-theme-local / dsh-root-brand-local：file: 本地 fork 模式 |

---

## 3. 方案总览（全部决策已确认）

### 3.1 实施形态：fork 本地化（锁定上游）

- 将 skill-explorer fork 到 `Magpie-Horch/dsh-skill-center-local/`（file: 依赖进 profile），UI/文案/字段解析全可控。
- **锁定 fork**：不跟随上游自动升级；上游出新版时由业务方触发手动对比合并。
- 保留已验证的：loopback 安全围栏、删除进 .trash、软链接不可删、frontmatter 轻量解析、DOM 注入入口机制。

### 3.2 技能中心 UI/UX

**入口行**
- 文案保持「技能中心」；图标换为更贴切的工具/魔棒类；新增**技能总数角标**（「这里有 81 个能力」）。

**面板**：右侧 720px 宽抽屉（从右滑出，不遮左侧栏，可滚动），替代居中 overlay。

**信息架构（浏览为主、管理为辅）**
- 顶部：搜索框（匹配 title + name + user_summary）+ 8 个业务域胶囊筛选。
- 卡片网格：宽抽屉两列 / 窄屏单列。
- 卡片内容：
  - 主标题 = 中文 `title`（缺失回退 `name`）；
  - 副标题小字 = 英文 `name`（兼作搜索键）；
  - 简介 = `user_summary`（缺失回退 description 前 60 字 + …）；
  - 可选「试试这样说」引导语 = `user_try`（缺失不显示）；
  - 来源信息降级为卡片角落小字。
- 管理动作降级：卡片 hover 浮现启用/禁用开关与删除（删除带确认）；触屏无 hover 时点卡片展开详情兜底。
- 「创建」tab 移入面板右上「开发者模式」折叠区（表单原样保留）。

**业务域分组（8 域，已确认映射）**

| 域 | 数量 | 成员 |
| --- | --- | --- |
| 🛒 选品洞察 | 9 | 跨境选品、产品调研矩阵、场景选品侦察、市场洞察选品、市场可行性审计、趋势时机分析器、产品属性分析器、畅销款规律解码器、跨境品类可行性报告 |
| 🔍 调研情报 | 14 | 竞品情报、公司调研、单帖情报挖掘、理想客户画像、社媒舆情追踪、竞品替代分析、客户之声分析器、亚马逊竞品监控、网页采集方案设计、跨境电商情报雷达、JTBD分析器、LLM技术调研、亚马逊Sorftime调研、VOC情感分析器 |
| ✍️ 内容营销 | 16 | 冷邮件、营销文案、营销主控、付费广告、邮件序列、社媒内容、外联自动化、营销内容套件、品牌声音提取器、GEO优化器、亚马逊PPC分析、SEO主控、多语言SEO、SEO内容优化、SEO竞品分析、SEO技术审计 |
| 📦 电商运营 | 14 | 物流优化、库存预测、上市策略、物流追踪、转化率优化、供应链主控、供应商评估、工艺包生成器、电商季度战略、Etsy优化器、GTM战略规划、亚马逊Listing专家、亚马逊Listing优化、多平台Listing生成器 |
| 📊 数据与分析 | 10 | 电商日报、大促效果分析、电商经营洞察、电商价格监控、电商月度复盘、平台价格监控、电商分析主控、产品数据深度分析、电商机器学习建模顾问、电商CSV处理 |
| 🧠 知识整理 | 9 | 语义分桶器、术语标准化器、知识萃取专家、文件历史管理、语义密度分析器、语义文档分块器、锚点文本分割器、知识相似度分析器、MECE知识提取器 |
| 🎨 视觉与设计 | 4 | 广告创意、爆款视频分析器、AI产品设计师、品牌Logo设计师 |
| 🛠 Skill 工具 | 5 | Skill创建器、Skill评估师、Skill优化器、Skill结构医生、Skill家族管理 |

> 域映射数据源 = 81-Skills 目录名 + SKILL.md name；图标优先复用 `81-mapping.json` 已有 icon（🎨🛒📊…）。分组数据作为 fork 插件静态配置，按英文 `name` 键匹配。

**文案（zh/en 双语镜像维护）**
- 全部 UI 文案业务化：入口 tooltip →「技能中心：看看 AI 能帮你做什么」风格；分组名用业务域；开关文案 →「已启用 / 已停用」；创建表单保持开发者文案（只在开发者模式出现）。
- en 镜像同步维护（+20% 文案成本，避免英语界面断层）。

### 3.3 技能业务简介（user_summary / user_try）

**字段契约**
- `user_summary`（string，≤60 字）：给人看的一句话简介。第 1 句 = 帮你做什么（动词开头）；第 2 句 = 什么时候找它（引导性）。禁止触发词清单/安全边界/排除项/技术词。
- `user_try`（string，可选，≤40 字）：「试试这样说」引导语示例；缺失不显示。
- `description` 原样保留（模型触发依据，零风险）。

**落盘与同步（单源 + 透传）**
- 写入 `Magpie-Horch/81-Skills/<中文名>/SKILL.md`（源）；
- 扩展 `dsh-overseas-skills/scripts/import-81skills.mjs` 透传 `user_summary`/`user_try` 到 `~/.dsh/skills/<english-name>/SKILL.md`，保证重建不丢；
- 覆盖范围：本次 81 个核心技能；其余 171 个走 title + description 截断回退展示，后续按需补。

**已确认样例**

| 技能 | user_summary |
| --- | --- |
| 场景选品侦察 | 从生活场景里挖新品机会：说一个场景，帮你找出能变成产品的新点子。想找选品灵感时，先找它。 |
| 爆款视频分析器 | 判断一条视频能不能火：拆解爆款的钩子、节奏和互动点，帮你优化脚本。做 TikTok 内容前，先找它。 |
| 跨境电商情报雷达 | 每天 3 分钟看懂行业动态：自动搜集整理最新跨境电商技能情报，出每日/每周简报。想保持信息领先时用它。 |

### 3.4 斜杠菜单业务化（本次做路径 a）

- 用官方 API `ctx.inputTriggers.registerSource()` 注册自定义「业务技能」源（order 排在官方「技能」组之前）。
- 卡片 = 中文 `title` 主标题 + `user_summary` + 可选「试试这样说」；数据取 `ctx.remote.skills.list({sessionId})` 同源。
- 官方「技能」组原样保留兜底。
- 与技能中心共用同一份 `user_summary` 文案（一次维护，两处生效）。
- **路线图（后续迭代）**：路径 b——用 slots shadow 语义（priority:-1 遮蔽 slash-menu）复用官方 controller 自绘完整菜单，替换官方组；待文案跑顺、键盘导航/过滤交互规格验证后再实施。
- 不采用：直接改官方 client.js 的 cn-slash 补丁（升级即丢）；DOM 行级改写（React 重渲染即被覆盖）；CSS 注入仅限样式微调，不作为结构手段。

---

## 4. 兼容性与稳定性保障

1. **技能语义零改动**：description / whenToUse / disable-model-invocation / user-invocable 一律不动；只新增展示字段。
2. **老技能零迁移成本**：缺 `user_summary`/`user_try` 自动回退（title + description 截断），任何技能不会显示空白。
3. **官方 API 优先**：斜杠菜单走 `registerSource` / remote.skills，不碰官方文件、不做结构级 DOM hack。
4. **安全围栏保留**：fork 后沿用 loopback 围栏、.trash 删除、软链接不可删、路径一致性校验等全部既有安全模型。
5. **锁定上游 + 本地 fork**：第三方插件升级不会意外改 UI；合并由业务方触发。
6. **文案先行**：81 份 user_summary 先落盘复核，UI 后上，避免返工。
7. **回滚路径**：profile 依赖 file: 指向本地目录，回滚 = 切回 npm 原包 + 重启；斜杠菜单自定义源移除 = 停用对应插件。

---

## 5. 实施顺序（已确认）

| 阶段 | 内容 | 交付物 |
| --- | --- | --- |
| 1 文案 | 按已确认规范批量产出 81 份 `user_summary`（+ 高价值技能 `user_try`）草案 → 业务方复核 → 落盘 81-Skills 源 → 扩展 import 脚本透传并重导 | 81 份文案 + import 脚本扩展 |
| 2 UI | fork 技能中心为 dsh-skill-center-local：入口（图标/角标）、720px 抽屉、8 域分组 + 搜索 + 筛选、title 主标题、user_summary/user_try 展示、hover 管理动作、开发者模式折叠区、zh/en 文案 | 本地插件包 + profile 接线 |
| 3 斜杠菜单 | registerSource 注册「业务技能」源（复用 user_summary 文案） | 斜杠菜单业务组上线 |
| 4 验收 | 左侧栏入口/抽屉/卡片/搜索/筛选/开关/删除/触屏兜底逐项验收；斜杠菜单并存体验验收 | 验收报告 |
| 5 路线图 | 观察使用反馈；择期评估路径 b（完全替换官方技能组） | 迭代计划 |

---

## 6. 验收标准（草案）

- 技能中心打开即见中文业务域分组，无英文 name 作为主标题出现（个别无 title 者除外）。
- 81 个核心技能卡片显示一句话业务简介；「试试这样说」在配置的技能上可见。
- 搜索可按中文 title / 英文 name / 简介关键字命中。
- 启用/禁用、删除、创建（开发者模式）功能与现版行为一致。
- 英语界面（en locale）无断裂文案。
- 斜杠菜单输入「/」后「业务技能」组排在官方「技能」组前，卡片中文可读。
- 全程无技能加载/触发语义变化（抽查 3 个技能斜杠触发、模型调用不受影响）。

---

## 附录 A · 决策记录

Q1 范围=C（UI 业务化 + 新增展示字段，description 不动）· Q2 形态=A（fork 本地化）· Q3 定位=C（浏览为主管理为辅）· Q4 参照=C（斜杠菜单信息结构 + 品牌视觉）· Q5=B（先规范样例后批量，已确认）· Q6=A（业务域分组）· Q7=B（hover 浮现管理）· Q8=A（创建进开发者模式）· Q9=C→Q21=A（斜杠菜单做正规路径 a，b 入路线图）· Q10=A（锁定 fork）· Q11 规范样例通过 · Q12=B（右侧 720px 抽屉）· Q13 全采用（搜索+域筛选+网格+user_try）· Q14=A（图标+总数角标）· Q15=A（zh/en 双语）· Q16=A（文案先行）· Q17 8 域映射通过 · Q18 采用（title 主标题）· Q19=A（写源+import 透传）· Q20=A（先 81 核心）

## 附录 B · 关键事实来源

- `~/.dsh/profiles/desktop/package.json`（profile 依赖清单）
- `@linxin666/dsh-client-ui-skill-explorer` lib/client.js（入口 DOM 注入）、lib/index.js（list 路由、parseFrontmatter、SOURCE_GROUPS）、lib/types/client/locales.d.ts（全部现文案）
- `dsh-overseas-skills/scripts/import-81skills.mjs`（81-Skills → ~/.dsh/skills 数据流）、scripts/81-mapping.json（icon/映射）
- `~/.dsh/skills/` 252 个 SKILL.md（title 覆盖 251/252）
- 官方插件（app.asar.unpacked/node_modules/@deepseek-ai/）：dsh-client-ui-input-trigger、dsh-client-ui-skill（卡片渲染 name+title+description）、dsh-client-ui-slots（shadow 语义）、dsh-client-ui-theme（token 覆盖）
