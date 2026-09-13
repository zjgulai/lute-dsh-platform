# DSH Desktop × Magpie-Horch 集成打包方案（PLAN）

> 状态：**方案已定稿 + 用户确认（2026-09-01），实施中。**
> **2.2.0 更新（2026-09-12）**：交付形态定为 **DMG 单一格式**——流水线是 `assemble.sh` → `sign-and-dmg.sh`，
> `.pkg` 不再产出（`scripts/build-pkg.sh` 与 `installer/pkg-postinstall.sh` 留在树里但**无人调用**，
> 属历史 1.x 路径）。产物 `release/2.2.0/DSH-Desktop-LUTE-2.2.0-mac-arm64.dmg`（610M，
> sha256 `e74fb6d0…`），载荷冒烟 **39/39 PASSED**。故下方 2.0.0 段的「dmg+pkg 双格式产物」只描述当时。
> 本文 §2 产物定义与 §3 流水线的 1.0.0 时代数额（23 锚点冒烟等）保留为历史基线，
> **现行权威细节见 [README.md](README.md)、[INSTALL-CARD.md](INSTALL-CARD.md) 与 [CHANGELOG.md](CHANGELOG.md) 的 `[2.2.0]` 条目**。
> **2.3.x 更新（2026-09-13）**：2.3.0 起签名身份改固定证书 `LUTE Code Signing`（ADR-0063）；2.3.x 后新增
> G1/G2 运行时守卫（HMR 生产守卫 + console 转发，ADR-0065），`verify-patches-v2.sh` 锚点 38 个，
> 由 `dsh-patches/runtime-guards/apply-fixes.sh` 重放。现行权威细节见
> [README.md](README.md) 与 `dsh-patches/patches-manifest-v2.md`（G1/G2 行）。
> **2.0.0 更新（2026-09-10）**：基座已升级 DSH Desktop 2.0.5（rc.1），P0-P5 全链完成（35 补丁重锚 34 锚点 ALL VERIFIED、smoke 37/37、dmg+pkg 双格式产物）。本文件的 2.0.4 段落保留为历史基线；2.0.5 权威细节见 docs/research/07 与 dsh-patches/patches-manifest-v2.md。
> 基线：DSH Desktop 2.0.4（官方 Electron 壳）+ Magpie-Horch 全量定制层（P0 六项 + UI + 品牌 + profile 23 bundle + 技能/预设）。
> 参照：MichengAI/dsh-codex-desktop 的发布工程（可安装产物 + 免环境 + 打包后冒烟 + 版本化发布），**不照搬其自建 launcher 架构**。

## 实施进度

| 阶段 | 状态 |
|---|---|
| Phase 1 工程骨架 | ✅ 完成并验证（payload 结构门禁 + 重写脚本三模式 + 23 锚点参数化） |
| Phase 2 载荷与安装器 | ✅ 完成并验证：aeis 便携化（standalone 3.14.7 转正，实测重定位+import+server 启动）、LUTE Setup.app（swiftc）、cordis 占位替换、安装器只读卷修复；**隔离冒烟 SMOKE PASSED（23/23 锚点）** |
| Phase 3 签名与 dmg | ✅ 完成：app adhoc 深签名（剥离半成品内嵌 dsh-profile 解决 codesign）+ CFBundleVersion 后缀 + hdiutil dmg + 挂载终验 |
| Phase 4 冒烟与验收 | ✅ 自动化部分全绿（26 项断言：23 补丁 + 11 品牌 + 签名 + noema + 只读卷安装）；⏳ **GUI 真机验收待用户执行**（Setup.app 提权框 / 首启 / TCC / 目视复核） |
| Phase 5 发布物 | ✅ `release/1.0.0/DSH-Desktop-LUTE-1.0.0-mac-arm64.dmg`（475M）+ SHA256SUMS + CHANGELOG |

---

## 1. 决策记录（用户已拍板）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 打包形态 | **`.dmg` + 独立安装器 app**（`LUTE Setup.app`，swiftc 自研，带进度窗口；app 本体不加 bootstrap hook，职责分离） |
| D2 | 签名 | ~~**adhoc**（`codesign --deep --force --sign -`）；目标机右键打开/`xattr -cr` 绕过 Gatekeeper；TCC 重新授权一次~~ → **已由 [ADR-0063](../docs/adr/ADR-0063.md) 修订**：改用**固定身份的证书签名**（自签 `LUTE Code Signing`）。原方案被低估的那半句是「一次」：adhoc 的指定要求字面上就是 CDHash，TCC 授权随字节失效，代价实为**每版一次**。Gatekeeper 面（右键打开/`xattr -cr`）语义不变 |
| D3 | 官方更新通道 | **禁用更新检查**（包内改写 `app-update.yml` + 沿用 P0-1 已移除的静默执行；设置里残留入口点击后优雅失败） |
| D4 | vendors 落位 | **包内自洽**：vendor 源随 profile 落位 `~/.dsh/profiles/desktop/vendor/`，安装时重写 8 个 `file:` 依赖为 `file:./vendor/<name>`；不污染 `~/project` |
| D5 | 目标机网络 | **必须离线**：`node_modules`（475M）全量随包，目标机不跑 pnpm install；noema Rust 二进制随 node_modules 走；灵枢 venv 便携化随包（见 §4） |
| D6 | 版本 | **独立语义版本**：`1.0.0` 起，CHANGELOG.md + SHA256SUMS；GitHub Release 留待通道验证后再建 |

## 2. 产物定义

```
packaging/                        # 打包工程（本目录，随仓库版本管理）
  assemble.sh                     # 组装流水线入口（幂等，产出 staging/）
  installer/LUTE-Setup.swift      # 安装器源码（swiftc 编译为 LUTE Setup.app）
  installer/install.sh            # 安装逻辑（脱胎于现有 dist bundle 的 install.sh，离线版）
  reloc-aeis.sh                   # 灵枢 venv 便携化 + 目标机校验
  sign-and-dmg.sh                 # adhoc 重签名 + hdiutil 制作 dmg
  smoke-test.sh                   # 装后冒烟（23 锚点 + codesign verify + node --check）
  CHANGELOG.md
release/
  DSH-Desktop-LUTE-1.0.0-mac-arm64.dmg     # 最终可安装包（单 arch：arm64）
  SHA256SUMS
```

**架构锁定**：本机 arm64 → 本包为 **mac-arm64 单架构**。app 本体是 universal 二进制，但 `node_modules` 内原生依赖（noema 等）是 arm64 专属。如需 x64 版，须在 x64 机重跑 assemble。

## 3. 组装流水线（assemble.sh，复用现有 assemble-bundle.sh 逻辑）

1. **app 本体**：`tar -czf` 打包 `/Applications/DSH Desktop.app`（已含全部 checkout 直补 + 品牌，≈497M 压缩）。
2. **profile（离线全量）**：manifest + lockfile + `cordis.patch.yml` + `apply-patches.mjs` + **`node_modules`（475M，tar 保留符号链接）** + `vendor/`（9 个 fork 源，排除 node_modules/.git）+ `overrides/`。
3. **skills + presets**：`~/.dsh/skills`、`~/.agents/skills`、`~/.dsh/.agent-presets`（7 个）。
4. **灵枢 venv 便携化**：见 §4。
5. **安装器**：编译 `LUTE Setup.app` + 内嵌 payload。
6. 全程排除：sessions/storages/data/凭据（`.credentials.yaml`、`.modlens/config.json`）/`.agent-memory`——**用户数据与凭据永不随包**。

## 4. 离线专项方案

| 项 | 现状 | 离线方案 |
|---|---|---|
| profile 依赖 | 目标机 `pnpm install` 需网络 | **node_modules 全量随包**（475M→145M 压缩），安装时直接解包，**不跑 pnpm** |
| noema Rust 引擎 | npm optionalDependencies 平台包 | 已装进 node_modules → 随包走，零动作 |
| 灵枢 aeis venv | 43M，python3.14 为 homebrew 符号链接 + 二进制绝对路径链 framework（实测不可直接移植） | **python-build-standalone 3.14.7 转正**（26.6M vendored + SHA256 钉版）：可重定位基底直接作 aeis 运行时目录（免 venv 机制），拷入纯 Python 的 aeis/harness/seed_knowledge/wisdom；实测移动目录后 sys.prefix 跟随、`aeis.mcp.server` 可启动。载荷 39.7M |
| node 运行时 | apply-patches.mjs 需要 node | **零成本复用**：`ELECTRON_RUN_AS_NODE=1` 复用 app 内 Electron 二进制（冒烟实证 apply-patches + verify 全通过） |
| pnpm | — | 目标机**完全不需要** pnpm（跳过 install） |
| 构建机路径 | cordis.patch.yml 的 python/dbPath 为绝对路径 | assemble 时替换为 `__DSH_HOME__` 占位，安装时按目标机 `$HOME` 替换（冒烟断言无残留） |

## 5. 安装器行为（LUTE Setup.app）

1. 双击打开 dmg → 拖 `DSH Desktop.app`（已更名 LUTE Agentic System）到 /Applications → 运行 `LUTE Setup.app`。
2. 安装器（用户态，NSTask + 进度窗口）：
   - **提权**：仅写 `/Applications` 一步经 `osascript do shell script ... with administrator privileges`；其余全部用户态执行。
   - **幂等 + 回滚**：已有 app/profile 备份为 `*.pre-lute-<stamp>`（保留现有 install.sh 骨架），失败时 rollback 数组回滚。
   - **升级不丢数据**：改进现有 `mv` 式整体备份——备份后把 `data/` 迁回新 profile，只替换 manifest/代码面。
   - 步骤：解 app → 解 profile（含 node_modules/vendor）→ 重写 `file:` → `ELECTRON_RUN_AS_NODE` 跑 `apply-patches.mjs` → overrides 恢复 → skills/presets **合并**（不覆盖）→ 灵枢 venv 落位校验 → `verify-patches.sh` 23 锚点 → 引导 TCC 重新授权（弹系统设置）。
3. 完成即用；卸载 = 删 /Applications 下 app + `~/.dsh/profiles/desktop`（保留 data 需单独迁移，文档写明）。

## 6. 更新通道禁用

- 改写 `app.asar.unpacked/app-update.yml`：移除 provider（electron-updater 无 provider 即无检查源）。
- 依赖 P0-1（已移除静默执行更新）+ 可选：设置页「检查更新」入口点击后提示「本版本为定制版，已禁用官方更新」。
- 验收项：smoke 中断言无任何 `update.*` 网络请求（日志 grep）。

## 7. 验证（sign-and-dmg.sh + smoke-test.sh）

| 层 | 手段 |
|---|---|
| 静态 | `codesign --verify --deep --strict` 重签名后 app；`node --check` 全部改动文件；SHA256 比对 |
| 补丁面 | `verify-patches.sh`（23 锚点）+ `brand-replay.sh --check`（11 锚点）ALL VERIFIED |
| 功能面 | 隔离冒烟：`DSH_HOME=/tmp/dsh-smoke` + `APP_TARGET=/tmp/Applications-test` 跑安装器全流程 → 断言零错误 |
| GUI 验收 | 真实启动：品牌（LUTE Agentic System 词标/hero）、工具目录、技能中心、无更新弹窗、无 LAN HTTPS 告警（对照 REGRESSION-GUARD.md 8 项） |

## 8. 风险登记

| 风险 | 对策 |
|---|---|
| Gatekeeper 拦截 adhoc 签名包 | README/安装器说明：右键打开或 `xattr -cr`；预留 D2 升级到 Developer ID 的通道（签名脚本参数化） |
| TCC 权限按 bundle identity 重置 | 安装器结束自动 `open x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`；文档写明两步授权 |
| 灵枢 venv 便携化失败 | 备选：python-build-standalone + vendored wheels（§4） |
| node_modules 符号链接在 tar/dmg 中损坏 | tar 保持 symlink（已验证可行）；smoke 断言 noema/平台包可 import |
| 官方 2.0.5 发布后用户误走官方更新 | D3 已禁用；verify-patches.sh 锚点天然能检测漂移 |
| 大包传输（预计 1.3–1.6G dmg） | hdiutil 默认压缩级别即可；SHA256SUMS 保完整性 |

## 9. 阶段计划

- **Phase 1 — 工程骨架**：`packaging/` 目录、assemble.sh（复用现有逻辑 + 离线改动）、staging 布局、file: 路径重写脚本。
- **Phase 2 — 载荷与安装器**：node_modules 随包、灵枢 venv 便携化（含实测）、`LUTE Setup.app`（swiftc）、安装器幂等/提权/回滚/升级保留 data。
- **Phase 3 — 签名与 dmg**：adhoc 重签名链、`app-update.yml` 禁用、hdiutil 制 dmg、SHA256SUMS。
- **Phase 4 — 冒烟与验收**：§7 全部通过 + 用户本机真实 GUI 验收。
- **Phase 5 — 发布物**：版本号 1.0.0、CHANGELOG、release/ 目录定稿；GitHub Release 留待后续决策。

## 10. 待实测项（Phase 1–2 内闭环）

1. ✅ aeis venv 便携化 —— **转正方案通过**：python-build-standalone 3.14.7 可重定位基底（26.6M vendored + SHA256 钉版）+ 纯 Python site-packages 直拷；实测移动目录后 `sys.prefix` 跟随、`aeis.mcp.server` 可启动；载荷 39.7M。
2. ✅ noema 平台包加载 —— smoke 断言 `dsh-noema-darwin-arm64/bin/noema-mcp` 落位 + arm64 架构。
3. ✅ `ELECTRON_RUN_AS_NODE=1` 一致性 —— smoke 中 apply-patches.mjs 与 verify-patches.sh（含 `node -e` 子调用）全通过。
4. ⏳ 安装器提权 osascript 路径 —— 冒烟走免提权直写路径；真实管理员密码框交互留 Phase 4 GUI 验收。
5. ✅ dmg 体积 —— payload 665M（远低于 1.3-1.6G 预估），dmg UDZO 压缩后待 Phase 3 实测。
6. ⏳ CFBundleVersion `-lute.x` 后缀不影响 DSH 内部版本判断 —— 冒烟已断言后缀在位；GUI 启动验收时确认（Phase 4）。

## 11. 关键发现与决策（实施期新增）

- **官方首启机制**：app 首次启动若 `~/.dsh/profiles/desktop/package.json` 不存在，会把内嵌 `Resources/dsh-profile` ditto 拷贝过去（main.js:4571，唯一引用点）。
- **内嵌 dsh-profile 现状**：8-30 会话的半成品实验（17 bundles 子集、`file:./vendor/*` 命名与权威 profile 不一致、aeis-venv 含指向 homebrew 的绝对符号链接——该链接同时导致 codesign 拒绝整个 bundle）。
- **决策（2026-09-01）**：从暂存 app **剥离 `Resources/dsh-profile`**。权威 profile 由 install.sh 的 profile.tar.gz 单一提供（23 bundles + 23 锚点验证）；官方首启 ditto 在目录缺失时优雅跳过；app 瘦身约 200M 压缩体积；消除双源漂移。UX 不变（用户经 LUTE Setup.app 安装）。
