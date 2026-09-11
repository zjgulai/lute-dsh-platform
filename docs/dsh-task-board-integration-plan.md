# dsh-task-board 集成方案（LUTE 平台适配）

> 状态：**方案定稿，未执行**（2026-09-10）
> 目标仓库：https://github.com/etony668/dsh-task-board @ `4e7f97cdbbc765d0e351e0e6d066f6a40ef14a0e`（v1.0.1, MIT, 2026-08-26）
> 证据基线：本机 DSH Desktop 内核 `0.1.2-alpha.1`（dsh-base / dsh-web-app / dsh-session / dsh-api-gateway），profile `~/.dsh/profiles/desktop`（30 deps / 30 bundles，startup `health-commit`）
> 复核手段：`app.asar.unpacked` 内核源码直读（dsh-client-modules 入口治理、dsh-client-ui-slots 槽位规范化、dsh-client-ui-conversation 外壳属性）+ 运行时 Cordis Inspect（Service 精确契约 / Slot 目录与实占位 / Theme 令牌表）+ 平台内既有插件范式对照（dsh-context）

## 0. 决策记录（用户已拍板）

| # | 决策项 | 结论 |
|---|---|---|
| D1 | 接入形态 | **本地 fork + 适配补丁**：`/Users/lute/project/Magpie-Horch/dsh-task-board-local`，`file:` 依赖 + `dsh.profile.bundles` 条目 |
| D2 | 适配范围 | **全量 P1–P7**（安全 + 可达性 + 确定性 + UI 一致性一次到位） |
| D3 | 数据根 | **保持上游默认** `$DSH_HOME/taskboards/<sha256(项目路径)>.json`；**不加** storageRoot 配置项（P7 该子项撤销） |

## 1. 目标仓库形态（探索结论）

- **形态**：DSH 可分发组合包（Host `index.js → lib/index.js` + Web Client `lib/client.js` 手写 `__ModuleLoader__` bundle），无 npm 依赖、无 `prepare`（`lib/` 已提交，安装期无需构建）。
- **发布面**：npm `@etony668/dsh-task-board` **404 未发布**；仓库自带 `install.sh/reinstall.sh`（面向通用 `web` profile + `~/.dsh/cordis.patch.yml` 用户级补丁层，不适用于本 platform 的 profile 治理模型）；已提交 awesome-dsh-plugin 市场收录（本机 dshmarket 已装）。
- **能力图谱**：会话视图 tab（`conversation.view`，画布式面板：拖拽/磁吸/折叠/层级）· 父子任务树与任务边界（目标/范围/不包含/验收）· 6 个模型工具（`board_get` / `board_revision` / `board_sync` / `task_create` / `task_update` / `task_delete`）· 运行时技能 `dsh-task-board` · header 未读红绿点 · 本地 JSON 存储（CodexFF 同款格式）。

## 2. 兼容性矩阵（内核源码级复核）

| 依赖面 | 仓库实现 | 本宿主证据 | 判定 |
|---|---|---|---|
| 白屏三件套 | `dsh.bundle.patch` + `cordis.patch.yml`（含 `insert`） | 三件套齐备；内核在 profile 组装期校验 bundles 条目 | ✅ |
| `dsh.client` 声明 | `{ platform: 'web' }` | `dsh-client-modules/lib/index.js:139-152`：platform 必填 string，`inject`/`external` 经 `optionalStringArray` **可选** | ✅（惯例偏离，见 P7） |
| `exports["./client"]` | `{ default: "./lib/client.js" }` | 内核接受 string 或 `{default: string}` 形态 | ✅ |
| Host 服务注入 | `['tools','skills','webServer','sessions']` | 4/4 在运行时服务目录 | ✅ |
| `tools.register` | `{name,description,parameters,output:{schema,render},execute}` | 与 `ToolDefinition` 逐字段一致（`ToolOutputDefinition.schema: JsonSchemaNode` + `render`） | ✅ |
| `skills.register` | `{name,description,whenToUse,source:'runtime',content}` | 与 `SkillRegistration` 一致（`invocation`/`provider` 缺省自动补默认） | ✅（显示名见 P6） |
| 客户端服务 | `exports.inject = ['slots','timer']` | 客户端服务目录含 `slots`/`timer`，另可用 `locale` | ✅ |
| Client bundle 外部依赖 | 仅 `require('react')` | react 属隐式 baseline；已装 14 个客户端插件 `external` 均为空 | ✅ |
| `conversation.view` 注册 | `{name,id:'taskboard',order:20,label:fn,inject:fn}` | `dsh-client-ui-slots/lib/index.js:120-128` 规范化显式收录 `inject/locale/priority/store/children`；排序为 `priority → order` | ⚠️ 位序与 dsh-context 并列（P3） |
| 跨视图跳转 | 自定义 `inject(sessionId, viewActions)` + `props.actions.setView` | dsh-context 源码注释：**`openView` 只交给当前激活视图**，跨视图只能点 tab | ⚠️ 第二参未证实，走 tab 配方（P4） |
| 输入框坐席隐藏 | `body:has(.dsh-tb-shell) [data-composer-seat]{display:none!important}` | `data-composer-seat`/`data-conversation-scroll` 是内核真实属性（ui-conversation/ui-chat 引用）；dsh-context 用更克制的配方 | ❌ 高危（P2） |
| `/api/task-board` | 无信任边界 + `lastProjectPath` 跨请求回退 | `/api/*` 无全局围栏（本机 skill-center 亦自建围栏）；路由可达性已实测 | ❌ 高危（P1） |
| 存储 | `$DSH_HOME/taskboards`，锁 + 临时文件 rename 原子写 | 与桌面 `DSH_HOME=~/.dsh` 一致 | ✅（D3 保持） |
| 主题令牌 | `--dsw-alias-*` 全量引用 | 主题目录 11/11 令牌存在（含 `state-warn`） | ✅（硬编码点见 P5） |
| 命名碰撞 | `board_*` / `task_*` / `dsh-task-board` | 全 profile 扫描无碰撞 | ✅ |
| 会话项目路径 | `session.header.cwd` | `dsh-session` 校验 header cwd 为绝对路径字符串 | ✅ |

## 3. 风险登记

| # | 风险 | 级别 | 处置 |
|---|---|---|---|
| H1 | 看板视图下输入框坐席被整体隐藏，**不排除审批/提问/计划评审三态** → 控件不可达 | 高 | P2 |
| H2 | `/api/task-board` 无信任边界；`lastProjectPath` 允许任一本地进程无参读写看板 | 高 | P1 |
| H3 | 跨视图跳转用宽松选择器 + 五连事件爆破，可能重复触发/误命中 | 中 | P4 |
| H4 | `order: 20` 与 dsh-context「上下文观测」并列，渲染次序不确定 | 中 | P3 |
| L1 | 嵌入 i18n 不随 `setLocale` 热切换 | 低 | P6 |
| L2 | 琥珀 `#e7a84b` / `#c88a24` 硬编码；未读点用 emoji | 低 | P5 |
| L3 | 数据根在 profile 之外（备份/迁移语义不同步） | 低 | D3 接受，文档记录 |
| L4 | 上游为 rc 线开发，本机 alpha.1；无版本约束声明 | 低 | P7 + 验收覆盖 |

## 4. 集成落位表

| 面 | 落位 | 说明 |
|---|---|---|
| 源码 | `/Users/lute/project/Magpie-Horch/dsh-task-board-local`（完整 clone，保留 upstream remote） | 便于日后 `git fetch upstream && merge` |
| profile 依赖 | `~/.dsh/profiles/desktop/package.json` → dependencies 增 `"@etony668/dsh-task-board": "file:../../../project/Magpie-Horch/dsh-task-board-local"` | 写前备份 `package.json.bak-<ts>` |
| 装配 | 同文件 `dsh.profile.bundles` 追加 **一条** `"@etony668/dsh-task-board"` | 血训：只写包名，绝不写其 patch 子入口 |
| 视图 tab | `conversation.view` id `taskboard`，**order 30** | 对话 0 · 轨迹 10 · 上下文观测 20 · 任务看板 30 |
| 会话工具位 | `conversation.session.header.utilities` id `dsh-task-board-unread`，order 9999 | 未读点（令牌化后） |
| 模型工具 | `board_get`/`board_revision`/`board_sync`/`task_create`/`task_update`/`task_delete` | 全局注册；工具卡沿用 `{schema, render}` 输出 |
| 技能 | runtime 技能 `dsh-task-board`（+ `metadata.title='任务看板'`） | 技能中心 runtime 层展示 |
| 宿主路由 | `POST /api/task-board`（op: init/get/revision/create/update/delete/sync/layoutSave/seen/diag） | 加围栏后仅 loopback 可用 |
| 数据 | `~/.dsh/taskboards/<sha256(项目根绝对路径)>.json` | D3 保持默认；卸载不删数据 |

## 5. 适配补丁规格（P1–P7）

> 锚点行号对应上游 commit `4e7f97c`。每项补丁执行时附静态断言；改完跑 `node --check lib/index.js lib/client.js`。

### P1 信任围栏 + 去跨请求回退（安全，必做）
- 锚点：`lib/index.js:10`（`let lastProjectPath = null`）、`:539-566`（route handler）、`:559-560`（回退赋值）
- 目标：
  1. 删除 `lastProjectPath` 声明与 559-560 两行；`get`/`revision` 缺 `projectPath` 时由既有 `normalizeProject` 报错（`project_path is required`）。
  2. handler 入口加自包含围栏（不引外部依赖）：`req.socket?.remoteAddress` 非 loopback → `403 {ok:false,error:'task-board api is loopback-only'}`；同时校验 `Host` 头为 `localhost` / `127.0.0.1` / `[::1]`（含端口），`undefined` 视为拒绝。
- 断言：`grep -q "loopback-only" lib/index.js && ! grep -q lastProjectPath lib/index.js`
- 运行时：loopback 无参 `revision` → 200 且 `ok:false`；伪造 `Host: evil.test` → 403。

### P2 输入框坐席隐藏配方对齐（可达性，必做）
- 锚点：`lib/client.js:174`
- 现状：`body:has(.dsh-tb-shell) [data-composer-seat] { display:none !important; }`
- 目标（对齐 dsh-context 配方）：
  `[data-conversation-scroll]:has(.dsh-tb-shell) > [data-composer-seat]:not(:has([data-approval-key],[data-question-key],[data-plan-review-key])) { display:none }`
  即：作用域收进会话滚动容器、仅作用于坐席直属子节点、**保留审批/提问/计划评审三态可见**、去掉 `!important`。
- 断言：`! grep -q 'body:has(.dsh-tb-shell)' && grep -q 'data-plan-review-key' lib/client.js`
- 视觉：看板视图输入框隐藏；触发一次工具审批 → 审批控件仍在且可点。

### P3 tab 位序（确定性，必做）
- 锚点：`lib/client.js:933` → `order: 20` 改 `order: 30`
- 断言：`grep -q "order: 30" lib/client.js`；运行时 tab 顺序为 对话·轨迹·上下文观测·任务看板。

### P4 跳转配方对齐（推荐）
- 锚点：`lib/client.js:836`（handleJump）、`:886`（activateTabBack）、`:910`（activateTab）
- 目标：`activateTab` 收窄为 `document.querySelectorAll('button[role="tab"]')` + 文本精确匹配 + `aria-selected !== 'true'` 才单次 `.click()`；删除五连 `pointerdown/mousedown/pointerup/mouseup/click` 爆破（`activateTabBack` 同法）。`handleJump`（消息内链接捕获）保留，内部改调新 `activateTab`；`actions.setView` 分支保留为可选快路（inject 第二参不可用时自动跳过）。
- 断言：`! grep -q pointerdown lib/client.js && grep -q aria-selected lib/client.js`
- 运行时：点消息内「查看任务看板」链接切到看板；`Tab`/`Esc` 返回对话且不劫持输入框。

### P5 UI 令牌化（推荐）
- 锚点：`:126`（`#e7a84b`×2）、`:134`、`:151`（`#c88a24`）、`:772`（🟢/🔴）、`:819-831`（body 背景探测，保留）
- 目标：
  - 临时任务背景/文字 → `color-mix(in srgb, var(--dsw-alias-state-warn-primary) 20%, transparent)` / `var(--dsw-alias-state-warn-primary)`
  - 未读点 emoji → `<span>` 圆点：未读 `var(--dsw-alias-state-error-primary)`、已读 `var(--dsw-alias-state-success-primary)`，8px / `border-radius:50%` / `transition:120ms`
- 断言：`! grep -qE '#e7a84b|#c88a24' lib/client.js && ! grep -qE '🔴|🟢' lib/client.js`
- 视觉：浅色/深色各验一次；临时任务辨识度保持。

### P6 i18n 热切换 + 技能中文名（推荐）
- 锚点：`lib/client.js:10`（`TB_LANG` 一次性判定）、`:11-60`（词典块）、`lib/index.js:529-537`（skills.register）
- 目标：
  - client：`apply` 内 `const locale = ctx.get('locale')` → `locale.register('task-board', { zh, en })` + `bind('task-board')`；`t()` 走绑定翻译（缺服务时回退本地词典）；`label: () => t('tabLabel')` 保持 thunk 语义以随语言重投影。
  - host：`skills.register` 增 `metadata: { title: '任务看板' }`（本机 `SkillRegistration` 无顶层 `title`；执行时按运行时契约确认技能中心的读取字段，读不到则退回 name 展示）。
- 断言：`grep -q "locale.register" lib/client.js`；host 侧 `grep -q metadata lib/index.js`
- 运行时：切换界面语言 → tab 与看板内文案跟随；技能中心可见「任务看板」（或 `dsh-task-board`）。

### P7 `dsh.client.inject` 声明（推荐）
- 锚点：`package.json` → `dsh.client`
- 目标：`"inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-locale"]`（信息边，与已装 14 个客户端插件惯例一致；`external` 保持为空，因唯一 `require` 是 baseline react）。
- 断言：`node -e "const c=require('./package.json').dsh.client; if(!Array.isArray(c.inject)||!c.inject.length) throw new Error('inject missing')" && echo OK`
- 撤销项：~~`Config { storageRoot }`~~（D3 决定保持上游默认路径）。

## 6. 安装执行契约

```
T0 决策确认（✅ 本轮完成：D1/D2/D3）
T1 fork：git clone（完整历史）→ Magpie-Horch/dsh-task-board-local；记录 commit；白屏硬校验三条
T2 补丁：P1–P7 + node --check + 每项静态断言
T3 装配（回滚点）：备份 profile package.json → 写 deps + bundles（各一条）→ pnpm install
        → 校验 node_modules 关键文件与源 inode 一致（硬链接纪律）
T4 重启（用户操作）→ 启动终态核验
T5 功能/围栏实测 → 分层验收
T6 文档 + 回滚演练说明
```

**回滚（四步，数据保留）**：移除 `deps` 条目 → 移除 `bundles` 条目 → `pnpm install` → 重启；如需彻底清除再删 `~/.dsh/taskboards`（默认保留）。

## 7. 验收标准

**静态/装配**
- [ ] `node -e "require('./package.json').dsh.bundle"` 通过；`cordis.patch.yml` 含 `insert`
- [ ] P1–P7 静态断言全绿；`node --check` 双入口通过
- [ ] profile `deps` 与 `bundles` 各恰增一条；`pnpm install` 退出码 0
- [ ] `node_modules/@etony668/dsh-task-board/lib/{index,client}.js` 与 fork 源同 inode

**启动/装配运行时**
- [ ] `~/Library/Application Support/DSH Desktop/lifecycle-events/startup.jsonl` 末条 `finalStage=health-commit`、`rendererStatus=healthy`
- [ ] 错误日志无 `declares no dsh.bundle` / `plugin tree failed`
- [ ] boot 清单含 `@etony668/dsh-task-board` 条目（用户浏览器侧确认；GUI 有认证围栏，外部 headless 不可达）
- [ ] tab 顺序：对话 · 轨迹 · 上下文观测 · **任务看板**

**功能/围栏**
- [ ] 6 个工具出现在模型工具表（`board_get`…`task_delete`）
- [ ] 技能目录出现 `dsh-task-board`（或「任务看板」）
- [ ] `curl -s -X POST 127.0.0.1:43120/api/task-board -d '{"op":"revision"}'` → `ok:false`（缺 projectPath）
- [ ] 伪造 `Host` 头请求 → 403 `loopback-only`
- [ ] 会话内真跑一次 `board_sync` → `~/.dsh/taskboards/<sha256>.json` 生成、revision 递增、tab 红点变红
- [ ] 看板视图下输入框隐藏；工具审批出现时审批控件仍可见（P2 关键回归项）

**视觉（用户侧）**
- [ ] 浅色/深色两态：卡片、面板、临时任务、完成态、未读点均无硬编码感
- [ ] 窄窗口与长标题不破版；键盘 `Tab`/`Esc` 可用

## 8. 共存语义边界（与既有能力分层）

| 能力 | 层级 | 与 task-board 的边界 |
|---|---|---|
| `todo_write` 工具 | 单次会话的临时待办 | 不进看板；看板放**项目级持久**工作 |
| `goals` 服务 | 单一长期目标 | 目标不等于任务树；看板不做目标生命周期 |
| dsh-agent-team-gui | 多模型小队/任务（**已恢复装载**，view id `agent-team-runs`） | 小队任务与看板为不同域，需另行约定同步 |
| dsh-context | 同 slot 的「上下文观测」视图 | 仅位序邻居；互不覆盖（order 20 vs 30） |

## 9. 后续窗口

- **上游 merge SOP**：保留 upstream remote；每次同步先读 `CHANGELOG.md` 与 `lib/*.js` diff，重放 P1–P7 补丁（补丁以静态断言做幂等检测），再走 T3–T5。
- **2.0.5 升级窗口**：与 `docs/upgrade-2.0.5-window-plan.md` 合并执行；重点复验 `data-composer-seat` / `data-conversation-scroll` / `button[role="tab"]` 三个外壳契约与 `conversation.view` 位序（Catalog 漂移检查）。
- **可选上报上游**：P1（围栏）与 P2（三态排除）是通用缺陷，建议向上游提 issue/PR，减少后续 merge 冲突面。

## 9b. 执行与验收记录（2026-09-10 16:04–16:20 完成）

**执行**：T1 fork 落位 `dsh-task-board-local`（HEAD `4e7f97c`，完整历史 + upstream remote）；T2 适配补丁 P1–P7（15 处编辑）；T3 装配（profile deps/bundles 各 +1，备份 `package.json.bak-taskboard-install-20260910-160431`）。

| 层级 | 检查项 | 结果 |
|---|---|---|
| 静态 | 白屏三件套（dsh.bundle / patch insert / exports["./client"]） | ✅ |
| 静态 | P1–P7 断言 16 项 + 双入口 `node --check` + id 唯一 | ✅ 全绿 |
| 装配 | `pnpm install` 退出码 0；apply-patches 8×`[ok]`；五文件 inode 源≡profile | ✅ |
| 冒烟 | 主机半本地驱动真实路由 7 项 | ✅ 7/7 |
| 启动 | 无 `declares no dsh.bundle`；无新增 `plugin tree failed` | ✅ |
| 工具 | 6 个模型工具进入运行时工具表 | ✅ board_get / board_revision / board_sync / task_create / task_update / task_delete |
| 技能 | 技能目录注册为 runtime 层（266 条，模型+用户可调用） | ✅ |
| 视图 | `conversation.view` 占位 `taskboard` order 30 / active | ✅ 位序：对话0 · 轨迹10 · (agent-team-runs 20 / 上下文观测 20) · 任务看板30 |
| 围栏 | loopback 无 projectPath → `ok:false`；伪造 Host → 403 | ✅ |
| 功能 | 建板 + revision 读取 + 落盘 `~/.dsh/taskboards/<sha256>.json` | ✅ |
| 视觉 | tab / 坐席隐藏 / 审批可见 / 红点 | ⏳ 用户侧确认 |

**执行期发现与处置**
- 日志中 2 条 `plugin tree failed` 经时间戳核验为 **15:01 的历史事件**（`dsh-agent-team-gui: pending (waiting for services)`，即该插件被移出 profile 前的那次启动），与本次安装无关；本次重启后无新失败。
- 同批重启顺带确认 **team-gui 已恢复激活**：`conversation.view` 出现其 `agent-team-runs`(order 20) 占位（§8 共存表中「未装载」一条据此更新为已装载）。
- **低风险未达预期**：技能中心的 `title` 仅对文件型技能生效（251/266），runtime 技能无该字段，故显示名为 `dsh-task-board`；`metadata.title='任务看板'` 已写入定义层。如需中文显示名，需改 `dsh-skill-center-local` 读 runtime 技能的 metadata（另立工作，不在本次范围）。
- 验证产物已清理（`/tmp/tb-verify` 与临时板文件删除，`~/.dsh/taskboards` 为空）。

**用户侧视觉确认清单（剩余）**：① 「任务看板」tab 是否在最后一位；② 进入看板后底部输入框隐藏、切回对话恢复；③ 看板视图下触发工具审批 → 审批控件仍可见可点（P2 关键回归项）；④ 任务变更后未读点由绿转红。

## 10. 证据索引

| 结论 | 证据 |
|---|---|
| 入口治理规则（inject/external 可选、platform 必填、exports 形态） | `app.asar.unpacked/…/@deepseek-ai/dsh-client-modules/lib/index.js:137-166` |
| 槽位选项规范化与 list 排序（priority→order） | `…/@deepseek-ai/dsh-client-ui-slots/lib/index.js:113-137` |
| `conversation.view` 注册契约与实占位（chat 0 / trajectory 10 / context 20） | 运行时 `Slots.listSubTree`（本会话） |
| `openView` 仅当前视图可得 | `dsh-context/lib/client.js:5686-5696`（注释 + `button[role="tab"]` 配方） |
| 坐席隐藏配方对照 | `dsh-context/lib/client.js`（`[data-conversation-scroll]:has(.lc-root) > [data-composer-seat]:not(:has([data-approval-key],[data-question-key],[data-plan-review-key]))`） |
| 外壳属性真实存在 | `…/@deepseek-ai/dsh-client-ui-conversation|ui-chat/lib/client.js` 含 `data-composer-seat` / `data-conversation-scroll` |
| 主题令牌面（11 项，含 state-warn） | 运行时 `Theme.listTokens`（本会话） |
| 会话 header cwd 校验 | `…/@deepseek-ai/dsh-session/lib/index.js:1180-1182` |
| npm 未发布 | `npm view @etony668/dsh-task-board` → 404 |
