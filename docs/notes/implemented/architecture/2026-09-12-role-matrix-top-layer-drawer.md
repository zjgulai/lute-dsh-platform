# 岗位矩阵抽屉被外来浮层盖住：模态必须进 top layer（ADR-0027）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0027](../../../adr/ADR-0027.md)。

## Problem

用户报障（ADR-0025 修好 404 之后、重启验证时）：

> 岗位矩阵点开之后，关闭的 ✕ 被一个 icon 🔧 部分重叠，无法点击；另外这个页面的 UI
> 需要美化，要符合品牌专业一致性。

面板能开了（404 已修），但**右上角的关闭按钮点不动**：它被某个外来浮层压住了。

### 关键约束：这次的证据链里没有「我看见」

我**读不了图片**（当前模型不接受图像输入），浏览器桥也没连上扩展
（`no browser extension is connected to the bridge`），macOS 桌面自动化三项权限
（accessibility / screen_recording / post_events）全为 `false`。所以「那个 🔧 到底是
谁」只能靠静态盘点，不能靠看一眼。**全量枚举**（profile 下 20 个本地插件 + 官方
`@deepseek-ai/dsh-client-*`，逐个 grep 字面 emoji 与 `\uXXXX` 转义）：

| 候选 | 结论 |
| --- | --- |
| 官方 UI 里的 🔧 | 226 个包全量 grep = **0 命中** |
| 本地插件里的 🔧 | **只有 `dsh-file-upload`**（它的「技能」页签 `IcoSkill`），且该弹窗是 `position:absolute` 挂在输入框回形针上方（左下） |
| 其余 19 个插件 | 无 🔧（`dsh-context` 的 🛠 是文件树里 `scripts/tools/bin` 的类型字形） |

也就是说：**按字面 emoji 找，找不到一个能落在「面板右上角」的候选**。用户很可能是
**用 🔧 描述「一个扳手样的图标」**，而不是引用一个真实存在的 emoji。到这一步必须停下
——再往下的任何判断都不再有证据支撑。

### 站得住的证据：z-index 60 本身就是错的

不管盖住它的具体是谁，抽屉的层级就是错的。把 profile 里所有「可能浮在上面」的值
逐个读出来（真实源码，不是估计）：

| 来源 | 选择器 / 位置 | z-index |
| --- | --- | --- |
| 官方客户端 UI | 各类菜单/弹层（`dsh-client-ui-*`） | 10 / 20 / 30 / 100 / 1000 / 1100 |
| `dsh-context` | `.lc-modal-backdrop`（fixed inset:0） | 200 |
| `dsh-file-upload` | 附件弹窗（输入框上方） | 200 |
| `dsh-context` | `.lc-att-lightbox` | 1000 |
| `@xmanrui/dsh-im` | 三个对话框 backdrop | 1000 |
| `dsh-univer-office` | `.uvf_root` / `.uvf_win_max` / `.uvf_panel_fullscreen` | 1200 / 1300 / 1400 |
| **`dsh-wanzh-hulian`** | **`.whRightPanel`（fixed top:32px right:0 width≤360px）** | **2500** |
| `dsh-better-sidebar` | `[data-dsh-panel-host]`（含内部 z-index:45 的右上 toggle 簇） | 25 |
| `@linxin666/…-skill-explorer` | `.cBrkua_overlay` | 9999 |
| `@etony668/dsh-task-board` | `.dsh-tb-overlay` | 20000 |
| `dsh-team-hub` | 右下常驻状态胶囊 | 99999 |
| `dsh-my-quotes` | `.dsh-mq-panel`（top:64px right:12px，宽 440px） | 2147483000 |
| `dsh-pocket` | 移动端提示遮罩 | 2147483647 |

而本插件抽屉是 `z-index: 60`：

- 比官方自己的菜单（100）低——官方下拉一开就压住整个抽屉；
- 比**十个**已装浮层低；
- 唯一**部分**压住右上角 ✕ 的几何候选是 `dsh-wanzh-hulian` 的
  `.whRightPanel`（`top:32px; right:0; width:360px`）：它的**上边缘正好横切**关闭
  按钮所在的那条带（✕ 约在 y≈14–42），而 `top:64px` 的 my-quotes 面板则完全够不到。
  —— 这是几何上唯一能产生「**部分**重叠」的常驻浮层，与用户的描述吻合，但它里面
  没有扳手图标，所以**仍未确认**。

结论不需要确认「是谁」也能成立：**在一个没有任何层级约定的插件生态里，模态抽屉
挑任何一个 z-index 都是下注**。这次下注输掉了。

## Decision

**模态抽屉不再参与 z-index 竞争，改为进入浏览器的 top layer。**

用 `<dialog>` + `showModal()`：

- top layer 是规范保证的「永远在最上」层，文档里任何 z-index 的浮层都盖不到它；
  这不是「更大的一注」，而是把这场竞争整体取消。
- `::backdrop` 承接遮罩（原来挂在 `.root` 的 `background` 上）。
- `.root:not([open]) { display: none }` 补回被 `display:flex` 重置掉的 UA 规则
  ——否则关闭后的 dialog 会继续留在屏幕上（**这条漏了就是白屏级故障**）。
- `showModal()` 失败时**响亮降级**（写 `open` 属性 + `console.error`），不静默：
  一个 `<dialog>` 没有 `open` 就是 `display:none`，静默失败会得到一个看不见的面板。

同时补两条**冗余关闭路径**——它们的存在意义是：即使将来又有谁盖住了 ✕，用户仍然
关得掉：

| 路径 | 实现 |
| --- | --- |
| 点遮罩区关闭 | dialog 盒本身铺满视口，`event.target === event.currentTarget` 即「点在面板外」 |
| Esc 关闭 | `<dialog>` 原生 `cancel` → `onClose`；另留一条 document keydown 兜底（降级到非模态时原生不生效） |

关闭按钮本身也从「文本 ✕ + 内边距撑出来的热区」改成**独立的 34×34 盒 + 自绘路径**：
文本字形会随 shell 解析到的字体漂移，绘制路径不会；`flex: none` 保证长标题不会把它挤扁。

### 同批交付的美化（用户第二条要求）

按品牌令牌重做，事实来源是 `dsh-root-brand`：品牌绿 `#58B848`（
`var(--dsw-alias-state-business-primary, #58b848)`）、胶囊玻璃质感、
`.2px` 字距、品牌绿 focus ring。颜色**一律走 harness 语义令牌**
（`--dsw-alias-bg-layer-1` / `-label-primary` / `-label-secondary` / `-border-l1` /
`-state-error-primary`），唯一固定字面量是品牌绿本身——与 `dsh-root-brand` 对它的
处理一致（品牌色不是主题色）。

## Alternatives considered

- **把 z-index 调高（比如 2147483001）**：能过本次，但仍是下注，而且要在别人的
  下一次改动后重新下注（`dsh-pocket` 已经在 2147483647 了）。生态里没有层级约定，
  这个数字永远不够大。
- **把 z-index 调高到「恰好赢过 wanzh-hulian 的 2500」（如 2600）**：若盖住它的
  真是 2500 那个面板，这能修；但 skill-explorer(9999) / task-board(20000) /
  team-hub(99999) / my-quotes(2147483000) 依然骑在头上，问题只是被推迟。
- **不做模态，改成非模态右侧停靠**：用户仍会被浮层盖住，且失去「一次只专注一件事」
  的语义；另需与 `dsh-better-sidebar` 的右侧面板抢地盘。
- **要求其它插件改 z-index**：不可执行——其中多数不归本仓库管（npm 安装的第三方）。

## Consequences

- **正面**：关闭按钮**在结构上**不可能被盖住，与装了什么插件无关；关闭路径从 1 条
  变 3 条；面板视觉并入 LUTE 品牌语言（品牌绿条 / 身份方牌 / 品牌胶囊计数 /
  focus ring），并顺带修好：技能名等列表值改为 chip（可扫读）、错误态带「重试」
  按钮（原来只能关掉重开）、搜索框自带清空、`prefers-reduced-motion` 生效、
  侧栏入口图标盒统一为 24px/18px（与 shell 导航行同比例）。
- **代价**：抽屉打开时会盖住**所有**插件的浮层，包括用户自己开的
  「我的语录」面板等。这是模态的正确语义，但「两个面板并排看」不再可能。
- **未验证（诚实记账）**：本次**没有**真机浏览器截图验证——读不了图像、桥未连接、
  桌面权限未开。已跑的验证是：48 个单测（含 9 个新面板交互用例 + 8 条布局守卫）、
  `tsc --noEmit`、构建产物里 `::backdrop` / `:not([open])` / `showModal()` 均在位、
  变异测试（见下）、`pnpm run gate:full`。**「那个 🔧 是谁」仍未确认**：若重启后
  仍被遮挡，请把鼠标悬停在它上面读到的 tooltip 文字告诉我——那是唯一能一次定位的
  读数。
- **后续动作**：插件生态需要一个层级约定（谁该在谁上面）。本 ADR 只解决「模态怎么
  保证在最上」，不解决「非模态浮层之间怎么排队」。
