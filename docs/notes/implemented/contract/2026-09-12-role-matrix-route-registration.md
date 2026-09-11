# 岗位矩阵路由静默失效：`register` 收到的是数组（ADR-0025）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0025](../../../adr/ADR-0025.md)。

## Problem

用户报障：**「岗位矩阵 点开页面，显示：读取失败：HTTP 404」**。

第一次探针看着像「路由没注册」，但读数是自相矛盾的：

```
/api/dsh-skill-explorer/health   → 200   ← 同前缀、同共享栅栏的插件
/api/dsh-role-matrix/list        → 401
/api/definitely-not-a-route-xyz  → 401   ← 对照
/totally/bogus                   → 404
```

**401 不等于「路由不存在」。** 读了 `dsh-client-connection` 才明白：`/api` 上挂着一条
`kind: "prefix"` 的总闸，拒绝时写 `401 unauthorized` 并 `return`。未注册的 `/api/*`
全都落在这条 prefix 路由上——所以「未注册」和「被总闸拒绝」在读数上完全同形。

### 被逐一证伪的五个假设

| # | 假设 | 证据 | 结论 |
| --- | --- | --- | --- |
| 1 | `/api` 是平台保留前缀，我的路径撞了 | `skill-explorer` 同为 `/api/...` 且返回 200 | ✗ 证伪 |
| 2 | `cordis.patch.yml` 没生效，行没插进组合 | `dsh --profile desktop --dump-config` 输出 `# == dsh-role-matrix-local` / `id: ui-role-matrix-local` | ✗ 证伪 |
| 3 | `engines.dsh: ">=0.1.1-rc.1"` 与运行版 `0.1.2-rc.1` 不匹配 | 实测 `semver.satisfies("0.1.2-rc.1", ">=0.1.1-rc.1") === false`（prerelease 元组规则，确有其事）——但 `engines` 在启动代码里**零命中**，桌面端根本不用它 | ✗ 证伪 |
| 4 | 插件 host 半没加载 | 隔离跑 profile 里那份产物：模块可导入、`apply()` 成功、2 条路由路径正确 | ✗ 证伪 |
| 5 | 插件名没出现在日志里，所以没加载 | 对照后确认：日志**本来就不记录插件名**（`skill-explorer`/`root-brand`/`task-board`/`dcp` 全是 0 命中却都正常） | ✗ 证伪（且这是我差点据以下结论的伪证据） |

五个都排除后，才回头读 `register` 的**实现**：

```js
register(route) {
  const table = route.kind === "exact" ? this.exact : this.prefixes;
  if (table.has(route.path)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`);
  table.set(route.path, route);
  return () => { table.delete(route.path); };
}
```

我传的是数组。数组的 `.kind` 是 `undefined` → 落进 **prefix 表**；`.path` 也是 `undefined`
→ `has(undefined)` 为假 → **重复检查不可能触发** → 静默 `set(undefined, 数组)`。
两条 `exact` 路由从未进入 exact 表，请求落到 `/api` 总闸，得到 401。

**全程零异常、零日志、零告警。**

### 它为什么活过了整个开发过程

- `routes.spec.ts` 直接调 `handler(req, res)`——**绕过了 `register`**；
- `contract.spec.ts` 只断言源码里出现 `webServer` 和 `register` 两个**字符串**；
- 我的临时验证脚本用了 `register: (routes) => { push(...routes) }` 的替身——
  **替身比真实契约更宽松，缺陷在替身里天然不可见。**

## Decision

见 [ADR-0025](../../../adr/ADR-0025.md)。落点是一行：

```diff
-  const webServer = (ctx as unknown as { webServer: { register(routes: unknown[]): () => void } }).webServer
-  ctx.effect(() => webServer.register(routes as unknown[]), 'role-matrix-local: routes')
+  // One route per `register` call — never the whole array.（含完整失效链路注释）
+  ctx.effect(() => {
+    const disposers = routes.map((route) => webServer.register(route))
+    return () => { for (const dispose of disposers) dispose() }
+  }, 'role-matrix-local: routes')
```

写法与 `dsh-skill-center-local` / `dsh-bridge-browser` 对齐。
全仓库扫描确认：**只有本插件犯了这一处**，其余两处均为逐条注册。

## Alternatives considered

**只修不立规。** 未采纳——静默失败模式是平台级的，任何注册宿主路由的人都会踩同一个坑。

**给 `register` 加运行时校验。** `webServer` 是官方 `dsh-host-webserver` 的 Service，
基座只 pin 不改（ADR-0008），不在本仓库可改范围。

## Consequences

### 验证

```
dsh-role-matrix-local   typecheck 通过 · 单测 31/31（原 30，新增 1 条真正驱动 register 的用例）
仓库门禁                gate:full 15/15
构建                    产物已同步进 profile 副本（硬链接同 inode，link count 2）
```

新增用例**经变异测试证明会咬**：

```
把注册改回 `register(routes as unknown as never)` → exit 1
  Error: webServer.register expects one WebRoute, not an array
  Tests 1 failed | 30 passed
复原                                              → Tests 31 passed
```

### 仍未验证

**修复后的真实 HTTP 可用性需要重启宿主才能观测。** 本文证明了：
① 注册调用符合真实契约（单条、`kind` 与 `path` 正确）；
② 路由处理器本身有 8 条用例覆盖；
③ collector 直跑真实根返回 50/50 带头像；
④ loopback 栅栏与 skill-explorer 共用同一份共享实现且实测 200。
**但端到端 200 没有被观测过**——重启后需要你或我实际打开面板确认。

### 教训

**替身宽容 = 真实静默失败。** 测试替身的价值在于它比真实实现**更严格**（至少同等严格）；
一旦它更宽容，它就不再测试契约，只是在陪跑。本仓库应把「驱动宿主注册的替身必须复刻真实签名」
作为一条测试纪律沿用。

另一条与 ADR-0022 同源：**别读代码猜行为，读实现定行为。**
本日两次重大误判（`icon` 是死数据、401 等于未注册）都是「从一个看起来合理的读数推断行为」，
两次都是回头读实现才推翻。
