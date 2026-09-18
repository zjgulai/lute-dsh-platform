# 浅色主题取真中性骨架：被消费的 alias 必须全量接管，字面兜底上收

关联：[ADR-0115](../../../adr/ADR-0115.md)、[ADR-0104](../../../adr/ADR-0104.md)、[ADR-0029](../../../adr/ADR-0029.md)

## Problem

2026-09-17 深色整改收尾后，用户报告浅色主题「充斥着很多种蓝色和蓝色的涂层」，色彩不一致、专业感差。
本次对该判断做实测审计（只读；扫描脚本与产物解析命令见「后果」），**结论是浅色不是某处写错了蓝色，
而是品牌皮肤只覆盖了不到一半的可见 token**——在官方蓝底上刷了一层绿漆，接缝处就是那些蓝。

### 取证 1：皮肤层只接管了 19/44

官方浅色块共声明 **90** 个自定义属性（`dsh-client-ui-theme/lib/client.js` 里 `body{…}` 那块，
按选择器锚点 + 括号配平读出），但**其中只有 79 个是 `--dsw-alias-*`**，另外 11 个是
`--dsw-specific-*`（login / bubble / sidebar-nav / menu / tip）。官方前端真实消费 **44 个 alias**
（对 `dsh-web-frontend/dist/assets/*.css` 统计 `var(--dsw-alias-*)` 引用；把 `--dsw-specific-menu`
也算上是 45）。`dsh-theme-local` 的 `buildThemeTokenOverrides` 共定义 66 个 token（31 个 alias），
**在这 44 个被消费的 alias 里只接管 19 个**。

> **口径纠正**：初稿写「90 个 alias / 消费 45 个 / 未接管 26 个」。90 是**全部声明数**（含 11 个
> `--dsw-specific-*`），45 里含一个 `--dsw-specific-menu`——它不是 alias。落仓脚本把两者分开报。

未接管且浅色下是蓝的、被官方前端真实消费的：

| 引用数 | token | 官方浅色值 | 实际影响面 |
| --- | --- | --- | --- |
| 6× | `--dsw-alias-link` | `#4176e6` | markdown 链接、fileMention、sourceLink、fetchUrl |
| 3× | `--dsw-alias-brand-primary-new-colorprimary-new-color` | `#4176e6` | dock 指示器、拖放高亮 |
| 1× | `--dsw-alias-button-ghost-active-fill` | `#ebeef2` | ghost 按钮激活态 |
| 1× | `--dsw-alias-markdown-tag` | `#f1f3f5` | markdown 标签 |

`--dsw-alias-link` 是其中最刺眼的一条：**正文里每一个链接都是 DeepSeek 蓝，而
`--dsw-alias-brand-primary` 是品牌绿 `#347A2F`**——同一屏里两种「品牌色」。
附带的可访问性事实：`#4176e6` on `#fff` 对比度 **4.24:1**，低于 WCAG AA 正文要求的 4.5:1；
品牌绿 `#347A2F` 为 **4.93:1**，达标。

上游自己也有一次未收口的 token 改名（`brand-primary-new-colorprimary-new-color` 这个畸形名字），
说明「官方新增/改名 token 而下游没跟上」是会复发的一类缺陷，不是一次性失误。

### 取证 2：官方「中性」自己有两套，浅色 alias 默认走蓝味的那套

同一个 bundle 里并存：

- `--dsw-static-neutral-*`：真中性（`100 #f5f5f5`、`150 #ededed`、`200 #e5e5e5`）
- `--dsw-static-neutral-bluish-*`：蓝味中性（`75 #f1f3f5` 210°、`100 #ebeef2` 214°、
  `150 #e9ecf2` 220°、`200 #e1e5ee` 222°、`1000 #0f1115` 220°）

而浅色 alias 默认**全部指向 bluish**（`--dsw-alias-bg-base`/`-layer-1/2/3` = `bluish-00`，
`--dsw-alias-label-primary` = `bluish-1000`，`--dsw-alias-label-tertiary` = `#81858c`）。
加上皮肤层的绿味（`#F6F7F4` H=80、`#F1F4EF` H=96），浅色下 `L≥0.88` 的近白色值实测
**29 个不同值**，其中蓝味 9 个、绿味 9 个、真中性 3 个。**另有 3 个是纯白**——
`#fff` / `#ffffff` / `#ffffff2e` 三种写法并存；这是命名不一致，不是色值不一致，单独计数。

### 取证 3：四个 surface 各有一套配色方言

全仓（`packages/` + `shared/`，排除产物与调色板源文件）实测：`var(--dsw|ds|dsh-*)` 引用 **1377** 处、
硬编码 hex **335** 处（口径：hex 出现数 − token 定义数；审计当时 315），token 化率 **80.4%**。
同一语义 token 带着互不相同的字面兜底：

| token | 不同兜底值数 | 实测值 |
| --- | --- | --- |
| `--dsw-alias-border-l1` | **10** | `rgba(0,0,0,.04/.07/.08/.09/.1/.11)`、`#e5e7eb`、`#d7dae0`、`rgb(0 0 0 / 8%)` |
| `--dsw-alias-label-primary` | **8** | `#0f1115`、`#111`、`#1c1e26`、`#3a3f4b`、`#1e221f`、`#2f3542`、`#111827` |
| `--dsw-alias-label-secondary` | **8** | `#61666b`、`#666`、`#8a8f9c`、`#6b7280`、`#5d645e`、`#555`、`#5f6672` |
| `--dsw-alias-label-caption` | **6** | `#adb2b8`、`#999`、`#aaa`、`#888`、`#9a9aa0`、`#bbb` |
| `--dsw-alias-state-business-primary` | 4 | `#347a2f`、`#58b848`、`#3d8a33`、`#3e9b33` |
| `--dsw-alias-state-success-primary` | 5 | `#22c55e`、`#0f7a50`、`#30d158`、`#10b981`、`#0f9d6e` |

共 **18 个 token** 带多重兜底。四个重灾文件：`skill-panel.module.css`（111 硬编码 / 36 蓝）、
`newapp.module.css`（68 / 17）、`role-matrix.module.css`（64 / 2）、
`team-hub/admin-ui/styles.css`（55 / 8，含 Google Material 蓝 `#0b57d0`、`#8ab4f8`）。

色相直方图给出这件事的整体形状：**210–239° 有 90 个不同色值**（审计当时 88，+2 来自同期并发写入的
theme-local 新组件），而品牌绿所在的 90–149° 仅 33 个。

### 取证 4：浅色的层级方向与深色相反

`layer-1/2/3` 由 `color-mix(in oklch, …)` 从 `background` 与 `surface` 派生。
**已用真实 Chrome 逐条求值**（探针 §6；相对亮度按 WCAG 定义，与别处同一函数）：

| token | 浅色（渲染值 / 相对亮度） | 深色（渲染值 / 相对亮度） |
| --- | --- | --- |
| `bg-base` | `#F6F7F4` / 0.9265 | `#171A17` / 0.0098 |
| `bg-layer-1` | `#FFFFFF` / 1.0000 | `#202420` / 0.0167 |
| `bg-layer-2` | `rgb(253,252,252)` / 0.9753 | `rgb(50,44,45)` / 0.0267 |
| `bg-layer-3` | `rgb(254,254,254)` / 0.9911 | `rgb(57,51,53)` / 0.0349 |

浅色**非单调**——`layer-1` 最亮，`layer-2/3` 反而更暗且 `layer-3` 比 `layer-2` 更亮；
深色 `base < layer-1 < layer-2 < layer-3` 严格单调递增。同一套层级语法在浅色态被反转。

### 取证 5：深色有专用整改层，浅色没有

`skill-panel.module.css` 里 **18** 条 `body[data-ds-dark-theme]:not([data-dsh-skin])` 覆盖
（非 node_modules 的 CSS 里 `data-ds-dark-theme` 共提及 24 处），注释写明「无 skin 时套深色兜底」。
**浅色对应形态 0 条**。深色自身也未完全收口：仍有 14 个蓝味字面量，
主要来自 `team-hub/admin-ui/styles.css`（`#181a1b`/`#202124`/`#3c4043` Google 灰）
与 `studio.css`（`#18181b`/`#27272a`/`#303034`）。

### 取证 6：`color-mix(in oklch, #FFFFFF n%, base)` 丢掉基色方向（落仓探针带回的新发现）

皮肤里所有「向白提亮」的派生式都写成 `mix("#FFFFFF", n, base)`。真实引擎实测：

| 表达式 | 渲染结果 | 与基色方向 |
| --- | --- | --- |
| 基色 `#202420` | `rgb(32, 36, 32)` | 冷（R<G） |
| `color-mix(in oklch, #FFFFFF 6%, #202420)` | `rgb(50, 44, 45)` | **暖（R>G）← 翻转** |
| `color-mix(in srgb, #FFFFFF 6%, #202420)` | `rgb(45, 49, 45)` | 冷（R<G）= 基色 |

机制：白在 OKLCH 里色相是 `none`，Chrome 把 `none` 带进结果（计算值序列化为
`oklch(0.299442 0.00884613 none)`），上色时把缺失色相当 0，于是派生层的冷暖方向与基色无关。
浅深两态的 layer-2/3 全部中招，与 `in srgb` 对照的**通道差 1–7 级**：浅色侧 1 级（在量化噪声量级），
深色侧 5–7 级（勉强可辨）。**幅度很小，它不是本轮「多种蓝色」的主因**，是一个独立的小缺陷。

这条也顺便说明「判据要选对」：初版判据是「色相角之差 ≤ 30°」，实测直接判红 4/4——但这些中性色
8 位通道差只有 3–4 级，色相角在低彩度下由舍入决定，Δ80° 是量化噪声。**低彩度下色相角不是一个
可测的量**，改成「R−G 的符号是否与基色一致」才稳定。探针 §7 用的是后者。

### 取证 7：上一条结论换到**产品那个** Chromium 上仍然成立（跨引擎复核）

取证 6 的「真实引擎」是 Google Chrome（探针跑 `channel: 'chrome'`），而产品跑在 Electron 自带的
Chromium 上——「在真实引擎里求过值」与「在**产品那个**引擎里求过值」是两个问题。实测两者不是同一个东西：

| | 引擎 |
| --- | --- |
| 探针（§6 / §7） | Chrome `153.0.8010.48` |
| 产品（Electron 43.3.0 的 Electron Framework `CFBundleVersion`） | Chromium `150.0.7871.212` |

差三个大版本。把探针用过的**同一批 20 条表达式串**（不重新推导）交产品同版 Electron 求值，
两边 **逐字节相同**，0 条不一致——含 `oklch(… none)` 的计算值序列化
（`oklch(0.299442 0.00884613 none)` 两引擎一致）。取证 6 的结论可迁移。

脚本 `scripts/acceptance/theme-engine-crosscheck.mjs` 已落仓：它把「vendor 的 Electron 与应用包的
Electron Framework 同版」写成**前置断言**，版本分叉时 exit 2，而不是静默给出一个可迁移的假象；
负向对照也做过——篡改报告里任一色值 → exit 2 并点名该条（实测报「探针 rgb(1, 2, 3) ≠
Electron rgb(253, 252, 252)，最大通道差 252」）。

**这次对照自己也差点造出一个假读数**，值得记下来：`hueIntegrity` 行里**不存表达式串**（只存渲染
结果），第一版提取器照着它取到 `undefined`，写进 `fillStyle` 后**静默保留上一帧**，取回 `[0,0,0]`——
8 条「引擎差异」全是假的，真相是那 8 条根本没求值。所以脚本里「表达式为空即响亮失败」不是防御性
编程，是踩过之后的钉子；同理探针现在也在报告里记下**是哪个引擎**产出的（`layerEngine.engine`）。

**第二个假读数由门禁拦下，不是由我拦下**：脚本初版的默认路径用 `process.execPath` 起探针子进程，
被 `node-interpreter` 门禁判红——pnpm 生命周期下那是宿主 Electron，子进程会「退出码 0 且没有任何输出」
（ADR-0040）。那形状与「探针正常跑完」完全同形，手跑（`node scripts/...`）根本看不出来。改成
`nodeCommand()` 之后又补了两道：跑之前用 `assertNodeUsable()` 自证解释器能说话，跑之后拒绝
「退出码 0 但 stdout 为空」。这一条记在这里的理由是：**它证明门禁在做探针自己做不到的事**。

### 参照系（一手取证）

从 `/Applications/ChatGPT.app`（bundle id `com.openai.codex`）的
`webview/assets/app-30b4fba457b3.css` 提取：**中性色阶 24 级全部零色相**
（`gray-0 #fff` → `gray-25 #fcfcfc` → `gray-50 #f9f9f9` → `gray-75 #f3f3f3` → `gray-100 #ededed`
→ … → `gray-1000 #0d0d0d`），7 个彩色（red/orange/yellow/green/blue/purple/pink）**仅作语义槽位**。
其中 `gray-100 #ededed` 与 DSH 官方 `--dsw-static-neutral-150 #ededed` **同值**。

这条对照给出本次最重要的判断：**专业感不来自「用了什么颜色」，而来自中性色阶彻底去彩度 +
彩色严格限于语义**。官方 DSH 有真中性尺却不用它，本仓库的皮肤又只换了 19/44——两层叠加才产生
「很多种蓝色」。边界：该 CSS 来自 OpenAI 桌面包的 webview（内含 `--color-codex-syntax-*` 等 Codex
专属变量），可作同族参照，**不能断言它就是 Codex Desktop 的完整主题**；本机未安装独立的 Codex Desktop。

## Decision

关联 ADR：ADR-0115。决策已定，**实现尚未开始**（本 Note 记录的是决策与其证据，不是已完成状态）。

1. **浅色取真中性骨架**。`theme-tokens.ts` 已是「6 色 palette + `color-mix` 派生」结构，
   只要 palette 本身零色相，全部派生自动成为真中性。codex 预设的浅色六值改为：
   `lightBackground #F6F7F4 → #F7F7F7`、`lightForeground #1E221F → #0D0D0D`、
   `lightInlineCode #EEF1EC → #F3F3F3`、`lightSidebar #F1F4EF → #F9F9F9`、
   `lightSurface` 保持 `#FFFFFF`、`lightAccent` 保持品牌绿 `#347A2F`。
   品牌绿只出现在强调、选中、主操作与链接处。
   **深色在同一批（B1）同步去彩度**：`darkBackground #171A17 → #131313`、
   `darkSurface #202420 → #1C1C1C`、`darkSidebar #191C1A → #161616`、
   `darkInlineCode #292D29 → #212121`、`darkForeground #F1F4F0 → #EDEDED`、
   `darkAccent` 保持 `#58B848`。取值即 Codex 灰阶 dark 侧，去彩度后
   `base #131313 < sidebar #161616 < surface #1C1C1C < layer-2 ≈ #272727 < layer-3 ≈ #303030`
   仍单调递增，派生式不需要改。用户已于本轮确认「深浅是同一套灰阶的两种曝光」，
   不接受只改浅色。

2. **官方前端消费的 45 个 alias 全量接管**，新增 26 个，按语义归族：品牌/链接 3、状态色 8、
   markdown 面 5、按钮控件 6、文字/遮罩 4。`button-primary-fill`（→ `brand-primary`）与
   `specific-menu`（→ `bg-layer-3`）由既有别名自动跟随，不单独接管。
   官方前端**不消费**的 45 个 alias 不接管：不为看不见的东西定语义。

3. **字面兜底上收，两态一起做**。surface 的 CSS 只写 `var(--token)` 不带 fallback；
   「皮肤未加载时的保底值」由构建时从 `presets.ts` 的 codex 预设生成一份静态默认样式表，
   单一事实源仍在 `presets.ts`。重灾文件处理顺序：
   `skill-panel` → `newapp` → `role-matrix` → `team-hub/admin-ui`。
   `skill-panel` 现有的深色专用覆盖层改造为两态对称的语义层。
   **深色必须同时收口**：深色下实测仍有 14 个蓝味字面量（`team-hub/admin-ui/styles.css` 的
   `#181a1b`/`#202124`/`#3c4043`、`studio.css` 的 `#18181b`/`#27272a`/`#303034`），
   只收浅色等于重演本次故障的同一不对称（取证 5）。用户已于本轮确认此项。

4. **浅色层级方向修正**：`layer-1/2/3` 改为从 `surface` 向 `base` 派生，保证
   `base < layer-1 < layer-2 < layer-3` 单调递增（`layer-3 = surface = #FFFFFF`），与深色同向。

5. **新增门禁 `theme-alias-coverage`**：从产物 CSS 提取「被 `var()` 消费的 light alias 集合」，
   该集合必须 ⊆ theme-local 接管集合。数据源在运行时从产物提取，**不硬编码清单**（ADR-0009）。
   与既有 `theme-tokens` 分工：后者管「引用 vs 定义」，新增项管「官方消费 vs 本仓接管」。
   存量 26 个登记进 `scripts/gates/exemptions.json`，只减不增（ADR-0014）。

## Alternatives considered

- **保留绿味中性画布（`#F6F7F4`），只清掉蓝味**：否决。绿味中性在浅色下极难维持一致——
  只要有一个色值没跟上就显脏；而取证 3 已经证明「没跟上」是常态而非例外。真中性骨架让
  「未跟上」的代价从「偏色」降到「无色相」，是更鲁棒的选择。
- **接管全部 79 个 alias**：否决。另外 35 个官方前端不消费，其中
  `--dsw-alias-label-primary-bluish`、`--dsw-alias-brand-text` 一类的语义本身与品牌冲突，
  为它们定映射是无意义的劳动，且会让接管面失去「被消费」这一客观判据。
- **只接管蓝色/冲突的 25 个**：否决。滚动条（`#e5e5e5`/`#d4d4d4` 真中性）、
  `markdown-code-block`（`#f9fafb` 蓝味）等非蓝但同样不统一的 token 会留下，下次还要再开一轮。
- **全量替换为 token 并删除所有字面兜底**：否决。会让「skin 未加载」退化成官方蓝味，
  而不是优雅降级。上收比删除更符合「皮肤是可选层」的事实。
- **浅色三层各自给明显色阶**：否决（物理上不可行）。`layer-1` 若是纯白，上面的层无法更白。
  浅色的层级只能由 `base ↔ layer-1` 这一级色差承担，layer 之间靠阴影与边框——
  这与官方「浅色全靠边框」的做法一致，区别只在于**方向不再反转**。
- **只改浅色，深色不动**：否决。Codex 的深浅是同一套灰阶的两种曝光（`gray-0` ↔ `gray-1000` 对称）。
  浅色转真中性而深色保持绿味，等于把不一致从「浅色内部」搬到「深浅之间」。深色 palette 同步去彩度
  纳入同一批。

## Consequences

### 正面

- 浅色的「蓝味值」可从结构上归零：palette 零色相 ⇒ 全部 `color-mix` 派生零色相。
- `--dsw-alias-link` 指向品牌绿后，正文链接与品牌统一，且对比度从 4.24:1 升到 4.93:1，**修掉一个既有 AA 缺陷**。
- 「官方消费 vs 本仓接管」成为门禁判据后，上游再发生一次 `brand-primary-new-colorprimary-new-color`
  那样的改名/新增，会被自动拦住而不是等用户肉眼发现。

### 负面 / 未决

- **B0 已完成**：本 Note、ADR-0115、落仓的审计探针（`scripts/acceptance/theme-palette-audit.mjs`）
  与 ADR 索引登记。**B1–B4 的实现、实况截图与门禁变异测试均未执行。**
- **无实况浅色截图**。全部证据来自源码扫描 + 产物解析 + 真实引擎求值，`browser bridge` 未连接、
  `127.0.0.1:43120` 需配对凭证。B1 之前必须补一次实况浅色取证，否则改的是「我以为的浅色」。
  **不能用产物级渲染冒充它**：探针 §6/§7 确实在真实 Chromium 里求出了每个派生色的 sRGB 值，
  但那是**调色板**的实况，不是**界面**的实况——两者不能互相顶替。
  取证路径已收窄为一条（2026-09-18，用户确认走 bridge）：`dsh web` 打印的带 token URL **撤回**，
  那等于把凭据贴进会话（AGENTS.md / ADR-0008 红线）。bridge 之所以优于截图，是因为它能给出
  「哪个 token 渲染成什么」——B1 要的正是这个，而截图只能量像素。两次探测均为
  `no browser extension is connected to the bridge`，**B1 因此未开工**。
- ~~取证 4 未用真实 CSS 引擎复核~~ **已清**：`color-mix(in oklch, …)` 的输出已由探针 §6/§7
  在真实 Chrome 里逐条求值（见取证 4 表与取证 6）。仍存的探针边界是
  `scripts/acceptance/theme-tokens-live.mjs` 不模拟 theme-local 的运行时注入
  （它报告浅色解析为官方值，属探针射程之外，不是产品事实）。
- **markdown 链接从蓝变绿是本轮最大的视觉变化**，影响每一段正文，需在 B1 截图后由用户确认接受。
- **深色同步去彩度会扩大改动面**：深色上一轮刚验收通过，本次改动需要重跑其截图与对比度证据。
- ~~本次审计脚本在 `/tmp`，未落仓~~ **已落仓**：`scripts/acceptance/theme-palette-audit.mjs`。
  它带 16 条仪器自检（切分/正控/负控/颜色数学/扫描）与 `--break <split|blue|scan>` 突变验证
  （三处打断都必须 exit 2，实测通过），五组取证 + 真实引擎求值全部可复跑。本 Note 与 ADR-0115
  的**全部数字都由它产出**；初稿里几个对不上的数字（90/45/26/315/88/20+）就是它纠正的。

### 执行顺序约束（B1 为何不在本轮开工）

B1 不能与 `docs/plans/2026-09-17-appearance-revamp.md`（`status: approved`）的 P1 并行，理由是一次
**实测到的写冲突**，不是排期偏好：

- 该计划已把当前 palette 的派生结果**逐字冻结**进 `packages/platform/dsh-theme-local/src/client/theme-tokens.test.ts`
  的 golden 断言，例如 `--dsw-alias-border-l1` 断言 `color-mix(in oklch, #000000 8%, #F6F7F4)`
  （浅色基色）与 `color-mix(in oklch, #FFFFFF 10%, #171A17)`（深色基色）。
- B1 要改的正是这些基色（`lightBackground #F6F7F4 → #F7F7F7`、`darkBackground #171A17 → #131313`、
  `darkSurface #202420 → #1C1C1C`），因此 B1 一落地，上述 golden 会大面积失败。
- 这不是缺陷，是**同一晚两人改同一个包的同一个函数**：对方冻结的意图是对的（钉住「contrast=50 与引入
  contrast 之前逐字一致」），只是锚点选在了本轮要替换的那套 palette 上。

**顺序（用户 2026-09-17 确认）**：对方先落地 contrast 字段与 P1、测试转绿；B1 再改 palette，并
**按新 palette 重新冻结**那批 golden。取「palette 后改」而非「golden 后改」，是因为 palette 是更底层的
字面量：先动它会让对方正在写的对比度缩放基线一起漂移，协调成本更高。

**解除条件**：`theme-tokens.test.ts` / `persistence.test.ts` 对方改动稳定且 `pnpm --filter
dsh-theme-local test` 全绿，且该包的 `src/client/*` 无未落盘的进行中改动。

**同期并发写入的实测事实**（判别冲突用）：本仓 2026-09-17 23:42–23:43 仍有 `src/client/` 下的
`AccentSwatches.tsx`、`ContrastSlider.tsx`、`ColorChip.tsx`、`accent-swatches.ts`、`share-string.ts`
被写入。B1 开工前必须重测这一条，不能凭本记录假定对方已停。

**2026-09-18 00:05 重测（B1 仍未解除）**：`src/client/ThemeStudio.tsx` 23:59:25、`studio.css`
23:59:47 刚被写入，其 `lib/client.js`、`lib/index.js` 随之重编译；`docs/plans/2026-09-17-appearance-revamp.md`
与 `docs/notes/implemented/surface/2026-09-17-appearance-contrast-and-share.md` 同期也在改。
即对方已从 P1 的结构落地推进到 **P2 视觉精修**，而 P2 正是持续写 `studio.css` / `ThemeStudio.tsx` 的阶段——
**解除条件里的「`src/client/*` 无进行中改动」在当前时刻明确不成立**，B1 不开工。
另注：对方这套写入**没有**移动本探针的任何一个读数（同日 00:05 跑测，16 项漂移全 Δ=0），
所以它挡住的不是测量，是**对 `theme-tokens.ts` 的写入**。

**B3 的阻塞是另一条，且已验证**：`theme-alias-coverage` 的判据是「产物消费集合 ⊆ 本仓接管集合」，
接管集合正是 B1 的产物——门禁写在 B1 之前只能把当前「未接管 25 个」当作 exemption 冻进
`scripts/gates/exemptions.json`，而该文件按 ADR-0014 **只减不增**，等于把缺陷状态登记成基线。
配套的 pitfalls 条目（根因「皮肤只覆盖了一半的可见 token」）同受牵连：`pitfalls-playbook` 门禁要求
「已落地机制」段点名的每个 `gate:<名字>` **真实存在于门禁注册表**，在门禁落仓前写条目会让它直接判红。
两条都留到 B1 之后一次性做。

### 复现路径

**一条命令**：

```
node scripts/acceptance/theme-palette-audit.mjs --out /tmp/theme-audit/landed
```

退出码 0 = 五组取证均已测量且 16 条仪器自检全过；2 = 前置条件缺失或仪器自检不成立。
`--no-browser` 跳过 §6/§7（真实引擎求值）；`--break <split|blue|scan>` 故意打断某件仪器，
用于验证对照不是恒真桩（必须 exit 2）。

**跨引擎对照（取证 7）**：

```
node scripts/acceptance/theme-engine-crosscheck.mjs                        # 先跑探针再对照
node scripts/acceptance/theme-engine-crosscheck.mjs --report <报告.json>    # 复用既有报告
```

退出码 0 = 两个 Chromium 对本批表达式逐字节一致；2 = 前置条件缺失（含 vendor 与应用包的
Electron 不同版）、表达式取不到，或存在真实差异。实测正跑 exit 0（20 条全一致），
篡改报告里一个色值后 exit 2 并点名该条。

各组口径写在探针源码的 `scope` 常量与报告 JSON 里，摘要：

- **官方浅色块**：按选择器锚点（`body{` 且紧跟 `--dsw-alias-*`）+ **括号配平**读块。
  不能用「第一个 `data-ds-dark-theme` 位置」切——实测该串在包里出现 4 次，首处只是静态尺度块，
  切在那里会得到 80 个而不是 90 个定义，且不报错。
- **官方消费量**：对 `.../dsh-web-frontend/dist/assets/*.css` 统计 `var(--dsw-alias-*)` 引用。
- **全仓扫描**：口径 A（`packages/` + `shared/` + `dsh-patches/`，css/ts/tsx/js/mjs）用于色相直方图；
  口径 B（`packages/` + `shared/`，css/ts/tsx，额外排除 `presets.ts` 与测试）用于近白值与兜底，
  与初稿的 `hardcoded.mjs` / `neutrals.mjs` 对齐。
- **真实引擎**：Chrome（`channel=chrome`），`color-mix` 的求值走 canvas `fillStyle` +
  `getImageData` 取 sRGB 字节——`getComputedStyle` 只返回 `oklch(L C H)`，不是 sRGB。
- 另一件独立的仪器：`node scripts/acceptance/theme-tokens-live.mjs`（仪器自检 5/5，78 个引用
  token 零分歧；退出码 0）。
