# 算法技能页 · 目视验收材料（第 3 版）

生成时间：2026-09-12 12:47（Asia/Shanghai）；第 3 版补录 12:53
生成者：本次会话的 agent（**读不了图**；以下每条结论都来自程序化测量或像素检查，观感仍只能由人判断）

> 第 3 版改了什么：图**一张没动**（链路与几何复刻均未改）。新增的是两件取证——
> ① 本目录的负载与运行中宿主现取的负载**同 sha256**；② 唯一那条写路径拿真实 1338 个文件验过（含红-绿反向验证）。
> 另修正「已由命令确认的事实」里两处过期内容：包内测试计数（115/10 → 119/11）、以及补上信任栅栏的三条实测。
>
> 第 4 版补录（2026-09-12 晚）：图**仍然一张没动**，负载今天重取仍逐字节同哈希。新增 `audit-independent.py`
> ——**换一套语言、换一套解析与 join 实现**把整棵树重算一遍，18 项逐个等于宿主负载（含红-绿：变异负载必须报错）。
> 并修正第 3 版末尾一句不准确的话：`disable-model-invocation` 不是 1338 张都写成 `"true"`，而是 **1337 张带引号 + 1 张裸值**。
>
> 第 5/6 版：装机副本对账、真实注册表挂载；以及把唯一那条写路径按在真进程上（红→绿，1337 张卡）。
>
> 第 7 版补录（2026-09-12 13:25）：图**仍然一张没动**。新增 `live-state-probe.mjs`——前六版都在验
> 「模块里的逻辑对不对」，没有一版在问「这个页面在真实进程里挂上了没有」。第 7 版补上这一问，
> 并把「进程里跑的是哪一版模块」从注释里的推断变成每次重算的一行。

## 这一版推翻了上一版的一张图

上一版把页面放进一个手写的 `.shell{width:880px}` 容器里渲染。**那个 880 是我编的。**
真实的设置页没有这么宽：官方设置面板是定宽的，左边还占着一条导航栏。

| | 上一版 | 实测（官方 `SettingsRoot.module.css`） |
| --- | --- | --- |
| 面板宽 | 未建模 | **800px**（`border-radius:32px`） |
| 导航栏宽 | 未建模 | **188px**（`padding:22px 12px 0`） |
| 内容区 | 880px | 612px |
| 内容区内边距 | 30px | **24px**（`padding:0 24px 24px`） |
| **页面实际可用宽度** | **880px** | **564px** |

也就是说，上一版那张「右边缘 2 列墨迹像素为 0 → 无横向溢出」的结论，是在一个**比真实宽 56% 的容器**上得到的，
它证明不了真实页面里的任何事。整组 `page-*.html/png` 已删除——留着只会让下一个人照着错的宽度看图。
`icons.*` 保留（12 枚头像与容器宽度无关）。

## 这一版怎么来的

链路四步，输入都是真的（负载来自真机、几何来自官方样式表、渲染用真组件与真浏览器）。
**但「全部可复现」只对其中的 1 / 3 / 4 步成立**——第 2 步用了一次性临时 spec，未入库，见文末「复现命令」：

```
宿主真机负载   curl 127.0.0.1:43120/api/dsh-algo-skills/tree   →  live-tree.json（848,528 B，与宿主同 sha256）
               ↓
真实组件挂载   临时 vitest spec（css:true，渲染后已删；⚠️ 未入库）  →  dump.json
               ↓
官方几何复刻   compose-panel.mjs 读 SettingsRoot.module.css 取值，拒绝硬编码  →  panel-*.html
               ↓
真实浏览器     headless Chromium 1280×633，量完再截图             →  panel-*.png
```

`compose-panel.mjs` **从官方样式表里读**面板宽/导航宽/内边距；任何一个值读不到就报错退出，不回落默认值。
所以上游改了面板尺寸，这个脚本会先于图片出问题。

## 这些图是什么

| 文件 | 是什么 | 不是什么 |
| --- | --- | --- |
| `panel-light-collapsed.png` | **主验收图**：默认状态——打开设置页看到的第一眼。800×585 面板，页面座位 564px | 不是应用内截图；是同一份组件与同一份负载在复刻面板里的真实渲染 |
| `panel-dark-collapsed.png` | 同上，深色主题 | 同上 |
| `panel-light-drilled.png` | 点开 面 → 责任域 → 岗位 后的卡片栅格（3 张真卡） | 不是全展开 |
| `panel-dark-drilled.png` | 同上，深色 | 同上 |
| `icons.png` / `icons.html` | 12 枚层头像（4 面 + 8 责任域），浅色 + 深色各一遍；末尾 8 枚是**出海技能**对照 | 与上一版相同，未改动 |
| `panel-*-expanded.html` | 1338 张卡全展开的可复现输入（8.7 万 px 高，**不出图**——见下） | 不是截图产物 |

图顶部那行说明条是渲染时加的标注，不是应用 UI 的一部分。

**为什么没有「全展开」的图**：1338 张卡在 564px 里排成 2 列 ≈ 669 行，`pageScrollHeight` 实测 **87,165 px**。
出一张这样的图没有意义，而「1338 张是否真的都渲染出来」这件事由 DOM 计数证明更硬（见下）。

## 在真实浏览器里量出来的数

视口 1280×633（headless Chromium，DPR 1）：

| 状态 | 面板 | 页面座位 | page clientW | page scrollW | 越过座位的元素 | 卡数 |
| --- | --- | --- | --- | --- | --- | --- |
| collapsed | 800×585 | 564 | 564 | **564** | **0** | 0 |
| drilled | 800×585 | 564 | 564 | **564** | **0** | 3 |
| expanded | 不限高 | 564 | 564 | **564** | **0** | **1338** |

- **卡片栅格**：`grid-template-columns: 246px 246px` → 2 列，单卡 246×128。不是溢出后压扁，是真两列。
- **像素校验**：截图 row 300 上白色面板横跨 x = **240..1039**，正好 800px，与 CSS 声明一致。
- **深浅两版确实是两张图**：浅色面板区平均亮度 248.8、深色 48.3，逐像素平均差 205.3。
- **主题 token 无幻觉**：页面 + 复刻 chrome 共引用 61 个 `var(--dsw-*|--ds-*)`；官方四张样式表（base / corner-shape / design-platform / scrollbar）共定义 169 个；**未定义 0 个**。

### 唯一一处「文字被裁」，已确认不是缺陷

1338 张卡的所有后代元素里，只有 **1 个** 满足 `scrollWidth > clientWidth`：

- 元素：`p2s-advertising-api-unified-schema` 的卡标题（`_cardTitle`，180px 宽 / 34px 高）
- 原因：该标题需要 4 行（68px），而样式是 `-webkit-line-clamp: 2` + `overflow: hidden`
- 溢出那一行的行盒右边缘是 709px，盒子右边缘 699px——**但那一行属于被 clamp 掉的第 3~4 行，本来就不显示**
- 用户看到的是 2 行截断 + 省略号，正常

## 这一版顺带改掉的一个真问题

侧边导航顺序：**算法技能原本是 28，而「万物互联」已经是 28**。

`ui-slots` 按 `(priority, order)` 排序，**同序的行保持插入顺序**——对外部插件就是挂载顺序。
本包是被 `[dsh-market] hot-mounted` 挂进来的，所以两行谁在前，取决于谁最后热挂载。
改成 **29**（顺位在 万物互联 之后），顺序才是确定的。改动落在
`src/client/index.ts`（含原因注释）、`tests/client-mount.spec.ts`、`README.md`。

**这不是理论风险，有具体证据**：运行中的宿主 `/dsh-market/installed` 给出的 `bundles` 加载顺序里，
`dsh-algo-skills-local` 在第 **21** 位、`dsh-wanzh-hulian` 在第 **26** 位——两者同为 28 时，我的行**碰巧**排在
万物互联前面（也就是说，当前代码注释里「紧跟 26/27」的说法此刻成立，但只靠加载顺序侥幸成立）。
任何一次热挂载或加载顺序调整都会把它翻过去。

### 新顺序已经进到运行中的宿主了

不是「改完等你重启」，是可验证的：

```
repo  packages/surfaces/dsh-algo-skills-local/lib/client.js   inode 254565647  links=2
宿主  ~/.dsh/profiles/desktop/node_modules/dsh-algo-skills-local/lib/client.js
                                                              inode 254565647  links=2   → 同一个 inode
两者均已 SECTION_ORDER = 29
```

profile 镜像与仓库产物是**硬链接**，`pnpm run build` 一落盘，运行中的宿主读到的就是新文件。
`README.md` 同理（inode 254573698，两侧一致）。
唯一还需要你做的动作是**刷新浏览器侧**，让它重新取一次 client bundle。

## 新增的防复发护栏

`tests/seat-width.spec.ts`（3 条）——盯的正是我这次犯的错：**在一个不存在的宽度上做自信的检查**。

1. 页面样式表里任何 `width` / `min-width` 都不得大于 564px；
2. 卡片栅格的 `minmax()` 下限必须放得进 564px；
3. 记录值必须仍等于从官方样式表现算出来的座位宽——上游改了面板，这条先红。

三条都**反向验过**：把记录值改成 880 → 第 3 条报错并说明「座位是 564，请重跑渲染」；
往样式表塞 `min-width: 900px` → 第 1 条报错点名该声明。改回后 3/3 绿。

**顺手扫了其它设置页**（出海技能 / 万物互联 / 我的语录 / 小队 / 外观）：按同一口径
（`width` / `min-width` > 564px 即为不安全，`max-width` 不算）**全部合格**，没有谁在偷偷要求更宽的座位。
所以这条检查具备升级成仓库级门禁的条件——今天加进去不会红任何现有包。
**任务 2 重构出海技能页时，座位就是 564px**，这是硬预算。

> 注：第一遍扫的时候我把 `max-width` 也匹配进去了，于是「小队 760px」「外观 720px」看起来像违规。
> 那是我的正则写错，不是它们的问题——已修正后重扫，结论如上。

## 已由命令确认的事实

1. `pnpm run gate` → **15/15 通过**（mode=quick，2026-09-12 12:53，本轮复跑）。
2. 包内测试 **119 条 / 11 个文件全绿**（12:53 复跑）；其中 `page-render.spec.tsx` 的截断护栏用 2400 张合成卡断言全部落到 DOM 且卡名唯一。
3. 宿主半边在运行中的应用里是活的：`GET /api/dsh-algo-skills/health` → 200，`totals` 与页面一致（`1338 / 1327 / 11 / 326 / 2`）。
4. 该路由**不吃 GUI 的登录 cookie**（它是插件自注册的 webServer 路由），但带外来 `Origin` 的请求被 **403** 挡掉，也不回 `access-control-allow-origin`——本地其它进程读得到，网页读不到。本轮实测三条：
   外来 `Origin: http://evil.example` → **403** 且无任何 `access-control-*` 头；`sec-fetch-site: cross-site` → **403**；同源 `Origin: http://127.0.0.1:43120` → **200**。
5. `lib/client.js` 已重建，`SECTION_ORDER = 29` 已进产物，且**与运行中宿主的 profile 镜像同 inode**（见上）。
6. 宿主 `/dsh-market/installed` 可读（43120 上无鉴权）：`dsh-algo-skills-local` → `state: live`、`hot: true`。
7. **12 枚头像的来源可追到底**（本轮新增）：重跑 `node scripts/gen-layer-icons.mjs` → `src/layer-icons.ts`
   **逐字节不变**（sha256 `ee6127f5…`）；`node scripts/verify-layer-icons.mjs` → 12/12 通过
   （框架 / 品牌绿描边 2.2 / 裁剪区 / 高光 / 胸章非空且不越界 / 无家族外新色）。
   烘焙的 12 个常量两两不同；运行中负载里 **16 个图标槽（4 面 + 12 个责任域切片）逐个等于**对应常量——
   同一个责任域在两个面下出现时用的是**同一枚**头像。链路：品牌 manifest → 烘焙常量 → 宿主负载 → 页面 `<img src>`。
8. `pnpm run gate:full` → **19/19 通过**（exit 0，2026-09-12 12:55）。
9. **第 4 版当天重取**（晚于第 3 版）：`GET /api/dsh-algo-skills/tree` → 848,528 B，
   sha256 仍为 `413c63b9…`，与本目录 `live-tree.json` **逐字节相同**——图与宿主没有分叉过。
10. **客户端半边为什么一定会被加载**（不是靠市场手动装的）：`~/.dsh/profiles/desktop/package.json` 的
    `dsh.profile.bundles` 共 40 项，第 **24** 项就是 `dsh-algo-skills-local`（紧跟 `dsh-overseas-skills`）。
    同日 `/dsh-market/installed` 给出 `activation.dsh-algo-skills-local = {state: live, bundle: true, hot: true,
    reasons: ["已热加载(bundle patch)"]}`。也就是说：宿主半边在跑（health 200），客户端半边在 bundle 表里、等一次刷新。
11. **独立复算** `audit-independent.py` → 18/18 等于负载，exit 0；变异负载 → exit 1（见上一节）。

## 这批图与运行中的宿主是同一份负载（可核对的哈希）

`.scratch/algo-skills-acceptance/live-tree.json` 与刚刚从运行中宿主取回的负载**逐字节相同**：

```
413c63b91e208cbfa83f39fba65efa3b747b8a4da019634cc33546a66ab81e6b  live-tree.json（本目录，12:43）
413c63b91e208cbfa83f39fba65efa3b747b8a4da019634cc33546a66ab81e6b  /tmp/live-tree.json（12:50 现取）
node assert.deepStrictEqual → IDENTICAL
```

也就是说：你现在刷新看到的树，就是这四张图的输入。中间没有另一份数据。

## 唯一那条写路径，已拿真语料验过（本轮新增）

页面上唯一的交互是卡片上的调用开关，它落在 `rebuildFrontmatter` —— 本插件**唯一的写**。
在此之前，它的测试全喂夹具；夹具只能证明「作者想得到的形状」对，证明不了磁盘上这 1338 个文件对。

本轮新增 `tests/corpus-write.spec.ts`（4 条，**只读，不写一个字节**），直接读 `~/.dsh/skills/p2s-*`：

| 断言 | 覆盖的东西 |
| --- | --- |
| 1338 张卡都有 frontmatter | 真实卡上 `toggle` 永远不会走 400「no frontmatter」分支 |
| 改写无损 | 键集不变、除两个开关键外每个键的**解码值**不变、正文逐字节相同 |
| 幂等 | 同一状态写两次 == 写一次（连点开关不会堆键） |
| 写进去的状态能被页面自己的读取器读回来 | 见下 |

最后一条是真正要防的那个失败：**写一种自己读不出来的拼法**——页面会先显示成功，刷新后悄悄弹回。
验法是 `parseSkill(name, rebuildFrontmatter(text, state)).row.modelEnabled === state`，两个状态各一遍。

**反向验过（红-绿）**，两条各自点名失败：

```
变异 A  frontmatter.ts 去掉「替换而非追加」的 filter（直接把开关行追加到末尾）
        → 「改写无损且幂等」报红；其余 3 条仍绿
变异 B  collect.ts 把 !== 'true' 改成 !== true（页面读取器改比布尔）
        → 「写进去能读回来」报红，第一条失败是
          "p2s-3d-bin-packing-optimization: wrote false, page reads true"
两条改回后 4/4 绿，且 src/ 与变异前备份 diff 为空（逐字节还原）。
```

**语义交叉核对**：官方 `packages/skill/skill-filesystem/src/index.ts` 的
`frontmatterBoolean()` 把字符串 `"true"`（不分大小写）判为 true，本页 `parseSkill` 也按字符串比较——
两侧对同一份 frontmatter 得同一个结论，开关没有在骗模型侧的状态。

（该测试在无 `~/.dsh/skills` 的机器上跳过——新检出的仓库、CI。这是一个真实的覆盖缺口，写在测试文件头里，不藏。）

### 这条写路径的边界（说清楚，免得以后被当成 bug 追）

`rebuildFrontmatter` 是**删掉两个开关键、再把它们追加到 frontmatter 块末尾**，不是原地替换：

- 所以第一次动任何一张卡的开关，那张卡的字节会多出两行变化：**引号被归一**（`"true"` → `true`）、**两个键挪到块尾**。
  解码值不变、键集不变、正文不动——`corpus-write.spec.ts` 的口径是「解码值无损」，不是「逐字节无损」，两者不是一回事。
  想让 corpus 的 diff 干净，得改成原地替换；今天不改，因为语义上等价且已反向验过。
- 它**强制**写 `user-invocable: true`。今天对 1338 张卡都是空操作（实测全部为 `"true"`，`enabled:` 也全是 `"true"`，两者都不写）。
  但若将来有卡故意写 `user-invocable: false`，点一下开关会把它悄悄翻成 true——这是已知边界，不是今天的缺陷。

## 换一套实现重算整棵树（第 4 版新增）

上面的每一条取证都有一个共同的弱点：**跑的都是本包自己的代码**。自己的测试再多，也只能证明「它仍然按它自己的口径读语料」，
证明不了「它按人读语料的方式读语料」。所以第 4 版补了一个**故意不相干**的实现：

`audit-independent.py`（纯 Python，自己的 frontmatter 扫描器、自己的 join，**不 import `packages/` 下任何东西**）。

```bash
python3 audit-independent.py            # 18 项全部 ok → exit 0
ALGO_PAYLOAD=/tmp/mutated-tree.json python3 audit-independent.py   # 变异负载 → exit 1
```

| 段落 | 重算的东西 | 结果 |
| --- | --- | --- |
| pass 1 | 从 1338 张卡的 frontmatter 重算骨架：4 面 / 8 域 / 12 个面×域切片 / 面名 / 域 id 集合 | 全部等于负载 |
| pass 2 | 从 50 个 preset manifest 重建「责任名 → 岗位」索引，再按 `l3_business` 归位每张卡 | **50 个岗位的卡集合逐个相同**（不是数量相同，是集合相同）、`wired` 标记 0 处不符 |
| pass 3 | 扫全部 1338 个 `SKILL.md` 里开关键的写法与解码值 | 1337 带引号 + 1 裸值，解码值唯一 = `true` |

几个顺带得到的事实：

- **151 个责任名，0 个被两个岗位同时认领**（重算时把重复认领单独计数）。所以「一张卡只归一个岗」不是先到先得的侥幸。
- **11 张未归类卡不是我归不进去，是语料自己写着归不进去**：这 11 张的 frontmatter 里 `l3_business` 的值字面就是
  `（矩阵空白）`，`l1_id` / `l2_id` 也缺。页面把它们单独成组（组名就写着「未归类（矩阵空白）」）是在如实转述源数据，
  不是在给自己的失败找说法。
- 变异验证：从负载里挪走 1 张卡后重跑 → `FAIL — 2 check(s) disagree: ['unplaced set', 'roles whose card set differs']`（exit 1）。
  **一个从来没拒绝过任何东西的检查不算证据**，所以这条红是必须跑的。

## 拿真实注册表再验一次挂载（第 5 版新增）

第 4 版换了一套实现重算树——但那是**宿主半边**。浏览器半边一直只有一份替身测试：
`tests/client-mount.spec.ts` 自己写了个 slots 假件，锁「未声明时 register 抛、inject 等声明」。
替身能错，而测试不知道。所以这一版去掉了替身。

新增 **`tests/client-runtime-mount.spec.ts`（已入库，8 条）**：

- 按浏览器的模块宿主契约加载**已构建**的 `lib/client.js`
  （`window.__ModuleLoader__.load({ id, factory })`——客户端半边是脚本，不是 ESM，
  这份宿主是自己搭的，`require` 按 id 解析）。
- 配**真实** `SlotRegistry`（来自装机包里那份 `@deepseek-ai/dsh-client-runtime`）
  与**真实** cordis `Context`。
- 声明槽位照抄 shell 自己的写法：`children: { 'settings.section': { kind: 'list', scope: 'root' } }`
  ——这一行车是从应用里的 `ui-settings-general/lib/client.js` 抄的，不是我编的。

锁住的事实：行以 `id=algo-skills / order=29 / label=算法技能` 落账；按 order 排在
25–28 之后；声明坍缩后行消失、重新声明后回来；挂两次仍只有一行。
判据照抄 shell 的导航投影（同一份文件里读到的）：

```js
rows = ctx.slots.entries("settings.section").map((e) => ({
    id: e.options.id ?? "", order: e.options.order ?? 0,
    label: resolveSlotLabel(e.options.label) ?? "",
})).sort((a, b) => a.order - b.order)
```

`entries()`——**原始账本**，不是 `entriesOfSlot()`。行在账上就一定在导航里。

**它改了我一处认知**：`locale` 不在 `entry.options` 上。`SlotCore.register` 只把
key/id/order/label/priority 放进 `options`，把 `locale`/`registrant`/`select`/`inject`/`children`/`store`
摊在 **entry 本身**。替身把 `locale` 记在了 options 里——这正是替身能错、而真表会纠正的地方。
（对导航无影响：shell 只读那三个字段。）

**能红才算数**：把构建产物里的 `ctx.slots.inject(...)` 换成裸 `ctx.effect(...)`
（即该文件注释里记录的那个真实缺陷），8 条里 **5 条转红**，包括「已构建组件渲染真负载」那条
——因为行不存在就没有组件可渲染。

```bash
ALGO_BUILT_CLIENT=<变异包> npx vitest run tests/client-runtime-mount.spec.ts   # 期望 5 failed
```

同一份文件还拿**真机负载**（4 面 / 8 责任域 / 12 切片 / 50 岗位 / 1338 卡）挂载**已构建**的组件，
断言页面上真的出现 `4 面 · 8 责任域 · 50 岗位` 与 1338 / 1327 / 11 / 326 / 2。
这一条把第 3 版留下的缺口补上了一半：当年的 `dump.json` 是渲染**源码**组件的一次性 spec
（未入库），现在是**出货产物**在入库的测试里渲染真树。三态 dump.json 的重跑仍留给任务 2。

## 装机账本：order 29 为什么是空的（第 5 版新增）

扫 `~/.dsh/profiles/desktop/node_modules` 下全部 client 半边，得到真实的
`settings.section` 占位表：

| order | id | 包 |
| --- | --- | --- |
| 1 | pocket | dsh-pocket |
| 5 | dsh-theme | dsh-theme |
| 21 | xmanrui-dsh-im | @xmanrui/dsh-im |
| 25 | agent-teams | dsh-agent-team-gui |
| 26 | overseas-skills | dsh-overseas-skills |
| 27 | fullstack-skills | dsh-overseas-skills |
| **29** | **algo-skills** | **dsh-algo-skills-local** |
| 40 | market | dshmarket |
| 60 | noema-memory | @zseven-w/dsh-noema |
| 98 | my-quotes | dsh-my-quotes |
| 100 | better-sidebar | dsh-better-sidebar |

28 被万物互联占着、29 空着——代码注释里那句「28 is taken」至此是量出来的，不是推出来的。
全表只有 100 号出现两次，但两次是同一个包的两份 client 副本（`client.js` / `client-registry.js`），
不是真撞号。

## repo 与装机副本的对账（第 5 版新增）

`file:` 依赖是**硬链接**实体，所以「改了仓库、装的那份没变」是这类包最容易踩的坑。
逐文件对账（24 个出货文件：`lib/**` + `package.json` + `cordis.patch.yml` + `README.md`）：

- 内容漂移 **0**，缺件 **0**，断链 **0**（全部 24 个与仓库同 inode）。
- 对账前有**两处已经断了**：`README.md`（安装后被改过两次，装机那份停在旧文案）
  与 `lib/types/client/i18n.d.ts`（构建产物，装机那份没有）。两处都已用 `ln -f` 重新接上。
  界面行为不受影响（前者是文档，后者是类型声明），但这正是「验收看的是装机那份」的意义。
- 上一次构建 12:55:04 晚于最后一次源码改动 12:54:59，**没有陈旧构建**。

## 仍然只能由你判断的事

- **应用内观感**：宽度、留白、层级辨识度、深浅色对比。我调不动这台机器上的应用——`macos-harness doctor` 显示
  accessibility / screen_recording / post_events 三项权限均为 `false`，本会话又不允许弹授权框。
  **我能离屏渲染、能调宿主 HTTP、能读日志，唯独看不见你屏幕上那个窗口。**
- **1338 张卡的开关全是「关」**：因为 1338 个 `SKILL.md` 的 frontmatter 都写着 `disable-model-invocation: true`
  （**1337 张带引号 `"true"`，1 张裸值 `true`**；两种写法解码后都是布尔真，见 `audit-independent.py` pass 3）。
  这是源数据事实，不是页面缺陷；但它意味着卡片只能经岗位预设进入模型，模型不能自行调用。
  要不要在数据侧改成默认开，需要你定。

## 把唯一那条写路径真的按下去（第 6 版新增）

前面五版验的全是**读**：树怎么算、行挂不挂得上、渲染对不对。这个插件只有一个**写**，
也正是用户能一键触发的那一个（卡片上的开关）。它此前只被两种东西碰过：
`routes.spec.ts` 的假 TreeSource，和 `corpus-write.spec.ts` 的**只读**真语料。
「真进程 + 真信任栅栏 + 真 1338 张卡 + 真缓存失效 + 真落盘」这条组合从没跑过。

**`live-toggle-probe.py`（新增）把它按下去了**——15 条断言打真实的 `127.0.0.1:43120`，
探针卡 `p2s-a-mem-agentic-memory-system`，开→关，最后逐字节比对并**无条件还原**：

```
PASS  GET tree -> 200                    PASS  a hand-authored neighbour is refused (400)
PASS  card is in the payload             PASS  an unknown p2s name is 404, not 400
PASS  POST toggle enabled=true -> 200    PASS  traversal is refused (400)
PASS  frontmatter now reads false        PASS  GET on toggle -> 405
PASS  body bytes untouched               PASS  POST on tree -> 405
PASS  tree reflects the write immediately (cache dropped)   PASS  health still 200
FAIL  file is byte-identical to the start
      got  b10fabc5b51e51ee…   want 334a07843a0bf7a3…
```

**这一条红就是本轮的收获。** 诊断（`/tmp` 一次性脚本，diff 全文件）：

```diff
-disable-model-invocation: "true"     +disable-model-invocation: true
-user-invocable: "true"               +user-invocable: true
```

写盘器把**值**换了是本分，顺手把**拼法**也换了就是事故：流水线把所有标量都写成 JSON 带引号，
页面回写时却写成裸值。一次「点开又点回去」不会改变开关，却会永久改变这张卡的字节——
1338 张里 1337 张会中。而且此后「用户点错了」与「有人手改过这张卡」再也分不出来。

### 先扫清楚这到底是多大范围，再动手

三项扫描（只读）说明这个缺陷当前**只是拼法问题**，没有更深的坑：

| 扫描 | 结果 |
| --- | --- |
| 语料里的拼法 | 1337 张 `"true"`（带引号）· 1 张 `true`（裸值，`p2s-3d-bin-packing-optimization`） |
| CRLF / 缺键 / 冒号前空格 / 重复键 | 0 / 0 / 0 / 0 |
| 两个开关在 frontmatter 里的位置 | **1338/1338 都是最后两行**，前面一行恒为 `enabled`；键序只有 4 种变体 |

最后一行解释了为什么「REPLACE 后追加」没有引入重排序噪音——语料本来就长这样。若哪天有卡把这
两个键写在中间，那次改写会把它挪到末尾，本轮不算作缺陷但记在这里。

### 修：只动值，不动拼法

`rebuildFrontmatter` 现在按**文件原本的拼法**回写这两个键（没有该键时写裸值），并保留
frontmatter 块的行尾。判据用同一个正则同时决定「删哪几行」和「照谁的拼法写」，
所以不会出现「记了风格却漏删」的重复键。

- **先红**：对全部 1338 张真卡逐张断言「已处于目标状态时改写必须逐字节相同」与
  「开→关必须回到原字节」→ `2 failed | 4 passed`，失败清单**恰好 1337 个卡名**。
- **后绿**：修完 `6 passed`；包内合计 `133 passed / 12 files`；typecheck exit 0。
- **出货产物再验一遍**：`deployed-toggle-probe.mjs`（新增）**不 import `src/`**，而是 import
  装机 profile 里那份 `lib/index.js`（与仓库同 inode，探针自己断言这一点），用
  `src/index.ts` 真正会碰的三个成员（`effect` / `logger` / `webServer.register`）把它挂起来，
  再拿真 `node:http` 服务器收请求 → **14/14 PASS**，含「点开再点回去逐字节相同」。
- **能红才算数**：把出货产物里的回写那行换成修复前的写法（永远写裸值）→
  **12/14，红的正是描述这个缺陷的两条**。

### 顺带量出来的两件事

- **宿主认不认这两种拼法**：认。`dsh-skill-filesystem` 的 `frontmatterBoolean` 接受布尔、
  `1/0`、`"1"/"0"`、`true/yes/on`、`false/no/off`（源码
  `app.asar.unpacked/node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js`）。
  这条此前**没被任何测试或文档建立过**——`corpus-write.spec.ts` 只验了「页面自己的读取器读得回来」，
  而真正消费这张卡的是宿主。两种拼法都合法，所以这个缺陷不改变任何行为，只脏字节。
- **切换要不要重启**：不要。同一个包里默认开着 `watchFile` 监视
  （`watch: true`、100ms 轮询、200ms 稳定阈值），另有一条 `observeHostMutation` 供宿主自己的
  写入路径同步失效。所以开关点下去，宿主侧最迟几百毫秒内就知道。

### 这一版必须说清的两件事

- **运行中的宿主进程仍是 12:22 装载的那份模块。** 我改了源码并重建、把装机副本重新 `ln -f`
  接上（`lib/index.js` 里已能搜到新逻辑），但 Node 的模块缓存不会因为磁盘变了就回滚——
  要等应用重启才生效。**页面行为不受影响**（两种拼法对两个读者都合法），所以这不挡你的目视验收。
  这个预测是量过的，不是推的：修完之后重跑第 8 步，它**仍在同一条上红**（14/15，
  `RESTORED from backup` 照常还原），说明进程里跑的确实是旧代码。
- 重建 + 编辑之后，出货 24 个文件重新对账：**漂移 0 / 缺件 0 / 断链 0**。
  中间 `README.md` 断过一次——编辑工具是 tmp+mv，会打破 `file:` 硬链接，已 `ln -f` 接回。
- 探针的 `finally` 无条件还原，并且最后一行重算 sha——但那一行是在还原**之后**算的，
  所以它打印的 `corpus unchanged: true` 只证明「结束时是干净的」，不证明「中途写歪过」。
  真正证明还原的是那条红色断言之前的备份比对。这个措辞是本轮自查时发现的，记在这里。
- 探针会把被探的那张卡的 **mtime** 改掉（内容是逐字节还原的）。所以那两个卡片目录的
  `SKILL.md` 时间是本轮的时间戳，shasum 与原文一致；语料普查仍是 1337 带引号 + 1 裸值。

## 接线本身：真实进程里的活体状态（第 7 版新增）

第 6 版把唯一那条写路径按在了真进程上，靠的是「进程里那份旧模块仍然答得出旧行为」。
这反过来暴露了一个更基础的问题：**前面九步没有一步在问「这个页面到底挂上了没有」。**
第 1 步取了真负载、第 6、8 步打了写路径，但它们都从「模块已经被 import 了」开始——
而插件是 12:22 热挂载进一个 09:41 就启动了的进程的，这中间那一跳只有真实进程答得了。

所以补了第 10 步，`live-state-probe.mjs`：**四次 GET + 五次 `stat` + 读一次宿主日志，全程只读**，
一条命令把接线摊开。它问的四件事，各自只有一种东西能答：

| 问题 | 谁答 | 本机实测（2026-09-12 13:25） |
| --- | --- | --- |
| 宿主半边挂上了吗 | 路由自己 | `/health` 200 · `/tree` 200 · 652 KiB |
| 这个进程怎么判它 | dsh-market 自己的账本 | `state=live`，理由「已热加载(bundle patch)」 |
| 下次启动还会加载吗 | bundle 清单（与热挂载是两套机制） | 在 40 项里 —— 重启走常规 bundle 层 |
| 进程里跑的是磁盘上哪一版 | 被 import 文件的 mtime vs 日志里的挂载时刻 | 磁盘比挂载晚 56 分钟 → **旧修订** |

前三条全绿，第四条是唯一那条黄色：它把第 6 版末尾那句「要等应用重启」从推断变成了**算术**。
这一行是软判据（`NOTE`），因为它说的不是缺陷、是状态；但它让「改了源码」和「生效了」再也混不到一起。
顺带量到的两件事：

- `p2s` 负载今天重取仍**逐字节等于验收基线**（`413c63b9…`），所以第 3 版那批图的输入没有漂移。
- 语料计数稳定在 4 面 / 12 切片 / 8 责任域 / 50 岗位 / 1338 卡 / 1327 上树 / **11 张未归类** /
  **2 个空白岗位**（AGT-011 砺器、AGT-025 联商）。计数当断言、哈希只当观察——开关会改哈希，改不了计数。

### 能红才算数

两句都是量过的，不是声明的：

```
# 变异一：装机副本改成拷贝（即「编辑工具打断 file: 硬链接」之后的形态），其余照旧
DSH_PROFILE_DIR=<放了拷贝的临时目录> node live-state-probe.mjs
  → FAIL 仓库 ↔ 装机副本（硬链接）  **lib/index.js, lib/client.js 断链** → 退出码 1

# 变异二：端口上什么都没有
DSH_WEB_PORT=9 node live-state-probe.mjs
  → 4 条路由/账本判据 FAIL + 1 条连带 FAIL → 退出码 1
```

变异一这条硬链接判据是有来历的：`file:` 依赖在本平台是**硬链接不是符号链接**，而编辑工具是
tmp+mv，写一次就断一条——断了之后装机副本变成静态拷贝，此后**所有重建都对它无效，页面停在
旧代码上且毫无提示**。第 5 版的全量对账（24 文件）是另一条命令；这里每次只盯住真的会被 import
的那两个文件，代价是两次 `stat`。

这一轮又断了一条，而且是**在写这份文档的时候断的**：本包的 `README.md` 被编辑工具重写过，
inode 从 254664045 变成 254671185，`ln -f` 接回后两边同为 254671185。所以这不是理论风险。
同时量到一件该记住的事——平台自己的对账工具**比内容不比 inode**
（`scripts/gates/sync-profile.mjs` 的 `applySync` 是 `copyFileSync` + `renameSync`，
所以 `--apply` 本身也不建立硬链接）：

```
node scripts/sync-profile.mjs --check
  → 本包不在漂移清单里；退出码 1 是另外 7 个包的漂移（dsh-browser-local、dsh-theme-local …）
    ——与本页无关，但说明这条命令的退出码是**仓库级**的，读它要看清单不看码
```

也就是说：「内容一致」与「重建会传导到装机副本」是两个不同的事实，前者 `--check` 看得见、
后者只有 inode 看得见。本包的两个被 import 文件由第 10 步每次盯着。

### 它证明不了什么

- **它看不见浏览器那一行。** 全部判据都在宿主半边与文件系统上。设置侧栏里到底有没有多出
  「算法技能」，只有渲染进程里那个 DOM 知道；本机没有连上任何浏览器桥，所以我没量。
  这条要等你，或者等一个挂在渲染进程上的 CDP。
- 「**启动之后热挂载的插件，浏览器半边照样会被组装并下发**」这条结论我**读自代码**，没有实测：
  `dsh-client-modules` 订阅 `internal/plugin`，把新条目的名字标脏，微任务里对活着的 loader 条目
  重新对账（`app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-modules/lib/index.js:462`）。
  也就是说本插件 12:22 那一跳之后，它的 client bundle 是被重新组装过的。这是读源码，不是量。
- 探针读的是**今天**那份宿主日志（按进程启动日期选文件）。日志被轮转或清空后，「挂载时刻」
  这一条会转红——那是证据丢了，不是接线断了。

## 复现命令

**说实话的分层**：这条链上只有第 2 步当时是一次性手搓的（用了一个临时 vitest spec，渲染完就删了，**没入库**）。
所以「链路全部可复现」这句话对第 2 步是**不成立**的——上游文案已按此修正。其余三步今天仍可一条命令重跑。

```bash
# 1. 取真机负载                        ✅ 单命令
curl -s http://127.0.0.1:43120/api/dsh-algo-skills/tree -o live-tree.json

# 2. 挂载真实组件并落 DOM → dump.json   ⚠️ 需重写（临时 spec 未入库）
#    输入没有丢：live-tree.json 在（且与宿主同哈希）、组件在 src/client/AlgoSkillsPage.tsx、
#    三个状态的 HTML 中间产物也在。组件不改就不用重跑。

# 3. 按官方几何合成页面                 ✅ 单命令（读 SettingsRoot.module.css，拒绝硬编码）
node compose-panel.mjs

# 4. 量 + 截图（任意 CDP 浏览器）        ✅ 只依赖第 3 步的 HTML
#    panel-light-collapsed.html → panel-light-collapsed.png

# 5. 换一套实现重算整棵树（第 4 版新增）  ✅ 单命令，只读
python3 audit-independent.py

# 6. 真实注册表挂载 + 出货组件渲染真树（第 5 版新增） ✅ 已入库
#    注意：pnpm run gate（quick）只跑契约，不跑包内测试；跑它要 gate:full
npx vitest run tests/client-runtime-mount.spec.ts

# 7. 装机副本对账（第 5 版新增；第 7 版补上命令本体） ✅ 单命令，只读
#    平台自己的对账工具，比内容不比 inode。本包不在漂移清单里（其余 7 个包在，与本页无关）：
node scripts/sync-profile.mjs --check
#    要重建硬链接（内容相同但链接已断时，--check 看不见），对本包单点接回：
#    ln -f packages/surfaces/dsh-algo-skills-local/lib/{index,client}.js \
#          ~/.dsh/profiles/desktop/node_modules/dsh-algo-skills-local/lib/

# 8. 把唯一那条写路径按在真进程上（第 6 版新增） ✅ 单命令，自还原
#    15 条断言打真实的 127.0.0.1:43120；开→关后逐字节比对，finally 里无条件还原
python3 live-toggle-probe.py

# 9. 同一件事，但对象是出货产物（第 6 版新增） ✅ 单命令，自还原
#    不 import src/：import 装机 profile 里那份 lib/index.js，挂三个成员，走真 node:http
node deployed-toggle-probe.mjs

# 10. 接线本身：真实进程里的活体状态（第 7 版新增） ✅ 单命令，全程只读
#     3 次 GET + 2 次 stat + 读宿主日志；接线断了退出码 1。含「进程内是旧修订」那条算术
node live-state-probe.mjs
```

注意第 8 步的证据有**时效**：它打的是正在运行的进程，而进程里的模块是热挂载那一刻的。
改完源码不重启，它仍旧按旧代码回答——本轮那条红就是这么来的，修完之后它还会红到重启为止。
要看修复本身，用第 9 步（出货产物）或包内测试。**第 10 步把这条时效变成了可读的一行**：
它每次都重算「磁盘修订 vs 挂载时刻」，所以不会有人再需要对着一句注释猜进程里是哪一版。

**第 2 步为什么留着不修**：它的唯一产物 `dump.json` 由第 3 步消费，而第 3 步的产物 HTML 已经落盘。
只要组件不改，重跑第 2 步只会得到同一份 dump——今天没有可验证的收益。
真正该修的是任务 2（出海技能页重构）——它要用同一条链路，届时把第 2 步做成入库脚本才有回报。
