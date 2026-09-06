# LUTE 集成打包解决方案（定稿 v2 · 已实施 1.1.0）

> 状态：**方案定稿 + 实施完成（2026-09-04）**。1.1.0 已按本方案全链路产出并四验通过。
> 产物：`release/1.1.0/DSH-Desktop-LUTE-1.1.0-mac-arm64.dmg`（645M）。
> 基线：`packaging/PLAN.md`（v1）+ 1.0.0 dmg；本稿为其架构重评审与全维度决策的定稿。
> 参照：MichengAI/dsh-codex-desktop。

---

## 1. 目标与验收标准

把「官方 DSH Desktop.app（2.0.4）+ Magpie-Horch 全量定制层（P0 补丁 + 品牌 + 23 bundle profile + 技能/预设 + 灵枢运行时）」集成为一个**可安装、可升级、可验证**的桌面产品包。

**DoD**：① 双击即装、零环境依赖；② 升级不丢数据（sessions/记忆库/凭据/自装技能）；③ 装后自动校验（23 补丁 + 11 品牌 + 签名 + 灵枢）；④ 官方更新不覆盖定制层；⑤ 同一工程可复现同版本（SHA256 可复算）。

## 2. 决策总表（两批，2026-09-01）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 架构路线 | **R2b**：内嵌 dsh-profile 完整自举 + 安装器权威升级，同源流水线防双源漂移 |
| D2 | 内嵌 profile 处置 | 随 D1：**修复**（补 vendor、23 bundles 对齐权威版、aeis 换 standalone），不再剥离 |
| D3 | 签名与分发 | **adhoc 长期**（自用/小团队；目标机右键打开 + 一次性 TCC 重授；工程保留 Developer ID 切换参数） |
| D4 | 版本体系 | **独立语义版本 1.x** + `CFBundleVersion=2.0.4-lute.<ver>` |
| D5 | 更新通道 | **官方更新保持禁用 + 手动分发升级**（无自建 updater） |
| D6 | 平台 | **mac arm64 为主**；x64 低成本跟进（x64 机/CI 重跑 assemble）；Windows 为独立二期（明确不做一期） |
| D7 | 工程化 | **本机三连脚本**（assemble→smoke→dmg）；CI 矩阵列为可选演进，前置条件=源资产固化 |
| D8 | 包形态 | **仅 dmg**（不做 zip 便携版、不做在线瘦身版） |
| — | 升级语义 | **安装器统一升级**（替换包拥有项、保留 data）；内嵌 profile 仅首启兜底 |

## 3. 架构：R2b 详解

```
┌─ DSH Desktop.app（已补丁 + 品牌 + adhoc 签名）
│   └─ Resources/dsh-profile ── 内嵌 profile（与 profile.tar.gz 同一份内容）
│        ├─ package.json（file:./vendor/*，包内自洽）
│        ├─ node_modules（离线全量 475M）
│        ├─ vendor/（8 个 fork 源）
│        └─ cordis.patch.yml（__DSH_HOME__ 占位）
│   └─ main.js 首启 hook（新增补丁锚点，见 §4-P1）
│
├─ LUTE Setup.app / install.sh ── 安装器（权威路径）
│        app 落位 → profile.tar.gz 落位（升级覆盖）→ 占位替换 → apply-patches
│        → skills/presets 合并 → aeis 落位 → 23+11 锚点校验
│
└─ 载荷：profile.tar.gz（与内嵌同源）+ aeis-portable.tar.gz + skills-presets.tar.gz
```

**两条使用路径**：
- **拖 app 即用（兜底）**：首次启动 → 官方 ditto 机制把内嵌 profile 拷到 `~/.dsh/profiles/desktop` → 新增首启 hook 把 `__DSH_HOME__` 替换为真实 home → 核心功能可用（灵枢需 aeis 载荷，此时降级并给出安装器指引——兜底语义：核心可用，完整功能走安装器）。
- **完整安装（权威）**：LUTE Setup.app 一键完成全部（含灵枢、技能/预设、锚点校验）。

**同源保证**：内嵌 profile 与 profile.tar.gz 由**同一条 assemble 流水线同一份 staging 产物**产出（一个内容两个落位），smoke 断言两处 file 清单一致——不是双源维护。

## 4. 实施方案（相对 1.0.0 基线的差异）

### P1 内嵌 profile 同源化（核心改动）
1. assemble.sh 的 profile staging 产物同时落到两个位置：`payload/profile.tar.gz` 与暂存 app 的 `Resources/dsh-profile/`（恢复此前剥离的位置，内容=权威版：23 bundles、file:./vendor、`__DSH_HOME__` 占位、**aeis 换 standalone 载荷**——不沿用 8-30 的 homebrew 符号链接）。
2. **新增 app 主进程补丁（登记为 P0-7）**：`main.js` 首启 ditto 成功后，把 profile 内 `cordis.patch.yml` 的 `__DSH_HOME__` 替换为 `app.getPath("home")/.dsh`。同步登记：`dsh-patches/patches-manifest.md` + `verify-patches.sh` 新锚点 + 实施后整机验证。
3. app.tar.gz 体积预期：307M → ~500M（恢复 node_modules+vendor；aeis 不进内嵌，见 §5-风险-1）。

### P2 安装器与冒烟
- 安装器逻辑**不变**（1.0.0 已三验）；smoke 增加：
  a) 「内嵌 ≡ profile.tar.gz」一致性断言（两处 file 清单 diff 为空）；
  b) 「仅拖 app」用例的静态断言（内嵌结构完整 + P0-7 hook 锚点存在 + 占位符在列）；
  c) 其余 26 项断言保持。
- 版本号 1.1.0：`CFBundleVersion=2.0.4-lute.1.1.0`，CHANGELOG 记录。

### P3 发布与验收
- 产出 `release/1.1.0/DSH-Desktop-LUTE-1.1.0-mac-arm64.dmg` + SHA256SUMS + 升级须知（TCC 重授、右键打开、锚点自检）。
- GUI 真机验收清单（LUTE Setup 提权框 / 首启 ditto + 品牌目视 / TCC 重授 / 灵枢 12 工具 / noema 状态 / 一次真实对话）。

### P4（可选跟进，另行启动）
- mac x64 版：x64 机重跑 assemble（node_modules 原生依赖换架构）。
- GitHub Actions CI：源资产固化（已补丁 app 与 profile 版本化入库/对象存储）后对齐参考仓库的 tag→打包→冒烟→Release。
- Developer ID 切换：签名参数化已就绪，按分发需要启用。

## 5. 风险登记（定稿版）

| 风险 | 缓解 |
|---|---|
| 内嵌 profile 使 app.tar.gz 回 500M，dmg 增重 | 预期 dmg ~600M；全离线已是既定决策（D8），体积换免环境 |
| P0-7 首启 hook 是官方 main.js 上的新补丁面 | 登记入 patches-manifest + verify 锚点；官方升级后漂移可探测；升级重放纪律同现有 P0 补丁 |
| 「仅拖 app」场景灵枢不可用（aeis 不在内嵌） | 兜底语义明确：核心可用、灵枢降级 + 安装器指引；文档写明 |
| 双落位漂移 | 同源流水线 + smoke 一致性断言（P2-a） |
| adhoc 签名 Gatekeeper/TCC | 分发文档固化「右键打开 + 一次性重授」步骤；Developer ID 切换参数保留 |
| 官方 2.0.5+ 发布 | 升级前跑 verify-patches.sh 漂移探测；patches-manifest.md 唯一登记簿 |

## 6. 维护约定

- 构建：本机 `VERSION=1.x.y ./assemble.sh → scripts/smoke-test.sh → sign-and-dmg.sh`。
- 分发：手动渠道（网盘/私仓库），附带 SHA256SUMS 与 CHANGELOG。
- 官方更新通道：app 内永久禁用（app-update.yml + P0-1 + 升级须走 LUTE 安装器）。
- 数据与凭据：永不随包；升级只替换包拥有项。

## 7. 当前状态

- 方案定稿 ✅（本文件）；1.0.0 基线 ✅；**R2b 实施完成（1.1.0 ✅）**。
- 产物：`release/1.1.0/DSH-Desktop-LUTE-1.1.0-mac-arm64.dmg`（645M）。
- 四验：隔离冒烟 31 锚点全绿 + 25 bundles 逐一存在 + 12 vendor / 154 skills / 12 presets 清单比对 + 内嵌 ≡ 安装后 profile 双落位一致 + 从 dmg 只读卷真实安装验证通过。
- 待办：GUI 真机验收（用户项：LUTE Setup.app 提权框 / 首启 ditto + 品牌目视 / TCC 重授 / 灵枢 12 工具 / noema 状态 / 一次真实对话）。
