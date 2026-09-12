# 卡片点下去报「cannot get property "sessions" without inject」：一次抛被当成了兜底（ADR-0046）

> 决策：[ADR-0046](../../../adr/ADR-0046.md) · 分类：contract · 生命周期：implemented

## Problem

用户点开「新应用」，点那张唯一的卡片，读到：

```
打开失败：cannot get property "sessions" without inject
```

`KOL-Hunter/product.json` 的 `statusReason` 早写着「入口面板的客户端服务尚未打包安装，
卡片点开暂走第 2 级回退」，所以走的是第 2 级（新建会话）。第 2 级第一行：

```ts
const sessions = context.sessions ?? lookup(context, 'sessions')
```

这一行读起来是「先试属性、再试 `ctx.get`」的双重兜底。**它不是兜底，是一次抛加一句死代码。**

`dsh-newapp-local` 的客户端半边声明 `inject = ['slots', 'locale']`。cordis 的上下文是 Proxy，
读未声明的服务时 `ReflectService.handler.get` 走完 waterfall 后直接
`throw new Error('cannot get property "sessions" without inject')`。
抛发生在**求值 `??` 左操作数的过程中**，右半边永远执行不到；而右半边的 `lookup()` 内部本来就包了
`ctx.get` 与 try/catch，是这行代码里唯一安全的那个读。

### 为什么所有读数都是绿的

| 读数 | 值 |
| --- | --- |
| 包内测试 | 107 passed |
| `pnpm run gate` | 15/15 |
| `GET /api/dsh-newapp/health` | 200 |
| `GET /api/dsh-newapp/products` | `declaredCount: 1`、`cards[0].products[0].entryService = kol-hunter-workbench` |

宿主半边全通、客户端半边也真的装载了（侧边栏入口在、抽屉能开），
**唯一点下去的那一步不可执行**。

绿的原因不在覆盖率，在**替身的形状**：`launcher.spec.ts` 的每个用例都传**普通对象**当上下文。
普通对象没有 Proxy，`context.sessions` 就是 `undefined`，兜底照跑。
于是「生产里唯一不可执行的写法」与「单测里唯一无法执行的写法」是同一行——
和 [ADR-0042](../contract/2026-09-12-settings-slot-must-inject.md)（替身抹平真实语义）、
[ADR-0038](../contract/2026-09-12-shared-fence-deny-not-throw.md)（同一族构造，形态是「403 分支不可达、实际 400」）
是同一形状的第三次失手。

### 修好第一处之后才显形的另两处

第 2 级还有两个独立缺陷，都被第一处挡在后面：

1. **传参形状与位置都不对。** 生成的客户端契约是
   `select: (agentId: SessionId, agentPreset: string)`。网关 `prepareInvocation` 先校验
   `values.length === descriptor.parameters.length`，再按**下标**把值绑到 `parameter.wire` 上。
   旧代码传单个对象 `{ sessionId, agentPreset }` → 网关直接判 `expected 2 argument(s), got 1`。
   即便服务存在也送不到宿主。
2. **返回值没读。** `select` 返回 `RemoteResult`：业务失败是 `{ ok:false }` 这个**值**，不是抛。
   旧代码 `await` 完不看结果，于是岗位没选中也会打印
   `已新建会话（目录 …，岗位 agt-033）`——在用户唯一会核对的字段上说假话。

## Decision

1. 可选服务一律 `ctx.get(name)`；`ProbeableContext` 里不再留任何服务属性，
   让裸读在这份实现里**写不出来**（而不是只靠自觉）。
2. 判据必须落在**真 cordis 上下文**里：`tests/launcher-context.spec.ts` 先断言抛本身，
   再断言三元组跑通。
3. Remote 调用按生成契约的位置与序号传参，并读回 `ok:false`（`{ ok }` 与 `{ result: { ok } }` 两种形状都认）。
4. 服务缺失仍然返回可打印的 `{ ok:false, note }`，不以 rejection 抛出（沿用 ADR-0038 的宿主半边纪律）。

理由与备选（为什么不写进 `inject`、为什么不用全局兜底、为什么不借热挂载）
见 [ADR-0046](../../../adr/ADR-0046.md)。

## 实测取证

**1. 变异验证（改回裸读 → 转红，且错误串与用户报告逐字相同）**

```
× the launcher in a real cordis context > reports a missing sessions service instead of throwing
  Error: cannot get property "sessions" without inject
   ❯ Object.run src/client/launcher.ts:274:60
     const sessions = (context as { sessions?: unknown }).sessions ?? lookup(context, 'sessions')
    Tests  1 failed | 2 passed (3)
```

**2. 修好后全量**

```
pnpm vitest run   → 10 files / 112 tests passed（含新增 launcher-context 3 条、launcher 新增 2 条）
pnpm exec tsc --noEmit → exit 0
pnpm run build    → lib/client.js 72.67 kB（原 71.53 kB）
```

**3. 落盘的产物里那句修复可逐字读到**（客户端 bundle 与 profile 副本是同一个 inode，构建即同步）

```
$ grep -n 'lookup(context, "sessions")' lib/client.js
464: const sessions = lookup(context, "sessions");
$ grep -n 'select.call' lib/client.js
491: const selected = await select.call(channel, sessionId, plan.preset);
```

**4. 契约比对（不是推断）**

```
dsh-agent-presets/lib/typert.remote-client.d.ts
  select: (agentId: SessionId, agentPreset: string) => Promise<RemoteResult<string>>
dsh-api-gateway/lib/client.js  prepareInvocation()
  const expected = descriptor.parameters.length - (projection?.parameterIndex === void 0 ? 0 : 1)
  if (values.length !== expected ...) throw new Error(`client api: ${endpoint} expected ${contract}, got ...`)
```

**5. 顺手修好验收探针里两条**因 ADR-0045 而失效**的判据（同一片绿里藏着的旧口径）

`accept:newapp-products` 在阶段 C 有两条判据仍在断言 ADR-0045 **之前**的页面形态：
`declared-card` 要求 `card.declared === true`、`undeclared-listed` 要求未产品化目录**出现在 cards 里**
（ADR-0045 决议 2 恰恰把它从卡片改成了计数）。两条都转红，加上阶段 D 的
`ReferenceError: control is not defined`（那句正控随 worktable 卸载一起删了，引用没删）。
三条都已就地修正：

- `declared-card` 改判「有卡且三字段齐全」；
- `undeclared-listed` → **`undeclared-counted`**，判据双侧化：
  ① `bare-project` 不在卡片里；② `undeclaredCount ≥ 1`；③ `cards.length === declaredCount`。
  只断言①会被一个**什么都不返回**的实现满足（空扫描同样没有这张卡，而空扫描是 bug）；
- 阶段 D 报告里去掉 `fenceControl`。

**变异验证（判据自体可证伪）**：把宿主产物的 `undeclaredCount += 1` 改成 `+= 0` 后重跑——

```
✗ undeclared-counted  → 卡片里没有 bare-project；undeclaredCount=0
[newapp-live] 20/21 通过（1 项真失败）   exit 1
```

**这条变异还顺带暴露了探针自己的一个陷阱**：第一次把变异只打在**仓库副本**上时，探针仍然
21/21 全绿——因为它加载的是**profile 副本**（`INSTALLED_ENTRY`），而两者在那之前已经
不是同一个 inode 了。判据没错，是我的变异打错了地方；修正变异位置后立刻转红。
「改仓库能不能影响这条判据」必须实测，不能假设。

**6. 全量**

```
pnpm run accept:newapp-products  → 21/21 通过，exit 0
pnpm run accept:worktable-fence  → exit 3（磁盘三处皆无；运行中实例仍有 10 个入口应答，等重启）
pnpm run gate                    → 15/15
```

## 遗留

- 客户端 bundle 由宿主按 rev 下发；**重载页面**即可生效，若装载层不重读则需重启 DSH Desktop。
  磁盘已修好与运行中的实例是否已改变，是两件事——本页不拿绿色假装后者。
- 同类裸读排查范围：`packages/**/src/client/*` 除 `slots` / `locale` / `connection` 外不应出现服务属性读。
