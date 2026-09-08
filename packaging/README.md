# packaging/ —— DSH Desktop × Magpie-Horch 集成打包工程

> 方案与决策：见 `PLAN.md`。本目录产出**可安装包**（Phase 3 起为 `.dmg`）。

## 目录

```
packaging/
  PLAN.md                      # 方案定稿（六项用户决策 + 阶段计划 + 风险登记）
  assemble.sh                  # 组装流水线（本机跑，产出 staging/<VERSION>/payload）
  installer/install.sh         # 目标机离线安装器（随包 payload 根，幂等/回滚/保留数据）
  scripts/rewrite-file-deps.mjs  # file: 依赖路径重写（包内自洽，决策 D4）
  scripts/reloc-aeis.sh        # 灵枢 venv 便携化（Phase 2 实现）
  staging/<VERSION>/           # 生成物：payload（暂存，不入库）
  release/<VERSION>/           # 生成物：签名后 dmg + SHA256SUMS（Phase 3 起）
```

## 阶段状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 1 | 工程骨架（assemble + 离线载荷 + 安装器 + file: 重写） | ✅ 完成并验证 |
| Phase 2 | 灵枢 venv 便携化（standalone 转正）+ LUTE Setup.app（swiftc） | ✅ 完成；隔离冒烟 SMOKE PASSED |
| Phase 3 | adhoc 重签名 + dmg + SHA256SUMS | ✅ 完成（1.1.0 dmg 645M + 挂载终验） |
| Phase 4 | 隔离冒烟（31 锚点全绿 + 完整性清单）+ GUI 验收 | ✅ 自动化部分完成；⏳ GUI 真机验收待用户 |
| Phase 5 | 版本 1.1.0 + CHANGELOG + release 定稿 | ✅ `release/1.1.0/DSH-Desktop-LUTE-1.1.0-mac-arm64.dmg` |

## dev 机当前状态（2026-09-05，待打包入 1.2.0）

| 插件 | 版本 | 新功能 |
|---|---|---|
| `dsh-file-upload` | 0.2.0-local | Codex 风格三 Tab 附件面板（文件·技能·应用），LoopX Goal 入口集成 |
| `dsh-loopx-plugin` | 0.1.1-beta.4（官方） | GoalBar + loopx CLI 隔离安装（`~/.agents/runtime/`） |

**profile bundles**：28 个（较 1.1.0 新增 `dsh-loopx-plugin`）。

**bundles 规则**（已血验）：有 `dsh.bundle.patch` 的插件只写包名一次；子入口由 cordis.patch.yml 自动处理，手动追加触发白屏。

---

## R2b 架构（1.1.0）

- 内嵌 `Resources/dsh-profile`（首启 ditto 兜底）+ 安装器权威升级；新增主进程补丁 **P0-7**（首启占位替换）。
- 补丁锚点 23→**31**（+P0-7 + chatui 界面修复 + skill 中文标题 + 剪贴板兜底）。
- 完整性硬断言：`completeness.json` 权威清单（**25 bundles** / 12 vendor / 154 skills / 12 presets）逐一比对。⚠️ 打 1.2.0 时需更新为 28 bundles。
- 方案定稿：见 `SOLUTION.md`。

## 组装（本机）

```bash
VERSION=1.0.0 ./assemble.sh                    # 产出 staging/1.0.0/payload
./scripts/smoke-test.sh staging/1.0.0/payload  # 隔离冒烟（/tmp 环境）
./sign-and-dmg.sh staging/1.0.0/payload 1.0.0  # 产出 release/1.0.0/*.dmg
```

环境覆盖：`DSH_APP`（默认 /Applications/DSH Desktop.app）、`DSH_HOME`（默认 ~/.dsh）、`DSH_VENDOR`（默认 ~/project/Magpie-Horch）。

产物 `payload/`：
- `DSH Desktop.app.tar.gz` —— 已补丁 app（app-update.yml 禁用更新 + `CFBundleVersion=2.0.4-lute.<ver>` + adhoc 深签名；已剥离半成品内嵌 dsh-profile）
- `profile.tar.gz` —— manifest（file: 已重写 `./vendor/...`）+ 离线 node_modules + vendor + overrides + `__DSH_HOME__` 占位
- `skills-presets.tar.gz`、`aeis-portable.tar.gz`、`LUTE Setup.app`、`install.sh`、`tools/`、`SHA256SUMS`、`VERSION`、`manifest.json`

## 关键约束（来自 PLAN.md 决策）

- **目标机完全离线**：不跑 pnpm；node 运行时 = `ELECTRON_RUN_AS_NODE=1` 复用 app 内 Electron 二进制。
- **升级保留数据**：安装器只替换包拥有的 manifest/代码面，profile `data/`、自装技能/预设不动。
- **官方更新通道已禁用**（暂存 app 的 `app-update.yml` 被清空）。
- **单架构 arm64**：node_modules 内原生依赖为 arm64，x64 需在 x64 机重跑 assemble。

## 目标机安装（Gatekeeper 必读）

包为 **adhoc 签名、未公证**（Developer ID 公证是付费通道，未启用），macOS Gatekeeper
会对下载分发的 dmg 施加隔离属性（quarantine）。本版安装器**解包后自动清除**，
因此**推荐终端一条命令安装**：

```bash
cd "/Volumes/DSH Desktop LUTE 1.2.0" && bash install.sh
```

- **切勿用 sudo 运行**：root 会污染 `~/.dsh` 属主，导致后续安装无法覆盖而反复回滚
  （安装器已内置 sudo 拒绝与 root 残留检测，会直接中止并给出修复命令）。
- GUI 方式（备选）：双击 `LUTE Setup.app`；被 Gatekeeper 拦时**右键 → 打开**。
- 版本核对：`cat VERSION`（含 BUILD 构建号），dmg 的 SHA256 与发布方公告对照。
- 分发建议：U 盘/局域网拷贝不会带 quarantine；网盘/微信下载则靠安装器自动清除。
- 安装完成后重新授权 TCC（录屏/辅助功能/自动化），并重启 DSH Desktop。
