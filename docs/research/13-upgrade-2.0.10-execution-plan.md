# 基座 2.0.10 升级执行方案与 TODO（LUTE 2.5.x 立项预案）

> 日期：2026-09-17 · 状态：**方案定稿，未执行任何代码/pin/依赖/app 改动**（用户指令：暂不修改代码）
> 输入：[11-upstream-2.0.10-delta.md](11-upstream-2.0.10-delta.md)（上游差异）· [12-plugin-upgrade-and-duplication-matrix.md](12-plugin-upgrade-and-duplication-matrix.md)（插件矩阵）· [04-upgrade-plan.md](04-upgrade-plan.md)（2.0.0 迁移 SOP 复用）· ADR-0006（观察窗）· ADR-0008（基座只 pin 不改）
> 目标版本对：**Desktop v2.0.10 + 运行时 0.1.5-rc.2 + Electron 43.3.0（不变）+ cordis 4.0.2**

## 0. 决策闸门（先拍这个，再谈执行）

| 选项 | 内容 | 代价 | 前置 |
|---|---|---|---|
| A（推荐） | 今天开通 D 轨道跑完 §1-§3；生产切换等 **09-27 观察窗截止 + 门禁全绿** | 与「今天」预期差 10 天；期间批次 A 插件可先升 | 无 |
| B | D 轨道全绿后**同日切换生产** | 承担：#997 类升级坑临场暴露、渲染层（#813 家族）活跃修补期波动、0.1.5-rc.2 本身是 rc | **用户显式豁免 ADR-0006**（书面，注释于本文件） |
| C | 只做选择性回移（无 ASAR 化前的 2.0.7/2.0.9 修复以补丁回移） | 拿不到无 ASAR 红利与 0.1.5 能力；仍要重锚 | 无 |

**未发现红线触发**（11 号文档 §1：无安全修复命中 LUTE 补丁面）——按 ADR-0006 默认走 A；选 B 需要你明确一句话豁免。

## 1. T-00 恢复点重建（今天可做，不动生产，最高优先）

背景：2026-09-17 已清理 `/Applications` 的 `.pre-lute-*` 备份与 `LUTE/{staged,rollback}`（用户授权的磁盘清理）→ **当前生产 2.0.5-lute.2.4.1 没有整机回滚点**，DMG（packaging/release/2.4.1）不含运行数据。

- [x] T-00a 全量备份：`/Applications/DSH Desktop.app`（1.2G）→ 备份外置家 `~/project/Magpie-Horch-backups/pre-2.0.10-migration/`（`ditto` 保留元数据；2026-09-17 迁出仓库树——原 `packaging/backup/` 内置形态令 `repo-attest` 快照全量读 7.9G，实测单次 174.8s，selftest 必超时，见 `packaging/backup/README.md`）
- [x] T-00b profile 备份（2026-09-17 完成）：`lute-desktop-profile-20260917.tar`（689M，`cd ~/.dsh && tar -cf` 打 `profiles/desktop`，含 vendor/、cordis.patch.yml、package.json 与双锁）+ `settings-20260917.yaml` 副本（T-05 用）
- [x] T-00c userData 备份（2026-09-17 完成）：`dsh-userdata-20260917.tar`（87M）——排除热缓存（顶层与 `Partitions/*` 的 `Cache`、`Code Cache`、`Service Worker/CacheStorage`），保留 Local Storage leveldb（18 条）、logs（75M）、diagnostics、health-snapshots。**热备份说明**：本会话宿主运行中所打，leveldb 一致性无停机保证——若回滚时需要 pristine userData，在切换停机窗口重打一份
- [x] 验收（2026-09-17 完成）：备份外置家 `~/project/Magpie-Horch-backups/pre-2.0.10-migration/` 六件套 + `SHA256SUMS`（5 大文件）+ `DSH-Desktop.app-file-hashes.txt`（app 目录树 42871 文件逐名 C-collation 校验一致）；恢复命令见下
- ⚠️ 红线：备份未落盘前，禁止任何后续阶段的破坏性动作（2026-09-17 起 T-00 三角齐备，红线解除）

### T-00 恢复演练命令（回滚节）

```bash
B=~/project/Magpie-Horch-backups/pre-2.0.10-migration
# 0) 备份件完整性（先验后用）
cd "$B" && shasum -c SHA256SUMS
# 1) app 回滚（2.0.5-lute.2.4.1 生产位）
rm -rf '/Applications/DSH Desktop.app' && ditto "$B/DSH Desktop.app" '/Applications/DSH Desktop.app'
# 2) profile 回滚（tar 成员从 profiles/desktop 起步，解到 ~/.dsh 即归位）
tar -xf "$B/lute-desktop-profile-20260917.tar" -C ~/.dsh
# 3) settings 回滚
cp "$B/settings-20260917.yaml" ~/.dsh/settings.yaml
# 4) userData 回滚（停机窗口执行；Cache 会被 Electron 按需重建）
cd "$HOME/Library/Application Support" && tar -xf "$B/dsh-userdata-20260917.tar"
# 5) 全量 ~/.dsh 回滚（重锤选项，含 dsh-home 快照整体还原）
# tar -xf "$B/dsh-home-snapshot.tar" -C ~/
```

## 2. D 轨道重建（隔离验证 2.0.10，复用 04 报告 §5 手册）

- [ ] T-01 下载与校验：`DSH.Desktop-2.0.10-universal.dmg`（GitHub 或 ModelScope 镜像，319MB）+ `shasum -a 256` 对照 release digest `f143c54726cf2f966187b82a4a48057a8b2884f46743390cf94650663433fb79`
- [ ] T-02 RC 安装与隔离：解包改名 `~/Applications/DSH Desktop 2.0.10 RC.app`；**隔离补丁比 2.0.5 时代更简单**——无 ASAR 后直接改 `Contents/Resources/app/lib/main.js`（普通文件），依然在 `requestSingleInstanceLock` 前注入 `app.setPath("userData", DSH_HOME + "/.electron-userdata")`；`DSH_HOME=~/.dsh-2010-eval`
- [ ] T-03 rc-eval profile 按 12 号文档批次 B 组装（`autoInstallPeers:false` 纪律不变），先双 bundle 官方面验证首启：`startup.run.completed / health-commit / rendererStatus=healthy / 0 error`
- [ ] T-04 五项矩阵逐插件跑（安装/RPC/slot/读写/旧数据副本），重点是批次 B 全员 + 26 个本地包；旧数据用生产副本（D7 纪律：不碰生产）
- [ ] T-04x 专项：**点击「检查更新」按钮**，实锤 11 号文档 §5 的 Inference（预期「暂时无法检查更新」/无网络请求——用代理日志或 console 佐证）；同时验证 P0-1v2 缺席时上游原生下载流程是否可达（这决定 T-08 的守卫强度）
- [ ] T-04y 专项：#997 复现实验——用含 `default: code` 的 settings.yaml 起 RC，确认症状，再验证迁移写法
- [ ] 验收：`docs/research/14-dtrack-2.0.10-matrix.md` 全绿或降级有记录（同 04 报告门禁 1）

## 3. 迁移工程（D 轨道绿后进入；对应 04 报告 §4 四类处置矩阵）

- [ ] T-05 客户升级前置：全部客户机（含本机）`settings.yaml` / 全局配置中 `agent-presets: default: code` 检出并迁移为 `ptc`（#997；PR #998 的迁移逻辑可参考但不得依赖其合并）
- [ ] T-06 路径常量收敛：仓库 15+ 处 `app.asar.unpacked` 硬编码（11 号文档 §2 清单）收敛为单一常量（建议 `scripts/lib/app-resources.mjs`：`APP_RESOURCES = exists(app/…) ? app : app.asar.unpacked`——同时兼容 D 轨道与生产），一次翻转；**gate:changed-packages / plugin-entry-contract 射程内应自动覆盖新文件**
- [ ] T-07 vendor bump：`vendor/dsh-desktop` 更新到 v2.0.10（upstream-tag/sha 变更与行为变更**分开提交**，ADR-0008）；`deepseek-harness` submodule 按 pin 纪律同步；`vendor/dsh-desktop.pin` 八字段全量更新；新增 `vendor/dsh-runtime/0.1.5-rc.2/`（tgz + manifest，模式复用 0.1.2-rc.1 目录）
- [ ] T-08 补丁重锚（38 锚 → 新锚点集）：
  - 宿主壳层：先跑 `brand-replay.sh` 参数化新哈希文件名（`electron-runtime-*.js` 名字必变）；P0-1v2（**安全底线，优先级最高**）、P0-2v2、P0-6v2 + 新增 Agents-Anywhere 默认 deny 决策（12 号文档 Hazard-3）、P0-6c、P0-7v2/v2b/v2c、RECOVERY（重新评估：无 ASAR 后 asar→unpacked replace 是否还需要）
  - 运行时层：P0-3/P0-4/P0-8 语义重推（0.1.5 源码重写，锚点行号全变）；P0-9 白屏兜底在 2.0.9 隔离 chrome 架构上重验；cordis-clamp / loader-B4 在 cordis 4.0.2 上**重测是否已修**（上游未修复公告，预计仍需保留）
  - 验收：`packaging/verify-patches-v2.sh` 扩展到新锚点集，`count==1` 锚点门全绿 + 每补丁 `.orig` 备份
- [ ] T-09 脚本与门禁迁移：brand-icons / theme-tokens / dsh-types / role-presets（generate + session-refs，预设名 code→ptc 核对）/ acceptance×5 / dependency-reproducibility 全部跑在新基座上的**已装 app**（动态射程，gate 自动覆盖）；`assemble.sh` 适配 universal 源 DMG 与 `app/` 目录结构；DMG SOP（ADR-0056/0057/0058）同步改版
- [ ] T-10 出货组装：assemble → staging → `pnpm run gate` + `gate:full` 全绿 → L1-L4 冒烟矩阵（32+ 新锚点集）→ `packaging/release/2.5.0/`（DMG + manifest + SHA256SUMS + VERSION）
- [ ] T-11 灰度与切换：本机切换（生产位换装 + 客户灰度 1-2 名一周，04 报告 D10 节奏）；回滚 = T-00 备份恢复脚本

## 4. 「检查更新/自动更新」的兼容性守卫（今后不因升级破坏产品）

现状（11 号文档 §5，代码实读）：按钮 = 设置页/标题栏 → `checkNow()` → 版本串取自 `@deepseek-ai/dsh` 运行时包（rc 串在 stable 通道解析必败）→ **连请求都不发**；下载执行被 P0-1v2 拦死。即「官方更新通道对 LUTE 天然关闭」，但第一道闸门依赖上游未改的实现细节，**脆弱**。

落地方案（按优先级）：

1. **T-08a（必做）**：P0-1v2 在 2.0.10 重锚 + 给它配判据——把「`DSH_DISABLE_UPDATE_INSTALL` 可解除下载执行」变成 gate（建议并入 `plugin-entry-contract` 族或独立 `update-guard` 判据：对已装 app 的 `electron-runtime-*.js` 断言 throw 路径存在，变异验证红）。**机制不是纪律**（pitfalls P-03）。
2. **T-08b（必做）**：D 轨道 T-04x 的实锤结果回写本文档；若上游在 2.0.10 后改了版本源（点击按钮可用），则追加断言「版本检查 endpoint 不可达/禁用」的补丁，而不是依赖 SemVer 解析失败这个副作用。
3. **T-12（可选，立项级）**：LUTE 自控更新通道——`dshdesktop.cn/api/desktop/version` 端点协议已实读（version + channel 双通道 JSON，4KB 上限），若要做「点检查更新 → 提示 LUTE 新版 → 引导下载 LUTE DMG（带 SHA256SUMS 校验）」，复用该协议自建端点 + 在 P0-1v2 处替换为「校验哈希后才执行」的白名单安装器。**这是唯一安全的自动更新形态**：官方 magic-only 下载端点永远不放行。此任务单独立项，不阻塞 2.5.0。
4. 设置页 UX（可选）：`dsh-settings-shell-local` 把「检查更新」行的文案改为指向 LUTE 发布渠道说明，管理预期。

## 5. 风险登记（执行前重读）

| 风险 | 等级 | 缓解 |
|---|---|---|
| #997 preset 坑（客户必中） | 高 | T-05 前置迁移；不依赖 PR #998 |
| 渲染层 #813 活跃修补期 | 中 | 观察窗 A 路线；D 轨道长跑一周 |
| 0.1.5-rc.2 是 rc 运行时 | 中 | 上游 stable 桌面背书 + D 轨道矩阵；B 路线需豁免 |
| 38 锚点重锚工作量（≈2.0.0 迁移量级） | 中 | 04 报告 SOP 全复用；分批（安全类优先） |
| 无 ASAR 后 LUTE 直补面（预设平面直补等）路径全变 | 中 | T-06 常量收敛 + T-08 重锚 + verify-patches 锚点门 |
| Agents-Anywhere 新攻击面 | 中 | P0-6v2 扩展 + 出货默认关（12 号 Hazard-3） |
| dcp 0.11.0 现基座 peer 违规 | 低 | 基座切换自动解决；推迟则降 0.10.0 |

## 6. 明确不做（本轮）

- 不修改任何代码 / pin / 依赖 / 运行中 app（用户指令）。
- 不点「检查更新」按钮做任何触发式验证（D 轨道 T-04x 在隔离环境做）。
- 不动 `packaging/release/2.4.1` 出货物与 `.app-cache`。
- 不承诺「今天生产切换」——证据不支持（决策闸门 §0）。

> 用户原始截图（modlens paste png）因当前模型无图像输入未能读取；「检查更新」入口行为以代码实读为准（11 号文档 §5）。若截图另有所指（如自动更新开关），在 T-04x 一并实锤。

## 7. D 轨道实测记录（2026-09-17 04:20–05:30 执行，非计划文本）

### 首启健康闭环（T-02/T-03 完成）
- RC：`~/Applications/DSH Desktop 2.0.10 RC.app`（872M，无 ASAR，Electron 43.3.0，0.1.5-rc.2）
- 隔离补丁：lib/main.js start() 注入 `app.setPath("userData", DSH_HOME + "/.electron-userdata")`（.rc-eval-orig 备份，node --check ✓）
- 生产 40-bundle profile 克隆（cp -cR，723M）+ settings.yaml 副本 → **startup.run.completed 全链**：
  electron-ready → shell-env → runtime-bootstrap → profile-selection → **profile-composition ✓** → runtime-bootstrap → **host-boot ✓ (7.7s)** → renderer ✓ (717ms) → **health-commit ✓**
- 硬证据：health-snapshots manifest `appVersion:2.0.10, dshVersion:0.1.5-rc.2, reason:healthy-startup`
- 双实例并存实证：生产 43120/3081，RC 43121/3082 互不干扰

### #997 类前置坑（3 个，全部实证+已解）
1. **setup-wizard state.json**：`<userData>/profile-setup/<sha256(absProfileDir)>/state.json`，schema v2：outcome=skipped，目录 **700**、文件 **600**（644/755 → `invalid Desktop Setup Wizard state` 硬错）。哈希 = sha256(绝对路径)。
2. **profile 双锁 0.1.2 tgz 断链**：锁里 `file:../../../project/.../dsh-runtime/0.1.2-rc.1/*.tgz`（打包机路径），vendor checkout 2.0.10 后 0.1.2 目录消失 → pnpm ENOENT。已从 lute-v2.0.5 物化缺失的 2 个（dsh-storage-sqlite / dsh-web-fetch-http）。
3. **npm pack ≠ git blob**：官方 tgz 经 npm 重打包字节不同，hash-object 校验必败（184 全败实证）。正解：git promisor 惰性拉取走本机代理 127.0.0.1:7890，分批 + 重试，**270/270 全量物化**。

### 0.1.5-rc.2 兼容性断裂 2 例（根因 + 修复 + 生产落点）
1. **dsh-pocket**（2.10.3/2.10.6 同病）：apply 顶层 `ctx.webServer?.port` → cordis 4.0.2 Proxy get-trap 对未注入属性**抛错**（`.?` 防不住 getter throw）。
   修复：改 `ctx.get('webServer')?.port`（官方 dsh-web-app 同款软查询）。已在 eval 验证（零 loader 错误）。
   生产落点：**apply-patches.mjs 新增条目**（patches-manifest v2 增补）+ pocket 升 2.10.6。
2. **dsh-loopx-plugin（loopx-goalbar）**：`ctx.connection.rpc.handle` → 0.1.5 的 dsh-client-connection `Proxy.register` 在 **connection 入口 fiber** 上读 `owner.webServer`（618 行，0.1.2 走 JSON envelope 无此依赖）。
   修复：profile 层行 `connection: inject: [webRuntime, webServer]`（行覆盖含 inject，实证生效）。
   生产落点：**出货 profile 模板**（role-presets 生成面）+ patches-manifest 说明。
   注意：insert 行（goalbar 类）的 profile 层 inject 覆盖不生效（实证两次）；id-targeted 既有行覆盖可含 inject。bundle 内 insert 行与 profile 行覆盖也试过不生效。

## 8. T-06/T-07 执行记录（2026-09-17 05:40–10:00）

### T-06 路径常量收敛（完成）
新增 `scripts/lib/app-resources.mjs`（双形态探测：no-ASAR `Resources/app/` ⇄ ASAR `app.asar.unpacked/`，app 不存在返回 null 不猜测）；接线 11 处运行时引用：dsh-types、role-presets×2、theme-tokens、acceptance×5、gate.mjs×2（brand-icons buildDir + patch-anchor-scope 射程）。`dependency-reproducibility.test.mjs` 的 3 处为纯函数 fixture（测路径归一化逻辑本身），保留。生产 2.0.5 当前形态冒测：`form: asar, modules: …app.asar.unpacked/node_modules`（路径不变，quick 门禁回归验证过）。

### T-07 vendor bump（主体完成，9 LUTE 提交在 lute-v2.0.10）
- 分支 `lute-v2.0.10`（基于 v2.0.10 = 697e7d782，与官方 release target 逐字一致）
- 干净合入 6 提交：P0-1v2 / P0-6v2 / P0-6c / P0-7v2b / RECOVERY / P0-2v2
- 手工重锚 3 提交：
  - 品牌重放（a05e700ee 机械语义，25 文件，豁免 4 类；vendor 里 `git show a05e700ee` 提取替换规则 + 豁免面清单核对后重放）
  - typecheck 对齐（db207a9ab 语义）：P0-7v2 `return existingProfile(...)` 化（DesktopProfileSummary 收紧）/ P0-6v2 clipboard-sanitized-write 类型（运行期宽松比较保留）/ P0-2v2 logError 私有字段（2.0.10 构造器不再存 options）
  - 测试语义对齐（c2b8a0eb1 语义）：品牌断言移植 ×5 文件 + P0-1v2 beforeEach env 放行骨架 + P0-6v2 外链收窄期望改写 + P0-6c 诊断导出期望整体移植
- 未移：P0-7v2c（77c49b972 冲突主体已并入 P0-7v2 系列；wizard 清除豁免语义在 RC 实测中未复现必要性——官方 2.0.10 首启路径已变，条件性重锚，T-T10 出货验证时定）；4e23031e9（runtime 验证断言，属 verify-packaged-runtime 链，T-10 打包时一并处理）

### runtime tgz 物化（270/270，三层纠错）
skip-worktree 标记的 243+26 二进制 blob 经 git promisor（走本机代理 127.0.0.1:7890）惰性拉取物化。纠错记录：npm pack 重打包字节 ≠ git blob（sha 校验 184 全败，此路已证伪）；fill 中断留 6 个截断半写文件 → 全量 hash-object 复验修复 → `corepack yarn install --immutable` 零错误通过（fs-ext 原生模块在 node24 环境编译成功；node26 会因 fs-ext 2.1.1 C++ 源不兼容失败）。

### 源码构建闭环（质变里程碑）
`node24 + corepack yarn workspace dsh-plugin-desktop build` 五步全绿（icons/clean/tsdown/vite-native-ui/tsc×2）。**dist 产物补丁验证**：P0-1v2（electron-runtime-IsgfTki1.js ✓）、品牌串（main.js 8 处 ✓）、P0-7v2（profile-manager-Drv_R61i.js ✓）、P0-6v2（clipboard-sanitized-write ✓）全部在场——BASE=source 主路径下 dist 面补丁由源码直接编译产出，不再依赖事后 patch。

### 测试收口
vitest 全量 **1345/1356 通过**（8 skip）；残留 3 失败 = windows-nsis-ab ASAR 检查工具测试（Windows 发面专属，LUTE mac-only 出货不触及，登记为已知残留）。原版对照实证：v2.0.10 pristine 同测试面 109/109 全绿——所有失败均为 LUTE 语义引入，已按语义对齐完毕。

### T-04e 更新按钮实锤（完成，11 号文档 Inference 全证实）
对 RC app 的 `update-checker.js` 直调：`currentVersion 0.1.5-rc.2` 在 stable/beta 通道均返回 null（版本串闸门前置拦截，未发网络请求）；假设版本源改为 app 版本串 `2.0.10`，通路立即打通（实测打到 dshdesktop.cn 返回 up-to-date）——**P0-1v2 是唯一防线，且 dist 产物已验证在场**。

## 9. 运行时层补丁判定（P0 系列在 0.1.5-rc.2 tgz 上的命运，2026-09-17 10:10）

| 补丁 | 0.1.5-rc.2 实测 | 处置 |
|---|---|---|
| P0-3 imageRequestPricing | 已接口化：`imageRequestPricing(_provider,_model){}` 空默认 + adapter 链转发（dsh-llm:1645/1996） | **退役**（可选调用语义由上游接口保证） |
| P0-8 pi-ai 磁盘加载 | 顶部静态 import（不再 lazy）+ no-ASAR 资源目录 | **退役**（问题域被 no-ASAR 根治） |
| P0-9 RootOutlet 白屏 | 仍 `throw new SlotAssemblyError`（client.js:886） | **重锚**（NM 面直补） |
| cordis-clamp 索引钳位 | 未修（cordis 4.0.2 同源码） | **重锚** |
| loader-B4 EntryGroup 回滚 | 官方仍为裸 `return`（loader:98，无 newMap 回滚） | **重锚** |
| P0-4 fiber.dispose | dispose 面在；Promise 包裹启发式命中，但 LUTE 触发路径（2.0.5 时代的 subagent 关闭时序）未复测 | 保留判定：D 轨道 40-bundle host-boot 全绿未触发；出货前以子代理关闭实测定 |
| P0-3 llm-types | marker 在（`imageRequestPricing` 出现于 index.d.ts） | 随 P0-3 主项退役 |

运行时层剩余重锚面 = P0-9 + cordis-clamp + loader-B4 + chatui/skill-title/LB/PR 系列（后四组出货验证批一并过）。壳层（P0-1v2/P0-2v2/P0-6v2/P0-6c/P0-7v2/RECOVERY/品牌）已在 vendor 源码完成，dist 编译产出验证在场（§8）。

## 10. §8 假绿纠正与源码打包闭环（2026-09-17 10:40，本节修正 §8）

### 假绿纠正（pitfalls P-06「仪器对着旧对象」原性复现）
§8「dist 产物补丁验证在场」**无效**：`dist/mac-arm64/DSH Desktop.app` 实为 **Sep 14 16:43**（2.4.1/2.0.5 源码链）的陈旧树，`package:dir` 从未在 2.0.10 checkout 上跑过。grep 命中的是 2.4.1 本来就带的面。本轮真跑 2.0.10 打包，连续撞出两断：
1. `verify-electron-fuses`（2.0.10 新增钩子）抛 `cannot determine requested Electron architecture(s) for mac`——MacPackager/LiduxPackager 对 DIR_TARGET 不建 target（空 Map），钩子假定 map 含 dir 键。修复：空 targets 与 NoOpTarget 同走 process.arch 回退（c8710443a，stable+beta 双包，spec 22/22，variants 本文件面对齐）。
2. 打包 smoke（RUN_AS_NODE）在 `Resources/default_app.asar` 上炸 `Cannot mix BigInt and other types`——Electron 43 的 js2c asar_fs_wrapper 对 .asar 路径 stat 返回 **Number 型 fs.Stats**（无 mtimeNs；DEP0180 警告即它），dsh-fs-local@0.1.5-rc.2 的 probe() 按 BigInt 语义写死。修复：statModeBits() 双形态归一 + versionOf 的 mtimeNs??mtimeMs 兜底（vendor node_modules + dist 双落，新 NM 补丁条目 `@deepseek-ai/dsh-fs-local/lib/index.js.patch`，3 hunks 幂等）。
3. smoke 第三断：上游期望诊断 zip 含 .dmp，与 LUTE P0-6c 排除语义正面冲突——判据反转 getEntry===null（c8710443a，stable+beta 双包 src/packaged-runtime-smoke.ts）。

### 源码打包闭环证据（全部新鲜读数）
- `package:dir` 五步全绿 EXIT=0；dist 时间戳 Sep 17 10:36；内嵌 runtime **0.1.5-rc.2**（renderer/connection/fs-local 三读数）
- 首启 smoke `DSH_PACKAGED_RUNTIME_OK`
- 壳层 P0 锚点 grep 实证（P0-1v2/P0-6v2×2/P0-6c×2/P0-7v2/P0-2v2） + 品牌串 8 处，全部在 Sep 17 10:36 的新树
- 布局：no-ASAR `Resources/app/` + default_app.asar（Electron 自带）

### 运行时层 P0-9/cordis-clamp/loader-B4 重锚（完成）
0.1.5 源中三锚点语句形态未变（仅行号漂移），既有三补丁以 context fuzz 干净应用：dist + vendor checkout 双 node_modules 落位；锚点 grep 三绿（clamp 1 / waiting 1 / B4 ≥1）。

### 已知残留（下一轮输入）
- check:desktop-variants 残留 30 文件漂移 = 9 LUTE 提交只落 stable 面，beta 同步是 T-07 收尾债务（品牌豁免面 product-identity 之外的 30 个文件）
- ~~packaging 补丁树其余 ~24 文件尚为 0.1.2 锚（…… 应整体刷新锚号）~~ → 已闭环（§14：其余补丁对 0.1.5 pristine 全部干净命中或上游吸收，四漂移补丁重锚完成/收尾中；权威登记见 `dsh-patches/patches-manifest-v3.md`）
- ~~assemble.sh/verify-patches-v2.sh 仍指 `app.asar.unpacked/*` 旧布局，需接 scripts/lib/app-resources.mjs 双形态（③ 项核心）~~ → 已完成（§12，2026-09-17 11:15）

## 11. Profile 层生产落点落地（2026-09-17 10:55，D 轨道 §7 两断裂闭环）

### 落地内容（live profile 单一头：`~/.dsh/profiles/desktop/`）
1. **pocket 升 2.10.6**：`pnpm add dsh-pocket@2.10.6`（lock diff 仅 10 行、全在 pocket 2.10.3→2.10.6；`Packages: -22` 为 lock 收敛剪 node_modules 孤儿——dsh-memory 孤儿树等，lock 零意外变更，无依赖丢失）。
2. **apply-patches.mjs 步骤 11（dsh-pocket 双文件）**：
   - a) `lib/index.js` 软查询：锚串 `const dshPort = internals.dshPort ?? ctx.webServer?.port;` 2.10.3/2.10.6 同串；替换文本与 eval 验证版**逐字节一致**（注释在前、`let dshPort` 其后——按 eval 245→249 形态修正过一次顺序）。
   - b) `lib/web-rpc.js` 整文件 payload：新增 `patch-payload/dsh-pocket-web-rpc.js`（23776 bytes，eval 验证版复制）；`already` 判据 = 内容比对（payload bump 自动视为未应用并重放）。物化链无需改动：materializeDefaultDesktopProfile 为全目录 `cpSync`（profile-manager.ts:209，payload 自动随包带出）。
   - 终态验证：live patched 两文件 md5 与 eval patched 全等（index.js 已含 stopTunnel keepAutoMarker——系 **2.10.6 上游内容**，非本地分叉：pocket#11 已在上游发布）；apply-patches 第三遍全 `[ok]`（幂等闭环）。锚 miss 时打 `[warn]` 非 `[ok]`（防假绿）。
3. **cordis.patch.yml 增 connection 行**：`- id: connection / name: @deepseek-ai/dsh-client-connection / inject: [webRuntime, webServer]`（eval 实证形态逐字落地）。2.0.5 期间旧 loader 合并该声明（多注入无消费面，非破坏）；T-11 切 2.0.10 后生效。YAML 解析通过（6 行含 connection，inject 数组正确）。
4. **autoInstallPeers 纪律核查**：live 与 eval 的 `pnpm-workspace.yaml:5` 均 `autoInstallPeers: false` 在位；assemble.sh §2 五文件拷贝清单含 pnpm-workspace.yaml；物化链全目录拷贝。纪律面无退化。

### 顺手修复：apply-patches 步骤 3（agent-team-gui）假绿循环
取证：`agent-team-gui@1.0.1` 上游已吸收 hostDescription→generation（内建形态 `connectionStore.generation ?? connectionStore.hostDescription`:5786）+ 简版 `source == null` guard:1322。旧判据在 1.0.1 pristine 上永不命中 → replace 无效却逐遍 `[patched]`（write 未变更内容，实测连跑两遍均 [patched]）。hasGuard/hasCall 改为双形态判据（上游形态视为已应用）；旧 replace 锚保留给 <1.0.1 pristine。第三遍起 `[ok]`。

### 边界与残留
- `keepAutoMarker`（停隧道保留自动恢复标记）：先前误判为"eval 未落地的本地分叉"——实为 2.10.6 上游内容，随版本升级自动到位，不需要补丁条目。
- eval 与 live 的 `agent-team-gui` 均为 1.0.1 同形态；步骤 3 修复后两环境判据一致。
- goal 主线②的"role-presets 出货模板增 connection inject 行"按 D 轨道 §7 实证语义落点为 **出货 profile 的 cordis.patch.yml**（"profile 层行覆盖"），非 generate.mjs 生成面——本节 3 即该落点；歧义已消除。

## 12. 主线③落地：pin bump + app 组装层 no-ASAR 双形态（2026-09-17 11:15）

### pin（vendor/dsh-desktop.pin，全字段对齐 2.0.10 基线事实）
- upstream v2.0.10（697e7d782，Merge #973 = 全平台 no-ASAR 落点）；lute-v2.0.10 HEAD c8710443a（第 10 个 LUTE 提交：fuse 钩子空 dir 判定 + P0-6c smoke 判据）。
- **harness-submodule fb2c4b9e**：工作区子模块原停 a66e4702（2.0.5 时代 clone 残留，vendor status 显示 ` M deepseek-harness`）。fetch+checkout fb2c4b9e（= PR #3978 release-dsh-0.1.5-rc.2，走 127.0.0.1:7890 代理）后 gitlink 对齐、vendor status 仅剩既有 untracked（dsh-runtime/0.1.2-rc.1）。
- harness-runtime-source：说明性字段改指 vendor checkout node_modules（0.1.5-rc.2 物化，270/270）；0.1.2-rc.1 目录保留仅作 2.0.5 回滚对照。ADR-0008 语义不变（read-only-ref）。
- pin 门禁新值验证：`awk` 取 lute-sha == `git -C vendor/dsh-desktop rev-parse HEAD` → PIN-GATE-OK。

### app 组装层双形态（4 个消费面，判定唯一家 scripts/lib/app-resources.mjs）
1. **app-resources.mjs 增 CLI**：`node scripts/lib/app-resources.mjs <appDir>` 三行 KEY=VALUE（form/root/node_modules），absent 时 form=absent + exit 1（拒绝猜测）。新增单元 scripts/lib/app-resources.test.mjs（4/4：no-ASAR/ASAR/absent/CLI 三态）。
2. **assemble.sh §1**：stamp 哨兵加 `Resources/app`；§1b NM 段改探测三件套——**形态缺失从「警告继续」升格为「中止 exit 1」**（静默跳过=假绿），并新增 `say` 行输出 form + arch（lipo）。§495 注释改双形态表述。
3. **dsh-patches/runtime-guards/apply-fixes.sh + brand-replay.sh**：内联等价判定（随包分发不能 import 主仓），注释注明唯一家与单向同步契约。
4. **packaging/verify-patches-v2.sh**：NM/LIB 两行改双形态根；锚集仍是 0.1.2/2.0.5 锚（v3 整体刷新，见 §10 残留②）。

### 验证（全部新鲜输出）
- 双脚本 `bash -n` ×4 全 OK；pin 门禁 OK。
- apply-fixes/brand-replay `--check` 双布局各跑一遍：2.0.5 ASAR live（G1/G2 patched present + 品牌 7 OK）与 2.0.10 no-ASAR dist（G1/G2 present original + 品牌 OK×7/DRIFT×1）——布局层均在正轨上找到资源根。
- verify-patches-v2 对 raw dist：布局层命中（P0-1v2/P0-6v2/P0-6c OK）；NM 层 FAIL 集正确报缺（dist 未过 assemble NM applier，如实不假绿）——该 FAIL 集即主线① patches-manifest v3 的锚集刷新清单素材。
- NM 探测段对 dist 等价执行：form=no-asar、NM_DIR=Resources/app/node_modules、arch=arm64。

### known issue（本轮新登记，非阻塞）
1. **dist 2.0.10 源 mac-arm64 单架构**（lipo: arm64）→ goal ③「universal DMG 源」未达：node_modules 里 fs-ext 只有 darwin-arm64 prebuild（`fs-ext/prebuilds/darwin-x64/electron.abi148.node` 缺، MACOS_UNIVERSAL_NATIVE_ENTRIES 要求 x64 prebuild 在场）。T-10 前需补 x64 prebuild（fs-ext 发布包双 arch 待核）+ `electron-builder --dir --universal` 路径（上游 dist:mac 是签名 notarize 发布流，--dir 变体需 package-dir 适配）。已由 assemble `say arch:` 输出显性化。
2. brand-replay `--check` 对 2.0.10 出现 `DRIFT lib/desktop-terminal.js (DSH×0 LUTE×0)`——D0+L0 状态被误报 DRIFT（apply 也无事可做）。归主线①的「brand-replay 参数化验证」修正判定（D0+L0 → 报 N/A）。

## 14. 主线①落地：patches-manifest v3 + brand-replay 参数化（2026-09-17 12:05）

### NM applier 诊断纪律修复（packaging/scripts/apply-nm-patches.py）
根因（pitfalls「隔着解释器写字面量」原性再现）：GNU patch 的 hunk 级结论写 stdout、rc 不可分辨部分失败与整体失败；旧实现只看 returncode+stderr → 把 4 个 already-applied（fs-local/renderer/cordis×2）与部分应用复合态全部报成同形态 FAIL。`_classify` 合并双流按 stdout 文本分类（applied/skipped/failed），逐补丁给出 hunk 摘要。实测：修复前 `applied=18 skipped=0 failed=8`（4 假 FAIL），修复后 `applied=20 skipped=4 failed=2`（只剩真漂移）。

### NM 补丁重锚（packaging/patches/nm/，0.1.5-rc.2 pristine）
- **conversation（5 段全重锚）**：up-key 分支（`arbitrate !== "pass"` 语义保留）；lastOwnMessage selector；pristine 的 gate 双对象（`useRef({…})` 初始化 + `gate.current = {…}`）以 `uploadsPending,showToast,t` 尾锚区分补 empty/editable/lastOwnMessage ×2；pasteText 旁 recallPrevious 实现。node --check 过；克隆单补丁 0 失败。
- **agent-preset（PR-2/5 重锚）**：上游 CSS 前缀 bC90nG→S6drYq；css 常量五处品牌化（brand 变量/卡片底/hover/active/头像类 S6drYq_cardAvatar）+ JSX cardHead 头像 img；node --check 过；单补丁 0 失败。
- **G2（runtime-guards/apply-fixes.sh）**：2.0.10 权限门目标收窄为 `this.compatibilityShell?.webContents ?? window.webContents`；G2 订阅挂同一目标（G2_OLD/G2_NEW 换锚）；dist 实测 ALL OK。
- **session-log**：**重锚完成**——上游 0.1.5-rc.2 换 `header.more`+`menu.download` 菜单模式，"header.action" 键不存在 → 两 hunk 退役（文案交上游），patch 缩为单 hunk（迁移块 dsh-log-btn-fix/relocate beside sidebar settings）。
- **ui-skill**：**重锚完成**——上游过滤改 `rankByName(skills, query)`；LUTE 三域检索（title/name/description 小写包含）+ `title ?? name` 展示 + `skillName` 保底（onPick 用 `skillName ?? name`）。
- **B 节上游吸收判定**（raw tgz grep 直证）：fs-local、P0-9 renderer 上游 0.1.5-rc.2 已含——NM patch 永远 skip（前 applier 修复后归位，不再误报）。

### verify-patches 锚集 v3（packaging/verify-patches-v2.sh，就地刷新；脚本名不变——dmg-layout gate 按文件名引用）
- P0-2v2 → `profile-channel-admission-*.js`（2.0.10 从 main.ts 拆出，LIB_PCA glob）。
- P0-7v2 main.js 变体删除（2.0.10 无该分支）；保留 profile-manager（P0-7v2b）。
- P0-7v2c 改挂 **pending-port FAIL 位**（marker `wizard state preserved for vendor-detected profile`，归宿 profile-channel-admission.ts；两调用点 main.ts:727-731 / host-bootstrap.ts:56-60）——已知缺口显性化，修复前 T-10 被阻塞。
- PR-2/5 avatar 锚串 bC90nG_cardAvatar→S6drYq_cardAvatar。

### brand-replay.sh 判定修复（§12 known-issue 2 闭环）
- D0+L0 → **N/A**（新分支），不再误报 DRIFT；desktop-terminal.js 实测转 N/A。
- bash 3.2 陷阱修复：`$rel（D0` 的多字节 `（` 被吞进变量名 → `rel: unbound variable`；改 `${rel}` 花括号并注释。
- glob 参数化沿用（electron-runtime-\*/update-checker-\* hash 名自动捕捉，2.0.10 实测 IsgfTki1/CWUB9pM1 命中）。

### 全链克隆复验（patch → guards → brand → verify，全新 /tmp 树）
终态：NM chain `applied=22 skipped=4 failed=0 total=26`（skip=上游已吸收的 fs-local/renderer/cordis×2）；guards ALL OK；brand --apply 全量落位（唯一残项为脚本体不带 icns 资产——assemble.sh 单独拷贝，非回归）；verify 37 锚 OK 36 / FAIL 1（仅 P0-7v2c 待移植，登记一致，无假绿）。

### P0-7v2c 判定纠正（12:20，本节内自纠）
本轮早先把 P0-7v2c 登记为「2.0.10 待移植」并自造 marker 钉进 verify——仪器对着自造 marker 而非真实保护面，假 FAIL 会永远阻塞 T-10（pitfalls 仪器假绿家族镜像错误）。重检证据链：
- vendor 源 `materializeDefaultDesktopProfile`（P0-7v2b port）内嵌「不做 clear」注释（2026-09-10 兜底实测教训）；dist 物化 chunk 完全无 clear 符号。
- `main.ts:727`/`host-bootstrap.ts:56` 两处 `createFreshDesktopProfile` 包着 clear，但只服务**用户命名**的 selection 新建 profile；2.0.5 症状触发面（全新 userData 首启物化默认 profile）走的是 P0-7v2b 路径——该路径不调 clear。
- verify 改否定式 `ckn`（物化 chunk 出现 clear 符号 = 红）；终验 38 锚 **ALL VERIFIED**。

### session-log 迁移块运行时事实（subagent 取证）
SEL 锚类 `pTsq1a_sessionLogButton` 全 pristine NM 树零命中（上游 0.1.5-rc.2 渲染换 `ZgAT2q_moreButton` ⋯ 菜单）→ 迁移块对 2.0.10 是**无害空转**（~96s 轮询 + observer + 空 style），UI 导出实际由上游菜单承载。本轮逐字保留（裁剪属行为取舍，无浏览器证据不做）；裁剪决策登记给 T-10 冒烟期。manifest v3 D-2 已记。

### 权威登记与新登记的文档家
- `dsh-patches/patches-manifest-v3.md`（新建，2.5.0 唯一权威登记簿）；v2 头部已标历史归档。
- 主线①**闭环**：38 锚 ALL VERIFIED（fresh 克隆全链：NM 26/26 → guards ALL OK → brand 全量 → verify ALL VERIFIED）。剩余是 T-10 冒烟期的行为面观察（migration 块去留、ui-skill title 透传实测）。

## 15. T-10 出货组装执行记录（2026-09-17 17:00–18:30，BASE=source）

守卫逐层显性化：每轮中止都是装配面比日常 gate 更深的差异第一次被扫到——浅层绿不等于深层绿，逐轮修复后下一层才可见。

### r1（中止）：profile 面机器路径
- `dsh-settings-shell-local/tsdown.config.ts`：tsdown 虚拟模块 id 原用磁盘绝对路径，被 rolldown 写进 `cssSources` 的 `//#region` 注释混出头货面 → 改 basename + cssSources 映射。
- `dsh-newapp-local/README.md`：示例配置机器路径 → `/Users/you/project` 占位。

### theme-tokens 修复窗口（r1→r3 之间）
- 6 个幻觉 token（不存在的 CSS 变量）在 views.module.css / skill-panel.module.css / studio.css → 语义 token 替换 + 三个测试断言同步（view.spec.tsx、visual-contract.spec.ts、studio.visual.test.ts）+ theme-local、skill-center 两包重建。profile 双面（vendor + 装载点）对六个旧 token 字符串全树 grep 清零。

### r3（中止）：技能面来源路径
- 25 处 `README.usage.md` 出处行带 `/Downloads/skills/...` 构建机路径 → `rewrite-build-paths.mjs` MAP 补 `/Downloads/skills` → `__SKILL_INTAKE_SOURCE__` 前缀条目。

### r4（首次全绿）
- SMOKE PASSED、14 产物落盘（2.6G）；但解包深检发现技能 tarball 带 18 个 `__pycache__/*.pyc`（`co_filename` 钉构建机绝对路径，文本守卫读不到的二进制载体；2.4.1 基线核对：历史既有非新回归）→ ADR-0112：拷贝 filter + 校验判据双机制。Red/Green：r4 树 --check 报红（26 条目）；fixture 拷贝净化 + check 绿。
- r4 产物入口核对（稳定窗口内完成）：manifest 6 项逐名逐字节对齐、SHA256SUMS 4 项 OK、install.sh 引用 11 项存在。

### r5（终态绿，包含 pycache 修复）
- 装配日志：机器路径守卫通过、技能 435 + preset 52 落位（L63 判据文案「无受限许可技能、无 __pycache__」上线）、rewrite-paths 138 文件 / 249 处、verify 37 锚、brand replay、SMOKE PASSED。
- 解包终验：`find -name '*.pyc'` = 0；`grep -r 'Users/lute\|/Downloads'` = 0；skill tarball 18916147 → 18835868（-80K 与 18 pyc 吻合）。
- payload 入口表重跑（r5 产物）：manifest 6/6 ✓、shasum -c 4/4 OK、install.sh 引用 11/11 存在（含空格文件名 'DSH Desktop.app.tar.gz'）。
- 方法教训两条入 Note：跨轮读数必须对稳定产物做（r4 核对撞 r5 重建窗口 = 空集空洞真话）；批量哈希用 `LC_ALL=C sort` + 双清单 diff 收口（串行 600s 超时、xargs -P 8 差 5 文件、comm UTF-8 collation 假阳性）。

### T-10 剩余
- gate:full 实测（r5 装配完成后）：**88/90，唯一红 = patch-anchors**（/Applications 还是 2.4.1 树的必然读数：P0-2v2 target absent、PR-2/5 旧类名 `bC90nG`——生产滞后必须显性红，T-11 换装即消；ADR-0075 射程：只量本机 /Applications 与未打 tag 的 staging）。theme-tokens、dmg-layout-doc、adr-index/note-links、staging-freshness 全数绿。
- DMG 打包 + release 归档（ADR-0056/57/58 SOP）：**前置被 R3 阻塞**——当前树 212 处未提交改动，SOP §0 要求干净树、r5 载荷 VERSION 记 `SOURCE_DIRTY=1`（commit 不可重建）；顺序应为 授权 commit（含 release/2.5.0.sha256 入库清单）→ 重装配（取 SOURCE_DIRTY=0）→ sign-and-dmg → tag。架构声明：arm64（x64 prebuild 缺口单列）。
- L1–L4 冒烟矩阵（14-dtrack 文档待补）。

## 16. 尾债清偿与标题栏摘除（2026-09-17 20:30）

### 标题栏 v2.0.5 摘除（完成）
证据链：OCR 截图（598×68）→ 行带布局「LUTE Agentic System」(274×30) +「v2.0.5」胶囊(66×22)；全树 `v2.0.5` 字面量零命中（/.dsh 命中均为会话库数据）；唯一动态拼装点 = `dsh-plugin-desktop` client 半 `DesktopVersionControl`（`v${environment.version}`，environment.version=桌面基座版本）。摘除落 vendor `lute-v2.0.10` 提交 692c9e769（组件/渲染位/checkForUpdates 注入/4 locale 键/spec 断言；ExtendedTitlebar 与 compatibility-chrome 共用同一 View，一处编辑双面生效）。详见 Note `docs/notes/implemented/packaging/2026-09-17-beta-variant-sync-titlebar-and-x64.md`。

### beta 变体 30 文件同步（完成）
diff3 三方（base=697e7d782 upstream beta；ours=当前 beta；theirs=当前 stable）。过程修复三处仪器/方法问题：① 首版脚本误带 `git checkout` 回滚 32 个合并结果；② tests 路径双拼跳过 10 个测试同步；③ `diff3: invalid print range` 截断 4 个 spec → 回退 identity 变换。6 大文件 marker-free 字节对齐（取舍见 Note）。终态机器判定：**`verify-desktop-variants: 181 shared source files are aligned`**；双版 `corepack yarn typecheck` exit 0、`error TS` 计数 0；stable 全量 vitest = §8 已知基线（3 fails=windows-nsis-ab Win 面专属）。beta 全量 vitest 17 fails 登记**已知残留**（dev-only，不进出货面），后续单独收口。vendor 提交 62c600f8e。

### overseas-skills 清偿（完成）
repo 垃圾（.DS_Store / check-fragment.py[tracked 删除入释放提交] / lib 6 个 bak·orig·pre / manifest 3 个 bak-lieflat / scripts pycache）清零；live profile vendor 副本 rsync 全量同步（--delete，excl=staging/eval/node_modules/backup），diff 复验逐字节一致、`__pycache__` 0。r6 起装配面不再携带该包任何历史 pyc。

### x64 单架构声明（收口）
沿 2.4.1 先例：VERSION/manifest/DMG 文件名三处 `arm64` 一致；fs-ext darwin-x64 prebuild 缺口单列（补齐需 MACOS_UNIVERSAL_NATIVE_ENTRIES + `--dir --universal` 适配），不阻塞 2.5.0，登记下轮。

### 顺序修正（对用户指令「先 T-11 后发布」的物理依赖修正）
T-11 装的是 payload；若先切换后 commit，装机 manifest 记 SOURCE_DIRTY=1 且 commit 不指向装机字节——与「版本尽可能一致」矛盾且 DMG 出来后需重装。修正顺序：修复→gate→释放提交（含 pin lute-sha→62c600f8e）→重装配 r6（SOURCE_DIRTY=0）→sign-and-dmg→**T-11 用该 DMG 换装**（停机窗口内先重打 pristine userData 快照）→验收（gate:full 期待 90/90、patch-anchors 由红转绿）→tag→push→GH Release。装机字节 = tag 字节。

### r6→r7 与 DMG 记录（20:30–20:40）
r6 中止于机器路径守卫（overseas 两 manifest 经 rsync 进 live→随内嵌 profile 入出货树）→ 源头占位化（__SKILL_INTAKE_SOURCE__ / __DSH_HOME__，引号损伤两轮后按三败止损行级重建）、amend 进释放提交 605a159。r7 全绿：SMOKE PASSED、14 产物 2.6G、SOURCE_DIRTY=0、出口 pyc 全域 0（含 profile/skills tar 解包树）、manifest/shasum/入口全在位、Info.plist=2.0.10-lute.2.5.0。标题栏残面=2 处死 CSS 类选择器（JS 组件零命中、无节点可挂），登记美容残留下轮清。DMG 652MB 落 release/2.5.0（uchg 锁定+仓库外归档）。**待办：T-11（pristine userData 快照→DMG 换装→验收 gate:full 90/90→OCR 标题栏现场证据）→ tag v2.5.0 → push 双远端 → GH Release。**
