# [Critical] 更新安装器无签名/哈希校验，下载产物被直接执行

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `lib/update-download.js:278-296`：`validateArtifact` 仅校验容器 magic（DMG trailer `koly` / DOS+PE 头），无任何签名/哈希校验。
- `lib/electron-runtime-DS52LbUW.js:2381`：macOS 下载完成后直接 `shell.openPath(artifactPath)` 自动挂载。
- `lib/electron-runtime-DS52LbUW.js:2408`：Windows 直接 `spawn(installerPath, ["--updated","--force-run"])` 执行下载的 EXE。
- `lib/update-checker-Mw2EmLOX.js:113,184`：version 端点只返回 `{version}`，无哈希/签名字段。

## 复现
劫持下载端点（`https://www.dshdesktop.cn/api/downloads/mac|windows`）返回任意构造的 DMG/EXE → `validateArtifact` 通过（仅容器头正确）→ 产物被 `openPath`/`spawn` 执行 = 无签名代码执行。

## 建议修复
1. version 端点响应增加 `sha512`/`integrity` 字段；下载侧在 `validateArtifact` 做字节级比对，失败即 `invalid-artifact`。
2. macOS 追加 `spctl --assess --type open --context context:primary-signature` 公证校验（Windows 对应 Authenticode）。
3. 校验失败或校验不可用时，一律不自动 `openPath`/`spawn`，回退为「下载完成 + 手动安装」提示。

## 关联本地止血
本地已移除两处自动执行并修正文案（补丁清单 P0-1）。
