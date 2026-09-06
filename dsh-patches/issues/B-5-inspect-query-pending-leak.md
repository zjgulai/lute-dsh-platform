# [Medium] dsh-cordis-host-runner: inspect-query 无超时 + pending 泄漏

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `dsh-cordis-host-runner/lib/index.js:813-855`：`queryClient` 创建永不 settle 的 pending Promise，仅靠 abort 清理；客户端不回答则条目与 Promise 永久泄漏。
- `dsh-cordis-host-runner/lib/index.js:796-812`：`resolveClientQuery` 输出校验失败分支返回 accepted=false 但漏删 pending 条目（`this.pending.delete(requestId)`）。

## 建议修复
查询加超时；所有结算路径（含校验失败）清理 pending 条目。
