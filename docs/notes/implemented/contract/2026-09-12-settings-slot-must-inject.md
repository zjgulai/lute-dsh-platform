# 设置页那一行从未出现：裸 `slots.register` 撞上未声明的槽位（ADR-0042）

> 决策：[ADR-0042](../../../adr/ADR-0042.md) · 分类：contract · 生命周期：implemented

## Problem

新页 `dsh-algo-skills-local` 交付后，我向用户报的是「已热挂载，刷新页面即可验收」。**这句话是错的。**

刷新不会出现任何东西，因为设置页侧边栏的那一行从未注册成功过。而所有我能拿到的读数都是绿的：

```
/api/dsh-algo-skills/health      → 200  本机 1338 卡 / 1327 已归位
/api/dsh-algo-skills/tree        → 200  848,528 B
dsh-market 日志                   → hot-mounted dsh-algo-skills-local
/plugins/events 模块图            → dsh-algo-skills-local rev=ee2bc9fd2273（在 74 条之内）
pnpm run gate                    → 15/15
```

也就是说：**宿主半边全通，客户端半边也真的被加载了，唯独那一行不在。**

压出成因的是一条判据：仓库里其余 5 处 `settings.section` 注册（`dsh-overseas-skills` ×2 /
`dsh-theme-local` / `dsh-agent-team-gui-local` / `dsh-wanzh-hulian`）**无一例外**都写成
`ctx.slots.inject('settings.section', () => ctx.slots.register(...))`，只有本包是裸
`ctx.slots.register`。顺着读槽注册表的纯核心，命中：

```js
// node_modules/@deepseek-ai/dsh-client-ui-slots/lib/index.js
register(options, component) {
  const rec = this.records.get(options.name)
  if (!rec?.spec) throw new Error(`slot "${options.name}" is not declared (a parent entry's children table must declare it)`)
```

外部插件的 `apply` 跑在设置外壳声明 `settings.section` **之前**，所以这一抛是必然的。
抛被本包自己的 `catch` 接住：

```js
} catch (error) {
  console.warn('[algo-skills-local] settings section registration failed', error)
  return () => {}
}
```

`catch` 把失败翻译成了静默——装配继续、页面照常启动、日志无异常、门禁全绿。
**只有人眼能发现少了一行，而我把人眼那一步当成了验收而不是探针。**

## Decision

外部插件面向槽位注册一律走 `ctx.slots.inject(key, () => ctx.slots.register(...))`，
`try/catch` 留在回调**内部**，不再额外包 `ctx.effect`。详见 [ADR-0042](../../../adr/ADR-0042.md)。

## 为什么单测没拦住它

和 [ADR-0038](2026-09-12-shared-fence-deny-not-throw.md) 是同一个形状的失手：
**替身把真实语义抹平了**。

本包原有的 7 个测试文件覆盖了 collect / filter / routes / frontmatter / i18n / css-keys /
layer-icons——**全部是宿主半边与纯函数**。客户端入口 `src/client/index.ts` 一行测试都没有。
于是「注册参数对不对」没人问，「注册**到不到得了**」更没人问。

补上的 `tests/client-mount.spec.ts` 不再用万能替身，而是**忠实复刻核心的两条语义**：

1. 未声明的键 `register` 直接抛（照抄真实错误串）；
2. `inject` 在声明前把回调挂起，声明提交后执行。

把实现改回裸 `register`，该文件立刻 3 条转红，且日志里正是真实那条错误串——这就是它作为
判据的资格。另外补了 `tests/page-render.spec.tsx`（9 条），把页面挂起来走完
面 → 责任域 → 岗位 → 卡 三级下钻，钉住「默认全折叠」「三类接线标签不合并」「空白岗位显式说出」。

## 实测取证

**1. 变异验证（改回旧写法 → 转红）**

```
[algo-skills-local] settings section registration failed Error: slot "settings.section" is not declared (a parent entry's children table must declare it)
× client mount > defer the row instead of throwing when the settings shell has not declared the slot
× client mount > registers only after the declaration lands, under the skill catalogs
× client mount > labels the row through this plugin namespace, not the shell default
   Tests  3 failed | 2 passed (5)
```

**2. 修好后，宿主**实际下发**的客户端包已含修复**（该 combo 路由不做鉴权）

```
GET /plugins/??dsh-algo-skills-local/client.js&rev=ee2bc9fd2273   → 200  45,369 B
grep 'slots.inject("settings.section"'                            → 1 处
与磁盘 lib/client.js 逐字节比对（仅 sourceMappingURL 被改写、多一个 ';'）
```

**3. 真实负载渲染**（把 `/api/dsh-algo-skills/tree` 的真 848 KB 喂给页面，jsdom 挂载）

```
HEADER   : 算法技能库 | 4 面 · 8 责任域 · 50 岗位
PLANES   : 4  PLN-MGT,PLN-OPS,PLN-CTL,PLN-PLT
STATS    : ["1338已装技能卡","1327已归位","11未归类","326本岗已接线","2空白岗位"]
ISSUES   : 2
UNPLACED : ▸未归类（矩阵空白）11 张
DOMAINS(closed): 0     DOMAINS(open): 12     UNPLACED cards: 11
```

**4. 全量**

```
pnpm vitest run  → 9 files / 111 tests passed（含新增 client-mount 5 + page-render 9）
pnpm typecheck   → exit 0
pnpm build       → lib/client.js 45.32 kB
pnpm run gate    → 15/15
```

## 顺带纠正 ADR-0041 的一条假设

[ADR-0041](../../../adr/ADR-0041.md) 的后果节写「装载需要宿主重启」。**不需要**：
`dsh-market` 的 toggle 走热挂载，返回 `restart:false / refresh:true`，
`activation.state=live`；落盘的只有用户 patch 层 2 行（`ui-algo-skills-local: disabled:false`），
后续每次启动由 bundle 层正常加载，两条路径状态一致。
