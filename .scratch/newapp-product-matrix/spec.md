---
title: 产品矩阵页剪枝：只列已产品化产品 + 大卡片矩阵 + 消融 dsh-worktable
status: implemented
test_seam: pnpm run gate（根级单命令聚合门禁，退出码即契约）
---

# 产品矩阵页剪枝 产品规格

> 本规格来自 2026-09-12 与用户的决策对话（一次现场取证 + 两轮共 7 项裁决全部确认）。
> 决策记录：ADR-0045。本规格不重新访谈，只综合已确认事实与已量读数。
>
> **执行结果见 [ADR-0045](../../docs/adr/ADR-0045.md) 与它的
> [Note](../../docs/notes/implemented/simplification/2026-09-12-newapp-product-matrix-ablation.md)**
> ——Step 0–6 全部落地，M1–M8 的实测读数记在 Note 里，不在此处复述（ADR-0009）。
> 一处与本文写作时的预判不同，已在 Note 中记录：Step 5 的实况判据需要**一次重启**才落到进程里，
> 在那之前运行中的实例仍会应答那 9 个入口（探针记退出码 3，不记成失败）。

## 1. Problem Statement

用户点开侧边栏「新应用」进入产品矩阵页，看到的是**一列 25 张卡，其中 24 张写着「尚未产品化」**。用户的判断是「这个插件太重了」，并要求两件事：**只保留已经产品化的产品**、**改用大卡片的矩阵形式**。

现场取证（逐字实测，非推断）：

| 读数 | 命令/来源 | 值 |
| --- | --- | --- |
| 矩阵页卡片数 | `GET /api/dsh-newapp/products` | **25**（`declaredCount: 1`） |
| 未产品化占位卡 | 同上，逐卡 `declared` | **24** |
| 已产品化目录 | 同上 | **1**（`KOL-Hunter`） |
| 该产品状态 | `KOL-Hunter/product.json` | `draft`（**不是** `ready`） |
| 扫描根 | profile patch `ui-newapp-local.config.productRoots` | `[/Users/lute/project]` |
| 工作台项目数 | `POST /api/worktable/workspaces` | 10 |

**用户的直觉是准确的，但他指错了插件。** 这一页由 `dsh-newapp-local` 渲染（面板标题「应用矩阵」，`src/client/NewAppPanel.tsx`），不是 `dsh-worktable`。两者体量对照：

| 包 | client 体积 | 在这页里贡献什么 |
| --- | --- | --- |
| `dsh-newapp-local` | **92 KB** | 整页：侧栏键、抽屉、卡片、点开三级 |
| `dsh-worktable`（vendor, pin v0.3.3） | **1.4 MB**（1,429,973 B / 23,483 行） | 只有一段标注「另一份事实，只读」的工作台项目列表 |

`dsh-worktable` 的 host 半边另有 8 条 HTTP 路由 + 1 条 WebSocket 升级路由（`/write` 是任意文件写入、`/term` 是交互式 shell），本仓库为它维护 **1,268 行**守卫件。

### 1.1 一条必须先纠正的既有决策冲突

把未声明目录从页面上删掉，**同时推翻两篇 accepted ADR 的明文决策**：

- [ADR-0028](../../docs/adr/ADR-0028.md)：「没有 `product.json` 的目录**照样列出**并标「尚未产品化」：丢掉它会让一个用户知道存在的项目看起来像被删了。」
- [ADR-0033](../../docs/adr/ADR-0033.md) 第 6 条：「没有 `product.json` 的目录显示「尚未产品化」而不是消失。」

用户已知情并显式选择推翻。本规格不偷偷删代码，而是登记修订（§4 R2）。

### 1.2 一处已漂移的事实（反向证据）

`KOL-Hunter/product.json` 的 `statusReason` 写着「入口面板的客户端服务尚未打包安装，卡片点开暂走第 2 级回退」。但 `KOL-Hunter/lib/client.js` 实测 `ctx.provide('kol-hunter-workbench', …)`，且 `dsh-kol-hunter-local` 已 `link:` 装进 profile 并进了 bundles——**该服务已注册，那张卡现在走的是第 1 级「打开」**。

结论：`status` / `statusReason` 是**手写字段，已经漂移过一次**。任何以它为过滤器的设计都等于让一句会过期的文案决定产品显不显示。（用户已据此排除该口径，见 §4 R1。）

## 2. 目标函数（第一性原理，冻结）

> **新应用 → 产品矩阵页 = 一张只摆已产品化产品的启动台。**
> 默认视野里没有任何「尚未产品化」占位；一张卡 = 一整个产品；大卡片网格排布；每张卡点开都有可观测结果。

可判定读数（每条都要有真实读数，不接受文字总结）：

| 编号 | 指标 | 基线 | 目标 |
| --- | --- | --- | --- |
| **M1** | 未产品化占位卡数 | 24 | **0** |
| **M2** | 卡片数 = 已声明产品数 | 25 vs 1 | **1 = 1** |
| **M3** | 宽屏（≥1200px）网格真实列数 | 1（flex 列，非网格） | **≥ 2**（合成夹具下量） |
| **M4** | 卡上字段齐备度 | 名称+目录+chip | **名称 / summary / 状态 / 岗位 / 版本 / 功能数** 六项 |
| **M5** | 点开可用率 | 1/1（第 1 级） | **1/1**，且失败必须写成按钮旁文字 |
| **M6** | newapp 对 worktable 的读取点 | 3（1 路由 + 2 localStorage 键） | **0** |
| **M7** | profile 中 worktable 条目 | dependencies 1 + bundles 1 | **0**，且 `/api/worktable/*` → 404 |
| **M8** | 启动面加载的 worktable client 体积 | 1.4 MB | **0** |

**M3 的诚实说明**：真实数据只有 1 个产品，网格在真机上永远只有 1 列——「矩阵形式」在真实数据上**无法证伪**。因此 M3 必须由**合成夹具**（临时造 3–4 个带 `product.json` 的目录）在真实 Chrome 里量列数与卡片盒子，不得用 jsdom（`getBoundingClientRect()` 恒为 0）。

## 3. 消融实验设计

### 3.1 原理

对每个可消融单元：**记录基线 → 消融 → 量同一个读数 → 差异即该单元的贡献**。目的不是"看看删了会不会坏"，而是**量化每个单元对目标函数的贡献**，从而把"插件太重"从感觉变成一张表。

**关键预测（本规格的中心命题）**：

> 卡片的点开路径**不依赖** `dsh-worktable`。`src/client/launcher.ts` 走的是官方 `sessions.create` + `connection.api.agentPresets`；README 里「工作台已验证的三连」说的是**技法的出处**，不是运行时依赖。
> 因此 **B 组全部消融掉，M1–M6 照样成立**。

反向命题（更有价值）：

> 把抽屉里的 projects/layouts 两个来源删掉后，`dsh-worktable` 变成**可整体卸载**——1.4 MB client 与 9 条路由**零补丁**从这台机器上消失，不碰上游一行，因此没有升级成本。

### 3.2 消融表

**A 组 — 产品矩阵页自身（`dsh-newapp-local`，自研包，零补丁成本）**

| # | 消融单元 | 唯一消费者 | 消融后 | 代价 |
| --- | --- | --- | --- | --- |
| A1 | 未声明目录成卡 | 本页 | **25 → 1** | 需留计数出口（§4 R3） |
| A2 | 卡主键 = 工作目录 | 本页 | 一产品一卡 | 改动面覆盖 scan/route/card/测试 |
| A3 | `.rows` flex 列 | 本页 | 网格大卡 | — |
| A4 | projects + layouts 两个来源 | 本页 | **worktable 读取点 → 0** | 项目不再出现在这页 |
| A5 | `AppMatrix.agents` | **无**（实测只赋不渲） | 少一次重复 fetch | 零 |
| A6 | `degraded[]` 三源降级点名 | 本页 | 随 A4/A5 缩减 | 「读不到」与「没有」的区分度下降 |
| A7 | `card.undeclared` / `blocked.undeclared` 文案 | 随 A1 失效 | 死文案清除 | 零 |

**B 组 — `dsh-worktable`（第三方 pin，卸载即零补丁剪枝）**

| # | 消融单元 | 离开后谁受损 | 代价 |
| --- | --- | --- | --- |
| B1 | profile `dependencies["dsh-worktable"]` | 无（实测唯一外部消费者是 newapp） | 工作台 UI 消失 |
| B2 | profile `bundles` 里的 `"dsh-worktable"` | 同上 | 1.4 MB client 不再加载 |
| B3 | 8 条 HTTP + 1 条 WS 路由 | 同上 | `/write`、`/term` 等安全面消失 |
| B4 | vendor 树 / pin / fence 补丁 | — | **保留**（§4 R4=A） |
| B5 | 4 个守卫件（1,268 行） | — | **语义翻转**，不删（§4 R4=A） |

### 3.3 卸载安全性（已实测，非推断）

| 断言 | 实测证据 |
| --- | --- |
| 除 newapp 外无人读 worktable 路由/存储键 | 全仓库 grep：命中仅 `dsh-newapp-local` 与其自身守卫件 |
| 卸载不丢项目数据 | `/api/worktable/workspaces` 读的是官方 `ctx.workspaceRegistry`（回退 `~/.dsh/storages/workspace.json`），**不是 worktable 私有存储** |
| 那 10 个项目是 DSH 自己的事实 | 同上 |

### 3.4 负向对照（缺一不可，否则指标是恒真的废话）

- **NC1**：把未声明目录塞回 payload → **M1 必须 > 0**（证明 M1 不是恒 0）
- **NC2**：把一处 worktable 读取塞回 `sources.ts` → **M6 必须 > 0**（证明 M6 不是恒 0）
- **NC3**：只用 1 张真实卡的夹具跑 M3 → **列数断言必须失败**（证明 M3 真的在量列数，而不是恒 ≥ 1）

## 4. Implementation Decisions（用户已裁决 7 项）

| # | 决策 | 用户选择 | 影响 |
| --- | --- | --- | --- |
| **R1** | 「已产品化」判据 | **有 `product.json` 就算**（→ 1 张卡） | 不用 `status` 字段（§1.2 已证明它会漂移） |
| **R2** | 未产品化目录出路 | **彻底从页面消失** | 推翻 ADR-0028 与 ADR-0033#6，须登记修订 |
| **R3** | 边角提示 | **加一行不可展开的计数** | 空态说「扫描了 N 个目录、均无 product.json」；有产品时页脚一行小字报未产品化计数。不是卡片、不占卡位 |
| **R4** | 卡片主键 | **产品**（一产品一卡） | 目录降为卡上的元信息 |
| **R5** | worktable 用量 | **用户基本不用工作台本身** | 触发 B 组消融 |
| **R6** | vendor 资产去留 | **保留资产，守卫件语义翻转** | 门禁从"守护已安装"改为"断言未安装" |
| **R7** | 消融验收 | **做成常驻验收件** | 新增 `accept:newapp-ablation` |

## 5. 消融序列（顺序有依赖，不得乱）

| Step | 动作 | 预期读数 | 依赖 |
| --- | --- | --- | --- |
| 0 | 记录基线 | 25 卡 / 1 声明 / 1.4 MB / 9 路由 / 1,268 行守卫 | — |
| 1 | 删抽屉里 projects + layouts + 已死的 agents（A4/A5/A6） | **M6 → 0**；页面少一段（此时仍 25 卡） | **必须先于 Step 5** |
| 2 | scan 只输出 declared（A1）+ 主键改产品（A2） | **M1 → 0，M2 → 1** | — |
| 3 | `.rows` → 网格大卡（A3） | **M3 ≥ 2，M4 六项齐** | 需合成夹具 |
| 4 | 死代码清理（A7） | **无行为变化**（证明零消费者） | — |
| 5 | profile 卸载 worktable（B1/B2） | **M7 → 0/404，M8 生效；M1–M6 全不变** | **晚于 Step 1** |
| 6 | 4 个守卫件语义翻转（B5） | 门禁仍全绿，语义改为断言未安装 | 晚于 Step 5 |

**顺序依赖的理由（Step 1 必须先于 Step 5）**：卸载后 `/api/worktable/workspaces` 会死。若抽屉里那一段还在，页面会挂上一条**永久**降级告示「工作台项目（dsh-worktable 未安装，或还没有建过项目）」——正好就是用户嫌的那种「重」。

**每步纪律**：先 Red（新断言在旧代码上失败）→ 再 Green。禁止「改完一起跑」。

## 6. 交付物清单

1. **`packages/surfaces/dsh-newapp-local/src/products.ts`** — scan 只输出 `declared` 目录；报告保留 `skipped[]` / `unreadable[]` / 未产品化**计数**（不是卡）
2. **`src/client/product-cards.ts`** — 视图主键由目录改产品；删 undeclared 分支
3. **`src/client/NewAppPanel.tsx`** — 删项目段与降级段；卡片改大卡；按 R3 加计数行
4. **`src/client/newapp.module.css`** — `.rows` → `.grid`（`repeat(auto-fill, minmax(…, 1fr))`）+ 大卡样式
5. **`src/client/sources.ts`（358 行）+ `tests/sources.spec.ts`** — **最大的一刀**：三源全没后 `AppMatrix` 整体消失。注意 `launcher.ts` 的岗位名册是**另一条独立读取**，不受影响
6. **`src/client/api.ts`** — 删 `matrix()`
7. **`src/routes.ts`** — `COMPOSED_SOURCES` 缩减（不再宣称 worktable 为组成源）
8. **`src/client/locales.ts`** — 删死文案（`card.undeclared`、`blocked.undeclared`、`degraded.*`、`row.*` 等）
9. **测试** — `products.spec` / `product-cards.spec` / `launcher.spec` / `routes.spec` / `contract.spec` / `stylesheet.spec` 按新主键与新形状重写
10. **`scripts/geometry-probe.mjs`** — 新增合成夹具（3–4 个临时产品目录）+ 真实网格列数与卡片盒子断言
11. **`scripts/acceptance/newapp-products-live.mjs`** — 适配新 wire shape
12. **新验收件 `accept:newapp-ablation`** — 固化 Step 0–6 读数 + NC1/NC2/NC3
13. **留痕** — 新增 ADR-0045 + Note；ADR-0028 与 ADR-0033#6 标注「部分被取代」；`docs/adr/README.md` 登记
14. **profile** — 备份后移除 worktable 的 dependencies 与 bundles 条目，`pnpm install`
15. **门禁** — `scripts/gates/worktable-fence.mjs` / `worktable-fence.test.mjs` / `acceptance/worktable-fence-live.mjs` / `gates/sync-profile.mjs` 语义翻转

## 7. Out of Scope

- **不改 `vendor/dsh-worktable` 上游源码一行**（ADR-0008：基座只 pin 不改）。剪枝以"卸载"实现，不以"改代码"实现——改代码会让补丁面从「一处路由注册文本」膨胀成「大面积源码改写」，上游每升一次级都要重付一次。
- 不动 `dsh-role-matrix-local`（岗位名册是 newapp 点开判据的另一条独立来源，Step 1 不碰它）。
- 不动 `dsh-kol-hunter-local` 与 `KOL-Hunter/product.json`（§1.2 的 `statusReason` 漂移问题只记录，不在本次修复）。
- 不新增产品声明。矩阵当前只有 1 张卡是**诚实读数**，不是缺陷；随用户后续声明更多目录自然增长。

## 8. 验收清单

```bash
# 包级
cd packages/surfaces/dsh-newapp-local && pnpm run typecheck && pnpm run test && pnpm run build
pnpm run probe:geometry      # 真实 Chrome，含合成夹具网格断言
pnpm run probe:reconcile
# 仓库级
pnpm run accept:newapp-products      # 阶段 D 打运行中实例
pnpm run accept:newapp-ablation      # 新增：消融读数固化 + NC1/NC2/NC3
pnpm run accept:worktable-fence      # Step 6 后语义翻转
pnpm run gate && pnpm run gate:full
```

判分纪律沿用仓库既有约定：**仪器自检先于结论**（不存在的路由必须 404、死端口必须失败、正控必须 200，任一不成立即 exit 2，不产出任何绿色）；**未跑就写「未运行」**。
