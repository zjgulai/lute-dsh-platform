# 实况探针的「取不到值」必须分两类：全局断链是缺陷，局部作用域是预期

- 日期：2026-09-18
- ADR：[ADR-0117](../../../adr/ADR-0117.md)
- 生命周期：implemented
- 类别：contract

## Problem

C4 实况探针（`scripts/acceptance/theme-live-gui.mjs`）在**正在运行的 DSH 渲染进程**里读
`--dsw-*` 的生效值。它原先只有一档「未解析」：**声明了却取不到值**，描述语是「运行时覆盖或
层叠失效的指纹」，命中即 `exit 1`。首轮实跑（浅色态，359 个 token）报出 1 个：

```
✗ --dsw-hovercard-bg
```

**逐条取证后，这个归因是错的。** 连上渲染进程查到它的真身：

```
声明处：._card_1b2ny_13        ← CSS Modules 局部类
值：    "#2C2C2E"
来源：  /assets/index-DPX2bQLo.css   （DSH 外壳自己的样式表，不是插件）
:root 上 = 空    body 上 = 空    带此类的元素数 = 0
```

它是**局部作用域**变量，而当前页面上**没有任何元素挂载那个类**。探针挂在 `body`，
本就不在它的继承链上——**取不到值是预期结果，不是缺陷**。仪器却把它记成层叠断裂并判红。
这是**假红**：仪器对正确行为报错，而且报得和真故障同形。

**同一个循环里还藏着反向的错（静默漏测）**：声明收集只遍历 `document.styleSheets` 的顶层
`cssRules`，不递归进容器规则（`@media` / `@supports` / `@layer`，以及 CSS 嵌套）。
容器内声明的 token 会**从 `declared` 里整条消失**——既不算 `resolved` 也不算 `unresolved`，
报告上不留任何痕迹。补上递归后立刻抓到 `--dsw-corner-shape`（359 号），它此前完全不可见。

两个错方向相反却同源：**「取不到值」这个单一读数被当成了单一含义**。

## Decision

**一、声明收集记来源，不只记名字。** `declared` 从 `Set<name>` 改为 `Map<name, Set<selectorText>>`，
每个 token 记住它声明在哪些选择器上；报告里每条形如 `declaredIn: ["._card_1b2ny_13"]`。

**二、判据：全局根声明 vs 局部作用域。** `isGlobalSelector(selectorText)` 为真当且仅当
选择器组里**任一项**满足——剥掉 `[..]` / `(..)` 装饰内容后，不含组合符（空格、`>`、`+`、`~`），
且以 `:root` / `html` / `body` / `*` 开头。命中即 `scope: "global"`，否则 `"local"`。

**三、未解析分两档，退出码只看全局那档。**

| 分类 | 含义 | 判失败？ |
|---|---|---|
| `unresolvedGlobal` | 声明在根选择器上却取不到 → 层叠断裂或运行时覆盖 | **是**（exit 1） |
| `unresolvedLocalScoped` | 只在局部选择器上声明，不在探针挂载点继承链上 | 否（预期） |
| `sheetErrors > 0` | 跨域样式表读不到 → 覆盖不全，结论不可信 | **是**（exit 1） |

`unresolved` 字段保留「全部取不到值」的语义不变（不破坏既有读者），新增
`unresolvedGlobal` / `unresolvedLocalScoped` 两个分类字段与对应的 summary 计数。

**四、递归收集容器规则。** 这是分类成立的**前置条件**而非顺手重构：看不到容器内的全局声明，
就会把全局 token 判成 `local` 或让它整条消失，分类本身就是错的。

## Alternatives considered

- **只做分类、不递归容器规则。** 分类的正确性依赖枚举的完整性。容器内的全局声明看不见，
  就会被漏判成局部或不存在——**修了假红却引入假绿**，比不修更糟。故两者必须同一批改。
- **用正则实现判据。** `PROBE` 整体是一个 JS 模板字符串，正则里的 `\[` 会被模板字符串先吃掉
  一层反斜杠（`\d` 直接变成 `d`）。改成手写字符扫描，并在注释里写明本段一律不得出现反引号。
- **把局部作用域 token 从 `declared` 里剔除。** 会丢掉「页面到底声明了什么」这一路独立证据——
  它存在的意义正是防止仪器只对着自己的清单自证。
- **只加字段、不动退出码。** 那假红仍在：报告更详细了，判据照旧错。字段与判据必须同时改。

## Consequences

- **退出码是契约，语义已变，但搜索后确认无下游受影响。** 全仓搜过
  `theme-live-gui|theme-palette-audit|theme-engine-crosscheck|relaunch-dsh-cdp`：真正调用本脚本的只有
  `scripts/acceptance/relaunch-dsh-cdp.sh`，而它只判 `!= 2`（就绪判据），不区分 `1` 与 `0`；
  其余命中全是 ADR / Note 的文档引用。
- **PROBE 内禁止出现反引号**（新纪律）。本轮实测踩到：在 `PROBE` **内部的注释**里写 markdown
  反引号（`` `--dsw-hovercard-bg` ``），反引号提前终止模板字符串，`--dsw-hovercard-bg` 被当作 JS
  解析成递减运算，报 `Invalid left-hand side expression in postfix operation`。**由 `node --check`
  抓到，不是靠看 diff**。改这个文件必须跑语法检查。
- 报告体积增大（浅色态 ~49KB → ~84KB），是每个 token 多出 `scope` + `declaredIn` 所致。
- 判据的机械化核对随身带上：报告同时打印「仅局部作用域」清单，让判据本身可被逐条复核，
  而不是只给一个计数。

## 实测证据（2026-09-18，两态各一次真跑）

探测对象是正在运行的 DSH 渲染进程（`--remote-debugging-port=9333`，Electron 43.3.0 /
Chrome 150.0.7871.212）。两态均由**用户手动切换**，脚本不切主题。

浅色态（`data-ds-dark-theme=false`，body 底色 `rgb(250,248,241)`，正控 `--dsw-alias-bg-layer-1 → #FFFFFF`）：

```
页面声明 359 个 token：解析成功 358（其中解析成颜色 162）、取不到值 1
  · 全局声明却取不到（真问题）：0
  · 仅局部作用域声明（预期，非缺陷）：1
      · --dsw-hovercard-bg  ← 声明于 ._card_1b2ny_13
>>> exit=0                      （改动前：exit=1）
```

深色态（`data-ds-dark-theme=true`，body 底色 `rgb(31,31,29)`，正控 → `#2A2926`）：

```
页面声明 359 个 token：解析成功 358（其中解析成颜色 164）、取不到值 1
  · 全局声明却取不到（真问题）：0
  · 仅局部作用域声明（预期，非缺陷）：1
      · --dsw-hovercard-bg  ← 声明于 ._card_1b2ny_13
```

两态仪器自检均 6/6 通过（页面枚举到 token、正控解析成功/颜色可用、负控解析为空/回落初值、
探针未污染可见 DOM）。改动前后的 token 集合差分：**新增 `--dsw-corner-shape`，无 token 消失**。

**一处未验证**：这两个数字取自**同一台机器上同一个预设（gruvbox）**。判据本身与皮肤无关，
但**没有在第二个预设下复跑过**。
