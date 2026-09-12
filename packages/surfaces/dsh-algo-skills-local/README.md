# dsh-algo-skills-local · 算法技能

设置页侧边导航的新一页「**算法技能**」：把 `dsh-paper2skills` 装进本机的 1338 张论文技能卡，
按组织骨架归位成 **4 面 → 责任域 → 50 岗位 → 技能卡** 三级下钻，并如实标出两类欠账
（语料未归类的卡、没有供给的岗位）。

> 页面位于 设置 → 算法技能（侧边导航顺序 29，排在「出海技能」26、「AI全栈技能」27、「万物互联」28 之后；
> 不共用 28——同序的行按挂载顺序决定先后，热挂载会让位置漂移）。

## 它回答什么问题

论文→技能管线在安装时就把每张卡按组织自己的分类法分了组，并把分类写进了每张卡的
frontmatter——然后**没有任何界面把它显示出来**。1338 张卡在技能选择器里只是一串名字。
本页渲染这份**已经存在**的分类，并把它的两个缺口摆到台面上。

| 事实 | 数字 | 页面怎么说 |
| --- | --- | --- |
| 已装技能卡 | 1338 | 已装技能卡 |
| 语料给出归类的 | 1327 | 已归位 |
| 语料里没有任何一条责任装得下的 | 11 | 未归类（尾部独立分组） |
| 归本岗、且本岗 preset 真接线了的 | 326 | 卡片上的「本岗已接线」 |
| 归本岗、但接线到别岗的 | 23 | 卡片上的「接线到 AGT-0xx」 |
| 完全未接线的 | 978 | 卡片上的「未接线」 |
| 本岗 0 张卡的岗位 | 2（AGT-011 / AGT-025） | 岗位行上的「本岗暂无卡」徽标 |

**归位与接线是两件事**，本页不把它们混为一谈：卡归哪个岗位由**分类**决定，preset 是否挂载
它由**另一次独立决策**决定。只显示归位会暗示 978 张卡有一条通向模型的路径，而它们没有。

## 数据来源（零跨包依赖）

树完全由**已安装的运行时状态**构建，不读任何其他包的数据目录：

| 来源 | 取的字段 |
| --- | --- |
| `~/.dsh/.agent-presets/agt-*/manifest.json` | 面 / 责任域 / order、本岗责任名（151 条的岗位切片）、标准产物、考核口径、岗位头像 |
| `~/.dsh/skills/p2s-*/SKILL.md` | `l1_plane` / `l2_domain` / `l3_business` / `l3_all` / `user_summary` / `p2s_src_domain` / 调用开关 |

连接键是 `卡的 l3_business → 岗位`。50 个 preset 的 `material_skill_names` 恰好覆盖 151 条
全部责任名（151/151，每个责任名唯一属于一个岗位），所以这条 join 不需要第二份分类表。

面与责任域的头像不在运行时读，而是烘焙进本包（`src/layer-icons.ts`，由
`scripts/gen-layer-icons.mjs` 从 lute-brand-icons 生成），页面因此不依赖品牌技能是否安装。

## 两条命令

```sh
node scripts/gen-layer-icons.mjs   # 从 lute-brand-icons 重新烘焙 12 枚层头像
node scripts/verify-layer-icons.mjs # 12 枚层头像的结构化验收
pnpm run typecheck && pnpm run test  # 类型 + 全部单测（条数见文末「目录」）
pnpm run build                       # lib/index.js（宿主）+ lib/client.js（浏览器包）
```

## 路由

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/api/dsh-algo-skills/tree` | GET | 整棵树（一次请求渲染整页；TTL 缓存 15s，切换开关后立即失效） |
| `/api/dsh-algo-skills/toggle` | POST | **本插件唯一的写**：翻转一张卡的 `disable-model-invocation` |
| `/api/dsh-algo-skills/health` | GET | 计数 + 诊断条数，不拉整棵负载 |

三条都走共享信任栅栏（环回，或已配对设备的 cookie）。树不是秘密，但它披露本机的岗位编制、
全部卡片清单以及每个 preset 实际挂载了什么。

`toggle` 的权限被收窄两次：名字必须是安全的 kebab（`frontmatter.isValidSkillName`），
**并且**必须是 `p2s-` 卡（`routes.P2S_NAME`）。安全的 kebab 名字不等于本页拥有的卡——
同一个目录里住着手工撰写的技能，这条路由没有资格碰它们。

## 语义继承

`disable-model-invocation` / `user-invocable` 的写法与 `dsh-overseas-skills` 逐字一致
（A1 语义：一个开关只控模型调用，「/」菜单恒可见），由 `tests/frontmatter.spec.ts` 锁定：
幂等、无 frontmatter 时**绝不起草写盘**、正文逐字节保留、CRLF 输入。

`frontmatter.spec.ts` 喂的是夹具——它证明的是「作者想得到的形状」正确，不是「磁盘上这 1338
个文件」正确。所以 `tests/corpus-write.spec.ts` 直接读真实语料逐张验证（**只读，不写盘**）：
改写无损（键集与除两个开关外的取值全部不变、正文逐字节相同）、幂等、往返回到原字节，
并且**写进去的状态能被页面自己的读取器读回来**——写一种自己读不出来的拼法，页面会先显示成功、
刷新后悄悄弹回。该文件在无语料的机器上跳过（新检出的仓库、CI），跳过即覆盖缺口。

**改写只动值，不动拼法。** 这两个键归页面所有，但**怎么拼**归文件：流水线写带引号的
`"true"`，手工技能写裸的 `true`，两种在页面自己的读取器和宿主加载器里都解成同一个布尔。
所以页面按文件原本的拼法写回去，于是有一条可以对外承诺的性质：

> **点开再点回去，磁盘上的字节一模一样。**

否则每张被点过的卡都会悄悄脱离安装器写出的格式（1338 张里有 1337 张是带引号的那种），
而「用户只是点错了」和「有人手改过这张卡」从此分不出来。这条性质对**全部 1338 张真卡**
逐张断言，不是夹具断言。同理，改写保留 frontmatter 块的行尾（CRLF 的卡不会因为一次点击
变成混合行尾）；块内自带混合行尾时会归一到起始行的风格——这是留下的残余，写在
`rebuildFrontmatter` 的注释里。

写入的字节还有第二个读者：宿主自己的 `dsh-skill-filesystem`。它的 `frontmatterBoolean`
同时接受布尔、`1/0`、`"1"/"0"`、`true/yes/on`、`false/no/off`（源码在
`app.asar.unpacked/node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js`），
所以两种拼法宿主都认；并且它默认开着文件监视（`watchFile`，100ms 轮询 / 200ms 稳定阈值），
**切换开关不需要重启应用**。

## 目录

```
src/
  index.ts          宿主插件：apply / inject / 路由挂载
  routes.ts         /api/dsh-algo-skills 路由族
  collect.ts        树构建（纯函数，注入 TreeSource）
  tree-source.ts    真实文件系统绑定
  frontmatter.ts    frontmatter 读 / 改写（纯函数）
  wire.ts           宿主↔浏览器 的负载契约
  layer-icons.ts    12 枚层头像（生成物，勿手改）
  access.ts         信任栅栏
  http.ts loopback.ts mount-once.ts pair-access.ts   # 共享层副本（勿手改）
  client/
    index.ts        注册 settings.section（order 29，见「挂载契约」）
    AlgoSkillsPage.tsx
    filter.ts       客户端收窄（纯函数）
    locales.ts      zh / en
    algo-skills.module.css
tests/              133 条（12 个文件；含座位宽度契约 seat-width.spec.ts、真实语料写盘 corpus-write.spec.ts、真实注册表挂载 client-runtime-mount.spec.ts）
```

## 挂载契约

「宿主半边答 200」与「设置页里真的多出这一行」是两件事，中间隔着浏览器半边。这条缝只有
拿**真实注册表**才能证伪，所以由两份文件分工：

- `tests/client-mount.spec.ts`：手写一份 slots 替身，锁住延迟注册的两条语义（未声明时
  `register` 抛、`inject` 等声明落地）。
- `tests/client-runtime-mount.spec.ts`：不用替身。按浏览器的模块宿主契约
  （`window.__ModuleLoader__.load({ id, factory })`）加载**已构建**的 `lib/client.js`，
  配真实 `SlotRegistry` + 真实 cordis `Context`，再照 shell 自己的写法
  （`children: { 'settings.section': { kind: 'list', scope: 'root' } }`，抄自
  `ui-settings-general` 的 children 表）声明槽位。

第二条锁的事实，是第一条证不了的：行以 `id=algo-skills / order=29 / label=算法技能` 落账；
按 order 排在 25–28（小队 / 出海技能 / AI全栈技能 / 万物互联）之后；声明坍缩后行消失、
重新声明后回来；同一插件挂两次仍只有一行。判据照抄 shell 的导航投影——
`e.options.id` / `e.options.order` / `resolveSlotLabel(e.options.label)`，别的字段它不看。

- **能红才算数**：把构建产物里的 `ctx.slots.inject(...)` 换成裸 `ctx.effect(...)`
  （即该文件记录的那个真实缺陷），8 条里 5 条转红；`ALGO_BUILT_CLIENT=<变异包> vitest run`
  可复现。替身能错而测试不知道，真表不能。
- `locale` 服务是这份文件里唯一的替身：构造真的那个要 `ctx.settingsScope` 与
  `ctx.slots.installLocale`，也就是整个应用。决定这一行出不出现的是 slots，不是 locale。
- 同一份文件还拿**真机负载**（4 面 / 8 责任域 / 12 切片 / 50 岗位 / 1338 卡）挂载**已构建**的
  组件——「源码组件渲染夹具」与「出货组件渲染真树」不是同一句话。语料抓取不在时跳过（同
  `corpus-write.spec.ts` 的跳过约定）。

以上两节证的都是「**模块里的逻辑对不对**」。还有两件事它们证不了，各只有一种东西能答：

- **这一行在真实进程里挂上了没有。** 本插件是被**热挂载**进一个早就启动了的进程的，中间那一跳
  只有运行时答得了。答案在 `dsh-market` 自己的账本里（`GET /dsh-market/installed` 的
  `activation[<pkg>].state` / `live` / `bundles`：前三者说「现在活着」，`bundles` 说「下次启动
  还会加载」——两套机制，别混）。一条只读命令把这几项连同路由 200 与语料计数一起打出来：
  `node .scratch/algo-skills-acceptance/live-state-probe.mjs`。
- **启动之后才挂上来的插件，浏览器半边会不会被下发。** 会：`dsh-client-modules` 订阅
  `internal/plugin`，把新条目的名字标脏，微任务里对活着的 loader 条目重新对账
  （`app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-modules/lib/index.js:462`），
  所以上面那一跳不会把设置行留在门外。**这条读自源码，没有实测**——本机没接浏览器桥，
  渲染进程里的 DOM 还没人看过。

还有一条与「改代码」有关的边界，值得写在这里而不是留在某次会话里：**宿主半边的模块身份在
挂载那一刻就定了。** Node 的 ESM 缓存不随磁盘变化回滚，所以「源码已修 + 已重建 + 装机副本已
`ln -f` 接上」仍然可能对应一个跑着旧修订的进程。这不是缺陷，是不会自证的时序；上面那条探针
每次拿被 import 文件的 mtime 去比日志里的挂载时刻，把这件事**算出来**而不是记在注释里。
_card_ 侧不一样：卡片内容是每次请求现读的（同目录 `tree-source.ts`，宿主 `dsh-skill-filesystem`
另有 100ms 文件监视），改卡片从来不需要重启。

order 29 不是随手取的：装机账本（扫 `~/.dsh/profiles/desktop/node_modules` 下全部 client
半边）里 1/5/21/25/26/27/28/40/60/98/100 各有其主，**29 空着**；同号会让行的位置取决于
最后热挂的是谁。该次审计与其余取证见 `.scratch/algo-skills-acceptance/README.md`。

## 已知边界

- 只扫 `p2s-` 卡片；同目录下的手工技能不进树，也不受理切换。
- 树是**只读**视图，不做技能创作、删除、默认选择——那些归官方技能中心。
- 页面首屏默认全部折叠：第一眼要看的是组织形状（4 面承载 1338 张卡），不是 1338 张卡。
  「全部展开」与搜索都会自动展开命中的分支。
