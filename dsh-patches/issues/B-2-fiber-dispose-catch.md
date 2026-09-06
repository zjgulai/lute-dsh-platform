# [High] fiber.dispose().catch() 三处应改为 Promise.resolve(fiber.dispose()).catch

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `dsh-tool-subagent/lib/index.js:622`
- `dsh-file-reference-local/lib/index.js:354`
- `dsh-file-reference-local/lib/types/index.js:50`

## 复现
`fiber.dispose()` 返回 undefined 时，`.catch` 直接抛 `TypeError: Cannot read properties of undefined (reading 'catch')`；实测每次子代理销毁触发 `agent/disposed listener threw`（主日志可见）。

## 建议修复
三处统一改为 `Promise.resolve(fiber.dispose()).catch(...)`。

## 关联本地修复
两个 profile override（补丁清单 P0-4）。
