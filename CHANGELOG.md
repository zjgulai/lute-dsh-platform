# Changelog

本项目遵循语义化版本，版本号 = git tag = 打包版本（1.x 序列；历史 v0.1.0 视为早期实验）。

## [Unreleased] - 2026-09-13（HMR 生产守卫：白屏机制修复 + 可观测性）

决策留痕：[ADR-0065](docs/adr/ADR-0065.md) · Note [2026-09-13-hmr-production-guard](docs/notes/implemented/architecture/2026-09-13-hmr-production-guard.md)。

- **白屏根因修复（G1）**：`dsh-client-hmr` host 侧加生产守卫——非 dev 模式（`process.defaultApp !== true` 且无 `DSH_DEV=1`）下 poll 到 bundle 变化只更新 watch 基线、不 re-hash、不推 rebuilt 帧。
  根因：运行中替换 `/Applications` app bundle → 宿主推 rebuilt 帧 → 生产 renderer 无 dev:web runtime 热更崩溃 → 整窗白屏（`Cmd+R` 可恢复）。
- **可观测性（G2）**：`electron-runtime-*.js` 恢复 `console-message` 转发（兼容新旧 Electron 事件签名），renderer 报错进宿主日志，不再静默。
- **流程预防**：`installer/install.sh` 新增 0b 步骤——替换 `/Applications` 前退出运行实例（15s 超时中止）；SOP 同步补检查项/红线/异常表/白屏三问。
- **打包基线**：新幂等脚本 `dsh-patches/runtime-guards/apply-fixes.sh` 接入 `assemble.sh` 强制重放、随包分发 `tools/runtime-guards/`；`verify-patches-v2.sh` 锚点 36→**38**（G1/G2）。
- 配套：`docs/dsh-desktop-white-screen-playbook.md` 增补案例 3（HMR 白屏）与速查卡 B1/B2 二分；`packaging/README.md`/`INSTALL-CARD.md` 同步至 2.3.x 现状；修复 `~/.dsh/skills/dsh-desktop-diagnostics/SKILL.md` 的 YAML frontmatter。

## [2.3.1] - 2026-09-13

- 2.3.0 的补订版：build `20260913-125353`，清单 `release/2.3.1.sha256`（`source_commit=2534451`，`source_dirty=0`）。

## [2.3.0] - 2026-09-13

- **固定证书签名**（ADR-0063）：签名身份从 adhoc 改为自签 `LUTE Code Signing`，TCC 授权按证书 leaf 延续——「升级一次、重授一次」的终点；换签后首次升级需一次性重授（详见 SOP §5.5）。
- build `20260913-123942`，清单 `release/2.3.0.sha256`（`source_commit=2171218`，`source_dirty=0`）。

## [2.2.0] - 2026-09-12（出货面最小闭环 + 输入框下方能力导引）

决策留痕：[ADR-0056](docs/adr/ADR-0056.md) · Note [2026-09-12-shipping-surface](docs/notes/implemented/architecture/2026-09-12-shipping-surface.md)、
[2026-09-12-packaging-surface-hardening](docs/notes/implemented/architecture/2026-09-12-packaging-surface-hardening.md)。

### 出货面（打包 / 安装 / 门禁）
- **跨项目依赖移出产品面**：`dsh-kol-hunter-local` 从 profile 依赖与 bundles 移除（ADR-0033「本仓库不吞并产品代码」）。
  出货 profile 里的 `/Users/lute/project/KOL-Hunter` 绝对路径随之消失（该路径此前三处失守：vendor 抽取、`rewrite-file-deps` 前缀、`--check` 存在性判据）。
- **RootOutlet 白屏兜底进打包面（P0-9）**：该守卫原先只存在于开发机 `/Applications` 的 app 上，源码构建路径（`BASE=source`）发的是 pristine（`throw`）——**客户机的白屏兜底一直是缺的**。
  本次固化为 NM 补丁 + 锚点登记，`verify-patches-v2` 锚点 35→36。
- **技能交付面 1611 → 539**：只随包「被 preset / 仓库映射引用」的技能，并剔除受限许可（PolyForm Noncommercial）。
  选择在打包时现算（`scripts/select-skills.mjs`），不存第二份清单（ADR-0009）。
- **内部取证材料不随包**：`dsh-patches/` 整体退出出货 profile，只留校验 / 品牌 / 重写工具（决策 K10）。
- **机器路径守卫**：新增 `packaging/scripts/scan-machine-paths.mjs` + 只减不增基线，出货面出现新的构建机绝对路径即中止。
- **校验面修正**：冒烟断言改为布局无关（归组后的嵌套 vendor 对正确产物不再假红）；新增 `staging-freshness`（陈旧产物即红）；
  补丁锚点校验扩到打包面（`staging/*/app`）；安装器三处校验改为「收集失败 + 非零退出」（不再被 `|| true` 吞掉）；
  DMG 构建互斥锁移出 `release/`；升级前清点并保留自装插件清单；v1 校验脚本退役、不随包。

### 产品面
- **输入框下方能力导引**：移除输入框上方两胶囊；下方以横向列展示所选岗位的能力层级（列＝业务技能组，卡＝供给，边界如实标注）。
  数据由宿主路由现读现投影（ADR-0053），点击卡片经官方 `conversation.input.shell(id).actions.setDraft` 预填。

### 门禁
- `pnpm run gate` 17/17、`pnpm run gate:full` 22/22（新增 `profile-bundle-sync`、`patch-anchors` 的打包面目标、`staging-freshness`）。

### 交付形态
- **本版起只发 DMG**：`release/2.2.0/` 只有 `DSH-Desktop-LUTE-2.2.0-mac-arm64.dmg`（610 MB，
  SHA256 `e74fb6d0…`）+ `SHA256SUMS` + `VERSION` + `manifest.json`，**无 `.pkg`**。
  流水线、README 与灰度 SOP 里「pkg 为主交付」的说法已同步作废（细节见 [packaging/CHANGELOG.md](packaging/CHANGELOG.md)）。

### 已知缺口
- 载荷内含一处**未入库**的 `launcher.ts` 诊断探针（另一会话在飞），本 tag 里没有它；
  闭合需该改动定版后重跑装配并重打 tag。细节见 [packaging/CHANGELOG.md](packaging/CHANGELOG.md) 的「已知缺口」。

## [2.0.0] - 2026-09-10（DSH 基座 2.0.4→2.0.5 / runtime 0.1.2-rc.1 大版本迁移）

### 基座迁移
- 35 补丁全量重锚（verify-patches-v2 35 锚点 ALL VERIFIED）+ 品牌重放 ALL VERIFIED（含 Electron Helper 重命名回归修复）
- 30 bundles rc 化：6 生态插件最新版 + 16 本地 + 8 无依赖升级（pocket/im/modlens/modsearch/git-graph）
- P0-7v2/v2c 首启兜底 + setup-wizard 免向导（含发货级卡死修复：全新用户环境首启 healthy）
- dsh-overseas-skills files 清单修复（PR #1，全新安装整树失败）

### 打包与发布
- 流水线全套适配 2.0.5（assemble/brand-replay/smoke/rewrite/install，dmg+pkg 双格式 + SHA256 校验清单 + 构建竞态锁）
- 验证：smoke 37/37、打包产物真实启动 healthy、升级场景端到端（数据保留）

### 文档与研究
- docs/research/01-10 全链（基座盘点/上游侦察/差距分析/升级方案/验证矩阵/rc-eval 手册/补丁登记/复盘/四维审计/债务方案）
- ADR-0005（rc.1 迁移立项）/ ADR-0006（上游跟进策略）/ 灰度发布 SOP

## [1.2.2] - 2026-09-09（request extension 修复 + 品牌 app 图标）

### 修复（客户真机报障）
- **P0-8 补丁**：dsh-llm-pi-ai 的 pi-ai lazy import 改从 app.asar.unpacked 磁盘加载，
  绕开 asar 内 ESM 动态 import 缺陷（「DeepSeek request extension preparation failed」）
- **品牌 app 图标**：icon.icns 替换为 lute-brand-icons 生成引擎产出（程序员爸爸
  方形徽章）；brand-replay 新增 icns 锚点，verify-patches 锚点 31→32

## [1.2.1] - 2026-09-08（面板 UX 修复 + 双格式交付）

### 万物互联（dsh-wanzh-hulian）
- 知识库选择面板：top:32px 对齐顶栏（原被遮挡）；点击面板外自动关闭；关闭按钮点击区加大（30×28 触控友好）

### 打包
- dmg + pkg 双格式交付（pkg 双击向导面向无终端客户）

## [1.2.0] - 2026-09-08（测试闭环 + 业务侧更新）

### 测试闭环修复（发版前质量门：/代码评审 + /Bug 诊断）
- **P1 输入框打字抖动回归**：dsh-my-quotes 移除 `MutationObserver(document.body)` 反馈回路，改持久 `setInterval(2s)` 兜底
- **P2 CSS 属性化**：dsh-overseas-skills 85 处 + dsh-wanzh-hulian 39 处后代选择器 → `[data-plugin]` scoping
- **P3 临时文件治理**：.gitignore 排除 `*.bak-*` / `*.pre-*` / `dsh-team-hub/`，移除已追踪 `.bak-cn-slash`
- **P4 Spec 正确性**：readMcpServers 对称合并（保留非默认 id 自定义 MCP）；templates.js 缓存加 `kind` 字段

### 业务侧
- dsh-wanzh-hulian：新增 business-meta.js（MCP 卡片业务化）；ensureShopifySkill 模板
- dsh-overseas-skills：catalog / manifest / scripts 更新

### 打包
- assemble.sh 修复 profile.tar.gz `.DS_Store` 双落位不一致；dmg 1.2.0（661M，冒烟 33 项全绿 + 31 补丁锚点）

## [1.0.0] - 2026-09-06（基线发布）

首个基线版本：把 DSH 二次开发工作台整理为 monorepo 并首次发布。

### 出海技能体系
- 81-Skills 全量 81 技能接入（含 4 个加密技能明文补齐）；25 组 230 行卡片墙；LUTE 品牌图标；中文斜杠命令（6 处补丁）
- 技能卡片结构化引导：L1 人工 30 模板 + L2 自动解析 + L3 兜底（卡片墙 + 斜杠双入口）
- AI全栈技能 29 个（mattpocock 汉化稳定集）；AnySearch 接入；业务验收 Run 02 通过
- momcozy Product Schema（M9 真实数据采集 + 校验）

### 万物互联（dsh-wanzh-hulian）
- 设置页四板块（MCP/API/企业应用/知识库）；得到大脑连接 19 工具（含分类整理 12 个 + 真移动语义）
- 分类整理执行：第一阶段 132 条归档 + 第三阶段存量优化（0 失败）
- 知识库选择器（左栏入口 + 右停靠面板 v4；选库不选笔记契约）
- P2 OAuth/CLI 登录态通道；P3 MCP 板块基建（宿主直挂内置 dsh-mcp-client）
- P4 Shopify 连接（配置化 connections.json + 通用连接卡渲染器；安全审查通过，待凭证冒烟）

### 工程
- 指令审计 F1-F10；管线 8 阶段；preset 15 个 respectFileFlags

## [1.1.0] - 2026-09-07（功能扩展）

### 「我说」跨会话检索（dsh-my-quotes 插件）
- 侧边栏「我说」入口：聚合全部 DSH 会话中用户 ≥30 字消息，规则 9 类意图分类（可选 LLM 精分）
- 搜索 / 项目筛选 / 跳转原会话 / 复制全文 / 手动改类 / 重建索引；索引为派生品可重建
- 会话日志 zstd 拼接帧解码（复用官方 persistence 语义）；profile 插件注册走 package.json bundles（非 cordis.yml）

### 品牌资产
- lute-brand-icons 技能 + 57 枚方形徽章头像库（24 职业 + 12 家庭 + 14 通用 + 补充；参数化生成引擎 + manifest + 暗/浅总览）
- Agent 预设卡片头像：类人漫画（爸爸/妈妈/宝宝），品牌绿 #58B848 细描边方形徽章、头部占比 80-85%、暗/浅双主题适配

### UI 调整
- Session 日志按钮改名「log」并迁至侧边栏设置按钮同行右侧（克隆式 DOM 迁移 + 自愈）

### 文档
- patches-manifest 补齐：P0 7/7、UI/UX 统一、Agent Preset 品牌化、lute-brand-icons、我说、Session 日志迁移
- 新增 docs/dsh-desktop-white-screen-playbook.md 白屏排查手册
