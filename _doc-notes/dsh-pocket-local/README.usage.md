# dsh-pocket · 本地安装说明（2.8.0，npm 安装 · L4 实测通过）

> 本文件是本机安装说明。上游：https://github.com/shaobeichen/dsh-pocket（GPL-2.0，811★）。上游 README.md 保留不动。

## 一、这是什么

手机扫码同屏访问 DSH：电脑上跑 dsh，手机扫码即同步访问（局域网 + Cloudflare 公网隧道，实时同屏）。一个包、一个设置页。

## 二、使用方法

- **入口**：设置 → 「手机访问」（dsh-pocket 设置页）
- **局域网**（默认「自动（推荐）」模式）：手机与电脑同 WiFi，扫码局域网地址；页面显示访问密码（8 位，可自定义/恢复出厂重置）
- **公网**：点开「公网访问」即起 Cloudflare trycloudflare 快速隧道（随机域名、无需账号）；地址模式可选「随机域名（默认）/固定域名」；「关闭公网」即时下线
- **控制**：页面上有 刷新 / 重启 / 关闭 按钮；「恢复出厂设置」清空本机配置并重设随机密码（不影响 DSH 会话/模型/插件配置）

## 三、桌面端前置条件（⚠️ 关键，2026-08-30 实测排障）

**症状**：手机扫码 → 输入密码 → 白屏显示 `forbidden`（403，9 字节）。

**根因**：DSH Desktop 的连接栅栏只认两种请求——Electron 渲染器（私有 `x-dsh-desktop-renderer` header，插件不可见）或「普通浏览器」。普通浏览器放行条件硬编码为：

```
desktopBrowserAccessEnabled = (mode === 'compatibility') && (openBrowser || networkExposure === 'lan')
```

本机原配置 `mode: advanced` + `openBrowser: false` + `networkExposure: loopback` → 手机请求一律 denied → 403。advanced 模式还缺网页版 ui-layout（即使放行也白屏），所以 pocket 官方同样声明「advanced 模式手机访问暂不支持」。

**修复（已执行）**：设置 → 桌面设置 → 模式选「兼容模式」（重启生效）→ 开启「允许在浏览器中打开」（即 openBrowser，仅 compatibility 下可开，实时生效）。当前 `~/.dsh/settings.yaml`：

```yaml
dsh-desktop:
  mode: compatibility
  openBrowser: true
  networkExposure: loopback
```

**回退**：设置 → 桌面设置 → 模式切回「增强模式」（advanced）即还原旧桌面布局；手机访问随之失效。

## 四、实测结论（2026-08-30，L4 分层测试 + 公网隧道实测）

| 关卡 | 结果 |
| --- | --- |
| 插件行激活 | ✅ state `2`（active）；运行时 `connection` 服务 PRESENT |
| 设置页渲染 | ✅ 「手机访问」子页完整（局域网/公网两区、密码、二维码 canvas、模式选择器） |
| 局域网监听 | ✅ DSH 进程监听 `*:3081`，HTTP 200 |
| PIN 门禁（LAN + 公网） | ✅ 错误 PIN → 表单报错；正确 PIN → 302 授权跳转 |
| 启动令牌握手 | ✅ `?dsh-pocket-auth=1` → 上游签发 authority 绑定 `dsh-auth` cookie → 200 完整应用（316KB，`<title>DeepSeek Harness</title>`，polyfill 注入） |
| 公网隧道（外网视角） | ✅ trycloudflare 云端抓取 200 PIN 页；公网 PIN 经边缘 302 → 握手 200 应用页 |
| 隧道开关 | ✅ 「开启公网」→ cloudflared 拉起 + 公网 PIN 轮换；「关闭公网」→ 外网 530（隧道不存在），局域网不受影响 |
| 静态资源/同屏通道 | ✅ 应用根 + JS bundle 均 200；WS/API 路径由应用自身发现（与 auth cookie 绑定） |

**已知行为**：公网 URL 与公网 PIN 在「每次开启公网 / 桌面端重启」时自动轮换（安全设计）；用前看「手机访问」页当前值。真机最后一跳（手机浏览器实际渲染）建议用户扫码确认。

## 五、相关说明

- **⚠️ 安全面（重要）**：URL 即访问权，扫码传播即访问权传播；公网隧道为随机 URL 但可被扫描发现。两层均有 8 位 PIN 门禁；仅在可信场景使用，不用时「关闭公网」
- **兼容性评估**：崩溃级阻断检查全绿（依赖无 @deepseek-ai 遮蔽、host 零命名导出风险、client require 全基线、patch 仅 insert）
- **许可证**：GPL-2.0（用户安装使用无限制）
- **安装**：npm 2.8.0 依赖 + bundles 条目（lib 已提交无需构建）；安装前已按协议快照 profile（`package.json.bak-1788066245`）
- **回滚**：移除依赖与 bundles 条目 → pnpm install → 重启（快照可整体还原）
- **更新**：改依赖版本号 → pnpm install → 重启

## 六、迭代优化方向

1. ~~connection 服务实测~~ → ✅ 运行时存在、插件行激活
2. ~~授权后握手 403~~ → ✅ 根因=桌面端 advanced+openBrowser 门控；已切 compatibility + openBrowser 修复，LAN/公网全链路 200
3. **真机扫码**：手机实际打开公网地址 + PIN，确认渲染与实时同步（curl 已证到应用 HTML 层）
4. **公网隧道长测**：trycloudflare 稳定性/速度需观察；长期公网使用建议换自有 cloudflared 隧道或固定域名
5. **移动端 UX**：上游含移动端导航/抽屉/布局适配（client/mobile/），可实测手机端交互
6. **上游追踪**：811★ 活跃（今天仍在提交）；更新频繁，注意 CHANGELOG
