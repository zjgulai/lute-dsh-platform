# 共享来源栅栏：判决不许是异常（真 curl 探针压出的 400）

> 决策：[ADR-0038](../../../adr/ADR-0038.md) · 分类：contract · 生命周期：implemented

## Problem

三张面向宿主路由的插件（role-matrix / newapp / skill-center）共用一份来源栅栏
`shared/host/pair-access.ts`。它有一条**放行**路径（回环）和一条**附加放行**路径
（已配对设备 ↔ `remoteWebUiPairing` 服务）。

写 M2 的实况 curl 探针时（`scripts/acceptance/newapp-products-live.mjs`），阶段 B 的
四条栅栏负例**全部没有按期望答 403**，实测是 **400、空 body**。探针的日志里躺着一条
`W Error: cannot get property "remoteWebUiPairing" without inject`，栈顶正是
`isPairedOrLoopbackAllowed`。

## Decision

**栅栏的失败态是「拒绝」，不是「抛」；可选服务的查询一律尽力而为，失败即按最保守结论走。**

具体落点（`shared/host/pair-access.ts`，经 `scripts/sync-shared.mjs` 同步到 3 个副本）：

1. `findPairing(ctx)`：先 `ctx.get('remoteWebUiPairing', false)`，再退属性读；**两步各自包保护**，
   任何一步抛都当作「没有这个服务」。
2. `isPairedDevice(request)` 自己抛也算拒绝（配对实现坏了不是放行理由）。
3. 找不到配对服务 → `false`（回环以外不许进），与「服务存在但说不」同一个判决。

## 为什么单测没拦住它

三处栅栏单测的 ctx 替身都是**普通对象**：

```ts
const paired: Record<string, unknown> = {}
paired['remoteWebUiPairing'] = { isPairedDevice: () => true }
```

属性读**不抛**，于是「属性读会抛」这条真实路径从来没被走过。真实 cordis 上下文的形状是
**代理**：读一个没有 inject 的服务名会抛 `cannot get property "…" without inject`
（`@deepseek-ai/cordis` 的 `ReflectService.handler.get`）。

**这条教训比 bug 本身值钱**：替身要模仿的是**被替身的东西的失败语义**，不只是它的成功返回。
一个「能返回值」的普通对象，和一个「读不到就抛」的代理，在栅栏这种「失败=拒绝」的语义下
是**两种不同的被测对象**。

## Read 实况（2026-09-12，运行中的实例，`Sec-Fetch-Site: cross-site`）

| 路由 | 栅栏实现 | 修前 | 修后（本进程重跑探针的独立栈） |
| --- | --- | --- | --- |
| `/api/dsh-role-matrix/list` | 共享栅栏 | 400 | — |
| `/api/dsh-newapp/health` | 共享栅栏 | 400 | **403** `forbidden: loopback-only` |
| `/api/dsh-newapp/products` | 共享栅栏 | （路由尚未装载，401） | **403** |
| `/api/dsh-skill-explorer/health` | npm 第三方包（同形缺陷） | 400 | 不在本仓库，不修 |
| `/api/worktable/health` | 独立补丁栅栏 | **403** ✓ | 403 ✓（同实例正控） |
| `/api/nope-xyz-123` | 平台 `/api` 前缀栅栏 | **403** ✓ | 403 ✓ |

`worktable` 的 403 与「不存在的路径也 403」两条**正控**把「本机栅栏机制整体坏了」这种解释
排除掉：差异只出在共享栅栏的两条路由上，成因唯一。

**为什么拒绝仍然成立却必须修**：400 ≠ 200，所以没有绕过。但 ①`403 forbidden: loopback-only`
这条分支在生产里不可达，被拒响应无法与畸形请求区分；②每条被拒请求都产生一条错误日志；
③判决依赖**上层恰好 catch**——`dsh-host-webserver` 今天选择回 400，任何一天它改成
「catch 后放行」，这就成为真正的绕过。安全组件的正确性不能建立在别人的异常处理策略上。

## 探针的两条纪律（本轮顺带立下）

1. **仪器自检先于结论**：`srv-alive`（不存在的路由必须 404）、`curl-alive`（连死端口必须失败）、
   `health`（正控 200）。三条任一不成立 → exit 2，不产出任何绿色。
2. **每条负例只换一个头**，与同 URL 的正控构成差分：翻转型（200 → 403）本身才是
   「403 出自栅栏」的证据，而不是读日志自证。

顺带修掉探针自己的一个错误：**「空配置 = 不扫」这条必须在冷进程里跑**。
`mountOnce` 的「一进程只挂一次」标记骑在 `globalThis[Symbol.for('dsh-web.mounted-plugins')]` 上，
同进程里第二次装载同一个包**按设计**是 no-op——同进程重跑只会拿到 404，把「探针写法不对」
误报成「安全默认失效」。改用 `--child-scan` 子进程后转绿。

## Alternatives considered

见 [ADR-0038](../../../adr/ADR-0038.md) 的「备选方案」：给插件加 inject（否决：硬依赖）、
在每个路由 handler 里各自包 try/catch（否决：一处判决复制 N 份，违 ADR-0009）、
保留 400（否决：意外拒绝 ≠ 判决拒绝）、顺手修第三方包（否决：npm-pinned 不在本仓库）。

## Consequences

- 三张插件 9 条路由恢复「403 + 可读原因」，被拒请求不再刷错误日志。
- 栅栏单测补两条：**代理形状的 ctx**（属性读抛异常）与 **isPairedDevice 自身抛**。
  它们模仿的是失败语义，这才是替身该模仿的东西。
- 新增验收命令 `pnpm run accept:newapp-products`（阶段 A–C 为硬判分；阶段 D 打运行中实例，
  需重启才能转绿的项目**如实记为待复核**，不由探针的绿色假装已经改变）。
- 同形的第三方包（`@linxin666/dsh-client-ui-skill-explorer`）读数留在这里：它今天也答 400，
  在替换/上报决策时可直接引用。
