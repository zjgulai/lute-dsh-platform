# CHANGELOG

## [2.0.0]（2026-09-10）

### 基座升级：DSH Desktop 2.0.4 → 2.0.5（runtime 0.1.2-alpha.1 → 0.1.2-rc.1）

- **P0-P4 全链交付**：D 轨道验证（24 bundles 0 error）→ 35 补丁全量重锚（verify-patches-v2 34 锚点）→ 30 bundles rc 化 → 打包流水线适配 → 安装器适配
- **新增**：setup-wizard 首启免向导（install.sh 预写 skip 状态，700 权限）；P0-7v2 首启内嵌兜底（2.0.5 无 ditto，全新设计）；Helper 重命名修复（品牌改名后 Electron "Unable to find helper app" 回归）
- **修复**：dsh-overseas-skills files 清单缺 templates.js（PR #1，全新安装整树失败）；brand-replay.sh 动态文件名 + 花括号 + Helper 步骤；rc 生态安装前提 autoInstallPeers:false
- **产物**：dmg 685M + pkg 683M（arm64），CFBundleVersion 2.0.5-lute.2.0.0；冒烟 37/37 + 打包产物真实启动 healthy + 升级场景端到端验证



本文件记录 LUTE 集成打包的版本历史（独立语义版本；DSH 基线 2.0.5）。

## [1.2.2]（2026-09-09）

### 客户真机报障修复

- **P0-8 补丁**（assemble 内联）：`dsh-llm-pi-ai/lib/index.js` 三处 pi-ai lazy 静态
  import 改 `await import(process.resourcesPath + unpacked 绝对路径)`——客户机器
  「DeepSeek request extension preparation failed」根因是 Electron asar 内 ESM 动态
  import 缺陷（lazy.js 从 asar 内加载时找不到相对模块）；改磁盘加载后相对解析落
  unpacked，绕过缺陷。锚点：verify-patches 31→32。
- **品牌 app 图标**：`scripts/build-app-icon.sh`（lute-brand-icons 生成引擎 →
  SVG → sips 1024 PNG → iconutil icns）产出 `assets/app-icon.icns`（程序员爸爸
  方形徽章，280K）；assemble 替换 `Resources/icon.icns`；brand-replay 新增
  icon.icns hash 锚点（BRAND_ICON_SHA 可覆盖）。

### 验证

- 冒烟 33 项 PASSED（32 补丁锚点 + icns 品牌锚点 + quarantine 4 断言）
- node-mode 实测补丁路径：openAIResponsesApi 可用（stream/streamSimple ✓）

## [1.2.1]（2026-09-08）

### 万物互联（dsh-wanzh-hulian）面板 UX 修复

- 知识库选择面板 `top:32px` 对齐顶栏（原 top:0 顶部被遮挡）
- 点击面板外自动关闭（mousedown 监听 + closest 排除面板本体/入口）
- 关闭按钮点击区加大（min 30×28 触控友好）；`onMouseDown` 防冒泡立即关闭

### 打包

- **dmg + pkg 双格式交付**（pkg 面向无终端客户：双击 → Installer 图形向导 → 输密码 → 完成）

## [1.2.0]（2026-09-08）

### 测试闭环修复（发版前质量门：/代码评审 + /Bug 诊断）

- **P1 输入框打字抖动（回归修复）**：`dsh-my-quotes` 移除 `MutationObserver(document.body, subtree)` 反馈回路——React 重挂 tab bar 时 observer 回调 `appendChild` 与重协调打架导致抖动；改持久 `setInterval(2s)` 轻量轮询兜底。
- **P2 CSS 属性化（红线）**：`dsh-overseas-skills` 85 处 `.ovsRoot/.ovpRoot` 后代选择器、`dsh-wanzh-hulian` 39 处 `.whRoot` 后代选择器 → `[data-plugin]` scoping，消除裸类名污染风险（同历史 .whRoot 污染）。
- **P3 临时文件治理**：`.gitignore` 排除 `*.bak-*` / `*.pre-*` / `*.orig*` / `dsh-team-hub/`；修复 .gitignore 被 assume-unchanged 压住导致排除段未进 HEAD 的问题。
- **P4 Spec 正确性**：`readMcpServers` 按 id 对称合并（保留非默认 id 的自定义 MCP 条目）；`templates.js` 缓存加 `kind` 字段（contract/l1/l2/l3 不再共享 `{mtime,text}` 形状，消除误命中）。

### 业务侧更新

- **dsh-wanzh-hulian**：新增 `business-meta.js`（MCP 卡片业务化——PixPix/Shopify 工具业务映射 + 静态元数据），`ensureShopifySkill` 模板生成，`package.json` 注册 bundles。
- **dsh-overseas-skills**：catalog / manifest / scripts 清单与图标映射更新。

### 打包加固（客户真机报障后的系统性修复）

- **quarantine 防线**：install.sh 解包后五处自动清除隔离属性（app 免提权/提权脚本、profile、skills/presets、aeis）——根治客户「Operation not permitted」；冒烟新增 quarantine 模拟 + 3 清除断言。
- **防 root 污染**：install.sh 拒绝 sudo 运行 + root 属主残留检测（历史 sudo 安装导致反复回滚的根因）。
- **打包侧断言**：sign-and-dmg 制 dmg 前断言 payload 无 quarantine；profile.tar.gz 归档排除 `.DS_Store`/dev 临时文件（六处统一口径）。
- **构建号**：VERSION/manifest 带 BUILD 唯一标识，防同名多代 dmg 混淆。
- **pkg 交付**（新增）：`build-pkg.sh`（pkgbuild + productbuild）+ `pkg-postinstall.sh`（root 落位 app + 切登录用户装 profile）+ `install.sh` 的 `LUTE_INSTALL_APP=0` pkg 模式 + `INSTALL-CARD.md` 客户安装卡。

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
