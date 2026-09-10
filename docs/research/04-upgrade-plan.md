# DSH 基座增量更新与迭代方案（LUTE 2.0.0 · rc.1 迁移）

> 版本：v1.0 · 2026-09-10 · 状态：**已与用户逐项讨论定稿（12 项决策）**
> 上游基线：anywhere-labs/dsh-desktop v2.0.5（稳定）/ master 2.0.6-dev（观察中）
> 运行时代码：deepseek-harness 0.1.2-rc.1
> 配套报告：`01-current-base-inventory.md`（本地盘点）/ `02-upstream-dsh-desktop-dive.md`（上游侦察）/ `03-base-gap-analysis.md`（差距分析）/ `05-rc-compat-matrix.md`（验证矩阵）/ `06-rc-eval-environment.md`（D 轨道手册）

---

## 1. 决策记录（Noema 已存 3 条，此处为权威单页版）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 升级主路径 | **B 整体升级到 2.0.5 + rc.1**，但以 D 平行轨道先行验证、成熟后切换 |
| D2 | rc 迁移立项 | 独立大版本 **2.0.0**，先建 D 轨道再正式立项 |
| D3 | 无依赖插件 | 已立即升级 5 个（pocket 2.10.3 / im 4.18.0 / modlens 3.26.1 / modsearch 5.10.2 / git-graph 0.3.19），备份 `package.json.bak-pre-freeupgrade-20260909`，重启由用户择机 |
| D4 | 6 ⛔ 插件 | D 轨道直接装最新版验证，成熟一个升一个（context 0.47.0 / better-sidebar 0.18.1 / genui 0.9.9 / vision-router 2.1.4 / dshmarket 1.45.1 / noema 0.1.0-rc.3） |
| D5 | D 轨道隔离 | 完全隔离：官方 DMG 解包改名安装（`~/Applications/DSH Desktop RC.app`）+ `DSH_HOME=~/.dsh-rc-eval` + userData 补丁 |
| D6 | rc-eval 首启 | agent 自动验证（已完成：healthy，0 error） |
| D7 | 旧数据验证源 | 生产 sessions/storages 本地副本（不进仓库） |
| D8 | P0-6 处置 | rc.1 上回移 master `local-window-policy.ts`（35 行中心化 deny） |
| D9 | 2.0.0 范围 | **一次到位**：基座迁移+全量重锚+打包流水线+客户迁移安装器同版交付 |
| D10 | 发布策略 | 客户灰度名单（1-2 个老客户一周）→ 全量 |
| D11 | 补丁处置矩阵 | 按「保留重推 / 语义重推 / 换上游实现 / 不动」四类（见 §4） |
| D12 | 打包基线 | CFBundleVersion 后缀规则延续 `2.0.5-lute.<ver>`，ShortVersionString 对齐 2.0.5 |

## 2. 现状基线（冻结态，2.0.4 + alpha.1）

- 宿主 dsh-plugin-desktop 2.0.4 + @deepseek-ai/dsh-* 0.1.2-alpha.1（129 包）+ cordis 4.0.1；35 文件直补 / 32 锚点 / 25 平台包；profile 30 bundles（16 file: + 14 npm）。
- 生产已交付 lute 1.2.2（pkg+dmg）；打包流水线 assemble.sh → sign → smoke（L1-L4）。

## 3. 迁移目标与风险门禁

**目标态**：dsh-plugin-desktop 2.0.5（或迁移启动时已稳定的 2.0.6）+ 运行时 0.1.2-rc.1 + 30 bundles rc 化 + 全部补丁重锚 + 新打包流水线 + 客户升级安装器。

**门禁（全部满足才允许发灰度）**：
1. D 轨道 rc-compat-matrix 全部插件 5 项验证通过或降级有记录；
2. 上游 #858（2.0.5 全新安装不可用）等 7 项高危 issue 逐项评估：受影响项必须有本地缓解或确认不触发（LUTE 安装器是自定义流程，需在 D 轨道复现验证）；
3. 旧数据（生产副本）可读验证通过（会话 V2→V3 迁移代码实测覆盖 LUTE 数据形状）；
4. L1-L4 冒烟矩阵全绿（含 32+ 锚点重锚后的新锚点集）；
5. 生产 5 插件升级在 2.0.4 上稳定运行 ≥ 3 天（兼容性对照基线）。

## 4. 补丁处置矩阵（35 文件/32 锚点 → rc.1）

| 类 | 补丁 | 动作 |
|---|---|---|
| 保留·重推锚点 | P0-1、P0-2、P0-3（rc.1 新行号 llm/src:660）、P0-4（tool-subagent/src:675）、P0-7、UI-3、UI-4、PR-1/2/5、LB-1~3、chatui×3、skill-title×3、clipboard×1、品牌×11、apply-patches.mjs | 按 patches-manifest v2 重放 + 锚点验证门（count==1） |
| 语义重推 | P0-8（rc.1 的 pi-ai 集成已重构：lazy import 消失，pi-ai ^0.84.2；需在 rc.1 上重验 asar 动态 import 缺陷是否复发，复发则按新结构重推） | D 轨道专项验证 → 定稿 |
| 换上游实现 | P0-6 → 回移 master local-window-policy.ts；P0-2 若 master 已加日志则同步 | D 轨道对比后定 |
| 不动 | P0-5（第三方 noema，独立维护） | 保留 |
| 必踩坑 | **预设平面直补**（12 个 agent-presets 的 cordis.yml 引用的预设平面包在 rc.1 上必须重做 checkout 直补，profile override 对预设平面失效）；**cordis 层 2 处直补**（cordis 4.0.2 / cordis-plugin-loader 1.0.3 上重推） | 写进 SOP |

## 5. D 轨道建设（已完成部分）

- ✅ 官方 DMG（CN 镜像）下载 283MB；`~/Applications/DSH Desktop RC.app` 安装（2.0.5 / rc.1 核实）。
- ✅ **隔离补丁**：RC `lib/main.js` 在 `requestSingleInstanceLock` 前注入 `app.setPath("userData", DSH_HOME + "/.electron-userdata")`——否则与生产 app 共享 userData 被单实例锁静默击杀（实证：两次静默退出）。备份 `main.js.rc-eval-orig`。
- ✅ rc-eval profile：6 个 ⛔ 插件最新版 + 官方双 bundle；**关键工程发现**：rc 生态包的 peer 范围（`>=0.1.2 <0.2.0-0` 等无 prerelease 后缀版本）在 npm 上不可解析（0.1.2-stable 从未发布），必须 `pnpm-workspace.yaml: autoInstallPeers: false`（与生产 profile 同款），运行时从 app 内置 node_modules 解析。
- ✅ 首启：setup-wizard 被跳过（`profile-setup/<hash>/state.json` outcome=skipped），`startup.run.completed / finalStage=health-commit / rendererStatus=healthy`，日志 0 error；noema 15 工具挂载 + Rust server 启动；vision-router 2.1.4 挂载并渲染引导弹窗；主 UI 正常渲染。
- ⏳ 剩余：6 插件 5 项验证矩阵补齐（②RPC ③slot ④读写 ⑤旧数据）、16 个本地 file: 插件逐个人场、#858 等风险复现实验。

## 6. 2.0.0 工作分解（WBS）与时间线

| 阶段 | 内容 | 交付物 | 依赖 |
|---|---|---|---|
| P0 | D 轨道全量验证 + 上游风险复现 | rc-compat-matrix.md 全绿 + issue 评估表 | D5 完成 |
| P1 | 2.0.5 staging + 补丁全量重锚（§4）+ 预设平面直补 + 品牌回放 | patches-manifest v2 + 新锚点集 | P0 门禁 1-2 |
| P2 | 30 bundles rc 化（6 ⛔ 换新版、16 自研移植、8 已升） | profile package.json rc 版 + 冒烟 | P1 |
| P3 | assemble.sh 源换 2.0.5 DMG + vendor/overrides 适配 + completeness.json | 2.0.0 payload | P2 |
| P4 | 安装器 1.2.2→2.0.0 升级路径（数据迁移/回滚/TCC 引导） | 升级安装器 + 安装卡 | P3 |
| P5 | L1-L4 冒烟 + 灰度名单 + Release | DSH-Desktop-LUTE-2.0.0 pkg/dmg + SHA256SUMS | P4 |

**时间线**：第 1 周 P0 收尾（本会话已交付环境与首启）；第 2-3 周 P1+P3（含 ADR-0005 立项：DSH 基线字段 2.0.4→2.0.5、版本策略、回滚预案）；第 4 周 P4+P5 灰度；灰度 1 周后全量。

## 7. 关键工程发现清单（迁移 SOP 必录）

1. **autoInstallPeers: false 是 rc 生态的安装前提**（否则 npm 解析必失败，实证）。
2. **单实例锁 userData 隔离**：双开基座必须给 RC 副本打 userData 补丁（已沉淀为 rc-eval 补丁）。
3. **setup-wizard 状态文件**：`<userData>/profile-setup/<sha256(profileDir)>/state.json`，outcome=skipped 可绕过向导。
4. **版本 skew 事实**：vision-router 2.1.4 的 peer 追 0.1.3-alpha.2（超前 rc.1 一代）；noema 0.1.0-rc.3 追 0.1.0-rc.6 旧线——两者在 rc.1 基座上属「跨代共存」，需专项验证（D 轨道已纳入）。
5. **Electron 43.3.0 不变**：TCC/codesign/安装器行为与 2.0.4 同构，客户迁移成本不因基座升级增加。
6. **上游未修 LUTE 的关键缺陷**（P0-1/2/3/4 在 rc.1 上全部仍在）——升级不减少补丁总量，只改变锚点。

## 8. 回滚路径

- 生产 2.0.4 保持不动直至灰度通过；rc-eval 独立可重置（删 `~/.dsh-rc-eval` + RC app 副本即还原）。
- 2.0.0 灰度失败：客户回滚到 1.2.2 安装包（数据目录已按安装器备份语义保留）。
- 补丁重推失败：per-patch `.orig` 保留 + verify-patches 锚点门（沿用现有纪律）。
