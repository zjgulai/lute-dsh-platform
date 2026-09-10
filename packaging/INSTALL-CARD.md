# LUTE Agentic System 安装卡（客户版）

**版本**：2.0.0 · DSH 基座 2.0.5（rc.1）· 仅支持 Apple 芯片 Mac（macOS 13+）

---

## 方式一：双击安装（pkg · 主交付格式，无需终端）

1. 双击 `DSH-Desktop-LUTE-2.0.0-mac-arm64.pkg`
2. 若弹出「无法验证开发者」：**右键点 pkg → 打开 → 弹框再点「打开」**
3. 安装向导一路「继续」→ 输入电脑开机密码 → 「安装」
4. 提示「安装成功」即完成

## 方式二：终端安装（dmg · 备用，高级用户）

1. 双击 dmg 挂载，打开「终端」粘贴：

```bash
cd "/Volumes/DSH Desktop LUTE 2.0.0" && bash install.sh
```

2. 写 /Applications 一步弹密码框，输入开机密码即可。

---

## 安装完成后（两步，必做）

1. **重启 DSH**：启动台打开「LUTE Agentic System」
2. **授权 TCC**：系统设置 → 隐私与安全 → 屏幕录制 / 辅助功能 / 自动化，勾选 LUTE Agentic System

## 验证安装成功

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "/Applications/DSH Desktop.app/Contents/Info.plist"
# 应显示：2.0.5-lute.2.0.0
```

## 完整性校验（安装前）

本包 pkg 未签名（与 App 侧 adhoc 策略一致），完整性由发布页校验清单承担：

```bash
# 下载目录里对比发布页公示的哈希（SHA256SUMS / PKG-SHA256SUMS）
shasum -a 256 DSH-Desktop-LUTE-2.0.0-mac-arm64.pkg
# 与 GitHub Release 页面的 PKG-SHA256SUMS 值一致方可安装
```

---

## 常见问题

| 现象 | 处理 |
|---|---|
| 双击 pkg / Setup.app 打不开 | 右键 → 打开（未公证包的标准绕过） |
| 安装报 Operation not permitted | 本版已自动处理；重跑一次安装器即可 |
| 反复回滚装不上 | 之前用 sudo 装过：`sudo chown -R $(whoami) ~/.dsh/profiles ~/.dsh/aeis-venv` 后重装 |
| 升级旧版 | 直接装新版即可，会话数据自动保留 |

**注意**：安装器全程**不要用 sudo 运行**（会污染用户目录属主）。

---

**文件校验**（可选，确认包完整）：

```text
dmg SHA256: d74af5bc06a242909e072eaefda1b72c3b749404eb33f7d414e8ab80bc1b5f76
pkg SHA256: cd826c477999c4b9a4da831944a91c8abf3c13c8f80f1c6029c6b4fffa17340d
```
