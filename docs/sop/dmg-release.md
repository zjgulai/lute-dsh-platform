# SOP · DSH Desktop × Magpie-Horch DMG 打包发布

> 适用范围：从本仓库源码构建并发布 macOS arm64 版 DMG。
> 决策来源：[ADR-0056](docs/adr/ADR-0056.md)、[ADR-0057](docs/adr/ADR-0057.md)、[ADR-0058](docs/adr/ADR-0058.md)。
> 相关脚本：`packaging/assemble.sh`、`packaging/sign-and-dmg.sh`。

## 0. 发布前检查清单

- [ ] 当前在仓库 `main` 分支且工作树干净（`git status --short` 为空）。
- [ ] 本次改动的 ADR 与 Note 已落盘，`docs/adr/README.md` 索引已更新。
- [ ] 项目级 `pnpm run gate` 通过（退出码 0）。
- [ ] `vendor/dsh-desktop.pin` 的 `lute-sha` 与 `vendor/dsh-desktop` 当前 HEAD 一致。
- [ ] 磁盘剩余空间 ≥ 6 GB。
- [ ] 目标版本目录 `packaging/release/<VERSION>/` 不存在；若存在且必须重制，使用 `--force`。

## 1. 环境准备

```bash
# corepack 路径（node 26 不自带）
export COREPACK="$HOME/.lute-toolchain/node_modules/.bin/corepack"
[ -x "$COREPACK" ] || ( npm i --prefix ~/.lute-toolchain corepack )

# 默认变量（按需覆盖）
export DSH_APP="/Applications/DSH Desktop.app"
export DSH_HOME="$HOME/.dsh"
export DSH_VENDOR="$HOME/project/Magpie-Horch"
export VERSION="2.3.0"          # 按语义版本规则递增
```

## 2. 装配 payload

```bash
cd "$DSH_VENDOR/packaging"
VERSION="$VERSION" ./assemble.sh
```

预期产物：

- `staging/$VERSION/payload/DSH Desktop.app.tar.gz`
- `staging/$VERSION/payload/profile.tar.gz`
- `staging/$VERSION/payload/install.sh`
- `staging/$VERSION/payload/tools/`
- 装配日志：`/tmp/lute-package-dir.log`

**若失败**：根据脚本输出定位；常见失败点：

1. `pin 门禁失败` → 对齐 `vendor/dsh-desktop.pin` 与 submodule HEAD。
2. `electron 二进制缺失` → 脚本会自动经 npmmirror 安装；失败则手动执行 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`。
3. `package:dir 失败` → 看 `/tmp/lute-package-dir.log` 尾部。
4. `打包源指纹不一致` → 装配期间有另一个会话改动了 live profile；停止并发改动后重跑。

## 3. 隔离冒烟（可选但强烈建议）

```bash
# 若存在 smoke-test.sh
./scripts/smoke-test.sh "staging/$VERSION/payload"
```

冒烟在 `/tmp` 隔离环境进行，验证安装器、首启、关键锚点。若同机已有 DSH 实例在跑，首启测试会跳过——这是预期行为（同机双实例会互相干扰）。

## 4. 签名并制 DMG

```bash
./sign-and-dmg.sh "staging/$VERSION/payload" "$VERSION"
```

产物：

- `packaging/release/$VERSION/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg`
- `packaging/release/$VERSION/SHA256SUMS`
- `packaging/release/$VERSION/VERSION`
- `packaging/release/$VERSION/manifest.json`
- 仓库根 `release/$VERSION.sha256`（入库清单，已进 git）

**若版本目录已存在**：脚本会拒绝。必须重制时加 `--force`：

```bash
./sign-and-dmg.sh "staging/$VERSION/payload" "$VERSION" --force
```

旧产物会被归档到 `packaging/release/.archive/`，不会被删除。

### 签名身份（受门禁保护的构建输入，ADR-0063）

`assemble.sh` 用**固定身份的证书**给 app 深签名；证书缺失或不可用即**失败**，不得回退 adhoc
（回退等于静默恢复「TCC 授权随字节失效」这一缺陷，且失败方向恰是最糟的一种：产物照出、权限照丢）。

| 项 | 值 |
| --- | --- |
| 证书名（CN，也是 `--sign` 的取值） | `LUTE Code Signing` |
| 类型 | 自签代码签名证书（免费、离线可建、无外部依赖；非 Developer ID，故 Gatekeeper 面不变） |
| 建立 / 重建 | `packaging/scripts/ensure-signing-identity.sh` |
| SHA-256 指纹 | `7B:82:6F:76:BD:8A:0C:42:F7:AC:3A:70:8F:5B:D9:54:4B:34:C5:42:56:89:67:A9:A6:BD:03:7B:45:93:F9:E3` |
| 有效期至 | **2036-09-10**（10 年）；到期会以「签不出来」的形式暴露，届时续建并重授一次 TCC |

**私钥只在构建机钥匙串**，不进仓库、不进 profile、不进任何 Markdown（ADR-0008）。上表登记的是可公开的
身份信息，用途是「换机重建时确认是不是同一个身份」——指纹一致，TCC 授权才谈得上延续。

**重建身份（或换机）等于换身份**：TCC 条目按新身份重建，需重授一次。所以别为了「清一遍」随手重建证书；
只有确认指纹与上表不符时才动手。

复核身份（判据机读，两条都要）：

```bash
# ① 装配面（制 dmg 前即可验）
codesign -d -r-  "packaging/staging/$VERSION/app/DSH Desktop.app"         # 指定要求：不得出现 cdhash
codesign -dv --verbose=2 "packaging/staging/$VERSION/app/DSH Desktop.app" | grep Authority
# ② 交付面（挂载 dmg 后解包复核；sign-and-dmg.sh 的终验已自动做这一步）
```

`Authority=` 为空即说明产物是 adhoc——正是 ADR-0063 要消除的形态。出厂冒烟
（`packaging/scripts/smoke-test.sh`）已把这两条连同「指定要求可读出」（防空判据假绿）做成断言。

## 5. 终验

### 5.1 签名验证

```bash
codesign --verify --deep --strict \
  "packaging/release/$VERSION/DSH Desktop.app"
```

应返回无错误。

### 5.2 挂载与内容验证

```bash
hdiutil attach "packaging/release/$VERSION/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg" -nobrowse
ls /Volumes/"DSH Desktop LUTE $VERSION"/
# 应看到 DSH Desktop.app 与 Applications 快捷方式
hdiutil detach /Volumes/"DSH Desktop LUTE $VERSION"
```

### 5.3 哈希核对

```bash
cd "packaging/release/$VERSION"
shasum -a 256 -c SHA256SUMS
# 应全部 OK
cat "release/$VERSION.sha256" | head   # 仓库根清单
```

### 5.4 首次启动（真机或干净虚拟机）

1. 把 DMG 里的 app 拖到 `/Applications`。
2. 退出所有已运行的 DSH 实例。
3. 临时移走或重命名现有 `~/.dsh`，模拟新用户首启。
4. 打开 app，10 秒内应完成 profile 物化并进入主界面。
5. 检查关键功能：侧边栏新应用按钮、至少一个核心插件面板。

## 6. 发布

1. **提交入库清单**：仓库根 `release/$VERSION.sha256` 必须随源码一起提交。
2. **打 tag**：清单提交后再打 tag，tag 才担保得住字节。

   ```bash
   git add release/$VERSION.sha256
   git commit -m "release: $VERSION dmg manifest"
   git tag -a "v$VERSION" -m "DSH Desktop LUTE $VERSION"
   ```

3. **分发 DMG**：上传 `packaging/release/$VERSION/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg`。
4. **飞书/内部文档登记**：记录 SHA256、 tag、 source_commit（从 `manifest.json` 读取）。

## 7. 红线与回滚

- **禁止直接修改已发布目录**：`packaging/release/$VERSION/` 只能是「不存在」或「完整通过终验」。任何中间态必须发生在 `release/.staging.XXXXXX`。
- **禁止把机器绝对路径带出仓库**：出货树出现新的构建机路径（如 `/Users/lute/...`）时 `scan-machine-paths.mjs` 会中止；若必须新增，先更新 `machine-path-baseline.json` 并说明理由。
- **重制必须 --force**：普通重跑会失败，防止意外覆盖已交付产物。
- **回滚**：旧版本 DMG 始终保留在 `packaging/release/.archive/` 中，可直接取回。

## 8. 常见异常

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `pin 门禁失败` | `vendor/dsh-desktop.pin` 与 submodule HEAD 不一致 | 更新 pin 或 checkout 到 pin 的 sha |
| `打包源指纹不一致` | 装配期间 live profile 被并发改动 | 停止其他会话改动后重跑 |
| `scan-machine-paths 失败` | 出货树出现新的机器路径 | 检查新增 file: 依赖或源映射注释，必要时更新基线 |
| `codesign --verify` 红 | 签名后又被修改 | 重新执行 sign-and-dmg.sh |
| 首启卡在 profile-composition | 同机有旧实例在跑 | 退出旧实例或换干净环境测试 |
| DMG 挂载后 app 无法打开 | quarantine 属性 | 右键 → 打开一次，或 `xattr -d com.apple.quarantine` |

## 9. 版本号规则

- LUTE 集成包独立语义版本，格式 `MAJOR.MINOR.PATCH`，与 DSH 基座版本解耦。
- 基座升级（如 2.0.5 → 2.0.6）通常升 MINOR。
- 补丁重锚或打包流程修复通常升 PATCH。
- 破坏性结构变化（如交付格式切换）升 MAJOR。
