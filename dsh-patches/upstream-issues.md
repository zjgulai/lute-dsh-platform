# 上游 PR / Issue 清单（DSH Desktop 2.0.4 深度检修产出）

> 本清单按「目标仓库 → 条目」组织，每条含：严重度、证据（file:line）、复现、建议修复、关联本地补丁。
> **更新 (2026-09-03)**：本地补丁皆已完全落地，所有严重级别问题在本地客户端已成功闭环防御。提交上游 PR 时请按条目直接粘贴即可。版本基线：桌面内置 `@deepseek-ai/*@0.1.2-alpha.1`，npm 生态 `0.1.1-rc.x`。

## A. dsh-plugin-desktop（Electron 壳）—— 4 issue + 2 PR

### A-1 [Critical] 更新安装器无签名/哈希校验，下载产物被直接执行
- 证据：`lib/update-download.js:278-296`（`validateArtifact` 仅校验 DMG trailer / DOS+PE 容器 magic）；`lib/electron-runtime-DS52LbUW.js:2381`（macOS `shell.openPath` 自动挂载）、`:2408`（Windows `spawn(installerPath, ["--updated","--force-run"])` 直接执行）；`lib/update-checker-Mw2EmLOX.js:113,184`（version 端点 `https://www.dshdesktop.cn/api/desktop/version` 只返回 `version`，无哈希/签名）。
- 复现：劫持下载端点返回任意 DMG/EXE → 校验通过（仅 magic 对）→ 被执行。
- 建议修复：① version 端点增加 `sha512`/`integrity` 字段，下载侧字节级比对，失败即 `invalid-artifact`；② macOS 追加 `spctl --assess` 公证校验；③ 校验失败一律不自动 `openPath`/`spawn`，回退为「下载完成+手动安装」提示。
- 本地止血：已移除自动执行（见 `patches-manifest.md` P0-1）。

### A-2 [Critical] profile 检查点恢复静默还原 manifest、不触碰 node_modules、零日志
- 证据：`lib/main.js:2661-2699`（`restoreSlot` 从 checkpoint 快照 `writeDurable` 还原 package.json/pnpm-lock/pnpm-workspace，只写 `dependencyMaterializationPending` 旁路标记）；`main.js:2555,2578`（boot 时 `recoverOrphanedSlots()` 自动触发）。
- 复现：未干净关闭 → 重启 → 检查点恢复把 package.json 还原到旧快照（插件 deps+bundles 消失）→ node_modules 不还原、主日志零记录 → 「插件静默消失」三件套。
- 建议修复：① 恢复前写主日志（`logError`）与 `.bak`；② 恢复后校验 node_modules 与 manifest 一致性，不一致时显式告警而非静默；③ `dependencyMaterializationPending` 物化失败必须可见。
- 本地止血：已加日志（P0-2）。

### A-3 [High] renderer console 不转发、UI 静默失败对主日志不可见
- 证据：`lib/electron-runtime-DS52LbUW.js:845-850` 无 `webContents.on('console-message')` handler。
- 建议修复：主进程订阅 `console-message` 转发到宿主日志（带 level 过滤）。

### A-4 [High] 无 `setPermissionRequestHandler` + `openExternal` 放行任意 http/https
- 证据：`lib/electron-runtime-DS52LbUW.js:851-859`（`setWindowOpenHandler` 中 http/https/mailto 一律 `shell.openExternal`，无权限请求 handler）。
- 建议修复：加 `session.setPermissionRequestHandler(→deny)`；`openExternal` 白名单化（mailto + 显式域名）。
- 本地止血：已修（P0-6）。

### A-5 [High] 诊断导出打包进程内存转储（`.dmp`）与未脱敏 active-run.json
- 证据：`lib/diagnostic-export-worker.js:96-104`（收集 `.dmp`）、`:158-194`（打包循环含 crash dumps 与 `crash-evidence/active-run.json`）。
- 建议修复：默认排除 `.dmp`（只报计数）；active-run.json 脱敏（去 pid/ownerId）。
- 本地止血：已修（P0-6）。

### A-6 [Medium] PR 建议：`DESKTOP_OWNED_STYLES` 不再锁 `#root` 宽度
- 背景：`html, body, #root { width:100% }` 与第三方面板 `#root { width: calc(100% - var(--w)) }` 级联冲突 → 面板展开中间栏不收缩。本地已改为 `#root` 不锁宽度（`lib/client.js:368`），建议上游合并。

### A-7 [Medium] PR 建议：HMR 热替换失败无恢复重载
- 证据：`dsh-client-hmr/client.js:65-91`（catch 仅 log，失败后无 reload）。
- 建议：热替换失败时回退 `location.reload()` 或标记待重启。

## B. @deepseek-ai/* 核心包（alpha.1）—— 按包分组

### B-1 [High] `dsh-llm`：`imageRequestPricing` 对鸭子类型 adapter 无守卫调用 → compaction 每步崩溃
- 证据：`dsh-llm/lib/index.js:1526` `this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model)`（`?.` 在 `.adapter` 不在方法上）；基类空实现 `:1170`（显式可选契约）；注释 `:1519-1521`（"降级为 undefined 而非抛错"）。
- 触发：第三方鸭子类型 adapter（如 modlens 视觉包装）无此方法 → `TypeError: not a function` → `dsh-compaction-basic:781-793` fail-open → **上下文从不压缩**（实测 error.log 每 ~30s 刷屏）。
- 建议修复：`imageRequestPricing?.(provider, model)`（可选调用，语义与基类空实现等价）。同改 `lib/types/index.js:534`（重复副本）。
- 本地修复：profile override（P0-3）。

### B-2 [High] `dsh-tool-subagent` + `dsh-file-reference-local`：`fiber.dispose().catch()` 应为 `Promise.resolve(...).catch`
- 证据：`dsh-tool-subagent/lib/index.js:622`、`dsh-file-reference-local/lib/index.js:354`、`dsh-file-reference-local/lib/types/index.js:50`。
- 触发：`fiber.dispose()` 返回 undefined → `.catch` 抛 `Cannot read properties of undefined (reading 'catch')` → 实测每次子代理销毁 `agent/disposed listener threw`。
- 建议修复：`Promise.resolve(fiber.dispose()).catch(...)`（全库统一）。
- 本地修复：2 个 override（P0-4）。

### B-3 [High] `dsh-api-session-controller`：`loadOlder` 静默失败四出口 + `hasMore` 状态矛盾
- 证据：源树 `lib/types/client/sessions/session.js:347-367` 仍是原 bug（守卫 `openState !== "open" || !hasMore || loadingOlder` 静默 return、已知失败不打印、无超时）；`failEventStream` 不重置 `hasMore`（按钮渲染但点击必被拦截）。
- 建议修复：合并本地修复（`dsh-chatui-fix/apply-fixes.sh`）：resync 自愈 + 15s 超时 + `openError` 横幅 + 按钮门 `hasMore && openState === "open"` + 失败全 `console.error`。**注意 bundle 已修但 `types/` 源树未修——上游合并后需同步源树。**

### B-4 [Medium] `cordis-plugin-loader`：`EntryGroup.update` 在 fiber 销毁中途泄漏 entry
- 证据：`cordis-plugin-loader/lib/index.js:86-93`（`allSettled` 后 `if (fiber.uid === null) return` 提前返回，不回滚、不入 `this.data` → `stop()` 永不释放）。
- 建议修复：提前返回前回滚已创建的 entry。

### B-5 [Medium] `dsh-cordis-host-runner`：inspect-query 无超时 + pending 泄漏
- 证据：`lib/index.js:813-855`（`queryClient` pending 永挂）、`:796-812`（`resolveClientQuery` 校验失败分支漏 `pending.delete`）。
- 建议修复：加超时 + 所有路径清理 pending。

### B-6 [Medium] `dsh-agent-presets` / `dsh-goal-round-driver`：`invariant.js` 整包复制（~1700 行 ×2）
- 证据：`dsh-agent-presets/lib/index.js`（1701 行）vs `lib/invariant.js`（1719 行）近乎逐字节重复。
- 建议修复：构建期生成 invariant 伴生件，而非复制。

### B-7 [Medium] `lib/types/` 装运行时 JS 而非 `.d.ts`，第三方零静态类型
- 证据：`dsh-cordis-host-runner/lib/types/*.js`、`dsh-agent-presets/lib/types/*.js` 均为编译产物。
- 建议修复：发布真实 `.d.ts`（服务/Slot/`harness.*` 契约）。

### B-8 [Medium] alpha↔rc 无兼容层（结构性问题）
- 证据：`TypertRemoteFailure` rc.2 缺 / `resolveSessionPreset`→`standingMountFor` / `registerProvider`→`ask` / `@deepseek-ai/dsh-client-runtime` 包名 alpha 已改名（7+ 第三方仍注入）。
- 实证：包级 `dsh.client.inject` 对缺失包名**静默容忍**，当前零实际降级；但 rc 系新插件 import 会直接失败。
- 建议修复：发布兼容垫片或 rc→alpha 迁移指南 + 版本对齐策略。

### B-9 [Medium] compaction fail-open + 工具结果裁剪静默丢中间内容 + token 计数 4 字符启发式
- 证据：`dsh-compaction-basic/lib/index.js:781-793`（fail-open）；`dsh-compaction-tool-result-pruner/lib/index.js:90-123`（head+tail，中间不可恢复）；`dsh-token-meter/lib/index.js:15,38,41`（固定 CHARS_PER_TOKEN=4，代码/CJK/emoji 误差 ±4×）。
- 建议：失败至少写入可见状态面；裁剪产生 spill 工件；token 计数升级为近似 tokenizer。

### B-10 [Low] 若干小项
- `cordis/lib/index.js:171-191` `handleError` 负 splice 索引拼错堆栈。
- `dsh/lib/profile-boot-BTzzdrGY.js:161-165` `prepareProfile` 每次 boot 覆盖 `cordis.yml` 为 `[]`（手写行静默丢失）。
- 会话格式 `SESSION_FORMAT_VERSION=0` 无迁移路径（`dsh-session/lib/index.js:38`）。
- `node:sqlite` 同步 `DatabaseSync` 每搜索全量枚举（`dsh-session-query-sqlite:647-753`）。

## C. 第三方插件（各自主仓库）

### C-1 [High] @zseven-w/dsh-noema
- 状态路由硬编码 `ok:true` 掩蔽服务故障（`lib/status-route.js:138-140`）→ 应恢复真实 `ok`。
- import ledger 非原子写（`lib/import-service.js:101`）→ tmp+rename。
- review 队列 append-only 永不清理（inbox=decisions=cortex=232）→ 定期归档。
- 引擎为编译 Rust 二进制且 `noema/` submodule 为空 → 不可审计（建议开放源码或文档化存储协议）。
- 本地已修前两项（P0-5 + apply-patches.mjs 6/7 条）。

### C-2 [Medium] @furongjun1999/dsh-memory（灵枢）
- macOS 默认 `python` → ENOENT（应 darwin 默认 `python3`；`src/index.ts:93`）。
- `dbPath` 相对路径 → 换 cwd 即记忆分裂（`src/index.ts:96`）。
- 自动记忆逐字写入全部 user 消息（含子代理简报），污染知识层（`src/hooks.ts:114-122`；应过滤 `delegationDepth>0` 或加价值门槛）。
- 本地已修（P0-5）。

### C-3 [Medium] @xmanrui/dsh-im
- 注入 rc-only 服务名（`typertGateway`）+ 缺失包 `dsh-client-runtime`。
- 内嵌运行时自更新器（`update.check/install` → 自替换）——安全边界建议明确化（签名校验）。

### C-4 [Medium] dshmarket
- `restoreProfileBackup` 静默还原 manifest（`lib/backup.js:162-199`）→ 加日志 + `.bak`。
- 本地已加日志（P0-2 + apply-patches.mjs 第 8 条）。

### C-5 [Medium] @liustack/modlens + dsh-vision-router
- 视觉包装 adapter 为鸭子类型、缺 `imageRequestPricing`（`dsh-vision-router/lib/adapter-update-coalescer.js:7-60` 只补 `prepareCall`）→ 是 B-1 崩溃的直接触发方。建议 `ensureAdapterPrepareCall` 补全 `LlmAdapter` 契约空实现。

## D. 投稿建议

1. 优先级：A-1（安全）> A-2（数据）> B-1/B-2/B-3（活跃故障）> 其余。
2. 每条附「复现日志」：`~/Library/Application Support/DSH Desktop/logs/dsh-*.log` 中对应片段。
3. 本地修复均已在 `Magpie-Horch/dsh-patches/` 留档（锚点 + 回滚），PR 可直接引用本地 diff 意图。
