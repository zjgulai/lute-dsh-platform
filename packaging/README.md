# packaging/ —— DSH Desktop × Magpie-Horch 集成打包工程

> 方案与决策：见 `PLAN.md`。本目录产出**可安装包**（Phase 3 起为 `.dmg`）。

## 目录

```
packaging/
  PLAN.md                      # 方案定稿（六项用户决策 + 阶段计划 + 风险登记）
  INSTALL-GUIDE.md             # **安装手册（用户版）**：逐步操作 / 授权两项 / 失败对照表（随包分发，版本号打包时注入）
  INSTALL-CARD.md              # 安装卡（客户版）：一页速查，指向手册
  assemble.sh                  # 组装流水线（本机跑，产出 staging/<VERSION>/payload）
  installer/install.sh         # 目标机离线安装器（随包 payload 根，幂等/回滚/保留数据）
  installer/LUTE-Setup.swift   # GUI 安装向导（swiftc 编译；**自己定位安装载荷**，见 ADR-0066）
  scripts/setup-app-locate-test.sh  # 向导定位逻辑的自测（含 App Translocation 布局的回归）
  scripts/rewrite-file-deps.mjs  # file: 依赖路径重写（包内自洽，决策 D4）
  scripts/reloc-aeis.sh        # 灵枢 venv 便携化（Phase 2 实现）
  scripts/release-verify.sh    # 「已发布版本的产物还在吗」的唯一判据（门禁 release-artifacts-intact 调它）
  scripts/release-restore.sh   # 从仓库外归档 / 外部副本找回产物（先对 git 清单的哈希，对不上拒收）
  staging/<VERSION>/           # 生成物：payload（暂存，不入库）
  release/<VERSION>/           # 生成物：签名后 dmg + SHA256SUMS（Phase 3 起）；发布后 uchg 锁定，不可删除（ADR-0067）
                               #   （仓库外另有一份归档：$HOME/Library/Application Support/LUTE/releases/<版本>/）
```

## 阶段状态（历史里程碑，保留备查）

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 1 | 工程骨架（assemble + 离线载荷 + 安装器 + file: 重写） | ✅ 完成并验证 |
| Phase 2 | 灵枢 venv 便携化（standalone 转正）+ LUTE Setup.app（swiftc） | ✅ 完成；隔离冒烟 SMOKE PASSED |
| Phase 3 | 签名 + dmg + SHA256SUMS | ✅ 完成（2.3.x 为固定证书深签名） |
| Phase 4 | 隔离冒烟 + 完整性清单 + GUI 验收 | ✅ 自动化部分完成 |
| Phase 5 | 版本化 + CHANGELOG + release 定稿 | ✅ 持续（当前最新 `release/2.3.1.sha256`） |

## dev 机当前状态（2026-09-13）

- **已装 app**：`/Applications/DSH Desktop.app` = 2.0.5-lute.2.3.0 + G1/G2 运行时守卫（`LUTE Code Signing` 深签名，`codesign --verify --strict` 通过）。
- **补丁面**：`verify-patches-v2.sh` **38 锚点** ALL VERIFIED（含 G1 HMR 生产守卫 / G2 console 转发，见 [ADR-0065](../docs/adr/ADR-0065.md)）；`runtime-guards/apply-fixes.sh` 管理 G1/G2 的重放与体检。
- **profile bundles**：40 个（见 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`；出货投影由 assemble 现算）。
- **出货版本**：2.3.0（固定证书签名，ADR-0063）/ 2.3.1（build 20260913-125353）。

---

## 架构要点（2.3.x）

- 内嵌 `Resources/dsh-profile`（首启 ditto 兜底）+ 安装器权威升级；主进程补丁 P0-7（首启占位替换）、P0-7v2c（wizard 状态保护）、G1/G2（运行时守卫）。
- 补丁锚点 **38**（`verify-patches-v2.sh`，含 G1/G2）；品牌面由 `brand-replay.sh --check` 校验；完整性由 `completeness.json`（出货投影现算，不存第二份清单）。
- 方案定稿：见 `PLAN.md`（1.0.0 时代数额保留为历史基线，2.0.5 权威细节见 `dsh-patches/patches-manifest-v2.md`）。

## 组装（本机）

```bash
VERSION=2.3.1 ./assemble.sh                    # 产出 staging/2.3.1/payload
./scripts/smoke-test.sh staging/2.3.1/payload  # 隔离冒烟（/tmp 环境）
./sign-and-dmg.sh staging/2.3.1/payload 2.3.1  # 产出 release/2.3.1/*.dmg
```

环境覆盖：`DSH_APP`（默认 /Applications/DSH Desktop.app）、`DSH_HOME`（默认 ~/.dsh）、`DSH_VENDOR`（默认 ~/project/Magpie-Horch）。

产物 `payload/`：
- `DSH Desktop.app.tar.gz` —— 已补丁 app（app-update.yml 禁用更新 + `CFBundleVersion=2.0.5-lute.<ver>` + `LUTE Code Signing` 深签名；含 P0 系补丁与 G1/G2 运行时守卫）
- `profile.tar.gz` —— manifest（file: 已重写 `./vendor/...`）+ 离线 node_modules + vendor + overrides + `__DSH_HOME__` 占位
- `skills-presets.tar.gz`、`aeis-portable.tar.gz`、`LUTE Setup.app`、`install.sh`、`tools/`、`SHA256SUMS`、`VERSION`、`manifest.json`

## 关键约束（来自 PLAN.md 决策）

- **目标机完全离线**：不跑 pnpm；node 运行时 = `ELECTRON_RUN_AS_NODE=1` 复用 app 内 Electron 二进制。
- **升级保留数据**：安装器只替换包拥有的 manifest/代码面，profile `data/`、自装技能/预设不动。
- **官方更新通道已禁用**（暂存 app 的 `app-update.yml` 被清空）。
- **单架构 arm64**：node_modules 内原生依赖为 arm64，x64 需在 x64 机重跑 assemble。

## 交付形态（2.2.0 起：DMG 单一格式）

- **唯一交付**：`DSH-Desktop-LUTE-<ver>-mac-arm64.dmg`——挂载后终端 `bash install.sh`
  或双击 `LUTE Setup.app`，两者共用同一 payload，面向无终端客户。
  客户侧的逐步操作一律以 [INSTALL-GUIDE.md](INSTALL-GUIDE.md) 为唯一 home（本 README 只讲打包面）。
- **`.pkg` 不再是交付面**：2.2.0 流水线（`assemble.sh` → `sign-and-dmg.sh`）不产出它，
  `release/<ver>/` 只有 DMG。`scripts/build-pkg.sh` 与其 `pkg-postinstall.sh` 仍留在树里
  但**无人调用**（历史版 `1.x` 的交付路径）；`PKG-SHA256SUMS` 同此，历史文档里的说法对 2.2.0 及以后不成立。
- **2.3.0 起签名身份 = 固定证书**（`LUTE Code Signing`，ADR-0063）：TCC 授权按证书 leaf 延续，升级不再重授；
  Gatekeeper 面不变（未公证、自签）。
- SHA 记录于 `SHA256SUMS`。
- 二进制产物不上 git，发布走 GitHub Releases 附件（`gh release`）。

## 目标机安装（Gatekeeper 必读）

> 客户侧的完整步骤见 [INSTALL-GUIDE.md](INSTALL-GUIDE.md)（唯一 home）；这里只列打包侧必须知道的少数几条。

包**未公证**（Developer ID 公证是付费通道，未启用）。2.3.0 起签名身份从 adhoc 改为固定证书
（自签 `LUTE Code Signing`，见 [ADR-0063](../docs/adr/ADR-0063.md)）——但**自签不等于被信任**，
Gatekeeper 面与从前一样：macOS 会对下载分发的 dmg 施加隔离属性（quarantine）。本版安装器
**解包后自动清除**，因此**推荐终端一条命令安装**：

```bash
cd "/Volumes/DSH Desktop LUTE <版本>" && bash install.sh
```

- **切勿用 sudo 运行**：root 会污染 `~/.dsh` 属主，导致后续安装无法覆盖而反复回滚
  （安装器已内置 sudo 拒绝与 root 残留检测，会直接中止并给出修复命令）。
- GUI 方式（备选）：双击 `LUTE Setup.app`；被 Gatekeeper 拦时**右键 → 打开**。
  **未公证包从挂载的 dmg 里双击必然被 macOS 随机重定位（App Translocation）**——向导本体
  被复制到随机只读位置运行，同级目录因此没有载荷。向导自己会到挂载卷上找（ADR-0066），
  这条路径由 `scripts/setup-app-locate-test.sh` 守着（含该布局的回归）。
- 版本核对：`cat VERSION`（含 BUILD 构建号），dmg 的 SHA256 与发布方公告对照。
- 分发建议：U 盘/局域网拷贝不会带 quarantine；网盘/微信下载则靠安装器自动清除。
- 安装完成后重新授权 TCC（只需**辅助功能**与**屏幕录制**两项——不要授「输入监控」，它并非必需），并重启 DSH Desktop。
