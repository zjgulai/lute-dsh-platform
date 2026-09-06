# [High] 诊断导出打包进程内存转储（.dmp）与未脱敏 active-run.json

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x

## 证据
- `lib/diagnostic-export-worker.js:96-104`：`crashDumpEntries` 收集全部 `.dmp` 文件。
- `lib/diagnostic-export-worker.js:158-194`：导出循环将 crash dumps 与 `crash-evidence/active-run.json` 直接打入 zip（`.dmp` = 进程内存，可含密钥/token/会话内容）。

## 建议修复
默认排除 `.dmp`（仅统计计数）；`active-run.json` 打包前脱敏（去除 pid/ownerId）。

## 关联本地止血
本地已排除 `.dmp`（补丁清单 P0-6）。
