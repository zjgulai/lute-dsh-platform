# LUTE Agentic System 安装卡（客户版）

**版本**：1.2.0 · BUILD 20260908-r7 · 仅支持 Apple 芯片 Mac（macOS 13+）

---

## 方式一：双击安装（推荐，无需终端）

1. 双击 `DSH-Desktop-LUTE-1.2.0-mac-arm64.pkg`
2. 若弹出「无法验证开发者」：**右键点 pkg → 打开 → 弹框再点「打开」**
3. 安装向导一路「继续」→ 输入电脑开机密码 → 「安装」
4. 提示「安装成功」即完成

## 方式二：终端安装（dmg）

1. 双击 dmg 挂载，打开「终端」粘贴：

```bash
cd "/Volumes/DSH Desktop LUTE 1.2.0" && bash install.sh
```

2. 写 /Applications 一步弹密码框，输入开机密码即可。

---

## 安装完成后（两步，必做）

1. **重启 DSH**：启动台打开「LUTE Agentic System」
2. **授权 TCC**：系统设置 → 隐私与安全 → 屏幕录制 / 辅助功能 / 自动化，勾选 LUTE Agentic System

## 验证安装成功

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "/Applications/DSH Desktop.app/Contents/Info.plist"
# 应显示：2.0.4-lute.1.2.0
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
dmg SHA256: 45243367e37c92f01a626b4d8c4505bc570da7027a837586b14a7a1d4c216a04
pkg SHA256: cf1b65ed028338e54da62cddf86d32e3a8119ee0faac16a4b9a7fb5d2efff2b9
```
