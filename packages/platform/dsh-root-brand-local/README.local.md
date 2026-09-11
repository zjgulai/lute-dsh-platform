# dsh-root-brand（本地品牌皮肤）

ROOT 路特创新 品牌皮肤：把 DSH Desktop 初始页面的官方品牌位替换为 ROOT 标识。

## 做了什么

| 位置 | 官方内容 | 替换为 |
|---|---|---|
| 侧栏品牌行 `sidebar.brand.mark` | 官方鱼标（FishLogo） | R∞T 字标 SVG（`currentColor`，随主题明暗） |
| 侧栏品牌名 `sidebar.brand.name` | deepseek + HARNESS 字标 | 路特创新（品牌绿 #58B848） |
| 新会话 hero `conversation.hero.brand.mark` | 官方鱼标（34px） | R∞T 标 + "Artificial Business Intelligence Agentic" |

实现方式：以 `priority: -100` 覆盖三个 `single` 品牌 slot（注册表规则：最低优先级者渲染），
**没有**禁用任何官方 Loader 行，卸载插件即恢复官方品牌。

## 已知约束（重要）

- `hero.headline`（中文原文「探索未至之境」）与 `hero.preview`（`预览版`）**不是公开 slot**，
  也**不在可被插件注册的公开 locale 命名空间**（`ctx.locale.register` 对同命名空间同 locale 直接抛错），
  所以只能从外部改写官方 DOM。**改写锚不写死哈希**：`src/client/live-selectors.ts` 在运行时按
  官方样式标签 `style[data-plugin-css="<包路径>/<模块>.module.css"]`（包路径级锚，不随构建哈希变）
  读出类名，因此 2.0.4 的 `_37cUPa_*` 与 2.0.5 的 `zNic4G_*` 由**同一份实现**覆盖。
  上游若重命名 `HeroShell.module.css` / `StatsLine.module.css`，解析器会报 drift（见下）并走结构降级，
  届时才需要重锚模块 id。决定与代价见 ADR-0019。
- **漂移可观测**：解析失败时 `document.documentElement.dataset.dshRootBrandAnchors` 变为
  `degraded:<缺失锚点列表>`，并在 Console 打出 `[dsh-root-brand] anchor drift: …`；全部命中时为 `resolved`。
- **角标文案**：保持官方节点与外观，只把文本 `预览版 → Preview`（中英界面一致），
  `MutationObserver` 抗 React 回写，卸载时还原原文。
- hero 渲染的替换内容通过公开 slot `conversation.hero.brand.mark` 挂入（官方推荐的品牌座位路径）。
- 原先把官方 `hero.headline` 改写成同一句的兜底（`dsh-patches/brand-replay.sh`）**已退役**：
  品牌句的唯一真相源是本插件，避免「插件隐藏规则 miss 时同文案出现两次」。

## 命令

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build   # 构建后运行 scripts/validate-build.mjs
node ~/.dsh/skills/build-deepseek-harness-plugin/scripts/check_plugin.mjs .
```

测试分两层，且**都必须跑**（`vitest.config.ts` 同时纳入 `test/` 与 `src/`）：

- `test/*.spec.ts`：**真实产物 seam** —— 经 `window.__ModuleLoader__` 桩加载 `lib/client.js`，
  在 happy-dom 里执行 `apply`；官方类名真值从真实产物解析（本机 app 包 / 已入库 2.0.4 归档），
  不写死哈希。覆盖「标题唯一」「角标 Preview 且抗回写、可还原」「统计条折叠两代都命中」
  「换新前缀仍命中」「缺锚时 degraded + 警告」。
- `src/client/*.test.ts(x)`：源码级守卫（反向断言：产品代码里不得出现哈希选择器）。

## 安装 / 卸载

- 安装：`~/.dsh/profiles/desktop/package.json` 的 `dependencies` + `dsh.profile.bundles` 已包含
  `dsh-root-brand`（`file:` 指向本目录）；改动后 **重启 DSH Desktop** 生效。
- 卸载：从上述两处删除该条目，运行 `pnpm install`，重启应用。

## 设计

`src/client/brand.tsx`：
- `RootMark`：几何重绘 R∞T 字标（OO 即 ∞），底部三根圆角品牌条（绿/灰/绿），
  颜色取自附件参考图（绿 #58B848、灰 #A8A8A8），笔画用 `currentColor` 适配明暗主题。
- 设计预览：`/Users/lute/project/Magpie-Horch/.dsh-root-brand-preview/preview.html`
  （浅/深色 × 侧栏/hero 四态，用 Chrome 无头截图核对过）。
