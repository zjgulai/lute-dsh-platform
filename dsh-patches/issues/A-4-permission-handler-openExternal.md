# [High] 无 setPermissionRequestHandler + openExternal 放行任意 http/https

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `lib/electron-runtime-DS52LbUW.js:851-859`：`setWindowOpenHandler` 中 `http:`/`https:`/`mailto:` 一律 `shell.openExternal(target.href)`，且未注册 `session.setPermissionRequestHandler`（Electron 默认放行 web 权限）。

## 建议修复
1. `window.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false))`（默认全拒）。
2. `openExternal` 白名单化：`mailto:` + 显式信任域名，其余拒绝。

## 关联本地止血
本地已按上述修复（补丁清单 P0-6）。
