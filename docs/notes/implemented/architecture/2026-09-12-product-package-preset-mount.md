# 产品包挂进岗位：把「局部技能」从一句约定变成挂载层的结构属性（ADR-0036）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0036](../../../adr/ADR-0036.md)。
> **状态：形态与静态自检已落地并实测；运行时作用域对照探针未运行**（需要重启 Harness，见文末）。
> 承接 [ADR-0033](../../../adr/ADR-0033.md) 与 [ADR-0034](../../../adr/ADR-0034.md)；规格 [.scratch/native-agent-product/spec.md](../../../../.scratch/native-agent-product/spec.md) §11.8。

## Problem

用户的要求是一句话：「**产品技能要单独打包到对应的产品中作为局部技能**」。三个词各有一个不显然的落点：

| 词 | 不显然在哪 |
| --- | --- |
| **单独打包** | 打包成什么？目录？插件包？包住在哪——产品目录里，还是本仓库的受管包目录里？ |
| **产品中** | 产品与包的边界在哪？技能会不会因此有两份？ |
| **局部** | 局部到哪一层？谁决定？挂错了会怎样——报错，还是静默？ |

M1 只做到「产品目录里一个 `skills/` 文件夹 + 产品自己的加载器」。那不是包，也不是平台意义上的局部：把技能目录拷到全局 `~/.dsh/skills/`，行为一模一样——换句话说，**当时没有任何东西在阻止产品技能变成全局技能**。

## 取证：分层由挂载位置决定（不是插件能自己选的）

`@deepseek-ai/dsh-skill` 的 README 是权威契约：

> 注册表采用宿主 + **按 scope 的分层结构**……注册落入调用方上下文 scope 对应的层——宿主行与 repository 插件落入全局层，**由 agent preset 常驻组合挂载的插件落入该 preset 的层**。读取时将全局层与观察 scope 的链合并；**最近层直接赢得重名**。

本机先例 `dsh-skill-subset` 把这条用满了，而且**同时挂了两次**：

| 挂载点 | 落层 | 干什么 |
| --- | --- | --- |
| profile 的 `dsh.profile.bundles`（patch 在宿主层插行 `dsh-skill-subset`） | 全局层 | 无 config → `skills: []` + `hideOthers: true` → 把目录里**全部**技能注册为不可见 |
| 50 个 preset 各一行（`- id: skill-subset / name: 'dsh-skill-subset' / config.skills [...]`） | 该 preset 层 | 把本岗位子集重注册为可见（遮蔽全局的 model-off 副本） |

净效果：全局隐藏、preset 内可见。**这条路走得通，但它同时示范了误用形态**——如果把一个只想做「产品局部」的包也塞进 `bundles`，它的 patch 会在宿主层插一行，产品技能就进了全局层，**全程零报错**。

第三条事实来自本仓库：50 个岗位的 `agent.cordis.yml` 全是 `scripts/role-presets/generate.mjs` 的生成物，每次运行重写全部。

## 取证：一件同时发生的事，证明「漂移」不是假想

做 M2a 期间，产品的提示词哈希从 `b738e62723be` 变成 `4b22687e11ce` 又变回 `b738e62723be`，而产品一行未动。追下去：

| 探针 | 读数 |
| --- | --- |
| `~/.dsh/skills` 下被改写的 `SKILL.md` | 两波，每波 **1338 个** |
| 本仓库同期出现的文件 | `docs/adr/ADR-0035.md`、一篇 paper2skills 的 Note（**不是本会话写的**） |
| 同一分钟 `packages/capabilities/dsh-paper2skills/` 的写入 | `generated/assemble-report.json` + `staging/**/SKILL.md` |

即：**另一个会话在跑技能效果实验**，把全局技能库整体重刷；随后按它自己的 [ADR-0035](../../../adr/ADR-0035.md)（改动须过 held-out 验证门，未过门一律回滚）**回滚**了。

这解释了哈希的往返。也顺带证明 M1 加的漂移判据不是锦上添花：它当场指名
`L1:p2s-kol-creator-matching b39e777889eb→f379af6f8fbb`，否则这只是一次「哈希莫名其妙变了」。

## Decision

见 [ADR-0036](../../../adr/ADR-0036.md) 的六条。落地形态：

```
/Users/lute/project/KOL-Hunter/        ← 产品根 == 包根
├─ package.json        # 无 dsh.bundle（故意的）
├─ lib/index.js        # 插件：注册包内技能；复用管线的 parseFrontmatter
├─ skills/             # ★ 唯一副本，两个消费者
├─ pipeline/           # 提示词管线（也是包的一部分，进 files）
├─ product.json        # 归属：preset = agt-033
├─ run.mjs             # 18 项自检
└─ tests/plugin.spec.mjs
```

装配侧（本仓库）：

```js
// scripts/role-presets/generate.mjs
const PRODUCT_MOUNTS = {
  'agt-033': [{ id: 'product-kol-hunter', pkg: 'dsh-kol-hunter-local', product: 'kol-hunter', … }],
}
```

安装：profile `dependencies` 加 `"dsh-kol-hunter-local": "link:/Users/lute/project/KOL-Hunter"`，**不加进 `bundles`**。

## Alternatives considered

见 ADR-0036。要点：进 bundles（静默变全局，放弃）、挂在 profile 层用 config 区分（把全局行降级靠约定，放弃）、手改生成物（会被重写，放弃）、插件自带解析器（必然漂移，放弃）、打包时复制 `skills/`（凭空造第二个家，放弃）。

## Consequences

### 实测读数

```
$ node --test tests/plugin.spec.mjs
✔ 包身份：name 与 inject 是平台契约要求的形状
✔ 注册的产品技能与另一个消费者（提示词管线）读到的逐字节相同
✔ 注册正文由包内那份提供——不回头读产品目录（包是自包含交付物）
✔ 技能根缺失时报 warn 而不是抛——一个产品包不该把整个组合拖垮
✔ 非法技能名与目录名/name 不一致都要被跳过并告警（不静默）
ℹ pass 5  fail 0

$ node run.mjs --check
✓ 产品包被挂在该岗位的组合里          agt-033 → product-kol-hunter (dsh-kol-hunter-local)
✓ 产品包没有被写进 profile 的 bundles  dependencies: link:/Users/lute/project/KOL-Hunter；bundles: 不含（38 项已查）
✓ 打包清单带得走技能与运行时          files: [lib, pipeline, skills, product.json, README.md]
✓ 插件注册的技能与提示词管线读到的逐字节相同  1 条逐字节一致
✓ 18 项全部通过

$ pnpm run gate（Magpie-Horch）  ok 14/14
$ diff -rq ~/.dsh/.agent-presets <重新生成到临时目录>   → 只有 agt-033 差，正是新增的产品行
```

**生成器保真已验**：正式生成前先 `ROLE_PRESET_OUT=/tmp/...` 生成一份对比，确认除 `agt-033` 外 49 个岗位逐字节不变；否则不敢动那 50 个目录。

### 正面

见 ADR-0036。一句话：**误挂会硬失败，正挂可自证。**

### 负面 / 未决

- **产品包在本仓库门禁之外**：它不在仓库里，`package-identity` / `exemptions` 管不到。代偿是产品自带 18 项自检——这是两套治理，不是一套。
- **局部只到 preset 粒度**：同一岗位挂多个产品时，L2 技能在该岗位层合并。要做到「只在这一个产品处可见」，需要比 preset 更细的常驻挂载点，目前不存在。
- **`link:` 路径是绝对的**：换机器要改 profile 的 `dependencies`。
- **运行时作用域对照探针未运行**：本轮验的是形态、静态自检与插件单测。真会话里「agt-033 加载得到、别的 preset 加载不到」必须重启 Harness 之后再测——重启会终止当前会话，因此留给用户择时。

**下一步**：重启后跑两会话对照探针；随后 M2b（模型步收进基座 + 入口面板 + 新应用出卡）。

## M2b 补充：模型步收进基座时撞上的一个硬约束

M2b 的第一件是把功能的模型步从「脚本外挂 `--advise`」收进基座。做的过程中撞上一件**会让包直接加载失败**的事：

> `link:` 安装的包，Node 按**真实路径**解析依赖。本包住在 `/Users/lute/project/KOL-Hunter`，Node 会沿它的祖先目录找 `node_modules`（`KOL-Hunter/` → `project/` → `Users/` → `/`），**够不到** profile 的 `~/.dsh/profiles/desktop/node_modules`。

也就是说：**产品包对宿主零 import 不是风格选择，是 `link:` 的必然结果。** 任何 `import '@deepseek-ai/dsh-tools'` 都会在加载期炸。

取证后确认这条路走得通：`ctx.tools.register(definition)` 实际要求的形状很小——

```
{ name, description, parameters(JSON Schema), output:{ schema, render }, timeoutMs?, execute }
```

`@deepseek-ai/dsh-tools` 的 `defineTool` 只是「参数规格 → JSON Schema + 校验包装」的转换器，不是必需的前置。于是本包**手工构造定义**（自己写 `toJsonSchema` 与参数校验），换来零宿主依赖。同理，本机先例 `dsh-worktable`（也是 `link:` 装的）的 host 入口 `lib/index.js` 里**一个 bare import 都没有**——同一条约束的同一个解法。

顺带落地的一件正确性改动：**编排抽成一份**。`pipeline/feature.mjs` 现在同时被 `run.mjs`（CLI）与 `lib/index.js`（工具）调用——否则同一份「跑功能」的编排会有两个实现，正是这几轮反复撞上的漂移面。重构后 CLI 的 18 项自检与端到端运行全都复跑通过。

### M2b-1 实测读数

```
$ node run.mjs --test                 → pass 10  fail 0
  ✔ 插件注册两个 host 工具，且定义满足 register() 要求的形状
  ✔ 第 1 步：真跑确定性步并拼出提示词（不调模型）
  ✔ 第 2 步：接受合规产出，机检通过并渲染出候选名单
  ✔ 第 2 步的负例：改写数字 / 升级分级 / 非法 JSON，三条都必须被拒
  ✔ 降级是允许的（契约是「只能降不能升」，不是「不许动」）
$ node run.mjs --check                → 18 项全部通过
$ node run.mjs --advise …             → 端到端跑通，产物落盘
$ pnpm run gate（Magpie-Horch）        → 14/14
```

**分工留在可见对话里**：`kolhunter_select_candidates` 只算数 + 拼提示词（不调模型），模型按提示词产出 JSON，`kolhunter_finalize` 机检契约后渲染落产物。模型就是**会话自己的模型**——凭证与路由归基座，产品不碰，判断过程可回放。

**未运行**：会话内真跑这两个工具（要重启后才在有产品的 preset 会话里出现）。本轮验的是定义形状、真执行、契约负例与落盘，**不宣称已在会话里跑过**。

## M2b 续：产品发现（出卡的前一半）

`dsh-newapp-local` 新增 `src/products.ts`（纯发现逻辑，可离线验）与 `/api/dsh-newapp/products` 路由（薄接线，**重启后**才生效）。五条约定：

| 约定 | 为什么 |
| --- | --- |
| **允许根显式、默认空 = 不扫** | 扫描根是一次操作者没要求的文件系统读；空列表就是安全默认（与 worktable 栅栏同一形状） |
| **允许根是「工作目录的父目录」，只扫一层** | 卡片主键是工作目录；目录本身是卡，产品挂在卡上 |
| **每个解析都 total** | 一个坏 `product.json` 必须只坏一张卡，不能把整次扫描打断——抽屉是逐源降级的 |
| **没有声明的目录 `declared: false` 上报，不消失** | 丢掉会让项目看起来不存在（ADR-0028：降级而非消失） |
| **`scannedRoots` / `skipped` / `unreadable` 必须说清** | 「读不到」不能长得像「扫了个空」 |
| **`preset` 缺失直接判不可用** | ADR-0033 把它定为必填：不属于任何岗位的产品，还没想清替谁干活 |

`routes.ts` 的既有契约是「本插件恰好一条路由」，加第二条是**合法地改了那条契约**，因此测试按 `path` 定位而非下标，并把「恰好一条」改成「每个声明的 path 都有一条 exact 路由，且都 exact」——不放松断言（prefix 路由会吞掉 `/api` 栅栏的 401 加载探针，这个理由写在测试里）。

### 实测读数（本轮）

```
$ npx tsc --noEmit（dsh-newapp-local）  → exit 0
$ npx vitest run（dsh-newapp-local）    → Test Files 6 passed | Tests 85 passed
  其中新增 products.spec.ts 11 项：安全默认为空 / 未声明不消失 / 坏声明不拖垮整次扫描 /
  读不到要说清 / 文件当根要被拒 / 截断要上报 / 拿本机真实的 KOL-Hunter 对一遍
  另加 routes.spec.ts 3 项：新路由同一把栅栏（403/403/403/405）/ 无根不扫 /
  配了根就扫且回报 scannedRoots
$ pnpm build（dsh-newapp-local）        → lib/index.js 15.89 kB，含新路由字面量
$ pnpm install（profile）+ 防白屏硬校验 → dsh.bundle OK / patch OK，副本已含新路由
$ pnpm run gate（Magpie-Horch）         → 14/14
```

**未运行（必须重启才能验）**：

1. `/api/dsh-newapp/products` 的真实 curl 探针（含允许根正例与 403 负例）——插件跑在进程里，改它必须重装 + 重启，而重启会终止当前会话。
2. agt-033 vs 其他 preset 的技能作用域对照探针。
3. 会话内真跑 `kolhunter_select_candidates` / `kolhunter_finalize`。

**仍未做**：入口面板本身（客户端服务 `kol-hunter-workbench` + client bundle）。它是 ~1472 行客户端源码 + 353 行专用构建链（ModuleLoader 包装）的量级，且要用 spec §8 的三级回退才谈得上「点开必能用」；在这一件完成前，卡片点开走的是第 2 级回退（新建会话 + 选中 `agt-033`），而那条路今天就可用。

**另有一件架构前置没解决**：产品包挂在 **preset 层**，启动器在 **host 层**。若入口服务由 preset 内的插件 `provide`，按 Cordis 的 isolate 语义，host 侧的启动器 `ctx.get()` 大概率取不到——即三级回退的第 1 级可能永远走不到。这件事在动客户端代码**之前**要先定，否则会写出一个永远命中第 2 级的第 1 级。


