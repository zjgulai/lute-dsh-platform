# dsh-newapp-local · 新应用（应用矩阵）

LUTE 的**启动器**面：侧边栏里与官方「新会话」**并排各占一半**的「新应用」按钮，点开是应用矩阵抽屉。

## 抽屉里放什么：产品卡，不是岗位

抽屉的第一版列的是「连接」的两半（岗位名册 + 工作台容器）。两半都是诚实的读，但**都不是人能启动的东西**：
名册是组织拓扑（50 个岗位来自材料），容器是会话分组。现在的主区块是**产品卡**——

> **卡的主键是工作目录**，产品是该目录在 `product.json` 里声明的选项。

没有 `product.json` 的目录**照样列出**并标「尚未产品化」：丢掉它会让一个用户知道存在的项目看起来像被删了。

**岗位名册仍然读，但不再渲染**：它只回答一个问题——*这个产品声明的岗位在本机存在吗？*
那是第 2 级回退能不能成立的前提。名册读不到时按「不知道」处理并**放行**第 2 级：
另一个插件没装，不该把这张卡变成禁用。

工作台容器区保留在下方，标题写明「另一份事实，只读」。它没有被并进产品卡，因为容器的记录只有
`{title, sessionIds}`、**没有路径**（实测 payload），并集只能靠标题与目录名猜——猜错的卡片就是
「点开不能用」。

## 点开三级（判据是纯函数，不是按钮上的 if）

「点开必能用」是这张卡的全部契约，失败态是「按钮看着能按、按了什么也没发生」。三级各自都是可观测事实，
所以写成了 `planOpen()`（`src/client/product-cards.ts`），没有浏览器也能断言：

| 级 | 条件 | 动作 | 按钮 |
| --- | --- | --- | --- |
| 1 | `entry.service` 已注册 | 把 `declaration` + 工作目录交给该服务的 `open()` | 「打开」 |
| 2 | 未注册，但声明的岗位在本机名册里 | 工作台已验证的三连：`sessions.create({cwd})` → `agentPresets.select` → `sessions.open` | 「开会话」 |
| 3 | 其余 | 禁用，并**把原因写成按钮旁的文字**（没有声明 / 声明读不出 / 没写 preset / 岗位不在本机） | 「不可用」 |

第 2 级文案刻意不同：它不打开产品面板，说「打开」是另一类假话。
第 3 级不用 tooltip：tooltip 恰好对需要它的那个人不可见。

## 声明原样中转

`/api/dsh-newapp/products` 的每张卡上，产品有**两种表示，给两个不同的消费者**：

- **归一化字段**（`id` / `name` / `status` / `preset` / `entryService` / `features[]`）→ 卡片用，
  它不必再校验就能渲染（ADR-0033：`preset` 必填）。
- **`declaration`**（`product.json` 里那个对象的**逐字副本**）→ 入口面板用。它渲染表单靠
  `features[].inputs[]`、解析依赖靠 `features[].skills[]`，那是**产品自己的 schema**，
  本插件不拥有也不该重塑。

第一版只有前者，于是卡片能列产品、点开是空壳——**「卡片要什么」不等于「点开要什么」**。
两者同源于一次读取的同一时刻、谁也不落盘，所以不是第二份事实，只是一个中转。

## 允许根：读不到必须报

扫描根写在插件 config 的 `productRoots`（**父目录**列表），**默认为空 = 一个目录都不扫**——
没被要求的文件系统读取，本插件不做。配置落在 profile 的 patch 层：

```yaml
- id: ui-newapp-local
  config:
    productRoots:
      - /Users/lute/project
```

「读不到」与「没有产品」必须在界面上可区分，所以报告逐类分开：

| 情形 | 落点 |
| --- | --- |
| 根不存在 / 根是文件 | `skipped[]`（带 reason） |
| 声明不是合法 JSON / 顶层形状不对 / 缺 `preset` | `unreadable[]`（带 reason） |
| 目录没有 `product.json` | **成卡**，`declared:false` + `尚未产品化` |
| 卡片数达上限 | `truncated:true` |

## 侧边栏几何

官方 CSS 里 `!important` 出现 **0 次**（实测），所以内联样式必胜。列方向两个兄弟会堆叠，因此自建键取半宽、靠右、并上提官方按钮自身的纵向推进量：

```
2 + W + 2  (官方 2px 侧边距)  +  2 + W + 2  (自建键)  =  100%   ⇒   W = calc(50% - 4px)
```

上提量由 `getBoundingClientRect()` **运行时算出**（不写魔数）。容器总高不变，下方区域零位移。

**收起态不硬分**：root 内容宽仅 36px 而图标 18px，硬分得 ~17px/键会切掉图标，故降级为官方键下堆叠。

**不钉类名哈希**（[ADR-0019](../../../docs/adr/ADR-0019.md)）：选择侧用子串选择器 `[class*="newSession"]`（CSS-module 本地名完整保留，`zNic4G_` 与 `x-Wl6W_` 两代都命中）；覆盖侧走内联样式，根本不需要选择器。锚点失效时**自报降级**——`<html data-dsh-newapp-degraded="...">`，而不是静默缺席。

## 抽屉

`<dialog>` + `showModal()`，进浏览器 **top layer**。这不是审美选择：同装的浮层 z-index 实测已达 2500 / 99999 / 2147483000，任何自选的 z-index 都是会被下一次超越的猜测——本包样式表里因此**一个 `z-index` 都没有**。

空态 / 加载态 / 错误态齐备，且**降级逐条点名**：扫描根读不到 ≠ 声明读不出 ≠ 岗位名册缺失，
三者的下一步动作不同，合并成一句「加载失败」等于把三种修法压成一个死胡同。

## 契约

- host 面注册**两条** exact 路由：`/api/dsh-newapp/health`（加载探测器）与
  `/api/dsh-newapp/products`（`product.json` 发现）。两条都过**共享信任栅栏**
  （`shared/host/pair-access.ts`：回环 + 已配对设备）。
  `health` 同时是**加载探测器**：`dsh-host-webserver` 的 `match()` 先查 exact 表并立即返回，而 DSH 全局 auth 只挡 `/api` **前缀**——所以插件已加载时这条 exact 路由**无需 cookie** 即可应答；未加载时请求落到前缀守卫，返回 **401**。
- **栅栏的失败态是「拒绝」，不是「抛异常」**（[ADR-0038](../../../docs/adr/ADR-0038.md)）。
  本包与 role-matrix / skill-center 共用同一份栅栏；2026-09-12 之前它会因读一个未 inject 的服务而抛，
  被 webserver 兜成 **400**——拒绝仍然成立，但判决不是栅栏给出的。修法与实测见该 ADR。
- `webServer.register` **逐条调用**，绝不传数组（传数组会静默落进 prefix 表的 `undefined` 键，不抛不报，两条 exact 路由全部不可达）。
- 共享层（`sidebar-entry-core.ts` 与 4 个 host 模块）是**生成副本**，改 `shared/` 后跑 `node scripts/sync-shared.mjs`；首行标记是生成器的唯一依据，勿手改副本。

## 验收

```bash
pnpm run typecheck && pnpm run test && pnpm run build
# 实况 curl 探针（真 WebServer + 真 cordis + 真 curl；阶段 D 打运行中实例）
pnpm run accept:newapp-products      # 从仓库根运行
```

116 项测试覆盖：连接与逐源降级（纯函数，无 DOM）、**点开三级判据**、**启动器的两个动作**
（含每一条「做不到」的原因）、栅栏（含**代理形状的 ctx** 与会抛异常的配对服务）、
`product.json` 发现与逐类降级、构建契约（路由字面量两侧一致、module 表可解析、防白屏声明）、
split 接线与降级自报。

`accept:newapp-products` 的判分纪律：**仪器自检先于结论**（不存在的路由必须 404、死端口必须失败、
正控必须 200，任一不成立 → exit 2，不产出任何绿色），**每条负例只换一个头**与同 URL 正控构成
差分（翻转型本身才是证据）。它抓到的真缺陷见 [ADR-0038](../../../docs/adr/ADR-0038.md)：
共享栅栏在生产里读未 inject 的服务会**抛异常**，被 webserver 兜成 400——拒绝仍成立，
但判决不是栅栏给的。

## 真实浏览器几何验收

jsdom **不做布局**（`getBoundingClientRect()` 恒为 0），所以单测只能验内核的算术。而
「两键同行等高、下方不位移」是个关于布局引擎的断言，只有浏览器能定：

```bash
pnpm run probe:geometry   # 需要 Google Chrome 与已安装的 DSH Desktop
```

18 项断言，驱动**真实 Chrome**测真实盒子。两条纪律让它成为证据而非自证：
外壳样式表**从 shipped bundle 提取**（手写副本会与外壳悄悄漂移），前置条件缺失时**响亮退出**
（绝不静默变绿）。

它抓到过一个 jsdom 结构上查不出的真缺陷：自建键 `margin-bottom: 0` 让文档流少推进 8px，
下方工作区上移 8px（实测 `regionArea top 120 → 112`）。修法是把下边距设成与官方键相同的
8px——**它是用来抵消上提量的**。
