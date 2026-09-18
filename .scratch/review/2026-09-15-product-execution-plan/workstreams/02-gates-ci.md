# Workstream 02 · 门禁真实性、CI 与远端保护

## QG-001 · 统一 pass/fail/skip 三态与空射程语义

- 优先级：P0
- 估算：M
- 依赖：BASE-001
- 可并行：可与 REL-001、SEC-RT-001/002/004 并行

### 目标

所有 gate 只能给出 pass、fail、skip；“没有测到”不得显示为 `ok`。

### 范围

- gate check 返回结构、summary、CLI 退出码。
- catalog、profile、live、release 等已有空射程分支。
- 发布或严格 CI 使用的 `--require-no-skip`。

### 非范围

- 本卡不改变各业务 checker 的具体判据。
- 不把所有可选环境变成 CI 必装依赖。

### TODO

- [x] 记录当前存在 `passed:true` 但实际没有测量对象的全部路径。
- [x] 定义统一 result schema：status、expected、discovered、checked、skipped、failed、reason。
- [x] 必备治理文件缺失为 fail。
- [x] 可选环境整体不存在为 skip。
- [x] 环境已存在但 expected>0 且 checked=0 为 fail。
- [x] expected 必须等于 checked + typed skipped + failed。
- [x] summary 中 skip 与 pass 分开计数。
- [x] 增加 `--require-no-skip`，任何 skip 非零退出。
- [x] 为旧 checker 提供一次性迁移适配，但不永久保留两种含义。

### 自动验收

- [x] 必备文件缺失 → fail。
- [x] 可选环境缺失 → skip。
- [x] 环境存在但测量为 0 → fail。
- [x] skip 不计入 pass 数。
- [x] strict 模式遇 skip 返回非零。
- [x] CLI JSON/文本输出都能追溯“测了什么、没测什么”。

### 人工验收

- [x] 随机抽 5 个 gate，仅看输出即可解释射程与结论。

### 失败边界

不得为保持绿色将 fail 改成 skip；若统一 schema 迁移未完成，先不启用 required check。

### 2026-09-16 本地证据

- Red：旧 CLI 对 `--json`、`--require-no-skip` 均返回用法错误 2；catalog/profile/skill/staging 审计发现多条空射程 pass。
- Green：canonical schema 自测 14/14；`test:gate` 398/398；quick JSON 可解析，正式 quick 为 65 checks 中
  64 pass、1 typed skip、0 fail，正式 full 为 72 checks 中 71 pass、1 typed skip、0 fail，且对象级守恒。
  strict 对同一 skip 返回 1。文本随机抽样能直接看到每项五个计数与原因。
- 边界：旧 checker 仍经集中 adapter 按一个 gate 单元记账；其业务对象分母由 QG-003/004/005 等卡独立迁移。
  并行启动三份完整 quick gate 曾触发既有共享 fixture 干扰，归 QG-006B，不在本卡冒充解决。

## QG-002 · live-presets 全量判据

- 优先级：P0
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-003..005 并行

### 目标

每一条真实 preset row 都进入 checked、明确 disabled 或 failed 之一。

### TODO

- [x] 固化当前 53 个 preset 中 checker 报告 1,590 rows、另有 52 条裸 `dsh-skill-subset` 未进入分母的 Red 证据；数字只作迁移基线，实施时必须重采而非写死。
- [x] 优先复用宿主真实 parser/resolver；若不能复用，建立受控 YAML scalar/row 解析契约。
- [x] 覆盖裸包名、scoped package、路径、`file:`、`cordis:` 和占位符。
- [x] 未知 dynamic expression 不能自动当 disabled。
- [x] 输出 discovered/checked/disabled/failed。
- [x] preset 根整体不存在为 skip；根存在但应有文件缺失按契约 fail。
- [x] 不修改任何用户 preset。

### Red/Green 验证

- [x] Red：最小 fixture 只放一条裸包名时，旧 checker 的 `discovered/checked` 仍为 0 或保持绿色。
- [x] Green：同一 fixture 修复后必须得到 `discovered=1`、`checked=1`；当前仓库满足 `discovered = checked + disabled + failed`，52 条裸包全部有逐条结果。

### 负例

- [x] 裸包名不存在、重复、被注释伪装、缩进错误、未知动态表达式分别失败；合法显式 disabled 只能进入 typed disabled，不能进入 pass。

### 证据层级

- [x] L1 parser fixture 证明 row 分类；L2 临时 preset 树 mutation 证明 gate 判别力；L3 当前仓库只读全量清单证明分母。真实用户 profile 扫描仅是 live acceptance，不替代 L1/L2。

### 自动验收

- [x] 解析分母等于真实 `name:` row 数。
- [x] 当前裸包名不再漏检。
- [x] 删除裸包、缺文件、错误路径、未知表达式都有负例。
- [x] 占位符出现在非注释配置中会失败。
- [x] 零射程明确 skip。

### 人工验收

- [x] 只读扫描当前 53 presets，按每种 row 形态抽样核对。

### 退出条件

- [x] 当前 53 个 preset 的每条 row 都有稳定 ID、分类和结果，且任何移除/替换一条裸包的 mutation 都会让 gate 非零退出。

### 失败边界

解析不确定时必须 fail 或 typed skip；不保留 permissive fallback。

### 2026-09-16 本地证据

- L1/L2：live-presets、canonical 与调用方定向 suite 57/57；删除一条裸包、替换成另一个仍可解析的包，
  resolver 可保持绿色而 identity inventory 必红。缺文件、坏缩进、重复 ID、未知 dynamic、六类 specifier 均有负例。
- L3：真实用户根只读重采 53/53 个文件、1,642 rows；1,483 checked、159 platform-disabled、0 failed；
  52 条裸 `dsh-skill-subset` 全部有 stable ID 与结果，per-preset inventory 完全匹配。
- 抽样：真实数据覆盖 builtin、scoped/bare package、nested group 与平台 disabled；当前真实根没有相对/绝对/file row，
  这三类由 L1 fixture 验证，不虚构 live 样本。真实 `~/.dsh` 没有任何写入或 mutation。

## QG-003 · plugin-entry 契约闭合

- 优先级：P0
- 估算：M/L
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-002、004、005 并行

### 目标

候选插件的真实入口、`apply`、service 使用和 `inject` 声明形成完整、可解释的契约。

### TODO

- [x] 固化当前“21 checked / 23 candidates 仍绿”的 Red。
- [x] 从 manifest `main`/`exports`/DSH entry 解析真实入口，不硬编码 `lib/index.js`。
- [x] 候选分类为 plugin、library、typed skip、无法判断；无法判断不静默继续。
- [x] 入口缺失、不可解析、缺 apply、service→inject membership 不一致均有明确结果。
- [x] 处理 re-export、多行声明和 type-only 情形。
- [x] 避免注释/字符串导致 ctx property 假命中；没有新增 dependency 许可时优先最小 parser 或已有工具。
- [x] remediation 文案必须只承诺 checker 真正检查的内容。

### Red/Green 验证

- [x] Red：保留当前“23 candidates 中仅 21 checked 仍退出 0”的最小重放，并分别指出被静默跳过的阶段。
- [x] Green：先把候选分解为 `pluginExpected + library + typedSkip`；对 plugin 集合强制 `checked === expected`，总体强制 `candidateTotal === pluginExpected + library + typedSkip`，任何入口缺失都不能从分母消失。

### 负例

- [x] 删除 `main`/`exports` 指向的入口、制造悬空 re-export、移除 `apply`、访问未声明 service、伪造注释/字符串命中，均得到确定的非零退出。

### 证据层级

- [x] L1 manifest/entry resolver fixture；L2 临时 package mutation；L3 当前全部 candidate 清单。只有 L1/L2 通过后才允许把 L3 接入 required gate。

### 自动验收

- [x] missing/malformed entry 判红。
- [x] 访问 service 但 inject 列表没有该 service 判红。
- [x] library 与合法 re-export 被正确分类。
- [x] 当前 23 个候选全部得到解释，不能只显示 21/23。
- [x] checker 规则、测试用例和错误修法一致。

### 人工验收

- [x] 抽查一个 host plugin、一个纯库、一个跨文件导出包。

### 退出条件

- [x] 当前候选没有 unexplained omission，plugin 的 `checked/expected` 全等，且 missing-entry 与 service/inject mutation 都稳定非零退出。

### 失败边界

语义检查不能可靠落地前，不接入硬门禁；但必须保留旧事故的精确最小防线。

### 2026-09-17 实施证据

**Red 实测**（直接调模块，因为它当时还没接线）：

```
受管包总数: 25    candidates(dsh.bundle.patch): 23    checked(导出 apply): 21
静默跳过 A —— lib/index.js 读不到: 0
静默跳过 B —— 不导出 apply: 2
   packages/capabilities/dsh-deepresearch-local
   packages/surfaces/dsh-agent-team-gui-local
门禁读数: passed=true | 核对 21 个 Cordis 入口（23 个带 dsh.bundle.patch 的包）
```

**同时发现这个模块从未被任何东西 import**（`grep -rn "plugin-entry-contract" scripts/` 只命中
它自己与它的测试）：它是 P-04「写了但从没跑到」的形态叠在 P-02 上。现已接线成
`gate:plugin-entry-contract` + `gate:plugin-entry-contract-selftest`。

**Green 实测**：`expected=23 checked=23 skipped=0 failed=0`，
`候选 23 个（plugin-apply=21 plugin-service=2 library=0 unresolved=0）`。

**实施中被实测推翻的两处设计**（都不是「顺手改」，是证据逼出来的）：

1. **「不导出 apply 就是库」这个分类本身是错的。** 那 2 个候选是 Cordis `Service` 子类
   （默认导出是类，类体内 `static inject`），它们是插件。分类改成四态，且**四态都进分母**。
2. **`try { … } catch {}` 里的 `ctx.<服务>` 不是缺陷形状。** 收窄到「未加 try 防护的属性访问」，
   依据是 `dsh-skill-center-local` 的 `findPairing()`——注释写着 "never a throw"，
   它在 try 里刻意探测 `ctx.remoteWebUiPairing`。第一版按「名字去重、留第一次出现」还踩了
   另一个坑：guarded 的那次会把后面裸的那次顶掉，于是真正会崩的访问反而不报了（测试抓到）。

**第三个包是「读对了纯属巧合」**：`dsh-task-board-local` 的清单入口是 `./index.js`
（`export * from './lib/index.js'` 的转出口壳），旧实现读的是 `lib/index.js`。
现已按清单解析 + 跟随转出口，L3 有专项断言钉住它。

**反向自测**：`scripts/gates/plugin-entry-contract.test.mjs` 28 条全绿，覆盖
L1（剥离器/导出面/类链/入口解析）、L2（临时包树上的四种变异）、L3（真实候选的账目恒等式）。

**未做 / 边界**：模板字面量 `${…}` 插值里的 `ctx.x` 看不见（漏报不是误报）；
正则识别失败由括号平衡自检拦下归入 `unresolved`；`plugin-service` 只核对 inject 的**字段形态**
（必须是 `static`），不核对它要哪些服务——那要求枚举宿主全部服务名。这条边界写在模块注释与
门禁 note 里，不留给人推断。

## QG-004 · Profile sync 覆盖率与错误显式化

- 优先级：P0
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：中

### 目标

profile 整体不存在可以 skip；profile 已存在时，缺件、少测、坏 JSON、错误 entry 都必须失败。

### TODO

- [x] 用 HEAD 实现重现 nested vendor 路径导致 0 个比较仍绿的 Red。
- [x] 建立 expected managed set，保留完整 `packages/<group>/<package>` 相对路径。
- [x] 输出 expected/checked/skipped/failed 和每个对象分类。
- [x] 区分受管包、外部 `file:` 包和明确不出货包。
- [x] manifest 读取/解析错误直接失败。
- [x] profile 已存在但只命中部分受管包时失败。
- [x] metadata、files、bundle、loadpoint 分别报告，不互相代替。
- [x] candidate fix 必须针对 0/N、1/N、N-1/N 均有 mutation。

### 自动验收

- [x] 0/N、1/N、N-1/N 分别失败。
- [x] malformed manifest、缺 loadpoint、错误 main/exports/dsh/files 均失败。
- [x] 只有 profile 根整体不存在才允许 skip。
- [x] 随机修改一个嵌套 vendor package 能稳定打红。

### 人工验收

- [x] 只读核对 desktop profile 的 expected/checked 明细和真实装载路径。

### 失败边界

不得用 exemption 掩盖 live profile 漂移；先区分仓库错误和外部 profile 错误。

### 2026-09-17 实施证据

**卡面第一项（nested vendor 路径导致 0 个比较仍绿）在 HEAD 上已不成立**——
`profile-metadata-sync` 早先已加过「一个包都没比到就判红」的守卫。本轮实测到的是**同一根因的
另一个实例**，而且更贵：把 profile 的 `package.json` 写成截断 JSON，**三个 profile 门禁一起静默变绿**。

**Red 实测（端到端，假 HOME，`node scripts/gate.mjs --mode quick --json`）**：

```
summary: {"status":"fail",...,"passed":65,"skipped":6,"failed":1,...}
skip  profile-metadata-sync   （vendor 不存在，本项自己的算术）
pass  profile-files-sync      （读数里一个字都没有）
pass  profile-bundle-sync     note=对比 0/0 个 file: 依赖
```

注：该次 run 里唯一的 fail 是 `skill-lines-selftest`，它是假 HOME 造成的，与本次改动无关
（改动前的同一次 run 里它同样失败）。

**Green 实测（同一假 HOME，同一命令）**：

```
fail  profile-metadata-sync [expected=1 checked=0 failed=1]
      - .../profiles/desktop/package.json 不是合法 JSON（Expected property name or '}' in JSON at position 47）
fail  profile-files-sync    [expected=1 checked=0 failed=1]
fail  profile-bundle-sync   [expected=1 checked=0 failed=1]
```

**真实 HOME 读数**：三个面各 `expected=24 checked=24 skipped=0 failed=0`；
note 里带着「profile 声明 24 个 file: 依赖（受管 24 / 不受管 0），受管但未声明 1 个」。

**设计选择（写下来，因为它是刻意的）**：

- **「受管但未声明」只进读数、不判红。** 本机 profile 裁剪是合法的；把合法状态判红只会
  换来一条豁免，而豁免会让真信号一起失效（ADR-0014 豁免只减不增正为此）。实测未声明的那个是
  `dsh-paper2skills`——它有 `exports` 但没有 `dsh` 字段，是纯库不是 profile 成员。
  note 里会把「带 `dsh` 声明却未被声明」的包**单独点出来**，那才是真信号。
- **只允许一种 skip：profile 根整体不存在。** 根在、`node_modules` 或 `vendor` 不在 → 判红。
- **期望集按完整相对路径后缀对齐**，不按 basename。旧实现用 `split('/').pop()`：
  `packages/infra/dsh-x` 与 `packages/surfaces/dsh-x` 会被认成同一个包（自测里有这条负例）。
- **`installedProfileDependencies()` 删除，不留同名「安全版本」**——留着就会被下一次顺手用回去。

**反向自测**：`scripts/gates/profile-coverage.test.mjs` 18 条全绿（0/N、1/N、N-1/N 三条 mutation
各一条；坏 JSON、根在但读不到、目录缺失、basename 撞车、受管未声明只进读数）。
把「目标缺失判红」那一段关掉后 **7 条转红**。已接线成 `gate:profile-coverage-selftest`。

**未做 / 边界**：没碰真实 profile（Red/Green 全在假 HOME 与临时 fixture 上跑）；
`metadata` / `files` / `bundle` 三面共用同一个期望集，`loadpoint` 不是独立第四面
（它是 `bundle` 的口径，卡面把两者并列只是为了强调「字节」与「存在」不可互推——
这里由 `profile-files-sync` 判存在、`profile-bundle-sync` 判字节，两者刻意分开）。

## QG-005 · changedPackages 射程

- 优先级：P1
- 估算：S/M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：高

### 目标

正确识别 main 超前远端、staged、unstaged、untracked、rename 和 delete 涉及的 package。

### TODO

- [x] 明确本地 base 选择优先级：优先解析当前分支 upstream，并以 `git merge-base HEAD <upstream>` 为 committed diff 基线；当前 main 的审计基线为 `origin/main`，不得使用 `main...HEAD` 自比较。
- [x] CI 使用事件提供的 base SHA，并验证该对象已 fetch 且确为 merge-base 可达；shallow history 无法证明时失败。
- [x] base 不可解析时 fail，不返回空集合。
- [x] 纳入 staged、unstaged、untracked。
- [x] rename/delete 同时映射旧、新 package。
- [x] 根治理文件变更触发预定义的全局或相关检查。
- [x] 当前 untracked Settings Shell 成为 fixture 正控，但测试不能操作真实文件。

### Red/Green 验证

- [x] Red：当前 local HEAD 超前 `origin/main` 时，旧 `main...HEAD` 射程为空；新增 untracked package 也不进入结果。
- [x] Green：committed 范围来自 `merge-base(HEAD, origin/main)..HEAD`，再与 staged、unstaged、untracked、rename/delete 集合求并集；每个输入都能追溯到命中的 package 或全局规则。

### 负例

- [x] upstream 缺失、base SHA 未 fetch、shallow clone 无 merge-base、只有 untracked manifest、跨 package rename、已删除 package 分别覆盖；未知 base 必须非零退出。

### 证据层级

- [x] L1 临时 Git repo 的提交图/工作树 fixture；L2 当前仓库只读对比 `origin/main`、local HEAD、dirty/untracked candidate；L3 CI event base 重放。三层不得互相替代。

### 自动验收

- [x] main 直接提交且超前 origin 能识别。
- [x] 全新 untracked package 能识别。
- [x] rename/delete 能定位相关包。
- [x] base 未知明确失败。
- [x] 无改动才返回空集合。

### 人工验收

- [x] reviewer 对一个“local HEAD 超前 upstream + staged + untracked + rename/delete”的临时 Git 图逐项核对命中来源，并确认无改动案例才返回空集合。

### 退出条件

- [x] origin merge-base、local commits 与四类工作树变化均有 mutation 覆盖；只有被证明为空的完整并集才允许 `changedPackages=[]`。

### 失败边界

任何未知范围都不能退化成“无改动”。

### 2026-09-17 实施证据

**Red 实测（L1 临时 Git 仓库）**：`origin/main` 停在 init，本地另走两个提交。

```
ahead/behind (origin/main...HEAD): 0  2
--- 旧来源 1: diff --name-only main...HEAD ---
  条数: 0                       ← 自比较
--- 旧来源 2/3: HEAD + --cached（无未提交改动时为空）---
  条数: 0 + 0
--- 正确基线: merge-base(HEAD, origin/main)..HEAD ---
packages/a/package.json
packages/b/package.json
```

真实仓库再测：31 个 untracked 文件一个都不在旧射程内，其中
`packages/infra/dsh-team-hub/src/bounded-body.mjs` 与它的测试是新增的包文件——
**新包在被 `git add` 之前对门槛完全隐形**。新射程把它算进来了
（`changed-packages` 的 note：`untracked=35`，直接命中的包从 7 个变成 8 个）。

**Green 实测**：`expected=12 checked=12 skipped=0 failed=0`，
note = `基线 origin/main@cc6f1ac3（remote-tracking）；来源 committed=0 staged=0 unstaged=45 untracked=35；
直接命中的包 8 个；命中的治理规则：adr-registry、architecture-contract、gate-instrument、pitfall-registry`。

**实施中被实测推翻的两处设计**：

1. **治理规则表里删掉了 `pnpm-lock.yaml`。** 实测它被 `.gitignore` 忽略（该文件是白名单式忽略，
   第 14 行 `*` 起手），因此**永远不出现在 `git diff` / `git status` 里**——为它登记规则就是
   造一条死规则。同批加的自测「每条登记的规则在真实仓库里都活着」会把它抓出来。
2. **规则匹配改成「最具体者胜」，与声明顺序无关。** 第一版按声明顺序取第一个命中，
   `scripts/gates/` 前缀把 `scripts/gates/exemptions.json` 整条吃掉——被吃掉的那条
   在表里看起来完全正常，却永远不会触发（自测同样抓到了它）。

**反向自测**：`scripts/gates/changed-packages.test.mjs` 20 条全绿，
L1（提交图/工作树 fixture）、L2（对真实仓库**只读**对账 `git status`，证明没有路径在中间消失）、
L3（CI 事件 base 的存在性/可达性/merge-base 三重校验 + shallow clone 未 fetch 的负例）。
把 untracked 来源关掉后 **5 条转红**。已接线成 `gate:changed-packages-selftest`。

**未做 / 边界**：`DSH_GATE_BASE_SHA` 的**注入方**是 QG-007 的 CI workflow（本卡只定义并校验
入口契约，不接远端）；未做远端 CI 重放。`changed-packages` 在射程为空时从老式 `pass`
（会被规范化成 `checked=1`）改成 `skip` + 类型化理由——这是 QG-001 契约下的正确读数，
但它意味着**一个干净的 PR 会让本项显示 skip**；QG-007 接线时不要把它读成「门禁坏了」。

## QG-006A · Mutation fixture 隔离基础设施

- 优先级：P0 基础设施
- 估算：M
- 依赖：BASE-001
- 可并行：初期可与 QG-001 设计并行；每个 mutation task 落地前必须先接入
- 当前状态：基础设施与现存 mutation suite 迁移已完成；后续尚未实现的 QG-005 等业务 mutation 必须按本契约接入，最终并发/SIGTERM/全工作树零副作用由 QG-006B 验收

### 目标

让所有 mutation test 只操作注入的临时 repo/home/profile，不再通过改真实根 `package.json` 或固定仓库路径制造 Red。

### TODO

- [x] 清点会临时改根 package.json、真实 pin、固定 mutant 路径或缺省读取 live root 的测试。
- [x] 将现存会写 checkout/live root 的 mutation fixtures 全部迁到独占临时 repo/home/profile/tmp。
- [x] checker 接收显式 repo root/profile root；fullstack 局部测试另显式注入 skills/icon root，避免读取真实 HOME。
- [x] fixture setup 采用 prepare/commit；半失败只删除自己的临时根，cleanup 先复核 canonical path 与 dev/inode ownership。
- [x] 现存 QG checker 保留合法、单点 mutation 和空/缺失射程校准；未来 checker 把同一要求列入各自 ticket 验收。

### Red/Green 验证

- [x] Red：以源码位置和调用链记录真实 `package.json`、真实 worktable pin、固定 Settings mutant 与缺省 live roots；不在脏工作区执行会污染环境的旧 Red。
- [x] Green：每个迁移 case 独占 `mkdtemp` repo/home/profile/tmp，checker 只接收显式 root；fixture 不需要恢复真实文件即可结束。

### 负例

- [x] fixture setup 半失败、cleanup ownership 拒绝、测试自身 assertion 抛错及 assertion+cleanup 双失败均不得创建或恢复真实仓库文件。

### 证据层级

- [x] L1 fixture 生命周期单测；L2 现存 QG mutation suite 只读真实 repo 的契约检查。仅 finally cleanup 日志不算隔离证明。

### 自动验收

- [x] 仓库内不出现固定 mutant 残留；Settings probe 与相对依赖复制进 task 专属临时 repo。
- [x] 当前已存在的 QG-002/003/004 mutation Red 全部使用显式内存或临时 root；QG-005 尚未实现，其 ticket 必须先消费本基础设施。
- [x] QG-010/011 与现存 Settings criteria 校准 fixture 不读取或修改真实 live/profile/AX 状态；真实正控只允许 read-only 并单独标识。

### 人工验收

- [x] 抽查临时根路径与清理 ownership，确认不包含项目根或真实 HOME；路径穿越、symlink 与 root inode 替换均有负例。

### 退出条件

- [x] QG-006A 基础设施和当前仓库内已存在的 QG-002..004/QG-010..012 mutation suite 已迁出真实工作树并使用显式依赖注入。
- 后续消费条件：尚未实现的 QG-005 及未来新增 mutation 未接入本契约时，其自身 ticket 不得完成；最终聚合由 QG-006B 证明。

### 2026-09-16 实施证据

- fixture 生命周期自测：8/8；首轮定向迁移矩阵：79/79；最终根 `test:gate`：408/408。
- `pnpm run gate`：68/69；`pnpm run gate:full`：75/76。两者 `failed=0`，唯一非 pass 仍是 `live-presets` 的 159 个 disabled typed skip。
- **superseded（2026-09-16 复测）**：上一条的 `failed=0` 已过期，分母 69/76 仍然正确。当日稍晚 `profile-bundle-sync` 因 profile 装载点漂移判红（`dsh-skill-subset`、`dsh-settings-shell` 各 1 个文件），读数一度为 `failed=1`；执行 `node scripts/sync-profile.mjs --apply --loadpoint` 后复测 `gate` 68/69 exit 0、`gate:full` 75/76 exit 0。触发证据：`node scripts/gate.mjs --mode quick --json`。
- 真实根 `package.json` 与 `vendor/dsh-worktable.pin` 保持 HEAD 字节；仓库内没有固定 Settings mutant 残留。
- 决策与复发机制见 ADR-0097 / P-31。本批没有 commit/push，也没有进入 QG-006B。

### 失败边界

不得继续通过修改真实 package.json 或固定仓库路径制造 mutation。

## QG-006B · 聚合并发、中断与零副作用证明

- 优先级：P0 收口
- 估算：M
- 依赖：QG-006A、QG-002..005、QG-010..012
- 可并行：否；在进入 CI 前聚合收口
- 当前状态：**已落地**（2026-09-17）；L2 本地聚合并发/中断完成，L3 独立 runner 仍由 QG-007 收口

### 目标

证明门禁在成功、失败、SIGTERM 和并发运行下均不改变真实仓库，且多个 fixture 不会通过共享名称、端口、HOME 或 profile 相互污染。

### TODO

- [x] 定义机器可读 before/after snapshot：tracked content hash、untracked 全量清单、porcelain v2、必要时进程/端口残留。
- [x] 在正常、assertion failure、checker non-zero、fixture setup failure、cleanup failure、SIGTERM 六条路径比较 snapshot。
- [x] 两个完整 gate test 进程并发至少 10 轮；临时目录、端口、文件名和 HOME 全部独立。
- [x] 失败时保留任务专属证据，但不把 evidence 写回被测 repo。
- [x] CI job 前后复用同一 snapshot contract（`node scripts/gate.mjs --attest`，`authority: L2-local`）。

### Red/Green 验证

- [x] Red：使用共享固定 fixture name 或故意中断旧 harness，证明聚合检查能捕获残留/覆盖。
- [x] Green：六条结束路径与 10 轮并发都输出 `before_digest == after_digest`；任一不等立即非零。

### 负例

- [x] 两进程同名 package、端口冲突、一个进程 SIGTERM、cleanup 自身抛错、测试 assertion 抛错，均不得留下仓库内文件或恢复他人状态。

### 证据层级

- [x] L2 本地聚合并发/中断；L3 独立 CI runner 前后 attestation。L2 不能替代 L3。

### 退出条件

- [x] 正常、失败、SIGTERM 前后工作树一致；并发 10 轮稳定；CI 能独立复算同一 attestation。

### 失败边界

若 before/after 已受并发人类任务影响，必须在 clean clone 重跑；不能通过忽略未知路径让结果变绿。

### 2026-09-17 实施证据

**Red（实测，不是推断）**

```
$ TMPDIR=/tmp/qg006b-term/tmp node scripts/gate.mjs --mode quick &
$ kill -TERM $! ; wait ; echo $?
143
$ ls -1 $TMPDIR | wc -l
8        ← 6× fullstack-installer-*、1× wanzh-routes-*、node-compile-cache
$ ps -Ao pid,ppid,command | grep gate
58238 1 node scripts/gate.mjs --mode quick     ← 被 init 收养，继续跑
```

数真实 `TMPDIR`（不是猜）：`fullstack-installer-*` **1555**、`gn-check-*` **438**、
`wanzh-routes-*` **82**，合计 **2066 个残留根 / 35 MB**，来自历次 `pnpm run gate`。

同轮还实测到一条判据读环境的缺陷：合成空 HOME 下 `--mode quick` 有 8 项走「环境不在」分支、
`skill-lines-selftest` 判红，根因是 `skill-lines.test.mjs` 的 S4–S7 未注入 `home`、走了
`homedir()` 默认值。

**Green（实测读数）**

| 项 | 读数 |
|---|---|
| `node --test scripts/lib/repo-snapshot.test.mjs` | 9/9 |
| `node --test scripts/lib/repo-attest.test.mjs` | 9/9（六条路径逐条 `identical: true`） |
| `node --test scripts/lib/mutation-fixture.test.mjs` | 11/11（新增 SIGTERM / SIGINT / `mutationRoot`） |
| `node --test scripts/gates/skill-lines.test.mjs` | 7/7（注入合成 HOME 后真的跑到被测分支） |
| 三个泄漏源迁移后重跑 | `install-fullstack-skills` + `generic-manifest-skip` 12/12、`oauth-routes` 4/4；前后残留计数 1555/438/82 **不变**（0 新增） |
| 聚合并发 10 轮 × 2 条完整 gate（clean clone，独占） | `✔ 10 轮 × 2 条完整 gate`，**245s**，exit 0；`identical: true`、两侧 lane 读数不分裂、各自回收临时根 |
| `node scripts/gate.mjs --mode quick --json` | **exit 0**，`total 78 / pass 76 / skip 2 / fail 0`（skip = `live-presets` typed skip + `dmg-layout-doc` 本机无交付卷） |
| `node scripts/gate.mjs --mode full --json`（本仓库共享工作树，最终读数） | **exit 0**，`total 86 / pass 84 / skip 2 / fail 0`；`repo-snapshot-selftest` / `repo-attest-selftest` / `gate-concurrency-selftest` 三项全 **pass**（最后一项在本仓库上跑满 10 轮） |
| `node scripts/gate.mjs --mode full --json`（`DSH_ATTEST_REPO` 指向 clean clone） | **exit 0**，同 `86 / 84 / 2 / 0`——两条路径都取到读数 |
| 不安静时的读数（实测过一次） | `gate-concurrency-selftest` 报 **类型化 skip**（`concurrent-writers-detected`），点名抓到的路径并给出出路；不判红、也不谎报通过 |
| `--attest` 正负例 | 干净目标 → `identical: true`，exit 0；故意写仓库的目标 → `identical: false`，点名 `ignored-area-added:attest-cli-probe.txt`，**exit 1** |

**新增判据与机制**

- `scripts/lib/repo-snapshot.mjs`：纯函数快照（git tracked/untracked 内容哈希 + 声明根深度 1 名录 +
  未声明 ignored 区域全量 + HEAD/refs/index 字节），射程收缩一律判红
  （`SNAPSHOT_EMPTY_SCOPE` / `SNAPSHOT_SCOPE_COLLAPSED` / `SNAPSHOT_ENUMERATION_STALE` /
  `SNAPSHOT_SCHEMA_MISMATCH`）；差异与「说不清」分开报告（`unexplained`）。
- `scripts/lib/repo-attest.mjs`：真子进程 + 独立进程组 + before/after 见证；证据落见证者自己的
  临时根，不写回被见证仓库；`.git/*.lock` 走「先重试再看」（只有 `unexplained` 重试，具名差异不重试）。
- `scripts/lib/mutation-fixture.mjs`：live 根注册表 + `process.on('exit')` + SIGINT/SIGTERM/SIGHUP
  先回收再重发默认处置；新增窄接口 `mutationRoot(prefix)`。
- `scripts/gate.mjs --attest [目标] [--mode …] [--json]`：对 CI 公开同一份快照契约（`authority: L2-local`）。
- 门禁注册表新增 `repo-snapshot-selftest`、`repo-attest-selftest`（quick）与
  `gate-concurrency-selftest`（full-only，显式 30 分钟超时）。

**前置安静度探测：把「别人在写」与「门禁有副作用」分成两种读数**

10 轮用例本身会（正确地）把邻居的写入判成差异，所以在跑它之前，门禁先量一次安静度
（`measureQuietWindow`：4 次快照、间隔 3 秒，用 `Atomics.wait` 等待）。不安静就返回
**类型化 skip**（`concurrent-writers-detected`）并在 note 里点名抓到的路径与出路
（`DSH_ATTEST_REPO=<独占副本>`），而不是判红。理由与 ADR-0102 同一条：**空射程与真通过
必须长得不一样**——「这段窗口里没有读数」既不是「门禁有副作用」，也不是「并发安全」。
CI runner 上工作树是独占的，这条探测会直接通过并跑满 10 轮。

**并发稳定性为什么在 clean clone 上跑（这是本卡失败边界的直接应用）**

同一套 10 轮用例在本仓库上跑过三次，两次判红，两次都**判对了**：

| 次数 | 判红点 | 实际写入者 | 读法 |
|---|---|---|---|
| 第 1 次 | `entry-added: docs/adr/ADR-0103.md`、`entry-changed: scripts/lib/repo-snapshot.test.mjs` | 我本人（一边跑一边写这两个文件） | 被见证仓库**确实**在变，判红正确 |
| 第 2 次 | `refs-changed`（`refs/codex/**`） | 本机并行的 Codex 会话 | 同上；顺带暴露一个归因缺陷（见下） |
| 第 3 次 | `entry-changed: .scratch/gate-scope-readout/SYNC-2026-09-17.md` | 另一个 agent 会话 | 同上 |

卡面写的失败边界是「若 before/after 已受并发人类任务影响，必须在 clean clone 重跑」。本机
这个工作树**长期**有多个会话在写，所以「干净的 10 轮」只能在独占副本上取：用 `rsync` 复制出
一份不含 `packaging/release`、`packaging/staging`、`.dsh-types` 的副本（5.8 GB，7 分钟，APFS），
`git init` + 一次提交得到单 ref、零 untracked 的基线，再用
`DSH_ATTEST_REPO=/tmp/qg006b-clean-clone` 指向它——10 轮一次过，245 秒。跑完后该副本
`git status` 仍为 0 行、HEAD 未变、ref 仍为 1 条。

**这三轮暴露并修掉的一个**归因缺陷**：`refs/codex/**` 是另一个工具的命名空间，把它的变化
算成「本次运行的副作用」是错误归因，但直接忽略又会掩盖「测的这段时间有人在写仓库」。
处置是把 ref 分成两份：本仓库自己的 ref（heads/tags/remotes）仍进 digest、仍判红；
外部命名空间的 ref 只记**名字与新旧 OID**，进 `concurrentActivity`（如实回报，不参与判定）。
见 `scripts/lib/repo-snapshot.mjs` 的 `CONCURRENT_REF_PREFIXES` 与对应反向自测。

**本轮另外两个由「写了但从没跑到」抓出来的缺陷**（都不是本卡新引入的）：

1. `scripts/lib/mutation-fixture.mjs` 有 3 处 `checkJs` 类型错（`error?.code` 对 `{}`、`stat`
   可能为 undefined、`prepare` 的 `callback` 被推成零参数函数）。它此前**从未被任何包级
   `tsc` 看到**——包的 `include` 是 `test/**/*.mjs`，而直到本卡的测试文件开始 import 它，
   它才第一次被传递引入。修法是标注 + 一处直接 `throw`（`checkJs` 不把 `fail()` 的
   `@returns {never}` 用作窄化，实测三次）。
2. `scripts/gates/skill-lines.test.mjs` 的 S4–S7 读真实 `homedir()`，在陌生 HOME 下走早返回
   分支、红桩一次不命中（详见上文 Red 段）。

**`--attest` 的见证者根：通过时收掉，判红时留下**

本卡刚数过「2,066 个残留根来自从不清理的临时目录」，所以不能自己再犯一遍：`--attest`
每次成功都会建一个空根，成功路径必须收掉；判红路径**留着**——那是「为什么红」的唯一现场，
删掉它等于把失败变成一句无法复查的话。实现见 `runAttestation` 末尾的
`report.witnessRootRetained`。实测：成功两次后 `gate-attest-*` 计数不变，失败一次后 +1。

**未做 / 边界**：L3（独立 runner 上的 attestation）由 QG-007 收口，本轮未跑远端 CI、未 commit/push。
声明根只记深度 1 名录/类型/权限，不比对内部内容字节（479k 文件的取舍）。快照读取非原子，
与写入者赛跑时靠重跑并点名 offender。**并发稳定性证据是 L2 且取自独占副本**：本机共享
工作树上直接跑这条用例会（正确地）被别的会话判红，`DSH_ATTEST_REPO` 就是给这种情况准备的。
`changed-packages` 在射程为空时报 `skip` 属于 ADR-0102 的正确读数，QG-007 接线时不要读成
「门禁坏了」。

## QG-007 · 可复现 CI workflow

- 优先级：P0
- 估算：M/L
- 依赖：QG-001..005、QG-006A、QG-006B、QG-010..012
- 外部状态：创建 workflow；若推送需用户明确授权
- 可并行：workflow 设计可与 release hardening 并行
- 当前状态：**workflow 与离线判据已落地**；**L2/L3 未取得**（本机 GitHub 不可达、容器 daemon 未运行），
  因此本节所有 CI 结论的证据层级都是 **L1-static**，不构成「CI 已建立」

### 目标

由独立 runner 在 PR/main 上执行门禁，不能依赖开发者本机结果。

### TODO

- [x] 根据实际 gate 依赖拆 portable contract job 和 macOS host job。
      **实测结论：不需要 host job**。门禁唯一提到 `codesign` 的地方是 `scripts/gate.mjs` 里的一段注释；
      真正依赖 macOS 工具（`hdiutil` / `pkgutil` / `security`）的是打包 SOP 的手工步骤，不是门禁。
      门禁对主机的要求只有 `node` + `git` + POSIX 工具，故两个 job 都是 `ubuntu-latest`，按**模式**（quick/full）而非平台拆。
- [x] PR 至少运行 quick；合并前/主分支运行 full 或等价 required matrix。
- [x] 锁定 Node/pnpm/依赖安装方式和缓存 key。（`NODE_VERSION=22.19.0`、`PNPM_VERSION=11.8.0` 钉在 `env`；
      依赖安装按锁文件是否存在显式分流并打印 notice——`pnpm-lock.yaml` 被白名单式 `.gitignore` 忽略，CI 上可能没有）
- [x] 可选 profile/live 环境缺失明确 skip，不能算 live accepted。（干净 HOME 干跑逐条取证，见下）
- [x] job 前后断言无非预期工作树 diff。（两个 job 都跑 `node scripts/gate.mjs --attest`，ADR-0103 的见证契约）
- [x] 设置 timeout、并发取消、日志/artifact retention。（`timeout-minutes` 30/60；`cancel-in-progress: true`；
      `if: always()` 上传、`retention-days: 14`）
- [x] 安全测试使用 fake secrets 和本地 mock。（判据直接禁止 `secrets.*` 与机器路径；`permissions: contents: read`）
- [ ] 先在非 required 状态连续绿，再进入 QG-008。**阻塞于 L2**：没有可验证的 run。

### Red/Green 验证

- [x] Red：根仓库无可验证 workflow run 或 PR 不触发目标 checker 时，不得引用本机 gate 结果宣称 CI 已建立。
      **本条以「读数自证」的方式落地**：判据返回值固定带 `authority: 'L1-static'`，门禁 note 固定写
      「静态审计，不等于 CI 已验证」，反向自测另有一条断言读数里不得出现 `CI-verified` / `L3` / `required check`。
- [ ] Green：clean runner 上 PR 与 main 各有一次可追溯 run。**未取得**（GitHub 不可达）。

### 负例

- [x] 故意破坏一个 138 catalog item、一个 bare preset、一个 plugin entry、一个 intake accounting invariant；
      对应 job 必须非零，且 `continue-on-error`、路径过滤或缓存不能吞掉失败。
      **实测（在副本 `/tmp/qg007-neg` 上做，未动真实工作树）**：

| 破坏 | 判据 | 读数 |
|---|---|---|
| catalog 138 → 137（删 `retro`） | `fullstack-catalog` | `manifest 缺 retro` |
| 插件入口 `lib/index.js` 删除 | `plugin-entry-contract` | `expected=23 checked=22 failed=1`，点名 `入口 … 读不到（清单指向它，但磁盘上没有）` |
| intake 守恒式（删一条 `skipped`） | `third-party-intake` | `expected=107 checked=105 failed=2`，点名 `upstream source ID「review-resume」没有终态` |
| workbook/preset 类 | `shipped-presets-scope-selftest`（自带 S1–S5 + M1 变异自测） | 该判据的 5 条场景由 `packaging/scripts/select-presets-test.sh` 覆盖；**本轮未在副本上重跑它**，理由记在「未做」里 |

      `continue-on-error` 的"吞掉失败"由 `ci-workflow-contract` 的静态判据直接拦（变异 11）。

### 证据层级

- [x] L1 workflow 静态校验（`ci-workflow-contract` + 27 条反向自测）。
- [ ] L2 fork/受控 PR run。**未取得**。
- [ ] L3 main required run。**未取得**。开发机日志只作诊断，不作为 CI 证据。

### 退出条件

- [ ] 新门禁在独立 runner 连续稳定通过，全部负例均能阻断；检查名冻结后才进入 QG-008。**未达成**（阻塞于 L2/L3）。

### 失败边界

runner 不稳定时先解决稳定性，再设置 required；不得长期忽略失败或配置 `continue-on-error`。

### 2026-09-17 实施证据

**环境事实（决定了这一层能做到哪）**

```
$ ls .github/                     → 只有 pull_request_template.md
$ git ls-remote --heads origin main
fatal: unable to access 'https://github.com/zjgulai/lute-dsh-platform.git/':
Failed to connect to github.com port 443 after 75002 ms
$ docker version
failed to connect to the docker API at unix:///Users/lute/.docker/run/docker.sock: no such file or directory
```

**落地物**

- `.github/workflows/gate.yml`：`quick`（PR + push）与 `full`（push-only，`if` 排除 `pull_request`）；
  只读 `permissions`、`concurrency.cancel-in-progress`、钉住的 `NODE_VERSION`/`PNPM_VERSION`；
  每个 job 含 timeout、门禁步骤、其后的 `--attest` 见证、`if: always()` 的 artifact 上传。
- `scripts/gates/ci-workflow.mjs`：workflow 契约的离线判据 + 一个只认窄 YAML 子集的读取器
  （读不懂即判红；块映射/块序列/块标量/行内 `{}`/`[]`/`${{ … }}`）。
- `scripts/gates/ci-workflow.test.mjs`：**27/27**（基线 1 + 具体事故变异 21 + 解析器自证 1 + 解析器负例 + 结构 3）。
- 门禁注册表新增 `ci-workflow-contract`、`ci-workflow-contract-selftest`（都进 quick）。

**干净 runner 干跑：把「哪些项没有射程」变成读数**

`HOME` / `TMPDIR` / `DSH_PROFILE_DIR` 指向空目录跑 quick：

| 环境 | 读数 |
|---|---|
| 本机 HOME | `exit 0`，`total 80 / pass 78 / skip 2 / fail 0` |
| 干净 HOME | `exit 0`，`total 80 / pass 71 / skip 9 / fail 0` |

9 项 skip 全部带类型化理由并写明「未核对什么」（`profile 根不存在`、`用户预设根不存在`、
`预设目录不存在`、`扫描面为空`、`本机没有 ~/.dsh/skills…`）。**第一条读数不是终态**：干跑第一次是
`fail 1`——`skill-lines-selftest` 判红，根因是 `skill-lines.test.mjs` 的 S2/S3 也读真实 `homedir()`，
在没有 `~/.dsh/skills` 的机器上走早返回分支。S2–S7 现已全部注入合成 HOME。

**顺带修掉的聚合层缺陷**：`normalizeGateResult` 遇到混用两份合同的读数（同时带 `status` 与 `passed`）
时报「result schema invalid」，**完全不提 `passed`**；现在点名到字段并说清两份合同各是什么，
`gate-result.test.mjs` 补了正反两条例。

**未做 / 边界**

- **L2/L3 未取得**：没有可验证的 workflow run；`退出条件` 与「非 required 状态连续绿」两项未勾。
- **未 push / 未创建远端 required check**（R3，需单独授权）。
- Node 钉 `22.19.0`（与 `engines.node` 相容）**未在本机验证过**（本机 26.0.0）。
- 判据不保证把「任何非 YAML」都报成解析失败：`quick:` 下挂缩进的标量序列会被解析成「一个没有字段的 job」，
  报「缺少 timeout-minutes」——仍判红且具体，只是措辞不同（写进了反向自测注释）。
- `shipped-presets-scope-selftest` 的 5 条场景本轮未在副本上重跑（它自带 S1–S5 + M1 变异自测，且依赖
  `packaging/scripts/` 未复制进副本）。

## QG-008 · Branch ruleset、required checks 与 tag 保护

- 优先级：P0
- 估算：S
- 依赖：QG-007 至少有稳定检查名和一次成功运行
- 外部状态：会改变 GitHub 仓库设置，必须单独授权 → **本轮已获用户明确授权**（「两步都授权」）
- 可并行：可与 REL-004/005 并行
- 当前状态：**已完成并生效**；两个 ruleset 已创建，API 自己给出了执行证据

### 目标

`main` 和发布 tag 不能绕过已建立的检查。

### TODO

- [x] 明确 PR review 数量、required checks、管理员 bypass/break-glass owner。
      review 数取 **0**（单人仓库要求 review 等于自我审批，是**名义保护**）；required checks =
      `gate (quick)` + `gate (full)`；bypass actor **空数组是声明**；break-glass 形式见声明的 `breakGlass`。
- [x] main 禁止 force push/delete，要求 PR 和 required checks。（ruleset id **23564403**）
- [x] 保护 `v*` tag，禁止重写。（ruleset id **23564404**，含 `update` 规则——tag 移动才是 ADR-0058 说的那种毁坏）
- [x] 保存 ruleset 配置快照和恢复 SOP。（变更前快照见 Note；恢复＝删掉这两条 ruleset；
      声明即配置，重新 `--apply` 即重建）
- [x] 建立只读 API audit，文档不再声称不存在的保护。
      `node scripts/gates/audit-rulesets.mjs`（只读，退出码 0/1/2）；
      修掉 `docs/adr/ADR-0001.md` 与 `docs/release-process.md` 两处**声称存在但实际不存在**的保护。

### Red/Green 验证

- [x] Red：API 未返回目标 ruleset/required checks，或返回规则未覆盖 `main`/`v*` 时，审计必须失败。
      **实测**：落地前 `rulesets` 返回 `[]`、`branches/main/protection` 返回 404，审计报
      「API 里没有任何 ruleset 覆盖这个 ref」，退出码 1。
- [x] Green：API 快照与声明的 review 数、required check 名、bypass actor、force-push/delete 和 tag 规则全等。
      `ok 保护面审计（ok，证据层级 L2-readonly-api）`，退出码 0。

### 负例

- [x] 删除一个 required check、改检查名、添加宽泛 bypass、允许 tag rewrite、API 权限不足分别失败；
      权限不足不得解释成「未配置所以通过」。
      **8 条事故变异 + 4 条结构性负例全部判红**（`ruleset-audit.test.mjs` 15/15），
      其中 API 403 判为 `api-error` 而非 `mismatch`，报错文本明确写「权限不足或 API 故障**不是**「没有配置保护」」。

### 证据层级

- [x] L1 ruleset schema fixture。（`fixtures/rulesets-live.json` 采自真实 API，基线用它而非手写样本）
- [x] L2 仓库 API 只读快照。（审计即 L2；读数里固定带 `authority: 'L2-readonly-api'`）
- [x] L3 受控红 PR/tag rewrite 演练。**tag rewrite 部分已实测**（服务端 422 拒绝，见下）；
      「红 PR 不可合并」待 QG-007 的 CI 变绿后演练。

### 自动验收

- [x] API 断言 ruleset 与 required checks 精确匹配。
- [ ] 红检查 PR 不可合并。**未演练**（当前 `gate (full)` 在检出缺嵌套仓时判红，PR 本就无法合并，
      但那不是"因为红检查被挡"的证据）。
- [x] tag rewrite 被拒绝。（`PATCH /git/refs/tags/v2.4.1` → 422 `Cannot update this protected ref`；
      `DELETE` → 422 `Cannot delete this tag`）
- [ ] bypass 使用留下审计记录。**本机制下做不到**：GitHub 的 ruleset bypass 不留审计事件，
      只能靠流程（改声明 + PR 说明），已如实写进 ADR-0106。

### 人工验收

- [ ] 受控演练一次阻塞、一次正常合并和一次 break-glass。**未演练**（依赖 QG-007 变绿）

### 退出条件

- [ ] API 全等审计通过（**已达成**）；红 PR 与 tag rewrite 均被远端拒绝（**tag rewrite 已达成，红 PR 未演练**）；
      break-glass 仅限指定主体且留下审计事件（**后者机制上不可能，已改由流程承担**）。

### 失败边界

误阻塞时只调整具体规则，不整体关闭保护。

### 2026-09-17 实施证据

**远端变更（授权后执行，全部可回滚）**

| 项 | 值 |
|---|---|
| workflow 上远端 | GitHub API 提交 `623404375e95`（base `cc6f1ac`），只加 `.github/workflows/gate.yml` 一个文件 |
| 触发的 run | run 35146734815，`gate (quick)` 47s、`gate (full)` 71s，**两个 job 都 success** |
| main-protection | ruleset **id 23564403**，target=branch，enforcement=active |
| release-tag-protection | ruleset **id 23564404**，target=tag，enforcement=active |
| 变更前快照 | `rulesets: []`、main protection 404 —— 恢复方式：删掉这两条 ruleset |

**服务端给出的执行证据（不是「配置看起来对」）**

```
PATCH /git/refs/heads/main  (force, 非快进) → 422 Cannot force-push to this branch
                                                  Changes must be made through a pull request.
                                                  2 of 2 required status checks are expected.
DELETE /git/refs/tags/v2.4.1               → 422 Cannot delete this tag
PATCH  /git/refs/tags/v2.4.1 (移动 tag)     → 422 Cannot update this protected ref.
```

**首跑暴露的最重要一件事：workflow 自己吞掉了失败**

`gate (quick)` 在 GitHub 上显示 **success**，而同一份 artifact 里 `gate-quick.json` 写着
`"status": "fail", "failed": 6`。根因是 `node … | tee out.json` —— 管道把退出码换成了 `tee` 的 0。
六个真失败被一根管道挡住了。

- 已修：四个步骤都加 `set -o pipefail`。
- 已加判据：`ci-workflow-contract` 现在拦「管道吞退出码」（没有 pipefail 的管道即判红），
  变异 22 与一条基线反向断言守着它（`ci-workflow.test.mjs` 29/29）。
- 这一条正是卡面「`continue-on-error`、路径过滤或缓存不能吞掉失败」的实例，只不过形状是管道。

**干净 runner 上的真实门禁读数（首次 CI 跑出来的）**

`quick` 68 项：52 pass / 10 skip / **6 fail**；`full` 75 项：53 pass / 15 skip / **7 fail**。

失败分两类，**都不是判据坏了**：

1. **缺依赖**：`scripts-runnable`（`Cannot find type definition file for 'node'`、测试脚本退出 127）、
   `setup-app-locator`（编译失败）——runner 上没有装 devDependencies。
2. **缺嵌套仓 / 本机资产**：`pin-consistency`（`vendor/dsh-desktop/deepseek-harness` 未初始化）、
   若干 `*-selftest`（读本机产物）。

`pin-consistency` 尤其要紧：它**在干净检出上必然失败**——`vendor/dsh-desktop/` 被白名单式 `.gitignore`
排除，而且仓库里**没有 `.gitmodules`**（它不是 submodule，是嵌套仓 + pin 文件）。所以 CI 变绿
不是「装上依赖」就够的，还需要把这类判据改成「前提不在时明确 skip」。

**同轮发现并修掉的一个见证层缺陷（QG-006B 的回归）**

跑 full 门禁时 `gate-concurrency-selftest` 直接抛错：`RepoSnapshotError: git hash-object 失败`，
栈里既没有路径也没有原因。根因是 checkout 里有一个**悬空软链**
`packaging/backup/pre-2.0.10-migration/DSH Desktop.app/…/Electron Framework.framework/Helpers
-> Versions/Current/Helpers`：

- `git hash-object --stdin-paths` 对悬空软链直接 `fatal: could not open … for reading`，
  而且它在**第一个坏路径上就停**，整批 256 个路径一起丢；
- `lstatSync` 对悬空软链**是成功的**（链接本身存在），所以它顺着存在性检查一路走到了 hashing 才炸。

修法：untracked 射程先分拣——符号链接走 `readlinkSync` 记录目标字符串，普通文件才交给 git。
判据强度不变（「目标 A → 目标 B」与「有效 → 悬空」都是可见变化），并补了回归用例
（`repo-snapshot.test.mjs` 11/11）。总账新增 **P-37**。

**同轮发现的性能事实（未修，需要决策）**

另一会话在 04:22 把一份 **7.9 GB** 的 `packaging/backup/pre-2.0.10-migration/`（内含 DSH Desktop.app 副本）
放进了 checkout，而 `.gitignore` 的 `!packaging/**` 让它**不被 ignore**。后果：

| 项 | 读数 |
|---|---|
| 快照条目 | 2,278 tracked + **1,361 untracked**（其中含 191 MB 的 `Electron Framework` 单体） |
| 单次 `snapshotRepo` | **130 秒**（我的改动前是 151 秒——**不是**软链修复引入的） |
| 改动前基线 | 1.1 秒 |
| 并发见证 | 每轮 2 lane × (before+after) = 4 次快照 ≈ 520 秒，而单轮上限 300 秒 → **必然失败** |

也就是说：**只要那个目录在，并发见证项就不可用**。两件事需要分开处理——
① 它该不该在见证射程里（仓库治理决策）；② 见证契约**缺一个成本上限**，
现在载荷炸掉时给的是「13 分钟后超时」，而不是「射程太贵，本轮无读数」。

**未做 / 边界**

- **任何 PR 在 CI 变绿前都无法合并**（required check 含 `gate (full)`）。这是刻意保留的诚实状态：
  main 现在真的挡住了，而不是「看起来挡住了」。修的策略已明确（见上一条）。
- `ruleset-audit` 在 CI 上是 `api-unavailable` 类型化 skip（Actions 默认无 `gh` 认证），
  真实读数目前只在开发机取。
- break-glass 留痕机制上做不到，改由流程承担（改声明 + PR 说明），已写进 ADR-0106。
- 文档里已被指出「声称不存在保护」的两处已修；`docs/pitfalls-playbook.md` 新增一条根因条目。

## QG-009 · 门禁与发布 ownership

- 优先级：P2
- 估算：S
- 依赖：QG-007

### 目标

降低 26 个受管单元、持续增长的 gate registry 和高密度发布脚本集中在单一维护者上的 bus-factor 风险；数量由注册表生成，不在计划中写死。

### TODO

- [ ] 为 gate、packaging、profile/runtime、security、product UX 指定 primary 与 fallback owner。
- [ ] 记录 required review 范围和紧急接管流程。
- [ ] 安排定期发布/回滚/恢复演练。
- [ ] owner 只代表审查责任，不替代自动验收。

### 自动验收

- [ ] ownership registry 覆盖每个 P0 gate/release step，primary/fallback、review scope 和 runbook 链接缺一即失败。

### 人工验收

- [ ] 第二位维护者可按文档完成一次 dry-run、一次已知故障定位和一次恢复演练。

## QG-010 · Fullstack 138 条全量验证与 89 项产品 whitelist 全等

- 优先级：P0
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-002..005、QG-011/012 并行
- 状态：本地 L1/L2/L3 实现与验收完成；本 checkpoint 纳入 Git，QG-007 远端 required check deferred

### 目标

`verify-fullstack.mjs` 同时验证 mapping 70 条与 extra 68 条形成的 138 条完整 catalog；产品出货选择由受版本控制的 89 项唯一 whitelist 决定，不能靠“非空、无重复、是子集”或计数相等假绿。

### 范围/非范围

- 范围：`fullstack-mapping.json`、`fullstack-extra.json`、fullstack manifest/目录、受版本控制的产品 whitelist、`verify-fullstack.mjs` 及其 fixture。
- 非范围：本卡不重新决定哪 89 项应当出货；产品意图变更需独立 Note/审批，不能借修 gate 偷换名单。

### TODO

- [x] 将 70 mapping 与 68 extras 解析为带来源的 canonical set，先拒绝跨源重复、悬空项与 ID 归一化碰撞，再得到 expected 138。
- [x] 对 138 条逐项执行相同的存在性、metadata、入口、来源与产物契约，输出每项 result；禁止只遍历 mapping。
- [x] 把 ADR-0091 已批准的 89 项产品意图物化为受版本控制的唯一 whitelist manifest，并记录 owner/reason，不从当前安装结果反推。
- [x] 强制 whitelist 与 canonical approved set 做双向集合全等，并强制其为 138 catalog 的子集；输出 missing、unexpected、duplicate，而非只验 count。
- [x] gate summary 同时给出 `catalog expected=138/checked=138` 与 `whitelist expected=89/checked=89`，数量变化必须伴随同提交的产品决策与 fixture 更新。

### Red/Green 验证

- [x] Red：旧 checker 真实输出 `70/70 全项通过`；68 extras 未被逐条验证。当前运行时选择仍只证明 14 节点非空/unique/属于 138 的子集，不证明它与受版本控制的批准 89 项全等，任意合法子集可假绿。
- [x] Green：当前快照 138 条全部有逐项结果，canonical whitelist 与批准 89 项双向差集均为空，`checked === expected`；实现没有把 138/89 写成永久魔数，数字来自版本化清单。

### 负例

- [x] 删除/损坏一个 extra、在 mapping/extra 制造重复、删一项再补任意项维持 138、提交任意合法子集、在 whitelist 用未批准项替换批准项维持数量、重复一项维持数组长度、保留旧批准指纹但改集合，均由临时 fixture 判红。

### 2026-09-16 实施记录

- catalog：canonical `138/138 = mapping 70 + extra 68`，逐项 result 与根 gate 已接入。
- whitelist：owner `lute` 明确签核 exact 89 与 `4ebfa9f…` 集合指纹后物化 canonical manifest；root `89/89`，live runtime `89/approved 89`、14/14 节点、节点错挂 0、双向差集为空。
- 本地验收：package `113/113`；root quick `67/68`、full `74/75`，两者 `failed=0`，唯一非 pass 为 `live-presets` 的 159 个 disabled typed skip。manifest 在工程验收阶段尚未 commit；由本 checkpoint 与实现、测试和决策记录一并固化。
- scope：批准仅约束 preset composition；顺序不构成契约，invocation policy 与发布授权未被本卡吸收。

### 证据层级

- [x] L1 set/parser fixture；L2 临时 catalog/whitelist mutation；L3 当前版本化清单全量报告。运行时已安装技能清单只做 live acceptance，批准名单来自 owner 明确签核。

### 自动验收

- [x] 138 条逐项验证且无 unexplained skip；89 项 whitelist 双向集合全等。
- [x] 每个负例断言具体 missing/unexpected/duplicate ID 与非零退出码或 fail result。
- [x] `gate.mjs` 汇总保留两个分母，不把 catalog pass 与产品 whitelist pass 合并成一个布尔值。

### 人工验收

- [x] 产品 owner 对 exact 89 集合与指纹签核；工程 reviewer 抽查 mapping/extra 各 5 项，均能回到具体 sourceRef。

### 退出条件

- [x] 68 extras 不再是 verifier 盲区，89 项不能以等数量替换绕过；两组 mutation 已进入本地 root quick/full gate。
- [ ] QG-007 将两组 mutation 设置为远端 required CI；本地 QG-010 结果不冒充该远端证据。

### 失败边界

任何 138/89 变化在缺少产品决策时保持 fail；不得自动吸收新目录或用 live 安装现状更新 whitelist。

## QG-011 · Third-party intake accounting 闭合与非零退出

- 优先级：P0
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-010/012 并行
- 状态：本地实现与 E1/E2/E3 验收完成；QG-007 远端 required check deferred

### 目标

`build-third-party-intake.mjs` 的 source、imported、skipped、already-installed 分类互斥且守恒；所有 accounting error 必须在任何成功输出/写入之前导致非零退出。

### 范围/非范围

- 范围：intake builder 的分类、去重、问题汇总、`--check` 退出码和输出文件原子性。
- 非范围：不借本卡重新选择第三方技能，也不修改上游内容信任政策。

### TODO

- [x] 先读取并规范化每个 source 的 upstream ID set，再建立 imported/skipped/already-installed 三个互斥 set；同一 ID 跨集合出现即失败。
- [x] already-installed 作为独立终态，不再追加到 `skip` 后重复计数。
- [x] 守恒式按唯一 ID 计算：`upstream = imported union skipped union alreadyInstalled`，并分别报告 missing、unexpected、overlap、duplicate。
- [x] 将所有结构、来源和 accounting 检查放在成功消息与写文件之前；最后统一 `problems.length > 0 => exit 1`。
- [x] `--check` 全路径只读；生成模式只在零问题后以同目录临时文件 + fsync + rename 原子替换，失败不留下半更新 intake。

### Red/Green 验证

- [x] Red：旧 `--check` 在 `69→72`、`37→66` accounting error 下仍打印成功并退出 0；目标文件 SHA-256 不变，证明是假绿而非写入副作用。
- [x] Green：同一批样本重采为 `pm 69=63+3+3`、`mp 37=5+3+29`，无 overlap；任一后置 accounting problem 都在打印成功或写入之前非零退出。

### 负例

- [x] imported/skip overlap、already-installed 重复、漏一个 upstream、加入未知 ID、重复 source ID、坏 JSON、后置才发现的问题分别断言非零；维持总数相同的“删一补一”也必须失败。

### 证据层级

- [x] L1 纯集合 accounting 单测；L2 临时 intake 生成与 `--check` mutation；L3 当前版本化第三方 intake 的只读守恒报告。这里没有把上游 URL 可访问性、commit/blob provenance 或 live 安装冒充为完成。

### 自动验收

- [x] 每个 source 输出唯一 upstream/imported/skipped/already-installed 数量和双向差集。
- [x] 任一 `problems` 非空时退出码非零、无成功文案、目标文件 hash 不变。
- [x] 正常生成后立刻 `--check` 幂等且零 diff。

### 人工验收

- [x] reviewer 抽查两个 source 的 10 个 ID：pm/mp 各 5 个，覆盖 imported/skipped/alreadyInstalled，`sampled=10 failed=0`，均能从 upstream 唯一追到终态与原因。

### 退出条件

- [x] accounting 守恒、分类互斥、所有错误非零退出，并已进入本地 root quick/full gate。
- [ ] 由 QG-007 把该 checker 设置为远端 required check；这不是本地 QG-011 结果可替代的证据。

### 实施与验收记录（2026-09-16）

- 定向回归：`node --test packages/capabilities/dsh-overseas-skills/test/build-third-party-intake.spec.mjs`，12/12 通过。
- 包级回归：`pnpm --dir packages/capabilities/dsh-overseas-skills test`，94/94 通过；README 计数已从 82 同步为 94。
- 根 quick gate：64/65，唯一 `live-presets` typed skip；objects `1813 expected / 1654 checked / 159 skipped / 0 failed`。
- 根 full gate：71/72，唯一 `live-presets` typed skip；objects `1820 expected / 1661 checked / 159 skipped / 0 failed`。
- 首轮 root gate 暴露新 checker 缺 `reason`/`typedSkips` 的 schema Red；只补齐 canonical 适配并增加断言，没有放宽 gate schema。
- 未执行：联网重取、不可变 commit/blob/license provenance、真实 `~/.dsh` 安装或 promotion、远端 CI/ruleset、DMG/Release；分别留给 SEC-RT-002/DEC-009、QG-007 与发布批次。

### 失败边界

无法确定某 ID 归属时保持 fail，不得放入 ignored/other 让等式表面成立。

## QG-012 · Settings AX 校准使用独立锚

- 优先级：P0（live acceptance 判别力）
- 估算：M
- 依赖：QG-001；mutation harness 复用 QG-006A，并由 QG-006B 在进入 QG-007 前共同收口
- 可并行：可与 QG-010/011 并行

### 目标

`settings-shell-live.mjs` 的 zoom/坐标校准与被验收控件使用不同证据，避免“用按钮高度算 zoom，再除回按钮高度”恒等式假绿。

### 范围/非范围

- 范围：AX snapshot 解析、独立 calibration anchors、容差、instrument unavailable 语义和隔离 fixture。
- 非范围：不在本卡改变 Settings UX 尺寸规范，也不把 macOS live acceptance 伪装成 portable CI。

### TODO

- [x] 固化当前 `zoom = medianButtonHeight / 40` 且 `buttonCss = medianButtonHeight / zoom` 恒为 40 的代数与 fixture Red。
- [x] 选择不包含目标按钮尺寸的独立锚：例如同一窗口 AX bounds 与独立取得的 CSS viewport，或两个预先声明且不参与目标断言的 calibration anchors；决策写入 Note。
- [x] 校准样本与验收样本集合必须不相交，并输出 anchor IDs、原始值、scale、残差、容差和目标测量值。
- [x] 独立锚缺失、残差超限、样本不足、窗口错配或 AX 权限不足时 typed skip；正式 `--require-no-skip` 下失败。
- [x] fixture 注入 snapshot/root，不读取或改写真实用户 AX/profile 状态；与 QG-006A/QG-006B 的隔离和并发契约一致。

### Red/Green 验证

- [x] Red：只改变目标按钮真实高度时，旧公式仍报告 40 并通过。
- [x] Green：固定独立 scale 后改变目标按钮高度会失败；只改变独立、合法的整体 zoom 时目标 CSS 尺寸仍在容差内。

### 负例

- [x] 目标按钮高度偏差、anchor 缺失、两个 anchor 比例冲突、窗口取错、零/负尺寸、AX permission denied 和 instrument timeout 均有确定 fail/typed skip；不得返回 pass。

### 证据层级

- [x] L1 几何/容差纯函数单测与 L2 合成 AX snapshot mutation；二者只证明判别力。
- [ ] L3 受控 macOS Settings 窗口 live run；只有它能证明具体宿主行为。

### 自动验收

- [x] 至少两个不依赖目标按钮的 calibration signals 一致，目标尺寸 mutation 能稳定打红。
- [x] checker 输出原始/校准值和判定依据，instrument unavailable 在 strict 模式非零。
- [ ] 并发运行不共享 snapshot 或窗口选择状态。

### 人工验收

- [ ] 在两个 zoom/显示缩放条件下各做一次真实 Settings 检查，并人工确认选择的是目标窗口与目标控件。

### 退出条件

- [x] 代数恒等式路径被移除，目标控件与校准锚证据独立，离线负例进入根 gate。
- [ ] 在 host CI 或发布前 live gate 完成两种 zoom/显示缩放；此前状态固定为
  `instrument verified, live unverified`。

### 失败边界

无法获得独立锚时不得放宽容差或复用目标尺寸；保持 typed skip/strict fail，等待宿主提供可验证信号。

### 2026-09-16 实施与验收记录

- 选择 pinned upstream `SettingsRoot.module.css` 的 nav 188px 与 close 28×28px：两个 AX 节点、
  三个 calibration signals；目标按钮 40px 只在 scale 固定后按 ±2px 验收。
- 纯函数自检：14 个状态、27 条断言；criteria suite：9/9（含 6 个 mutation control）。目标尺寸恒真、
  目标自身反算 scale、锚冲突旁路、L1/L2/pluginLoaded 恒真均稳定打红。
- 报告包含 anchor/node IDs、raw/expected、sample scale、残差/容差、目标按钮和动态 panel 对照；
  unavailable 报告无 verdict，普通模式 exit 2，`--require-no-skip` exit 1。
- 隔离 PATH 的 `harness-missing` CLI 负控已实跑两档退出码并核对 JSON；该负控不启动或操作 DSH GUI。
- 根 `test:gate` 412/412；quick 67/69、full 74/76。两档唯一 fail 均为 `profile-bundle-sync`
  检出 profile 装载点仍是旧 bundle，另有既有 live-presets 159 disabled typed skip；本批未获 profile 写入授权，
  因此保留真实失败，不执行 `sync-profile --apply --loadpoint`。
- 设计与边界见 [ADR-0098](../../../../docs/adr/ADR-0098.md)。本批未操作 GUI/profile，未跑 L3；
  当前状态是 `instrument verified, live unverified`。并发 live GUI 仲裁仍由后续 host/QG-006B 边界收口。

## QG-013 · 交付白名单（files）相对运行时判据面的完整性

- 优先级：P0（P-24 复发根因未落地；唯一被证实会打断全新安装且无任何机制看守的缺口）
- 估算：S/M
- 依赖：QG-001（canonical schema）、QG-006A（mutation fixture 隔离契约）
- 可并行：高；与 `QG-004` **互补不重叠**——QG-004 从 profile 侧量「比了几个包」，
  本卡从**交付清单侧**量「白名单漏没漏运行时文件」，两侧此前都没有仪器
- 补立卡时间：2026-09-16（用户指定「先把 files 完整性门禁立卡补上，再来 QG-006B」）

### 目标

在**仓库侧**、不需要 profile、不需要网络、不写任何文件的前提下断言：

> 包里**运行时会被执行或读取**的每一个文件，都落在该包 `package.json` 的 `files` 白名单射程内。

缺项必须在提交前判红，而不是等一次全新的 `file:` 安装之后由宿主以
`Cannot find module … ERR_MODULE_NOT_FOUND` 进恢复模式报出来。

### 为什么必须新立一卡，而不是塞进 QG-004

现有两项都从**装载点**侧量（`profile-files-sync` 判副本存在性、`profile-bundle-sync` 判副本字节），
而 P-24 的复发证明：装载点当时**有**那两个文件（上一批手工 `--apply --loadpoint` 补过），
所以两项**全绿**——机制守住了症状，没守住根因。
根因在另一侧：`lib/index.js` 正在 import 的文件不在 `files` 里，于是任何**按清单物化**的消费者都会丢掉它。
2026-09-16 实测（本次立项前的判别实验）：`pnpm` 对 `file:` 依赖**遵守 `files` 白名单**——
probe fixture 里 `files:["lib/a.js"]` 的包安装后 `node_modules` 内只有 `lib/a.js`，
`lib/b.js` 与未声明文件均不出现；`npm pack --dry-run --json` 对同一 fixture 给出同一集合。
即**受影响的不是发布面一条路径，而是本机装载点的全新安装路径**。

### 范围

- 受管包集合取自 `scripts/gates/package-collect.mjs`（仓库根包除外）。
- 运行时判据面 = `loadPointFiles()`（`scripts/gates/sync-profile.mjs` 里的单一来源：
  `lib/` 顶层 bundle + `files` 声明的数据/配置）∪ 解析得到的 `main` ∪ `bin` 指向的文件。
- 白名单射程判定只实现本仓库**实际出现**的 glob 形态，并以真实 `npm pack` 校准。

### 非范围

- 不从装载点侧量（`profile-files-sync` / `profile-bundle-sync` 的射程）。
- 不判「声明了但没有用」的反向冗余（那是噪声，噪声最终会淹掉信号）。
- 不判 profile、不联网、不写任何文件、不读 `$HOME`。
- **不替代 QG-004** 的 N/N 覆盖率、expected managed set 与 profile 侧分类。
- 不判「入口 import 闭包的传递可达性」——本卡判据面止于 `loadPointFiles()` ∪ `main` ∪ `bin`；
  深层 `lib/<子目录>/x.js` 的静态闭包校验是后续项，写在这里以免被读成已覆盖。

### TODO

- [x] 定义运行时判据面的单一来源函数。
      **修订（实现期）**：原文写的是「**复用** `loadPointFiles()` 而不是另写一份」，**这条被我自己的证据推翻**。
      照搬那条规则（`lib/` 顶层所有 bundle）第一次跑就在 `dsh-paper2skills` 上产生 5 个文件的假红——
      那是包内 `scripts/`、`test/` 用的开发期模块，该包无 `main`、无 `dsh` 字段、不是任何 profile 的 `file:` 依赖。
      最终取的是**声明入口的可达闭包**，并在模块注释里写明**为什么不复用**：
      同一份规则在「装载点字节一致」与「交付清单是否漏件」两个目的下不是同一个判据。
      原文的「单一来源」意图仍然成立——只是那个来源必须按目的定义，不能跨目的借。
- [x] 实现 `files` glob 射程判定（exact / 裸目录 / `dir/*` / `dir/**` / 递归带扩展名），
      并显式建模 npm 的 always-included 集合（`package.json`、`README*`、`LICEN[CS]E*`、`main`）。
- [x] 用**真实 `npm pack --dry-run --json --ignore-scripts`** 对全部受管包做一次校准，
      证明判定器与 npm 的实际产出**逐文件全等**，而不是抽样一致。
- [x] 未构建导致的空判据面（声明了 `files` 但按入口解析不出任何运行时文件）必须是**类型化 skip**，不是 pass。
- [x] fail-closed 的落点**修订（实现期）**：原计划放在「未知 glob 形态」上，但本仓库的 glob 判定器是**全函数**
      （任何形态都能编译），所以那个守卫没有可触发的情形。真正需要 fail-closed 的是**两处**：
      ① ignore 文件里出现窄子集之外的形态（取反、锚定路径、含斜杠）→ 类型化 skip；
      ② 判据面要读的入口源码读不到 → **判红**（闭包不完整不得当作「这个文件没有 import」）。

### Red/Green 验证

- [x] Red：把 `dsh-wanzh-hulian` 的 `files` 回退到复发版本（去掉 `lib/atomic-store.js`、
      `lib/oauth-flow.js`），本项判红并点名这两个文件；恢复后转绿。读数见文末实施记录。
- [x] Red（fixture）：`makeP24Tree()` 逐字复刻复发当时的 6 条 `files` 与入口 import 链，
      缺的正是闭包里的那两个文件。
- [x] Green：当前工作树 25 个受管包，`checked=124 / skipped=0 / failed=0`（空射程不算通过）。

### 负例

- [x] 恒真桩突变（判定器永远返回「匹配」）时，Red fixture 必须**不再变红**——证明拦住它的是判定器而不是别的。
- [x] 未建模的 ignore 形态、读不到入口源码、`files` 声明了却解析不出运行时文件，各有**自己的**降级路径。
- [x] **修订（实现期，2026-09-16）**：无 `files` 字段的包原计划一律归类型化 skip；实现后改为**先回答一个问题**——
      唯一能把运行时文件挡在交付之外的是 ignore 文件，因此核对 ignore 文件能否命中任何运行时文件：
      命中不了 → 不适用（进 `note` 读数，**不进 skipped**）；可能命中或形态未建模 → 类型化 skip。
      改这一条的理由：`gate:strict` 会被永久 skip 拖红，而永久红灯的噪声最终会让真信号一起被忽略（P-02 的另一面）。
      这一路径下**没有**「通过」，判红方向未放松。

### 证据层级

- [x] L1 判定器与判据面的纯函数单测（23 条用例，含 3 支变异）；L2 全仓真实包 + 真实 `npm pack` 逐文件校准；L3（不适用，本卡无 live 面）。

### 自动验收

- [x] `gate:package-files-coverage` 出现在 `node scripts/gate.mjs --list`。
- [x] `gate:package-files-coverage-selftest` 含 3 支变异（恒真桩 / 不跟 import / 关掉 `import.meta.url` 那条），各自让对应缺陷形状漏过。
- [x] 校准读数记录在案：受管包数、与 npm 全等的包数、形态清单。

### 人工验收

- [x] 抽查 Red 复现的文件名与 remediation 文案，确认它指向「加进 `files`」而不是「去补装载点」。

### 退出条件

- [x] 交付白名单漏件在**提交前**判红，且判红信息点名包与文件；
- [x] 校准证明判定器与真实 npm 产出全等；
- [x] P-24 的「仍然未落地的机制」一句已替换为一个真实存在的门禁名。

### 失败边界

- 不得用「安装时同步一下就好」把缺件降级为 note：全新安装路径下没有同步步骤。
- 不得把空判据面（未构建）读成通过。
- 不得为了让新门禁变绿而删运行时文件或放宽判据面。

### 2026-09-16 实施记录

**判据实现**：`scripts/gates/package-files-coverage.mjs`（纯函数 + 注入的 `readSource`）、
`scripts/gates/package-files-coverage.test.mjs`（23 条用例）、
`scripts/gate.mjs` 两个门禁项 `package-files-coverage` 与 `package-files-coverage-selftest`。
决策见 [ADR-0101](../../../../docs/adr/ADR-0101.md) 与
[决策记录](../../../../docs/notes/implemented/contract/2026-09-16-package-delivery-allowlist-coverage.md)。

**立论基础（立项前的判别实验，真实 `pnpm`，隔离临时根）**：`files:["lib/a.js"]` 的包
用 `file:` 依赖安装后 `node_modules/<pkg>/lib/` 只有 `a.js`，未声明的 `lib/b.js` 与
顶层 `undeclared.txt` 均不出现；`npm pack --dry-run --json` 对同一 fixture 给出同一集合。
该实验已固化成测试里的前提钉（`CALIB 前提钉`）。

**真实读数**：

| 项 | 命令 | 读数 |
|---|---|---|
| 单测 | `node --test scripts/gates/package-files-coverage.test.mjs` | **23 tests / 23 pass / 0 fail**，exit 0 |
| 校准 | 同上（`CALIB npm` 一条） | 25 个受管包中 23 个有 `files` 白名单，与真实 `npm pack`（npm 11.14.1）**逐文件全等**，0 处不一致 |
| Red（真实树） | 把 wanzh `files` 回退到复发版本后跑判据 | `status=fail`，`checked=122 / failed=2`，点名 `lib/atomic-store.js`、`lib/oauth-flow.js`；恢复后哈希与备份逐字节相同 |
| Green（真实树） | `node scripts/gate.mjs --mode quick` | `status=pass`，`expected=124 / checked=124 / skipped=0 / failed=0` |
| 根门禁 quick | `node scripts/gate.mjs --mode quick --json` | **72 项：71 pass / 1 skip / 0 fail**，exit 0 |
| 根门禁 full | `node scripts/gate.mjs --mode full --json` | **79 项：78 pass / 1 skip / 0 fail**，exit 0（唯一 skip 是既有的 `live-presets` 159 个 disabled typed skip） |
| 变异自测（行为层） | `node --test scripts/gates/package-files-coverage.test.mjs`（模块未突变） | **23/23 pass**：MUT1/2/3 各自 import 一份突变副本，证明「判定器坏掉 → 缺陷形状漏过」 |
| 变异自测（接线层） | 对**真实模块**分别施加三处突变后跑同一条命令 | **3/3 exit=1**（分别 19 / 13 / 7 条用例判红） |
| 门禁接线证明 | M1 生效时跑 `node scripts/gate.mjs --mode quick --json` | `exit=1`；`package-files-coverage-selftest -> fail`，`package-files-coverage -> pass` |

**关于 3/3 的诚实说明**：接线层的三次判红里，至少一次**不是**行为断言打红的，而是
`loadMutant` 的变异锚点守卫（模块被改过后，测试再去找原锚点就找不到，于是 fail-loud）。
这层证明的是「**门禁确实把 suite 的非零退出读成 fail**」，不是「行为断言抓住了它」。
行为层的那半由模块未突变时的 MUT1/2/3 自己承担——它们 import 的是独立突变副本，
断言的是「突变后缺陷形状漏过、未突变时不漏过」。两层合起来才等于「这条判据有牙」，
任何一层单独拿出来都不能这么说。

**读数（不是通过）**：判据面之外、`lib/` 顶层的 bundle 只作为 `note` 报出——
当前只有 `dsh-paper2skills` 的 5 个（`lib/axis.js`、`lib/card-render.js`、`lib/contract-gate.js`、
`lib/html-text.js`、`lib/secret-scrub.js`）。人工核实它们是包内 `scripts/`、`test/` 用的开发期模块
（该包无 `main`、无 `dsh` 字段、不是任何 profile 的 `file:` 依赖），**机器分不出这一类**，
所以这项判断不是判据，只是读数。

**已知未建模的边界**：用变量拼路径读取的包内数据文件（如 `join(PKG_ROOT, 'data')`）本项看不见。
当前仓库里此类文件都在 `files` 里有声明，因此不影响结论；这是边界，不是保证。

**顺带修掉上一批留下的 `gate:full` 红灯**：第一次跑 full 时 `scripts-runnable` 判红——
`dsh-wanzh-hulian` 的 `typecheck` 退出码 2，16 条 TS 错误**全部由 SEC-RT-005 引入**（不是本卡）：
`lib/index.js` 10 处 TS2339（`readBoundedJson` 的 `@returns` 写成 `Promise<unknown>`，
而这 7 条设置路由全按对象取字段；已核对 HEAD 原文确认旧实现返回 `any`，是这次改写收紧了它），
`test/bounded-body.spec.mjs` 6 处（`server.address()` 未收窄；把 `new Promise` 的 `resolve`
当 `listen` 回调——后者还把监听失败吞成了成功）。
**上一批没发现的原因**：那轮只跑了 `--mode quick`，而 `scripts-runnable` 是 `modes: ['full']`——
这是 P-04 的变体：**用的是没有覆盖该分支的那档命令**。
已修并复读：`tsc -p tsconfig.json` exit 0、wanzh 全量 86/86、装载点按 tmp+mv 同步后逐字节一致。

**权限边界**：本批改了仓库工作树（新增 4 个文件 + 注册 2 个门禁项 + 文档），并做了一次
**既有 SOP 的装载点同步**（`node scripts/sync-profile.mjs --apply --loadpoint`，同步前已备份到
`/tmp/dsh-loadpoint-backup-20260916-234413/`）——因为上面那处 JSDoc 修复改到了
`lib/bounded-body.js`，不同步会让 `profile-bundle-sync` 一直判红。
**未** commit / push / 发布，**未**触发任何真实安装，**未**改任何凭据。
`git diff` 里 `packages/capabilities/dsh-wanzh-hulian/package.json` 的改动来自上一批（SEC-RT-005），
本批为做 Red 重放临时改写后又按备份逐字节还原，哈希已复核。
