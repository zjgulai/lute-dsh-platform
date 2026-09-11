---
title: ROOT 品牌插件的官方 UI 改写锚：从版本钉升级为运行时解析
status: ready-for-agent
test_seam: 加载真实产物 packages/platform/dsh-root-brand-local/lib/client.js（window.__ModuleLoader__ 桩捕获 → happy-dom 中执行 apply）并断言 DOM 与注入样式；官方样式真值取自两代真实产物（归档 .orig / 本机 app 包）
---

# ROOT 品牌插件的官方 UI 改写锚：从版本钉升级为运行时解析 产品规格

> 本规格来自 2026-09-11 与用户的 grill-me 决策树（两轮：3 项 + 3 项决策，全部确认）与
> 诊断阶段的实测取证。决定本身登记为 ADR-0019，决策记录见
> `docs/notes/implemented/architecture/2026-09-11-root-brand-live-resolver.md`。
> 本规格不重新访谈，只综合已确认事实。

## Problem Statement

点击「新会话」后，空会话 hero 里 `Artificial Business Intelligence Agentic` 出现了**两次**，右上角角标显示「预览版」而非 `Preview`。用户要求：同一句话只出现一次、ROOT 字标必须保留、角标改为 `Preview`。

诊断取证（全部为实测，非推断）：

1. 官方空会话 hero（`@deepseek-ai/dsh-client-ui-conversation` 的 `HeroShell`）渲三个子元素：`span.fishHitbox`、`span.headlineText`、`span.previewBadge`；插件通过公开席位 `conversation.hero.brand.mark` 渲染的 `HeroRootBrand`（ROOT 字标 + 品牌句）落进 `fishHitbox`。
2. 插件并不用 JS 隐藏官方那句，而是用**两条版本钉死的 CSS 规则**：
   `._37cUPa_headlineText, ._37cUPa_previewBadge { display: none; }` 与 `._37cUPa_headline { grid-template-columns: auto; }`
   （`src/client/brand.tsx:168-169`）。
3. 官方 conversation 客户端升到 2.0.5 后重新构建，CSS-module 前缀由 `_37cUPa_` 变为 `zNic4G_`（实测：2.0.4 归档 `dsh-patches/archive/chatui-orig-bundles/dsh-client-ui-conversation-client.js.orig` 为 `_37cUPa_*`；本机 app 包为 `zNic4G_headlineText` / `zNic4G_previewBadge` / `zNic4G_headline`）。规则整体 miss，官方那句与官方角标同时可见。
4. 官方那句之所以**文案相同**，是因为 `dsh-patches/brand-replay.sh:141-142` 把官方 locale 的 `hero.headline`（原文「探索未至之境」）改写成了同一句做兜底——兜底成了第二个可见实例。
5. `预览版` 是官方 locale 键 `hero.preview` 的 zh 词典值，既不是公开 slot，也不在可被插件注册的公开命名空间（`ctx.locale.register` 对同命名空间同 locale 直接抛错），无法用官方 API 改写。
6. 同一根因还打掉第三处：`dsh-client-ui-chat` 的 StatsLine 根类名由 `q2FAPq_root` 变为 `bxNl9a_root`，统计条折叠**静默失效**。
7. 为什么全绿却没发现：`src/client/brand-css.test.ts` 断言「常量里含有 `_37cUPa_`」（把版本钉复制进断言，等于自证）；`scripts/validate-build.mjs` 只校验关键字与体积，从不校验选择器在真机是否命中。`docs/research/09-audit-architecture.md` 第 66/87 行已把这个盲区登记为「选择器 miss 即自然降级，不会崩溃但静默退化本身不可观测」。

## Solution

把「官方类名哈希」从**构建期常量**改成**运行时解析**，并让解析失败变成可观测事件：

1. 运行时解析器按官方样式标签的 `data-plugin-css`（包路径级锚，不随构建哈希变）定位模块 CSS 文本，用模块局部名做负向断言，离线算出该类名。上一代前缀 `_37cUPa_` 因此被解析器自然覆盖——**一个解析器同时支持两代基座**。
2. 解析结果写入插件自己的样式块（headline 隐藏 + 栅格折叠 + 统计条折叠）。
3. 角标保持官方节点不替换，**只把文本节点从「预览版」改为 `Preview`**，外观/位置/无障碍语义全部保留；监听 React 回写与语言切换。
4. 三个锚点任一 miss 时自报：`console.warn` + `document.documentElement` 诊断属性 + context 事件。
5. 退役 `brand-replay.sh` 的 hero.headline 补丁段，使品牌文案回归插件单一真相源。

## User Stories

1. 作为使用者，我在点击「新会话」后，hero 里只看到一处 `Artificial Business Intelligence Agentic`，不再出现第二次。
2. 作为使用者，我在 hero 左侧仍能看到 ROOT 字标（R∞T + 三根品牌条），品牌识别不被削弱。
3. 作为使用者，我在右上角看到的是 `Preview` 而不是「预览版」。
4. 作为使用者，`Preview` 角标的外观与官方完全一致（胶囊形状/边框/背景/字号/相对标题的位置），看不出是插件改的。
5. 作为使用者，我把界面语言从中文切到英文再切回来，角标始终显示 `Preview`。
6. 作为使用者，我刷新页面或重开窗口后，上述四项表现依旧成立。
7. 作为使用者的读屏软件，读到的角标文本是 `Preview`（不是被视觉隐藏的原文，也不是额外叠加的副本）。
8. 作为使用者，输入卡下方的 token 统计条恢复为默认折叠、悬停可展开（与 2.0.4 时代一致）。
9. 作为维护者，当上游把 CSS-module 前缀改成任意新哈希时，我不改一行代码就能让插件继续命中（升级免疫）。
10. 作为维护者，当上游把模块文件名或 DOM 结构也改了、解析器彻底失手时，我在 Console 里看到明确的 miss 警告与诊断属性，而不是靠肉眼发现「文案重复了」。
11. 作为维护者，解析器失手的最坏表现是**降级**（hero 仍然只显示一句），而不是崩溃或空白。
12. 作为维护者，我想让「选择器在真实产物上能命中」这件事由测试担保：测试读取 2.0.4 归档与本机 app 包的真实 CSS 文本，而不是断言我自己写下的哈希常量。
13. 作为维护者，我能在门禁里看到这次改动没有破坏包契约（typecheck/test/build/validate-build/check_plugin/gate 全绿，退出码即证据）。
14. 作为维护者，我改完包后 profile 副本与 workspace 仍是同一份内容（同 inode 或 tmp+mv 同步），`profile-files-sync` 通过。
15. 作为维护者，我能从 `README.local.md` 读到「版本钉已退役、锚点改由解析器动态求值」，而不再读到过期的 2.0.4 说明。
16. 作为维护者，卸载插件后官方 hero 恢复原状（官方标题与角标重新可见、角标文字恢复原文、统计条恢复官方形态），不留残余。

## Implementation Decisions

### D1 解析锚：官方样式标签（不是类名、不是 DOM 路径）

- 官方 client 包在自己注入的 `<style>` 上带 `data-plugin-css`，值为 `<包路径>/<模块文件>.module.css`（实测：`@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css`）。这是**包路径级**结构锚，与构建哈希无关。
- 解析目标三个模块：`…/dsh-client-ui-conversation/HeroShell.module.css`、`…/dsh-client-ui-chat/StatsLine.module.css`。
- 取该类名 = 按模块局部名负向断言算出：
  - 模块局部名集合 = CSS 文本里所有 `([A-Za-z0-9_]{6})_([A-Za-z][A-Za-z0-9_-]*)` 的局部名；
  - 已知局部名锚（`HeroShell`: `headlineText`、`previewBadge`、`headline`；`StatsLine`: `root`、`sep`）→ 对任一已知锚，其前缀候选 = 文本中带该局部名的类名，**交集内唯一的前缀**即该类名；
  - 交集不唯一或为空 → 该锚解析失败。
- 选择器按 CSS 标识符规则生成：前缀以数字开头时用 `[class~="…"]` 属性选择器，否则用 `.…`（`_37cUPa_…` 与 `zNic4G_…` 两代都合法，仍按规则统一生成）。

### D2 生效时机与生命周期

- 解析与写样式发生在宿主样式标签就绪之后，因此需要：初始化时立即尝试一次；随后用 `MutationObserver({childList:true, subtree:true})` 观察 `document.head` 的子节点新增（官方按需注入新 `<style>` 时重试）；成功后**不必**断开（上游后续注入仍可能需要重解析），由 `ctx.effect` 的 disposer 统一断开。
- 插件自注入的两类样式标签必须带 `data-plugin-css`（模块包装器与插件自身 CSS 都是），解析器按模块路径精确排除自己的标签，不受影响。
- 客户端包重载（HMR 或刷新）后重新执行 `apply`，解析器幂等：同一 `style#dsh-root-brand-live-css` 存在时原地更新文本，不重复插入。

### D3 角标文本改写

- 不替换官方节点、不改动其类名与内联结构：只把它第一个文本节点的 `data` 由 `预览版` 改为 `Preview`；**不做翻译**（中英界面都显示 `Preview`）。
- React 若把文本写回，`MutationObserver({childList:true, characterData:true, subtree:true})` 在**角标元素自身**上重新应用；仅当文本等于原文时才改写，避免与自身改写形成回路。
- 语言切换：订阅 `ctx.locale.subscribe`，每次触发重新应用一次（覆盖 React 因 locale revision 变化而重渲染的情况）。
- disposer 需还原原文（对齐 User Story 16）。

### D4 统计条折叠（顺手修，视觉设计不变）

- 沿用现有折叠设计（默认 6px 悬停条 + 底部中央 2px 抓手 + hover 展开至 28px），只把选择器从版本钉改为 D1 解析结果。

### D5 可观测性

- 解析失败的锚点：`console.warn("[dsh-root-brand] drift …")`；全部命中时 `console.info` 一行摘要（含三个解析出的类名）。
- `document.documentElement.dataset.dshRootBrandAnchors`：`resolved` = 全部命中且已写样式，`degraded` = 有 miss；并在同一属性里带上缺失的模块名列表，便于现场一眼判定。

### D6 降级

- 解析失手时不得出现「hero 两句」：降级规则只依赖 DOM 结构、不依赖插件注入的 CSS——从 `._37cUPa_headline`/`zNic4G_headline` 失手后的真实结构出发，隐藏 hero 栅格中**除第一个子元素外的其余子元素**（在栅格容器同时满足 `display:grid`、`grid-template-columns` 首列为 34px、且含品牌句文本时生效）。
- 降级命中时同样写入 `degraded` 诊断属性，但**用户可接受的表现已成立**（只显示一句）。

### D7 退役 `brand-replay.sh` 的 hero.headline 补丁

- 删除 `dsh-patches/brand-replay.sh` 中「2b. Hero 空态标题」的 hero.headline 分支（现第 135-160 行附近），并在该处留一行注释指向本规格与插件机制。
- `brand-replay.sh` 的其他品牌重放（显示名 9 文件、启动词标 ROOT+SVG、index.html 标题、Info.plist、Helper 重命名、icon.icns）**全部保留不动**。

### D8 测试接缝与依赖

- 测试 seam 对齐同组 `dsh-ui-polish-local` 的既有范式：`window.__ModuleLoader__` 桩捕获入口 → 在 happy-dom 中执行 `apply(ctx)` → 断言 DOM 与注入样式。
- 新增 `happy-dom` 为 devDependency 并补 `vitest.config.ts`（参照 `dsh-ui-polish-local/vitest.config.ts`）。
- 官方 CSS 真值**不新增 fixture 文件**：2.0.4 真值从已入库的 `dsh-patches/archive/chatui-orig-bundles/dsh-client-ui-conversation-client.js.orig` 与 `…-chat-client.js.orig` 解析；2.0.5 真值从本机 app 包解析，缺失时该用例 skip 并打印原因（不伪装通过）。

## Testing Decisions

**唯一 seam**：真实产物 `packages/platform/dsh-root-brand-local/lib/client.js`（经 `window.__ModuleLoader__` 桩加载后在 happy-dom 中运行 `apply`）。不新增第二个 seam，不引入浏览器 e2e。

**外部行为与独立期望值**：

| # | 被测外部行为 | 独立期望值来源（Red 时读它，不读自己的常量） |
| --- | --- | --- |
| T1 | 解析器对 2.0.4 官方 CSS 文本算出前缀 | 归档 `dsh-client-ui-conversation-client.js.orig` 内 `_37cUPa_headlineText` 的实际字面量 |
| T2 | 解析器对 2.0.5 官方 CSS 文本算出前缀 | 本机 app 包 `…/dsh-client-ui-conversation/lib/client.js` 内 `zNic4G_headlineText` 的实际字面量 |
| T3 | 解析器对 StatsLine 两代算出根类名 | 归档内 `q2FAPq_root` / app 包内 `bxNl9a_root` |
| T4 | 注入样式块让官方 headline 与角标不再显示 | happy-dom 中构造官方 hero 三子元素，断言隐藏规则命中（用官方真实类名构造） |
| T5 | 角标文本被改为 `Preview`，且返回的 disposer 能还原 | DOM 文本断言（唯一 seam 内的可观察输出） |
| T6 | 官方节点在 React 回写后仍保持 `Preview` | 把文本节点改回原文并触发 observer，再断言 |
| T7 | 解析器对任意新前缀（构造 `aaaaaa_headlineText` 等）仍算出类名 | 构造输入的字面量（升级免疫） |
| T8 | 三锚 miss 时 `data-dsh-root-brand-anchors` 变为 `degraded` 且 console 有 warn | 诊断属性与 warn 调用 |
| T9 | 解析失败时降级规则仍使 hero 只显示一句 | happy-dom 中构造栅格结构断言 |

**已有测试先例**：`dsh-ui-polish-local/test/ui-polish.client.spec.ts`（bundle 装载范式）、`dsh-ui-polish-local/test/setup.ts`（ModuleLoader 桩）。

**需要移除的自证式断言**：`src/client/brand-css.test.ts` 的
`expect(BRAND_CSS).toContain("._37cUPa_headlineText, ._37cUPa_previewBadge { display: none; }")` 与
`expect(BRAND_CSS).toContain("._37cUPa_headline { grid-template-columns: auto; }")`
——它们正是本次漏检的结构性原因，替换为「解析器输出对真实产物命中」。

**TDD 纪律**：T1-T9 必须先跑出真实 Red（日志存档）→ 最小实现 → **同一支测试**转 Green，两者证据同时保留。

## Out of Scope

- 不改基座（`deepseek-harness`、`vendor/dsh-desktop`）；不动 `shadows-shipped-ui` slot；不引入 npm 发布线依赖（红线 1/2）。
- 不做「把界面语言切成英文以获取官方 Preview」这条捷径：中文界面下必须成立。
- 不重做 `brand-replay.sh` 的品牌重放主体，只退役其中 hero.headline 一段。
- 不重新设计统计条视觉，只修它的选择器锚。
- 不重构 `dsh-ui-polish-local`，不引入通用的「上游哈希解析」公共包（等第二个消费者出现再说）。
- 不新增冻结的官方 CSS fixture 文件。
- 不把 agent 自注入样式标签的 `data-plugin-css` 约定升格为宿主契约（仅作为本插件的只读探测面使用）。
- 不改 `hero.chooseWorkspace`、workspace 行等其余 hero 内容。

## Further Notes

- 解析器面对的真实约束：前缀长度实测恒为 6 字符，但**不得**把它当作硬前提（正则用 `{6}` 与负向断言双保险；若上游改变长度，负向断言仍可选出唯一前缀，届时按 1 处改动放宽量词）。
- `lib/` 在 `.gitignore` 内（产物不入库），而 profile 侧 `lib/client.js` 与 workspace 是同一 inode 的硬链接（实测 inode 251166246 / links=2）。若构建改为原子替换，必须按红线 4 用 tmp+mv 语义重新同步 profile 副本，并以 `pnpm run gate` 的 `profile-files-sync` 项作证。
- 客户端 bundle 生效路径：有 tsdown watcher 时 `dsh-client-hmr` 会就地热替换；否则重载页面/重开窗口即可，无需重装应用（`patchReload: "live"` 只作用于宿主侧插件行）。
- 长期方向：等官方为 `hero.headline` / `hero.preview` 提供可注册席位或 token 面后，本套 DOM 改写整体退役（`docs/research/09-audit-architecture.md` 第 113 行已登记该方向）。
