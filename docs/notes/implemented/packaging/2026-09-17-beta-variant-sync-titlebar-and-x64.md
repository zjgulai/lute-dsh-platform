# 2026-09-17 · beta 变体同步、标题栏版本胶囊摘除与 x64 单架构声明

## Problem

三条尾债在 2.5.0 交接链上各有形态：
1. `check:desktop-variants` 报 beta 版 30 个 `src/` 文件漂移——9 个 LUTE 提交只落了 stable 面（T-07 收尾债）。
2. 标题栏渲染 `v{environment.version}` = 桌面基座版本（2.0.5），永远钉死在基座号上、与 LUTE 集成版本无关；用户长期把它误读为产品版本且要求摘除。证据链：OCR 截图（box 52,16「LUTE Agentic System」+ 350,20「v2.0.5」）→ 全树字面量零命中 → `lib/client.js` 唯一动态拼装点 `DesktopVersionControl`（`dsh-plugin-desktop/src/client/DesktopFrameTitlebarView.tsx`，ExtendedTitlebar 与 compatibility-chrome 共用同一 View）。
3. x64 prebuild 缺口（fs-ext 无 darwin-x64/electron.abi148 prebuild），universal 无法成包。

## Decision

- **标题栏**：`DesktopVersionControl` 整体退役（组件、渲染位、`checkForUpdates` 注入、4 个 locale 键、对应 spec 断言）。「检查更新」桌面入口随之退役；设置页/托盘入口与 P0-1v2 守卫不变。`environment.version` 保留（诊断面仍需）。
- **beta 同步**：diff3 三方合并（base=`697e7d782` upstream beta 原文，ours=当前 beta，theirs=当前 stable 含 LUTE 增量），保留 beta 自身稀疏 identity 标记布局。盲全局变换已被字节级 sanity 证伪（`dshDesktopFrameProduct` 在 upstream beta 中无「Beta」后缀）。
- 6 个 diff3 不收敛大文件（locales / diagnostic-export / electron-runtime / electron-shell-generation / profile-checkpoint / profile-manager）按 checker 等价定义改为 **marker-free 字节对齐**：变体身份仍由声明的 `product-identity.ts` 承载。4 个 diff3 截断/失衡 spec 回退 identity 变换；`windows-nsis-ab.spec.ts` 恢复 upstream 事实——beta 从未持有。
- **x64**：沿 2.4.1 先例声明 `ARCH=arm64` 单架构（VERSION/manifest/DMG 文件名三处一致），x64 补齐单列不阻塞 2.5.0。

## Alternatives considered

- 标题栏改显 LUTE 版本（v2.5.0）：仍会与基座号（Info.plist 2.0.10）形成双版本读数，不摘不净。
- beta 盲 identity 变换：sanity 已证伪（标记是稀疏历史产物，非全局规则）。
- 追 beta 全量 vitest 17 fails：属上游存量 spec × LUTE 语义源码错位 + 60s 启动冒烟超时；盲补违反调试纪律，登记为已知残留、后续单独收口（dev-only 变体不进出货面）。

## Consequences

- 标题栏只剩产品名与展示模式胶囊；版本读数唯一家 = 载荷 `VERSION`（LUTE_VERSION/DSH_BASELINE/ARCH/SOURCE_COMMIT）。
- beta 侧 6 文件无「Beta」字样（日志/文案层），功能与 stable 逐字节一致——`verify-desktop-variants` 181 aligned 机器判定闭环。
- vendor `lute-v2.0.10` 新增 2 提交（692c9e769 / 62c600f8e），Magpie-Horch 侧 `vendor/dsh-desktop.pin` lute-sha 同步更新。
