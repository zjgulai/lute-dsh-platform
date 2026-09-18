# Workstream 04 · 产品定位、旅程、UX 与效果

## 产品假设

待 DEC-002 确认的推荐假设：

> 面向跨境业务及 AI 原生团队的本地 AI 工作台：选择岗位或小队，连接业务数据与系统，完成一项可追踪、可恢复、可验证的业务任务。

该文案只是待验证假设，不是已经批准的产品定位。

## PROD-001 · 唯一产品楔子与三条北极星任务

- 优先级：P0 产品
- 估算：M
- 依赖：DEC-001、DEC-002
- 可并行：研究可与 PROD-002、PROD-UX-001、PRIV-001 并行

### 目标

从 DSH 二开平台、跨境能力、50 岗位组织、本地 Multi-Agent 工作台四条叙事中选择一个主产品，并定义唯一首次成功。

### 范围

- ICP、buyer、user、主要场景、价值主张、非目标。
- 三条首要业务任务的起点、完成条件、失败边界和证据。
- 主叙事与支撑能力关系。

### 非范围

- 不修改导航和功能。
- 不在本卡决定定价、计费或授权实现。
- 不以技能/岗位/系统数量定义价值。

### TODO

- [ ] 汇总当前四条产品叙事及各自目标用户。
- [ ] 选择一个主要 ICP 和一个首要任务，其余降为能力或后续市场。
- [ ] 为三条候选任务写 Job、触发、输入、完成产物、质量判据、失败/恢复。
- [ ] 定义“首次成功”必须产生的可验证业务结果。
- [ ] 写出明确非目标、暂缓功能和放弃条件。
- [ ] 用 5–8 位目标用户做问题/话术/任务访谈；不先推销既定答案。
- [ ] 将决定写入正式产品章程/ADR/Note，并让后续需求引用而不复制。

### 自动验收

- [ ] 产品章程 schema 字段齐全。
- [ ] 所有一级入口和 P1 需求能映射到三条任务之一。
- [ ] 重复、冲突的定位文案由文档门禁发现。

### 负向验收

- [ ] 两个 ICP/首要任务同时标为 primary、首次成功只定义为点击/安装、三条任务没有可验证产物、P1 需求无法映射到任务，任一情况都必须让产品章程校验失败。
- [ ] 只有内部意见、没有目标用户任务证据时，只能标“待验证假设”，不能进入已确认定位。

### 人工验收

- [ ] 至少 4/5 目标用户能在 30 秒内复述价值并选择正确首次入口。
- [ ] 内部产品、工程、支持对“首次成功”给出同一答案。

### 成功指标

- 唯一北极星任务。
- 定位理解率 ≥80%。
- 每个 P1 需求能说明对首次成功或风险关闭的贡献。

## PROD-002 · 能力成熟度与运行就绪账本

- 优先级：P0 产品
- 估算：M
- 依赖：DEC-006；最终字段与 PROD-001 对齐
- 可并行：schema 可先行

### 目标

把 Declared、Installed、Loaded、Configured、Connected、Outcome-verified 变成产品目录、健康中心、文档和支持共用的唯一事实。

### 范围

- package、feature、connector、tool、角色/小队能力的事实映射。
- shipped/candidate/external、owner、入口、依赖、证据时间、恢复动作。
- degraded/blocked/expired/not-authorized 等失败状态。

### 非范围

- 不因 package 存在自动宣称能力可用。
- 不给不同维度压成一个虚假百分比分数。
- 不把外部产品写入出货 preset。

### TODO

- [ ] 确认账本粒度和每种状态的 owner。
- [ ] 设计可版本化 machine-readable schema。
- [ ] 为所有已提交包、当前候选包和用户可见能力建立初始记录。
- [ ] 区分机器事实、人工批准和效果证据。
- [ ] 每个状态绑定可重复验证器、lastVerifiedAt、过期规则和 remediation。
- [ ] 50 个 draft roles、各 MCP、31 个系统入口和论文卡分别如实建模。
- [ ] 候选能力不能进入已发布产品视图。
- [ ] 产品目录、onboarding、support bundle、客户文档只消费该账本。

### 自动验收

- [ ] schema 校验与合法状态迁移通过。
- [ ] 100% 用户可见能力有记录。
- [ ] 证据过期自动降级，不继续显示 Outcome-verified。
- [ ] 改一个状态后所有消费者一致。
- [ ] `installed = usable` 的错误映射 mutation 会失败。

### 负向验收

- [ ] 仅因 package/入口存在就写 `Connected` 或 `Outcome-verified`、证据过期仍保持绿色、候选能力出现在 published 视图、未知状态被折叠为未安装，均必须判红。
- [ ] 删除任一用户可见能力记录或让两个消费者读取不同状态源，completeness/freshness gate 必须失败。

### 人工验收

- [ ] 干净客户 profile 逐项核对展示状态、真实入口和一次执行结果。
- [ ] 不可用能力显示原因和下一步，而不是消失或假绿。

### 成功指标

- 用户可见能力覆盖率 100%。
- 已安装误报可用为 0。
- 支持人员根据账本可定位 90% 标准故障。

## PROD-UX-001 · Settings Shell 候选收口

- 优先级：P0 UX
- 估算：M
- 依赖：BASE-001，先确认当前未提交候选归属；clean checkout/入口完整性只消费 QG-003、REL-001 的事实与退出条件
- 可并行：产品策略上可并行；文件层面不可与现有 Settings 工作并行写

### 目标

18/18 设置项可见、可滚动、可键盘访问，同时任何非 Settings dialog 的几何和样式不变。

### 范围

- Settings dialog 识别、CSS 作用域、导航滚动、分组、focus/Escape/恢复焦点。
- 常见窗口尺寸、缩放、明暗主题和 live restart。
- 干净安装后 Settings 入口的用户可达性；构建、打包和发布事实由 QG-003、REL-001 唯一维护，本卡不复制。

### 非范围

- 不在本卡重做全局信息架构。
- 不修改所有 dialog 尺寸。
- 不顺带合并其他未提交候选。
- 不把本机被忽略的 `lib/` 恰好存在当作 clean checkout 或发布可用证据。

### 用户旅程

1. 用户从应用入口打开 Settings，官方 Settings 解析器确认目标面板后才添加 Shell 自有 marker。
2. 用户在 18 个入口间滚动、切换和键盘导航；Shell 样式只在该 marker 下生效。
3. 用户关闭 Settings，焦点回到触发控件；marker、监听器和临时状态随面板销毁。
4. 用户随后打开 onboarding、确认框、New App、Role Matrix 或 Skill Center dialog，这些非 Settings modal 保持原几何、焦点和视觉。
5. 干净安装用户打开 Settings 时必须真实加载入口；该前提引用 QG-003、REL-001 的 clean-build 证据，不由本机缓存产物代替。

### TODO

- [x] 固化当前 CSS 会命中所有 modal 的 Red，并加入至少一个结构相似的非 Settings `[role=dialog][aria-modal=true]` 负例。
- [x] 只给“已被 Settings 解析器成功解析”的面板根节点添加 Shell 自有稳定 marker，例如 `data-dsh-settings-shell-root`；不得仅凭通用 modal 属性猜测。
- [x] JS 解析、marker 生命周期和 CSS 命中使用同一契约；解析失败保持官方原样并自报，关闭、替换或 parser drift 时移除 marker。
- [x] 所有 Shell 布局、导航和按钮规则都以前述 marker 为最外层作用域；删除对任意 modal、任意直接子 `nav` 和任意通用按钮的全局副作用。
- [ ] 覆盖滚动、选中、焦点、Esc、关闭后焦点恢复。
- [x] 分组 registry 不可读或数量不符时保持 fail-safe，不猜顺序。
- [ ] 将 QG-003、REL-001 的 clean checkout/入口证据链接到本卡，产品侧只验证“干净安装能打开 Settings”，不另写一份 release 结论。
- [ ] 重新执行 unit、真实 Chrome 几何、运行中 DSH 和视觉验收，并保存本次候选截图；历史截图或 Note 不代替本次结果。

### 自动验收

- [ ] 18 个设置入口逐项可达。
- [ ] 1280×720、1580×960、200% zoom 下导航和正文可用。
- [x] DOM fixture 证明只有成功解析的 Settings 面板获得 marker；解析失败、面板替换和 dispose 后 marker 为 0。
- [x] 非 Settings modal 负例证明 onboarding、确认框、New App、Role Matrix、Skill Center dialog 的尺寸、直接子 `nav` 和按钮 computed style 不被 Shell CSS 改写。
- [ ] clean checkout 中入口存在性与可加载性由 QG-003、REL-001 验证；本卡引用其证据 ID，且测试不得读取开发机被忽略的构建产物。
- [ ] 纯键盘路径、焦点恢复、reduced-motion 测试通过。
- [x] parser drift 会自报而非静默注入。

### 人工 / live / a11y 验收

- [ ] 鼠标和纯键盘均可到达 18/18。
- [ ] VoiceOver 顺序正确，Esc 后焦点回到触发控件。
- [ ] 明暗主题的品牌指示条/焦点环对比度和观感通过。
- [ ] 在同一运行中的 DSH 依次打开 Settings 与每个非 Settings modal，对比本轮截图和 computed geometry，确认无跨 dialog 污染。
- [ ] 在不带本机 ignored `lib/` 的 clean checkout/干净安装上打开 Settings；失败时引用 QG-003/REL-001 的构建证据定位，不接受复制本机产物作为修复。
- [ ] 重启后 live acceptance 再次通过；旧 Note 不代替新结果。

### 成功指标

- 设置入口可达率 100%。
- 裁切项 0。
- 非 Settings modal 回归 0。
- 被错误标记为 Settings 的非目标面板 0；关闭后遗留 marker/监听器 0。
- clean 安装 Settings 首次打开成功率 100%，证据由 QG-003/REL-001 关联提供。

### 失败边界

- 无法唯一解析 Settings 面板时不得添加 marker、不得套用 Shell CSS；保留官方界面并显示可诊断的降级状态。
- 任一非 Settings modal 的几何、导航或按钮 computed style 发生变化即阻塞候选，不以“仍可点击”降级通过。
- clean checkout 入口缺失或加载失败归 QG-003/REL-001 阻塞；本卡不得以本机存在的 ignored/stale `lib/` 证明用户可用。
- live/a11y 验收未覆盖当前候选版本时，状态只能是未验证，不能沿用历史截图或历史 Note。

### 2026-09-16 本地实施记录

- 状态：`local scope contract complete; live/a11y/clean-install unverified`。正式决策见
  [ADR-0098](../../../../docs/adr/ADR-0098.md)。
- Red：先增加 parser/marker/registry/关闭/替换负例，旧实现稳定出现 7 个失败；实现后 package
  suite 48/48、typecheck、bundle validator 通过。
- parser 现在要求唯一 Settings 候选、direct nav、`aria-labelledby` 直接标题、共同按钮父容器和唯一
  current；CSS 每条 selector 都由 `data-dsh-settings-shell-root` 起步。
- 五类非 Settings fixture 的 panel width、nav overflow 与 button position 保持原值；关闭、替换、
  drift、异常、registry 降级和 dispose 均回收不再可信的自有 DOM。
- 未完成项继续保留：真实 Chrome/DSH 几何、1280×720/1580×960/200% zoom、纯键盘、焦点恢复、
  reduced-motion、VoiceOver、明暗主题截图、clean checkout/干净安装。QG-003/REL-001 仍是入口与产物前置。

## PROD-003 · 统一 Onboarding 与健康中心

- 优先级：P1
- 估算：L/XL，必须拆子批次
- 依赖：PROD-001、002、PROD-004、PROD-UX-001/002、OBS-001、GATE-A2

### 目标

让新用户不打开终端完成“环境就绪→选岗位/小队→最少连接→完成首个结果”，失败时在同一处恢复。

### 子批次

#### PROD-003A · 状态机与只读健康面

- [ ] 定义步骤：版本/完整性、profile、TCC、Provider、bundles、连接、参考任务。
- [ ] 每步从成熟度账本读取，不复制判断逻辑。
- [ ] 明确 pending/ready/degraded/blocked/skipped 和恢复动作。
- [ ] 对约 1GB profile 准备显示真实进度与后台状态。
- [ ] 支持中断后重启续办，初始化幂等。

#### PROD-003B · 最短激活路径

- [ ] 为主要 ICP 只推荐一个岗位或小队和最少必要连接。
- [ ] 所有非必要能力允许稍后配置。
- [ ] 完成参考任务时验证产物而非只验证按钮点击。
- [ ] 成功后再引导能力扩展。

#### PROD-003C · 自助修复与支持

- [ ] 每个失败显示原因、影响和下一步。
- [ ] 安全的修复动作可一键执行；高风险动作要求确认。
- [ ] 不能自动修复时深链到准确设置或导出脱敏 support bundle。

### 自动验收

- [ ] 干净、离线、缺 Provider、TCC 拒绝、凭证过期、profile 损坏、重启续办全覆盖。
- [ ] 状态机不会重复初始化或覆盖用户数据。
- [ ] 成熟度账本与健康面没有状态漂移。
- [ ] 参考任务失败不会误计 activation。

### 人工验收

- [ ] 干净受支持 Mac 完整走查。
- [ ] 新用户不使用终端完成首任务。
- [ ] 中途中断、重启后可以继续。

### 成功指标

- 中位 TTFV ≤10 分钟，或相对真实基线下降 ≥50%。
- Onboarding 完成率 ≥80%。
- 关键失败态可操作率 100%。
- 终端介入率 ≤10%。

## PROD-004 · 面向任务结果的信息架构

- 优先级：P1
- 估算：L
- 依赖：PROD-001、002；商业方向会影响最终结构
- 可并行：研究/原型可与其他工作并行，生产实现等待决策

### 推荐一级结构假设

- 开始工作：新会话、岗位、小队、产品。
- 我的工作：运行、任务、研究、“我说”。
- 能力：技能、工具、连接。
- 管理：设置、主题、插件、诊断。

### TODO

- [ ] 将每个现有入口映射到用户任务、owner 和成熟度状态。
- [ ] 用 card sorting/tree test 验证四区模型，不直接进入代码。
- [ ] 让 Skill Center 成为统一能力目录；Overseas/Algo/Fullstack 成为 facet/deep link。
- [ ] 将维护者功能移到管理面，避免新用户接触 package/slot/profile 术语。
- [ ] 设计旧 deep link 兼容、返回上下文和空态。
- [ ] 31 个外部系统明确区分 browser entry 与真实 integration。
- [ ] 50 roles 明确显示 draft/not-authorized，不包装成生产授权。
- [ ] 原型经用户测试通过后，再拆小批次实现。

### 自动验收

- [ ] 100% 现有用户入口有唯一归属。
- [ ] 无死链；旧 deep link 可达。
- [ ] 权限、成熟度和空态不会因重构丢失。
- [ ] 路由与键盘导航覆盖通过。

### 人工验收

- [ ] 5 位新用户无需解释即可找到开始任务、继续任务、连接能力和诊断问题。
- [ ] 首个正确入口选择率 ≥80%。
- [ ] 开始北极星任务不超过 2 次主要决策。

## PROD-UX-002 · 跨 Surface 可访问性基线

- 优先级：P1
- 估算：M/L
- 依赖：PROD-004 的核心 IA；基础组件审查可先行
- 可并行：中

### 目标

Settings、Skill Center、Algo Skills、My Quotes、New App、Role Matrix、Agent Team 的关键流程均可用键盘、VoiceOver 和 reduced motion 完成。

### 范围

- 各 Surface 的 dialog、tabs/filter、搜索、状态消息、焦点生命周期与缩放行为。
- Skill Center Browse 分类控件、开发视图 tabs 和技能详情 dialog 的完整交互契约。

### 非范围

- 不为满足语义而错误套用 ARIA pattern；不是互斥视图的分类 chips 应使用 filter/`aria-pressed`，而不是伪装成 tabs。
- 不借可访问性修复重做信息架构或视觉品牌。

### 用户旅程

1. 键盘或 VoiceOver 用户打开 Skill Center，从搜索或 Browse 分类定位一个技能。
2. 若分类是互斥视图，用户可用方向键在 `tab` 间移动并通过关联 `tabpanel` 读取结果；若是可叠加筛选，则听到按钮的选中状态。
3. 用户切换开发视图 tabs，加载、错误和结果变化由 live region 宣读。
4. 用户从触发控件打开技能详情，焦点进入 dialog 并被限制在其中；在输入框等任意子控件上按 Esc 也能关闭。
5. 关闭后焦点返回原触发控件；该控件已消失时回到可预测的页面标题或结果容器。

### TODO

- [ ] 定义 WCAG 2.2 AA 基线和核心页面清单。
- [ ] 以 Agent Team/New App 的较好模式抽取或规定 dialog/tabs/status 交互契约。
- [ ] 先判定 Skill Center Browse chips 是互斥 tabs 还是多选 filter：前者补齐 `tablist/tab/tabpanel`、`aria-selected`、方向键和 roving tabindex，后者移除错误 tablist 并使用命名按钮与 `aria-pressed`。
- [ ] Skill Center 开发视图补齐 tab 与 panel 的双向 ID 关联、Home/End/方向键、激活策略和唯一 `tabIndex=0`。
- [ ] 搜索提供 accessible name，结果/错误提供 live region。
- [ ] Skill Center 详情 dialog 补齐 accessible name/description、初始焦点、focus trap、背景 inert、遮罩关闭、任意后代焦点下的 Esc 和关闭后恢复；输入焦点不得成为 Escape 例外。
- [ ] toast/status 可宣读；focus-visible、对比度、reduced-motion 一致。
- [ ] 避免为此引入新的通用组件 dependency，优先复用现有模式。

### 自动验收

- [ ] 核心页面 axe 无 critical/serious。
- [ ] Playwright 纯键盘路径通过。
- [ ] Skill Center tabs/filter 覆盖 ArrowLeft/Right、Home/End、Enter/Space、选中态与 panel 关联；语义选择与交互模型一致。
- [ ] dialog 焦点不可逃逸，关闭后恢复。
- [ ] Skill Center dialog 从搜索框、按钮、输入框等任意后代按 Esc 均关闭，重复开关不会累积 document listener。
- [ ] 状态变化可被 live region 捕获。
- [ ] 200% zoom 下无信息丢失。

### 人工 / live / a11y 验收

- [ ] VoiceOver 完成设置、选能力、执行任务、查看失败和清理 Quotes。
- [ ] VoiceOver 在 Skill Center 正确读出 tab/filter 的角色、名称、位置和选中态，dialog 打开/关闭时焦点不丢失。
- [ ] 纯键盘在明暗主题、200% zoom 和 reduced-motion 下完成“筛选→开详情→关闭→继续浏览”。
- [ ] 使用当前候选的 live DSH 走查并保存本轮证据；源码推断和旧截图不能替代。

### 成功指标

- 关键路径键盘完成率 100%。
- 阻断级 a11y 缺陷 0。
- VoiceOver 任务完成率 ≥90%。
- Skill Center dialog 焦点逃逸、Esc 失效和关闭后焦点丢失均为 0。

### 失败边界

- 若控件行为与宣称的 ARIA 角色不一致，按阻断缺陷处理；不得以“屏幕阅读器仍能读到文字”通过。
- dialog 无法保证焦点边界、Esc 或恢复焦点时不得宣称键盘可用。
- 自动扫描通过但关键任务无法由 VoiceOver 完成时仍不通过；live 验收缺失时保持未验证。

## PROD-UX-003 · Fullstack 138/89 能力发现与性能预算

- 优先级：P1 UX/性能
- 估算：M/L
- 依赖：PROD-002、PROD-004；候选归属先通过 BASE-001
- 可并行：信息架构原型与性能基线可并行；生产实现需等待成熟度字段稳定

### 目标

在当前候选“138 条 catalog、89 条 agent-fullstack whitelist”的规模下，让用户先看到与任务相关、已就绪的能力，而不是一次性浏览供应商库存；同时建立阻止目录继续膨胀拖慢 Settings 的性能预算。

### 范围

- Catalog 总量、preset whitelist、已安装/已就绪/推荐状态的清楚区分。
- 节点分类、搜索、筛选、展开、详情、空态/错误态和深链返回上下文。
- host 元数据读取、列表 API、Settings 内首屏渲染、搜索/展开响应与 DOM 规模预算。

### 非范围

- 不把 138 或 89 当作产品价值、安装成功或 Outcome-verified 的证明。
- 不在本卡批量安装第三方技能、扩大 whitelist 或改变供应链准入。
- 不用隐藏错误、截断总数或永久缓存过期元数据换取表面性能。

### 用户旅程

1. 用户从“能力”或任务上下文进入 Fullstack，首屏看到推荐/已安装/可用状态、`89 selected of 138 catalog` 的可解释计数，而非 138 张平铺卡片。
2. 用户按 M00–M13 节点、任务、状态或来源筛选，能理解“为何推荐”“为何不可用”和下一步。
3. 搜索或展开只增量渲染相关结果；进入详情后返回仍保留筛选、滚动和焦点。
4. Catalog/manifest/元数据加载失败时看到真实错误、受影响范围和 retry，不把失败显示为 0 项。

### 实施步骤

- [ ] 将 138 catalog、89 whitelist、installed、ready、recommended 建模为不同字段并消费 PROD-002；任何计数都显示口径。
- [ ] 首屏默认呈现与北极星任务相关的推荐/已就绪集合；M00–M13 折叠，全部库存通过渐进展开或搜索访问。
- [ ] 为 unavailable/blocked 项提供原因、依赖和恢复动作；为推荐项提供推荐依据。
- [ ] 避免逐项串行读取 138 份元数据阻塞首屏；选择可验证的批量、并行限流、索引或增量方案，并定义缓存失效规则。
- [ ] 只渲染可见/展开结果；首屏能力卡不超过 30，超量使用分页、窗口化或等价的增量机制。
- [ ] 建立固定的 138/89 fixture，以及至少 300 条合成目录的扩容回归 fixture。
- [ ] 在固定 reference Mac、production build、Settings 已打开的前提下记录基线与预算证据，硬件、版本、冷/热缓存条件必须随结果保存。

### 自动验收

- [ ] 138/89 fixture 的 catalog、selected、installed、ready 数量分别准确；筛选/搜索不会混淆分母。
- [ ] 目录加载失败显示 error+retry，绝不显示成功空态；部分元数据失败能定位条目并保留其余结果。
- [ ] reference 条件下列表 API p95：冷启动 ≤800 ms、热缓存 ≤300 ms；Settings 内首个有用内容 ≤1.0 s、可交互 ≤1.5 s。
- [ ] 搜索、筛选和单组展开反馈 p95 ≤100 ms；该流程不新增 >50 ms main-thread long task。
- [ ] 首屏能力卡 ≤30、总 DOM node ≤1,500；300 条扩容 fixture 仍满足交互预算。
- [ ] 详情返回后筛选、滚动和焦点恢复测试通过；键盘/axe 覆盖沿用 PROD-UX-002。

### 人工 / live / a11y 验收

- [ ] 新用户在 60 秒内找到一个与北极星任务相关且 ready 的能力，并能解释 138 与 89 的差异。
- [ ] 在 live DSH 中验证冷/热打开、搜索、连续展开、失败重试、详情返回；保存 Performance trace 与当前候选截图。
- [ ] VoiceOver/纯键盘能听懂计数口径、筛选状态、结果数量、不可用原因和加载错误。
- [ ] 1280×720、200% zoom 下首屏不被大目录挤占，焦点不会跳入未渲染项目。

### 成功指标

- 目标能力 60 秒发现成功率 ≥80%，首次正确入口率 ≥80%。
- 138/89 口径理解率 ≥80%；因“catalog=installed/ready”造成的误解为 0。
- 性能预算达标率 100%，加载失败被误呈现为空结果为 0。

### 失败边界

- catalog、whitelist 或成熟度事实不一致时显示 degraded 并阻塞候选提升，不猜测或静默改写计数。
- 任一核心性能预算超标时先保留基线与 trace，再优化数据读取/渲染；不得删除错误状态或可访问性语义换速度。
- 300 条 fixture 只证明规模保护，不证明 138 个真实技能可用；Outcome-verified 仍由 PROD-002/006 决定。

## PROD-UX-004 · New App Products 与 Systems 同步刷新恢复

- 优先级：P1 UX
- 估算：S/M
- 依赖：PROD-002；Systems 服务契约稳定后实施
- 可并行：可与 PROD-UX-003、005 并行

### 目标

让 New App 的一个 Reload 同时重试 Products 与 Systems，并保持两个数据域独立反馈，用户无需关闭重开面板才能从 Systems 失败中恢复。

### 范围

- 共享 refresh generation/event、两个独立 loading/error/success 状态、过期响应处理、retry 和状态宣读。
- Products 成功/Systems 失败、Products 失败/Systems 成功、双失败和双成功四种组合。

### 非范围

- 不把 Products 与 Systems 合并为一个后端请求或同一成功状态。
- 不借刷新修改外部产品挂载、Systems 权限或成熟度判断。

### 用户旅程

1. 用户打开 New App，Products 与 Systems 独立加载并显示各自状态。
2. 任一域失败时，用户看到原因与同一个明确 Reload；已成功的另一域保持可见。
3. 用户触发 Reload，Products 与 Systems 都以同一 generation 重新请求，分别进入 loading 并独立落到成功或错误。
4. 新 generation 完成后旧响应不再覆盖 UI；错误恢复后焦点和上下文保持在原面板。

### 实施步骤

- [ ] 将父级 refresh generation 或等价事件显式传入 Products 与 `SystemsSection`，移除只重跑 Products 的隐含契约。
- [ ] 两个域各自维护 loading/error/data；刷新不清空另一域已成功数据，也不把部分成功显示为整体成功。
- [ ] 对 superseded 请求使用 abort 或 generation guard；连续点击只保留最新结果并防止请求风暴。
- [ ] 为 Systems error 增加可聚焦的 retry 路径；状态变化使用 `aria-live`/`aria-busy`，Reload 保留 accessible name。

### 自动验收

- [ ] 一次 Reload 精确触发 Products 与 Systems 各一次新请求。
- [ ] Products fail→retry→success、Systems fail→retry→success、双域混合状态和双失败均有测试。
- [ ] 旧 generation 晚返回不会覆盖新结果；重复点击不会产生重复提交或无限 loading。
- [ ] 任一域失败不删除另一域已成功数据；错误不是成功空态。
- [ ] keyboard、focus、live-region 状态测试通过。

### 人工 / live / a11y 验收

- [ ] 在 live DSH 模拟 Systems 失败后用一个 Reload 恢复，无需关闭/重开 New App。
- [ ] 模拟 Products 成功/Systems 失败与反向组合，文案能准确说明受影响区域。
- [ ] VoiceOver 宣读“正在刷新 Products/Systems”、各自结果和错误；纯键盘可触发 retry 且焦点不丢失。

### 成功指标

- Reload 双域重试覆盖率 100%；Systems 错误必须关闭重开才能恢复的比例为 0。
- 可恢复故障一次 Reload 恢复率 ≥95%；过期响应覆盖新状态为 0。
- 双域失败被误报为成功或空态为 0。

### 失败边界

- 若 Systems 不支持安全重试，必须显示原因与替代恢复动作，不得让 Reload 假装成功。
- 任一域权限/授权失败不得由刷新绕过；继续显示 blocked 并深链到正确设置。
- 新旧请求无法可靠区分时暂停自动并发刷新，不能接受最后返回者覆盖当前 generation。

## PROD-UX-005 · Team Hub Admin 异步错误恢复与危险操作确认

- 优先级：P0 管理 UX
- 估算：M
- 依赖：SEC-RT-004、PROD-002；权限与审计契约先明确
- 可并行：UI 状态模型与文案可先行；API 行为等待安全契约

### 目标

让 Team Hub 管理员面对异步 API 失败时得到可恢复反馈，并保证 reset password、disable user 等危险操作在明确对象、后果和确认前绝不发出请求。

### 范围

- route renderer 的 async error boundary、loading/error/retry、401/403、stale response 和防重复提交。
- reset password、disable/enable user 等危险动作的确认、结果、焦点、live status 与审计关联。
- Admin 表单的显式 label、错误关联和键盘/VoiceOver 流程。

### 非范围

- 不在本卡改变 Team Hub 角色权限或扩大管理 API。
- 不把 confirm 当作后端授权替代；SEC-RT-004 的 default-deny 仍是硬边界。
- 不在错误 UI 暴露 token、generated password、内部堆栈或用户隐私。

### 用户旅程

1. 管理员进入 Users/Self-test 等 Admin 路由，加载、空态和错误状态清楚且可宣读。
2. 异步请求失败时页面级 error boundary 捕获 rejection，保留当前路由与安全输入，并提供 Retry。
3. 管理员选择 reset password 或 disable user，确认框点名目标用户、不可逆/中断影响和取消路径；默认焦点不落在危险确认上。
4. 明确确认后只发送一次请求，完成/失败均有可宣读反馈与审计 ID；取消时请求数为 0。
5. 401 返回引导重新登录并保留可安全恢复的目标路由，403 不伪装成网络错误。

### 实施步骤

- [ ] 所有异步 route renderer 必须被 `await`/统一 promise boundary 包住，root 启动也捕获 rejection；移除无法捕获异步失败的同步 `try/catch` 假安全。
- [ ] 建立统一 error+retry 状态，区分 network、401、403、validation、conflict 和 server error；retry 保持路由且避免重复 listener。
- [ ] 对路由切换和重试加入 abort/generation guard，过期响应不得覆盖当前页面。
- [ ] reset password、disable user 等危险操作使用真正的 modal confirmation，显示目标、后果和动作名称；取消、Esc、遮罩和关闭后焦点恢复一致。
- [ ] 提交期间禁用重复动作并使用 idempotency/客户端 single-flight；结果绑定审计 ID，敏感结果只在必要时一次性展示。
- [ ] 给 login、password、create-user 等输入添加永久可见 label、描述与 field-level error 关联；状态输出使用合适 live region。

### 自动验收

- [ ] 每个 route renderer 的 rejected promise 都进入可见 error UI，无 unhandled rejection；Retry 可恢复到 success。
- [ ] network/401/403/validation/conflict/server error 分支和路由保留行为有测试。
- [ ] reset/disable 在确认前、取消后、Esc 后请求数均为 0；确认后即使双击也只发送一次。
- [ ] stale response 不覆盖新路由；dispose/retry 后 listener 和请求 handler 数不增长。
- [ ] dialog focus trap/restore、label/error 关联、live region 与 axe/键盘测试通过。

### 人工 / live / a11y 验收

- [ ] 在 live Team Hub 以网络限速、断网、500、401、403 逐项验证错误解释、Retry 和路由恢复。
- [ ] 以测试用户演练 reset password 与 disable/enable；确认框能让管理员准确复述对象与后果，取消不产生审计事件。
- [ ] VoiceOver/纯键盘完成登录、建用户、危险确认、错误重试；焦点不逃逸、不丢失。
- [ ] 检查 UI、日志与 support bundle 不显示 token、完整 generated password 或内部堆栈。

### 成功指标

- 已知异步失败分支可见且可重试覆盖率 100%；unhandled rejection 为 0。
- 危险请求在未确认状态下发出次数为 0；重复提交为 0。
- 标准可恢复故障一次 Retry 成功率 ≥95%；管理员误操作率相对基线下降 ≥50%。

### 失败边界

- 错误类型未知时显示安全的 generic error 与 correlation ID，不回显原始 body/stack；不得吞错或显示空白页面。
- 权限状态不确定、审计不可用或目标用户已变化时禁止危险提交，要求刷新并重新确认。
- reset/disable 结果无法确认时保持 pending/unknown，不显示成功；Retry 必须依赖幂等契约，不能盲目重复危险请求。

## PROD-005 · 核心任务基线与评分规范

- 优先级：P1
- 估算：M
- 依赖：PROD-001
- 可并行：高

### 目标

为三条核心业务任务建立可重复输入、评分、基线和失败分类，不再以技能数量推断价值。

### TODO

- [ ] 每条任务选择代表性 case、输入、允许工具、时间/成本预算和期望产物。
- [ ] 建无增强 baseline、当前产品 arm 和必要消融 arm。
- [ ] 评分拆正确性、证据、完整性、可执行性、人工编辑量和安全性。
- [ ] 固定随机种子/版本/provider/提示边界；记录不可控因素。
- [ ] 评分 rubric 由至少两位评审对齐，必要时保留盲评。
- [ ] 定义最低非劣阈值和停止规则。

### 自动验收

- [ ] case schema、输入 hash、结果 provenance 可验证。
- [ ] 同一 arm 可重复运行，结果差异在预算内。
- [ ] 缺结果、工具失败、超预算不被计成功。

### 人工验收

- [ ] 评审一致性达到预先设定阈值。
- [ ] 样例能代表真实工作而非只验证路由。

## PROD-006 · Matched outcome evaluation

- 优先级：P1
- 估算：L
- 依赖：PROD-002、PROD-005
- 可并行：执行 arm 可并行，汇总必须 matched

### 目标

验证角色、技能、连接和小队是否真正改善业务产物；重点复核已观察到的技能增强负 delta。

### TODO

- [ ] 对每条核心任务运行无增强/增强 matched pairs。
- [ ] 控制 provider、模型、上下文、时间和工具权限。
- [ ] 分析总体与细分 delta，不只报告平均值。
- [ ] 记录失败、人工接管、恢复、成本和副作用。
- [ ] 对负 delta 做原因归类：路由错选、上下文污染、技能过长、工具失败、判据不匹配。
- [ ] 只有达到阈值的能力才能进入 Outcome-verified。
- [ ] 未达标能力降级、限制场景或移出默认路径，不通过文案修饰。

### 自动验收

- [ ] matched pair 的 case/input/provider/model/tool 权限与预算一致；缺 arm、配对漂移、超预算或失败样本被漏计时评估非零退出。
- [ ] 阈值、置信区间、细分结果和负 delta 保留在 machine-readable report，过期后账本自动撤销 Outcome-verified。

### 人工验收

- [ ] 至少两位盲评者按 PROD-005 rubric 对同一批产物评分并达到预设一致性；争议与负结果原样保留。
- [ ] 产品 owner 逐条确认降级/保留决定与细分证据一致，不以总体平均值覆盖高风险失败。

### 退出条件

- [ ] 至少三条核心任务有 matched 结果。
- [ ] 产品 arm 不低于非劣阈值。
- [ ] 所有结论绑定模型/版本/case/时间，过期后自动降级。
- [ ] 负结果保留并影响产品决策。
