# 2026-09-16 · Wanzh 状态持久化 fail-closed 与 OAuth flow 单一所有者

关联：[ADR-0099](../../../adr/ADR-0099.md)、[P-02](../../../pitfalls-playbook.md#p-02--仪器假绿)、
[P-07](../../../pitfalls-playbook.md#p-07--一条事实多个家只改了其中一处)

任务来源：`.scratch/review/2026-09-15-product-execution-plan/` 的 `SEC-RT-006` → `SEC-RT-007`（R1-7）。

## Problem

用户指明的是三个点位，实测确认全部成立，**并多出一个同级缺陷**（下表第 4 行）。
证据一律是源码事实加可复现读数，不是推断：

| # | 位置（改动前 `lib/index.js`） | 事实 | 后果 |
|---|---|---|---|
| 1 | `:105-115` `catch {} → DEFAULT_STATE` | `config.json` 解析失败时返回 `{enabled:true}` | **损坏配置静默开启能力**（fail-open）；用户看到一个正常的开关，而配置不可读 |
| 2 | `:120`、`:528`、`:607`、`:725` | 四个 JSON store 直接 `writeFile(最终路径)` | 写中途中断即截断 JSON；`writeFile` 的 `mode` 只在**创建**时生效，既有 0644 永不被收紧 |
| 3 | `:588`、`:687`、`:1471-1481` | `pendingOauth` 记下 `expiresAt` 却**没有任何定时器读它**；连续 start 覆盖变量；注册 12 条路由只 dispose 9 条 | 用户不完成授权则 loopback 端口一直听着；每次点击泄漏一个 listener；插件卸载后 `/oauth/start`、`/oauth/status`、`/mcp-servers` 仍在宿主路由表上 |
| 4（新发现） | `:252`、`:264`、`:270`、`:282`、`:342`、`:353`、`:417`、`:428`、`:436` | **9 处**技能 `.md` 与 JSON 同款直写最终路径 | 同一类缺陷的第二个家。只修 JSON 等于没修（P-07） |

两个注册表 store（`connections.json` / `mcp-servers.json`）的损坏分支各把**内置默认清单**当成用户配置，
而默认清单里 `getnote-brain` 是 `enabled:true`、`shopify` 是 `npx -y`——即「配置不可读」这一状态下，
回退路径会重新打开连接、重新具备拉起外部进程的资格。

（精确起见：`oauth-pixpix.json` 的旧读取是 `catch { return null }`，那本来就是 fail-closed 的——
把它算进「同类 fail-open 修复」是不准确的措辞，独立审证 2026-09-16 纠正。它的问题不是 fail-open，
而是**把「没授权过」与「文件坏了」混成同一个读数**，以及写入口在损坏时会把人关死，见第二轮小节。）

## Decision

1. **写入器收成一家**：新增 `lib/atomic-store.js`，插件内所有落盘（4 个 JSON + 9 处技能文件）只经它。
   提交协议：同目录随机后缀临时文件（`wx`，拒绝跟随被预置的 symlink）→ 写入 → 文件 `fsync` →
   `chmod` 到目标权限 → **在 rename 之前**校验权限位 → `rename` → 目录 `fsync`。
2. **读语义分家**：`readJson` 把「文件不存在」与「内容损坏」报成两种不同的失败；
   损坏时**不改写原文件**（保留取证字节），能力按 fail-closed 关闭，并把结构化 health 交给设置页。
3. **默认清单不再是损坏时的替代品**：损坏时保留卡片元数据但**逐条强制 `enabled:false`**，
   既不重新打开连接，也不拉起子进程。
4. **写入口拒写损坏文件**：`CorruptStateError`（路由层转 409 + 结构化 body），避免用默认值覆盖证据。
5. **OAuth 流程收进单一所有者**：新增 `lib/oauth-flow.js`。`adopt()` 先关闭上一个（`superseded`）、
   到期定时器 `unref()` 并在超时后关端口清状态、成功/拒绝/异常/超时/卸载共用一个**幂等** `close(reason)`、
   `dispose()` 后拒绝新建；回调只认**自己那条 flow** 的 `state`/`verifier`/`redirectUri`。
6. **注册与回收由同一份清单驱动**：把三条漏掉的路由补进 disposer，卸载时同时 `registry.dispose()`。

## Alternatives considered

- **直接依赖宿主的 `@deepseek-ai/dsh-atomic-write`**：它有同形的 `writeFileAtomic`（并额外提供跨进程
  `withFileLock`），但**明确把 fsync 排除在外**（"Crash durability (fsync) is out of scope"），而本卡要求
  文件与目录 fsync；且它不在本包运行期依赖里，引入会给插件加一条随包出货的依赖。
  结论：复用它的**设计**（同目录随机后缀 + `wx` + rename 携带 mode），补 fsync 与 JSON 健康语义。
- **先 rename 再校验权限**：只能事后报警，宽权限文件已经在最终路径上了。改为 rename 前校验，
  失败方向是「不落盘」。
- **损坏时把文件改名归档再写新配置**：会给「原字节仍可取证」引入一个会失败的额外步骤，
  而且自动"修好"用户的配置本身可疑。改为**不碰**，把修复权与可见性交回用户。
- **重复 start 返回 409**：卡片给了这个选项。选「关闭旧 flow 后新建」，因为用户重复点击的
  真实意图几乎总是"上一次卡住了，再来一次"，返回 409 会逼他先理解一个内部状态。
- **state 不匹配时关闭当前 flow**：会让一个过期标签页的回调打断用户正在进行的授权（本机回环下
  这是可触发的自伤路径）。改为 400 且**保留** flow，由到期定时器收尾。
- **给状态文件加 `_corrupt` 标记或迁移旧 schema**：属于"有明确规则的兼容读取"，本轮没有证据表明
  存在需要兼容的旧 schema 变体，不做投机实现。

## Consequences

- **行为变更（显式记录）**：`config.json` 损坏时能力**从开启变为关闭**；`connections.json` /
  `mcp-servers.json` 损坏时条目**从默认清单变为逐条关闭**。「文件不存在」仍用内置默认值——
  这两件事的语义差别写进了代码注释与测试名，不再混成一个 `catch`。
- **未验证**：客户端渲染未改。`/list`、`/mcp-servers`、`/oauth/status` 现在多返回 `health` / `flow`
  字段，`lib/client.js` 尚未消费它们（需要重启 app 才能取得一次真实页面证据，本轮不写没跑到过的分支，P-04）。
- **进程内 vs 跨进程**：串行队列只覆盖同进程的读-改-写。跨进程互斥（`withFileLock` 形态）不在本卡范围，
  也没有证据表明同一台机器上有第二个写者；这是一条**已知边界**，不是已解决项。
- **断电安全未被进程级测试证明**：目录 fsync 的断裂只有真实崩溃才能观测，测试只做了显式标注射程的
  结构性断言（提交顺序 file-sync → rename → dir-sync）。macOS/APFS 支持目录 fsync 已实测。
- **初版自评有一处说错了**（独立审证纠正）：我写过「`closeAllConnections` 是否释放端口没有进程级判别力」。
  窄读是对的（**新连接**是否被拒不受影响），但**既存连接是否被断开有**——去掉它以后，真实 loopback 用例
  以 `waitFor` 超时变红。判断力落在「连接有没有被断开」上，不在「端口还能不能被连上」。
- 装载点（`~/.dsh/profiles/desktop/node_modules/dsh-wanzh-hulian`）已按 tmp+mv 同步并逐字节复核；
  **运行中的 DSH 仍跑旧字节，需用户重启后生效**。

## 第二轮：独立审证的发现与修订（同日）

按仓库纪律，R2 级改动不能只有作者验证。与实现上下文分离的独立审证复现了全部 Red/Green 读数与三条自选变异、
哈希取证前后一致，结论为「有条件放行」，并给出 4 条 Important。**这些是真的，已全部修复**：

| 审证发现 | 事实 | 修法 |
|---|---|---|
| I-1 损坏的 token 文件把「重新授权」变成不可恢复 | `writeOauthToken` 拒绝写入 → 回调里 `assertWritable` 抛错 → 回调**没有错误边界**，`res.end` 与 `flow.close` 一起被跳过（浏览器空白页 + listener 留到 TTL），而重新授权是唯一能修好该文件的操作 | 回调加 `try/catch/finally`（`finally` 无条件 `flow.close`）＋ token 文件走「归档后重写」：原字节改名 `<file>.corrupt-<ts>`（0600）留证，再写新 token |
| I-2 「损坏 → fail-closed」只覆盖不可解析的字节 | `null` / `[]` / `123` / `"str"` 这些**可解析**的形状被读成 `enabled:true`（工具照常发请求），而同一文件在 `/toggle` 上返回 409——读路径用真值判断、写路径用 `isPlainObject`，**两把尺子**；`connections.json` 的 `{}` 不进 schema 分支，回退到 `enabled:true` 的默认清单 | 谓词从 store **导出后共用**（`isPlainObject`）；四个 store 统一「形状不对 = 损坏」；`connections: []`（形状正确但为空）单列为「没坏、逐条关闭、保留恢复入口」 |
| I-3 `/oauth/status` 是唯一没有错误边界的路由（本次改动还给它加了会抛的读路径） | token 文件是目录时该请求**悬挂**（`EISDIR`）；改前这条路由不可能抛——是本次引入的回归 | 新增 `readStoreJson`：任何 I/O 失败降级成健康读数（`*_unreadable`），读失败不再炸调用方；该路由补 `catch → sendError` |
| I-4 「所有写入口在同一条链上」不成立 | 只有 `updateJson` 在链上；`/toggle` 与 `/mcp-servers` POST 是先读后写，两个并发请求**都返回 200 而磁盘只落一条**（实测 LOST UPDATE） | 新增 `runExclusive` 排他槽位与 `mutateConnections` / `mutateMcpServers`；toggle 在**一个槽位内**先查两份清单健康度再落盘（顺带消掉「报错但已改一半」）；技能 flag 的读-改-写也进槽位；队列**重入即报错**（挂死没有读数） |

另有 4 条 Minor 一并修掉：token 损坏时的 `excerpt` 会回显 access_token（改为整段不回显）；`gate()` 的指引
指向尚不存在的界面（改为「修复或删除 <路径> 后重试」）；`persistence-inventory.spec.mjs` 依赖 cwd（改用 `import.meta.url`）；
`oauth-routes.spec.mjs` 注释里的 11/8 与断言的 12/9 不一致。第 5 条 Minor（这些 spec 不在 `pnpm run gate` 射程内）
按本仓「知道 → 拦住」的纪律处理：新增门禁项 `wanzh-persistence-and-oauth` 收编 6 个 spec，
并以**恒真桩突变**证明它有用（注入一条必失败用例后 gate 转红并点名该用例）。

修订后读数：包内 **76 tests / 76 pass / 0 fail**、`tsc` exit 0；根门禁 quick **70 项（69 pass / 1 skip / 0 fail）**、
full **77 项（76 pass / 1 skip / 0 fail）**，两者 exit 0。新增的 6 类变异（形状判定、schema 判定、排他槽位、
全或无、不回显、读失败降级）各自都有具名用例变红；一次写坏的变异脚本（引号冲突导致变异未注入）也被识别并重做，
没有当成「变异 3 没变红」记下来。

**仍未解决**（审证也确认过）：跨进程互斥；真实 OAuth 回调的端到端复现（需要真实 tokenEndpoint）；
客户端渲染 `health`；宿主对未处理 rejection 的策略（审证未定位到 `ctx.webServer` 的派发实现，不下结论）。
