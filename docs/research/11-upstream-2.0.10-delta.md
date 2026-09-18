# 上游 2.0.5 → 2.0.10 差异剖析（基座升级决策输入）

> 日期：2026-09-17 · 状态：**调研定稿（只读，未做任何改动）**
> 决策输入对象：基座 v2.0.5（`2.0.5-lute.2.4.1`，运行时 0.1.2-rc.1）是否/如何升级
> 关联：[04-upgrade-plan.md](04-upgrade-plan.md)（2.0.0 迁移 SOP）· [05-rc-compat-matrix.md](05-rc-compat-matrix.md) · ADR-0006（月度观察窗）
> 证据级别标注：**Fact**=一手来源实读；**Inference**=代码推断需 D 轨道实测；**Unknown**=未验证

## 1. 版本链与时间线（Fact，GitHub Releases API）

| Desktop | 发布日 | 运行时 | 关键内容 | 对 LUTE 的意义 |
|---|---|---|---|---|
| v2.0.5（现基座） | 09-03 | 0.1.2-rc.1 | — | 当前 38 锚点补丁的宿主 |
| v2.0.6 / v2.0.8 | — | — | **不存在**（404，版本号跳跃） | — |
| v2.0.7 | 09-10 | **0.1.5-rc.1** | 手机连接（Agents-Anywhere）、数据目录管理、恢复首页入口、窗口/白屏恢复修复 | 运行时大版本跳跃开始 |
| v2.0.9 | 09-10 | 0.1.5-rc.1 | 标题栏远程控制入口、桌面内置插件识别修复、隔离 Host/chrome 架构 | 渲染架构变动 |
| **v2.0.10（最新 stable）** | **09-13** | **0.1.5-rc.2** | **全平台取消 ASAR**、运行时 rc.2、打包后文件系统/技能发现检查 | **破坏性打包变更** |
| （horizon）master | 09-15+ | 0.1.6-alpha.1 | PTC 改名 ptc-runtime、workflow-ptc、agent/created、snapshotEvents 弃用、E2B 移除、Ralph 默认关、浏览器/计算机使用实验特性 | 下一代破坏面，决定 2.0.10 之后还有一波 |

**ADR-0006 观察窗状态**：2.0.10 发布 09-13，两周观察窗截止 **09-27**。今天 09-17 提前 10 天。ADR-0006 明确「非红线选择性回移、红线才跟进」；扫过 2.0.7→2.0.10 release notes 与 09-13 后 issues，**未发现针对 LUTE 补丁面的安全红线**（新内容是能力新增而非 LUTE 已知缺陷的修复）。**今天上生产 = 需要显式豁免 ADR-0006**（用户决策项）。

Release notes 用词自证风险：2.0.10 官方提示「本次使用的 DeepSeek Harness v0.1.5-rc.2 为上游候选发布版本」——最新 stable 桌面内置的是 **rc 运行时**，非稳定运行时。

## 2. 打包结构破坏性变更（Fact，v2.0.10 `dsh-plugin-desktop/package.json`）

- `"asar": false`（mac/win/linux 三平台一致），`mergeASARs: false`，fuses `onlyLoadAppFromAsar: false`、`enableEmbeddedAsarIntegrityValidation: false`。
- 资源从 `Contents/Resources/app.asar(.unpacked)` 变为普通目录 `Contents/Resources/app/`。
- Electron **43.3.0 不变**（peerDependencies 实读）→ TCC、codesign、公证行为同构（04 报告 §7.5 结论仍成立）。
- cordis **4.0.2**、cordis-plugin-loader 1.0.3、schemastery ^3.18.2、全部 `@deepseek-ai/dsh-* 0.1.5-rc.2`、新增 `@agents-anywhere/dsh-bridge-next`、`dsh-client-file-upload`、`dsh-client-ui-sidebar`、`dsh-terminal(-bash)`、`dsh-http-proxy` 等原生能力包。
- 官方分发改为 universal DMG（319MB）；LUTE 自产 mac-arm64 不受影响，但 assemble.sh 的源 DMG 换 universal。

### LUTE 破坏面清单（Fact，仓库内实读）

| 面 | 数量/位置 | 2.0.10 后命运 |
|---|---|---|
| 补丁锚点 | **38 锚**（`dsh-patches/patches-manifest-v2.md`，09-13 ALL VERIFIED） | 宿主壳层锚在内容哈希文件名（`electron-runtime-DLNj0vyk.js`、`main.js`、`profile-manager-SP3bXlwi.js`）→ 2.0.10 构建产物文件名/行号全变，**全部重锚** |
| 运行时层补丁 | P0-3（dsh-llm:1459）、P0-4（tool-subagent:634 等）、P0-8（pi-ai）、P0-9（renderer client.js:886）、cordis-clamp（cordis:183）、loader-B4（loader:98） | 行号锚定；0.1.5-rc.2 与 4.0.2 源码重写，逐条按 04 报告 §4 四类处置矩阵重推 |
| 脚本硬编码路径 | `scripts/dsh-types.mjs`、`scripts/role-presets/{generate,session-refs}.mjs`、`scripts/gates/{brand-icons,theme-tokens}.mjs`、`scripts/gate.mjs:1088,1221,1226`、`scripts/acceptance/*-live.mjs`×5、`scripts/gates/dependency-reproducibility.test.mjs` —— 均含 `app.asar.unpacked` | **路径常量迁移**（应集中为单一常量再翻转，避免 15+ 处散改） |
| profile 侧 | `~/.dsh/profiles/desktop` 40 bundles（16 file: 本地包 + npm 生态包）与本机 `apply-patches.mjs` postinstall | file: vendor 相对路径不受打包影响（memory：此前已 sed 修复）；面向 app 内 node_modules 的解析路径变化由运行时承担，需 D 轨道实测 |
| 预设面 | `scripts/role-presets/generate.mjs` 依赖 app 内 `dsh-agent-presets/presets/standard/agent.cordis.yml` 路径 + `code`→`ptc` 预设改名（0.1.5） | 路径迁移 + 预设名核对（见 §4 #997） |
| 品牌回放 | `brand-replay.sh` 文件名参数化版 + 10 品牌/图标锚 | 目标文件名（含哈希名）全部重参数化；`app.asar.unpacked/build/` → `app/build/` |

## 3. 运行时能力差异 0.1.2-rc.1 → 0.1.5-rc.2（Fact，deepseek-harness Releases）

对 LUTE 有**功能重叠**的新能力（详见 12 号文档矩阵）：

- 原生 **Sidebar 多标签/分栏/预览**（md/code/html/PDF/图片）——与 `dsh-better-sidebar`、`dsh-univer-office` 部分重叠；
- 原生**通用文件上传**（`dsh-client-file-upload`）——与 LUTE `dsh-file-upload-local` **直接重叠**；
- 原生**归档会话列表与恢复**——与 `dsh-rename-conversations` 弱重叠；
- 可继续对话子代理（排队/steer/停止）、动态系统提示词、DeepSeek-V41-Flash 新默认模型、HTTP(S)_PROXY 支持、长会话内存优化。

与 LUTE 补丁相关的上游修复状态（Fact，对照 patches-manifest v2）：

- 上游仍**未修** cordis 索引钳位（cordis-clamp）与 loader EntryGroup 回滚（loader-B4）——04 报告 §7.6 的判断在 0.1.5-rc.2 依然成立，这两条补丁继续保留。
- P0 系列缺陷无上游修复公告 → **升级不减补丁总量，只换锚点**（04 报告结论重申）。

## 4. 已知问题与稳定性信号（Fact，Issues API，截至 09-17）

- **#997（open，macOS，2.0.10+0.1.5-rc.2）**：老版本升级后 `settings.yaml` 遗留 `agent-presets: default: code` → **无法选工作区/创建会话**（`agent-preset/not-found`）。修复 PR #998 **未合并**。**LUTE 客户升级路径必中项**：升级前必须检查并迁移所有客户机的 default preset 引用。
- **#813 家族**（渲染进程内存增长）：#1008/#1009（09-16 合并）只修「看门狗放大成不可恢复白屏」与 Windows 后台绘制问题，**根因内存增长未修**。渲染层仍在活跃修补期。
- 09-13 后 master 有持续 fix 流（#1007~#1009，09-16），说明 2.0.10 发布后仍在高频收口——观察窗逻辑（ADR-0006）正是为此设计。
- 结论：**未见红线级安全修复，也未见平台级致命回归（macOS 侧）**；但有 #997 这个升级路径确定坑 + 渲染层活跃修补期两枚显式风险。

## 5. 更新机制剖析（Fact，`src/update-lifecycle.ts` / `update-checker.ts` / `electron-runtime.ts` / `dsh-product-version.ts` 实读；2.0.10 同文件已比对）

点击「检查更新」（设置页 `desktop-settings-api.ts:343` / 标题栏 `ExtendedTitlebar.tsx`）后的完整链路：

1. `checkNow()` → `checkForDesktopUpdate({currentVersion: dshProductVersion()})`；
2. `dshProductVersion()` 读的是 **`@deepseek-ai/dsh` 运行时包版本**（不是 2.0.5/2.0.10，更不是 `lute.2.4.1`）——**2.0.10 上游该文件逐字未变**；
3. 当前串 `0.1.2-rc.1`（升级后 `0.1.5-rc.2`）在 stable 通道解析（要求无 prerelease）→ **parse 失败 → 返回 null，且发生在发请求之前**（`checkForDesktopUpdate` 第 118-121 行先 parse 后 fetch）；
4. null → 手动检查弹「暂时无法检查更新」警告，后台轮询静默跳过；
5. 即便解析通过且比对出 update-available：下载安装器走 `downloadAndOpenUpdate()`，而 LUTE 基座此处有 **P0-1v2 补丁**（`DSH_DISABLE_UPDATE_INSTALL !== '0'` 即 throw，注释明示「LUTE 打包禁用官方更新通道」）。

**Inference（需 D 轨道点一次按钮实锤）**：当前与 2.0.10 升级后，「检查更新」对 LUTE 都是**哑按钮**（版本串格式闸门 + P0-1v2 执行闸门双重拦截）。**但这道闸门是脆弱的**：上游若把版本源改为插件版本（`2.0.10` 是合法 stable SemVer）或将来内置 stable 运行时，第一个闸门自动失效——届时唯一的拦截就是 P0-1v2，因此**该补丁在 2.0.10 上的重锚是安全底线，不是可选项**。

版本检查端点：`https://www.dshdesktop.cn/api/desktop/version`（stable/beta 双通道头），下载端点为固定 counted endpoint（2.0.5 侧为 magic-only 校验，无签名/哈希验证——P0-1v2 注释原文）。

## 6. 结论（决策输入）

1. 2.0.10 对 LUTE 是**结构性迁移**（打包形态、38 锚点、15+ 脚本路径、预设名、DMG 源），不是「换个版本号」；工作量与 2.0.0 迁移（35 补丁重锚）同量级，04 报告 §6 估的是 2-4 周。
2. 「今天上生产」与 ADR-0006 观察窗（09-27 截止）冲突，且上游渲染层处于活跃修补期、#998 未合并——**同日切换 = 承担已登记的确定性风险**。
3. 唯一现成可做的是**立即开通 2.0.10 D 轨道**（隔离验证环境，不碰生产），这不需要豁免任何 ADR。
4. 更新入口安全性已有双重闸门，但第二道（P0-1v2）必须随迁移重锚，且应把「版本串闸门依赖上游未改的版本源」这一脆弱前提写成显式守卫（见 13 号文档 T-UPD 任务）。

> 未验证项：#998 合并状态会变；0.1.5-rc.2 下 LUTE 26 个本地包的行为兼容（12 号文档标注 Unknown 集合）；2.0.10 无 ASAR 后官方首启/恢复行为（RECOVERY 补丁的 replace asar→unpacked 逻辑是否还需存在）。
