# worktable-fence · 给上游 dsh-worktable 打信任栅栏

**事实家**：本目录是 `dsh-worktable` 信任栅栏补丁的唯一权威。上游行为、缺口的取证、判据设计都在这里，
别处只留链接（ADR-0009）。

## 为什么需要这个补丁

上游 `dsh-worktable` v0.3.3（sha `2f4f6c8`）的 `src/index.ts` 注册 8 条 HTTP 路由 + 1 条 WebSocket
升级路由，**一条都不校验来源**。逐条取证的结果：

| 路由 | 缺口 | 后果 |
| --- | --- | --- |
| `GET /api/worktable/file` | `pathResolve(p)` 收任意绝对路径，无根约束 | **任意文件读取**；按扩展名回 `text/html` → 本机 origin 上的存储型 XSS |
| `GET /api/worktable/site` | 根 token 由请求方给（可为 `/`） | 同上，目录级 |
| `POST /api/worktable/write` | 任意路径 + 任意内容，`writeFile` 会创建 | **任意文件写入** → 写 `~/.zshrc` 或 LaunchAgent 即 RCE |
| `POST /api/worktable/mkdir` | 任意路径（仅要求父目录存在） | 任意目录创建 |
| `POST /api/worktable/fs` | 任意目录列举 | 任意目录枚举 |
| `POST /api/worktable/git` | `cwd` 来自请求体 | 任意仓库状态读取 |
| `GET /api/worktable/workspaces` | 读 `workspace.json` | 本地数据读取 |
| `WS /api/worktable/term` | 升级握手不校验 `Origin` | **浏览器不对 WebSocket 施加同源策略** → 任意网页可开 `ws://127.0.0.1:<port>/api/worktable/term` 拿到交互式 shell |

**「本机插件所以安全」不成立**：回环监听 ≠ 可信。DNS rebinding 绕过 Host 判据；跨站请求带
`Sec-Fetch-Site: cross-site`；WebSocket 升级带外来 `Origin` 且浏览器不做同源检查。

**「平台已经有栅栏了」同样不成立**——这是本条栅栏存在的**核心事实**（ADR-0030）。DSH 自己在
`/api` 上有一条总闸，但它注册成**前缀**，而路由匹配**先查 exact 表**：

```js
// dsh-client-connection/lib/index.js:707
{ kind: "prefix", path: "/api", handler: ... }   // isTrustedApiRequest → 403；browserAuth → 401
// dsh-host-webserver/lib/index.js:322
match(pathname) { const exact = this.exact.get(pathname); if (exact !== void 0) return exact; ... }
```

插件注册的 `/api/worktable/*` 是 **exact**，因此**压过**平台那条前缀，**绕开 DSH 自己的来源栅栏
与浏览器会话认证**；升级表更是独立 Map，平台侧一条判据都没有。

实测（`pnpm run accept:worktable-fence` 阶段 C，用平台 `/api` 前缀的行为替身在场做对照）：

| 请求 | 结果 | 说明 |
| --- | --- | --- |
| `/api/worktable/health` | **200** | exact 压过前缀——插件确实绕开了平台栅栏 |
| `/api/worktable/file?path=/etc/passwd` | **403** · `path-outside-allowed-roots` | 拒绝出自**本栅栏**（reason 是它的） |
| `/api/worktable-not-ours` | **401** `unauthorized` | 平台前缀仍在生效（排除「平台栅栏没装上」） |

**结论：本栅栏是唯一防线，不是纵深里的第二层。**

## 补丁做了什么

`fence.js` 是一段**注入到 `lib/index.js` 最前面**的独立 ESM 片段，它把整个 `webServer` 对象包住：

```
apply(ctx) 里的 `const webServer = ctx.webServer;`
        ↓
        `const webServer = __wtFence(ctx.webServer, ctx);`
```

包住整对象（而不是逐条路由加守卫）是为了 **fail-closed**：`apply()` 里所有 `register` /
`registerUpgrade` 自动过栅栏，**上游将来新增的路由也默认被覆盖**。

两道防线：

1. **请求级**：socket 回环（127/8、`::1`、`::ffff:127/8`）+ Host 回环 + `sec-fetch-site` 非
   `cross-site` + `Origin` 与 Host 同源。HTTP 允许 Origin **缺失**（curl 等非浏览器客户端）；
   **WebSocket 要求 Origin 必须存在**——浏览器必然发送它，而对 WS 而言它是唯一的跨源防线。
   显式 `Origin: null`（沙箱 iframe / `file://` 页面）一律拒绝：攻击者能制造它。
2. **允许根**：`/file` `/site` `/write` `/mkdir` `/fs` `/git` 的**客户端可控路径**解析后必须落在
   家目录 / 临时目录 / DSH 家目录之内，否则 403。挡的是「栅栏被绕过之后还能碰到什么」。
   校验前先对**最深的已存在祖先**做 `realpath`（目标可能还不存在），根与目标都归一，
   因此 `~/../../etc/passwd` 这类穿越在归一后即越界。

## 用法

```bash
node dsh-patches/worktable-fence/apply.mjs            # 打补丁（幂等，可重复跑）
node dsh-patches/worktable-fence/apply.mjs --check    # 只校验是否已打（门禁用）
node dsh-patches/worktable-fence/fence.test.mjs       # 单元断言（47 项，打在合成 req 上）

pnpm run accept:worktable-fence                       # 实况 curl 探针（31 条，含变异测试）
pnpm run gate --mode full                             # 其中的 worktable-fence 项（结构门禁）
node --test scripts/gates/worktable-fence.test.mjs    # 结构门禁的自检（8 条）
```

**三层判据，缺一不可**——它们能发现的错不一样：

| 层 | 能发现 | 发现不了 |
| --- | --- | --- |
| 单元断言（`fence.test.mjs`） | 纯函数边界与退化 | 产物里到底装没装、路由有没有被包住 |
| 结构门禁（`scripts/gates/worktable-fence.mjs`） | 产物没打 / **锚点落空** / 版本过期 / **顶层撞名** / pin 漂移 / 安装面被换成干净副本 | 判据在真实 HTTP 事务里成不成立 |
| 实况探针（`scripts/acceptance/worktable-fence-live.mjs`） | 真实 curl 下 16 条负向 + 13 条正控；**且带变异测试** | 应用启动时装载的是哪一份产物 |

**实况探针的阶段 M 是变异测试**：把 `git show HEAD:01_content/lib/index.js`（**未打栅栏的上游原文**）
喂给同一套探针，要求 16 条负向**全部转红**、正控全部仍绿。实测读数：

| | 栅栏在位 | 去掉栅栏 |
| --- | --- | --- |
| 来源类（cross-site / 外来 Origin / `Origin:null` / 非回环 Host） | 403 | **200** |
| 读 `/etc/passwd` | 403 | **200（真读到了）** |
| 越根写入 | 403，文件不存在 | **200（文件被创建）** |
| WebSocket（跨源 / 无 Origin / `Origin:null`） | 403 握手期拒绝 | **101 升级成功** |
| 非回环对端 | 403 | **200** |

没有这一层，「一片绿」无法区分「栅栏拦住了」与「探针根本测不到这件事」。

**改了 `fence.js` 之后重跑 `apply.mjs` 即可**——applier 会认出「文件 = 上游原文 + 我们注入的那块」
并安全重打。若差异**不止**这一块（有人带外改了 bundle），它会拒绝而不是盲打：
补丁工具最危险的失败模式是把一个已经被人改过的文件当成原始文件再打一遍。

## applier 的四道自我校验

1. `vendor/dsh-worktable.pin` 的 `upstream-sha` 必须等于 vendor 仓库 HEAD——栅栏锚在 bundle 的
   路由注册文本上，上游一改就可能落空。**升级上游必须先 bump pin 并重审锚点。**
2. 以 `git show HEAD:<file>` 取权威原始文本，不依赖任何本地 `.orig` 备份。
3. 四态判定（已最新 / 干净未打 / 打过但 fence 源已变 / 带外改动），只有最后一态拒绝。
4. 写完 `node --check` 做语法门禁，不通过就回滚。

## 已知代价

- **`lib/index.js.map` 会失效**（注入块让行号整体位移）。只影响 devtools 定位，运行时无关；
  该 `.map` 不在上游 `files` 白名单里，`npm pack` 本来也不含它。
- 栅栏是**补丁**不是上游行为，上游每次发版都要重锚。`apply.mjs` 的 pin 守卫与 `--check`
  模式就是为了让这件事**响亮失败**而不是静默失效。
- 临时性：本补丁是本地收敛手段。长期正确的形态是上游自己加栅栏，或平台层统一栅栏
  （见 `.scratch/dsh-worktable-fusion/spec.md` 的备选 C）。

## 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-09-12 | 首版。9 条入口全部纳入栅栏；47 项契约断言 + 变异测试通过。 |
| 2026-09-12 | 补三层判据：结构门禁 `worktable-fence` + 其实况探针 `accept:worktable-fence`（31 条，含变异测试）+ 门禁自检 8 条。取证到「平台的 `/api` 栅栏是前缀、被插件 exact 路由压过」，写入 ADR-0030。 |
