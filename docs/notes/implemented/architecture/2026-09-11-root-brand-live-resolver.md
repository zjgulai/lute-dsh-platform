# ROOT 品牌插件三处锚点失效与运行时解析迁移（2026-09-11）

> 本文件是本次修复的决策记录（ADR-0015 的 Note 侧；决定本身登记为 ADR-0019）。
> 规格：`.scratch/dsh-root-brand-drift/spec.md`（status: ready-for-agent）。

## Problem

点击「新会话」后，空会话 hero 里 `Artificial Business Intelligence Agentic` **出现两次**，右上角角标显示「预览版」而非 `Preview`。现场取证（全部实测，非推断）：

| 事实 | 证据 |
| --- | --- |
| 插件用两条**版本钉死的 CSS 规则**隐藏官方标题/角标 | `src/client/brand.tsx:168-169`（改前）：`._37cUPa_headlineText, ._37cUPa_previewBadge { display: none; }` |
| 官方 2.0.4 的哈希前缀确为 `_37cUPa_` | `dsh-patches/archive/chatui-orig-bundles/dsh-client-ui-conversation-client.js.orig` 内 `_37cUPa_headlineText{grid-area:1/2` |
| 现场 2.0.5 已改为 `zNic4G_` | `/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/.../dsh-client-ui-conversation/lib/client.js` 内 `zNic4G_headlineText` / `zNic4G_previewBadge` / `zNic4G_headline` |
| 官方那句为何同文案 | `dsh-patches/brand-replay.sh:141-142`（改前）把官方 `hero.headline`（原文「探索未至之境」）改写成同一句 |
| 第三处同源失效 | `dsh-client-ui-chat` 的 StatsLine 根类名 `q2FAPq_root` → `bxNl9a_root`，统计条折叠静默失效 |
| 为何测试全绿 | `src/client/brand-css.test.ts`（改前）断言「常量里含有 `_37cUPa_`」——把版本钉复制进断言等于自证；`scripts/validate-build.mjs` 只查关键字与体积 |

关键判断：这不是插件坏了，而是**把「隐藏官方文案」这件事建在每次上游重建必变的 CSS-module 哈希上**。`docs/research/09-audit-architecture.md` 第 66/87 行早已把该盲区登记为「选择器 miss 即自然降级，不会崩溃但静默退化本身不可观测」，本次是同类第 3 次复发。

## Decision

按 ADR-0019：**改写锚改为运行时解析 + 失败自报 + 品牌文案单一真相源。**

1. `src/client/live-selectors.ts`（新）：按 `style[data-plugin-css="<包路径>/<模块>.module.css"]` 定位官方样式标签，用「模块局部名负向断言」算出完整类名（候选前缀必须恰好一个）。
2. `src/client/brand.tsx`：删除两条哈希规则；新增 `buildBrandCss(anchors)` 组装 hash 规则；`installBrandCss()` 只装与版本无关的部分。
3. `src/client/official-text.ts`（新）：角标保持官方节点，只改写文本节点 `预览版 → Preview`；`MutationObserver` 抗 React 回写；disposer 还原原文。
4. `src/client/index.tsx`：`watchAnchors` 首次同步 + 观察 `document.head` 新增节点重试；写 `data-dsh-root-brand-anchors="resolved|degraded:…"` 并 warn/info。
5. `dsh-patches/brand-replay.sh`：退役 hero.headline 补丁段（保留其余品牌重放），原地留退役说明。
6. 测试：新增真实产物 seam（`test/*.spec.ts`）4 支 8 项；重写 `src/client/brand-css.test.ts` 为「来源不得出现哈希选择器」的反向守卫；`vitest.config.ts` 同时纳入 `test/` 与 `src/`（只写前者会让既有 src 测试静默不执行——本轮故障的同款盲区）。

### 取舍：为什么解析模块 CSS 文本，而不是解析类名映射表

官方产物里两者都有（`const css$N = "…"` 与 `var X_module_css_default = { local: "hash_local" }`）。选择前者是因为它**同时提供负向断言所需的局部名上下文**（`_headlineText` 的相邻字符），从而把「前缀唯一性」证成；类名映射表只给结果，无法证唯一性。

## Alternatives considered

- **两代哈希前缀并列补进选择器组**：仅作 P0 止血，作为终态否决（下一版再来一次）。
- **直补官方 JS 的 `hero.preview` 词典值**：否决——用户要求中文界面生效；且会新造第二条真相源（本轮事故的成因）。
- **切英文界面取官方 `Preview`**：否决——需求是中文界面下的呈现。
- **结构选择器 `nth-child` 作主路径**：否决——对结构变更同样脆弱且会无声误命中；保留为解析失败时的降级。
- **等上游提供可注册席位**：方向正确但不可控，不能作为前提。

## Consequences

- **正面**：同一份实现覆盖 2.0.4 与 2.0.5（两代前缀都被算出，测试同时断言两代）；漂移从静默变为可观测；品牌文案回到单一真相源。
- **代价**：插件首次对官方 DOM 做只读运行时探测；产物 13.5KB → 16.7KB（预算 120KB）。
- **构建校验的一处修正**：`scripts/validate-build.mjs` 原先用 `client.includes("@deepseek-ai/dsh-client-ui-conversation")` 判「是否打包了官方包」，但解析器需要以该**包名作为字符串锚**去查样式标签——守卫已改为只拦「依赖引用」（`require(`/`from `/`import(` 形态），仍在拦真正的双实例风险。
- **验证**：同一支真实产物测试先出 Red（`expected '' to be 'none'`，EXIT=1）再转 Green（EXIT=0）；统计条折叠另做一次「临时摘掉规则 → 2 项失败 → 恢复 → 2 项通过」的真实 Red/Green；`pnpm run gate` 13/13（并抓到 `profile-metadata-sync` 的真实漂移，已按 `sync-profile.mjs` 同步）。
- **升级复演**：注入随机新前缀的假 `HeroShell.module.css` 后，同一份实现自动命中且状态为 `resolved`（`test/upgrade-immunity.spec.ts`）。
- **后续动作**：上游若重命名这两个模块文件，解析器会报 drift 并走结构降级，应在该窗口重锚模块 id 并更新 `docs/research/09-audit-architecture.md` 的锚点分级；官方提供可注册席位后本套 DOM 改写整体退役。
