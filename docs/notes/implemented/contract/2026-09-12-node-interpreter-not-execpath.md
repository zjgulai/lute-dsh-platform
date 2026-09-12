# 子探针的解释器不是 node：一个「退出码 0 却没有输出」的 bug 活过了四轮

> 决策：[ADR-0040](../../../adr/ADR-0040.md) · 分类：contract · 生命周期：implemented

## Problem

`scripts/acceptance/newapp-products-live.mjs` 的阶段 C 有一条
`default-scans-nothing`：它必须**换一个冷进程**跑（同进程里第二次装载同一个包按设计是
no-op），子进程把响应打成一行 `RESULT {...}` 交给父进程判分。它连续多轮出现：

```
✗ default-scans-nothing  期望 200，实得 (无响应) （冷进程没有交出 RESULT：exit 0，stdout (空)，stderr (空)）
```

「偶发、直接跑不复现」看起来像竞态。上一轮的诊断为**管道上的异步写被 `process.exit(0)`
截断**（TTY 上是同步写、管道上是异步写），于是改成「等写入回调落地再退出」，并连跑 5 次
不复现——**但那 5 次是直接跑 `node`，而只有 `pnpm run` 才复现**。修复动作与复现条件
互不相交，于是 bug 完好无损地活到了下一轮。

真正的取证只要两条命令：

```
$ node -e 'console.log(process.execPath)'
/opt/homebrew/Cellar/node/26.0.0/bin/node
$ pnpm exec node -e 'console.log(process.execPath)'
/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop
```

以及一次「拿它起子进程看看」：

```
$ pnpm exec node -e 'execFileSync(process.execPath, ["-e","console.log(\"CHILD-OK\")"])'
stdout = ""      ← 退出码 0，没有输出，也没有报错
```

`pnpm` 生命周期下整条进程链是**宿主 Electron 以 `ELECTRON_RUN_AS_NODE` 身份**跑的，
`process.execPath` 因此是 Electron 可执行文件。拿它执行子脚本，Electron 再开一个 app
实例，单实例锁让它把 argv 交给主实例后**立刻以 0 退出**。父进程看到的正是
「exit 0 + stdout 空 + stderr 空」——与「子探针什么都没说就正常结束了」一模一样。

**它不是把探针变红，而是把它变成一句没有信息量的话。** 而上一轮给这条消息加的「遗言」
（退出码 + stdout/stderr 尾巴）事实上**已经在正确地报告真因**了——`exit 0，stdout (空)，
stderr (空)` 就是答案，只是没人认出这个组合意味着「解释器不是 node」。

同一个根因在本仓库此前已被各自就地绕过三次（`gate.test.mjs`、`dsh-agent-team-gui-local`
的 quality helper、`dsh-team-hub` 的 typecheck），每次都是一处私有的 `which node`。
第四次没人接。

## Decision

**一份事实一个家：`scripts/lib/real-node.mjs`。** 取 `ELECTRON_RUN_AS_NODE=1` 而不是
回 PATH 找 node——不需要查找、保证同一运行时，且对真 node 无害（不认识的普通环境变量），
两种父进程下返回同一形状。

**`command` 与 `env` 必须整对拿走。** 这条不是形式主义：把 `gate.test.mjs` 里那份私有
`resolveNode()` 收编到本模块时，只写了 `nodeCommand().command`，于是 `spawnSync` 起了
Electron 而**没有** `ELECTRON_RUN_AS_NODE`——四条 CLI 测试立刻全红，而 `spawnSync` 不抛错，
只是子进程不说话。**收编旧 workaround 的动作本身把刚拆掉的 bug 装了回去。** 故门禁加了
规则二：写了 `nodeCommand().command` 却没有 env 半即违规。

**判据先剥注释、再剥字符串。** 「门禁把不是代码的东西当代码读」当天出现三次，形态各不相同：

| # | 门禁 | 被误读成代码的东西 | 后果 |
| - | --- | --- | --- |
| 1 | `theme-tokens` | 注释里写的 token 名 | 写「别再用 `--dsw-x`」= 让 `--dsw-x` 变成必须存在的 token |
| 2 | `node-interpreter` | 它**自己 JSDoc 里**举的反例 | 解释禁令的文档成了违反禁令的代码 |
| 3 | `node-interpreter` | 它的**测试夹具字符串** | 为证明判据能红而写的夹具，让判据对真实仓库报红 |

第 3 条对任何「用模式匹配找违规」的门禁都成立：测试夹具**必然**要把「违规长什么样」
写成字符串。故 `blankStringsAndComments`（给判据模式会出现在夹具里的）与 `blankComments`
（给 `theme-tokens`——它的判据依赖字符串里的 token 名，一起剥会让它失效）同住
`scripts/lib/strip-comments.mjs`。

**仪器自证。** 阶段 A 增 `node-interpreter`，判据是**子进程有没有输出**而不是退出码——
只看退出码的自证会被这个 bug 本身骗过去。

**「只有重启才能改变的事实」是第三种状态。** 阶段 D 的 401（路由未加载）与 400（旧产物
的栅栏）都只说明实况跑的不是这份产物，需要的动作是重启而不是改代码。退出码改为三态，
`3` 表示「阶段 A–C 全绿但阶段 D 无法判决」；判 3 还需一条独立证据——阶段 B 里本进程
现装的产物对同形状请求答 403。真失败优先于 3。

## Alternatives considered

- **继续各写各的 `which node`（三次先例）。** 否决：已有三处实现、第四次没人接；
  且「PATH 上的 node」不保证同一运行时。同一事实多个家正是 ADR-0009 要禁的形态。
- **只修探针，不加门禁。** 否决：本 bug 的失败模式是沉默，没有机器判据下次仍会以
  「(无响应)」活过好几轮——本轮就是证据。
- **生成 shim 可执行文件让 `command` 单独永远正确。** 否决：要在整个进程生命周期内
  维持一个临时文件；用规则二把「只拿一半」变成门禁违规更便宜且更直白。
- **阶段 D 的 400 照旧记红。** 否决：没有任何读数为这个「失败」负责，它把「没验证过」
  伪装成「验证不过」。也不压成 0——那是假绿。
- **把 `lib` 一起放进全局跳过集（第一版写法）。** 否决：会让 `scripts/lib/` 整个不被
  扫描，于是「豁免 real-node.mjs」成了死代码而看起来像在正常豁免。

## Consequences

**得到**

- 冷进程探针的解释器在两种父进程下都正确；`default-scans-nothing` 在 `pnpm run` 下
  **3/3 通过**（修复前是偶发失败，且只在 pnpm 下复现）。
- 门禁项 `node-interpreter` 覆盖 **82 个开发脚本**，修掉 3 处真实违规
  （`verify-lossless.mjs` 的 lint 子进程、`dsh-team-hub/scripts/acceptance.mjs` 的两处）。
- 「注释/字符串不算代码」从两个门禁的两份实现收敛到一个家。
- `accept:newapp-products` 的退出码三态：`0` / `1` / **`3`**。实测本轮为 `3`
  （阶段 A–C 20/20，阶段 D 两项待重启）。
- 夹具泄漏被堵住：`process.exit()` **不执行 `finally`**，实测累计泄漏 **23 个**
  `/var/folders/**/T/newapp-live-*` 夹具树，而报告里一个字都没提。改用
  `process.on('exit')` 注册清理（同步执行、一条覆盖全部退出路径），修复后连跑 3 次
  泄漏为 **0**。

**代价**

- `packages/**/tests/**` 与包内 `src/` 的同类用法不在本项范围内：`dsh-team-hub` 的
  `service-launchd.mjs` / `service-systemd.mjs` 把 `process.execPath` 当**默认参数**写进
  plist/unit 文件，在 pnpm 下生成的服务描述会指向 Electron 二进制。修法是「调用方必须
  显式传 node」，属于另一个决定，**已知未修**，登记在
  `.scratch/dsh-worktable-fusion/spec.md` 的开放项。
- `blankStringsAndComments` 是状态机不是解析器：反引号模板里的 `${…}` 不做嵌套解析，
  正则字面量不识别，表现为**假阴性**，由跑真实产物的验收探针兜。
- 门禁只保证「忘了这件事不再是一个安静的选项」，不保证所有解释器用法都对。
