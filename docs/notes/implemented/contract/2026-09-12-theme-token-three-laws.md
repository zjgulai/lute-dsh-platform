# 语义 Token 的三条法则，以及门禁把注释当引用的那件事

- 日期：2026-09-12
- 关联：[ADR-0039](../../../adr/ADR-0039.md)、[ADR-0029](../../../adr/ADR-0029.md)（token 可达性门禁）、[ADR-0015](../../../adr/ADR-0015.md)（留痕纪律）
- 范围：第三期「对齐语义 Token 与 LUTE 品牌」（`dsh-newapp-local` 抽屉 + 侧栏入口行）

## Problem

第三期开工时，抽屉样式表 `newapp.module.css` 有 **47 处硬色值**，另有一处
`--dsw-font-mono`。后者是**上一轮修幻觉 token 的结果**：把 `--dsw-font-family-mono`
换成了 `--dsw-font-mono`——一个本仓库主题插件映射里有、但**页面拿不到**的名字。

三件事同时不成立：

1. **静态门禁绿、真实引擎空。** `pnpm run gate` 判 `--dsw-font-mono` 已定义（主题插件
   的 `buildThemeTokenOverrides` 返回它），`pnpm run accept:theme-tokens` 判它在浅深两态
   都是 `rgba(0, 0, 0, 0)`——`var()` 静默走字面兜底。**「供给方写了」不等于「页面拿得到」。**
2. **门禁把注释和定义当引用。** 收集器按「文本里出现过 `--dsw-*`」收集，于是：注释里
   一句「别再用 `--dsw-x`」让 `--dsw-x` 重新变成必须存在的 token；主题插件自己的映射键
   `"--dsw-font-mono": …` 被算成「有人引用 `--dsw-font-mono`」。前者与 ADR-0015 直接冲突
   ——**按规格留痕反而造出违规**；后者让门禁永远答不出「这个 token 没人用」。实测
   （`code: 0 / whole-file: 2`）：我在新样式表里记录两个弃用名字，探针立刻多报 2 条未解析。
3. **手配字号行高。** 全文件有约 40 处 `font-size:` + `line-height:` 自配对，而官方
   主题包**已经**提供了成对的简写 token（`--dsw-font-xs-13` = `13px/20px var(--dsw-font-family)`
   等 11 个）。自配对是「行高逐条漂移」的入口。

另外两条既有事实在动工前必须先量，否则会照着错的结论改：

- `--dsw-alias-bg-layer-2` 的**浅色读数与抽屉底色相同**（都是 `rgb(255,255,255)`）。基线里
  给 `role-matrix` 开的药方正是「改用 `bg-layer-2`」——照做只会把「深色下没底色」换成
  「浅色下没底色」。真正的「卡面上的小面」是 `--dsw-alias-bg-module-platform`
  （实测 `rgb(245,246,247)` / `rgb(53,54,56)`）。
- 官方**确有**「实底上的文字」token：`--dsw-alias-label-primary-foreground`，且与
  `--dsw-alias-button-primary-fill` 成对出现在两个官方包的规则里（
  `dsh-client-ui-message-feedback`、`dsh-client-ui-settings-models`）。上一版注释里
  「平台没有 label-on-solid-fill token，所以只能用半透明绿」是**错的**。

## Decision

**法则一：只引用官方主题包 CSS 里声明过的名字。** 判据落在 `pnpm run accept:theme-tokens`
（真实引擎两态解析），不是静态文本。`--dsw-font-mono` 换成官方声明的 `--ds-font-family-code`。

**法则二：`var()` 的兜底字面量 = 该 token 实测的浅色读数。** 兜底从「猜测」变成「降级到
真相」。本轮据此改正了 2 处（`.primary` 的 `#4176e6`→`#0f1115`、`#0f1115`→`#43454a`）。

**法则三：品牌色不是主题色。** LUTE 绿 `#58b848` 是字面量，且全部 11 处字面量只住在
**一个**声明块（`.root, .entry`——抽屉与侧栏行没有共同祖先，双选择器是「只有一处」的代价）。
表达**状态**的地方改用官方状态族：`「这个容器有存档布局」` 从品牌绿改成
`state-success-tertiary` 底 + `state-success-primary` 字（逐字抄自 `dsh-client-ui-cordis`）。
固定品牌底上的文字用官方**静态**白 `--dsw-static-neutral-bluish-00`（实测两态都是白），
不用任何 inverted 别名（别名在深色主题会翻成深色，绿底上消失）。

**排版改走官方简写。** 11 级阶梯按值使用，**不按名字**：`--dsw-font-m-18` 实测是
`500 16px/28px`。两处必须「简写之后再覆盖」的地方（`.agentId` 的 `font-variant-numeric`、
`.cardDir` 的代码字体）顺序写进注释并由用例守住——`font:` 是简写，会重置
`font-family` 和 `font-variant`，**写反了是合法 CSS 且静默无效**。

**门禁的「引用」只认 `var()`，且先剥注释。** 两条正则：先块注释后行注释，行注释要求
`/` 前不是 `:`（否则 `https://…` 会把后面的真引用吃掉）。

**驱动这一切的不是肉眼，是工具。** 数据来自 `node /tmp` 级别的三行脚本：官方 393 个已定义
token 的名字、11 个字号简写的值、以及探针报告里每个 token 的浅深两态读数。

## Alternatives considered

- **只修样式表，不动门禁**：本轮实测证明它会立刻反咬——记录弃用名字的动作本身造出违规。
- **门禁收紧成「必须官方已定义」**：会误伤主题插件——它的职责就是供给官方没有的 alias 名。
- **品牌绿做成 `--dsw-alias-brand-primary`**：实测它是 `neutral-bluish-1000`（近黑）的
  「反色实底」语义，不是绿色；用了品牌识别就没了。
- **`color-mix()` 派生透明度**：更简洁，但失败模式静默——引擎不支持时整条声明在
  computed-value 阶段失效；`var()` 兜底**不会**救它。透明度变体全部写 `rgba()` 字面量。
- **`.primary` 保持半透明绿**：理由是「没有实底文字 token」——**这条前提是错的**。改成
  官方实底主按钮（实测：浅色黑底白字、深色白底黑字）。视觉后果要认：这是全应用唯一的
  官方主按钮形态，不再随品牌绿走。

## Consequences

| 验证件 | 读数 |
| --- | --- |
| `pnpm run gate:full` | 18/18，exit 0 |
| `pnpm run accept:theme-tokens` | exit 0；`newapp` 30 个引用 token 全部两态解析；54 个引用 token 零分歧（**上一轮 exit 1**） |
| `vitest`（newapp `tests/stylesheet.spec.ts`） | 9/9，exit 0 |
| 变异体（3 个） | 品牌块外写字面量 → Law A 红；裸 `font-size` + 顺序写反 → Law C 两条红；恢复即绿 |
| `node --test scripts/gate.test.mjs` | 6/6（含 2 条收集器用例：注释/定义不算引用、真引用仍被抓） |
| `vitest`（role-matrix 56 / newapp 全套） | 全绿 |
| 门禁基线 | 8 → 7 条（`--dsw-alias-fill-tsp-secondary` 已从 role-matrix 清除） |

**同轮另修：探针自己的一个竞态。** `accept:newapp-products` 的 `default-scans-nothing`
（换冷进程验「空配置 = 不扫」）本轮开始**偶发**报「(无响应)」：子进程 `process.stdout.write`
之后紧跟 `process.exit(0)`，而**重定向到管道的 stdout 是异步写**——exit 会把没落地的那次写
截断，父进程于是看到「退出码 0 + stdout 空」，与「子进程崩溃」在报告里长得一模一样。
直接跑（TTY，同步写）永远打得出来，所以它在写这个探针时一直是绿的。修法两件：
① 写 RESULT 改成等回调（把这次写变成同步语义）再 exit；② 探针在拿不到 RESULT 时**必须
把子进程的遗言带上来**（退出码 + stdout/stderr 尾巴 + 是否被超时杀掉）。第 ② 件是通用的：
**一个只会说「无响应」的仪器，等于没有仪器**——它让真红、假红和基础设施故障三者不可区分。
5 次连跑验证不再复现。

**可复用的教训**：**「这个名字存在」有三种互不相同的含义**——文本里出现过、供给方声明了、
页面拿得到。门禁此前把三者当一件事，于是同时产生假红（注释造违规）与假绿
（供给 ≠ 生效）。三个含义需要三件仪器：静态收集器（只管形状）、主题供给映射（只管供给）、
真实引擎探针（只管生效）。**用错了仪器，绿和红都不可信。**

**未做**：`role-matrix` / `skill-center` 各尚有约 115 处硬色值（本轮只清基线指名的那一处）。
计入开放项而非宣称第三期完成。
