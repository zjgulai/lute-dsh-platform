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

- `hero.headline`（探索未至之境）与 `hero.preview`（预览版）不是公开 slot，无法经语言包覆盖；
  本插件通过注入 CSS 隐藏原生 headline/preview（`_37cUPa_headlineText`、`_37cUPa_previewBadge`），
  这些类名**版本钉在 DSH Desktop 2.0.4**。应用升级后若类名重新 hash，需在
  `src/client/brand.tsx` 的 `BRAND_CSS` 中更新这两个选择器并重新 build。
- hero 渲染的替换内容通过公开 slot `conversation.hero.brand.mark` 挂入（官方推荐的品牌座位路径）。

## 命令

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build   # 构建后运行 scripts/validate-build.mjs
node ~/.dsh/skills/build-deepseek-harness-plugin/scripts/check_plugin.mjs .
```

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
