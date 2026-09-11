# dsh-theme · 本地适配版说明（0.1.0-local.1）

> 本文件是本机本地适配说明。上游原版：https://github.com/oil-oil/dsh-theme（0.1.0，基线 Harness 0.1.0-rc.6）。上游 README.md / README.zh.md 保留不动。

## 一、为什么需要本地适配

上游构建基于 DeepSeek Harness `0.1.0-rc.6`，本机 DSH Desktop 2.0.4 运行内核 `0.1.2-alpha.1`，存在两处版本漂移，原版直接安装无法正常工作：

1. **模块改名（致命）**：原版 client bundle 硬 `require("@deepseek-ai/dsh-client-runtime/client")`（rc.6 的 store 提供方）；alpha.1 已改名为 `@deepseek-ai/dsh-client-store`（无 `./client` 子路径）→ 原版 client 模块加载即失败。
2. **Token 面收缩（严重）**：原版把 66 个 token 全部交给 `theme.overrideTokens`；alpha.1 的 override 契约只有 13 个 token → 56 个（全部字体/字号、多级背景、交互态、侧栏 nav、气泡、品牌色）不生效。

## 二、适配内容（源码位于本目录）

| 文件 | 改动 |
| --- | --- |
| `src/client/store.ts` | `defineStore` 导入从 `dsh-client-runtime/client` 迁移到 `dsh-client-store` |
| `src/client/index.tsx` | ① 本地 `ClientContext` 最小类型（上游类型包在 alpha.1 已裁掉 .d.ts）；② `applyPreview` 双层应用：13 个契约 token 走官方 `overrideTokens`（自动明暗切换），其余 55 个走注入样式表 `:root {…} body[data-ds-dark-theme] {…}`（跟随系统明暗属性，无需监听重应用）；③ `syncTheme` 增加 scheme 缺失回退 |
| `tsdown.config.ts` | `CLIENT_EXTERNALS` 用 `@deepseek-ai/dsh-client-store` 替换旧模块名 |
| `package.json` | 版本 `0.1.0-local.1`；`dsh.client.inject` 信息边同步替换；devDeps 精简为 tsdown+vitest（构建只需转译，@deepseek-ai 类型导入全部擦除） |

## 三、使用方法

- 入口：设置 → 外观（Appearance）→ dsh-theme 区块（settings.section，order 5）
- 功能：明/暗/系统三模式；15 个预设主题；accent/背景/前景/表面/侧栏/行内代码实时调色；UI 与代码字体/字号独立可调
- 设置存储：浏览器 localStorage（版本化键），刷新不丢；不跨浏览器/多端同步

## 四、相关说明

- **验证证据**：client 模块图 require 集 = store/react/jsx-runtime（全基线可解析）；settings.section 注册实测 active；双层 token 实测生效（样式表 :root+dark 块存在，计算值 `--dsw-font-base-16` 等携带预设字体栈）
- **本机安装方式**：`file:/Users/lute/project/Magpie-Horch/dsh-theme-local` 依赖 + profile `cordis.patch.yml` 的 insert 行（id: dsh-theme）
- **回滚**：移除 patch insert 行 + profile package.json 依赖 → 重跑 profile pnpm install；重启 Desktop
- **更新**：本地源码改完 → `pnpm build`（用桌面 pnpm）→ 重启 Desktop + 硬刷新
- **契约 token 清单**：bg-base / bg-layer-1 / bg-layer-2 / bg-overlay / border-l1 / border-l2 / brand-primary / label-primary / label-secondary / state-error-primary / state-success-primary / state-warn-primary / sidebar-fill

## 五、迭代优化方向

1. **上游同步**：上游若发布适配 0.1.2-alpha.1 的版本，用其替换本地 fork（改动点见上表，diff 很小）
2. **字体 token 迁移**：alpha.1 若公开 `setFontSize` 之外的字体 token 覆盖契约，可把注入样式表的部分迁回官方 API
3. **上游反馈**：可提 issue 说明 rc.6→alpha.1 的模块改名与 token 面收缩，附本文件证据
4. **深色模式长测**：暗色下注入样式表的 55 个 token 与官方组件消费行为需长期观察（当前实测 :root/dark 双块均生效）
