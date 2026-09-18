# 2026-09-16 · 请求体读取收成有界契约，并修掉吞掉错误的三处 `try` 内 `return`

关联：[ADR-0100](../../../adr/ADR-0100.md)、[P-24](../../../pitfalls-playbook.md#p-24--files-清单漏掉运行时被-import-的文件而缺失被门禁当-note-跳过)、
[P-33](../../../pitfalls-playbook.md#p-33--try-里-return-promise-不-await拒绝逃出-catch变成永远没有响应)

任务来源：`.scratch/review/2026-09-15-product-execution-plan/` 的 `SEC-RT-005`（R1-6）。

## Problem

卡面要求「阻止 Wanzh/Team Hub 无限累积请求体」。实测确认两处都没有上限，
并且**宿主不会兜底**——`DesktopWebServer.register`（`app.asar.unpacked/lib/webserver.js`）
只做浏览器访问许可判定，对请求体零限制。所以这是真实漏洞，不是纵深防御。

| # | 位置（改动前） | 事实 | 后果 |
|---|---|---|---|
| 1 | `dsh-wanzh-hulian/lib/index.js:113-123` `readBody` | `req.on("data", c => chunks.push(c))`，无上限、无 deadline | 一条 loopback 连接即可推高宿主 RSS；7 条读 body 的路由全部受影响 |
| 2 | `dsh-team-hub/src/server.mjs:46-50` `collect` | `for await (const chunk of req) chunks.push(chunk)`，无上限、无 deadline | 网关面向局域网多用户，一条已登录连接吃满内存＝全团队断服；6 个调用点全部受影响 |
| 3（新发现） | 同文件 `:410`、`:404`、`:411` | `try` 块内写的是 `return handleApiPost(...)` / `return handleAdminApi(...)` / `return proxyRequest(...)`，**不是 `return await ...`** | 三条主数据通路的任何异常都不会被本函数的 `catch` 接住：请求进了处理器、**却永远没有响应**，同时冒出一个未处理拒绝。这不是本卡引入的，是既有缺陷 |

第 3 条是在做第 1、2 条时被自己的测试逼出来的：代理面超限用例拿不到任何响应，
插桩显示请求已进入处理器、`readBoundedBody` 也已正确拒绝，于是问题不在新代码而在错误传播路径。

## Decision

1. **上限、deadline、错误语义收成一份契约**，两个包各自实现（结构约束见 ADR-0100 备选方案）：
   `BODY_TOO_LARGE`/413、`BODY_TIMEOUT`/408、`BODY_ABORTED`/400、`BODY_PARSE_ERROR`/400，
   错误文本只含上限数值，**不回显原文**。`Content-Length` 只用于提前拒绝，放行一律以实际字节为准。
2. **上限按「面」分档**：wanzh 7 条路由统一 64 KiB；team-hub 透传面（代理 + `/api/*`）32 MiB、
   登录/改密表单 8 KiB、admin 控制台 64 KiB。32 MiB 由实测推导——Desktop profile 实际挂载
   `dsh-file-upload`，其 `MAX_JSON_BYTES = 18 MiB`，留 ~1.8× 余量，低于它会打断文件上传。
3. **三处 `return` 改为 `return await`**，让 `catch` 真正生效。
4. **`createRequestHandler` 从 `startServer()` 中提取**，成为可测的缝。`startServer()` 不返回
   server 句柄且 listen 后不返回，测试起它会让进程挂住；不提取就只能静态扫源码，
   而那正是「写了但从没跑到」（P-04）。

## Alternatives considered

- **复用 `shared/host/http.ts`**：被结构否决。它是 `.ts`，只对「有 `src/` 且有构建步」的包生效；
  wanzh 是无构建步纯 JS 包（`main` 直指 `lib/index.js`），team-hub 直接跑 `src/*.mjs`，
  运行时都导入不了 `.ts`。强行复用需要给 wanzh 引构建步或重排 `sync-shared` 消费面，
  属跨模块架构改动。代价显式接受：**两份实现**，由两侧同一组用例守住。
- **给 team-hub 只加保守上限（如 1 MiB）**：会打断文件上传等真实业务，属于「为安全打断产品」。拒绝。
- **代理面改流式转发**：更优，能消除缓冲峰值，但需改 `fetch` 的 `duplex` 语义与中途失败收尾，
  超出本卡（估算 S）范围，登记为后续项。
- **补「声明 10 字节却发 500 字节」的用例**：实测**不可表达**——Node 把 `Content-Length` 当帧边界，
  多出的字节被当成下一个管线请求，拿到的是解析层 400（初版用例正是这么写错的，见 CHANGELOG 更正）。
  不写假用例，改测两个真实对抗形态：分块传输、多小块累计超限。

## Consequences

- 两处 HTTP 面不再由请求体大小决定内存；超限请求不进入业务 handler、不写配置（有断言）。
- **新增测试 25 条**（wanzh 10 + team-hub 15），全部走真实 socket 与真请求处理器。
- **变异自测 3/3 判红**：把三处 `return await` 分别改回 `return`，对应用例全部失败。
  这一步抓到了初版的问题——我最初只写了「代理面超限」一条用例，而它走的是 `handleApiPost`，
  **根本没在守 `proxyRequest`**；补齐后才做到三处修复各有会响的仪器。
- **同批修掉一个 P-24 复发**：`dsh-wanzh-hulian` 的 `files` 清单漏了
  `lib/atomic-store.js` 与 `lib/oauth-flow.js`（上一批 SEC-RT-006/007 新增，`lib/index.js` 正在 import 它们）。
  `npm pack --dry-run` 实测只打 8 个文件、两者均不在内。装载点当时有这两个文件（手工补齐），
  所以 P-24 的机制（装载点缺文件判红）**保持全绿**——它守的是症状不是根因。
  已补齐清单，并在 P-24 补记这条复发证据。
- 未覆盖：跨进程全局内存配额（现为每连接独立限额）；代理面流式转发。
- **部署状态**：wanzh 已同步到 profile 装载点（重启 DSH 生效）；team-hub 的部署形态是
  **仓库源码**（launchd `com.dshteamhub.gateway` 直接跑
  `packages/infra/dsh-team-hub/bin/dsh-team-hub.js`，实测运行时持有的 profile 副本 fd 数为 0），
  改动在服务重启后生效。
