# [High] dsh-api-session-controller: loadOlder 静默失败四出口 + hasMore 状态矛盾

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- 源树 `dsh-api-session-controller/lib/types/client/sessions/session.js:347-367` 仍是原 bug：
  1. 守卫 `openState !== "open" || !hasMore || loadingOlder` 静默 return；
  2. `events === void 0` 静默 return；
  3. `prepend` 的已知失败（RemoteStreamError）连 `console.error` 都不打；
  4. `prepend` 无超时，请求挂起时 `loadingOlder` 永久卡 true。
- `failEventStream` 不重置 `hasMore` → 聊天视图按钮按 `hasMore` 渲染、点击却被守卫拦截 =「加载更早点了没反应」。

## 建议修复
合并本地已实装修复（`dsh-chatui-fix/apply-fixes.sh`）：`loadOlder` 失败先 `resync()` 自愈 + 15s 超时（Promise.race）+ 失败写 `openError` 复用现有错误横幅 + 所有失败 `console.error`；按钮渲染门收紧为 `hasMore && openState === "open"`。**注意：bundle 已修但 `types/` 源树未修——合并后需同步源树。**

## 关联本地修复
3 个 client bundle 外科补丁（`dsh-chatui-fix/`）。
