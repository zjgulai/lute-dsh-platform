# 门禁报了一个它无法解释的失败：取证按位置截尾，体量大的流吃掉判据

> 决策：[ADR-0043](../../../adr/ADR-0043.md) · 分类：contract · 生命周期：implemented

## Problem

`gate:full` 报过一次红：

```
fail contract scripts-runnable
     - packages/surfaces/dsh-skill-center-local: test 脚本运行失败（退出码 1）
       — }); ⏎ /* assert on the output */ ⏎ This ensures that you're testing the behavior
         the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
```

那三行是 React 的 `act()` 警告。**报告声称「退出码 1」，却没有一条读数为它负责。**

我先按常规怀疑对象逐个排除。13 次复现尝试，全部干净：

| 假设 | 实验 | 结果 |
| --- | --- | --- |
| 并行 CPU 负载把它压红 | 12 个 burner 压 10 核后跑该包 test | exit 0 |
| 并行会话正在写这个包的源文件 | 查 mtime：11:33 / 04:11，门禁发生在 13:51 | 时间上不可能 |
| 本身就不稳定 | 隔离跑 `gate:full` 一次；直连连跑 10 次 | 19/19；10/10 通过 |

**根因至今未定。** 但「它为什么无法被定性」不需要等根因——`stdout` 与 `stderr` 一量就出来了：

```
$ sh -c "vitest run" > out.txt 2> err.txt
stdout =  784 字节   ← 含 vitest 全部汇总：Test Files / Tests / 失败用例名
stderr = 5821 字节   ← 全是 act() 警告
```

旧实现取证：

```js
const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.slice(-SCRIPT_OUTPUT_TAIL)  // 4000
// checkScriptsRunnable 再 .split('\n').filter(Boolean).slice(-3)
```

stdout 全在前、stderr 全在后拼成 blob，再按**位置**截尾。stderr 5821 > 4000，截尾窗口被
stderr 独占，784 字节的汇总**在任何一次运行里都不可能出现在报告里**——绿的红的都一样。
这不是偶发，是这个包的门禁证据通道**结构性失效**。

顺着同一函数往下看，还有第二处同族缺陷。文档写着「超时按 124 记（与 coreutils timeout
一致）」：

```js
if (error.killed) return { code: 124, ... }
return { code: typeof error.status === 'number' ? error.status : 1, ... }
```

Node v26 实测：

```
killed = undefined   signal = SIGTERM   status = null   code = ETIMEDOUT   (node v26.0.0)
```

`error.killed` 是 `undefined`，超时**从不进入 124 分支**，一律掉进 `?? 1`。也就是说：
文档声明的 124 从未生效过，超时与真正的测试失败在报告里长得一模一样。

## Decision

记在 [ADR-0043](../../../adr/ADR-0043.md)，六条：输出按流分流不拼接；取证时每流各自标注
限额；退出码不得折算，没有就读作「未给出退出码」并附原因；超时判定
`killed === true || code === 'ETIMEDOUT'` 两半都查；显式 `maxBuffer` 16 MiB；该逻辑抽到
`scripts/lib/run-script.mjs` 以便被真实子进程测试。

## Alternatives considered

- **只调大 `SCRIPT_OUTPUT_TAIL`。** 治不了本——两流体量差一个数量级时位置截尾总让大的赢，
  只是把阈值往后推。
- **挑「更长的那个流」报。** 正是旧实现失败的原因：体量与信息量无关。
- **合并两流后按行去重再截尾。** 对「700 行一模一样的警告」有效，对「700 行各不相同的
  警告」无效，鲁棒性建立在噪声恰好重复上，不能当契约。
- **超时只看 `ETIMEDOUT`。** 会丢掉其他 Node 版本上合法置位 `killed` 的路径；两半都查成本为零。

## Consequences

**这次的偶发仍然未定性。** 本 Note 修的是「下次能定性」，不是「这次已解释」——把它记成
已解决会是第二个错误。若要继续追，下一次它复现时报告里会带上 vitest 的汇总，届时有据可查。

修复被真实子进程测试钉住（`scripts/lib/run-script.test.mjs`，5 例）。其中两条值得单说：

- **负向对照**：同一次真实运行的输出，按旧实现拼回 blob 再截尾，断言汇总**必须**丢掉。
  它把「旧实现确实会误报」变成可执行的事实，而不是注释里的说法。
- **假的绿灯风险**：主用例第一版断言 `stderr.length > 4000`，而分流后 stderr 恰好被切到
  4000，条件恒假——**这条断言当时是把测试跑红了，才没变成假绿**。若它当时恰好写成
  `<`，本项就会以「通过」的样子守着什么都没测。断言必须对着修复后的真实形状写。

接线由 `gate:full` 19/19 验证：`scripts-runnable` 与 `patch-anchors` 都真实调用 `runScript`，
`patch-anchors` 改为扫两个流（它按正则过滤，不受位移影响）。
