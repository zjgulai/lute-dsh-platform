# 侧边栏入口核心：「空面板」的 null 与真 React 探针（ADR-0032）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0032](../../../adr/ADR-0032.md)。

## Problem

「新应用」并排按钮的第二期交付里，几何验证件 `scripts/geometry-probe.mjs` 在**真 Chrome**
里 18/18 通过：两键同一行、等高 38px、等宽各 124px、间距恰好 4px、下方工作区零位移。
这份绿是可信的——样式表逐字取自 shipped bundle，不是手抄的复刻。

但它有一条**结构性的盲区**：fixture 是静态 HTML，**页面里没有 React**。
没有 React 就没有重渲染，没有重渲染就没有位移，而
`shared/client/sidebar-entry-core.ts` 的自愈逻辑**只对重渲染有意义**。
换句话说，那一格恰好落在「静态 fixture 测不到、jsdom 测不了布局」的缝里，
绿的 18/18 对它一言不发。

于是本轮补了真 React 环境的探针（`scripts/reconcile-probe.mjs`）。
它**第一次跑就测出一个真缺陷**。

### 缺陷

```ts
function sidebarRoot(): HTMLElement | undefined {          // ← 声明
  ...
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)  // ← 实现
}
```

`firstElementChild` 的类型是 **`Element | null`**——`??` 的右操作数本来就可能是 `null`，
这不是笔误，是类型断言把 `null` 说成了 `undefined`。而本模块**五个调用点全部只判
`undefined`**：`root === undefined`（早退）、`root !== undefined && !root.isConnected`
（重查）、`root === undefined || !root.isConnected`（观察者）。`null` 每一种判据都通不过，
又一种都没被拦住。

触发态是**侧边栏面板存在但暂时为空**——即整面板拆除与重建之间的那一帧。
`sidebarRoot()` 的第一条路（`[class*="logoRow"]` 的父节点）先落空，回退到
`column.firstElementChild`，而那一刻列是空的。

### 读数：不是「控制台多了条错误」，是功能永久丢失

同一条脚本，只换核心的那一行，两侧都跑（真 React 18.3.1）：

| 阶段 | 未修（`null` 泄漏） | 已修（归一化 `undefined`） |
| --- | --- | --- |
| 挂载后 | 入口在，未捕获异常 0 | 入口在，未捕获异常 0 |
| 整树卸载后 | 入口消失，未捕获异常 **1** | 入口消失，未捕获异常 0 |
| 重新挂载后 | 入口**仍不在**，未捕获异常 **2** | 入口**已回来**，未捕获异常 0 |
| 再 5 次重渲染后 | 入口**仍不在**，未捕获异常 **7** | 入口在，未捕获异常 0 |

关键在第三、四行：卡住的值是 `null`，而 `null ??= sidebarRoot()` 每次都会重新求值、
每次都重新拿到 `null`，于是后续**每一个 mutation 批次都在同一个判据上再抛一次**，
入口行**再也不会被放置**。只有整页刷新能恢复。

这也解释了探针第一次跑时的现象：S6 两条断言红着，而进程接着在 `dispose()` 里崩掉——
因为 `dispose` 里那句 `root === undefined ? undefined : newSessionButton(root)`
读的正是同一个卡住的 `null`。

## Decision

三条，见 [ADR-0032](../../../adr/ADR-0032.md)：

1. **「未挂载」在共享层只有一种表示：`undefined`。** 修类型谎言，不在五个调用点各补一次双判。
2. **跨框架注入的契约必须在真框架环境证伪**，且探针必须自带「先证明危险真实发生」的仪器自检。
3. **变异测试是交付物的一部分**：喂未修的核心必须转红，喂修好的必须转绿。

## Alternatives considered

- **A. 每个调用点补 `!= null` 双判。** 契约的谎言留在类型里，下一个调用点还会踩；
  而且「未挂载」被表述五次，正是 ADR-0009 意义上的多份事实之家。
- **B. 在 `tryPlace` 与观察者回调外面包 `try/catch` 作为唯一修法。** 把可诊断的契约违背
  变成静默降级，且 `root` 仍永久卡在 `null`，只是不再抛。作为纵深可以，作为修法不行。
- **C. 静态 fixture 里放手写的 React 替身。** 手写替身会与真 reconciler 静默漂移，
  测的是我对 React 的假设——与 `geometry-probe.mjs` 拒绝手抄样式表同一条理由。
- **D. 只放进 vitest（jsdom）。** 没有布局、没有真提交顺序；且让快套件依赖 shipped bundle
  会把环境耦合塞进单测。两者**互补而非替代**。
- **E. 把探针塞进 `pnpm run gate`。** 它依赖已安装的 DSH Desktop；门禁是硬门槛
  （ADR-0014），让一条判据变成「机器上装没装 app」的函数是错的。保持按需验收件。

## Consequences

**得到**：三个消费方（`sync-shared` 生成 15 份字节相同副本）不再在面板拆除/重建时把
TypeError 抛进宿主页面，也不再永久丢失入口行；跨框架注入的契约第一次有了能在真 React 下
证伪、且自带防空转自检的仪器。

**代价**：探针依赖已安装的 app 与 React 版本；`assertBundleShape()` 在官方 bundle 结构
变化时**响亮失败**，需人工重锚——刻意如此，静默失效的探针比没有探针更危险；
jsdom 不测布局，本探针**不**断言任何像素，几何仍只有 `geometry-probe.mjs` 说了算。

## 仪器是怎么被自己的自检抓住的

真 React 探针的第一版里，S1 写的是「tooltip 气泡楔进按钮与入口之间，把入口挤开」，
并为它配了一条**同步仪器自检**：修复前，位移必须先是坏的。跑出来是红的——
气泡的 `previousElementSibling` 是 `entry`，不是按钮。

追下去，原因是真的：`Tooltip` 的返回是
`jsxs(Fragment, { children: [cloneElement(children, …), pos !== null && jsx("span", …)] })`
——**没有 DOM 包装**（这恰好也证实了并排几何的前提：官方按钮确实是 `root` 的直接子节点），
而 React 插入新节点用的是 `insertBefore(parent, node, getHostSibling(fiber))`，
气泡的下一个宿主兄弟是 Fragment 的跟随者 `regionArea`，所以气泡落在入口**之后**。

**错的期望，不是错的核心。** 于是删掉那条期望，把实测次序改写成断言。留着它会是
一条永远为绿的断言——正是仪器自检存在的理由。

真正会挤开入口的是另一个场景：React **换掉官方按钮节点本身**时，新按钮以
`insertBefore(root, newButton, regionArea)` 落位，因为入口正在那个缝里，新按钮落在入口
**之前**。这条现在带同步仪器自检（实测 `入口前一个兄弟 = x-Wl6W_logoRow`），
自愈断言因此不再是空转。

## 验收读数

```
node packages/surfaces/dsh-newapp-local/scripts/reconcile-probe.mjs   → 29/29，exit 0
    （变异：喂未修的核心 → S6×2 与「同步抛出」红，23/26，exit 1）
node packages/surfaces/dsh-newapp-local/scripts/geometry-probe.mjs    → 18/18，exit 0（真 Chrome）
npx vitest run（newapp 64 / role-matrix 56 / skill-center 74）        → 全绿
    （新回归用例单体变异：喂未修的核心 → exit 1，TypeError 指名）
```

两份探针是**互补的**，各自只证明一半：`geometry-probe` 用真 Chrome 的布局引擎证明几何，
`reconcile-probe` 用真 React 的协调器证明自愈。**两者都不覆盖的那一格，正是本次缺陷藏身之处。**
