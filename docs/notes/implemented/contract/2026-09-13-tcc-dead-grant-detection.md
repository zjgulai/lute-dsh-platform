# 死授权：界面把「绑在旧代码上」的许可显示成「已开启」

- 日期：2026-09-13
- 状态：implemented（检出与门禁已落地；本机一次性重授与判据④/⑤ 的运行时读数待补，见 Consequences）
- 决策记录：ADR-0068
- 相关：[2026-09-13-signing-identity-tcc-stability.md](../architecture/2026-09-13-signing-identity-tcc-stability.md)（ADR-0063；本 Note 补的是它换签之后**运行机**上的那一半）、[2026-09-13-tcc-persistence-machine-check.md](2026-09-13-tcc-persistence-machine-check.md)（ADR-0063；出货前的静态判定）、[2026-09-13-shell-var-multibyte-guard.md](2026-09-13-shell-var-multibyte-guard.md)（ADR-0064；本次实现时又踩了一次，被既有门禁当场拦下）

## Problem

用户的要求是「之前遗留的 TCC 问题，请深度检查并修复」。第一步不是修，而是**把「遗留」读到读数上**——
结果发现它比预期更糟：不是「授权没了」，而是**界面在说相反的话**。

### 现场读数（2026-09-13 15:26）

```
── 1. 现在跑的是哪一支
  Authority   : LUTE Code Signing
  指定要求    : identifier "ai.deepseek.dsh.desktop" and certificate leaf = H"ba3372a3…"
  承载本会话的进程: pid=72184 /Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop（与已装 app 同一支 ✓）

── 2. 系统 TCC 库里存的三项授权
  kTCCServiceAccessibility   auth_value=2 (允许)
    TCC 存的要求 : cdhash H"595283898d…" or cdhash H"3d09f5a3…"
    → 已装 app 满足它 : 否（授权绑定在旧字节上，需重授一次）
  （ScreenCapture / ListenEvent 同上）

── 3. 能力读数（权威）
  accessibility: false · screen_recording: false · post_events: false
```

同一份证据里同时写着「允许」与「不满足」——**这就是本次要修的缺陷本身**。归因闭合：
`595283898d…` 实测属于回滚副本
`~/Library/Application Support/LUTE/rollback/DSH Desktop-2.0.5-lute.2.0.0-20260913-125713.app`，
即换签前那一支；三行的 `last_modified`（11:58–12:00）**早于**身份版就位（12:57）。

### 三条被本次取证改写的既有说法

1. **「重授一次」是有序的。** 11:58–12:00 那次重授发生在仍为 adhoc 的 app 上，12:57 身份版一就位，
   写进去的 cdhash 要求立即失配——**一次性代价被花在了错误的时刻**。此前没有任何流程保证顺序。
2. **「读 TCC 库需要完全磁盘访问」是错的。** 实测该库为 `-rw-r--r-- root wheel`，任何进程都能读
   （可写才是被保护的那一侧）。本机 `kTCCServiceSystemPolicyAllFiles` 为 `auth_value=0`，而读库一直
   是成功的。已按实测改掉脚本里的提示语（原话会误导排查者往「去开 FDA」的方向走）。
3. **换签遗留是逐服务的，不止三项。** `kTCCServiceSystemPolicyAllFiles` 那一行同样是旧 adhoc 支的
   cdhash 型要求，只是 `auth_value=0`，不构成「骗人的开关」。

### 一次被推翻的探针实验（值得留下）

为判定 `post_events`（`CGPreflightPostEventAccess`）究竟归「辅助功能」还是「输入监控」，用独立 bundle
的探针 app 做无线索实验：

- 第一次：探针同时调三个 API，tccd 只写了一条 `kTCCServiceAccessibility` —— 看起来像答案；
- 收紧成**单调用探针**（各用一个新 bundle id）后：`CGPreflightPostEventAccess` 单独调用**不写任何行**，
  `CGPreflightListenEventAccess` 同样**不写行**，只有 `AXIsProcessTrusted()` 写了 `kTCCServiceAccessibility`。

即 **preflight 根本不往库里写行**，映射关系无法用探针判定；第一次那条「阳性」其实是
`AXIsProcessTrusted` 写的。结论：**只能用一次真实授权做实验**（`CGRequest*` 会写行）。这条没被采信为
结论，但它划掉了错误路径，且探针已 `tccutil reset` 清干净（残留行复核为空）。

## Decision

见 ADR-0068：授权状态由「开关值 + 绑定对象」两个事实共同判定；机读实现唯一
（`tcc-grant-status.sh`）；界面显示「已开启」不构成证据且处置必须写进用户指引；安装器收尾必须真的调用
检出器、脚本必须随包；检出器自己的反向自测进门禁；不因此判安装失败。

本节只补落地细节与**判据为什么必须有两个正向 + 两个反向夹具**。

### 退出码就是结论，且「尚未授权」不许报警

| 退出码 | 含义 | 谁会看到 |
| --- | --- | --- |
| 3 | **死授权**：库里写着允许、绑的是另一段代码 | 安装收尾（最可能出现的时刻）+ 用户自查 |
| 0 | 无死授权（含「库里没有任何记录」= 新机器常态） | 正常安装 |
| 4 | 判不了：库读不出 / app 不在 / **封条破损** | 排查用，不当作结论 |

R4（无记录→0）是本次自测**抓到的真实缺陷**：第一版实现里「无记录」只被计入 `ROWS` 而不计数，于是
一条记录都没有时会走到最后那句「✓ 0 项授权有效」——一句听着像通过、其实什么都没判的空话。

R3（封条破损→4）来自本仓库已经踩过的坑：`codesign --verify -R=` **先验封条再判要求**，封条破损的 app
对任何要求都返回不满足，与「要求不匹配」无法从退出码区分。若不做前置，一台封条破损的机器会被判成
「死授权」，把用户引向授权面板而不是签名问题。

### 反向自测与恒真桩突变

`packaging/scripts/tcc-grant-status-test.sh` 用**合成库 + 合成 app**（系统库里造不出「死授权」那一行：
造它需要一次真实授权动作）。夹具需要一个**稳定身份**的 app，故本机无签名身份时它声明跳过而不是失败。

实测（全绿）：

```
[PASS] R1 死授权 → 退出 3 且点名「死授权」
[PASS] R2 有效授权 → 退出 0 且判「有效」
[PASS] R3 封条破损 → 退出 4（判不了），且**不**误报死授权
[PASS] R4 无记录 → 退出 0 且判「尚未授权」（不制造假警报）
[PASS] M1 恒真桩下 R1 失败（rc=0）→ 前三条断言有牙
```

M1 是把实现里唯一那处 `exit 3` 改成 `exit 0` 再跑 R1：R1 必须因此失败。这一步才证明前四条断言测的是
实现，而不是别的东西。

### 门禁的两条新断言，也各自做过「能不能说不」的验证

- `tcc-dead-grant`：喂六种输入（全绿 / 手册缺处置句 / README 缺处置句 / 安装器没接检出器 /
  检出器没随包 / 空文件）逐一判定，六种全部判对；空文件**不得**当作通过（这正是本仓库
  「清单登记了却读不到」那一类假绿）。
- `tcc-grant-status-selftest`：跑上面那支自测（0.67 s），失败时把 `[FAIL]` 行原样报出来。

`pnpm run gate` → **24/24 通过**（新增两条，自 22/22 起）。

### 实现时又踩了一次 ADR-0064 的坑，被既有门禁拦下

新脚本里写了 `$BID，`（紧跟全角逗号）——bash 把多字节字符并入变量名，`set -u` 下当场中断。
`shell-var-multibyte` 这条门禁在跑门禁时就报了出来，另一处 `$rc）` 由自测报出。两处均改为 `${VAR}`。
这条旧教训的价值在这次被实证：没有它，检出器会在**报告死授权的那一行**上崩掉。

## Alternatives considered

详见 ADR-0068 的「备选方案」节（只写文档 / 安装器直接 reset / 只读 `auth_value` / 直接改写 TCC.db /
让 app 自己弹提示）。此处补两条**本次实际排除**的方向：

- **用探针 app 判定 preflight 的服务映射**：被实测推翻（见上），已划掉。
- **把「已装 app」当作判据④ 的锚点，却仍沿用 doctor 单读数**：本机已装 app 的主可执行文件
  `Contents/MacOS/DSH Desktop` 的 mtime 是 **14:08:59**（G1/G2 运行时守卫就地打过补丁后重签），
  与 `packaging/staging/2.3.1` 载荷的字节不同——**指定要求逐字节相同**（`cmp` 通过），故 TCC 不受
  影响，但「已装的那支 == 要交付的那支」这个前提在本机**当时并不成立**。判据④ 的表述因此要带上
  「同一支」的核对：字节层面对不上时，doctor 的 true 只属于这台机器上那一支被就地改过的产物。
  本 Note 不改判定规则，只把它记清楚；把已装 app 换成**归档的出货载荷**（2.3.2）是后续动作。

## Consequences

- **正面**：换签遗留从「静默 2.5 小时、面板显示相反结论」变成「安装收尾一行红灯 + 一句可照做的处置」；
  判定能说「不」，且这一点由门禁保证；重授的**时机**第一次成为流程的一部分（SOP §5.6）。
- **负面 / 边界**：检出器依赖系统库 schema（本机 `admin.version=32`）；只读，不写库；封条破损时
  一律「判不了」；「尚未授权」与「死授权」必须分开，否则判据变噪声。
- **后续动作**：
  1. **已结（2026-09-13 15:44）**：本机在身份版上的一次性重授完成，判据④ 通过；要求形态实测为
     **身份型**（`identifier "ai.deepseek.dsh.desktop" and certificate leaf = H"ba3372a3…"`，无 cdhash）
     ⇒ (a) 成立、(b) 被排除，ADR-0063 的路线在自签前提下站得住。基线快照在
     `~/Library/Application Support/LUTE/tools/tcc-snapshots/`，判据⑤ 待升级 + 重启后取 `--diff`。
  2. **「输入监控」是否真为必需——已判定：非必需**（2026-09-13 15:41 实验，见
     [ADR-0069](../../../adr/ADR-0069.md)）。本条此前写着「未定之前指引保持三项」，而同一批改动里的
     门禁把这句话变成了**强制校验**——六个出货面 + 单测一起把「第三项在输入监控下」钉死，
     于是自我约束失效、谁把文档改对反而判红。实验读数：只授两项时 `doctor` 三项全 true，
     而库里 `kTCCServiceListenEvent` **一行都没有**。出货指引已改为两项，门禁规则与单测同批更正。
  3. 把已装 app 换成**归档的出货载荷**（2.3.2，从 `~/Library/Application Support/LUTE/releases/2.3.2/`），
     让「跑着的那支 == 交付的那支」在字节层面也成立。
  4. `packaging/scripts/*-test.sh` 整体纳入门禁仍待单独立项（ADR-0063 后续动作⑦）；
     本轮先把 `verify-tcc-form-test.sh`（本判据的形态判决）与 `verify-tcc-persistence-test.sh`
     （判据⑤ 的静态证明）两支纳入。
  5. **同一份读库逻辑不得有两份实现**：`verify-tcc-runtime.sh` 自带的那份已被删除，
     改为调 `tcc-grant-status.sh --format=tsv`。删除的动因是它把 `csreq` 的 stderr 错误文本
     当成了「库里存的要求」，把「从来没有授权」报成「需重授一次」。三种缺失形态（无记录 /
     解不出 / 死授权）现在各有明确结论，且都有反向断言守着。
