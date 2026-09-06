# [High] renderer console 不转发，客户端静默失败对主日志不可见

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `lib/electron-runtime-DS52LbUW.js:845-850`：注册了 `will-frame-navigate`/`will-redirect`/`render-process-gone`/`did-fail-load`，但**无 `webContents.on('console-message')`**。

## 影响
UI 层所有静默失败（守卫 return、已知失败不打印）在主日志中零痕迹，诊断只能靠页面横幅/截图。

## 建议修复
主进程订阅 `console-message`，按 level 过滤后转发宿主日志管道（带来源 URL/行号）。
