# dsh-im · 本地安装说明（4.1.0，npm 安装 · L4 实测）

> 本文件是本机安装说明。上游：https://github.com/xmanrui/dsh-im（MIT，988★）。上游 README.md 保留不动。

## 一、使用方法

- **入口**：设置 → 「IM机器人」（排在 Agent 预设之后，order 21）
- **九渠道**：飞书 / 微信 / 钉钉 / 企业微信 / QQ / Slack / Telegram / Discord / WhatsApp——扫码、App Manifest 或已有机器人凭据接入；每个渠道可接多个机器人，各自独立的连接状态、工作区与会话绑定
- **AI Office Connector**：本机主动连接公网 AI Office（SSE 下行 + 任务租约），无需公网 IP
- **机器人命令**（私聊）：`/help` `/new` `/status` `/model` `/reasoning` `/preset` `/workspace` `/session` `/stop` `/steer` `/batch` `/send` `/compact` `/repair` 等 40+
- **其它**：每卡片可切工作区/Preset、检查连接发测试消息、重试/移除接入；图片（JPEG/PNG/WebP/GIF，单张 5MB）与结果文件回传

## 二、相关说明

- **安装**：npm 依赖 `@xmanrui/dsh-im@4.1.0` + bundles 条目；安装前已按协议快照 profile（`package.json.bak-1788072504`、`cordis.patch.yml.bak-1788072504`）
- **兼容性评估**（2026-08-29，全绿）：
  - 崩溃级阻断检查通过：依赖零 `@deepseek-ai` 遮蔽；host 全打包（无命名导出风险）；patch 纯 insert；engines node>=22.19（本机 v26）
  - 版本适配：README 明确新版走 Typert Gateway / Session Controller / Workspace Controller（与本机 0.1.2-alpha.1 一致）；Desktop 兼容/扩展/增强三模式均可用，无需开浏览器访问
  - 唯一观察点：client inject 含 `dsh-client-runtime`（本机已改名 client-store），dsh-better-sidebar 同款 inject 运行正常 → loader 容忍，实测通过
  - 仓库自带测试：1936 通过 / 0 失败（10.8s）
- **安全**：所有 Secret/Token 只写本机凭据存储；浏览器只拿二维码、Manifest、脱敏状态，RPC 不回传任何密钥
- **更新**：设置 → IM机器人 → 右上「检查更新」（仅查 npm 官方源）；安装后需手动重启桌面端
- **回滚**：移除依赖与 bundles 条目 → pnpm install → 重启（快照可整体还原）
- **许可证**：MIT

## 三、迭代优化方向

1. **真机渠道联调**：接入一个真实机器人（如飞书扫码）走通「IM 消息 → Harness 任务 → 流式回传」全链路（L4 未覆盖项，需用户凭据与扫码）
2. **宿主行状态精确读取**：插件清单页为虚拟列表，dsh-im 行状态标签未通过 DOM 文本抓到（图形读取遇视觉服务限流）；下次可滚动列表后截图
3. **IM 页视觉走查**：截图已留档，待视觉服务恢复后复核布局
4. **上游追踪**：988★ 今日仍在提交；更新频繁（今天 05:08Z 有推送），注意 CHANGELOG
