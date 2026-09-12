---
title: dsh-worktable 融合（安装 · 安全收敛 · 「新应用」启动器）
status: in-progress
test_seam: ① curl 对 8 条路由的负向探针 ✅ 已交付（`pnpm run accept:worktable-fence`，31/31，含 16 条变异负向 + 13 条正控）② pnpm run gate 退出码 ✅ **19/19（full），exit 0**（第 8 轮新增 `node-interpreter` 一项）③ 侧边栏几何 ✅ 真 Chrome 18/18（`probe:geometry`）+ 真 React 协调 ✅ 29/29（`probe:reconcile`）④ 运行中实例的装载确认 ✅ 2026-09-12 09:41 重启后关闭：`finalStage=health-commit`／`rendererStatus=healthy`（无白屏）、`/api/worktable/health` 200 且同时 `/api/nope-xyz` 仍 401（ADR-0030 前提成为活读数）、四类栅栏 reason 与允许根约束均实测 403、越根写入文件未创建 ⑤ 侧边栏「新应用」的**可见几何**在活实例里 ✅ 已由 ③ 的真 Chrome 探针覆盖 ⑥ 第三期语义 Token ✅ `accept:theme-tokens` exit 0（30/30 两态解析、54 引用零分歧）⑦ `accept:newapp-products` ⏳ **exit 3**（阶段 A–C 20/20，阶段 D 两项待宿主重启：`live-products` 401、`live-fence` 400——产物在阶段 B 答 403，故实况跑的是旧产物）
---

# dsh-worktable 融合 产品规格

> 决策来源：2026-09-12 会话（深度剖析 → 多维融合对比 → 用户确认）。本规格是执行契约；
> 事实家仍在 `docs/notes/`（决策记录）与 `docs/adr/`。
>
> **这份融合的决策不在单个 ADR 里**，而是按主题各占一篇（ADR 编号是全局顺序、被并行工作
> 共同消耗，故不连续）：[ADR-0028](../../docs/adr/ADR-0028.md)（启动器只拥有连接）、
> [ADR-0029](../../docs/adr/ADR-0029.md)（Token 判据两侧证伪）、
> [ADR-0030](../../docs/adr/ADR-0030.md)（逐插件补来源栅栏）、
> [ADR-0032](../../docs/adr/ADR-0032.md)（跨框架注入的「未挂载」表示）、
> [ADR-0033](../../docs/adr/ADR-0033.md)（Native Agent 产品形态）、
> [ADR-0038](../../docs/adr/ADR-0038.md)（栅栏判据是拒绝而非抛）、
> [ADR-0039](../../docs/adr/ADR-0039.md)（语义 Token 三条法则）、
> [ADR-0040](../../docs/adr/ADR-0040.md)（子进程解释器必须是真 node）。
> 早期版本的本行写作「ADR-0025」——那篇讲的是 `webServer.register` 只收一条路由，
> 是融合路上的**前置发现**而非融合决策，已于第 8 轮更正。

## Problem Statement

上游第三方插件 `dsh-worktable`（Aisland-SJL，v0.3.3，sha `2f4f6c8`）提供「侧边栏 agent 级项目容器（应用抽屉）」能力，
但它的**服务端 8 条路由 + 1 条 WebSocket 升级路由全部不校验来源**，且 `file/site/write/mkdir` 不做根约束。
实测缺口（读 `src/index.ts` 468 行全文取证）：

| 路由 | 方法 | 缺口 | 后果 |
| --- | --- | --- | --- |
| `/api/worktable/file` | GET | `pathResolve(p)` 任意绝对路径，无根约束 | **任意文件读取**；且按扩展名回 `text/html` → 本机 origin 上的存储型 XSS |
| `/api/worktable/site` | prefix | 根 token 由请求方给（可为 `/`） | 同上，目录级 |
| `/api/worktable/write` | POST | 任意路径 + 任意内容，`writeFile` 会创建 | **任意文件写入** → 写 `~/.zshrc`/LaunchAgent 即 RCE |
| `/api/worktable/mkdir` | POST | 任意路径（仅要求父目录存在） | 任意目录创建 |
| `/api/worktable/fs` | POST | 任意目录列举 | 任意目录枚举 |
| `/api/worktable/git` | POST | `cwd` 来自请求体 | 任意仓库状态读取 |
| `/api/worktable/workspaces` | GET | 读 `workspace.json` | 本地数据读取 |
| `/api/worktable/term` | **WS upgrade** | 无 `Origin` 校验 | **浏览器不对 WebSocket 施加同源策略** → 任意网页可开 `ws://127.0.0.1:<port>/api/worktable/term` 拿到交互式 shell |

「本机插件所以安全」的假设不成立：DSH webserver 监听回环，但**回环不等于可信**——
DNS rebinding 绕过 Host 判据，跨站请求带 `Sec-Fetch-Site: cross-site`，WS 升级带外来 `Origin`。

产品侧诉求（用户原话）：把「新会话」按钮缩小一半，另一半放本插件的按钮、更名「新应用」，平行对齐放置；
底部区块移除；UI 与本机品牌一致。

## Solution

三期推进，**每期独立可验收、可回滚**。

### 落位表

| 组成 | 落点 | 理由 |
| --- | --- | --- |
| worktable 本体 | `vendor/dsh-worktable/`（嵌套仓，源码不入库）+ `vendor/dsh-worktable.pin` 锁 sha | 上游第三方，非受管包；与 `vendor/dsh-desktop` 同构（ADR-0008 先例） |
| 栅栏补丁 | `dsh-patches/worktable-fence/`（`.patch` + `apply.mjs`），manifest 登记 | 补丁是**本仓库的产物**，须可重放、可回滚、可门禁 |
| 桥接插件 | `packages/surfaces/dsh-newapp-local/` | 受管包（带 `luteOrigin`/`luteOwner`/`lutePublish` 三字段，ADR-0010/0011） |
| 安装 | profile `dependencies` + `dsh.profile.bundles` 双条目 | 官方安装面；已探明防白屏三要件齐备 |

### 第一期 · 安装 + 信任栅栏（栅栏已交付并实测；装载确认待重启）

> **阶段成果（2026-09-12，第 4 轮）**：栅栏 + 三层判据已入库，决策见 ADR-0030 与其 Note。
> 关键取证：DSH 自己的 `/api` 栅栏挂在**前缀**上，而 `match()` **exact 优先**——
> 插件注册的 `/api/worktable/*` 会**压过**平台栅栏，因此本栅栏是**唯一防线**（实测阶段 C）。
> 变异测试：喂未打栅栏的上游原文给同一套探针，16 条负向**全部转红**（读到 `/etc/passwd`、
> 越根写入成功、跨源 WS 升级 101）。装载确认仍需重启，判据见 C4。


1. clone 到 `vendor/dsh-worktable`，写 pin（`upstream-sha` / `upstream-tag`）。
2. 补丁 `apply.mjs`（幂等、可重放）在 `lib/index.js` 注入：
   - 全部 HTTP 路由前置 `isLoopbackRequest`（socket 回环 + Host 回环 + `sec-fetch-site !== 'cross-site'` + `Origin === Host`）；
   - WS 升级握手同样过栅栏（**另加**：`sec-websocket-protocol` 不参与鉴权，只看 Origin/Host）；
   - `file`/`write`/`mkdir`/`site` 增**允许根**判据：解析后必须落在允许根内（默认 = DSH 家目录 + 会话 cwd），否则 403。
3. profile 双条目登记 → `pnpm install` → 重启 → 验 `startup.jsonl` 末行 `finalStage: health-commit`。
4. **验收 = 真实 curl 负向探针**（见 test_seam ①），每条必须有输出。

### 第 5 轮（2026-09-12）· 真 React 探针与它测出的缺陷

几何验证件 `probe:geometry` 在真 Chrome 里 18/18 通过，但它的 fixture 是**静态 HTML**：
页面里没有 React，就没有重渲染，也就没有位移——而共享核心的自愈逻辑**只对重渲染有意义**。
补上真 React 环境的 `probe:reconcile` 后，第一次跑就测出一个**真缺陷**：

`sidebarRoot()` 声明 `HTMLElement | undefined`，实现却 `?? column.firstElementChild`
（类型是 `Element | null`），而本模块**五个调用点全部只判 `undefined`**——`null` 一种判据
都通不过、又一种都没被拦住。触发态是「侧边栏面板存在但暂时为空」（整面板拆除与重建之间
的那一帧）。实测后果不是「控制台多了条错误」：卡住的值就是 `null`，于是后续每个 mutation
批次都在同一判据上再抛一次，**入口行在整面板重建 + 五次重渲染后仍不回来**（7 次未捕获
异常），只有整页刷新能恢复。

修法是把类型谎言改掉（归一化 `undefined`），不是五个调用点各补一次双判。
决策见 [ADR-0032](../../../docs/adr/ADR-0032.md) 与其 Note。三处验收读数：

| 验证件 | 读数 |
| --- | --- |
| `probe:reconcile`（真 React 18.3.1 + shipped bundle 结构） | 29/29，exit 0；变异喂未修核心 → 23/26，exit 1 |
| `probe:geometry`（真 Chrome，官方样式表逐字提取） | 18/18，exit 0 |
| vitest（newapp 64 / role-matrix 56 / skill-center 74） | 全绿；新回归用例单体变异 → exit 1 |

### 第 5 轮续（重启后的实况验收 → 测出一个真缺陷）

用户重启后目视确认并排成立，但报告**抽屉里只有岗位、没有工作台项目**。定位结果：这是**本包
自己的设计错误**，不是工作台的问题。

`localStorage['dsh.worktable.projects.v1']` **不是**项目列表，只是**覆盖层**（order /
nameOverrides / hidden / removed / lastUsed），而 `order` 在用户没手动拖过卡片时就是 `[]`。
工作台自己是在 `fetchSessionGroups()` 里读 `GET /api/worktable/workspaces` 的
（`global.workspaceIds` + `tables.workspaces[id].title`）。本包把覆盖层当成了列表，于是
一台**有 11 个工作区**的机器读出 0 个项目——与 ADR-0028 的取证不完整精确对应。

修法：项目列表改读工作台自己的路由，覆盖层只用于改名 / 隐藏 / 移除 / 最近使用，
优先级复刻工作台自己的 `nameOverrides[id] ?? title ?? id`。
实况复算（真 payload 喂进 `buildMatrix`）：**agents 50 / projects 11**，
标题 `paper_to_skills | member01 | sikong | alice | KOL-Hunter | red-main …`（修前 projects=0）。

事实更正落在它的家：`docs/adr/ADR-0028.md` 与其 Note 的取证表都加了更正块。
可复用的教训：**「这个键存在」不等于「这个键是那份事实」**——定位事实之家要读那个面
**自己怎么取数**，而不是找长得像的常量名。契约测试补了一条否定式用例：覆盖层为空时，
项目列表必须仍然完整。

同轮另修：`vendor/dsh-worktable.pin` 原写 `file:`，实际安装是 `link:`——`file:` 在 profile
里落成**硬链接实体副本**，于是「patched 的 vendor 产物」与「运行时装载的那一份」是两份可
各自漂移的文件，往 vendor 补打栅栏不会进副本。门禁 ⑤ 因此从「同一份**内容**」加严为
「同一份**文件**」（realpath 必须落在 vendor 树内），并加一条自检用例。

### 第二期 · 「新应用」启动器

**几何事实（已从官方 bundle 逐字取证，非推测）**：

```
.x-Wl6W_root{--dsh-sidebar-inline-padding:12px;padding:6px var(...);flex-direction:column;display:flex}
.x-Wl6W_root.x-Wl6W_collapsed{padding:18px 10px 6px}
.x-Wl6W_logoRow{height:60px;margin-bottom:8px;justify-content:flex-end;gap:8px;padding:8px 0 8px 4px;display:flex}
.x-Wl6W_collapsed .x-Wl6W_logoRow{justify-content:flex-start;height:36px;margin-bottom:12px;padding:0}
.x-Wl6W_newSession{flex:none;height:38px;margin:0 2px 8px;padding:8px 16px;border-radius:12px;display:flex}
.x-Wl6W_collapsed .x-Wl6W_newSession{align-self:flex-start;width:36px;height:36px;margin:0 0 12px;padding:0;gap:0}
```

渲染树（`dsh-client-ui-sidebar/lib/client.js` 实测）：`root > [ logoRow, Tooltip>button.newSession, regionArea, footArea ]`。
**`newSession` 是 `root` 的直接 flex 子元素**（列方向），因此「并排」= 给两键各半宽 + 把第二键用负 margin 提回同一视觉带。

**锚点（ADR-0019 合规）**：官方在自己的 `<style>` 上写
`data-plugin="@deepseek-ai/dsh-client-ui-sidebar"` + `data-plugin-css="@deepseek-ai/dsh-client-ui-sidebar/SidebarRoot.module.css"`。
本插件在**运行时**从该 style 的 textContent 解析出类名哈希前缀（当前为 `x-Wl6W_`），**绝不把哈希写进产品代码**。
解析失败 → `dataset.dshNewappAnchors = 'degraded:<缺失锚点>'` + 降级为普通全宽行（family 现有模式）。

**几何方案**：
- 展开态：官方与自建各 `flex: 0 0 calc(50% - 3px)`，同处一行；标签 `新会话` | `新应用`。
- 收起态：root 内容宽 = 56 − 2×10 = **36px**；两键并排 → 各 16–18px，图标随之下调。
  提升量由 `getBoundingClientRect()` **运行时算出**（`--dsh-newapp-lift`），不写 `-46px` 之类魔数。
- 自愈：沿用 family core 的 MutationObserver；尺寸由 ResizeObserver 重算（侧栏拖宽后不错位）。

**抽屉**：`<dialog>` + `showModal()` 顶层渲染（先例：`dsh-role-matrix-local` 的抽屉——本机 z-index 已被占到 2147483000，普通 z-index 必输）。
上区 = Agent 应用卡；下区 = worktable 项目 / 控制室 / 布局预设。worktable 的 `localStorage`（`dsh.worktable.projects.v1` / `dsh.worktable.view.v1`）**只读**。

### 第三期 · 品牌一致性

语义 Token（`--dsw-alias-*`）替换硬色值；LUTE 品牌绿 `#58B848` 作品牌色而非主题色；字号行高成对；
focus-visible / reduced-motion 对齐官方；浅色深色双主题回归。

> **阶段成果（2026-09-12，第 7 轮）**：抽屉样式表的 **47 处硬色值收敛为 11 个品牌字面量**，
> 且 11 处字面量只住在一个声明块里；`newapp` 引用的 **30 个 token 在真实引擎两态全部解析成功**
> （`accept:theme-tokens` 退出码 **1 → 0**）。决策见 [ADR-0039](../../docs/adr/ADR-0039.md)
> 与其 Note。三条法则：**只引用官方已声明的名字**、**兜底字面量 = 实测浅色读数**、
> **品牌色不是主题色**。
>
> 同轮修掉了**门禁自己**的两个假红来源（实测：`code: 0 / whole-file: 2`）：收集器把
> **注释里的名字**和**供给方自己的映射键**都当成了「引用」，于是「写一句『别再用 `--dsw-x`』」
> 会让 `--dsw-x` 重新变成必须存在的 token——与 ADR-0015 的留痕纪律直接冲突。改为**先剥注释、
> 只认 `var()`**。收紧后的真实性由两条用例守住：注释/定义不算引用，**且**真引用仍被抓
> （基线上那 8 条违规在收紧前后一条不少）。
>
> 三条读数是改之前必须量的，量出来都跟「照直觉改」相反：
>
> | 直觉 | 实测 | 后果 |
> | --- | --- | --- |
> | `--dsw-font-mono` 存在（主题插件里有） | 两态都是 `rgba(0,0,0,0)`，**页面拿不到** | 换官方声明的 `--ds-font-family-code` |
> | 基线开的药方 `bg-layer-2` 能修 `role-matrix` | 浅色读数 `#fff`，**与卡面同色** | 改 `bg-module-platform`（`#f5f6f7`/`#353638`），把「深色没底色」换成真修好 |
> | 平台没有「实底上的文字」token（上一版注释如此断言） | `--dsw-alias-label-primary-foreground` 与 `--dsw-alias-button-primary-fill` 成对出现在两个官方包里 | `.primary` 换成官方实底主按钮 |
>
> | 验证件 | 读数 |
> | --- | --- |
> | `pnpm run accept:theme-tokens` | exit 0；30/30 解析；54 个引用 token 零分歧 |
> | `vitest tests/stylesheet.spec.ts` | 9/9；3 个变异体转红 |
> | `node --test scripts/gate.test.mjs` | 6/6（含 2 条收集器用例） |
> | `pnpm run gate:full` | 18/18，exit 0 |
> | 门禁基线 | 8 → 7 条 |
> | `probe:geometry`（真 Chrome，官方样式表逐字提取） | 18/18——含「字号与官方一致 14px / 圆角一致 12px」，证明改简写没挪动几何 |
> | `pnpm run accept:newapp-products` | 19/20（阶段 D 的 `live-fence` 待重启复核，见下） |
>
> 同轮还修掉探针自己的一个**竞态**：`--child-scan` 子进程 `stdout.write` 后紧跟
> `process.exit(0)`，而管道上的 stdout 是异步写——exit 截断未落地的写，父进程看到
> 「退出码 0 + stdout 空」，记成「(无响应)」，与「子进程崩溃」不可区分。直接跑（TTY）
> 永远打不出来这个症状，所以它一直潜伏到本轮才偶发。修法：写 RESULT 等回调再 exit，
> 且拿不到 RESULT 时必须带出子进程的退出码与 stdout/stderr 尾巴。5 次连跑不复现。
>
> ⚠️ **上述诊断在第 8 轮被推翻**（保留原文以免抹掉判断轨迹）：「写后等回调」这个改动
> 本身是对的（异步写确实要等落地），但它**不是**主因——同一症状在第 8 轮继续复现。
> 真因是**解释器不是 node**：`process.execPath` 在 pnpm 下是宿主 Electron 可执行文件，
> 拿它跑子脚本会「退出码 0 且没有任何输出」。而「5 次连跑不复现」之所以得出，是因为
> 那 5 次是直接跑 `node`，**恰好绕开了唯一能复现它的调用方式（`pnpm run`）**。
> 详见第 8 轮与 [ADR-0040](../../docs/adr/ADR-0040.md)。
>
> **开放项（未做，不并入「完成」）**：
> 1. `dsh-role-matrix-local` 与 `dsh-skill-center-local` 各尚有约 **115 处硬色值**——
>    它们是前几期的存量，不在第三期的融合范围内；第 7 轮只清了基线指名的那一处。
>    留给下一轮或独立规格。
> 2. `packages/infra/dsh-team-hub/src/service-{launchd,systemd}.mjs` 把 `process.execPath`
>    当**默认参数**写进 plist/unit 文件——同 ADR-0040 的根因、另一种形态（pnpm 下生成的
>    服务描述会指向 Electron 二进制）。修法是「调用方必须显式传 node」，属另一个决定，
>    第 8 轮**明确未修**。

### 第 8 轮（2026-09-12）· 探针的解释器不是 node：一个「退出码 0 却没有输出」的 bug 活过了四轮

第 7 轮把 `default-scans-nothing` 的偶发失败记成了「竞态」，并宣布「5 次连跑不复现」。
第 8 轮一开工它就又红了，而且这次带着完整的遗言：

```
✗ default-scans-nothing  期望 200，实得 (无响应) （冷进程没有交出 RESULT：exit 0，stdout (空)，stderr (空)）
```

两条命令就定位了真因（`scripts/gates/node-interpreter.mjs` 的判据注释里逐字记着）：

```
$ node      -e 'console.log(process.execPath)'   # /opt/homebrew/.../bin/node
$ pnpm exec node -e 'console.log(process.execPath)'   # /Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop
$ pnpm exec node -e 'execFileSync(process.execPath, ["-e","console.log(1)"])'   # stdout = "" ← 退出码 0、无输出、不报错
```

pnpm 生命周期下整条链是**宿主 Electron 以 `ELECTRON_RUN_AS_NODE` 身份**跑的，故
`process.execPath` 是 Electron；拿它执行子脚本，Electron 再开一个 app 实例，单实例锁让
它把 argv 交给主实例后**立刻以 0 退出**——父进程看到的正是「exit 0 + stdout 空 + stderr 空」，
与「子探针什么都没说就正常结束了」一模一样。

**它不是把探针变红，而是把它变成一句没有信息量的话。** 同一根因此前已被各自就地绕过
**三次**（`gate.test.mjs`、`dsh-agent-team-gui-local` 的 quality helper、`dsh-team-hub` 的
typecheck），每次都是一处私有的 `which node`；第四次没人接。

| 验证件 | 读数 |
| --- | --- |
| `accept:newapp-products` 的 `default-scans-nothing`（`pnpm run` 下） | **3/3 通过**（修复前偶发失败，且只在 pnpm 下复现） |
| 阶段 A 仪器自检 | 3 → **4** 条；新增 `node-interpreter`，判据是**子进程有没有输出**而非退出码 |
| `accept:newapp-products` 退出码 | `1` → **`3`**（三态：0 全绿 / 1 真失败 / 3 阶段 D 待宿主重启） |
| 夹具泄漏（`/var/folders/**/T/newapp-live-*`） | 实测泄漏 **23 个** → 修复后连跑 3 次为 **0**（`process.exit()` **不执行 `finally`**） |
| 门禁新增项 `node-interpreter` | 覆盖 **82 个开发脚本**；修掉 **3 处真实违规** |
| `pnpm run gate:full` | **19/19，exit 0** |
| `pnpm run test:gate` | **83/83**（`node-interpreter` 自检 9 条；`test:gate` 由硬编码清单改为 glob） |

**「门禁把不是代码的东西当代码读」当天出现三次**，形态各不相同，故把「剥注释」的家从
`theme-tokens` 的私有函数提升为 `scripts/lib/strip-comments.mjs`：

| # | 被误读成代码的东西 | 后果 |
| --- | --- | --- |
| 1 | `theme-tokens`：注释里写的 token 名 | 写「别再用 `--dsw-x`」= 让 `--dsw-x` 变成必须存在的 token |
| 2 | `node-interpreter`：**它自己 JSDoc 里**举的反例 | 解释禁令的文档成了违反禁令的代码 |
| 3 | `node-interpreter`：**它自己测试夹具里的字符串** | 为证明判据能红而写的夹具，让判据对真实仓库报红 |

第 3 条对任何「用模式匹配找违规」的门禁都成立：测试夹具**必然**要把「违规长什么样」
写成字符串。故 `blankStringsAndComments`（新，给判据模式会出现在夹具里的）与
`blankComments`（给 `theme-tokens`——它的判据依赖字符串里的 token 名，一起剥会失效）
同住一个家，各写清谁用哪个。

## Alternatives considered

- **A. 直接改 worktable 源码并提交到本仓库**：否决——上游第三方，源代码进本仓库违 ADR-0010/0012 的归属契约，且上游发版无法合并。
- **B. 不装 worktable，用本仓库自建等价能力**：否决——重写成本远超收益；且「应用抽屉」是它的核心差异化，重复造轮子违 ADR-0009。
- **C. 把栅栏做在 DSH webserver 层（全局）**：暂不采纳——改基座违 ADR-0008「基座只 pin 不改」；正确的长期形态是上游或本仓库的**另一条独立轨道**，不在本规格范围。
- **D. 移动官方 `newSession` 节点进自建 wrapper 以并排**：否决——搬动 React 拥有的节点会让 reconciliation 失配；只改宽度/负 margin 不碰节点身份。
- **E. 用普通 `z-index` 抽屉**：否决——本机已有插件占用 2147483000，实测被盖（role-matrix 的事故记录）。

## Consequences

**得到**：worktable 的 9 条入口全部过信任栅栏；「新应用」与官方「新会话」等权并排；抽屉承载应用矩阵；上游升级路径保持（补丁可重放）。
**代价**：① 栅栏是**补丁**不是上游行为，上游每次发版需重锚（`apply.mjs` 幂等 + 失败即拒，`vendor/dsh-worktable.pin` 未 bump 前不升级）；
② 收起态 36px 内容宽放两键，单键 16–18px 已接近触控下限——这是几何硬约束，不是设计取舍；
③ 底部区块若运行时隐藏，其**写操作**（绑定对话 / 图标选择 / 排序）不能由桥接层重建，须保留出口。
**回滚**：profile 两处删条目 → `pnpm install` → 重启；桥接插件独立卸载即恢复官方侧栏原貌。

## 开放决策（第二期开工前定）

- **D-A 包名**：`dsh-newapp-local`（默认） vs `dsh-worktable-shell-local`。
- **D-B 底部区块**：运行时隐藏 + 抽屉重建只读视图（贴「完全移除」原意，但失去写入口）
  vs 保留但默认收起（保住写入口，未满足「移除」）。**判定方法**：第二期先实测底部区块到底承载哪些写操作，
  有写操作则取后者并在抽屉里保留「打开原生工作台」出口。
