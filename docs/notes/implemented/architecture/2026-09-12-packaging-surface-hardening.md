# 打包面加固：六个「装完才知道坏」的静默点，一次收口

- 日期：2026-09-12
- 状态：implemented
- 决策记录：ADR-0056（本 Note 是它的实施面；产品形态决策见 [上一篇](2026-09-12-shipping-surface.md)）
- 取证：`.scratch/pre-dmg-diagnosis/diagnosis-report.md`（DMG 2.2.0 打包前 MECE 诊断）
- 范围：`packaging/`（assemble / sign-and-dmg / install.sh / smoke-test / 新守卫）与 `scripts/gate.mjs`。**不改基座、不改插件业务代码。**

## Problem

诊断在「构建链」「安装分发」「验证回滚」三维上查出一组同族缺陷：**默认路径是绿的，出事只是「警告」**。逐条取证如下（全部有命令输出）。

1. **白屏兜底只在开发机 app 上（RootOutlet）。** 2026-09-07 的就地修复从未进过打包面：`packaging/patches/nm/` 24 个补丁里没有 `dsh-client-ui-renderer`，vendor fork 源码里也没有（renderer 来自 read-only 参考树之外的运行时包），`staging/2.1.0` 的该文件仍是 `throw new SlotAssemblyError(...)`。实测 `diff -u` 两侧：pristine 57069B vs 已修 57673B。
2. **冒烟不在流水线里。** `smoke-test.sh`（37 项断言、隔离安装）只写在 README 与 SOLUTION 里当"推荐步骤"，`assemble.sh`/`sign-and-dmg.sh` 都不调用它。一个不跑就绿的产物会被直接打成 dmg。
3. **dmg 的互斥锁是假的。** `LOCK="$REL/.build.lock"` 位于 `$REL` 内，而第 33 行 `rm -rf "$REL"` 会把锁一并删掉——互斥窗口退化成毫秒级。
4. **安装后校验失败只打警告**，退出码仍是 0（verify-patches / brand-replay / reloc-aeis 三处），客户拿到缺件环境而唯一信号是一行可被忽略的 ⚠。
5. **冒烟的 vendor 断言与归组后的布局不匹配**：`smoke-test.sh:67,127` 写死扁平路径 `vendor/dsh-theme-local`，而归组（ADR-0011）后是 `vendor/packages/<group>/<pkg>` → **正确产物必然假红**（重演「假 DRIFT 训练人忽略输出」）。
6. **升级静默吞掉客户自装插件**：`OWNED=(… node_modules vendor overrides)` 整体替换，旧副本被 mv 进备份目录后再没人看那份列表。
7. **技能面没收敛**：整份 `~/.dsh/skills`（1611 个 / 66M）随包，其中 989 个 p2s 语料无人引用，并含 PolyForm 非商用的 `lieflat-charts`。
8. **陈旧产物可被误发**：`staging/2.1.0` payload 是 11:05 的快照，而当天 21:29–23:31 才修好 verify-patches-v2 默认路径 / install.sh / sign-and-dmg / smoke；`staging-src/2.0.0` 1.2G 无任何脚本引用。

## Decision

一次收口，原则是**把默认路径从「绿」改成「要么真绿、要么响亮红」**：

| # | 改动 | 判据 |
| --- | --- | --- |
| 1 | RootOutlet 修复固化为 NM 补丁 **P0-9**（`packaging/patches/nm/@deepseek-ai/dsh-client-ui-renderer/lib/client.js.patch`） | `verify-patches-v2.sh` 锚点 `data-slot-waiting`（36 锚点）；对 `/Applications` ALL VERIFIED，对 pristine 树响亮 FAIL |
| 2 | 冒烟接入流水线：`assemble.sh` 末尾自动跑 `smoke-test.sh`，失败即退出 1；跳过必须显式 `SKIP_SMOKE=1` 且大声打印 | 冒烟 37 项断言 |
| 3 | 锁移出 `$REL`（`release/.build.lock`） | 占锁时被拦（exit 1），解锁后放行——两向实测 |
| 4 | 三处校验改为「收集全部失败 + 末尾非零退出」，**不触发回滚**（文件留在原地供排查） | 退出码 1 + 逐条 ✗ 明细 |
| 5 | 冒烟 vendor 断言改为**布局无关**（只断言非空；逐条比对交给 completeness.vendor 循环） | 语法 + 断言语义 |
| 6 | 升级前按「**旧 profile 声明 − 新包声明**」清点自装插件并打印 + 落 `upgrade-extras.txt`（判据换成差集，因为「node_modules 顶层不在清单里」会把 271 个传递依赖全算进来） | 变异测试：旧={base,my-quotes,customer-added}、新={base,my-quotes,newapp} → 只报 customer-added |
| 7 | 技能面**打包时现算**：被引用集（preset 组合 + 仓库映射）− 受限许可名单（`packaging/skills-denylist.json`，逐条带理由）；落位后再 `--check` 反向自检 | 1611 → **539**（66M → 18M）；lieflat-charts 双向验证（源目录 --check 报 1、选择结果 --check 通过） |
| 8 | 门禁扩到打包面：`patch-anchors` 增加 `packaging/staging/*/app` 目标；新增 `staging-freshness`（payload/tools 与仓库同源）；陈旧 staging 清理（释放 3.2G） | 两项新检查对陈旧 staging **均报红**（非空转已证） |

配套口径同步：`patches-manifest-v2.md`（P0-9 行 + 36 锚点）、`assemble.sh`（NM 覆盖说明、README 内嵌文案、completeness 生成器改为读**出货 tarball** 的技能清单而不是源目录）、`docs/dsh-desktop-white-screen-playbook.md` §6.1（从 ⚠ 未闭环 改为 ✅ 已闭环）。

## Alternatives considered

- **只把 KOL-Hunter 路径加进 `OLD_PREFIXES`**：治当次不治类（同类本轮出现三次），已由 ADR-0056 的「参数化 + 机读守卫」取代。
- **把 RootOutlet 修复写进 vendor fork 源码**：不行——renderer 包来自运行时 tgz（`vendor/dsh-desktop.pin` 明写 `harness-submodule-role: read-only-ref`，不参与构建），只有 NM 层可打。
- **冒烟放进 `sign-and-dmg.sh`**：也可以，但那时 app 已签名归档，失败要重跑 8 分钟装配；放在 assemble 尾部能用同一份暂存产物立刻定位。
- **升级时把自装插件拷回去（真合并）**：风险高于收益——pnpm 布局与 `.pnpm` 存储一致性会被破坏，而旧副本已在备份目录里，人工恢复路径清晰。故本轮只做「清点 + 响亮 + 给恢复办法」。
- **技能面存一份白名单文件**：第二份事实（ADR-0009），preset 一改就漂移且静默。改为打包时现算。
- **给 `staging-freshness` 加豁免**：等于把「陈旧产物」合法化。改为清理陈旧 staging，让新检查从空集开始。
- **保留 v1 `verify-patches.sh` 随包**：它已 exit 2（退役），随包只会让客户跑到「本脚本已退役」那句，看起来像失败。已从 `tools/` 去掉；README 里那两行指令同步删除。

## Consequences

**正面**

- 六个静默点全部变成「要么真绿、要么响亮红」；其中 RootOutlet 是**真实客户可见缺陷**（白屏兜底从"开发机独有"变成出货即带）。
- 门禁覆盖面从「本机 app」扩到「打包面 + 出货物同源性」，陈旧快照再也不能装作可发布物。
- 技能面从 1611 → 539，包体 −48M，且非商用许可技能有机器判据挡在前面。
- 清理释放 3.2G（`staging/2.1.0` 2.0G + `staging-src/2.0.0` 1.2G），元数据保留在 `.scratch/pre-dmg-diagnosis/stale-artifacts/`。

**负面 / 代价**

- `assemble.sh` 增加约 5 分钟冒烟（可用 `SKIP_SMOKE=1` 显式跳过，但会大声打印"本轮产物未被验证，禁止据此发布"）。
- 技能面收敛后，客户技能中心少 1072 张卡（含全部未引用 p2s 语料）——这是决策 K5/K6 的预期结果，但属于**客户可见变化**，需写进交付说明。
- 升级清点只"报"不"修"：自装插件升级后仍需人工恢复（办法已打印在安装日志里）。

**未做 / 后续**

- P2-1 基线里 39 条存量机器路径待逐条清理（守卫已挡住新增）。
- P2-2 守卫扩到 app 侧（`app.asar.unpacked`）。
- P2-3 DMG 拖拽布局 + 内嵌全量兜底（决策 K7/K7b，属阶段 2 的 ⑦）。
- 全流程 `assemble.sh` 真实跑通尚未进行（属阶段 2）；本轮的验证止于：补丁可应用且幂等、锚点双向、门禁两部分对陈旧树报红、技能选择器双向、升级判据变异测试、安装器语法与互斥锁实测。
