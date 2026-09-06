# LUTE DSH Desktop 打包过程复盘（1.0.0 → 1.1.0）

> 两轮打包的深度分析，作为创建「打包发布 skill」的事实基础。

## 1. 两轮时间线

| 轮次 | 版本 | 日期 | 产物大小 | 方案 | 关键事件 |
|---|---|---|---|---|---|
| 1 | 1.0.0 | 2026-09-01 | 475M | R1：剥离 dsh-profile + 独立安装器 | 6 项用户决策 → 5 阶段实施 → 26 断言冒烟 → 只读卷安装验证 |
| 2 | 1.1.0 | 2026-09-04 | 645M | R2b：内嵌 dsh-profile 首启兜底 + 安装器权威 | 2 批决策（9 项）→ 深挖参考仓库 → P0-7 首启 hook → 完整性清单 → 31 断言冒烟 |

## 2. 架构演化（关键设计决策）

### 1.0.0（R1 基线）
- **形态**：app 补丁重打包（剥离 dsh-profile）+ 独立安装器全权装 profile
- **优点**：零风险（不碰 app 首启机制）、已验证
- **缺点**：只拖 app 不跑安装器 → 无 profile、体验割裂

### 1.1.0（R2b 架构）
- **形态**：内嵌 `Resources/dsh-profile`（首启 ditto 自举）+ 安装器权威升级，**同源流水线**（一份 staging 内容两个落位）
- **关键实现**：
  - 新增主进程补丁 **P0-7**（main.js 首启 ditto 后替换 `__DSH_HOME__` 占位）
  - 内嵌 node_modules 排除 `.bin`（避断链阻塞 codesign `--deep --strict`）
  - `completeness.json` 权威清单（25 bundles / 12 vendor / 154 skills / 12 presets）
- **代价**：app.tar.gz 307M→483M，dmg 475M→645M

### 1.0.0 中「剥离 dsh-profile」的根因
- 内嵌 `Resources/dsh-profile` 是 8-30 会话的**半成品实验**（17 bundles 子集 + aeis 绝对符号链接 → `/opt/homebrew`）
- 该绝对符号链接导致 `codesign --deep --strict` 拒绝整个 bundle
- 1.1.0 修复：用权威 staging 内容**同源注入**内嵌 profile，aeis 换 standalone 载荷

## 3. 踩坑清单（全部已被自动化守卫）

| # | 坑 | 根因 | 守卫 |
|---|---|---|---|
| 1 | codesign 拒绝 bundle | 内嵌 dsh-profile 含绝对符号链接（aeis→homebrew） | assemble 绝对符号链接扫描 + 断链扫描 |
| 2 | codesign 拒绝 bundle（第二类） | `node_modules/.bin` 含断链（node-which/cloudflared） | assemble 排除 `.bin` + 断链扫描 |
| 3 | noema status-route 漂移 | profile 重装后 P0-5 补丁丢失 | verify-patches 31 锚点（含 P0-5 noema `ok` 锚点） |
| 4 | `file:./vendor/` 计数硬编码 | 8→11（profile 更新后 file: 依赖新增） | smoke 动态计数（= completeness.vendor.length-1） |
| 5 | dsh-base/web-app 不在 profile node_modules | 官方 bundle 随 app 分发，在 app node_modules | smoke 双路径查找（profile + app node_modules） |
| 6 | install.sh 临时目录在 dmg 只读卷 | `$HERE/.install-staging` 在挂载卷上不可写 | 迁入 `$DSH_HOME_DIR/.lute-install`（用户可写区） |
| 7 | 安装器提权判定硬编码 `/Applications` | smoke 的 `APP_TARGET=/tmp/...` 导致 `[ -w /Applications ]` 误判 | 改为 `[ -w "$(dirname "$APP_TARGET")" ]` |
| 8 | sign-and-dmg.sh PKG_ROOT 多退一层 | 脚本在 packaging/ 根（非 scripts/），`..` 退到 Magpie-Horch 根 | 改为 `dirname "$0"` |

## 4. 验证体系

### 层次模型

```
L1 门禁：assemble 自检（绝对符号链接 / 断链 / codesign verify）  ← 构建机
L2 冒烟：隔离安装（/tmp）+ 完整性断言 + 补丁/品牌锚点 + 签名  ← 构建机
L3 只读卷：dmg 挂载后真实用户路径安装验证                       ← 构建机
L4 GUI 验收：真机安装 + 首启 + TCC 重新授权 + 目视复核          ← 用户
```

### 断言矩阵（1.1.0 最终态）

| 类别 | 数量 | 工具 |
|---|---|---|
| 补丁锚点（P0-1..P0-7 + chatui + skill-title + clipboard） | 31 | `verify-patches.sh` |
| 品牌锚点（显示名 / 词标 / Info.plist） | 11 | `brand-replay.sh --check` |
| Bundle 逐一存在 | 25 | completeness.json + smoke node |
| Vendor 逐一存在 | 12 | 同上 |
| Skills 清单比对 | 154 | 同上 |
| Presets 清单比对 | 12 | 同上 |
| 双落位一致性 | 1 | `diff -rq --exclude node_modules --exclude cordis.patch.yml` |
| P0-7 hook 锚点 | 1 | smoke grep |
| 签名有效性 | 1 | `codesign --verify --deep --strict` |
| aeis 便携化 | 1 | `reloc-aeis.sh --check` |
| SHA256SUMS | 1 | `shasum -c` |
| noema 架构 | 2 | file + arch check |
| 文件完整性 | 数项 | 逐一 assert |

## 5. 工具清单

### 构建链（packaging/）
| 文件 | 功能 | 输入 | 输出 |
|---|---|---|---|
| `assemble.sh` | 汇编流水线 | dev 机 app + profile | `staging/<VERSION>/payload/` |
| `sign-and-dmg.sh` | 签名 + dmg | payload 目录 | `release/<VERSION>/` |
| `scripts/smoke-test.sh` | 隔离安装冒烟 | payload 目录 | 断言报告 |
| `scripts/rewrite-file-deps.mjs` | file: 路径重写 | profile package.json | 包内自洽版 |
| `scripts/reloc-aeis.sh` | 灵枢 venv 便携化 | 构建机 aeis site-packages | aeis-portable.tar.gz |
| `scripts/build-setup-app.sh` | GUI 安装器编译 | installer/LUTE-Setup.swift | LUTE Setup.app |
| `installer/install.sh` | 目标机安装器 | payload 载荷 | 已安装 app+profile |
| `installer/LUTE-Setup.swift` | GUI 安装器源码 | - | swiftc 编译 |

### 补丁面（dsh-patches/）
| 文件 | 功能 |
|---|---|
| `verify-patches.sh` | 31 锚点漂移检测（已参数化 `DSH_APP`/`DSH_HOME`/`LING_SRC`） |
| `brand-replay.sh` | 11 品牌锚点（已参数化） |
| `patches-manifest.md` | 补丁权威登记簿（P0-1..P0-7 + UI/UX + preset + 界面完整性） |
| `chatui-apply-fixes.sh` | chatui 加载更早 + 按钮门 + recall 回填 |
| `assemble-bundle.sh` | 补丁资产打包（供 assemble 引用） |

### 文档面
| 文件 | 内容 |
|---|---|
| `SOLUTION.md` | 架构方案定稿（9 项决策 + 风险登记 + 实施路线） |
| `PLAN.md` | 1.0.0 基线记录（6 项决策 + 5 阶段实施） |
| `CHANGELOG.md` | 版本历史 |
| `README.md` | 工程入口文档 |
| `RETROSPECTIVE.md` | 本文件 |

## 6. 决策框架（提炼自两轮）

### 每次打包发布必经的决策点

1. **版本号**：独立语义版本 1.x + `CFBundleVersion=2.0.4-lute.<ver>`
2. **架构确认**：R2b（当前定稿；若重新评审则走 SOLUTION.md 的四路线对比）
3. **签名**：adhoc（当前；Developer ID 切换参数保留）
4. **更新通道**：禁用官方（当前）
5. **平台**：mac arm64（当前；x64 低成本跟进）
6. **分发载体**：dmg（当前）
7. **增量变更审查**：哪些补丁面/锚点/完整性清单需要更新？
8. **验收门禁**：L1→L4 逐层通过

### 发布的「就绪定义」（Definition of Ready）

- [ ] `verify-patches.sh` 在 dev 机 31 锚点全绿
- [ ] `brand-replay.sh --check` 在 dev 机 11 锚点全绿
- [ ] CHANGELOG 已更新
- [ ] patches-manifest.md 已同步（如有新补丁）
- [ ] assemble.sh 版本号已更新
- [ ] 磁盘空间 ≥ 6G（assemble 前置校验）

## 7. 可作为 skill 自动化的环节

| 可自动化 | 说明 |
|---|---|
| 预检（pre-flight） | 磁盘空间、锚点全绿、版本号一致、CHANGELOG 已更新 |
| 组装 | `VERSION=x.y.z ./assemble.sh`（单命令，约 8 分钟） |
| 冒烟 | `./scripts/smoke-test.sh <payload>`（自动断言，约 5 分钟） |
| 制 dmg | `./sign-and-dmg.sh <payload> <version>`（约 3 分钟） |
| 只读卷终验 | 挂载 dmg → 安装 → 验签 → 卸载（约 5 分钟） |

| 不可自动化（需用户参与） | 说明 |
|---|---|
| 版本号决策 | 语义版本 1.x 递增 |
| 新补丁登记 | 需人工判断新补丁的锚点字符串 |
| GUI 真机验收 | 首启、TCC、目视复核 |
| 分发 | 手动渠道（当前决策） |

## 8. 关键约束（skill 必须遵守）

1. **构建机 = 源机器**：assemble 依赖本机 `/Applications/DSH Desktop.app`（已补丁）和 `~/.dsh/profiles/desktop`（当前运行 profile）。skill 不能假设 CI 环境。
2. **离线**：目标机免 node/pnpm/Python；node_modules 随包 474M。
3. **adhoc 签名**：目标机首次启动需右键打开（Gatekeeper），TCC 每次重装后需重授。
4. **升级保护**：安装器只替换包拥有项，data/（sessions/记忆库/凭据）不动。
5. **官方更新禁用**：app-update.yml 清空 + P0-1 移除执行路径。