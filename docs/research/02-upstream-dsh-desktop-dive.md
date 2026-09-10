# 上游侦察报告：anywhere-labs/dsh-desktop（本地 DSH Desktop 2.0.4 → 上游现状）

> 调查日期：2026-09-10（本地时区）
> 调查对象：https://github.com/anywhere-labs/dsh-desktop（原名 anywhere-labs/deepseek-harness-desktop）
> 本地基线：`/Applications/DSH Desktop.app` v2.0.4（`app.asar.unpacked/package.json` = `dsh-plugin-desktop@2.0.4`，repository 字段指向 `anywhere-labs/deepseek-harness-desktop`，directory=`dsh-plugin-desktop`）
> 数据源（全部一手）：`git ls-remote`、GitHub REST API（`/repos`、`/releases`、`/issues`、`/compare`、`/commits`、`/git/trees`）、raw.githubusercontent 文件抓取、以及 `--depth 1 --filter=blob:none --sparse` 稀疏克隆（本地 `/tmp/dsh-sparse`，HEAD=7c1b6395）。
> 取证说明：完整 git clone 两次尝试均被 GitHub 限速（约 35KB/s，pack 停滞 20+ 分钟）后放弃；历史与 diff 信息改用 API（compare 接口受 300 文件截断限制，已注明），文件内容用稀疏克隆 + raw 抓取获得。

## 1. 仓库身份

| 项 | 值 |
|---|---|
| full_name | `anywhere-labs/dsh-desktop`（id 1333321333，非 fork） |
| 原名 | `anywhere-labs/deepseek-harness-desktop`——API 访问旧名返回 200 并给出同一仓库 id，即**改名重定向**；release 正文与包内 repository 字段仍写旧名 |
| 描述 | 为 DeepSeek Harness (DSH) 插件生态打造的现代化桌面端解决方案。万物皆「插件」，桌面本身也是「插件」。 |
| 免责声明 | README/release 反复声明：社区开源项目，**非 DeepSeek 官方产品**，无官方团队成员参与（fork 继承的贡献者来自上游同步历史） |
| 指标 | ⭐ 24,778 · fork 1,198 · watcher 24,778 · **open issues 349** · subscribers 58 |
| 时间 | created 2026-08-13 · **pushed 2026-09-09**（日均 ~50 提交级别的活跃度） |
| 其他 | MIT · TypeScript · 默认分支 `master` · homepage dshdesktop.cn · 有 Discussions |
| topics | cordis, cordis-plugin, deepseek, deepseek-harness, desktop, dsh, dsh-plugin, dsh-plugin-desktop |

分支（`git ls-remote`，共 ~110 个）：`master`、`desktop`、`beta`、`v2`、`dev/zji`、`docs/neutral-related-links`、3 个 `architecture/*`、~85 个 `codex/*` 特性分支（如 `codex/beta-upstream-v0.1.5-alpha.2`、`codex/plugin-failure-recovery-actions`、`codex/813-renderer-crash-recovery`）、若干 `revert-*`。
Tag：`v0.1.0, v2.0.0, v2.0.1, v2.0.2, v2.0.3, v2.0.4, v2.0.5, v2.0.5-beta.1`（v2.0.5 与 v2.0.5-beta.1 指向同一 commit `423406fe`）。

## 2. 版本序列与本地 2.0.4 的位置

来源：`/releases?per_page=30`（共 8 个 release）。

| tag | 日期 | 关键内容 |
|---|---|---|
| v0.1.0 | 2026-08-13 | 首个公开版（旧名 DeepSeek Harness Desktop），Electron 打包官方 Harness |
| v2.0.0 | 2026-08-15 | 大版本：Profile 管理/切换、托盘、内置 Node/DSH CLI/pnpm、更新检查、NSIS 安装器 |
| v2.0.1 | 2026-08-18 | Intel Mac 支持；上游升 rc7（警告：部分插件暂未适配）；内置插件市场；日志；**回滚与恢复助手** |
| v2.0.2 | 2026-08-21 | 上游 v0.1.1-rc.2（破坏性更新，旧 profile 可能打不开）；dsh-market 支持；「桌面版」设置页 |
| v2.0.3 | 2026-08-26 | 首次引导设置；扩展窗口模式/窗口材质；浏览器与局域网选项 |
| **v2.0.4** | **2026-08-28** | **本地版本**：上游 **v0.1.2-alpha.1**；修复 2.0.3 换打包方式的 bug；移除 Windows 亚克力；局域网访问改 https+token |
| v2.0.5-beta.1 | 2026-09-03 | 首个 **Beta 分发通道**（独立安装包/应用标识/更新通道，与稳定版并存，共享数据）；上游 v0.1.2-rc.1 |
| **v2.0.5** | 2026-09-03 | **最新稳定版**：上游 **v0.1.2-rc.1**；Windows 修复；恢复助手修复；**快速恢复 + 安全模式**（隔离环境，退出后自动删除） |

master（未发布）：`dsh-plugin-desktop` 版本号已到 **2.0.6**（dev）；`upstream.json` 双通道 pin——stable=`0.1.2-rc.1`（上游 commit `a66e4702`）/ beta=`0.1.5-alpha.2`（commit `b2e3b2a0`）。

**结论**：本地 2.0.4 位于上游序列第 6 位（前有 5 个版本）；其后上游发布了 **1 个稳定版 v2.0.5（+1 个 beta）**；master 又领先 v2.0.4 共 **176 个提交**（compare API：ahead_by=176, behind_by=0）。即：本地落后 1 个稳定版本 + 一个正在开发的 2.0.6。

## 3. 与本地 2.0.4 的 diff 摘要

### 3.1 文件级（`/compare/v2.0.4...master`，API 截断 300 文件，总变更 >300）

前 300 个文件的目录分组：

| 目录 | 文件数 | 说明 |
|---|---|---|
| dsh-plugin-desktop-beta/** | ~234 | **全新目录**（src 174 + scripts 31 + tests 18 + build 11 + docs 5） |
| .agents/notes | 17 | Agent 笔记体系（implemented/proposed） |
| dsh-community-market/** | ~16 | 市场壳源码/测试演进 |
| docs/、根 README/PRIVACY/CONTRIBUTING/AGENTS 等 | ~15 | 文档体系大幅扩充 |
| .yarn/patches、.github/workflows | ~3 | patch 与 CI |

（稳定包 `dsh-plugin-desktop/*` 的变更排在字母序后段、被 300 截断；见下方依赖级与提交级证据。）

### 3.2 依赖级（本地安装包 2.0.4 ↔ master 2.0.6 稳定包 package.json）

- 依赖数：147 → 149。
- **130 个 `@deepseek-ai/dsh-*` 包：`0.1.2-alpha.1` → `0.1.2-rc.1`**（上游运行时整体升级）。
- Cordis 体系：`@deepseek-ai/cordis 4.0.1→4.0.2`；`cordis-plugin-group 1.0.1→1.0.2`、`-include 1.0.6→1.0.7`、`-loader 1.0.2→1.0.3`、`-timer 1.1.3→1.1.4`。
- `schemastery ^3.18.1→^3.18.2`；**`dshmarket 1.17.1 → 1.38.1`**（第三方市场引擎大跨 21 个小版本）。
- 新增 2 个：**`@agents-anywhere/dsh-bridge-next`**（AA 桥，vendored tgz `vendor/agents-anywhere/…`）、**`@deepseek-ai/dsh-util-time`**。
- 移除 0 个。electron peer 保持 43.3.0，pnpm 保持 11.8.0。

### 3.3 功能级（2.0.4 → 2.0.5 → master 176 commits）

- 恢复助手：快速恢复、引导、**安全模式**（隔离 profile 环境，退出即删）。
- **Beta 分发通道**（`dsh-plugin-desktop-beta` 独立包，稳定版与 beta 并存共享数据）。
- **Agents Anywhere (AA) opt-in 集成**（`@agents-anywhere/dsh-bridge-next`，开发/打包前自动从 GitHub 刷新，PR #901）。
- 上游预设 `code`→`ptc` 改名 + 兼容别名层（稳定版一度丢失，issue #871 → 修复 PR #874 待合并）。
- 会话存储 V2→V3 JSONL 迁移（随上游 0.1.5-alpha.2，PR #898）；keyed `main` 槽位与全局插件面板。
- 从命令行打开工作区目录（PR #888）；Quick Ask 全局快捷提问（PR #839，未合并）。
- 大量稳定性修复：subprocess spill 目录被外部清理后 ENOENT 崩溃（#865 → #867 patch seam 修上游 `dsh-subprocess-local`，stable+beta 双补丁）；ASAR profile 模块回退可解析（#863）；市场加载时序竞态（#883）；Windows 安装器/图标/焦点等系列修复。
- 测试基建：stable 1,274 项 / beta 1,297 项 / 市场 263 项（PR #898 验证记录）。

## 4. 插件全景盘点（质量三件套）

根 `package.json` workspaces（yarn 4.18.0, node ^22.19||>=24）共 **4 个自有包** + 上游子模块 + vendor 运行时快照。行数为本地稀疏克隆实测 `wc -l`（排除二进制/lock，文本文件口径）。

| 包 | 版本(master) | 文件数(文本) | 总行数 | src 行 | tests 行 | 文档 | 测试 | 最近提交 | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| **dsh-plugin-desktop** | 2.0.6 (dev) | 355 (332) | 69,066 | 32,231 | 29,048 | 🟢 厚：README×3 + 仓库级 docs/（architecture、user-guide、plugin-development、plugin-ecosystem、faq、why-desktop 中英双语）+ THIRD_PARTY_NOTICES | 🟢 有：~120 测试文件、1,274 项（PR#898） | 2026-09-09（日更） | Electron 壳核心：Host/Client 双面、bootstrap、打包、恢复助手、profile 服务 |
| **dsh-plugin-desktop-beta** | 2.0.6-beta.1 | 361 (338) | 68,912 | 33,027 | 29,475 | 🟢 厚：同左（独立 README×3） | 🟢 有：~124 测试文件、1,297 项 | 2026-09-09 | 新：beta 通道包，pin 上游 0.1.5-alpha.2；含 dsh-client-file-upload、dsh-http-proxy、dsh-session-persistence-jsonl、dsh-util-values 等新上游包；多 fs-ext 依赖 |
| **dsh-community-market** | 0.1.0-dev.0（private） | 105 (104) | 21,657 | 10,201 | 7,511 | 🟡 中厚：README×3 + docs/market-shell + **SECURITY.md** | 🟢 有：28 测试文件、263 项 | 2026-09-09 | 内置插件市场壳（发现/可安装/已安装/来源四视图），自动安装有严格资格条件；private 不发布 npm |
| **dsh-community-fabric** | 0.1.0-dev.0（private） | 33 (32) | 6,163 | 0 | 0 | 🟡 纯文档（RFC Draft，Manifest/Capability/Host Descriptor 四块） | ⚪ 无（按设计） | **2026-08-16（休眠 3.5 周）** | 社区互操作标准提案，明确「Draft，仅有文档，无 runtime/SDK/schema」 |
| deepseek-harness（**子模块**） | 上游 0.1.2-rc.1（stable pin）/ 0.1.5-alpha.2（beta pin） | — | — | — | — | — | 上游自带 | pin 提交独立管理 | 桌面仓库禁止修改子模块文件（AGENTS.md/CONTRIBUTING.md 硬性边界） |
| vendor/dsh-runtime | 双通道 tgz 快照 | 513 | — | — | — | manifest.json | 冒烟校验 | 随 pin 更新 | 稳定+beta 两个上游运行时完整 vendored；另有 vendor/agents-anywhere |
| 外部运行时依赖 | @deepseek-ai/*（130 包 0.1.2-rc.1）、dshmarket 1.38.1、koffi、pnpm 11.8.0（内置）、electron 43.3.0 | — | — | — | — | — | — | — | dshmarket 经 yarn patch 维护；上游 bug 经 `patches/` seam 修补（不 fork） |

**质量结论**：
- 桌面双包质量最高：测试行数≈源码行数（29k/32k 与 29.5k/33k），中英双语厚文档，日更活跃，PR 模板强制验证清单（build/typecheck/test/冒烟 + `check:desktop-variants` 双包对齐）。
- community-market 有真代码+测试+安全文档，但注意 CONTRIBUTING/AGENTS 中「社区包尚不可加载、仅文档脚手架」的表述已滞后于代码现实（它已有 main/exports 与构建管线）；两者择一为真时应以代码为准并提示文档需更新。
- community-fabric 是标准提案而非软件，无代码无测试、已停更，属预期状态。
- 过程治理成熟：`yarn check` 全绿 headless gate、上游改动走独立 pin 提交、`patches/` 上游 bug 修补 seam、提交信息 conventional commits。

## 5. 稳定性信号

open issues **349 个**（repo API）。抽样最新 30 条（2026-09-05 ~ 09-09，`/issues?state=open&sort=created`），与稳定性直接相关者：

| # | 标题（摘录） | 性质 |
|---|---|---|
| 893 | 依赖树被自愈/迁移清空：`Cannot find module @opentelemetry/semantic-conventions`；app.asar.unpacked 从 19,957 文件被剪到 11,405；疑似空清单 `pnpm prune` 死亡螺旋 | 🔴 严重，2.0.5，根因分析详实 |
| 892 | 每次启动 desktop-webserver 报 `EADDRINUSE 127.0.0.1:43152`（无外部占用）→ 反复进恢复模式；workaround `dsh-desktop.port: 0` | 🔴 启动失败闭环 |
| 887 | 安装第三方插件后 app.asar.unpacked 下内核包 dsh-settings 被清空 → 主进程启动崩溃 | 🔴 插件安装破坏内核 |
| 878 | macOS 启动恢复与大会话导致主进程数十秒冻结（beachball） | 🟠 性能 |
| 865/867 | 主进程崩溃：外部清理 `%TEMP%\dsh-subprocess-*` 后 spillAll `ENOENT`（已提交修复 PR #867，patch 上游 stable+beta） | 🟠 已修待合并 |
| 858 | v2.0.5 全新安装：Agent 预设全部加载失败、无法选工作区/切模型（runtime 0.1.3-alpha.1 环境） | 🔴 全新安装不可用案例 |
| 852 | 插件运行时冲突导致前后端静默分离：启动 9 阶段全绿、无报错、无恢复窗口，坏配置被记入 healthy checkpoint | 🔴 静默失败+健康检查盲区 |
| 851 | Windows 主窗口每 ~25 秒自动抢前台焦点（无交互、无日志） | 🟠 用户体验 |
| 871/874 | v2.0.5 新建会话报 `preset "code" not found`（上游 code→ptc 改名，稳定版丢了兼容层；PR #874 修复待合并） | 🟠 上游改名回归 |
| 862 | opencode go provider 400：缺 `x-opencode-session` 头 | 🟠 第三方兼容 |
| 866 | 桌面壳 profile patch 对 session-title-llm 的 config 覆盖不生效（web 官方实例生效） | 🟠 patch 生效性 |
| 835 | 第三方 profile 插件缺「重启生效/热更新」契约（皮肤切换只能 reload 页面） | 🟡 生态契约 |
| 859 | macOS 大段日志直接粘贴进对话框导致整体卡顿（1.5 万行级） | 🟡 性能 |
| 838 | 2.0.5 弹窗/置顶问题「传染」，回滚 2.0.4 依旧 | 🟠 与 #851 同族 |

结构性观察：
1. **上游破坏性更新节奏极快**：一个月内 0.1.2-alpha.1 → 0.1.2-rc.1 → 0.1.3-alpha.1/2 → 0.1.5-alpha.2；release 正文反复警告「上游更新可能导致很多插件不可用」。
2. 高频风险集中在**启动/恢复路径**（端口冲突、依赖剪枝、恢复模式循环）与**第三方插件与内核共存**（清空内核包、静默断连、patch 不生效）。
3. master 近期出现 **revert 波动**（2026-09-09「整体恢复到 PR #885 合并版本」、恢复上游 pin），主干处于快速迭代+回摆期，不宜视为稳定。
4. 正面信号：团队用 `patches/` seam 修上游 bug 并附带确定性测试；PR 验证记录详实（如 #867 的删除→恢复×3 实测）；恢复助手/安全模式正是针对上述崩溃类问题的系统性止血。

## 6. 本地 2.0.4 未包含但上游存在的插件/包清单

1. **dsh-plugin-desktop-beta**（2.0.6-beta.1）——全新 beta 通道包（2.0.5-beta.1 起）。
2. **dsh-community-fabric**——全新社区互操作标准 RFC 包（纯文档）。
3. **@agents-anywhere/dsh-bridge-next**——Agents Anywhere 桥（vendored tgz，本地无）。
4. **@deepseek-ai/dsh-util-time**——新上游运行时包（本地无）。
5. beta 通道引入的新上游包（本地均无）：`dsh-client-file-upload`、`dsh-http-proxy`、`dsh-session-persistence-jsonl`、`dsh-util-values`。
6. **dshmarket 1.38.1**（本地 1.17.1）。
7. **vendor/dsh-runtime/**（stable 0.1.2-rc.1 + beta 0.1.5-alpha.2 双通道完整运行时快照；本地仅 0.1.2-alpha.1 运行时）。
8. `_deprecated/`（0.1.1-rc.2、0.1.2-alpha.1 历史 patch/测试归档）。
9. 文档资产：docs/architecture、user-guide、plugin-development、plugin-ecosystem、faq、why-desktop、PRIVACY、CODE_OF_CONDUCT、CONTRIBUTING、AGENTS.md、CLAUDE.md、.agents/notes（implemented/proposed）。
10. 上游运行时整体：0.1.2-alpha.1 → 0.1.2-rc.1（稳定通道）。

## 7. 关键结论

- 上游最新稳定版 **v2.0.5**（2026-09-03），master 开发版 **2.0.6-dev**；本地 2.0.4 落后 1 个稳定版，master 领先本地 176 提交。
- 仓库已由 deepseek-harness-desktop 改名 dsh-desktop（重定向保留）；社区项目、非官方、MIT、24.8k star。
- 质量最高的包：dsh-plugin-desktop 与 dsh-plugin-desktop-beta（测试行≈源码行、双语厚文档、日更），其次 dsh-community-market（263 测试+SECURITY.md，但 private 且文档表述滞后）；dsh-community-fabric 为纯文档 RFC（按设计无代码）。
- 主要风险：恢复/启动路径类崩溃高频（依赖剪枝、端口冲突、内核包被第三方插件操作清空）、上游破坏性更新一个月 4 次导致插件适配滞后、master 出现 revert 波动。
