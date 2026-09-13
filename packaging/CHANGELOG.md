# CHANGELOG

## [Unreleased]（2026-09-13 · 发布前门禁的射程与三态读数）

- **`patch-anchors` 的射程从「环境」改成「待发布」**（ADR-0075）：本项原先把
  `packaging/staging/` 下**所有** app 树都算进扫描集，而锚点清单**单调增长**、历史产物**累积**，
  两条各自正确的规则相乘 ⇒ 任何在「某条锚」出现之前装配的树**永久**判红，且这条红与
  「本次装配丢了补丁」在输出上不可区分（同一条教训 `verify-patches-v2.sh` 头部已写过一次：
  35 条 MISSING 与真漂移不可区分）。改为 `scripts/gates/patch-anchor-scope.mjs`（纯函数 +
  7 个反向用例）：射程 = 本机 `/Applications` ∪ **未打 tag** 的 staging 树；已打 tag 的版本
  由产物负责（ADR-0067），不由发布前门禁度量。判据取 tag 而非「有无入库清单」是刻意的——
  后者会在**同号重制**时把新树静默排除（最贵的失效方向）。
- **门禁读数分三态 `ok` / `skip` / `fail`，`note` 必须渲染**：`main()` 原先把 `note` 丢掉，
  于是「跳过」与「校验通过」在输出上完全同形——几处 check 的注释写着「环境不存在时跳过，
  不假绿也不假红」，而输出里两者都是 `ok contract <名字>`。模型里有这个区分、读数里没有，
  等于没有（P-02）。`skip` 不计入通过数，摘要写作 `ok 41/42 项通过（mode=full，跳过 N）`；
  `theme-tokens` 与 `worktable-fence` 的环境缺失路径接到同一状态上。
- **不删除任何 staging 树**：射程判据让历史树自动退出扫描，删目录是这条路的**结果**而不是**手段**。
  2026-09-13 的教训正好同源——2.3.1 曾被「Spotlight 全盘查不到」误宣告永久丢失
  （18:06 从飞书落地目录找回，哈希逐位相同），而找回之前 `staging/2.3.1/payload` 是本机
  唯一残存的字节痕迹：「清掉陈旧 staging」这条压力正好指向它。
- 新增门禁 `patch-anchors-scope-selftest`（含「无条件纳入」与「空射程恒置 false」两种恒真桩突变）；
  复发故障总账加 P-11「判据的射程没有定义」，P-02 的机制清单同步补上。

## [Unreleased]（2026-09-13 · 出货面边界：预设白名单 + 载荷路径改写 + 产品级技能白名单）

- **预设出货面改白名单**（ADR-0073）：`assemble.sh` §0 原先是整目录 `cp -R ~/.dsh/.agent-presets/.`，
  于是「谁在打包机上新建一个预设，它就随下一版出给客户」是一条静默路径——实测本机自有的机器人
  助理智能体预设 `bobo-cto` 自 2.3.0 起进了每版 payload（出货 `completeness.json` 的 presets = 52 条含它）。
  改为 `scripts/select-presets.mjs` + `shipped-presets.json`：岗位按 `pattern` 准入且数量必须相符，
  其余目录只有 `allow`（该发）/ `exclude`（已评审不发）两种合法状态，**两档都没登记即中止并点名**。
- **技能出货面补产品级白名单**（ADR-0074）：排除 `bobo-cto` 后它**唯一**引用的 15 个工程技能一并掉出
  （349 → 334），而同族的工程工艺技能本来就在出货面里——产品拿到的是「一半工艺层」，分界线取决于
  打包机当时的引用图。改为 `(被引用 ∪ 白名单) − 受限许可`，新增 `shipped-skills.json`（15 条，每条带 `why`）；
  白名单缺文件即中止（按空名单继续 = 15 个技能无声少发）；`--check` 升为「落位树逐名等于选择结果」。
  出货技能数回到 **349**。
- **出货副本的构建机路径改占位符**（ADR-0073）：`scripts/rewrite-build-paths.mjs` 按写了含义的映射表
  最长前缀优先改写，未覆盖形态响亮失败；**本机 `~/.dsh` 原件不动**。同一版出货的 tarball 里
  114 个含 `/Users/lute` 的文本文件 → 0。
- **守卫学会看打包后的载荷**（ADR-0073）：`scan-machine-paths.mjs --tarball` 解包后用同一把尺扫。
  盲点代价实测：内嵌 profile 报 `✓ 无新增` 的同时，同一版出货 `skills-presets.tar.gz` 里是
  103 个含构建机路径的文件（tarball 是二进制，`grep` 一律跳过）。
- 新增反向自测并进门禁：`shipped-presets-scope-selftest`、`build-path-rewrite-selftest`、
  `machine-path-tarball-selftest`、`shipped-skills-scope-selftest`（各含恒真桩突变与符号链接沙箱用例）。

## [Unreleased]（2026-09-13 · HMR 生产守卫）

- **G1 HMR 生产守卫**：`dsh-client-hmr/lib/index.js` 非 dev 模式不 re-hash、不推 rebuilt 帧（运行中替换 app bundle 白屏的机制修复）；幂等脚本 `dsh-patches/runtime-guards/apply-fixes.sh`，接入 `assemble.sh` 强制重放、随包 `tools/runtime-guards/`。
- **G2 console 转发**：`electron-runtime-*.js` 订阅 `console-message`（兼容新旧 Electron 事件签名）。
- **安装器退出实例**：`installer/install.sh` 0b 步骤——替换 `/Applications` 前退出运行实例（15s 超时中止）。
- `verify-patches-v2.sh` 锚点 36→38；默认 `STAGE_VERSION` 2.1.0→2.3.1。
- **出货归属（2026-09-13 补写，此前无家）**：随包出货的锚点尺子**逐版不同**——
  2.2.0 / 2.3.0 / 2.3.1 的载荷内是 **36 锚点、无 G1/G2**，2.3.2 / 2.3.3 是 **38 锚点、有 G1/G2**。
  即 **G1/G2 首见于 2.3.2**；2.2.0 与 2.3.0 的 DMG 内 app 确实不含守卫（其守卫文件 mtime
  早于各自 DMG 的构建时刻），2.3.1 的入库清单记的 build `12:53:55` 亦早于守卫提交
  `254e7f8`（14:41:50）。判据：各版 `staging/<v>/payload/tools/verify-patches-v2.sh` 的
  `ck` 行数与其 mtime。
- 决策：ADR-0065。

## [2.2.0]（2026-09-12）

### 交付形态：DMG 单一格式

- **`.pkg` 退出交付面**：`assemble.sh` → `sign-and-dmg.sh` 只产 DMG，`release/2.2.0/` 里只有
  `.dmg` + `SHA256SUMS` + `VERSION` + `manifest.json`。`scripts/build-pkg.sh` 与
  `pkg-postinstall.sh` 仍留在树里但**无人调用**（历史 1.x 交付路径）；`PKG-SHA256SUMS` 同此。
- 产物：`DSH-Desktop-LUTE-2.2.0-mac-arm64.dmg` 610 MB，
  SHA256 `e74fb6d045fa33cc6174369b06408ed5be59dcdbe4ca22af279b6b6aff4ac86e`；
  DMG 载荷内 app 的 `codesign --verify --deep --strict` 与挂载终验均通过。

### 流水线硬化（本轮 5 次装配才绿——5 条红全部是流水线自身缺陷，不是产物）

- **打包源快照**：装配一动工即对打包源做 APFS clone 快照，全程读快照。此前并发会话改 live profile
  会让同一个载荷自相矛盾（内嵌副本与 `profile.tar.gz` 取自不同时刻）——「同源」从检查项变成构造保证。
- **出货投影**：结构判据剥离本机装配（重写后本仓库的包一律 `file:./vendor/`，其余 `file:` 即外部产品），
  跨项目依赖 `dsh-kol-hunter-local` 随之消失（ADR-0033）。
- **机器路径守卫**：`scripts/scan-machine-paths.mjs` + 只减不增基线，出货面出现新的构建机绝对路径即中止。
- **技能交付面 1611 → 539**：`scripts/select-skills.mjs` 打包时现算，不存第二份清单（ADR-0009）。
- **内部取证材料不随包**：`dsh-patches/` 整体退出出货 profile（决策 K10）。
- **`completeness.json` 写到 `~/.dsh` 而非 staging**——已修，并加断言。
- **冒烟两处**：`set -u` 下 `BUNDLED` 先用后定义（打断整条冒烟而非报一条红）；
  「vendor 数 -1」的算术在 K10 之后过期。均已修，**39/39 PASSED**。
- **`VERSION` 的 `cat >` 覆盖了追加的快照指纹**——改为建好之后追加并断言。
- **bash 3.2 下 `$VAR（` 会把全角括号吃进变量名**（三处同修）。

### 首启实测

- 拖拽即用路径的内嵌兜底**会真实物化 profile**：空 DSH home 首启 10s 内 profile 出现，P0-7v2 链路可用。
- `scripts/first-launch-test.sh` 把四条判据脚本化。**前置条件**：同机已有实例在跑时必须跳过——
  实测新产物与**已知可用的旧 app** 在同一隔离环境卡在同一阶段（profile-composition），
  卡住的是「同机并存两个实例」，不是产物本身。

### 已知缺口

- 载荷内含一处**未入库**的 `launcher.ts` 诊断探针（并发会话在飞），tag 里没有它。
  闭合需该改动定版后重跑装配并重打 tag。

完整故事见根 [CHANGELOG.md](../CHANGELOG.md) 的 `[2.2.0]` 条目，决策留痕见 Note
[2026-09-12-packaging-surface-hardening](../docs/notes/implemented/architecture/2026-09-12-packaging-surface-hardening.md)。

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
