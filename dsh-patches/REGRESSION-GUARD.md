# 安全修复回归防护清单（Regression Guard）

> 教训来源：P0-6「权限全拒」导致复制按钮失效（navigator.clipboard.writeText 被拒），
> 8/30-31 由另一会话修复。**任何安全/权限收紧必须附带「允许清单」与「功能回归验证」。**

## 规则（每次安全改动前先读）

1. **永远用允许清单，不用一刀切**：`setPermissionRequestHandler` 默认拒绝，但必须显式列出合法能力
   （当前正确示例：`callback(permission === "clipboard-sanitized-write" || permission === "clipboard-write")`）。
2. **每个被拒的权限都要回答**：「哪个正常功能依赖它？」（clipboard→复制按钮、notifications→通知、media→音视频）。
3. **改动后跑回归清单**（下表），任何一项失败即回滚。

## 功能回归清单（每次主进程权限/CSP/路由改动后执行）

| # | 功能 | 验证法 |
|---|---|---|
| 1 | 复制按钮（消息/代码块） | 点复制 → 粘贴到别处确认内容正确 |
| 2 | 粘贴图片到输入框 | 贴图 → 图能进入附件区 |
| 3 | 外部链接打开 | 点链接 → 外置浏览器打开（mailto 白名单） |
| 4 | 通知（任务完成/失败） | 触发一次任务完成通知 |
| 5 | 文件保存对话框（下载） | 触发一次「保存」流程 |
| 6 | 诊断导出 | `--export-diagnostics` 产出 zip 且不含 .dmp |
| 7 | LAN/HTTPS 面板 | 设置页无新告警 |
| 8 | composer 布局 | 药丸与发送键同行、贴底（本轮修复的回归点） |

## 历史回归记录

| 时间 | 改动 | 回归 | 修复 |
|---|---|---|---|
| 2026-08-30/31 | P0-6 权限全拒 | 复制按钮失效 | 放行 clipboard-write + writeClipboard execCommand 兜底 |
