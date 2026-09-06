# dsh-noema · 本地安装说明（0.1.0-rc.3，npm 安装）

> 本文件是本机安装说明。上游：https://github.com/ZSeven-W/dsh-noema（MIT，128★）。上游 README.md / README.*.md 保留不动。

## 一、这是什么

Noema 长期记忆插件：持久的、可检查的 agent 记忆，带 recall 工具、设置页与 **MCP stdio 原生服务**（Rust 编译的 `noema-mcp` 二进制，平台化 npm 可选依赖分发）。

## 二、使用方法

- **设置**：设置 → Noema Memory 区块（settings.section）——开关、存储位置、自定义 server 命令等
- **记忆工具**：Host 注入 `noema_*` 工具集（recall 等），供 agent 在会话中使用
- **数据**：由 noema-mcp 原生进程管理（MCP stdio 通道）；host 通过 server-manager 拉起/保活
- 与已装的 dsh-memory（灵枢）**并存**：noema 偏长期存储与召回，灵枢偏认知层（元认知/知识飞轮/信任）——如发现工具注入冲突可随时卸载

## 三、相关说明

- **本机兼容性**：peers 基线 rc.6；host 注入 `tools` + 运行时 `systemPrompt`/`webServer`（本机全存在）；client 值导入仅 react（无旧模块 specifier）；原生二进制 darwin-arm64 ✓（Mach-O，8.4MB）
- **安装方式**：**npm 安装**（上游不提交 lib 且无 prepare，git 安装会缺产物）：`"@zseven-w/dsh-noema": "0.1.0-rc.3"` 依赖 + bundles 条目；pnpm 自动拉取 `@zseven-w/dsh-noema-darwin-arm64` 可选依赖（rc.3 含 `bin/noema-mcp`）
- **Node 要求**：engines `>=24.11.0`；Desktop 的 engines 声明 `>=24.0`（Electron 43 内置 Node 24.x，运行时实测确认）
- **测试**：L1 27/27 通过 + 1 跳过（e2e 需真实二进制，安装后可在运行时补验）；首次 pnpm test 下 mcp-stdio 套件有并行时序性 flaky（重跑稳定）
- **回滚**：移除依赖与 bundles 条目 → profile pnpm install → 重启 Desktop
- **更新**：改 profile 依赖版本号 → pnpm install → 重启

## 四、迭代优化方向

1. **与灵枢的并存观察**：重启后重点观察两套记忆工具的注入量与召回冲突；若上下文开销明显，考虑用 noema 设置页关闭其工具集或反之
2. **上游版本追踪**：上游 0.1.0-rc.3 为 rc 系列；正式版发布后更新（平台包版本需与主包同步——注意 darwin-arm64 包的版本对齐）
3. **自定义 server 命令**：noema 支持设置页配置自定义 MCP server 命令——可替代 bundled 二进制（如自建 Rust 构建）
4. **原生二进制安全**：npm 分发的 Rust 二进制无签名；上游有 verify-platform-packages 校验脚本，更新时可用 `scripts/verify-platform-packages.mjs` 复核
