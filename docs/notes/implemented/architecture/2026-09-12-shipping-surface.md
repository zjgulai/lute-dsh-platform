# 出货面：23 条 file: 依赖里唯一漏网的那一条，牵出「补前缀」这个修法本身不够

- 日期：2026-09-12
- 状态：implemented
- 决策记录：ADR-0056
- 取证与方案：`.scratch/pre-dmg-diagnosis/diagnosis-report.md`（DMG 2.2.0 打包前 MECE 诊断；含 A–F 六维与逐条证据）
- 上一轮：[2026-09-12-dependency-reproducibility.md](2026-09-12-dependency-reproducibility.md)（ADR-0055；本条的判据从「包清单」扩到「出货树」，是它的直接延续）

## Problem

DMG 2.2.0 打包前的诊断要回答一个问题：**今天直接把当前形态打成 DMG，客户机上会发生什么。** 「产品内容与范围」这一维查出一条跨项目依赖，取证过程中它牵出两个更大的结论。

问题从一条依赖开始。profile 的 `package.json` 里：

```
dsh-kol-hunter-local = file:/Users/lute/project/KOL-Hunter
```

它在 `dsh.profile.bundles` 第 32 位，也在 `agt-033` 的 preset 组合里（`- id: product-kol-hunter / name: 'dsh-kol-hunter-local'`）。模拟 `assemble.sh` 的 vendor 抽取逻辑后，23 条 `file:` 依赖里**只有它**不进 vendor：

- 抽取只认两个前缀：`file:../../../project/Magpie-Horch/` 与 `file:/Users/lute/project/Magpie-Horch/`；
- `rewrite-file-deps.mjs` 的 `OLD_PREFIXES` 是同一张表 → 它不被重写成 `file:./vendor/<name>`；
- 该脚本末尾的 vendor 存在性校验只看 `file:./vendor/` 开头的条目 → 它也逃过 `--check`；
- 而 `install.sh:150` 调 `--check` 时带 `|| true` → 四道关全静默。

结果是：出货 profile 里会留着一条指向打包机家目录的绝对路径，客户机上永远指不到东西；同时那份 `node_modules` 副本还带着陈旧内容（`lib/client.template.js` 源 19:08 / 副本 11:22），而门禁 `profile-bundle-sync` 明确把「非本仓库受管的包」排除在断言面之外——**它不受任何门禁守护**。

查清事实后出现了第二条、也是更关键的一条：

**把 KOL-Hunter 搬进本仓库是错的。** ADR-0033 §1 写得很清楚：「实现包、`prompts/`、`templates/`、`artifacts/` 都在同一个产品目录里……**产品代码留在各自项目：本仓库只出规格、校验器与启动器，不吞并产品**。」`scripts/role-presets/generate.mjs:225` 的注释也按这条写的。也就是说，真正的缺陷不是「依赖路径写错了」，而是**出货的 preset 把一个别的项目烘焙了进去**：产品行是硬依赖——客户机上装不到那个包，该岗位组合就装载失败（`plugin tree failed to load` → 恢复模式）。

第三条：同一族缺陷本轮共出现三次，每次都是「本机可解、客户机必错、且静默」：

| # | 事实 | 逃过检查的原因 |
| --- | --- | --- |
| 1 | `file:/Users/lute/project/KOL-Hunter` | 前缀表外，且 `--check` 被 `\|\| true` 吞 |
| 2 | `cordis.patch.yml` 的 `ui-newapp-local.productRoots: [/Users/lute/project]` | `assemble.sh` 只 sed 了 `$DSH_HOME`（`<home>/.dsh`），另一个前缀无人处理（实测旧 2.1.0 payload 里还没有这段，是 9-12 newapp 工作后新增的） |
| 3 | 插件脚本/文档写死 `/Users/lute/project/Magpie-Horch/...`（历史坑，只修了被报障的那几处） | 没有任何机读判据把它们当缺陷 |

结论：**「再补一条前缀」治不了这个类**——本轮它就是被前两次的补法漏掉的。

## Decision

1. 出货的 preset **不烘焙任何外部产品行**：`PRODUCT_MOUNTS` 置空，机制（渲染函数、注释、断言）保留。
2. KOL-Hunter 随本次**移出产品面**（用户裁定）：`PRODUCT_MOUNTS` 清空并重生成 50 个 preset、profile 去掉 `dependencies` 与 `bundles` 两条目、node_modules 副本移出、锁文件重算。产品目录本身原样留在项目里。
3. 本机要挂自己的产品，走**本机装配**，不写回出货物。
4. 两个机器前缀都参数化：`__DSH_HOME__` 与 `__LUTE_PROJECT_ROOT__`（默认 `$HOME/project`）；安装侧两个都替换，残留占位即报错。
5. 新增出货树机器路径守卫（`packaging/scripts/scan-machine-paths.mjs` + `machine-path-baseline.json`），在签名前对 `$BUNDLED`（≡ `profile.tar.gz`）扫描，**只减不增**；基线缺失即失败。

执行与验收（全部实跑）：

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| preset 重生成 | `node scripts/role-presets/generate.mjs` | 50 个目录；`grep -c dsh-kol-hunter-local agt-033/agent.cordis.yml` → 0；全量 preset 引用数 → 0 |
| 保真校验 | `node scripts/role-presets/verify-lossless.mjs` | 10 层全过、**4821 断言**、exit 0 |
| 与备份逐文件 diff | `diff -rq <backup> ~/.dsh/.agent-presets` | **仅 1 个文件不同**，且差异正好是那 6 行产品行（零附带改动） |
| profile 移出 | 脚本删 dep + bundle + 移 node_modules | deps 38→37、bundles 39→38、`grep -c kol-hunter package.json` → 0 |
| 锁文件 | `pnpm install --lockfile-only --ignore-scripts` | 892ms；lock 内 kol-hunter 引用 0；`node_modules` 顶层项 234→234（未动） |
| 出货面彩排 | 复刻 assemble §2（抽取 22 个 vendor + 重写 + 占位） | 配置面 `/Users/lute` 命中 **0**；22 条 `file:` 全部 `file:./vendor/`；`--check` **exit 0** |
| 守卫三态 | 正例 / 注入泄漏 / 基线缺失 | exit **0 / 1 / 2**（变异测试证明非空转） |
| 门禁 | `pnpm run gate` | **17/17 通过、exit 0** |

## Alternatives considered

- **把 KOL-Hunter 纳入本仓库并 vendor 化**（诊断阶段我给的推荐，据此用户先答了「入库」）：与 ADR-0033 §1 冲突，且要把一个 `status: draft` 的 M1 试点连同 90M 开发目录搬进仓库。把 ADR-0033 原文摆到用户面前后，用户改为「本次不随包」。**教训：推荐前先读已有 ADR，别按「它看起来像个普通依赖」下判断。**
- **只把实现包入库、声明留在项目里**：技术可行（L2 技能是包内自带，运行时确实不读产品目录），但拆开了 ADR-0033 的「声明 + 实现包同在产品目录」结构，需要改 ADR；且客户机上那张卡仍要客户自己有产品目录才出现。留作后续候选。
- **保留 `PRODUCT_MOUNTS`、打包时剥掉那一行**：出得干净包，但「本机真值」与「出货真值」分叉，第二份剥离清单会漂移（ADR-0009）。
- **只把 KOL-Hunter 路径加进 `OLD_PREFIXES`**：正是被本轮证明不够的修法。
- **`--check` 维持 `|| true`**：同轮诊断已把它列为「装完才知道坏」的静默点。

## Consequences

**正面**

- 出货 preset 不再要求客户机存在任何外部产品；`agt-033` 的悬空挂载面消失。
- 出货树机器路径从「靠人记得改」变成「机读、只减不增、基线缺失即红」；两个占位语义清晰（数据根 / 项目根）。
- 反过来说明一条方法论：**判断一个依赖该不该随包，先问它在架构里属于谁**（ADR-0033：属于项目），再问路径怎么处理。路径是症状。

**代价（如实登记）**

- **本机 `agt-033` 失去 KOL-Hunter 的产品行**：`verify-lossless` 全绿，但本机那张卡的 L2 技能不再注册。恢复需要本机装配层（决策 3），本轮未做。
- **基线不是零**：39 条存量命中（`vendor/` 里的文档与测试夹具、构建产物的源映射注释、`node_modules/.pnpm` 内部状态等）。判据是「只减不增」而不是「清零」，逐条清理排进 P2。
- `assemble.sh` 多约 10–15 秒扫描开销（实测扫 475M 用 6.7s）。

**未做 / 后续**

- P2-1 逐条清理基线存量（先清 `lib/` 内注释与文档，再评估测试夹具改中性 fixture）。
- P2-2 守卫扩到 app 侧（`app.asar.unpacked`）并另立基线。
- P2-3 若确需向客户演示某产品，另立 ADR 讨论随包产品目录的形态与体量治理。
- 未验证项：本轮未做真实装配（`assemble.sh` 全流程属阶段 2），守卫在真实 `$BUNDLED` 上的首次运行会在那时发生；基线是用「暂存彩排 + node_modules 代理扫描」的并集建立的，真实构建若出现基线外条目会响亮失败——这是设计意图，也是需要在那时确认的一点。
