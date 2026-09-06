# [Medium] @furongjun1999/dsh-memory: macOS 默认 python ENOENT + 相对 dbPath + 自动记忆污染

## 环境
DSH Desktop 2.0.4 (macOS 26) · 内置 @deepseek-ai/*@0.1.2-alpha.1 · npm 生态 0.1.1-rc.x · @furongjun1999/dsh-memory@0.4.0

## 证据
- `src/index.ts:93`：`python: z.string().default('python')` → macOS（无 `python` 命令）spawn ENOENT，插件静默半激活。
- `src/index.ts:96`：`dbPath: z.string().default('data/lingshu.db')` 相对路径 → 换 cwd 即新库、记忆分裂。
- `src/hooks.ts:114-122`：自动记忆逐字写入全部 user 消息，含子代理任务简报（子代理的首条 user/message 即父代理的 prompt）→ 知识层污染。

## 建议修复
darwin 默认 `python3`；dbPath 绝对化；自动记忆过滤 `delegationDepth > 0` 或加价值门槛。

## 关联本地修复
已修三项（补丁清单 P0-5）。
