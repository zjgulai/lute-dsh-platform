# 空会话 hero「Preview 角标错位」：官方样式反压插件覆盖（2026-09-12）

> 本文件是本次修复的决策记录（ADR-0015 的 Note 侧；决定本身登记为 ADR-0026）。
> 上游决策：ADR-0019（官方 UI 改写锚必须运行时解析）。

## Problem

用户报障：点开新会话，输入框上方的 `Preview` 角标错位。

与上一轮（ADR-0019，锚点被版本哈希钉死）**不是同一类故障**：本轮锚点解析完全正常
（`data-dsh-root-brand-anchors="resolved"`，实测），规则也写进了 DOM，但**赢不了级联**。

| 事实 | 证据 |
| --- | --- |
| 官方 hero 栅格是三列，首列固定 34px | 2.0.5 `HeroShell.module.css`：`.zNic4G_headline{grid-template-columns:34px auto auto;column-gap:10px}`，`.zNic4G_previewBadge{grid-area:1/3}` |
| 插件把栅格改成单列并隐藏官方标题 | `src/client/brand.tsx` `buildBrandCss()`：`{display:none}` / `{grid-template-columns:auto}` |
| 两者特异性相同 | 均为单类名（0-1-0）→ **同分看先后** |
| 插件标签先建、位置不变 | `src/client/index.tsx` 首次 `sync()` 即 `appendChild`（此刻官方样式标签可能尚未注入，规则为空），之后只改 `textContent` |
| 症状的几何形态 | 离线复现：敌意顺序下 `grid-template-columns` 计算值 `34px 0px 63.58px`，品牌槽 397px 被塞进 34px 轨道 → 与角标重叠 165px（角标 x=712 落在品牌句 480–877 内） |

复现方式（可重跑）：取官方 HeroShell CSS 文本 + 按官方 JSX 复刻的三子元素 hero，
在 Chromium 中先注入插件规则、后注入官方规则，读 `getBoundingClientRect` 与
`grid-template-columns` 计算值。友好顺序下同一夹具正常（角标间距 17px、整组中心与
输入框中心一致 = 720）。

## Decision

覆盖官方样式时**与注入顺序解耦**，两道保险同开（详见 ADR-0026）：

1. `buildBrandCss()` 的覆盖声明带 `!important`（hero：`display`、
   `grid-template-columns`；统计条：`max-height`、`opacity`）。
2. `watchAnchors()` 写入后把锚点样式标签移到 `head` 末尾。

配套回归测试：`test/live-anchors.spec.ts` 新增「插件先装载、官方样式后到」用例，
断言（a）锚点标签为 `head` 中最后一个 `<style>`、（b）规则文本含 `!important`、
（c）官方标题仍被隐藏。修复前该用例必红。

部署：`pnpm run build`（tsdown + validate-build）→ 制品经 `file:` 硬链接直写
`~/.dsh/profiles/desktop/node_modules/dsh-root-brand/lib/client.js`（同一 inode，
`cmp` 一致）→ 客户端 Cmd+R 生效。

## Alternatives considered

- **只加 `!important`**：过本次，但未来忘记加 `!important` 的新规则仍会输。
- **只移标签位置**：官方标签若在最后一次写入之后才出现（本次即此情形）仍会输。
- **提高特异性 `.A.A{}`**：对数字前缀的 `[class~="…"]` 回退形态要重复处理，可读性差。
- **结构选择器做主路径**：ADR-0019 已否决，不重启。

## Consequences

- **正面**：hero 表现不再取决于插件/官方的加载次序；同类静默反压不会复发；失败从
  「无声错位」变成「一条可红的用例」。
- **代价**：覆盖声明带 `!important`；官方若对同一属性也用 `!important` 需重评（当前
  HeroShell 无 `!important`）。
- **验证**：Red（临时摘掉制品里的 `!important` → 新用例失败：
  `expected '.zNic4G_headlineText { display: none;…' to contain '!important'`）→
  Green（恢复 → `5 files / 13 tests` 全绿）；`pnpm run accept:root-brand` 全 PASS
  （含「Preview 角标位于标题右侧」「角标可见且字标已渲染」）；`pnpm run gate` 13/13；
  **用户实机 Cmd+R 后确认**新会话「Preview 角标已正常」（本轮的唯一实机判据，
  自动化证据只作前置门槛）。
- **后续动作**：官方若重命名这两处模块，仍由 ADR-0019 的 drift 路径接住；本 Note 只
  负责「覆盖怎么写」。离线复现夹具（`/tmp/hero-repro.html`、`hero-order-cur.html`、
  `hero-fix-important.html`）为一次性证据，不入库。
