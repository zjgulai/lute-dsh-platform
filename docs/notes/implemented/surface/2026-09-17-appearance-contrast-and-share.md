# 2026-09-17 · 外观页对比度派生、偏好注入与主题分享（P1）

关联：[ADR-0104](../../../adr/ADR-0104.md)（Codex 视觉语法与渐进式页面迁移）、
[ADR-0087](../../../adr/ADR-0087.md)（设置页锚点取 ARIA 语义）、
[ADR-0029](../../../adr/ADR-0029.md)（主题 Token 两侧共同证伪）、
[ADR-0015](../../../adr/ADR-0015.md)（非机械改动必须留痕）。
计划与阶段边界：[docs/plans/2026-09-17-appearance-revamp.md](../../../plans/2026-09-17-appearance-revamp.md)。

## Problem

`dsh-theme-local`（settings.section · dsh-theme）的外观页只有 12 个色值字段 + 4 个字体/字号字段，
呈现层是「预设下拉 + 浅/深 Tab 切换 + 6 行色值」的表单。对照 ChatGPT.app 的外观页，缺三类能力：

1. **对比度维度**：用户无法在不换预设的前提下调整中性灰阶（边框、抬升表面、次级文字的深浅），
   而这是长文阅读最常用的一档调节。
2. **主题搬运**：调好的主题只能留在这台机器的 localStorage 里，无法复制给他人或在另一台机器复现。
3. **呈现偏好**：`prefers-reduced-motion` 与字体抗锯齿没有入口。ADR-0104 第 3 条已要求
   「为 `prefers-reduced-motion` 提供静态降级」，但仓库里没有实现——官方样式表本身不查这个媒体查询。

同时有一个硬约束：`scripts/acceptance/theme-tokens-live.mjs`（ADR-0029 的两侧证伪仪器）会
**真实调用** `buildThemeTokenOverrides(DEFAULT_THEME_STUDIO_SETTINGS)` 并与官方 CSS 逐 token 对照。
任何改变默认输出的重构都会让这台仪器给出「供给函数与官方口径分歧」的读数。

## Decision

1. **对比度做成派生参数，不是第四个存储维度。** `ThemeStudioSettings` 只加
   `lightContrast`/`darkContrast`（0–100 整数，缺省 50），存储 key 不变。派生规则：
   `k(c) = 0.6 + 0.8·(c/100)`，**k(50) = 1 是恒等**；中性混合（border l1–l4、bg-layer-2/3、
   bg-module-platform、bg-overlay、interactive hover/active、sidebar nav hover/active、
   label secondary/tertiary/caption/dimmed）按 k 缩放并取整；**accent 派生色不缩放**
   （bubble、bubble-highlight、state-business-tertiary、button-info-hover、
   sidebar-nav-item-active-accent、static-deepseek-200、interactive-bg-hover-accent），
   因为那几档是品牌语义调过的比值，不是灰阶层次。
2. **恒等性写成契约并由 golden 冻结。** `theme-tokens.test.ts` 用**手抄的字符串字面量**
   冻结默认设置下全部中性 token 的输出（不是 vitest snapshot——snapshot 会跟着实现漂移），
   改函数前先跑一遍确认基线为绿。旧存量数据（无 contrast 键）经 `decodeThemeStudioSettings`
   补 50，派生输出与改造前逐字节相同，ADR-0029 的仪器因此零分歧。
3. **呈现偏好与主题分离。** `reduceMotion: "system"|"on"|"off"` 与 `fontSmoothing: boolean`
   存在独立 key `dsh-theme/prefs/v1`，**不进分享串**——它们描述的是读者这台机器，导入别人的
   主题不该翻转本机偏好。全局生效方式：`on` 或 `system` 命中媒体查询时给 `body` 打
   `data-lute-reduce-motion="reduce"`，由一段**仅在该属性下才匹配**的注入样式短路过渡与动画；
   属性不存在时一条规则都不命中（默认对官方应用零干预）。`system` 由插件自己镜像
   `matchMedia('(prefers-reduced-motion: reduce)')` 并监听变化，不假设平台已经处理。
4. **分享串经字段白名单投影。** `encodeThemeStudioSettings` 用 `THEME_STUDIO_FIELDS`
   逐字段取值再序列化，因此即使调用方传入合并对象，prefs 也漏不进字符串；解码复用
   `decodeThemeStudioSettings`，`{}`/截断粘贴一律报「无法识别」，不静默重置为默认主题。
5. **P1 用原生 picker，不自绘 popover。** ColorChip = 圆点色块（`input[type=color]`，
   点开即系统拾色器）+ 行内 hex 输入；键盘、焦点、读屏契约全部由平台控件承担。
6. **选择控件一律用 radio 语义。** 模式三卡、预设卡网格、品牌色卡组、减弱动效三态都是
   `role="radiogroup"` + sr-only `input[type=radio]`，原 `aria-pressed` 按钮删除；字体平滑用
   `role="switch"`。这既对齐 ADR-0087「锚点取 ARIA 语义」，也让 AX 树里有真实可枚举的单选组。

## Alternatives considered

- **色值仍然各存一套、对比度只作用于渲染层**：被否决——派生层需要知道「哪几档是中性灰」，
  把这份判断放到 CSS 会变成第二份实现（P-07 一类），且 golden 无法冻结。
- **bump 存储 key 到 v2 并写迁移**：被否决——单字段缺省回退 + 现有的 decode↔raw 比对回写
  已经覆盖迁移（与 `lightInlineCode` 上线时同一路径），bump 只会让存量主题多一次无收益重写。
- **对比度也缩放 accent 派生色**：被否决——那几档是「品牌绿在气泡/状态上的既定浓度」，
  缩放会把品牌语义绑到灰阶偏好上；测试里显式断言它们不随 contrast 变化。
- **把 reduce motion 做成全局 `*{transition:none!important}` 常驻样式**：被否决——默认路径
  会改写官方应用的动效语义。属性门控让「没选 = 一个字节都不生效」成为可验证事实。
- **自绘 HSV popover（饱和度方块 + 色相滑杆）进 P1**：被否决（推迟到 P2）——键盘路径、
  焦点返回、ESC 关闭、读屏语义都要自己实现，风险预算应花在数据契约上；原生 picker 能力不打折。
- **分享串用 `JSON.stringify(settings)` 直接全量序列化**：被否决——一旦调用方传入带 prefs 的
  合并对象就会污染分享串；白名单投影让这条失败模式在类型之外也被挡住（有测试）。

## Consequences

- 正面：外观页在不换预设的前提下多了一档可调维度，且**默认观感零变化**；主题可复制/导入；
  ADR-0104 要求的 reduced-motion 降级首次真正落地（默认零干预，选择后才生效）。
- 负面/代价：中性混合比例现在由 `k` 派生，读 `theme-tokens.ts` 需要同时读 `Palette.scale`
  的契约注释；对比度只作用于灰阶，用户若想整体调亮画布仍须改背景色。
- **渲染验收（真实 Chromium + 真实 `apply(ctx)`）**：`.harness` 一次性仪器在真实组件、真实
  `studio.css`、官方主题画布上跑 **32/32 项通过**：结构（两张卡/模式 3 单选/预设 15 卡/强调色卡级单组/
  双区堆叠/滑杆/开关）、交互（选预设 → 落盘色值与预设卡显示一致、改色 → 出现「自定义」卡、
  调对比度 100 → `border-l1` 由 8% 变 11% 且回到 50 复原、accent 派生色不随对比度变化）、
  偏好（`on` 打属性、`off` 移除属性、字体平滑打属性且落盘、门控样式表已注入）、分享
  （复制得 418 字符可解析串、不含 prefs、含 contrast；导入生效；坏串报错且不改主题）、
  几何（无横向溢出、组内同行不误判、交互目标 ≥20px、无页面错误）。仪器与截图存档在
  `.scratch/appearance-revamp/`（`harness/` + `render/`，含 4 张 PNG 供人眼复核）。
- 渲染验收**当场发现并修掉一个设计缺陷**：原设计把强调色行放进浅/深两个子区，而色卡是一次写入
  双变体的——于是同一个语义渲染成两个状态相同的单选组（同 name 16 个 radio）。已改为卡级单组。
  这类缺陷读代码看不出来，只有把真实组件渲染出来数一遍才会暴露。
- 验证（2026-09-17 实测，非预期）：包内 `vitest run` **49 项全绿**（含 golden 恒等、k(100)/k(0)
  边界、contrast round-trip 与旧数据迁移、色卡 WCAG ≥3:1、分享串白名单）；`tsc --noEmit` 干净；
  `tsdown` 构建 + `validate-build.mjs` 通过（bundle 93,968 B）；
  `accept:theme-tokens` 在真实 Chromium 下 **79 个引用 token 零分歧**；
  `node scripts/sync-profile.mjs --apply --loadpoint` 后装载点与仓库产物一致（24 包比对）。
- **Live 验收（2026-09-18 实测，取代先前 `render verified, live unverified` 标记）**：本机
  `DSH Desktop` 实例（pid 35597，window 1580×960 pt，校准 scale 1.214）经 AX 仪器实测：
  - 设置面为 `AXGroup subrole=AXApplicationDialog` 1152×867 AX px、导航 landmark 226×865；
    两个独立锚一致（nav 226/188 = 1.202、close 34/28 = 1.214，残差 2.29 / 0 AX px）。
  - `pnpm run accept:settings-shell` **exit 0（判决，非 typed unavailable）**：分组标题 5/5、
    L1 导轨独立滚动且滚到底末项 40.35 CSS px（= 目标全高的 1.01）、L2 面板 948.7 CSS px（官方对照 800）。
  - 外观页 live 结构与本设计一致：主题卡（模式 3 单选 + 15 预设 + **强调色单组**——渲染验收当场修掉的
    那处重复，在实况里确认只有一个 `AXRadioGroup`）→ 浅色/深色双区（背景色、文字色、
    `AXSlider description="对比度"`）→ 高级折叠 → 偏好（字体与字号、动效与渲染、字体平滑）。
  - 对比度控件**真实可驱动**：`AXIncrement` 50→55→100 时同区读数同步（55/100），深色区保持 50
    （两区独立）；关闭设置页再打开读到 72，证明写入生效；驱动后已回滚至 50/50。
  - 持久化落盘：渲染进程 leveldb（`Partitions/dsh-desktop-renderer/Local Storage/leveldb/003003.log`）
    最新记录为 `"lightContrast":50,"darkContrast":50`，并含 `uiFont` / `codeFont` / `uiFontSize` /
    `codeFontSize`——**这些字段只有本次改版才会写**，构成「跑着的进程读的是新构建」的直接证据。
  - 实拍存档 `.scratch/appearance-revamp/live/`（`01-top-default-50` / `02-bottom-prefs-nav-scrolled` /
    `03-light-contrast-100`）。
- **仍未 live 验证**：减弱动效与字体平滑在真实页面上的观感（目前只有渲染验收的属性与落盘断言）；
  以及 AX 读不到的视觉项（间距、字重、层级、纵向长度）——需人眼看 `.scratch/appearance-revamp/live/*.png`。
- **仪器缺陷（本轮定位，未修，待批）**：`scripts/acceptance/settings-shell-live.mjs` 把「设置入口」
  锚在 `AXTitle == "设置"`。实况里该节点是 `AXPopUpButton`，**`AXTitle=""`、`AXDescription="设置"`**
  （`mac.ax.dump` 的节点自带 `description` 字段）。设置页**没开着**时（最常见状态）
  `ensureOnScreen()` 判 `hasTrigger=false && hasDialog=false`，于是抛 **`window-off-screen`**
  「窗口拉不到前台」——而窗口明明在屏上、树里 882 个节点可读（P-04 类：错误报告路径盖住真实原因，
  且会再次把人骗去重启）。本轮 `accept:settings-shell` 的两次 exit 2 均由它产生；设置页开着时同一探针
  exit 0。修法约 2 行（同时接受 `description`），`scripts/gates/settings-shell-criteria.test.mjs`
  只喂 `judge()` 的写死读数、不覆盖前置匹配，故改动不动门禁绿度，但按 P-08 应补一条负向用例。
- 后续：P2 做自绘 popover 完全体、模式卡 SVG 插画、预设网格视觉精修；P3 评估正文字体位与
  代码语法主题。分享串按模式拆分（子区级复制）不在当前范围。
