# LUTE Agentic System

基于 **DeepSeek Harness（DSH Desktop）** 的二次开发平台：出海技能体系 + 万物互联（连接 MCP / API / 企业应用 / 知识库）+ 全套工程插件与打包流水线。

> 当前版本：**v2.0.0**（2026-09-10，DSH 基座 2.0.5 / runtime 0.1.2-rc.1）· 仓库：monorepo · 变更历史见 [CHANGELOG.md](CHANGELOG.md)（2.0.0 升级全链研究见 docs/research/）
>
> **客户安装**：下载最新 [GitHub Release](https://github.com/zjgulai/lute-dsh-platform/releases) 的 `DSH-Desktop-LUTE-<版本>-mac-arm64.pkg`，双击按向导安装（详见 [安装卡](packaging/INSTALL-CARD.md)）。

## 平台组成

| 模块 | 目录 | 说明 |
| --- | --- | --- |
| 出海技能 | `dsh-overseas-skills/` | 设置页「出海技能」（25 组 230 行卡片墙）：81-Skills 全量 81 + 营销存量 + AnySearch；技能卡片结构化引导（L1 30 模板 + L2/L3 兜底） |
| 出海工具 | `dsh-overseas-tools/` | Exa 等外部工具原生接入（credentials 服务） |
| 万物互联 | `dsh-wanzh-hulian/` | 设置页「万物互联」四板块：MCP / API / 企业应用 / 知识库；得到大脑 19 工具 + 分类整理 + OAuth/CLI 双通道 + MCP 宿主直挂 + Shopify 连接（配置化 connections.json）；输入区知识库选择器（右停靠面板） |
| 技能子集 | `dsh-skill-subset/` | 预设技能白名单契约（respectFileFlags） |
| 宿主补丁集 | `dsh-patches/` | 宿主层补丁与 lint 工具 |
| 支撑插件 | `dsh-*-local/`、`archify-local/` 等 | profile 依赖插件（deepresearch/noema/memory/loopx/agent-team/browser/theme…） |
| 打包工程 | `packaging/` | pkg + dmg 双格式流水线（assemble.sh → sign-and-dmg.sh / build-pkg.sh；pkg 为主交付，面向无终端客户） |
| 技能源 | `81-Skills/` | 自研技能集（含安装与维护管线） |
| 文档 | `docs/`（ADR/架构/发布流程/白屏排查手册）、`doc/`（HTML 文档站）、`_doc-notes/` | 决策与知识资产 |

## 安装

### 客户安装（pkg 主交付，双击向导）

1. 从 [Releases](https://github.com/zjgulai/lute-dsh-platform/releases) 下载 `DSH-Desktop-LUTE-<版本>-mac-arm64.pkg`
2. 双击 → Installer 向导 → 输入开机密码 → 完成（被 Gatekeeper 拦时右键 → 打开）
3. 重启 DSH Desktop，重新授权 TCC（录屏/辅助功能/自动化）

> 仅支持 Apple 芯片 Mac（arm64，macOS 13+）。dmg 为备用（终端 `bash install.sh`，高级用户）。

### 本机开发安装（profile file: 依赖）

```bash
cd ~/.dsh/profiles/desktop
pnpm add file:/Users/lute/project/Magpie-Horch/dsh-overseas-skills
# 并在 package.json 的 dsh.profile.bundles 追加插件名
```

详细维护与生效语义见 `docs/architecture.md` 与各插件 docs/。
- 故障排查：`docs/dsh-desktop-white-screen-playbook.md`（DSH Desktop 白屏等二次开发常见故障速查，索引见 `docs/README.md`）。

## 版本与发布

- 版本：单平台版本 `vX.Y.Z`（git tag = 打包版本），各插件 package.json 同步对齐；`CHANGELOG.md`（根）与 `packaging/CHANGELOG.md`（打包）双轨汇总。
- 发布：`packaging/` 构建 pkg + dmg → **GitHub Releases 附件**（二进制不进 git）+ `SHA256SUMS`/`PKG-SHA256SUMS` 校验清单 + `INSTALL-CARD.md` 客户安装卡。
- 交付形态：**pkg 为主**（客户双击向导）、dmg 为备用（CLI）；BUILD 号标识每次打包（防同名多代混淆）。
- 流程 SOP：`docs/release-process.md`。

## 决策与贡献

- 架构决策：`docs/adr/`（ADR-NNNN，模板与索引见目录内 README）。
- 贡献：PR 制（main 分支保护），Conventional Commits，PR 模板见 `.github/`。
- 安全红线：凭证不进仓库（.env/credentials 已被 .gitignore），提交前执行 secret 扫描。

## License

[MIT](LICENSE)
