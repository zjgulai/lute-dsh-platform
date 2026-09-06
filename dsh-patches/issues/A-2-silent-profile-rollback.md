# [Critical] profile 检查点恢复静默还原 manifest（不碰 node_modules、零日志）

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `lib/main.js:2661-2699`：`restoreSlot` 从 checkpoint 快照 `writeDurable` 还原 package.json / pnpm-lock.yaml / pnpm-workspace.yaml。
- `lib/main.js:2669`：只写 `dependencyMaterializationPending` 旁路标记（独立 SKIP_MARKER 文件），**主日志零记录**。
- `lib/main.js:2555,2578`：boot 时 `recoverOrphanedSlots()` 自动触发。
- 同族路径：`dshmarket/lib/backup.js:162-199` `restoreProfileBackup` 同样只覆盖文件、零日志（`SKIP_NAMES` 含 node_modules）。

## 复现
未干净关闭 → 重启 → 检查点恢复把 package.json 还原到旧快照（插件 dependencies+bundles 两条目消失，文件与安装前快照逐字节一致）→ node_modules 不还原（插件包体残留）→ 日志零报错 = 「插件静默消失」三件套。

## 建议修复
1. 恢复前写主日志（`logError`）并落 `.bak`。
2. 恢复后校验 node_modules 与 manifest 一致性，不一致时显式告警（而非静默）。
3. `dependencyMaterializationPending` → 物化（pnpm install）失败必须可见。

## 关联本地止血
本地已在两条路径加日志（补丁清单 P0-2；dshmarket 侧并入 postinstall 补丁第 8 条）。
