# 产品包挂两层：`role: entry` 把「防泄漏」从缺声明换成显式关断（ADR-0037）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0037](../../../adr/ADR-0037.md)。
> **状态：形态与机检已落地并实测；两层在真实进程里的加载次序与注册落层未运行**（需重启 Harness）。
> 取代 [ADR-0036](../../../adr/ADR-0036.md) 的决策 3；承接 [ADR-0033](../../../adr/ADR-0033.md)、[ADR-0034](../../../adr/ADR-0034.md)。

## Problem

[ADR-0036](../../../adr/ADR-0036.md) 锁住了一件事：产品包若被加进 profile 的 `dsh.profile.bundles`，它的 patch 会在**宿主层**再插一行，产品技能就注册进**全局层**——每个会话都能看到，**且没有任何报错**。锁的方式是「干脆不声明 `dsh.bundle`」：这样「加进 bundles」会在启动期硬失败。

M2b 要把入口面板做出来时，这把锁的代价暴露了：**客户端 bundle 只有进了 profile 的 `bundles` 才会被加载**。也就是说——

> 那把锁挡住泄漏的同时，**把入口面板一起挡死了**。

于是问题变成：**怎么挂两层而不泄漏？**

## 取证

- `@deepseek-ai/dsh-skill` 的分层契约不变：宿主行落全局层，preset 行落该 preset 层，最近层赢得重名。
- 先例 `dsh-skill-subset` **本来就挂两层**：profile 的 bundles 里一行（id `dsh-skill-subset`）+ 50 个 preset 各一行（id `skill-subset`）。**两行 id 不同**，因此不构成重复注册。这条路是通的，只是它把「两层各自该干什么」写进了 config 而不是写进注释。
- `lib/client.js` 的加载由 profile 的 `bundles` 决定，与 preset 组合无关——所以入口行挂在 preset 上不会让客户端被加载。

## Decision

见 [ADR-0037](../../../adr/ADR-0037.md) 的四条。落地形态：

| 行 id | 谁插的 | 配置 | 干什么 |
| --- | --- | --- | --- |
| `product-kol-hunter` | 岗位组合（`generate.mjs` → `PRODUCT_MOUNTS['agt-033']`） | 缺省 | 注册 L2 技能进 agt-033 层；注册两个 host 工具 |
| `product-kol-hunter-entry` | `cordis.patch.yml`，经 profile 的 `bundles` | `role: entry` | **什么都不注册**，只为客户端入口提供挂载点 |

`lib/index.js` 的 `apply()` 第一件事就是读 `role`；`entry` 直接 return 并留一条说明日志。

## Alternatives considered

见 ADR-0037。要点：保持缺声明锁（与入口需求直接冲突）、拆成两个包（同一产品的技能与入口会分裂成两条版本线，而区别只是一行配置）、入口行也挂 preset（客户端不由 preset 组合加载）、靠 `dsh.client.inject` 推断落层（那是信息边，不决定 Loader 行也不决定注册落层）。

## Consequences

### 实测读数

```
$ node run.mjs --check                → 18 项全部通过，其中：
  ✓ 两层挂载靠 role 分开，且入口行的注册数必须为 0（真跑一遍，不是看注释）
      patch 行 role:entry（注册 0 技能 / 0 工具，实测）；profile bundles 含 dsh-kol-hunter-local（39 项已查）
$ node run.mjs --test                 → 12 项：pass 12  fail 0，其中：
  ✔ role=entry 什么都不注册——这是局部技能不被泄漏到全局层的那道机关
  ✔ role=product（缺省）才是注册技能与工具的那一层
$ pnpm run gate（Magpie-Horch）        → 14/14
```

实时状态核对：

```
岗位行: product-kol-hunter        （缺省 role → 注册技能+工具进 preset 层）
入口行: product-kol-hunter-entry  （role:entry 在位）
profile bundles 含本包: true
全局目录里有没有泄漏: 没有
```

### 机关的性质变了，这是这一轮最值钱的地方

ADR-0036 锁的是「包看起来不像 bundle」——一个**代理**。ADR-0037 锁的是「这个角色下注册数必须为 0」——**属性本身**。代理会因为将来别的声明变化而失效（比如有人给包加上 `dsh.client` 但没动 bundle），属性不会。

### 负面 / 未决

- **两行 id 只差一个后缀**（`product-kol-hunter` / `product-kol-hunter-entry`），而错的那一处恰好是**静默**的那一处。代偿是自检 + 单测两条同属性断言。
- **`role` 是自造约定**：Cordis 把 `config` 原样交给插件，语义完全由本包定义。别的包不能照抄这个字段名，只能照抄这个思路。
- **`--check` 读死了 `profiles/desktop`**：换 profile 名要改。
- **README 曾经说的是反话**：M2a 那版 README 写着「本包故意不声明 `dsh.bundle`」，在本次改动后变成了错误陈述。已改正——**文档说反话比文档缺失更坏**，因为读者会照着做。

**未运行**：两层在真实进程里的加载次序、以及最终注册落层，必须重启 Harness 才能实测。**不宣称已验证。**

**下一步**：重启后一次验四件——(1) `/api/dsh-newapp/products` 的 curl 探针（允许根正例 + 403 负例）；(2) agt-033 vs 其他 preset 的技能作用域对照；(3) 会话内真跑 `kolhunter_select_candidates` / `kolhunter_finalize`；(4) 卡片点开走第 2 级回退。随后才是入口面板本身。

## 续：入口面板 —— 它比原计划小得多，因为**面板不该调路由**

建面板之前先问了一个问题：面板到底要什么？

原本的设想是「面板 → 调宿主路由跑确定性步 → 拿回提示词 → 交给会话」。查下去发现这个设想是多余的：

| 面板**做** | 面板**不做** |
| --- | --- |
| 从 `features[].inputs` 生成表单 | 不列字段：字段的唯一来源是声明（spec §4 硬约定 2） |
| 按声明的约束先挡一道（必填 / options / min） | 不调模型：模型与会话由基座拥有 |
| 组装交办文案，交给会话 | **不调宿主路由** |

**不调路由**这一条把整块工作砍掉了：没有路由就不需要自己的来源栅栏，不需要把 `shared/host/` 的栅栏实现复制到一个仓库外的包里（那本身就是安全组件的第二次实现），也不多一个安全面。产品说明书由启动器在 `open(entry)` 时传进来即可——启动器本来就刚读过它。

代价是面板不再「自己算数」，但那本来就是错的：**确定性算数归会话里的 host 工具（`kolhunter_select_candidates`），判断归会话自己的模型**。面板把人填的东西、要调哪个工具、产出到哪一步说清楚就够了——正是 `features[].steps[]` 那份分工在 UI 侧的原样传达。

### 落地形态

- `pipeline/panel-model.mjs`（ESM）：纯逻辑——表单模型、校验、交办文案。可被 node 直接 import 单测。
- `lib/client.template.js`：CJS + ModuleLoader 包装 + `<dialog>` 面板（ADR-0027 的 top layer 纪律），**零 `require`**。
- `scripts/build-client.mjs`：把纯逻辑内联进模板，生成 `lib/client.js`。没有 bundler、没有依赖——因为这个 bundle 本来就不引任何宿主模块。
- `lib/client.js`：**生成物**。`--check` 逐字节校验它与源码同步，手改判红。

**为什么用生成而不是手写两份**：纯逻辑要能被单测跑（ESM），产物要能在浏览器里跑（CJS + 包装），两个要求不兼容。只有一份源码 + 一个确定性生成，「测得到的」和「跑起来的」才是同一份东西。

### 踩到一个「假绿」，值得单记

`build-client.mjs` 的 CLI 逻辑原本在 **import 时**就执行，而它读的是**共享的** `process.argv`。自检里带着 `--check`，于是：

```
node run.mjs --check
→ 打印一行「✓ lib/client.js 与源码同步」
→ process.exit(0)
→ 自检在跑任何检查之前结束，退出码 0
```

**这是最难查的一类失败**：退出码正确、还有一行成功输出，只是什么都没检查。修法是在构建脚本里加「只在直接执行时才跑 CLI」的判断（`resolve(process.argv[1]) === fileURLToPath(import.meta.url)`），并留一条**子进程复现**的回归测试：把 argv 设成 `run.mjs --check`，import 构建脚本，断言产物没变、没有任何额外打印。

### 实测读数

```
$ node run.mjs --check   → 19 项全部通过
  ✓ 客户端入口：包装正确、id 等于包名、产物与源码同步（手改产物判红）
      lib/client.js 14867 字节，id=dsh-kol-hunter-local，与模板+纯逻辑同步
$ node run.mjs --test    → 21 项 pass 21  fail 0（新增 client.spec.mjs 9 项）
$ pnpm run gate          → 14/14
```

负例探针（真做了一遍）：往 `lib/client.js` 尾部追加一行注释 →
`node scripts/build-client.mjs --check` exit 1，`node run.mjs --check` 红并指名「跑 node scripts/build-client.mjs」。

**未运行，不宣称**：面板在真实浏览器里的渲染、点开、表单提交与会话交办，全部要重启 Harness 才能验。本轮验的是纯逻辑、产物形状、零 require、源码同步与失败策略（不抛）。

**仍未做**：启动器侧的点开动作（读卡 → `ctx.get(entry.service)` → `open(declaration)` → 三级回退）。它要改 `dsh-newapp-local` 的客户端并重新构建，同样等重启。

