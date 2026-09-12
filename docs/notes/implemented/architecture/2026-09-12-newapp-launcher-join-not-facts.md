# 「新应用」启动器：把两半合起来，而不成为第三个 owner（ADR-0028）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0028](../../../adr/ADR-0028.md)。

## Problem

用户要求把上游 `dsh-worktable` 融合进来：官方「新会话」缩半、另一半放「新应用」、
平行对齐，并交付「应用矩阵」抽屉。

需求本身是布局需求，但落到本机上必须先答一个问题：**「应用」这个对象在本机的数据里
存在吗？** 这决定了新包是「又一个数据面」还是「第一个连接面」——两种做法的长期成本
完全不同，而选错的那个在一开始看起来更省事。

### 取证：三个来源，没有一个存着「应用」

逐个读真实来源（不是读文档、不是推测）：

| 对象 | 拥有者 | 物理形态 | 证据 |
| --- | --- | --- | --- |
| 岗位 | 官方预设名册，经 `dsh-role-matrix-local` 发布 | `~/.dsh/.agent-presets/agt-NNN/` | 该面已发布 `GET /api/dsh-role-matrix/list` |
| 项目 | `dsh-worktable`（vendor pin 的第三方包） | `GET /api/worktable/workspaces` → `global.workspaceIds` + `tables.workspaces[id].title` | `lib/client.js` 的 `fetchSessionGroups()` 正是这样读的 |
| 项目覆盖层 | `dsh-worktable` | `localStorage['dsh.worktable.projects.v1']` | 同文件 `PROJECTS_KEY`；`loadProjects()` 的 `DEFAULT_PROJECTS.order` 是 `[]`——**它是覆盖层，不是列表** |
| 布局预设 | `dsh-worktable` | `localStorage['dsh.worktable.split.v2']` | 同文件 `PERSIST_KEY = "dsh.worktable.split.v2"` |

> **2026-09-12 更正（本表初版第 2 行写错了，并且真的上线了）**：初版把「项目」的物理形态
> 记成 `localStorage['dsh.worktable.projects.v1']`，证据是「`lib/client.js` 里有
> `PROJECTS_KEY` 这个常量」。**证据是真的，结论是错的**：那个键存的是覆盖层
> （order / nameOverrides / hidden / removed / lastUsed），`order` 在用户没手动拖过卡片时
> 就是 `[]`。于是抽屉在一台有 **11 个工作区**的机器上显示 0 个项目——症状精确地对应用户
> 看到的那一幕「只有岗位，没有工作台项目」。
>
> 教训是可复用的：**「这个键存在」不等于「这个键是那份事实」**。定位一个面的事实之家时，
> 要读它**自己怎么取数**（这里就是 `fetchSessionGroups()` 里那三行），而不是找长得像的常量名。

官方「新会话」起的是**空**会话——外壳里没有任何「项目」概念；工作台里没有任何「岗位」
概念。**「应用」= 岗位 × 项目的连接，而这个连接此前不被任何地方渲染，因为它不被任何
地方同时看见。**

### 顺带纠正需求里的一处措辞

需求写「把那个组件的按钮放在……」。取证后确认：工作台并没有一个「按钮」可以搬。它在
侧边栏是通过 cordis slot 注册的一个**区块**：

```js
ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
  name: "sidebar.footer.action", id: "dsh-worktable", order: 20, …}, WorktableSection))
```

即它是**底部区块**，不是启动位上的按钮。所以「融合」不是搬一个按钮，而是**新做一个
启动位上的入口**，并把底部区块的归属作为独立决策（D-B）处理。

### 侧边栏几何：全部来自实测，无一处是估计

从官方客户端 bundle 逐字读出的度量：

| 事实 | 值 | 为什么它重要 |
| --- | --- | --- |
| root 布局 | `flex-direction: column` | 列方向两个兄弟会**堆叠**，不会自动并排 |
| `newSession` 展开态 | `height: 38px; flex: none; margin: 0 2px 8px` | 上提量的来源 |
| `newSession` 宽度 | **无显式 width**（靠 stretch 撑满） | 所以必须自己给两个盒子各写半宽 |
| 官方样式表 `!important` 计数 | **0** | 内联样式必胜 ⇒ 不需要注入样式表、不需要拼类名 |
| 收起 rail | `36×36; align-self: flex-start`，root `padding: 18px 10px 6px` | 36px 内容宽 vs 18px 图标 ⇒ 硬分会切图 |
| `logoRow.children` 区间 | `[12130..14744]`，而 `newSession` 在 `15043` | 按钮在 logoRow **之外**，是 root 的直接 flex 子元素 |

最后一行纠正了内核里一条被误传的注释（原写「newSession 嵌在 logoRow 里」）。参照系错了，
整个并排几何就会挂在错误的前提上。

## Decision

见 [ADR-0028](../../../adr/ADR-0028.md)。一句话：**启动器只拥有「连接」，不拥有事实；
逐源降级；半宽并排用内联样式；收起态降级为堆叠；锚点失效自报。**

## Alternatives considered

| 方案 | 为什么不 |
| --- | --- |
| 启动器自建数据源（自己扫预设目录 + 自己解析工作台存储） | 立刻成为 ADR-0009 意义上的第二份事实之家；工作台是第三方包，其存储格式不由本仓库控制 |
| 沿用 `before`/`after` 再加一行插件行 | 把「启动」拆成两行、推下工作区浏览器，并暗示两步操作；且用户明确要的是**并排** |
| 运行时搬动官方按钮节点（flex 容器重排） | 触碰 React reconciliation；违反既有的「不搬动官方 DOM」纪律 |
| 用样式表规则表达半宽（`.entryRoot { width: 50% }`） | 需要拼类名选择器，且规则会被外壳下一次构建失效；内联既必胜又不碰节点身份 |
| 把工作台底部区块完全隐藏、能力全搬进抽屉 | 归属问题（D-B），本 ADR 不定夺；但无论怎么定，都不得写工作台的状态 |

## Consequences

### 正面

- **融合不引入任何新的数据所有权，也不引入任何新的写路径。** 新包对工作台只有读路径，
  连被禁用的写路径都没有——两个 owner 争一份状态，是「谁后加载谁赢」。删掉本包不丢事实。
- **两个上游任一被卸载，抽屉降级为另一半而不是报错**，且降级按来源点名（含 owner 与
  它拥有的事实），用户知道该去装什么。
- **几何全部可回归**：上提量由 `getBoundingClientRect()` 运行时算出，外壳改高度或外边距
  时本包跟着变，不会静默错位。

### 负面 / 未决

- **耦合面窄但真实**：`GET /api/worktable/workspaces` 的响应形状，加上项目覆盖层与布局
  两个 localStorage 键，是本包与第三方包之间的全部契约。上游改字段名时本包会**静默读到
  空**——看起来和「本机真的没有项目」一模一样。缓解：这些形状被契约测试逐字钉住
  （`tests/sources.spec.ts`），改键名在测试里红，而不是在用户那里表现为空。
  **但这条缓解只覆盖「键名改了」，不覆盖「选错了键」**——初版恰恰死在后者上：键名一个字
  都没错，仍然读到了空。所以契约测试里现在有一条**否定式**用例：覆盖层为空时，项目列表
  必须仍然完整（`reports projects as usable when the route answers even with an empty overlay`）。
- **能力上限由被连接的面决定**：想显示岗位详细清单，就得先让名册发布那些字段。这是刻意
  的——**连接不得伪装成拥有**。
- **D-B（底部区块归属）未定夺**：工作台的 `sidebar.footer.action` 区块与新的「新应用」
  抽屉在语义上有重叠，本 ADR 只约束「不写工作台状态」，不与上游争同一个槽位的所有权。
- **几何已验收（2026-09-12 更新）**：`probe:geometry` 在真 Chrome 下 18/18（两键同行、
  等高 38px、等宽、间距 4px、下方工作区零位移），`probe:reconcile` 在真 React 下 29/29；
  用户重启后在活实例里目视确认并排成立。**初版此条写的「仍待浏览器验收」已关闭。**
  活实例里的**像素级** rect 仍未取到（浏览器桥未连、桌面自动化权限全 false），
  取到的是真 Chrome 布局引擎与用户目视两侧的证据。
- **项目来源写错并上线（2026-09-12 修复）**：见上文更正——本项目里真实发生的缺陷。

## 决策点 D-B：工作台底部区块**保留原样**（不隐藏、不默认收起）

### 取证：那个区块到底承载什么

`WorktableSection` 注册在 `sidebar.footer.action`。逐字读它的实现（不是看截图）：

| 它在做的事 | 证据 |
| --- | --- |
| 增 / 删 / 改名 / 排序项目 | `addOpen` 状态 + `dsh-wt_addForm` / `dsh-wt_addBtn` / `dsh-wt_addFolderRow` |
| **写** `dsh.worktable.projects.v1` | 全 bundle 内该键的**唯一**写入点是 `persistProjects()`（`localStorage.setItem(PROJECTS_KEY, …)`），被区块、控制台与分栏工作区共同调用 |
| 会话 ↔ 项目绑定 | `persistProjects(prev => ({ …prev, bindings: { …prev.bindings, [pid]: sessionId } }))` |
| 文件夹选择与视图选项 | `dsh-wt_addFolderRow`、`views` / `viewOptions` |
| **其他插件的扩展点** | slot `sidebar.worktable.project`（`kind: "list", scope: "root"`），兄弟插件把项目行注册进这里 |
| 版本更新检查 UI | `K_UPDATE_CHECK` / `K_CACHE` / `K_LAST_CHECK` |

### 决定与理由

**保留原样。** 三条理由，第一条是决定性的：

1. **隐藏它会移除本包架构上无法替代的能力。** 抽屉按 ADR-0028 是**只读**的——连被禁用
   的写路径都没有。而底部区块是 `dsh.worktable.projects.v1` 的**唯一写面**。隐藏它 = 用户
   再也无法新建 / 绑定 / 整理项目，且抽屉**不可能**补上这个出口，除非推翻 ADR-0028。
   换言之：C1.5 原本给的「若选隐藏则抽屉内保留等价出口」这条验收，与 ADR-0028 直接冲突
   ——这本身就是「不该隐藏」的证据。
2. **它是别的插件的扩展点。** 隐藏 slot `sidebar.worktable.project` 所在的面，会让所有往
   里注册项目行的插件**静默失效**（注册成功、渲染无处）。
3. **「默认收起」不是只读操作。** 工作台的展开/收起是它自己的持久状态（`dsh.worktable.view.v1`）。
   要让它在默认态收起，要么写它的状态（违反 ADR-0028）、要么做纯视觉覆盖去和它自己的状态
   打架，并把「新建项目」多藏一层点击，收益为零。

用户的需求是关于**启动位**的（「新会话」缩半、旁边放「新应用」），没有一处要求移除工作台
自己的面。把「融合」读成「替换」是超出需求的。

**什么会改变这个决定**：如果上游给工作台的写操作提供了一条受支持的 API（而不是让消费者
直接写它的 localStorage），那么一个可写抽屉就能承担等价出口，D-B 值得重开。在那之前保留。

## 取证过程中被否掉的两个中间判断

写下来是因为它们都属于「看起来合理但经不起实测」：

1. **「从 `style[data-plugin-css]` 解析类名哈希前缀」**——原计划要求做，实测**不需要**：
   CSS-module 类名格式是 `<hash>_<localName>`，本地名完整保留，子串选择器天然跨代；
   覆盖侧走内联样式则根本不需要选择器。做过头的解析反而更脆。ADR-0019 的实质是
   **禁止把哈希写进产品代码**，不是**必须去解析哈希**。
2. **「新会话按钮嵌在 logoRow 里」**——内核原注释如此写，实测不成立（区间不重叠）。
   已在代码注释中改正并留下度量依据。

## 顺带锤实的一件事：本仓库有 8 个**幻觉 token**，而「无硬色值」此前只是口头验收

C2 的验收写着「无硬色值（只走 `--dsw-alias-*`）」。本包按此写法把颜色都写成
`var(--dsw-alias-x, <字面兜底>)`——然后发现这个写法有一个**静默**失败模式：

> token 名字打错或根本不存在时，CSS 不报错、构建不报错、页面照常显示——只是**永远走
> 那条字面兜底**，于是这个元素不再随主题变化。浅色下看不出来，深色下才暴露
> （`rgba(0,0,0,0.05)` 铺在深色底上等于没有）。

### 实测：把「已定义」当成一个可查的事实

从**应用内官方包**逐字提取 `--dsw-<name>:`：**357 个**已定义 token（唯一事实源，不抄
第二份）。再提取**本仓库主题插件**的供给映射 `"--dsw-x":`：**66 个**（`dsh-theme-local`
本就是 token 的供给方，漏掉它会造出一大批假阳性——假阳性会训练人忽略输出）。

对 6 个受管包的 88 个引用做差集：

**8 个被引用、但没有任何地方定义过。**

| 幻觉 token | 引用它的包 |
| --- | --- |
| `--dsw-alias-fill-tsp-secondary` | dsh-role-matrix-local（**本包已修**：改用 `--dsw-alias-bg-layer-2`） |
| `--dsw-alias-radius-lg` / `-md` / `-sm` | dsh-theme-local、dsh-agent-team-gui-local |
| `--dsw-alias-separator-primary` | dsh-root-brand-local |
| `--dsw-alias-shadow-lg` / `-md` | dsh-deepresearch-local、dsh-theme-local、dsh-agent-team-gui-local |
| `--dsw-alias-state-business-secondary` | dsh-skill-center-local |

**本包的这一处是从 role-matrix 抄来的**——一个幻觉 token 在复制粘贴里传了两代。这正是
「口头验收」的代价：没有任何机制能发现它被违反。

### 处置：把它变成门禁项，而不是写成一段散文

新增门禁 `theme-tokens`（full 模式，`scripts/gates/theme-tokens.mjs`）：

- 已验证 = 官方包定义 ∪ **本仓库主题插件供给**；
- app 未安装时**报告跳过**（与 `patch-anchors` 同一语义：不假绿也不假红）；
- 扫到目录却一个 token 都读不出来 → **判失败**（提取方式失效会让本项静默空转）；
- 存量 8 条登记在 `theme-tokens-baseline.json`，**只减不增**：基线条目一旦不再被引用
  即判失败，强制把清单删干净（ADR-0014 的同一纪律）。

**未处置的 8 条为什么留着没改**：它们的替换要逐处选对 token（圆角家族在本平台**整个不
存在**、阴影走的是 `--dsw-shadow-*` 而非 `alias-shadow-*`、业务二级态要挑语义），每个
选择都会**改变视觉**，而其中三个包（root-brand 的官方 UI 覆盖层、theme studio、
agent-team-gui）都在本轮范围之外。盲改是拿别人的界面下注——先让违规**可见且不增长**，
再在有验收条件时逐条处置。

**两处变异测试（证明本项非空转）**：① 往本包 CSS 注入一个不存在的 token → `theme-tokens`
转红并**逐字点名 token 与文件**；② 往基线塞一条不被引用的条目 → 转红并报「已不再被任何包
引用」；两次还原后门禁均回到 17/17 退出码 0。

## 真实浏览器验收：jsdom 查不出的一个真缺陷

C1 的验收写着「真实 DOM 几何断言（两键 rect 同行等高）」。jsdom **不做布局**——
`getBoundingClientRect()` 恒为 0，测试只能*供给*官方按钮的盒子，因此它验的是内核的**算术**，
不是浏览器的**布局**。而「两键在同一行、下方不位移」是个关于布局引擎的断言。

本机有 Google Chrome，于是新增 `scripts/geometry-probe.mjs`（在该包内 `pnpm run probe:geometry`），
用 Playwright 驱动**真实 Chrome**测真实盒子。两条设计纪律让它是证据而不是自证：

1. **外壳样式表从 shipped bundle 里提取，绝不重打一遍。** fixture 用的
   `x-Wl6W_*` 规则是逐字从 `@deepseek-ai/dsh-client-ui-sidebar/lib/client.js` 里取出来的；
   手写一份复制品会悄悄与外壳漂移，把探针变成「在测我自己的假设」。
2. **前置条件缺失时响亮退出**（找不到 Chrome / 找不到 app），绝不静默变绿。

### 它抓到的真缺陷：下方工作区位移 8px

第一次跑，18 项里 7 项红。其中 1 项是**真产品缺陷**，其余 3 项是探针自身的错。真缺陷是：

> `下方工作区零位移` FAIL —— `regionArea top 120 → 112`

**根因是 flex 列的算术，而我第一版 CSS 的注释把它写反了。** 第一版给自建键写了
`margin-bottom: 0`，并附了一句很自信的注释：「保留自己的下边距会让推进量翻倍、把工作区
推下去」。**它不会翻倍——它是用来抵消上提量的。**

```
官方键贡献  height 38 + margin-bottom 8            = 46
自建键贡献  margin-top -46 + height 38 + bottom B  = B - 8
```

`B = 0` 时这一对让文档流**少推进 8px**，于是工作区顶部上移 8px 并静默长高 8px
（实测 120 → 112）。`B = 8` 时贡献正好是 46，下方纹丝不动。**修好后实测 120 → 120。**

这条正是文档里原本被当作「已成立」写下的那句「容器总高不变，下方 regionArea 零位移」
——它在被真实浏览器测到之前是**假的**。jsdom 结构上不可能发现它。

**探针自身的 3 个错**（一并记下，因为「探针报红」与「产品坏了」必须分得开）：

| 症状 | 我的错 |
| --- | --- |
| `半宽公式` 报红 | 断言把**一个宽度**和**两个宽度之和**比（`W+4` vs `2W+8`）。改为与 root 的**真实内容盒**比：`(entry.right+2) − (official.x−2) = 256 = root 内容宽` |
| 收起态 4 项全红 | 只加了 `collapsed` 类、没有收窄侧栏。**真实收起会改变列宽，而那是内核 ResizeObserver 的触发条件**；不改盒子就永远不触发 → 探针造了一个现实中不存在的场景 |
| `卸载后宽度还原` 报红 | 前一步把外壳留在收起态，测到的是收起态的 36px。改为先还原外壳再测 disposer |

### 结果

`pnpm run probe:geometry` → **18/18 通过**，关键读数：

| 断言 | 实测 |
| --- | --- |
| 两键同一行 | 官方 top=74，自建 top=74（差 **0.00px**） |
| 两键等高 / 等宽 | 38px / 38px；124.00px / 124.00px |
| 半宽公式 | `2+W+2+2+W+2 = 256.00px` = root 内容宽 256.00px |
| 下方工作区零位移 | regionArea top **120 → 120** |
| 容器总高不变 | root 高 700 → 700 |
| 圆角 / 字号与官方一致 | 12px / 14px（两侧相同） |
| 收起态 | 官方 top=66、自建 top=114（**堆叠**）；自建键 36×36；图标 18×18 ⊂ 36×36（**不切**）；文案隐藏 |
| 卸载 | 官方宽度 252 → 252；入口行已移除 |

**变异测试**：把 `margin-bottom` 改回 `0` → 恰好「下方工作区零位移」一项转红、
17/18、退出码 1；还原后 18/18。**探针非空转。**

### 顺带纠正：两处样式值我是猜的，实测不一样

第一版 `.entry` 用了 `border-radius: 8px`、`gap: 7px`、透明背景、`font-size: 13px`
——**看起来合理**，但真值是 `border-radius: 12px`、`gap: 6px`、
`background: var(--dsw-alias-button-elevated-fill)`、`font-size: 14px; font-weight: 500`、
`border: .5px solid var(--dsw-alias-border-l3)`。差 4px 圆角和一层底色，足以让这一对读成
「两个不相干的控件碰巧占了一行」。现已逐字抄官方 `.newSession` 规则，并复用官方按钮**自己
用的那四个 token**，于是两键天然同主题。探针现在有两条断言守着这件事（圆角/字号一致）。

## 验证

| 项 | 证据 |
| --- | --- |
| typecheck | `tsc --noEmit` 退出码 0，覆盖 17 个 src 文件 |
| test（jsdom） | **63/63 通过**（4 个套件：连接与逐源降级 25、栅栏与载荷 13、构建契约 16、split 接线与降级自报 9） |
| **真实浏览器几何** | `pnpm run probe:geometry` → **18/18 通过**（真 Chrome + 从 shipped bundle 提取的官方样式表）；变异回 `margin-bottom: 0` → 恰好 1 项转红、17/18 退出码 1 |
| build | `tsc -p tsconfig.build.json && tsdown`：`lib/index.js` 7.85 kB / `lib/client.js` 57.34 kB |
| **变异测试（关闭上轮遗留的缺口）** | 把共享内核的两个宽度赋值 `calc(50% - 4px)` 改成 `9px` 并重新同步 → **恰好 2 条 split 断言转红，其余 61 条保持绿**；还原后 63/63 |
| **变异测试（新增的 theme-tokens 门禁项）** | ① 注入不存在的 token → 转红并点名 token 与文件；② 基线塞入不被引用的条目 → 转红并报「已不再被任何包引用」；两次还原后 17/17 |
| 门禁 | `pnpm run gate --mode full` **17/17 退出码 0**（本轮新增 `theme-tokens` 一项） |
| 装载 | `~/.dsh/profiles/desktop` 加入 dependency + `dsh.profile.bundles`，`pnpm install` 退出码 0；11 个 patch 步骤全部报告（C0.5 的守卫生效）；`lib/client.js` 与 `lib/index.js` 与仓库源 `cmp` 逐字节相同 |

**仍未验证（如实记录）**：只剩 `浅色深色双主题回归通过`。本轮把「token 真的存在」变成机器
可查（此前不可查），并拿到了真实浏览器下的几何读数，但**双主题的视觉回归没有跑**——它需要
在装好插件的真实 GUI 里切主题，而那要等重启。这一项留在 C2 未完成。

上轮的 C1.2 如实记过「针对 split 套件的变异测试未取得结果」。本轮补上了，且结论是**断言非
空转**。同一环境下 `dsh-role-matrix-local` 的该套件单独运行时同样 8/8 通过、56ms——上一轮
观察到的启动期卡死**未能复现**，故不以「环境故障」解释它，只记录为一次未能复现的观察。
