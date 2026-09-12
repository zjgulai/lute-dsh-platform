# 出海技能页四层重构 · 验收证据

任务：用户要求把设置页「出海技能」按《AI组织变革》骨架重构为 **L1 场景 → 4 面 → 责任域 → 岗位**，
并先补全 222 个技能的岗位判定。决策记录见 [ADR-0044](../../docs/adr/ADR-0044.md) 与
[Note](../../docs/notes/implemented/capability/2026-09-12-overseas-skills-role-tree.md)；
页面契约见 [包 README](../../packages/capabilities/dsh-overseas-skills/README.md)。

本目录是**可复跑的生成链与验收脚本**（都是构建期工具，不是运行期插件代码，故不进 `packages/`）。

## 流水线（按顺序）

| 步骤 | 脚本 | 输入 → 输出 |
| --- | --- | --- |
| 1 | `build-evidence.py` | 技能目录 + 50 岗位 → `evidence/roles.json`、`evidence/all-skills.json`、`evidence/batches/B01..B10.json` |
| 2 | （10 个批次执行者，规则见 `PROTOCOL.md`） | 每个批次 → `assignments/B0N.json` |
| 3 | `validate-assignments.py` | 机械校验（覆盖 / 词表 / **防伪造引文** / 一致性 / 不留暗账） |
| 4 | `merge-assignments.py` | 10 个批次 → `packages/capabilities/dsh-overseas-skills/manifest/role-assignments.json` |
| 5 | `packages/.../scripts/build_role_map.py` | manifest → `lib/role-map.js`（宿主 import 的产物） |
| 6 | `probe-client-render.mjs` | 真负载 + 真 client bundle → jsdom 里走完四级下钻（**两个场景**：/org 可用 / /org 401） |
| 7 | `compose-page.mjs` | 真组件渲染出的 DOM + bundle 自己注入的 CSS → `acceptance/page-*.html`（外层是按官方样式表读出来的设置页壳） |
| 8 | `shoot-pages.sh` | `page-*.html` → headless Chrome 1280×633 / 1280×6000 → `acceptance/page-*.png` |
| 9 | `crop-tops.py` | 长图 → `acceptance/*-top.png`（发给用户看的就是它们；产地只此一处） |
| 10 | `verify-pages.py` | 时效 + 像素 + 出处三层自检（图比代码旧 → 红；裁切与整页不符 → 红） |
| 11 | `live-state-probe.mjs` | **运行中的宿主** → 客户端半边 / 宿主半边各自的活体读数（重启前后各跑一次，是红是绿自己会说） |
| 12 | `probe-endtoend.mjs` | 真宿主 handler → 真 socket → 真 client bundle → 真 DOM：**重启之后页面会不会真的长出来**，不重启就能回答 |
| — | `jsdom-harness.mjs` | 步骤 6 与 12 共用的挂载脚手架（同一份 bundle、同一套插槽契约，两条结论才能互相印证） |

## 复跑

```sh
cd /Users/lute/project/Magpie-Horch
python3 .scratch/overseas-skills-refactor/validate-assignments.py     # 10/10 批次 ✓
python3 .scratch/overseas-skills-refactor/merge-assignments.py        # 校验通过才写盘
node .scratch/overseas-skills-refactor/probe-client-render.mjs        # 19/19 渲染断言（两个场景）
node .scratch/overseas-skills-refactor/probe-endtoend.mjs             # 27/27 端到端（真 socket，含两条红测）
node .scratch/overseas-skills-refactor/compose-page.mjs               # 7 张验收页 + token 覆盖检查
bash .scratch/overseas-skills-refactor/shoot-pages.sh                 # 7 张 png（真浏览器）+ 3 张裁切
python3 .scratch/overseas-skills-refactor/verify-pages.py             # 时效 / 像素 / 出处（7/7）
cd packages/capabilities/dsh-overseas-skills && npm run typecheck && npm test
node .scratch/overseas-skills-refactor/live-state-probe.mjs              # 活体：0=新页面已可用 / 1=宿主侧等重启
cd /Users/lute/project/Magpie-Horch && pnpm run gate
```

## 实测结果（2026-09-12）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 判定机械校验 | `validate-assignments.py` | 10/10 批次 ✓；有岗 217 / 无岗 34 / 挂载 329；1 条 warning（handoff→AGT-049 责任名留空，协议允许） |
| 校验器红测 | 塞入未知岗位 / 伪造引文 / 静默删除 / 无岗无理由 | 56 条错误全部报出，exit 1 |
| 合并 | `merge-assignments.py` | ✓ 写入 manifest（251 条、172674 字节） |
| 产物一致性 | `build_role_map.py --check` | ✓ 与 manifest 一致 |
| 包内单测 | `npm test` | **29 通过 / 0 失败**（含归位表契约、层头像跨包防漂移、四层树契约、宿主路由契约） |
| 类型 | `npm run typecheck` | exit 0 |
| **渲染实测（A：宿主已重启）** | `probe-client-render.mjs` | 12/12 ✓：诊断条、8 场景折叠、场景→面→责任域→岗位逐级展开、卡片出现、接线徽标、未归岗分组、搜索横切 |
| **渲染实测（B：宿主未重启）** | 同上，`/org` 答 401 | 7/7 ✓：不是白屏，写明原因，退化为原场景分组且场景头可展开，搜索不受影响 |
| 退化路径红测 | 用修复前的 bundle 跑同一探针 | **14/19，exit 1**（5 条失败全在场景 B）→ 修复后 19/19 exit 0 |
| **端到端实测（真 socket）** | `probe-endtoend.mjs` | **27/27 ✓ exit 0**：真 handler 经真 HTTP 交出 358 KiB 的 /org；bundle 里写的 5 条路由宿主全注册；伪装 Host 401 / 错方法 405 在真 socket 上复验；负载数字与声称逐项相等（场景 8 / 卡片 222 / 归位 209 / 未归岗 13 / 行 319 / 有卡岗位 47 / 零卡 3 / preset 50）；222 张卡名全部能在 catalog 与 /list 里对上；真 bundle 经真 socket 走完四级下钻并渲染出真卡片标题 |
| 端到端红测 A | 往真负载注入一张幽灵卡 | 被认出（1 张）→ 「无幽灵卡」这条断言确实咬人，不是空转 |
| 端到端红测 B | 关掉真服务再挂一次 | 页面转「四层视图暂不可用」且根节点仍在 → 那条绿确实依赖真 socket |
| 加载时序实测 | 端到端探针第 15 条 | 卡片标题来自**第二条并发请求**（/list），真 socket 下晚于 /org 落地——首轮断言曾因此红（0/1），改为显式等待后 1/1；说明整页不是一次响应就长齐的 |
| token 覆盖（无幻觉） | `compose-page.mjs` 尾部自检 | 引用 71 个官方 token / 官方定义 361 个 / **未定义 0 个** |
| 目视验收页 | `compose-page.mjs` + `shoot-pages.sh` | 7 张真浏览器图（浅/深 × 首屏/下钻/诊断/退化） |
| 层头像防漂移 | 手改 1 字节 | 跨包断言变红；重跑生成脚本转绿 |
| 宿主路由契约 | `npm test`（`test/host-routes.spec.mjs`） | 4/4 ✓：六条路由全注册、非回环 401、错方法 405、`/org` 负载逐项对齐 manifest 与 catalog、30 秒缓存 |
| 验收图像素自检 | `verify-pages.py` | **7/7 ✓，exit 0**：面板 800px（含投影 810/802）、右侧内边距墨迹 0.000%、内容区墨迹 4.97–10.42%、浅/深亮度差 210.9 |
| **图的时效**（新增） | `verify-pages.py` 第 0 段 | 11 个输入（8 个包源 + 2 个脚本 + 裁切产地）里最新的那个是基线；7 张图每张都必须比它新。红测：`touch lib/client.js` → **7 张全被判过期**并点名 `client.js @ 14:49:06`，还原后转绿 |
| **裁切图的出处**（新增） | `verify-pages.py` 第 6 段 | 3/3 ✓：`*-top.png` 必须逐像素等于对应整页图的顶部 N 行。红测：换成偏移 100px 的另一段 → **红**（平均差 8.785）；还原后转绿 |
| **验收图可重放**（新增） | `compose-page.mjs` → `shoot-pages.sh` → `crop-tops.py` 全量重跑 | **10/10 张逐字节相同**：重放后与重放前 `cmp` 全部一致（含耗时最长的两张 6000px 长图）。图是当前代码的确定性函数，不是某次运气 |
| **活体状态（重启前）** | `live-state-probe.mjs` | 7 PASS / 1 FAIL / exit 1：装载点 7 文件同内容、客户端 rev 对上；`GET /org` 401 纯文本 = 宿主路由等重启（见下节） |
| 活体探针红测 | 同上，`DSH_WEB_PORT=1` / 假 profile | 两条都 FAIL 且结论行随因改口，exit 1 —— 探针不会假绿 |
| 仓库门禁（提交前） | `pnpm run gate` | 15/15 ✓，exit 0 |
| 仓库门禁（推送前） | `pnpm run gate:full` | 19/19 ✓，exit 0 |

## 判定结果的分布（`manifest/role-assignments.json` 的 coverage）

```
251 条技能（222 出海 + 29 AI全栈）
有岗 217　无岗 34（TOOL_ONLY 13 / GENERIC_METHOD 20 / OUT_OF_SCOPE 1）
挂载 329 条（继承既有接线表 197 + 本轮判定新增 132）
显式删除既有先验 24 条（涉 20 个技能，均带理由）
跨岗 82 条，最多的一条挂 6 个岗位
置信度 high 101 / medium 180 / low 48
岗位有供给 49/50（仅 AGT-005 内控审计与独立复核零供给）
```

页面树只承载 222 条出海技能：`cards 222 / 归位 209 / 未归岗 13 / 行数 319 / 有卡岗位 47`，
零卡岗位 3 个（AGT-013 求证、AGT-005 守衡、AGT-049 稳行）。

## 已知边界

- **low/medium 仍待人工复核**：跨岗与「只链到使命、对不上责任名」的条目本轮按协议降置信度保留。
  复核入口是 manifest 里每条的 `evidence` 与 `note`。
- **AI全栈 29 条的判定已入库但未上树**：它们没有场景轴，页面挂法待定，本页保持原分组视图。
- **12 枚层头像存在两份字节**（本包 + 算法技能页），防漂移靠跨包逐字节测试。
- 本轮**未提交**（用户要求暂不提交）；**装载点**（`~/.dsh/profiles/desktop/node_modules/dsh-overseas-skills`，
  7 个决定行为的文件与仓库逐字节一致）已同步，宿主侧需重启生效。见下节倒数第二段关于 `vendor/` 的说明。

## 这一页为什么「改了代码还要重启」（以及重启前会看到什么）

平台的生效契约是硬的（[architecture.md](../../docs/architecture.md) 第 1 节）：
**宿主变更 = 重启，客户端变更 = 刷新**。四层下钻的负载走宿主新路由 `/org`，所以：
刷新页面 → 客户端那份立刻生效；`/org` 要等应用重启才注册。

**客户端那一半确实已经生效，有哈希为证**：`client-hmr` 挂在 `dsh-web-app` 的
cordis.patch.yml 里（是 web 模板的一部分，不是 dev 才有的），它轮询 client bundle 的
mtime+size，变了就调 `clientModules.rebuilt(id)` 并经 SSE 推给浏览器。探一次
`GET /plugins/events` 拿到实时 graph：

    {"id":"dsh-overseas-skills","rev":"a8584259338f", ...}

而 `a8584259338f` 正好等于我当前 `lib/client.js` 的
`framedHash("plugin-artifact", [bundle])`（同一份哈希函数；本包没有 .map，所以只喂 bundle）。
其余未被改动的插件则共享 `e80eda70352191c8-N`——两相对照，说明这条 rev 就是本次改动。

实测过「不重启也能生效」的三条路，都不成立：

| 路子 | 实测 |
| --- | --- |
| profile 的热重载 | `patchReload: "live"` 只**监视两份 patch 文件**，不监视插件代码 |
| cordis HMR | profile 里没有 hmr 行，`cordis.yml` 是 `[]` |
| touch 插件文件 | `touch lib/index.js` 后连续 20 秒探 `/org`，一直 401 |

### 活体状态：这一秒进程里跑的是哪一版（`live-state-probe.mjs`）

上面那张表是**结论**，`live-state-probe.mjs` 是把它变成**每次现算的读数**。它只读（三次 GET + 一次
SSE + 读文件 + stat），退出码即契约：`0` = 新页面在真实进程里可用，`1` = 还不能。

重启前（2026-09-12 14:38 实测，本机 43120）：

```
PASS  宿主进程                91429 启动于 2026/9/12 13:47:15
PASS  装载点内容 = 仓库源         7 个决定行为的文件逐字节一致（重启后加载的就是它们）
PASS  装载点修订时刻             2026/9/12 14:18:24 · inode 254737037
NOTE  装载点 vs 进程启动         磁盘比启动晚 31 分钟 —— 进程里跑的是旧修订
PASS  客户端 bundle = 当前这份   rev a8584259338f == framedHash(client.js) · 刷新即生效
PASS  GET /list           200 · 2.09 MiB
PASS  POST /list（处理器可达性）  405 · {"error":"method not allowed"}
FAIL  GET /org            401 纯文本 unauthorized = 路由不在这个进程里（旧修订），需重启一次
                        → exit 1
```

`GET /org` 那一条之所以能下结论，靠的是**体不是码**：插件自己的 401 是 JSON
（`{"error":"unauthorized"}`，回环检查用），而这里拿到的是 12 字节纯文本 `unauthorized`——那是全局
`/api/*` 兜底发的，说明**根本没有路由接**，而不是「接了但拒绝」。同一台机器上 `POST /list` 答
405 JSON，正好反证处理器是可达的、探测口径没瞎。

红测两条（都不能报绿）：宿主不可达（`DSH_WEB_PORT=1`）→ 4 条 FAIL 且结论行改说「连不上宿主 webServer」；
装载点指向不存在的 profile（`DSH_PROFILE_DIR=/tmp/nope-*`）→ 「装载点」条点名缺哪个目录。

**「profile 副本」到底指哪一份，这里要说死**（`gate.mjs` 的 `profile-files-sync` 有同样的注释）：
DSH 的真实装载点是 `profiles/desktop/node_modules/<包名>`，它是仓库产物的硬链接/同内容副本；
`profiles/desktop/vendor/<包名>` 是**另一份命名不同的副本**，本包那份还停在重构前（无 `org-tree.js`、
无 `/org` 路由、无 manifest）。所以 `node scripts/sync-profile.mjs --check` 会报本包「漂移」——它比的是
**vendor**，与页面行为无关；这条读数不要误读成「装载点旧了」。装载点是否旧，只有本探针第 2 条说了算。

重启之后跑同一条命令，`GET /org` 应转 PASS 并顺带对一遍四层树计数
（`scenarios=8 cards=222 cardsAssigned=209 cardsUnassigned=13 rows=319 roles=50 rolesWithCards=47 presetRoles=50`，
零卡岗位 3 个）——那是「新页面真的活了」的判据，而不是刷新一下看看。

所以本轮把**取不到时的表现**也做成契约的一部分：`/org` 失败不再只留一句「加载中」，
而是退化为原场景分组 + 一行说明（场景 B 的 7 条断言）。用户在任何时刻刷新都不会看到空白页。

## 验收图怎么看

| 文件 | 是什么 |
| --- | --- |
| `acceptance/page-light-firstpaint.png` | **主验收图**：打开设置页看到的第一眼——8 个折叠场景 + 一致性诊断条，一张卡都不铺 |
| `acceptance/page-light-planes.png` | 展开场景 → 4 个面（面是 L1 与岗位之间的那一层） |
| `acceptance/page-light-drilled.png` | 场景 → 面 → 责任域 → 岗位 → 技能卡，39 张真卡（含接线/归位徽标） |
| `acceptance/page-light-diagnostics.png` | 一致性诊断条展开：零卡岗位与未归岗逐个点名 |
| `acceptance/page-light-degraded.png` | 宿主未重启（`/org` 401）时的退化视图：原场景分组 + 一行说明 |
| `acceptance/page-dark-*.png` | 深色主题各一张 |
| `*-top.png` | 上面那几张 6000px 长图的顶部裁剪（1200 / 980 行），只为发送方便。**产地只有 `crop-tops.py` 一处**，出处由 `verify-pages.py` 逐像素复核——聊天里发出的图不能来自任何一版别的页面 |

全部 10 张都受 `verify-pages.py` 约束：图必须比它描绘的代码新（第 0 段），整页图逐像素合格（第 1–5 段），裁切必须出自对应整页图（第 6 段）。三段任意一段红，`exit 1`。

图顶部那行说明条是渲染时加的标注，不是应用 UI 的一部分。

**「含投影 810/802」是口径，不是缺陷**：官方 `.panel` 声明 800px，测量把
`--dsw-elevation-prominent` 的投影算进来了（浅色每侧约 5px，深色约 1px）。
反过来说，投影出现本身就是这条 elevation token 解析成功的证据。
