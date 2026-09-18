# ROUND-STATUS · 2026-09-16 盘点与收口

> **第 3–6 轮更新见文末 §9–§12。** 下文 §1–§8 是第一轮盘点的原始记录，**不要**当作当前盘面。
>
> §2 的任务计数已被后续各轮改变，当前口径如下（逐轮累积，不是重算）：
> `SEC-RT-006`、`SEC-RT-007`（第 2 轮）与 `SEC-RT-005`（第 4 轮）已从「未完成」移到「有真实证据」，
> 剩余未完成由 50 减为 **47**；第 5 轮**新增**一张卡 `QG-013`（原 59 个 ID 里没有它）并当轮落地，
> 因此任务 ID 总数由 59 变为 **60**；第 6 轮再落地 `QG-003`/`QG-004`/`QG-005` 三张卡，
> 已完成/有证据由 13 增为 **16**，未完成由 47 减为 **44**。
> §2.2 的分工作流计数（9/7/13/10/9/1）此后**未再更新**，只作历史读数。

本文件是本轮（2026-09-16）对 `2026-09-15-product-execution-plan` 的**任务级**盘点结论与执行方案。
计划文档里 829 个未勾选条目是**任务卡内部步骤清单**，不是待办总量；本文件按**任务 ID** 计数。

基线：`main @ cc6f1ac`，工作树 32 tracked 修改 + 8 untracked 路径，0 staged，`git diff --check` exit 0。
远端：`origin/main` 同点（0/0）；`codeup/main` 仍在 `44f4994`（落后）。

---

## 1. 本轮实际完成的动作

| 动作 | 证据 |
|---|---|
| `dsh-skill-subset` 注册漏传 `source` 修复 | `packages/contract/dsh-skill-subset/lib/index.js` +27 行（纯新增，0 删除） |
| Red/Green | 旧 lib + 新测试 → `tests 10 / pass 8 / fail 2`，exit=1，断言原文含 `source must be a string`；新 lib → `10/10`，exit=0 |
| 装载点同步（让修复真正生效） | `node scripts/sync-profile.mjs --apply --loadpoint` → `sync dsh-settings-shell: 1 个文件` + `ok 已同步 1 个包`，exit=0 |
| 官方检查器复读 | `--check --loadpoint` → `ok 装载点与仓库源一致（对比 24 个包）`，exit=0 |
| 门禁 | `node scripts/gate.mjs --mode quick --json` → **exit=0**，`total 69 / pass 68 / skip 1 / fail 0`；`--mode full` → **exit=0**，`total 76 / pass 75 / skip 1 / fail 0`（skip 均为 `live-presets` 的 typed skip） |
| R1-1 文档腐烂修正 | 7 处已修，见 §3；4 个受影响包 `tsc -p tsconfig.json --noEmit` 全部 exit=0 |

同步前装载点两处漂移：`dsh-skill-subset`（`da6ea0a8…` = HEAD 版本）与 `dsh-settings-shell`（`585bbdb2…`，
mtime 09-15 15:44）。两者同步后均与仓库工作树源逐字节相同（`d811928f…` / `ddd88008…`）。

回滚：`dsh-skill-subset` 可从 `git show HEAD:packages/contract/dsh-skill-subset/lib/index.js` 还原；
`dsh-settings-shell` 的 `lib/` 是 gitignore 的构建产物，备份在 `/tmp/dsh-loadpoint-backup-20260916-190027/`。

**未验证**：运行中的 DSH 进程是否已重载这些字节。宿主侧 `lib/index.js` 在插件加载时读入；Web GUI 根路径
返回 `401`（需认证），未探测客户端投递路由。→ 需重启 DSH Desktop 确认，本文件不声称已生效。

---

## 2. 任务级盘面（59 个任务 ID）

### 2.1 有真实证据的（9 个）

| ID | 实测证据 |
|---|---|
| BASE-001 / BASE-002 | 边界快照与 `BATCH-001` 记录在位 |
| SEC-RT-001 | `host-util.js:40/:69`，`node --test test/*.spec.mjs` → **17/17 pass**，tsc exit 0 |
| SEC-RT-003A | 事务模块接入 3 入口、0 处递归 `rmSync`，门禁同套 5 文件 → **50/50 pass** |
| QG-001 | `gate-result.test.mjs` → **14/14 pass** |
| QG-002 | `live-presets.test.mjs` → **24/24 pass**；L3 数字漂 1 行（1642→1643 / 1483→1484） |
| QG-010 | `fullstack-catalog` 138/138、`fullstack-whitelist` 89/89、spec 19/19 |
| QG-011 | `third-party-intake` 107/107、spec 12/12 |
| QG-012 | `settings-shell-criteria.test.mjs` → **9/9 pass** |
| PROD-UX-001 | 实现完整（`shell.css:16..90` 全部规则以 marker 起首；`anchors.ts` 三态 parser），但**仅存在于未提交工作树** |

### 2.2 未完成（50 个），按工作流

| 工作流 | 未完成任务 | 数量 |
|---|---|---|
| 01 安全与运行时 | SEC-RT-002/003/004/005/006/007/008/009/010 | 9 |
| 02 门禁与 CI | QG-003/004/005/006B/007/008/009 | 7 |
| 03 发布与分发 | REL-001..009、DIST-001..004 | 13 |
| 04 产品与 UX | PROD-001..006、PROD-UX-002..005 | 10 |
| 05 隐私/可观测/商业 | PRIV-001..003、OBS-001..002、GOV-001..002、BUS-001..002 | 9 |
| 02 门禁（部分） | QG-006A（工作树一致、**未提交**，HEAD 注册表 75 条 vs 工作树 76 条） | 1 |

### 2.3 三个「核心产物」的实测结论

| 产物 | 结论 |
|---|---|
| 机器可读能力成熟度账本 | **未找到实现**（`Outcome-verified` 在 `packages/` 0 命中；最近前身 `docs/catalog/packages.md` 只有 5 列静态目录） |
| 首启 onboarding 与健康中心 | **未找到实现**（唯一 `onboarding` 命中是设置页测试的 decoy） |
| 跨包 a11y 基线 | **未找到实现**，且已定位两处阻断缺陷：`dsh-skill-center-local/src/.../SkillPanel.tsx:284` 的 `role="tablist"` 内是普通 button（无 `aria-selected`）；`:365-387` dev tabs 无 panel 关联、无 roving tabindex。根 gate 79 项中无任何 axe/keyboard 项 |

---

## 3. 计划文档自身的腐烂（本轮已修正，均非虚假声明）

| 位置 | 问题 | 处置（2026-09-16） |
|---|---|---|
| `workstreams/02-gates-ci.md:322` | 断言「quick 68/69、full 75/76，两者 `failed=0`」，与同文件 `:700` 及实测（`failed=1`）矛盾 | ✅ 已在原断言下加 `superseded` 块，附漂移与复测读数 |
| `workstreams/01-security-runtime.md:322` | overseas-skills「82/82」→ 实测 **113/113** | ✅ 已加 `superseded` 块；并记录 `node --test test/`（目录形式）会误报、必须用包声明的 glob |
| `workstreams/01-security-runtime.md:323` | `gate:full 71/71` 分母与当前树 76 条不符 | ✅ 已加 `superseded` 块，改为实测 `76 项 / 75 pass / 1 skip / 0 fail` |
| `MASTER-TODO.md:112` | 「非法 host 下 fetch 次数为 0」仍 `[ ]`，而 SEC-RT-001 已绿 | ✅ 已勾选（3 处 `assert.equal(fetchCalls, 0)`；`:144` 断言错误串不含 secret canary） |
| `MASTER-TODO.md:122` | 与 `01-security-runtime.md:345 [x]` 状态相反 | ✅ 已勾选（逃逸 `preset-maintenance-transaction.test.mjs:171`、symlink/hard-link `preset-skill-paths.test.mjs:97/:148/:157`、批末 fault `:110/:131`、中断恢复 `:151`、根外 canary `:87/:128/:148/:191`） |
| 卡片 L1/L2/L3 与 `EVIDENCE-MATRIX.md` 的 E0–E10 | 两套命名未显式映射 | ✅ 已在 EVIDENCE-MATRIX 加 §1.1：L 层是**卡内局部命名**（QG-002 与 QG-007 的 L2 指代不同），不得跨卡搬运、不得替代 E 层 |
| README.md / README.zh.md 链接 `docs/telemetry.md` | **文件从未在 git 历史中存在**；`../../docs/` 从包目录上溯只到 `packages/`，是层级写错叠加目标不存在；四份 README 在包 `files` 清单内**会随包出货** | ✅ 已修 6 处（2 README + 4 份 `telemetry.ts` 注释）；用仓库自己的 `resolveDocLink` 复读为 0 死链。**未**改写 telemetry 披露措辞——那是 PRIV-003（DEC-004 阻塞）的领地 |
| `collectDocFiles()` 射程 | 包内 Markdown（237 个）不在 `docs-links` 射程内，故上面的死链门禁看不见 | ⛔ **本轮不改**：扩射程是一次真实的射程变更，须先审计 237 个文件并单独开票 |

---

## 4. 决策阻塞面（11 项全部未决）

计划 §8 规定后续批次「先 DEC 再实施」。实测阻塞关系：

| DEC | 阻塞的任务 | 数量 | 紧迫度依据 |
|---|---|---|---|
| **DEC-004** | PRIV-001 → PRIV-003 / OBS-002 | 4 | **最紧**：出货件已在默认外发（见 §5） |
| **DEC-009** | SEC-RT-002 | 1 | 已实现部分的安全链断点 |
| **DEC-003** | SEC-RT-004 / 008 / 009 | 3 | SEC-RT-004 现为**默认放行** |
| **DEC-010** | REL-001 / QG-003 / QG-005 | 3 | 三张 P0 的公共前置 |
| **DEC-006** | PROD-002 → 整条 Phase 3 | 9 | 三个核心产物全在其下游 |
| **DEC-001/002** | PROD-001 → PROD-002 | 2 | 产品链根 |
| **DEC-005** | DIST-002 → REL-009 → REL-004 → DIST-003/004 | 5 | 需外部账号与等待 |
| **DEC-011** | PRIV-002 → OBS-001 | 2 | 影响既有 404 条索引 |
| **DEC-007** | REL-005 | 1 | 需 repo admin |
| **DEC-008** | BUS-001 → BUS-002 | 2 | 商业形态 |

---

## 5. 本轮新发现的两个高优先级事实

### 5.1 telemetry：不是「没做」，是「出货件已经在发」

- **出货路径**：`packaging/staging/2.4.1/.profile-src/package.json:14-15,:52/:70` 引 npm 包
  `@linxin666/dsh-client-ui-skill-explorer@0.3.6` 与 `@linxin666/dsh-client-ui-git-graph@0.3.19`；
  其 `lib/client.js:932` 在 `apply()` 首行无条件调用 `reportDailyHeartbeat`，POST 到
  `https://dsh-market.com/api/telemetry/event`；该 bundle 内 `consent|optout|telemetryEnabled|privacy`
  **0 命中**。
- **仓库源码是死代码**：`packages/surfaces/dsh-skill-center-local/build/shared-client/telemetry.ts` 存在，
  但 `grep -rn "reportDailyHeartbeat" packages/` 仅 4 处定义、0 处调用；四个包构建出的 `lib/client.js`
  端点命中数均为 0。
- **因此「在 `packages/` 里搜调用」会得出错误的「没发」结论**——事实的家在 `packaging/staging`。

### 5.2 My Quotes 索引默认开启且无出口

- `apply()` 无条件注册 5 分钟定时器（`index.js:402-410`），`rescan` 直接 `mkdir` 索引目录（`:255`）。
- 实机：`~/.dsh/my-quotes/index.jsonl` 404 条 / 440K，`text` 字段最长 5226 字符（**存全文**）。
- 无 `clear`/`pause` 端点、无保留期、无删除逻辑；「AI 精分」直接发 `text.slice(0,500)`，无预览无确认。

---

## 6. 可直接推进的 R1 批次（无需新决策、无需新授权）

按「可证明的风险关闭」排序。**本表已按各卡自己的依赖行与失败边界逐条复核**（2026-09-16 更正）：
初版曾把 `QG-003`、`QG-006B`、`PROD-UX-004` 列为无阻塞，三者均为误列，理由见下。

| 序 | 任务 | 依赖实测 | 状态 | 证据形式 |
|---|---|---|---|---|
| R1-1 | **文档腐烂修正**（§3 全表 + 死链） | 无 | ✅ **本轮完成** | 见 §1；gate quick exit=0 |
| R1-2 | ~~QG-003 接线~~ | 卡内失败边界明文禁止 | ⛔ **撤销**，见下方更正 | — |
| R1-3 | **QG-005**（changedPackages 覆盖远端基线与 untracked） | 依赖 QG-001 ✅ | 可做（S/M） | 复现「worktree 有改动但 `changed=0`」→ 修后非 0 |
| R1-4 | **QG-004**（profile 覆盖率与错误显式化） | 依赖 QG-001 ✅ | 可做（M） | 「0 个包 != 都一致」护栏覆盖装载点 + 受管集 |
| R1-5 | ~~QG-006B~~ | 依赖 `QG-002..005` + `QG-010..012`，其中 003/004/005 未完成 | ⛔ **阻塞** | — |
| R1-6 | **SEC-RT-005**（HTTP body 上限 / deadline / 解析边界） | 依赖 BASE-001 ✅ | ✅ **本轮完成**（见 §9） | 超限、chunked、slow body 的 413/408 负例；变异自测 3/3 判红 |
| R1-7 | **SEC-RT-006 → SEC-RT-007**（原子持久化 + OAuth 生命周期） | 依赖 BASE-001 ✅；007 依赖 006（卡内） | ✅ **本轮完成**（见 §9） | 损坏配置 fail-closed 负例；OAuth 超时关端口的定时器断言 |
| R1-8 | ~~PROD-UX-004~~ | 依赖 `PROD-002` ← `DEC-006` | ⛔ **阻塞** | — |

**更正 1 · QG-003 不是「接线」任务。** 卡内「失败边界」原文：「语义检查不能可靠落地前，不接入硬门禁；
但必须保留旧事故的精确最小防线」；证据层级原文：「只有 L1/L2 通过后才允许把 L3 接入 required gate」。
现状 `scripts/gates/plugin-entry-contract.mjs:84` 仍硬编码 `lib/index.js`（卡内 TODO 第 2 条未做），
候选也未分类为 plugin/library/typedSkip（第 3 条未做）。因此「把它注册进 `gate.mjs`」**违反卡片自身规定**，
正确的动作是把入口解析器 + 分类 + L1/L2 一起做完（M/L），而不是先接线。
该模块当前仍被 `test:gate` 的 `scripts/gates/*.test.mjs` glob 收进（6/6 pass），
但真实仓库并未被它校验——这个「防线不生效」的间隙属于 QG-003 本体，不是接线可以解决的。

**更正 2 · QG-006B 被 QG-003/004/005 阻塞。** 卡内依赖行写明依赖 `QG-006A、QG-002..005、QG-010..012`。

**更正 3 · PROD-UX-004 被 DEC-006 间接阻塞。** 卡内依赖行写明依赖 `PROD-002`，而 `PROD-002` 依赖 `DEC-006`。
该缺陷本身（`NewAppPanel.tsx:431` 的 `<SystemsSection />` 无 props）是真实的，但卡要求
「Systems 服务契约稳定后实施」，不能抢在 `PROD-002` 之前。

---

## 7. 需要授权的批次（本轮不执行）

| 批次 | 需要什么授权 |
|---|---|
| 该轮实现入 main | 对 **commit** 的明确授权（当前 40 条改动全在未提交工作树） |
| QG-007 / QG-008 | 建 `.github/workflows/` + push + 改 GitHub 仓库设置 |
| DIST-002 / REL-004 / REL-009 | Apple Developer 账号与证书 owner、notary credential 托管、上传/发布 |
| SEC-RT-001 live / SEC-RT-003A 人工项 | 真实店铺凭证、临时 HOME mutation 场景 |
| 重启 DSH Desktop | 宿主侧，由用户在方便时执行 |

---

## 8. 建议的收口顺序

1. **R1-1..R1-8**：本轮可全部完成并自证，把门禁从「绿但射程可疑」推到「绿且检查项齐全」。
2. **R1-1 完成后**：`MASTER-TODO.md` 与五份工作流文档的读数与当前树一致，可作为决策的准确输入。
3. **交回 11 项决策**：按 §4 的紧迫度，优先 `DEC-004`（止血）→ `DEC-009`/`DEC-003`/`DEC-010`（解锁 7 张 P0/P1）。
4. **决策到位后**：按 §8 原文批次逐个执行，每批后停下汇报。

---

## 9. 第二轮（同日）：R1-7 = SEC-RT-006 → SEC-RT-007 已完成本地闭环

用户指定顺序「先 SEC-RT-006 → 007」，理由是它可完全在临时 HOME 内做 Red/Green。实测确认用户点名的
三处全部成立，**并多出第四个同级缺陷**：技能 Markdown 有 9 处与 JSON 同款的直写最终路径（任务清单只点了 4 处 JSON）。

| 缺陷（改动前 `lib/index.js`） | 事实 | 处置 |
|---|---|---|
| `:105-115` `catch {} → DEFAULT_STATE` | 损坏配置**静默开启**能力（fail-open） | 损坏 → 能力关闭 + 结构化 health；原字节不改写 |
| `:120/:528/:607/:725` 直写最终路径 | 写中断即截断；既有 0644 永不收紧 | 收成 `lib/atomic-store.js` 单一写入器 |
| `:252…:436`（9 处）技能 `.md` 直写 | 同一缺陷的第二个家 | 一并收进写入器（**只修点名的 4 处等于没修**，P-07） |
| `:588/:687` + `:1471-1481` | `expiresAt` 无读者；连续 start 覆盖变量；注册 12 条只 dispose 9 条 | `lib/oauth-flow.js` 单一所有者；12/12 回收 |

### 9.1 读数（本轮亲自跑过）

| 项 | 命令 | 读数 |
|---|---|---|
| 包内全量 | `node --test test/*.spec.mjs` | **76 tests / 76 pass / 0 fail**，exit 0 |
| 类型 | `node_modules/.bin/tsc -p tsconfig.json` | **exit 0** |
| Red（006 接线） | HEAD 版 `index.js` + `test/persistence.spec.mjs` | **9 tests / 0 pass / 9 fail** |
| Green（006 接线） | 恢复工作树后同一条 | **9/9 pass** |
| Red（007 路由） | HEAD 版 + `test/oauth-routes.spec.mjs` | **4 tests / 0 pass / 4 fail** |
| Green（007 路由） | 恢复后同一条 | **4/4 pass** |
| 根门禁 quick | `node scripts/gate.mjs --mode quick` | **70 项：69 pass / 1 skip / 0 fail**，exit 0（含新增项 `wanzh-persistence-and-oauth`） |
| 根门禁 full | `node scripts/gate.mjs --mode full` | **77 项：76 pass / 1 skip / 0 fail**，exit 0 |
| 装载点 | `node scripts/sync-profile.mjs --apply --loadpoint` → `--check` | 3 个文件按 tmp+mv 同步；`ok 装载点与仓库源一致（对比 24 个包）`；逐字节复核相同 |

变异自测（恒真桩突变必须变红）：去掉 `chmod`、去掉 rename 前权限校验、改回直写、去掉串行队列、
去掉到期定时器、去掉 supersede、去掉 `closeAllConnections`、去掉 `unref` —— 各自都有具名用例变红。
**反例（诚实记录）**：去掉**目录 fsync** 不变红（进程级无判别力），因此只做显式标注射程的结构性断言，
没有把它写成「断电安全已验证」。

### 9.2 第二轮：独立审证与修订

与实现上下文分离的独立审证（复现全部 Red/Green、三条自选变异、前后哈希取证）给出结论「有条件放行」与
**4 条 Important + 8 条 Minor**。核对其全部成立，其中 I-3 是**本次改动引入的回归**（`/oauth/status` 原本不会抛，
加了会抛的读路径后请求悬挂），I-4 是**我在文档里主张了一个不成立的并发不变量**。四条已修，方法与读数见
`workstreams/01-security-runtime.md` 的「复审修订」小节与 [ADR-0099](../../../docs/adr/ADR-0099.md)。
这次审证还纠正了我的一处自评错误（`closeAllConnections` 的判别力在「既存连接是否被断开」，不在「端口能否被连上」），
并指出一条变异脚本自己写坏了导致假绿——那条已重做，没有当成「变异不成立」记下来。

### 9.3 三条门禁抓到的真实后果（不是形式主义）

1. `profile-bundle-sync` 在我改完代码后立刻判红：装载点仍缺两个新模块、`index.js` 字节不一致 ——
   即「重启应用会跑旧产物 / 起不来」。按既有 remediation 同步后转绿。
2. `pitfalls-playbook` 的机制真实性校验让我不能写不存在的门禁名，因此 P-32 的「已落地机制」只点名
   真实存在的脚本路径。
3. `profile-bundle-sync` 在每一轮改动后都立刻判红（共触发两次），逼出「改完必须同步装载点」这一步；
   若不处理，重启应用就是跑旧字节。

### 9.4 剩余项（本轮**未做**，不得读成已完成）

- **设置页客户端渲染**：`/list`、`/mcp-servers`、`/oauth/status` 已返回结构化 `health` / `flow`，
  但 `lib/client.js` 未消费（需要重启 app 才能取得一次真实页面证据；不写没跑到过的分支，P-04）。
- **重启后验收**：状态/token 保留、损坏配置下 UI 显示修复指引 —— 需用户重启 DSH Desktop。
- **真实 PixPix 授权人工项**：正常授权 / 关闭浏览器 / 拒绝 / 超时后重新发起 —— 需真实账号与浏览器。
- **跨进程互斥**：串行队列只覆盖同进程；`withFileLock` 形态未做（无证据表明存在第二个写者）。
- **真实 OAuth 回调端到端复现**：需要真实 tokenEndpoint 与浏览器；审证的 I-1 是从代码链逐环读出来的，
  修法有单测（归档通道、回调 finally）但**端到端未跑**。
- **宿主未处理 rejection 策略**：审证未定位到 `ctx.webServer` 的派发实现，不下结论。
- **技能 Markdown 的整文件替换**不排队（它们没有读-改-写窗口），这一点写在队列注释里而非假称全覆盖。
- **其他 48 个任务**：`SEC-RT-002/003/004/005/008/009/010`、`QG-003/004/005/006B/007/008/009`、
  `REL-*`、`DIST-*`、`PROD-*`、`PRIV-*`、`OBS-*`、`GOV-*`、`BUS-*`，以及 11 项决策。

### 9.5 本轮权限边界

工作树改动 + 装载点同步（既有 SOP 的 remediation）＋ 新增一条根门禁项。**未** commit / push / 发布 /
改远端 / 改 GitHub 设置 / 真实账号授权；运行中的 DSH 仍跑旧字节，需用户重启后生效。

---

## 10. 第四轮：SEC-RT-005（HTTP body 有界读取）

**定位到的真实缺陷**：wanzh 与 team-hub 两处 HTTP 面读请求体**都没有上限**
（`index.js:113`、`server.mjs:46`），而宿主不兜底——`DesktopWebServer.register` 只做浏览器访问
许可判定，对请求体零限制（读 `app.asar.unpacked/lib/webserver.js` 确认）。

- 上限不是拍的：Desktop profile 实际挂载 `dsh-file-upload`，其 `MAX_JSON_BYTES = 18 MiB`，
  故 team-hub 透传面取 32 MiB（~1.8× 余量），网关自有面 8 KiB / 64 KiB，wanzh 统一 64 KiB。
- 两侧各新增一个 `bounded-body` 模块，共收口 13 个调用点；新增 25 条**真 socket** 用例。
- **同批修掉两个既有缺陷**：① team-hub 三处主通路 `try` 内 `return promise` 不 `await`，
  症状是「请求进了处理器却永远没有响应」（登记 P-33）；② `files` 漏两个运行时文件（P-24 复发）。
- **我在本批纠正了自己四处错误**：伪造 `Content-Length` 在 HTTP/1.1 下不可表达（用例已删并留注释）；
  解块助手把 chunk 字节数当字符数切（中文响应即崩，两侧同修）；「代理面超限」用例实际没在守
  `proxyRequest`（变异自测抓出）；早前「没有任何门禁校验 `files`」的说法不准确（门禁覆盖**装载点**，
  不覆盖**交付清单**——这一条直接催生了第五轮的 QG-013）。
- 读数：`gate` quick exit 0（70 项）、wanzh 86/86、team-hub 87/87、typecheck exit 0、变异自测 3/3 判红。
- **未做**：「受控并发下 RSS 不随传输总量线性增长」未实测；代理面仍是缓冲而非流式转发。

## 11. 第五轮：QG-013（files 交付清单完整性门禁）

用户指定顺序为「先把 files 完整性门禁立卡补上，再来 QG-006B」。本卡**先立卡、后实现**，
卡面见 [02 工作流](workstreams/02-gates-ci.md) 的 `## QG-013`。

### 11.1 立论基础（立项前先做判别实验，不是先写代码）

`pnpm` 对 `file:` 依赖**遵守 `files` 白名单**——隔离临时根实测：`files:["lib/a.js"]` 的包
安装后 `node_modules/<pkg>/lib/` 只有 `a.js`，未声明的 `lib/b.js` 与顶层 `undeclared.txt` 都不出现；
`npm pack --dry-run --json` 对同一 fixture 给出同一集合。
**因此缺件命中的是本机装载点的全新安装，不是「发布出去少一个文件」**——而全新安装路径上
没有任何同步步骤可以补救。这条实验已固化成测试里的前提钉（真 `pnpm`，隔离 `HOME`/`TMPDIR`/cache）。

### 11.2 两处设计转向（都由证据推翻了我的初版设计）

1. **判据面从「`lib/` 顶层所有 bundle」改成「声明入口的可达闭包」。**
   初版照搬 `loadPointFiles()` 的规则，第一次跑就在 `dsh-paper2skills` 上报了 5 个文件。
   核实后是**仪器假红**：那是包内 `scripts/`、`test/` 用的开发期模块，该包无 `main`、无 `dsh` 字段、
   不是任何 profile 的 `file:` 依赖。**同一份规则在「装载点字节一致」与「交付清单是否漏件」
   两个目的下不是同一个判据。** 闭包之外、`lib/` 顶层的 bundle 只进 `note` 读数（不判红、不判 skip）。
2. **无 `files` 白名单的包不写成一律 skip。** 唯一能把运行时文件挡在交付之外的是 ignore 文件，
   于是只回答那一个问题：核对 ignore 文件（窄子集，未建模形态 fail-closed）能否命中任何运行时文件。
   命中不了 → 不适用（进 `note`）；可能命中或形态未建模 → 类型化 skip。
   理由是永久 skip 会把 `gate:strict` 拖红，而永久红灯的噪声最终会让真信号一起被忽略（P-02 的另一面）。

### 11.3 读数

| 项 | 命令 | 读数 |
|---|---|---|
| 单测 | `node --test scripts/gates/package-files-coverage.test.mjs` | **23 tests / 23 pass / 0 fail**，exit 0 |
| 校准（真实 npm） | 同上 `CALIB npm` 一条 | 23 个有 `files` 白名单的受管包与 npm 11.14.1 的 `npm pack` 产出**逐文件全等**，0 处不一致 |
| Red 重放（真实树） | 把 wanzh `files` 回退到复发版本 | `status=fail`，`checked=122 / failed=2`，点名 `lib/atomic-store.js`、`lib/oauth-flow.js`；按备份还原后哈希逐字节相同 |
| Green（真实树） | 同上，回退还原后 | `status=pass`，`expected=124 / checked=124 / skipped=0 / failed=0` |
| 根门禁 quick | `node scripts/gate.mjs --mode quick --json` | **72 项：71 pass / 1 skip / 0 fail**，exit 0（新增 2 项） |
| 变异（行为层） | 模块未突变时跑测试 | MUT1/2/3 各自 import 独立突变副本，证明「判定器坏掉 → 缺陷形状漏过」 |
| 变异（接线层） | 对真实模块施加三处突变后跑测试 | **3/3 exit=1**（19 / 13 / 7 条用例判红）；M1 生效时完整 quick gate `exit=1` 且 selftest 项 `fail` |

### 11.4 我自己在这轮犯的两个错（记下来，不留着让人再踩）

1. **JSDoc 里写了字面量 `**/`**——它把块注释提前终止，模块直接语法错误。这是 P-05
   （隔着一层解释器/转义写字面量）的又一次同形：我知道那个序列的语义，却没意识到它出现在注释里。
2. **对象守恒算错了**：先 `checked += surface.length` 再 `failed += missing.length`，
   导致 `expected = checked + skipped + failed` 把缺件多算一遍。已改为逐包
   `checked += checked − missing − unreadable`。这条不是「测试没覆盖」，是**算式本身错**，
   而 canonical schema 校验器（`expected === checked + skipped + failed`）本该第一次就抓住它——
   它抓不住的原因是那个等式在两边同时被算错时仍成立。

### 11.5 剩余项与边界

- **未建模的边界**（写进模块注释，不留给人推断）：用变量拼路径读取的包内数据文件
  （如 `join(PKG_ROOT, 'data')`）本项看不见。当前仓库里此类文件都在 `files` 里有声明，
  因此不影响结论——但这是边界，不是保证。
- **只报读数、不判的那一类**：`dsh-paper2skills` 的 5 个 `lib/` 顶层 bundle 在可达闭包之外；
  「它们是开发期模块」是人工核实的结论，机器分不出来。
- **`files` 校准依赖本机 `npm` / `pnpm`**：两者不可用时测试显式 skip 并写明「没有校准任何东西」，
  不静默通过。
- **本批未做**：未 commit / push / 发布；未触发任何真实安装。
- **本批做了一次装载点同步**（既有 SOP 的 remediation）：JSDoc 修复改到了 `lib/bounded-body.js`，
  它属于装载点断言面，不同步就会让 `profile-bundle-sync` 一直判红。同步前已备份，
  同步后 `--check --loadpoint` 报 `ok`，两侧 sha256 相同。
- **下一批**：`QG-006B`（聚合并发、失败/SIGTERM 与零副作用证明）——用户已指定它排在本卡之后。

### 11.6 本批顺带发现并修掉：上一批留下的 `gate:full` 红灯

第一次跑 `--mode full` 时 `scripts-runnable` 判红：`dsh-wanzh-hulian` 的 `typecheck` 退出码 2，
16 条 TS 错误，**全部由 SEC-RT-005 引入**（不是本卡）：

- `lib/index.js` **10 处** TS2339：`body?.ref` / `body?.id` / `body?.value` / `body?.enabled`。
  根因是 `readBoundedJson` 的 `@returns` 写成 `Promise<unknown>`，而这 7 条设置路由全部按对象取字段。
  已核对 HEAD 原文：旧 `readBody` 直接 `JSON.parse(...)`（返回 `any`），所以这 10 处此前从未报错——
  **是这次改写把它们从 `any` 收紧成 `unknown` 的**。
- `test/bounded-body.spec.mjs` **6 处**：`server.address()` 的 `string | AddressInfo | null` 没收窄；
  以及把 `new Promise` 的 `resolve`（`(value: unknown) => void`）直接当 `listen` 的回调
  （签名是 `() => void`）——后者不只是类型问题，它把 `listen` 失败也吞成了成功。

**为什么上一批没发现**：那一轮只跑了 `--mode quick`，而 `scripts-runnable` 声明的是
`modes: ['full']`。仓库的验收契约写的是「提交前 `gate`、推送前 `gate:full`」；只跑 quick
就声称通过，是 **P-04（写了但从没跑到）** 的变体——**用的是没有覆盖该分支的那档命令**。

**修法**：`readBoundedJson` 返回类型改为 `Record<string, unknown>`（字段值仍是 `unknown`，
想用某个字段还是得先窄化，**没有放松任何检查**）；测试抽出 `listenOn()` 统一收窄，
并补 `error` 监听，让监听失败不再被吞成成功。

**复读**：`node_modules/.bin/tsc -p tsconfig.json` → **exit 0**；
`node --test test/*.spec.mjs` → **86 tests / 86 pass / 0 fail**；
装载点同步后逐字节一致（备份 `/tmp/dsh-loadpoint-backup-20260916-234413/`）。

---

## 12. 第 6 轮（2026-09-17）：`QG-003` + `QG-004` + `QG-005`

用户指定「先做 QG-003/004/005」——这三张卡是 `QG-006B` 的依赖行里唯一还没动的三张。

### 12.1 共同根因：射程变小与「没有问题」在读数上同形

三张卡各有一个实测 Red，形状不同、根因同一个。统一契约见
[ADR-0102](../../../docs/adr/ADR-0102.md) 与[决策记录](../../../docs/notes/implemented/contract/2026-09-17-gate-scope-is-the-denominator.md)：
**分母 = 被检查对象的完整集合**，每个对象落在且只落在一个桶里
（`expected = checked + skipped + failed`），空射程只能报 `skip` 不能报 `pass`。

### 12.2 三个 Red（全部实测，不是推断）

| 卡 | Red 的造法 | 旧读数 |
|---|---|---|
| QG-005 | L1 临时 Git 仓库：`origin/main` 停在 init，本地另走两个提交、改了两个包 | 旧三条来源合起来 = **空集**（`main...HEAD` 在 main 上是自比较）；真实仓库里 31 个 untracked 文件一个都不在集内 |
| QG-003 | 直接调 `scripts/gates/plugin-entry-contract.mjs` | `passed=true`，自述「核对 21 个 Cordis 入口（23 个带 dsh.bundle.patch 的包）」——2 个候选从分母消失 |
| QG-004 | 假 HOME + 真实 `node scripts/gate.mjs --mode quick --json`，profile 的 `package.json` 写成截断 JSON | 三个 profile 门禁**一起绿**：`files-sync` 一个字不报、`bundle-sync` 自述「对比 0/0 个 file: 依赖」 |

QG-004 的 Red/Green 是**端到端**跑出来的（同一假 HOME、同一命令）：Green 时三面全部判红，
violation 是 `.../profiles/desktop/package.json 不是合法 JSON（Expected property name or '}' at position 47）`。

### 12.3 三处落地

- **QG-005**：新 `scripts/gates/changed-packages.mjs`。基线按「CI 事件 SHA（`DSH_GATE_BASE_SHA`，须可达且确为
  merge-base）→ 分支 upstream → `origin/main`」解析，**刻意不含本地 `main`**；四类来源分别列账；
  rename 同时映射旧、新路径；路径归属按分段边界；根治理文件按已登记规则归类，工作区级的把射程扩到全部包；
  基线不可解析一律判红。`checkChangedPackages` 改成规范三态，**无改动时 `skip`**
  （旧行为会被规范化成 `checked=1`，把「没看」记成「看过且没问题」）。
- **QG-003**：`plugin-entry-contract.mjs` 重写并**首次接线**——`grep -rn "plugin-entry-contract" scripts/`
  此前只命中它自己与它的测试，它是 **P-04（写了但从没跑到）叠在 P-02（仪器假绿）** 上。
  入口按清单解析（`exports['.']` 条件目标 → `main`）、跟随 `export * from` 转出口；候选分四态且**四态都进分母**；
  注释与字符串先剥离再扫；`ctx.<服务>` 的缺陷形状收窄到**未加 `try` 防护**的属性访问；
  Service 型核对 `inject` 是否为 **static** 字段。
- **QG-004**：新 `scripts/gates/profile-coverage.mjs`。期望集从 profile 的声明推出并按**完整相对路径**
  后缀对齐（不按 basename）；manifest 解析失败直接判红；期望集里的包在目标缺失判红；
  三个断言面共用期望集、各自结账；只允许「profile 根整体不存在」一种 skip。
  `installedProfileDependencies()` 删除，**不留同名「安全版本」**。

### 12.4 Green 读数

`node scripts/gate.mjs --mode quick --json` → **exit 0**，`total 76 / pass 75 / skip 1 / fail 0`；
`node scripts/gate.mjs --mode full --json` → **exit 0**，`total 83 / pass 82 / skip 1 / fail 0`
（skip 均为 `live-presets` 的 typed skip）。

| 项 | 账目 |
|---|---|
| `plugin-entry-contract` | `expected=23 checked=23 skipped=0 failed=0`（`plugin-apply=21 plugin-service=2 library=0 unresolved=0`） |
| `profile-metadata-sync` | `expected=24 checked=24 skipped=0 failed=0` |
| `profile-files-sync` | `expected=24 checked=24 skipped=0 failed=0` |
| `profile-bundle-sync` | `expected=24 checked=24 skipped=0 failed=0` |
| `changed-packages` | `expected=12 checked=12 skipped=0 failed=0`（8 个包 + 4 条治理规则） |

反向自测：`changed-packages.test.mjs` 20 条、`plugin-entry-contract.test.mjs` 28 条、
`profile-coverage.test.mjs` 18 条；关掉 untracked 来源 → 5 条转红，关掉目标缺失判红 → 7 条转红。
三个 selftest 都已接进门禁。

### 12.5 实施中被证据推翻的设计（记下来，因为它们不是「顺手改」）

1. **「不导出 `apply` 就是库」这个分类本身是错的**：那 2 个候选是 Cordis `Service` 子类
   （默认导出是类，类体内 `static inject`），它们**是插件**。
2. **`try { … } catch {}` 里的 `ctx.<服务>` 不是缺陷形状**：依据是 `dsh-skill-center-local` 的
   `findPairing()`，注释写着 "never a throw"。
3. **`pnpm-lock.yaml` 不进治理规则表**：它被 `.gitignore` 忽略（白名单式，第 14 行 `*` 起手），
   永远不出现在 `git diff` / `git status` 里——为它登记规则就是造一条死规则。
4. **规则匹配改成「最具体者胜」**：按声明顺序取第一个命中会让 `scripts/gates/` 前缀把
   `scripts/gates/exemptions.json` 整条吃掉，被吃掉的那条在表里看起来完全正常。

### 12.6 未做 / 边界

- 未 commit / push / 发布；未触发任何真实安装。
- **未碰真实 profile**：QG-004 的 Red 与 Green 全在假 HOME 与临时 fixture 上跑。
- `DSH_GATE_BASE_SHA` 的**注入方是 `QG-007`**（本卡只定义并校验入口契约，未做远端 CI 重放）。
- `changed-packages` 在射程为空时报 `skip`；**`QG-007` 接线时不要把它读成「门禁坏了」**。
- 已知边界写在各模块注释与门禁 note 里：模板字面量插值里的 `ctx.x` 看不见（漏报不是误报）；
  `plugin-service` 只核对 inject 的字段形态、不核对它要哪些服务。
- **下一批**：`QG-006B`（聚合并发、失败/SIGTERM 与零副作用证明）——它的依赖
  `QG-003/004/005` 现在全部落地，阻塞已解除。

## 13. 第七轮（2026-09-17）：`QG-006B` 聚合并发、中断与零副作用证明

用户指定「直接进 QG-006B」。它的依赖（`QG-003/004/005`）在上一轮全部落地，阻塞已解除。

### 13.1 两个实测 Red（不是推断）

```
$ TMPDIR=/tmp/qg006b-term/tmp node scripts/gate.mjs --mode quick &
$ kill -TERM $! ; wait ; echo $?
143
$ ls -1 $TMPDIR | wc -l
8                              ← 6× fullstack-installer-*、1× wanzh-routes-*、node-compile-cache
$ ps -Ao pid,ppid,command | grep gate
58238 1 node scripts/gate.mjs --mode quick      ← 被 init 收养，继续跑
```

再数真实 `TMPDIR`：`fullstack-installer-*` **1555**、`gn-check-*` **438**、`wanzh-routes-*` **82**
（合计 **2066 个残留根 / 35 MB**），来源是三个「从不清理」或「只在正常路径清理」的用例
（`fixture()` / `makeTree()` 只建不清；`test.after` 只在正常跑完时执行）。

同轮还实测到一条判据读环境的缺陷：合成 HOME 下 `--mode quick` 有 8 项走「环境不在」分支、
`skill-lines-selftest` 判红，根因是 `skill-lines.test.mjs` 的 S4–S7 未注入 `home`、走了
`homedir()` 默认值（桩一次都没被调用）。

### 13.2 落地

- `scripts/lib/repo-snapshot.mjs`：纯函数快照（git tracked/untracked 内容哈希 + 声明根深度 1 名录 +
  未声明 ignored 区域全量 + HEAD/refs/index 字节）；射程的每一次收缩都判红
  （空射程 / 目录折叠 / 枚举与磁盘不一致 / schema 不符）；差异与「说不清」分开报告。
- `scripts/lib/repo-attest.mjs`：真子进程（独立进程组）+ before/after 见证；证据写自己的临时根，
  不写回被见证仓库；`.git/*.lock` 走「先重试再看」（只有 `unexplained` 重试，具名差异不重试）。
- `scripts/lib/attest-scope.mjs`：`DSH_ATTEST_REPO` 与安静度探测——不安静时给**类型化 skip**，
  不把邻居的写入说成门禁的副作用。
- `scripts/lib/mutation-fixture.mjs`：live 根注册表 + `process.on('exit')` + SIGINT/SIGTERM/SIGHUP
  先回收再重发默认处置；新增窄接口 `mutationRoot()`。
- 门禁注册表新增 `repo-snapshot-selftest`、`repo-attest-selftest`（quick）与
  `gate-concurrency-selftest`（full-only）+ `node scripts/gate.mjs --attest` CLI 入口。

### 13.3 Green 读数

| 项 | 读数 |
|---|---|
| `node scripts/gate.mjs --mode quick --json` | **exit 0**，`total 78 / pass 76 / skip 2 / fail 0` |
| `node scripts/gate.mjs --mode full --json` | **exit 0**，`total 86 / pass 84 / skip 2 / fail 0`（三项新增判据全 pass；并发项在本仓库上跑满 10 轮） |
| `repo-snapshot.test.mjs` / `repo-attest.test.mjs` / `mutation-fixture.test.mjs` | 10 / 9 / 11 条，全绿（六条结束路径逐条 `identical: true`） |
| 三个泄漏源迁移后重跑 | `install-fullstack-skills` + `generic-manifest-skip` 12/12、`oauth-routes` 4/4；前后残留计数 **0 新增** |
| `--attest` 正/负例 | 干净目标 exit 0；故意写仓库的目标 exit 1 并点名到路径 |

### 13.4 实施中被证据推翻/逼出来的四处（不是顺手改）

1. **`.git/*.lock` 不能当差异类型**：并发读锁与被打断的写入者残留在单张快照里同形，
   前者不是副作用、后者是真残留。改成「只有 `unexplained` 会重试、具名差异一次都不重试；
   锁仍在磁盘上就照旧判红」。
2. **`refs/codex/**` 是别的工具的命名空间**：算成本次运行的副作用是错误归因，直接忽略又会
   掩盖「测的这段时间有人在写」。改为分两份：本仓库自己的 ref 进 digest 判红，外部命名空间
   只记名字与新旧 OID 进 `concurrentActivity`。
3. **判据不能读真实 `homedir()`**：`skill-lines.test.mjs` 的 S4–S7 改为注入合成 HOME
   （QG-006A 契约的同一句话；被测方默认值不动）。
4. **`mutation-fixture.mjs` 的三处 `checkJs` 类型错此前从未被看到**：包的 `include` 是
   `test/**/*.mjs`，直到本卡的测试文件开始 import 它才第一次被传递引入。修法是标注 + 一处直接
   `throw`（`checkJs` 不把 `fail()` 的 `@returns {never}` 用作窄化，实测三次）。

### 13.5 未做 / 边界

- 未 commit / push / 发布；**未跑远端 CI**。L3（独立 runner 上的 attestation）由 `QG-007` 收口。
- 并发稳定性读数取自**独占副本**（`DSH_ATTEST_REPO`）：本工作树长期有多个会话同时写，
  实测在共享树上 4 次里 2 次被判红，两次都判对（写入者是本会话、Codex 会话、另一个 agent 会话）。
- 声明根只记深度 1 名录/类型/权限，不比对内部内容字节（479k 文件的取舍）；快照读取非原子。
- `--attest` 的见证者根**通过时收掉、判红时留下**（刚数过 2066 个残留根，不再自己犯一遍）。
- **下一批**：`QG-007`（可复现 CI workflow 与证据分层）——它是 `QG-006B` 之后的收口项，
  也是「远端 required check」唯一还没做的那一环。
