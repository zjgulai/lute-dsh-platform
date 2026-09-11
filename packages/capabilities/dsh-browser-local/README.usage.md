# dsh-browser · alpha.1 源码移植说明（本地端口 0.0.3-alpha.1-port）

> 本文件是移植记录。上游：https://github.com/Lum1104/dsh-browser（MIT，539★）。上游 README 保留不动。

## 一、使用方法

- **宿主侧（已就绪）**：桥已装在 desktop profile——`ws://127.0.0.1:43120/ext/bridge` 升级路由 + `/ext/bridge-config` 发现端点 + 11 个 `browser_*` 工具（snapshot/click/type/press/scroll/navigate/back/forward/reload/get_text/wait）全部注册；首启已生成 token（`~/.dsh/ext-bridge-token`，0600）
- **扩展侧（待装）**：Chrome 加载未打包扩展 `extensions/dsh-browser/`（仓库源码）→ 打开侧边栏自动发现桥 URL → 粘贴 token（loopback + chrome-extension:// 源可免 token）→ 即可在 Chrome 侧边栏操作 DSH、让 AI 控制你指定的标签页
- **典型用法**：会话中说「打开 xx 网页帮我操作」，AI 通过 browser_snapshot 读页面 → 按编号 click/type 执行；扩展侧每次动作都在你明确控制的标签页里进行

## 二、移植记录（rc → alpha.1 逐项映射，全链路已验证 2026-08-31）

原包崩溃根因：值导入 `@deepseek-ai/dsh-host-apiproxy`（rc 独有，alpha.1 已改名）。本次移植的完整映射：

| rc 面 | alpha.1 替代 | 落点 |
|---|---|---|
| `ctx.apiProxy` 服务 | `ctx.typertGateway`（TypertGatewayService，服务注入名 `typertGateway`） | inject 改为 `['webServer','typertGateway','tools','agents']` |
| `toFetchHandler(ctx.apiProxy)` | 本地 `toFetchHandler(api, gateway)`：**按 rc 原名路由**（`session.history` → 包装器的 `history`，不是映射名 `page`）；未被包装器拥有的方法才走 `dispatchRpc` 泛型分支 | `src/apiproxy-shim.ts` |
| rc 点号方法名 | **alpha 斜杠端点**：`session.create`→`session/create`；`session.history`→`session/page`（toEndpoint 自动转换，`$events*` 除外） | 同上 |
| 平铺 args | **双层包裹 `{request: {...}}`**：alpha 控制器描述符的统一 wire 参数名是 `request`；`invoke({namespace, method, args:{request}}) 直调`（dispatchRpc 会吞掉 zod 明细，invoke 抛错带 cause） | 同上 |
| `api.events.mux(...)` | `gateway.openWireStream('$events', {args:{}})`；`ready` 帧记录 clientId，`emit` 帧转发 `{type: frame.event, event: frame.args}`，`waterfall` 帧转发后自动回 ack（`$events/result` outcome next） | 同上 |
| `session.history {sessionId}` | **两步适配**：① `session/list` 取该会话 `projections.asOfSeq` 当 throughSeq ② `session/page {address:{kind:'session',sessionId}, throughSeq}` ③ `records[{type:'event',event}]` 重构成 rc `events[{event}]`（hasMore/projections 透传） | 同上 |
| `session.prompt` | alpha 必填 `requestId`——shim 自动注入 uuid；`{mode:'queue', content}` 与 alpha schema 同源 | 同上 |
| `RpcId/MuxFrame/RpcRequest/ApiProxy` 类型 | 本地重定义（RpcId 带运行时构造器 `RpcId(uuid)`） | 同上 |
| `InvariantInstaller` 伴生插件 | 删除（no-op 伴生，alpha InvariantRegistry 无对应注册需求） | 移除 src/invariant.ts + exports |
| rc devDependencies | file: 指向 app vendored alpha 包 + `src/shims.d.ts` 声明面（vendored 不带 .d.ts）+ noImplicitAny 关闭 | package.json / tsconfig |
| webserver 路由 | `register({kind,path,handler})` / `registerUpgrade({path,handler})` 形状不变 ✅ | 无改动 |
| 扩展侧 | ① `DISCOVERY_PORTS` 加本机端口 43120（桌面随机分配后持久化）② devDep 改指零依赖 protocol 存根包 `dsh-bridge-protocol-local`（避开 file: 链把 vendored 包的内部 devDeps 卷进解析导致 404） | `dsh-browser-extension-local/src/background/index.ts` + `package.json` |

**构建**：`pnpm install && pnpm run build`（tsc → lib/types → tsdown → lib/index.js + lib/protocol.js）。产物零 rc 导入（唯一 "dsh-host-apiproxy" 命中是注释文档）。

## 三、迭代优化方向

1. **扩展侧真机联调**：装扩展 → 走通「面板连桥 → 建会话 → 发消息 → browser_* 工具驱动标签页」全链路（当前宿主侧已验证，扩展侧未测）
2. **wire shape 核对**：`session.create/page/prompt` 的 alpha 返回形状与 rc 扩展的期望可能有差异（如 create 返回值字段），真机联调时逐项核对，必要时在 shim 加 reshape
3. **上游升级重放**：上游出新版时 diff bridge src，把 rc 用法按本表重新映射；构建后 file: 重装即可
4. **回滚**：移除依赖+bundles 两条目 → pnpm install → 重启（快照 `package.json.bak-1788230137`）
