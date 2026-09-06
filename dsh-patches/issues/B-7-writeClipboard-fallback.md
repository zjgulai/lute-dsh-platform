# [Medium] dsh-client-ui-primitives: writeClipboard 无 execCommand 兜底（writeText 被拒即静默失败）

## 环境
DSH Desktop 2.0.4 · @deepseek-ai/dsh-client-ui-primitives@0.1.2-alpha.1

## 证据
- 原 `writeClipboard`：`await navigator.clipboard.writeText(text)` 失败即 `return false`，不尝试任何兜底——在权限被拒/非安全上下文（jsdom、内嵌）中复制按钮完全失效且无提示。
- 本机已实测修复（8/30-31）：writeText 优先、失败 `execCommand('copy')` 兜底，复制恢复。注意沙箱内 `execCommand` 可能返回 true 但不写剪贴板——因此**权限层必须放行 clipboard-write**（Electron 侧 `setPermissionRequestHandler` 允许 `clipboard-sanitized-write`/`clipboard-write`），兜底只是第二道防线。

## 建议修复
1. `writeClipboard` 加兜底链：`writeText` → `execCommand('copy')`（选中文本）→ 显式 false；
2. 文档化权限契约：宿主权限 handler 必须允许 clipboard-write，否则任何前端兜底都无效。

## 关联本地修复
`node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js`（已加兜底，备份在旁）+ `electron-runtime` 权限放行。
