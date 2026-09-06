# [High] @zseven-w/dsh-noema: 状态路由硬编码 ok:true + ledger 非原子写

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x · @zseven-w/dsh-noema@0.1.0-rc.3

## 证据
- `lib/status-route.js:138-140`：`const { ok: _ok, ...status } = await manager.status()` 后返回 `ok: true` 硬编码 → 服务挂了也报健康。
- `lib/import-service.js:101`：`writeFile(path, JSON.stringify(ledger))` 非原子 → 崩溃损坏后 `loadLedger` 静默重置、下次全量重导。

## 建议修复
恢复真实 `ok`；ledger 改 tmp+rename 原子写。另：review 队列（inbox/decisions）append-only 永不清理，建议定期归档。

## 关联本地修复
已修两项（补丁清单 P0-5 + postinstall 补丁第 6、7 条）。
