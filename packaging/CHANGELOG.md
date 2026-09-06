# CHANGELOG

本文件记录 LUTE 集成打包的版本历史（独立语义版本；DSH 基线 2.0.4）。

## [1.1.0]（2026-09-04）

R2b 架构落地：**拖 app 即用（首启兜底）+ 安装器权威升级**。方案见 `SOLUTION.md`。

- 内嵌 `Resources/dsh-profile`：由 assemble 同源流水线注入（与 `profile.tar.gz` 同一份内容两个落位），首启 ditto 自动落位；新增主进程补丁 **P0-7**（main.js 首启 hook）把 `cordis.patch.yml` 的 `__DSH_HOME__` 按真实 home 替换。
- 补丁锚点 23→**31**：新增 P0-7 + chatui 界面修复（加载更早/按钮门/recall 回填 3 条）+ skill 中文标题（3 条）+ 剪贴板 execCommand 兜底（1 条）。修复 dev 机 noema `status-route` 漂移。
- 完整性硬断言：载荷新增 `completeness.json`（全部 bundle/vendor/skills/presets 权威清单），冒烟逐一比对存在性；新增「内嵌 ≡ 安装后 profile」双落位一致性断言。
- 安装器逻辑不变（1.0.0 已三验资产复用）。

## [1.0.0]（2026-09-01）

首个可安装包 `DSH-Desktop-LUTE-1.0.0-mac-arm64.dmg`（约 480M）。

- 形态：dmg + `LUTE Setup.app`（swiftc GUI 安装器，流式日志 + TCC 引导）+ `install.sh`（命令行等价）。
- 离线全量：已补丁 app（官方更新通道禁用、CFBundleVersion=2.0.4-lute.1.0.0、adhoc 深签名）+ profile（离线 node_modules + 包内自洽 vendor + overrides + `__DSH_HOME__` 占位）+ 技能/预设 + 灵枢便携运行时（python-build-standalone 3.14.7 + aeis 0.5.0，免 Python）。
- 安装语义：幂等 + 回滚 + 升级保留 data/ 与自装技能；提权仅限写 /Applications 一步。
- 验证：隔离冒烟 26 项断言（含 23 补丁锚点 + 11 品牌锚点 + noema arm64 二进制 + 解包后签名有效）全部通过；**从 dmg 只读卷真实安装路径验证通过**。
- 变更：`dsh-patches/verify-patches.sh` 与 `brand-replay.sh` 路径参数化（`DSH_APP`/`DSH_HOME`/`LING_SRC`），dev 机默认行为不变。
- 剥离：暂存 app 中移除半成品内嵌 `Resources/dsh-profile`（见 PLAN.md §11）。

---

## [Unreleased] — dev 机功能更新（2026-09-05）

> 以下为 dev 机实时状态；下次打包时并入 1.2.0 版本。

### 新增：dsh-file-upload → Codex 风格三 Tab 附件面板（v0.2.0-local）

- **修复**：jsx 第三参数 bug（图标传入 `key` 而非 `children`），回形针图标恢复可见
- **升级**：单一上传按钮 → AttachButton + AttachPanel 三 Tab（文件/文件夹 · 技能 · 应用）
- **文件 Tab**：工作区目录树导航，点击插入 `@相对路径`，底部支持上传新文件（12MB 单文件上限）
- **技能 Tab**：列举 `~/.dsh/skills/`（213 个），搜索过滤，点选插入 `/技能名称`
- **应用 Tab**：预置 LoopX 长周期目标 / Web 搜索 / 代码审查快捷入口
- **Host 新路由**：`/__dsh-attach-list` · `/__dsh-skills-list` · `/__dsh-loopx-start`（与 `/__dsh-file-upload` 共存）
- **已验证**：三 Tab 功能正常；回形针图标可见；host 路由全部响应

### 新增：dsh-loopx-plugin v0.1.1-beta.4（官方插件，首次接入）

- profile `dependencies` + `dsh.profile.bundles` 接入（只写包名一次）
- loopx CLI 已自动安装到 `~/.agents/runtime/dsh-loopx-plugin/`（pip --target 隔离，Python 3.14.7）
- GoalBar 注册在 `conversation.input.dock`（session 级），首次 `/loopx` 调用后出现在 composer 下方
- loopx skills（loopx-project / loopx-pr-program / loopx-pr-review / loopx-doc-registry / loopx-self-repair）已在技能目录可用

### 经验教训（避免白屏）

- **bundles 子入口规则**：有 `dsh.bundle.patch`（指向 cordis.patch.yml）的插件，bundles 只写包名一次；插件自身 cordis.patch.yml 的 `insert` 条目由 desktop composition 层自动处理，**手动追加子入口（如 `/init-command`、`/driver`）会触发白屏**。
