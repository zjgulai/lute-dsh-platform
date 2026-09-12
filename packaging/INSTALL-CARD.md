# LUTE Agentic System 安装卡（客户版）

**版本**：2.2.0 · DSH 基座 2.0.5（runtime 0.1.2-rc.1）· 仅支持 Apple 芯片 Mac（macOS 13+）

> 交付格式：**只有 DMG**。本版起不再提供 `.pkg`——历史文档里「pkg · 主交付格式」的说法已作废：
> 全仓没有任何 `.pkg` 产物，继续承诺它等于让客户拿着一个不存在的文件名去核对。

---

## 安装（两种方式，任选）

### 方式一：终端一条命令（推荐，最省事）

1. 双击 `DSH-Desktop-LUTE-2.2.0-mac-arm64.dmg` 挂载
2. 打开「终端」，粘贴：

```bash
cd "/Volumes/DSH Desktop LUTE 2.2.0" && bash install.sh
```

3. 写 `/Applications` 一步会弹管理员密码框，输入即可；**其余全程用户态**
4. **切勿用 `sudo` 运行**：sudo 会污染 `~/.dsh` 的属主，之后无法覆盖安装

### 方式二：双击 LUTE Setup.app

挂载 DMG → 双击 `LUTE Setup.app` → 按向导走（进度可见）。

---

## 首次打开会被 Gatekeeper 拦（未公证包的标准现象，务必先读）

本版是 **adhoc 签名、未公证**，所以：

| 你看到的 | 处置 |
|---|---|
| 双击 DMG 后「Apple 无法检查其是否包含恶意软件」 | **右键点 DMG → 打开 → 弹框再点「打开」** |
| 双击 `LUTE Setup.app` 被拦 | 同上：右键 → 打开 |
| 安装后启动 app 被拦 | 同上：右键 → 打开 |

终端方式（方式一）不受影响：安装器会在解包后**自动清除**隔离属性（quarantine）。

---

## 安装完成后（两步，必做）

1. **重启 DSH**：启动台打开「LUTE Agentic System」
2. **重新授权 TCC**：系统设置 → 隐私与安全 → 屏幕录制 / 辅助功能 / 自动化，
   勾选「LUTE Agentic System」

> 为什么必须重授：app 的签名身份变了，旧的 TCC 授权不会被继承。

---

## 验证安装成功

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "/Applications/DSH Desktop.app/Contents/Info.plist"
# 应显示：2.0.5-lute.2.2.0
```

## 完整性校验（安装前）

DMG 未公证，完整性由**发布方公示的 SHA256** 承担：

```bash
shasum -a 256 DSH-Desktop-LUTE-2.2.0-mac-arm64.dmg
# 与发布页公示值一致方可安装
```

打包侧的权威清单（与 dmg 同目录）：`release/2.2.0/SHA256SUMS`。
载荷内部还有一层自校验（`payload/SHA256SUMS`：四个 tar.gz + 安装器），安装前可先跑
`shasum -a 256 -c SHA256SUMS`。

---

## 本版可见变化（客户需要知道的）

- **技能中心从 1600+ 张卡收敛到约 540 张**：只随包「被岗位 / 映射引用」的技能，
  并剔除一个许可受限（PolyForm 非商用）的技能。少掉的是评估语料，不是能力。
- **输入框上方两个胶囊移除**；输入框下方新增「所选岗位的能力层级」横向列，
  点卡片会把该技能预填进输入框。
- 安装器升级只替换**包拥有**的 manifest / 代码面；`profile` 的 data、
  以及你自己装的技能与预设不受影响。

---

## 常见问题

| 现象 | 处理 |
|---|---|
| 双击 dmg / Setup.app 打不开 | 右键 → 打开（未公证包的标准绕过，见上） |
| 安装报 Operation not permitted | 本版已自动处理；重跑一次安装器即可 |
| 反复回滚装不上 | 之前用 sudo 装过：`sudo chown -R $(whoami) ~/.dsh/profiles ~/.dsh/aeis-venv` 后重装 |
| 升级旧版 | 直接装新版即可，会话数据自动保留 |
| 首启「长时间没反应」 | 首启要物化约 1G 的 profile（内嵌兜底），耐心等；之后启动是秒级 |

---

**包内文件**

```text
DSH Desktop.app.tar.gz   已补丁 app（品牌 / 补丁 / 官方更新通道禁用）
profile.tar.gz           profile manifest + 离线 node_modules + vendor
skills-presets.tar.gz    技能 + 预设
aeis-portable.tar.gz     灵枢 Python 运行时（可重定位，目标机免装 Python）
LUTE Setup.app           GUI 安装器
install.sh               命令行安装器（与 Setup.app 等价）
tools/                   校验与品牌工具（verify-patches-v2.sh / brand-replay.sh / …）
VERSION / SHA256SUMS / manifest.json / README.md
```
