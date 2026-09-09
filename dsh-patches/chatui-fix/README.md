# DSH Desktop 2.0.4 对话页修复说明（加载更早 + ⬆️ 回填）

> 本文档描述对打包版 `DSH Desktop.app` 的 renderer 端 client bundle 的两处修复，
> 供版本升级后重放（`apply-fixes.sh`）与向上游（deepseek-harness /
> dsh-plugin-desktop 源码）提交对应 PR 使用。

---

## 修复 1：「加载更早」点击无反应

### 根因
数据管线本身健康（宿主分页 API 对真实会话数据能正确返回上一页）。
缺陷在客户端 **失败路径全部静默**：

1. `dsh-api-session-controller` 的 `loadOlder()` 有 4 条无反馈出口：
   - 守卫 `openState !== "open" || !hasMore || loadingOlder` 静默 return；
   - `events === void 0` 静默 return；
   - `prepend` 抛出的**已知失败**（`RemoteStreamError`）连 `console.error` 都不打；
   - `prepend` 无超时，请求挂起时 `loadingOlder` 永久卡 `true`。
2. 直播流失败时 `failEventStream()` 把 `openState` 置为 `"error"`，**不重置
   `hasMore`**；而聊天视图的按钮只按 `hasMore` 渲染 → 按钮照常显示，
   但每次点击都被守卫拦截 = 「点了没反应」。

### 修复内容
- `dsh-api-session-controller/lib/client.js`
  - `loadOlder()` 重写：`openState` 异常时先 `resync()` 自愈一次；
    仍不可用则写入 `openError`（复用现有 `chat.loadError` 顶部错误横幅）；
    所有失败（含已知失败）都 `console.error`；
    `prepend` 加 15s 超时（`Promise.race`），`loadingOlder` 永不卡死；
    成功后清除 `openError`。
- `dsh-client-ui-chat/lib/client.js`
  - 「加载更早」按钮渲染条件从 `hasMore` 收紧为
    `hasMore && openState === "open"`；
  - 错误横幅条件从 `openState === "error" && openError !== null`
    放宽为 `openError !== null`（prepend 失败也能看到原因）。

---

## 修复 2：输入框 ⬆️ 回填上一条自己发的消息

### 根因
该版本（官方 0.1.2-alpha.1 / Desktop 2.0.4）**未实现此功能**。
composer 的 ArrowUp 链路只服务于输入触发弹出菜单（@ 提及 / 命令），
菜单关闭时返回 `"pass"` 并回落到 Lexical 默认光标行为。

### 修复内容（新增功能，安全边界内实现）
- `dsh-api-session-controller/lib/client.js`
  - `buildSnapshot()` 新增 `lastOwnMessage`：从事件窗口倒序取最后一条
    `user/message`（`source.kind === "user"`）的纯文本（忽略图片消息，
    无文本返回 `undefined`）。
- `dsh-client-ui-conversation/lib/client.js`
  - composer keymap 的 `arrow("up")`：菜单未消费且非 IME 组合时，
    调用新增的 `handlers.recallPrevious()`，成功则 `preventDefault`；
  - `InputBar` 注册 `recallPrevious` 处理器：仅当
    **草稿为空（无文字无附件）且可编辑（非锁定/非提交中）** 时，
    经 `keyboard.paste()` 把 `lastOwnMessage` 填入输入框。
  - 触发边界：菜单打开时仍走菜单导航；输入中有文字时保持默认光标行为；
    拼音组合输入中不触发。

---

## 安全与兼容约定

| 项 | 约定 |
|---|---|
| 修改范围 | 仅 renderer 端 3 个 client bundle；**不触碰 main.js / 主进程文件** |
| 语法门 | 每次应用前 `node --check`（脚本内建） |
| 备份/回滚 | 首次应用自动备份 `<file>.orig`；`--rollback` 一键还原 |
| 生效方式 | 应用后按 **Cmd+R** 刷新渲染器即可；无需重启应用/电脑 |
| 幂等 | 二次运行检测签名后跳过 |
| 升级重放 | `./apply-fixes.sh`（锚点为 v2.0.4 稳定代码结构；若新版源码漂移，
  `--verify-anchors` 会显式报告每个锚点的匹配数，再手工适配） |
| 上游对应 | ① `dsh-api-session-controller/src/…/session.ts` 的 `loadOlder` /
  `failEventStream` / `buildSnapshot`；② `dsh-client-ui-chat/src/…/ChatView.tsx`
  的按钮与错误横幅条件；③ `dsh-client-ui-conversation/src/…/keymap.ts` +
  `InputBar.tsx` 的 `recallPrevious` 处理器 |

---

## 修复 3：会话消息「复制」按钮失效（2026-08-31）

### 根因（两层叠加）
1. 主进程 `lib/electron-runtime-DS52LbUW.js` 的权限处理器对一切权限 `callback(false)`，
   拒绝 `navigator.clipboard.writeText` 所需的 `clipboard-sanitized-write`；
2. 渲染端 `@deepseek-ai/dsh-client-ui-primitives/lib/index.js` 的 `writeClipboard`
   在 `writeText` 被拒后 `return false`、不尝试 `execCommand` 兜底。

### 修复（两层配合）
- 主进程：权限处理器改为放行 `clipboard-sanitized-write` / `clipboard-write`，其余仍拒绝；
- 渲染端：`writeClipboard` 恢复「writeText 优先、失败再 `execCommand` 兜底」。

### 关键教训
- `dsh-client-ui-primitives` 是**共享依赖模块**，宿主启动时打进缓存 bundle，**Cmd+R 不重载**——
  改它必须完整重启应用（只有带 `window.__ModuleLoader__.load` 包装的插件 client.js 才被 Cmd+R 热取）。
- 此 Electron 沙箱里 `execCommand('copy')` 会返回 true 但**不写剪贴板**，不能作为主路径。

### 回滚
- `lib/electron-runtime-DS52LbUW.js.orig`、`@deepseek-ai/dsh-client-ui-primitives/lib/index.js.orig`
  各自覆盖还原后重启。
