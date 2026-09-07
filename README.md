# LUTE Agentic System

基于 **DeepSeek Harness（DSH Desktop）** 的二次开发平台：出海技能体系 + 万物互联（连接 MCP / API / 企业应用 / 知识库）+ 全套工程插件与打包流水线。

> 基线版本：**v0.1.0**（2026-09-06）· 仓库：monorepo · 变更历史见 [CHANGELOG.md](CHANGELOG.md)

## 平台组成

| 模块 | 目录 | 说明 |
| --- | --- | --- |
| 出海技能 | `dsh-overseas-skills/` | 设置页「出海技能」（25 组 230 行卡片墙）：81-Skills 全量 81 + 营销存量 + AnySearch；技能卡片结构化引导（L1 30 模板 + L2/L3 兜底） |
| 出海工具 | `dsh-overseas-tools/` | Exa 等外部工具原生接入（credentials 服务） |
| 万物互联 | `dsh-wanzh-hulian/` | 设置页「万物互联」四板块：MCP / API / 企业应用 / 知识库；得到大脑 19 工具 + 分类整理 + OAuth/CLI 双通道 + MCP 宿主直挂 + Shopify 连接（配置化 connections.json）；输入区知识库选择器（右停靠面板） |
| 技能子集 | `dsh-skill-subset/` | 预设技能白名单契约（respectFileFlags） |
| 宿主补丁集 | `dsh-patches/` | 宿主层补丁与 lint 工具 |
| 支撑插件 | `dsh-*-local/`、`archify-local/` 等 | profile 依赖插件（deepresearch/noema/memory/loopx/agent-team/browser/theme…） |
| 打包工程 | `packaging/` | DMG 组装/签名/发布流水线（assemble.sh、sign-and-dmg.sh） |
| 技能源 | `81-Skills/` | 自研技能集（含安装与维护管线） |
| 文档 | `docs/`（ADR/架构/发布流程/白屏排查手册）、`doc/`（HTML 文档站）、`_doc-notes/` | 决策与知识资产 |

## 安装（本机 DSH Desktop）

各插件以 profile `file:` 依赖安装（硬链接），例如：

```bash
cd ~/.dsh/profiles/desktop
pnpm add file:/Users/lute/project/Magpie-Horch/dsh-overseas-skills
# 并在 package.json 的 dsh.profile.bundles 追加插件名
```

详细维护与生效语义见 `docs/architecture.md` 与各插件 docs/。
- 故障排查：`docs/dsh-desktop-white-screen-playbook.md`（DSH Desktop 白屏等二次开发常见故障速查，索引见 `docs/README.md`）。

## 版本与发布

- 版本：单平台版本 `vX.Y.Z`（git tag），各插件 package.json 同步对齐；`CHANGELOG.md` 汇总。
- DMG：`packaging/` 构建 → **GitHub Releases 附件**发布 + `release/<version>.sha256` 清单（二进制不进 git）。
- 流程 SOP：`docs/release-process.md`。

## 决策与贡献

- 架构决策：`docs/adr/`（ADR-NNNN，模板与索引见目录内 README）。
- 贡献：PR 制（main 分支保护），Conventional Commits，PR 模板见 `.github/`。
- 安全红线：凭证不进仓库（.env/credentials 已被 .gitignore），提交前执行 secret 扫描。

## License

[MIT](LICENSE)
