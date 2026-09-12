# 2026-09-12 · worktable 信任栅栏：从「平台已经有栅栏」到「这条栅栏是唯一防线」

- 决策：[ADR-0030](../../../adr/ADR-0030.md)
- 事实之家：`dsh-patches/worktable-fence/README.md`（栅栏本身）、
  `scripts/acceptance/worktable-fence-live.mjs`（实况判据）、
  `scripts/gates/worktable-fence.mjs`（结构判据）。本文只记**为什么这么定**。

## Problem

上游第三方插件 `dsh-worktable`（v0.3.3，sha `2f4f6c8`）要在本平台安装。逐条读它的
`apply(ctx)` 取证到：8 条 HTTP 路由 + 1 条 WebSocket 升级路由**一条都不校验来源**，
`file` / `site` / `write` / `mkdir` / `fs` / `git` 的客户端可控路径**不做根约束**。

第一反应是「本机插件、回环监听，问题不大」。这条假设被两件事各自推翻：

1. **回环监听 ≠ 可信。** DNS rebinding 能绕过 Host 判据；跨站请求带
   `Sec-Fetch-Site: cross-site`；而**浏览器对 WebSocket 不施加同源策略**——
   任意网页都能开 `ws://127.0.0.1:<port>/api/worktable/term` 拿到交互式 shell。
2. **「平台已经有栅栏了」也不成立。** 这一条是本轮真正的新事实。

### 取证：平台的栅栏挂在前缀上，插件的 exact 路由压过它

DSH 自己在 `/api` 上有一条总闸：

```js
// dsh-client-connection/lib/index.js:707
const route = { kind: "prefix", path: "/api", handler: async (req, res) => {
  const rejection = connection.requestRejection(req)
  // isTrustedApiRequest → 403（Host 回环 + sec-fetch-site + Origin==Host）
  // browserAuth.isAuthenticated → 401
```

而路由匹配是 **exact 优先**：

```js
// dsh-host-webserver/lib/index.js:322
match(pathname) {
  const exact = this.exact.get(pathname);
  if (exact !== void 0) return exact;      // ← 前缀永远轮不到
```

升级表更是独立 Map、平台侧一条判据都没有：

```js
this.upgrades = new Map()
registerUpgrade(route) { this.upgrades.set(route.path, route) }
```

**两条合起来的结论**：任何插件把路由注册成 `kind: "exact"`、路径形如
`/api/<plugin>/...`，就**绕开 DSH 自己的来源栅栏与浏览器会话认证**。
「平台已经有栅栏」对本类插件是**假命题**。

这个结论不是推理出来的，是实测的——见下面「阶段 C」。

### 这条结论是**从一次误判里捞出来的**

本轮一开始想用 CLI 起一个探针实例替代重启，顺手 curl 运行中的应用：

```
/api/worktable/file?path=/etc/passwd  → 401
/api/zzz                              → 401
/api/worktable/zzz                    → 401
/_dsh/dsh-noema/status                → 200
```

当时读作「`/api/*` 全被挡住了」。**这个读法是错的**：401 来自平台的 `/api` 前缀，
而它之所以生效，恰恰是因为 **worktable 当时没挂载**。用户重启后，插件的 exact 路由
会把这条前缀顶掉。把「没挂载时的 401」当成「挂载后也安全」，是本轮最危险的一步。

## Decision

逐插件打来源信任栅栏，且**在插件的 `apply()` 入口包住整个 `webServer` 对象**。
细节见 ADR-0030 与 `dsh-patches/worktable-fence/README.md`。这里只记三条方法论：

1. **包对象而不是逐条加守卫**：`apply()` 里所有 `register` / `registerUpgrade` 自动过栅栏，
   上游将来新增的路由也默认被覆盖（fail-closed）。逐条加守卫是 open-by-default。
2. **判据必须能红**：静态门禁 + 实况探针 + **变异测试**三层，缺一不可（见下）。
3. **临时手段要写清撤退路径**：栅栏是补丁不是上游行为。技术最优解是平台级栅栏
   （备选 C），本轮因 ADR-0008「基座只 pin 不改」不采纳，因此明确登记为临时收敛手段。

## Alternatives considered

- **A. 直接改 worktable 源码提交进本仓库。** 否决：违 ADR-0010/0012 归属契约，上游发版无法合并。
- **B. 不装，自建等价能力。** 否决：重写成本远超收益，重复造轮子违 ADR-0009。
- **C. 平台级栅栏（改 DSH webserver 让 prefix 压过 exact，或给 upgrades 表加判据）。**
  **技术最优，本轮不采纳**：违 ADR-0008。这是本决策的**已知次优**，也是后续最该做的事——
  本仓库的栅栏只保护装了它的那一个插件，平台级栅栏保护所有插件。
- **D. 只信赖平台那条 `/api` 前缀。** 否决，且**已实测证伪**（阶段 C）。

## Consequences

### 判据分三层，因为它们能发现的错不一样

| 层 | 位置 | 能发现 | 发现不了 |
| --- | --- | --- | --- |
| 结构门禁 | `scripts/gates/worktable-fence.mjs`（`pnpm run gate`） | 产物没打栅栏 / 锚点落空 / 版本过期 / 顶层撞名 / pin 漂移 / 安装面被换成干净副本 | 判据在真实 HTTP 事务里成不成立 |
| 实况探针 | `scripts/acceptance/worktable-fence-live.mjs`（`pnpm run accept:worktable-fence`） | 真实 curl 下的 31 条正/负向判据 | 应用启动时到底装载了哪份产物 |
| 单元断言 | `dsh-patches/worktable-fence/fence.test.mjs`（47 项） | 纯函数的边界与退化 | 上面两层的一切 |

**结构门禁的自检**（`worktable-fence.test.mjs`，8 条）在临时目录里搭最小仓库树，
逐条注入五种失效形态，要求门禁**分别**报出正确的那一条。写它的时候立刻抓到门禁
自己的一个真 bug：把「块在 + 锚点落空」误报成「块没打上」——**因为分叉点取错了**
（用「上游原文那一行还在不在」判，而不是「注入块自身在不在」）。两种失效的修法完全不同
（前者跑 `apply.mjs`，后者要人工重锚），误报会把人引向错的修法。

### 实况探针：31 条，且**证明过它能红**

`pnpm run accept:worktable-fence` → 31/31、退出码 0。关键读数：

```
正控（必须放行）      7 条：健康路由 200、同源 Origin 200、家目录/临时目录读 200、
                          临时目录写 200、同源 WS 升级 101、prefix 路由允许根内 200
负向（必须被拒）     16 条：cross-site / 双向外来 Origin / Origin:null / 非回环 Host /
                          后缀伪装同源 / 越根读 / 穿越归一 / 越根写 / 越根 git / 越根 fs /
                          越根 prefix 根 token / 跨源 WS / 无 Origin WS / Origin:null WS /
                          非回环对端（0.0.0.0 + 局域网 IP）
证据                14 条 [lute-fence] 拒绝日志
```

**变异测试**（阶段 M）把**未打栅栏的上游原文**喂给同一套探针：

| | 栅栏在位 | 去掉栅栏 |
| --- | --- | --- |
| N1–N5 来源类 | 403 | **200** |
| N6 读 `/etc/passwd` | 403 | **200（真读到了）** |
| N8 越根写入 | 403，文件不存在 | **200（文件被创建）** |
| N13–N15 WebSocket | 403 握手期拒绝 | **101 升级成功** |
| N16 非回环对端 | 403 | **200** |
| 正控 13 条 | 全绿 | 全绿（不受影响） |

也就是说：**没有栅栏时，这套探针报出的正是「任意读 + 任意写 + 跨源 shell」的完整画面。**
探针不是空转的。

### 阶段 C：这条栅栏是唯一防线，不是纵深里的第二层

用平台 `/api` 前缀的**行为替身**（未认证 → 401 `unauthorized`，与真实实现同态）在场做对照：

```
C1  /api/worktable/health                  → 200   ← exact 压过前缀：插件绕开了平台栅栏
C2  /api/worktable/file?path=/etc/passwd   → 403 · path-outside-allowed-roots（本栅栏的 reason）
C3  /api/worktable-not-ours                → 401 unauthorized（平台前缀仍在生效）
```

C1 与 C3 必须同时成立：C3 证明平台栅栏确实装上了，C1 的 200 才只能由**优先级**解释，
而不是「平台栅栏没装上」。**「有没有这条栅栏都一样」被实测排除。**

### 代价与撤退路径

- 上游每次发版需重锚。`apply.mjs` 的 pin 守卫（`upstream-sha` == vendor HEAD）与
  `--check` 模式让这件事**响亮失败**；`vendor/dsh-worktable.pin` 未 bump 前不得升级。
- `lib/index.js.map` 失效（行号位移）——只影响 devtools，运行时无关。
- 补丁形态本身是**已知次优**。上游自行加栅栏、或基座提供平台级栅栏时，本补丁应整体撤除。

### 本轮明确**没有**做的事

- **没有**验证「应用启动时把插件装载起来了」。那需要用户重启 DSH Desktop（C4）。
  本轮的实况探针验证的是「**将要被装载的那份产物**，其 9 条入口在真实 HTTP 事务下
  确实被栅栏拦住」——两个命题不同，不能互相顶替。
- **没有**把栅栏做进平台层（备选 C），理由如上。
- 阶段 B 需要把服务绑到 `0.0.0.0` 才能造出非回环对端。为此在**临时 `DSH_HOME`** 下启动，
  使 `ws`/`node-pty` 解析不到、**终端路由根本不注册**（探针自带断言：注册数必须为 0，
  否则立即中止）。最坏情况下暴露的是一条只读路由，而不是一个 shell。

## 实况装载确认（2026-09-12 09:41 用户重启后，C4 关闭）

上一节曾明确写着「**没有**验证应用启动时把插件装载起来了」。用户重启 DSH Desktop 后，
该命题已实测关闭。重启读数：进程 09:41:10 启动，`startup.jsonl` 末行
`finalStage: health-commit` / `rendererStatus: healthy`——**没有白屏**。

### 一、插件确实挂载了（401 歧义被消除）

| 请求 | 读数 | 判读 |
| --- | --- | --- |
| `GET /` | **401** `dsh web authentication required` | 平台连接级鉴权仍在 |
| `GET /api/definitely-not-a-route-xyz` | **401** `unauthorized` | 平台的 `/api` **前缀**栅栏仍在生效 |
| `GET /api/worktable/health` | **200** `{"plugin":"dsh-worktable","version":"0.3.3","ok":true}` | 插件的 **exact** 路由已注册 |

第 2、3 行**同时**成立，才是关键：第 4 轮那次读到的 401 之所以**不可用**，是因为当时
worktable **没挂载**——未注册的 `/api/*` 落到平台前缀上本来就回 401，与「平台挡住了插件」
不可区分。现在插件确实挂载了，同一条未注册路径**仍然 401**，而插件的 exact 路由 **200**。
于是 ADR-0030 的前提（exact 压过 prefix ⇒ 本栅栏是唯一防线）不再是推断，而是**活实例上的读数**。

### 二、栅栏在运行进程里生效（同 URL，只差一个头）

| 探针 | 请求 | 响应 |
| --- | --- | --- |
| N1 | 跨站 `Sec-Fetch-Site: cross-site` + 外来 `Origin`，读 `/etc/passwd` | **403** `reason: cross-site` |
| N2 | `Host: evil.example`（DNS rebinding 形态） | **403** `reason: host-not-loopback` |
| N3 | `Origin: null` | **403** `reason: null-origin` |
| P1 | 正控：同源 `Origin` + `Sec-Fetch-Site: same-origin` | **200** |

同一 URL、只换一个头即 200 → 403，且 403 的 body 点出**本栅栏自己的 reason**——
所以 403 出自本栅栏，不是平台。运行日志同步落盘：
`[dsh-worktable][lute-fence v1] denied: cross-site · /api/worktable/file`（四类 reason 各一条）。

### 三、允许根约束在运行进程里生效

| 探针 | 请求 | 响应 |
| --- | --- | --- |
| R1 | 读允许根外 `/etc/passwd` | **403** `reason: path-outside-allowed-roots` |
| R2 | 读允许根内 `~/.dsh` | **200**（正常返回目录条目） |
| R3 | 越根写 `/tmp/lute-fence-probe.txt` | **403** `path-outside-allowed-roots`，且**文件未被创建** |

R2 是 R1/R3 的必要对照：403 若不加区分，无法排除「一切都 403」（栅栏把合法用途也拦死，
那是另一个缺陷）。R3 的「文件未被创建」是直接后果取证——不是只看状态码。

### 四、本轮仍未做的事

侧边栏「新应用」按钮的**可见几何**（并排两键的实况 rect）本轮仍未取到：读取渲染进程的
DOM 需要浏览器桥或辅助功能/录屏权限，本机三者均未开启。已有的替代证据是
真 Chrome 布局 18/18（`probe:geometry`）与真 React 协调 29/29（`probe:reconcile`），
两者证明的是「这套注入在真布局引擎与真协调器下成立」，**不等于**「本机这一刻屏幕上就是
那个样子」——差距写在这里，不由探针替它说话。
