# 新应用抽屉 agentPresets 双通道探测 + 深链星探本地装配

- 日期：2026-09-13
- 状态：implemented
- 对应 ADR：[ADR-0061](../../adr/ADR-0061.md)
- 相关：ADR-0045（产品矩阵剪枝后 `kol-hunter-workbench` 已存在）、ADR-0056（出货 preset 不烘焙外部产品行，本机走本地装配）

## Problem

1. **新应用抽屉的「打开」回退路径在部分 shell 代际上失效。** `dsh-newapp-local/client/launcher.ts` 只从 `connection.api.agentPresets` 读取 preset 选择器，但当前 DSH 基座把 `agentPresets` 直接挂在 `ctx` 上（与 `sessions` 同载体）。当 `connection.api` 没有该服务时，launcher 把「无法选中 preset」报成卡片缺失依赖，用户看到的就是「点了卡片没反应」。
2. **深链星探 KOL-Hunter 的 product.json 与事实漂移。** ADR-0045 已测得 `KOL-Hunter/lib/client.js` 注册了 `kol-hunter-workbench`，但 `product.json.statusReason` 仍写「入口面板尚未打包安装，暂走第 2 级回退」，导致卡片状态显示为 draft 且用户预期混乱。
3. **ADR-0056 把 KOL-Hunter 从出货 preset 移出后，本机没有恢复它的本地装配层。** 结果 `agt-033` 组合里不再挂载 `product-kol-hunter`，L2 产品技能 `kol-hunter-candidate-screen` 不会随 preset 加载，即使面板打开也无法调用产品内部技能。

## Decision

1. **launcher 按 shell 代际走两条互斥路径：**
   - **路径 A（当前 DSH 基座）**：`agentPresets` 未暴露给 newapp 插件上下文，但 `sessions.create({ cwd, agentPreset })` 可在创建时直接指定岗位。此时走 `create → open`，不再尝试 `agentPresets.select`。
   - **路径 B（旧 typert-bridge 壳）**：`agentPresets` 通过 `connection.api.agentPresets` / `connection.remote.agentPresets` / `ctx.agentPresets` 暴露，且 `sessions.create` 只接受 `cwd`。此时走旧 triple `create → select → open`，`select` 仍以位置参数 `(sessionId, preset)` 调用并读取 `RemoteResult` 的 `ok` 字段。
   - 分支依据是 `presetsChannel()` 是否返回带 `select` 方法的对象；同时把快照写进 `localStorage` 的 `dsh-newapp-probe` 键，便于从渲染进程 leveldb 直接读诊断。
2. **product-cards.ts 解析 `entryService` 字段**：服务端把 `entry.service` 扁平化为 `entryService`（ADR-0045）。解析器改为优先读 `entryService`，并在使用扁平字段时忽略嵌套 `entry.action`，避免服务名正确但 action 被旧值覆盖导致面板方法调用错。
3. **KOL-Hunter 的 `product.json.statusReason` 改为事实描述**：入口面板服务 `kol-hunter-workbench` 已随包安装，卡片点开后由 newapp-local 交给面板打开。
4. **本机恢复 KOL-Hunter 的 preset 层装配**：在 `~/.dsh/.agent-presets/agt-033/agent.cordis.yml` 的 skill-subset 后插入产品行 `- id: product-kol-hunter / name: 'dsh-kol-hunter-local'`，并新增 `scripts/mount-local.mjs` 以便 preset 重生成后快速恢复。该装配只写本机运行时 preset，不进仓库出货物，符合 ADR-0056。
5. **更新项目级与用户级 `AGENTS.md`**：把「本机产品走本地装配」「newapp drawer 按 shell 代际选择路径」「外部产品不进出货 preset」「DMG 按 SOP 执行」变成常驻规则。
6. **新增 DMG 打包发布 SOP**：`docs/sop/dmg-release.md` 沉淀 ADR-0056/0057/0058 的打包步骤与红线。

## Alternatives considered

- **把 KOL-Hunter 重新烘焙进 `PRODUCT_MOUNTS`。** 否决：这会复活 ADR-0056 要解决的出货机器路径问题，客户机没有 `/Users/lute/project/KOL-Hunter` 时会进恢复模式。
- **让 launcher 只读 `ctx.get('agentPresets')`。** 否决：旧 shell 仍通过 `connection.api` 暴露该服务，丢掉 fallback 会制造反向回归。
- **不写 probe，直接靠 console.log。** 否决：重启后日志丢失；leveldb 里的 localStorage 是更稳定的诊断面。
- **把 DMG SOP 放在 packaging/README.md 而不是独立 docs/sop/dmg-release.md。** 否决：README 已很厚，SOP 需要被 CI/人类按步骤执行，独立文件更容易被门禁链接校验和单独打印。

## Post-restart regression and second fix

重启后首次点击深链星探卡片报错：`buildPanelModel: 功能 select-candidates 没声明任何 inputs，面板无从引导`。诊断发现：

1. **浏览器可能缓存 `/api/dsh-newapp/products` 响应。** 该路由此前未设置 `Cache-Control`；如果渲染进程拿到的是旧扫描响应，`product.declaration.features[].inputs` 就会缺失，面板自然无从渲染字段。
2. **面板的 `open()` 只接受 `{ product, feature?, dir }` 且把 `entry.product` 直接当原始声明使用。** 若调用方因任何原因传了 `ProductView`（含 `.declaration` 的包装对象），`product.features[0]` 会是服务端归一化后的摘要（无 `inputs`），同样触发该错误。

因此追加三条防御：

- `routes.ts` 对 `/api/dsh-newapp/products` 返回 `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` 与 `Pragma: no-cache`，杜绝扫描响应被浏览器缓存。
- `launcher.ts` 在调用面板服务时显式解析 `workflow.entry` 并传 `{ product: declaration, feature: entryFeature, dir }`，不再让面板猜测 `features[0]`。
- KOL-Hunter `client.template.js` 的 `open()` 增加防御：若 `entry.product` 带有 `.declaration`，优先使用 `.declaration`；同时写入 `dsh-kolhunter-probe` 记录收到的 `featureId` 与 `inputCount`，便于从 leveldb 直接定位。

## Consequences

- 新应用抽屉在两种 shell 代际上都有可靠的 preset 选择通道。
- 深链星探卡片在本机运行时可稳定打开入口面板并调用产品内技能。
- 扫描路由禁止缓存，避免 `product.json` 更新后抽屉仍使用旧声明。
- 面板服务契约由「传产品自己猜 feature」升级为「显式传 entry feature」，调用双方都有退化余地。
- ADR-0056 的「出货树只减不增」约束未被破坏：仓库内 `PRODUCT_MOUNTS` 仍为空，profile 本地装配是运行时行为。
- 项目级与用户级 AGENTS.md 同步了本次形成的三条规则。
- DMG 打包有独立 SOP，后续发布按文档执行即可复现。

## Third regression round: the double-wrapped view (root cause of the surviving panel error)

第二层防御部署并重启后，卡片仍报同一句 `功能 select-candidates 没声明任何 inputs`。这次不再推测，直接读渲染进程 localStorage 探针（`Partitions/dsh-desktop-renderer/Local Storage/leveldb`）：

```
dsh-kolhunter-probe = {"stage":"open-received","detail":"{\"hasEntry\":true,\"hasProduct\":true,
  \"hasDeclaration\":true,\"featureId\":\"select-candidates\",\"inputCount\":-1}"}
```

同时实测 `GET /api/dsh-newapp/products`：服务端返回**完全正确**——`cards[].products[].declaration.features[0].inputs` 有 3 项。三个探针值与服务端事实对照后，唯一自洽的解释是：

1. **host 侧** `products.ts` 的 ProductView 形如 `{ features:[摘要], declaration: 原始声明 }`（摘要无 `inputs`）。
2. **客户端** `product-cards.ts` 的 `toProduct()` 又做了一层 `declaration: p`——把 host 视图**整个**当作 declaration 包进卡片视图，形成「视图套视图」。
3. launcher 只剥一层：`product.declaration` 解出来仍是 host 视图，其 `features` 是摘要 → 传给面板的 `entryFeature` 没有 `inputs`（`inputCount:-1`），且剥过一层后仍见 `.declaration`（`hasDeclaration:true`）。两个探针值全部对上。
4. 面板侧防御只包住了 `product`，却**盲信了 `entry.feature`**——摘要 feature 原样进了 `buildPanelModel`。

### 修复（三层各归其位）

- **`product-cards.ts` `toProduct()`（根因层）**：先把载荷归一到最内层——`declared = p['declaration'] ?? p`；`features` 计数与 `declaration` 字段都从最内层取。host 视图形态的载荷不再被二次包装，卡片上的「N 项输入」计数也从原始声明恢复（此前摘要形态下恒为 0）。
- **`launcher.ts`（调用方防御）**：新增 `isRecord`，剥壳循环（最多 3 层）直达最内层；entry feature 优先取「同 id 且带 `inputs`」的一条。
- **KOL-Hunter（被调用方防御）**：新增纯函数 `resolvePanelTarget(entry)`（`pipeline/panel-model.mjs`，随面板内联进 `client.js`）：剥到最内层声明；送来的 feature 若无 `inputs` 按 id 回声明对账。`open()` 探针加 `peeled` 字段。

### 回归测试

- `product-cards.spec.ts`：host 视图形态载荷 → `declaration` 必须是内层原始声明（引用相等），计数来自原始声明。
- `launcher.spec.ts`：双重视图固定 → `arg.product` 引用等于最内层原始声明、`arg.feature.inputs` 非空。
- `client.spec.mjs`：`resolvePanelTarget` 事故回放——双重视图 + 摘要 feature 也解出可渲染表单来源；三种老形状不回退。

### 验收

- dsh-newapp-local vitest：115/115（含 2 条新回归）。
- KOL-Hunter `node --test`：22/22（含 resolvePanelTarget 回放）。
- `pnpm run gate`：17/17；产物已 `sync-profile.mjs --apply --loadpoint` 且装载点校验一致。

### 教训（探针的价值）

第一轮修复靠「看代码猜风险」改了两层防御，仍然没打中根因；这轮靠探针三值 + 服务端实测对账，一次定位。规则收敛：**载荷形状类 bug，先拿 leveldb 探针与 API 实测对账，再动代码**。

## Fourth regression round: the handoff that never happened (second submit "no reaction")

面板修复上线、重启验证后，用户报告：第一次点「交给会话执行」有输出，第二次点没反应。读真实读数后定性：**两次点击其实都失败了，且一次都没开成会话**。

证据链：

- 新应用探针 `dsh-newapp-probe`：`ctxHasSessions: true, ctxHasAgentPresets: false` —— 当前基座 client ctx 暴露 `sessions`、不暴露 `agentPresets`。
- `rc_probe`：当天两次点击之后**没有任何新会话**（会话列表无新增）。
- `dsh-kolhunter-probe` 只有一条 `open-received` —— 两次点击发生在同一个面板里。

根因（KOL-Hunter `client.template.js` `startSession`）：

```js
const presets = optionalService(ctx, 'agentPresets')   // 死在这行
```

`optionalService` 在 `ctx.get` 取不到时落到**裸读 `ctx[name]`** —— cordis 上下文裸读未 inject 的属性会 throw（`cannot get property "x" without inject`）。这两行在 `try` 之外，async 函数直接 reject；调用方只有 `.then()` 没有 onRejected —— 静默。用户看到的「第一次有输出」只是交办文案 textarea 亮出来；第二次点击文案已在屏上，无任何可见变化。

### 修复（KOL-Hunter 侧，三层）

- `optionalService` 裸读也裹 try/catch：可选服务必须真的可选。
- `startSession` 按基座代际走两条互斥路径（与 newapp launcher 同源）：有 `select` 通道走旧 triple；没有则 `create({ cwd, agentPreset })` 创建即带岗位——顺带修掉「新基座上会话落在默认岗位」的隐性错误。每步写 `handoff` 探针。
- 提交回调补 onRejected：失败必须写进 `resultNote`，原文永远留底。

### 回归测试

`tests/client.spec.mjs` 新增最小 DOM 桩测试，对**真实产物**（eval lib/client.js）端到端点击断言：
① 新基座形态——`create` 收到 `{cwd, agentPreset:'agt-033'}`、open/send 依次调用、成功文案出现；
② hostile ctx（Proxy 裸读即抛，复现线上事故）——面板不死、会话照开；
③ 无 sessions——失败文案「没能自动开会话（没有 sessions 服务）」出现，而不是没反应。

### 验收

- KOL-Hunter `node --test`：23/23（新增端到端 1 条）。
- 修复经硬链接自动同步到 profile（同一 inode），无需另行 sync。

### 教训

「尽力而为」的异步路径，没有 onRejected 就等于静默失败；面板类 UI 的每一步落点都必须可见（成功一句、失败一句、原文一份）。本轮同款裸读错误是 newapp launcher 2026-09-12 修过的同一个坑在产品侧的翻版——「可选服务裸读会抛」应作为跨包常驻知识，而不是每个包各踩一遍。
