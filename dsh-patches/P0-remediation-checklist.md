# DSH Desktop 2.0.4 — P0 止血操作清单（只读评审产物，未改码）

> 本清单是「逐条可执行、含锚点校验、可回滚」的**方案文档**，尚未执行任何修改。
> 每条含：症状 → 改哪一份文件 → 精确锚点 → 最小改法 → 校验 → 回滚 → 验收。

## 修改位置判定（先读，避免改错副本）

| 目标 | 位置 | 生效方式 | 备注 |
|---|---|---|---|
| Electron 主进程文件（update-download / electron-runtime / diagnostic-export-worker / main.js） | `app.asar.unpacked/lib/*.js` | **整机重启**（非 Cmd+R） | 改主进程文件；备份 `.orig` |
| Host 侧核心包（dsh-llm / dsh-tool-subagent / dsh-file-reference-local） | **profile override**：复制到 `~/.dsh/profiles/desktop/node_modules/@deepseek-ai/<pkg>` + 版本抬 `-override` 后改 lib | 整机重启 | 官方推荐机制，版本高者胜出 |
| 第三方插件（dshmarket / @zseven-w/dsh-noema） | `~/.dsh/profiles/desktop/node_modules/<pkg>` | 整机重启 | 会被 pnpm 重装覆盖 → 并入 `apply-patches.mjs` 或 vendor |
| 本地 vendor 源（dsh-memory-local = LingShu） | `~/project/Magpie-Horch/dsh-memory-local/src/*` | 重启（file: 依赖） | 改自己 fork 的源，可持续 |

---

## P0-1 关闭无签名更新安装（🔴 Critical · 安全）

**症状**：`validateArtifact` 只校验容器 magic（DMG trailer / DOS+PE 头），无签名/哈希；随后 `shell.openPath`/`spawn` 以完整权限执行下载产物。被劫持的更新端点 = 无签名代码执行。

**文件**：`app.asar.unpacked/lib/update-download.js`

**锚点**（`validateArtifact`，约 278–296 行）：
```js
if (platform === "darwin") {
    if (stat.size < DMG_TRAILER_BYTES) throw invalidArtifact(platform);
    const magic = Buffer.alloc(DMG_TRAILER_MAGIC.byteLength);
    if ((await handle.read(magic, 0, magic.byteLength, stat.size - DMG_TRAILER_BYTES)).bytesRead !== magic.byteLength || !magic.equals(DMG_TRAILER_MAGIC)) throw invalidArtifact(platform);
    return;
}
```

**最小改法（二选一）**：
- A（止血，最快）：环境变量/设置门 `DSH_DISABLE_UPDATE_INSTALL=1`，只下载到临时区 + 提示「手动安装」，不自动 `openPath`/`spawn`。
- B（根治）：下载侧对 `update-manifest` 携带的 `sha512`/`integrity` 做字节级比对，失败 `invalid-artifact`；macOS 追加 `codesign --verify` 校验签名。

**校验**：`grep -c "DMG_TRAILER_MAGIC" lib/update-download.js`（改后仍 = 引用次数一致）；`node --check lib/update-download.js`。

**回滚**：`cp lib/update-download.js.orig lib/update-download.js`（改前先备份）。

**验收**：模拟「下载到非预期字节」→ 安装被拒且日志可见 `invalid-artifact`。

---

## P0-2 修静默 profile 回滚（🔴 Critical · 数据）

**症状**：dshmarket 回滚把 `package.json` 的 dependencies+bundles 还原成操作前快照，**不删 node_modules、零日志** → 「条目消失、日志干净、包体残留」。`main.js:restoreSlot`（健康检查点恢复）同样只还原 package.json/lockfile，不动 node_modules，只写 `dependencyMaterializationPending` 标记。

**文件**：
- `~/.dsh/profiles/desktop/node_modules/dshmarket/lib/backup.js`（写回处：`:172` `writeFileSync(target, content)`、`:186` 写 temp）
- `~/.dsh/profiles/desktop/node_modules/dshmarket/lib/profile.js`（快照读：`readProfileManifestSnapshot` / `readManifestDeps`）

**锚点**（backup.js 写回前）：
```js
writeFileSync(target, content);
```

**最小改法**：
1. 写回 manifest 前：`appendFileSync(logFile, JSON.stringify({event:'rollback', depsBefore, depsAfter, at}))` + 把当前 manifest 另存 `<file>.bak-<ts>`。
2. 回滚后校验 `node_modules/<pkg>` 与 bundles 一致性；不一致时写 `pending-restart` 标记而非静默成功。

**校验**：`grep -c "writeFileSync(target" dshmarket/lib/backup.js`；重放一次失败安装观察日志出现 `rollback`。

**回滚**：改前备份 `backup.js.orig`；或整体 `cp -R dshmarket dshmarket.bak`。

**验收**：触发一次失败安装 → `package.json` 不再被静默改写（或改写必有日志+`.bak`）。

---

## P0-3 修 compaction 崩溃（🔴 High · 上下文）— 已深挖锤实根因

**症状**（实况日志刷屏）：`[basic-compaction-engine] step compaction failed: this.adapters.get(...)?.adapter.imageRequestPricing is not a function; continuing the turn` → 上下文从不真正压缩。

### 根因链（取证锤实）

`modlens` 注册「视觉包装 provider」时，adapter 是**鸭子类型对象**（不继承 `LlmAdapter`），故没有 `imageRequestPricing`；`dsh-vision-router` 的 `ensureAdapterPrepareCall` 只给它补 `prepareCall` 一个方法；`dsh-llm` 在压缩时对该方法做**无守卫调用**（`?.` 在 `.adapter` 上、不在方法上）→ 抛错 → compaction 每步 fail-open。

| # | 事实 | 证据 |
|---|---|---|
| 1 | modlens 注册视觉包装 provider，adapter 为鸭子类型（`stream()` 委托回真实路由） | `@liustack/modlens/dsh/index.js:584-590` |
| 2 | 包装 provider id：`deepseek-modlens` / `modlens-<upstream>` | `modlens/dsh/index.js:610-620` |
| 3 | vision-router 只补 `prepareCall`，自述「duck-typed，不继承 LlmAdapter 默认实现」 | `dsh-vision-router/lib/adapter-update-coalescer.js:7-10,14-60` |
| 4 | `dsh-llm` 对 `imageRequestPricing` 无守卫调用（唯一对方法本身不设防的调用点） | `dsh-llm/lib/index.js:1526` |
| 5 | 基类 `LlmAdapter.imageRequestPricing` 是空实现返回 undefined → 该方法是**显式可选契约** | `dsh-llm/lib/index.js:1170` |
| 6 | 方法注释明言「未知 provider 降级为 undefined 而非抛错」 | `dsh-llm/lib/index.js:1519-1521` |
| 7 | compaction 捕获后 `log + return next()`（fail-open，从不压缩） | `dsh-compaction-basic/lib/index.js:781-793` |

**文件**：核心包 `@deepseek-ai/dsh-llm`（走 profile override，见「位置判定」）。**注意有 2 处调用点，必须同改**：`lib/index.js:1526` + `lib/types/index.js:534`（`types/` 重复副本，漏改会留回归）。

**锚点**（两处代码完全相同）：
```js
imageRequestPricing(provider, model) {
    return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model);
}
```

**最小改法**（可选调用 `?.()`，与基类空实现返回 undefined 语义完全等价，兑现「降级为 undefined」契约）：
```js
imageRequestPricing(provider, model) {
    return this.adapters.get(provider)?.adapter.imageRequestPricing?.(provider, model);
}
```

**profile override 步骤**：
```bash
SRC="app.asar.unpacked/node_modules/@deepseek-ai/dsh-llm"
DST="$HOME/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-llm"
rm -rf "$DST"; mkdir -p "$DST"; cp -R "$SRC/." "$DST/"
node -e 'const p=require(process.argv[1]);p.version=p.version+"-override";require("fs").writeFileSync(process.argv[1],JSON.stringify(p,null,2)+"\n")' "$DST/package.json"
# 然后编辑 $DST/lib/index.js 与 $DST/lib/types/index.js 两处，应用上面的 `?.()`
```

**可选纵深防御（治 vision-router 自身契约）**：在 `dsh-vision-router/lib/adapter-update-coalescer.js` 的 `ensureAdapterPrepareCall` 里，对缺失的 `imageRequestPricing`（及 `providerInfo`/`providerRetryPolicy`/`listModels`）补 `() => undefined` 空实现，使鸭子 adapter 成为完整 `LlmAdapter` 契约。非必需（主修已覆盖），但可防未来同类无守卫调用。

**校验**：
- `grep -c "adapter.imageRequestPricing?." "$DST/lib/index.js"` = 1 且 `"$DST/lib/types/index.js"` = 1；
- `node --check "$DST/lib/index.js"` 与 `"$DST/lib/types/index.js"`；
- 重启后查 error.log 不再出现 `imageRequestPricing is not a function`。

**回滚**：删 `$DST`（回到 app 内置版本）。

**验收**：触发一次长会话压缩后，上下文 token 数实际下降、error.log 无该报错。

---

## P0-4 修 agent-dispose 崩溃（🔴 High · 生命周期）

**症状**：`agent/disposed listener threw: Cannot read properties of undefined (reading 'catch')`。`fiber.dispose()` 返回 undefined 时 `.catch` 抛错。全库共 3 处 `dispose().catch`，仅 1 处（profile 的 dsh-file-reference-local）已修。

**改法**：`Promise.resolve(fiber.dispose()).catch(...)`。

### 4a. `dsh-tool-subagent`（走 profile override）

**锚点**（`lib/index.js:622`，`removeScoped` 内）：
```js
fiber.dispose().catch((error) => {
    ctx.logger.warn(`tool-subagent: failed to remove recomposed Agent "${candidate.id}" definitions: ${String(error)}`);
});
```
**改**：
```js
Promise.resolve(fiber.dispose()).catch((error) => {
    ctx.logger.warn(`tool-subagent: failed to remove recomposed Agent "${candidate.id}" definitions: ${String(error)}`);
});
```

### 4b. `dsh-file-reference-local`（checkout 副本仍是坏的；profile override 已修，同步即可）

**锚点**（checkout `dsh-file-reference-local/lib/index.js:354`）：
```js
const task = fiber.dispose().catch((error) => {
```
**改**：
```js
const task = Promise.resolve(fiber.dispose()).catch((error) => {
```

**校验**：`grep -rn "fiber.dispose().catch" app.asar.unpacked/node_modules/@deepseek-ai/` 应为 0；`node --check`。

**回滚**：删 profile override 目录。

**验收**：派生/结束子代理后，error.log 不再出现 `reading 'catch'`。

---

## P0-5 记忆系统止血（🔴 High · 记忆）

### 5a. Noema 状态路由不再掩蔽故障

**文件**：`~/.dsh/profiles/desktop/node_modules/@zseven-w/dsh-noema/lib/status-route.js:147-149`

**锚点**：
```js
const { ok: _ok, ...status } = await manager.status();
return {
    ok: true,
    ...status,
```
**改**：保留真实值 —— `ok: (await manager.status()).ok,`（不要解构丢弃）。

### 5b. Noema import ledger 原子写

**文件**：`@zseven-w/dsh-noema/lib/import-service.js`（或 `src/import-service.ts:151`）

**锚点**：
```js
await writeFile(path, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 })
```
**改**：写 `path + '.tmp-' + randomUUID()` → `rename` 原子替换（对齐 LingShu mutual.ts 的 tmp+rename）。

### 5c. LingShu 默认 `python`（macOS ENOENT）

**文件**：`~/project/Magpie-Horch/dsh-memory-local/src/index.ts:93`

**锚点**：
```ts
python: z.string().default('python'),
```
**改**：darwin 默认 `python3`，或 `default(process.platform === 'darwin' ? 'python3' : 'python')`。（本机已用 cordis.patch.yml 指向 aeis-venv，但默认值对全新安装仍是坏的。）

### 5d. LingShu `dbPath` 绝对化

**文件**：`~/project/Magpie-Horch/dsh-memory-local/src/index.ts:96`

**锚点**：
```ts
dbPath: z.string().default('data/lingshu.db'),
```
**改**：默认解析到 `DSH_HOME` 下的绝对路径（否则换 cwd 即记忆分裂）。

### 5e. LingShu 跳过子代理简报自动记忆

**文件**：`~/project/Magpie-Horch/dsh-memory-local/src/hooks.ts:114-122`

**锚点**：
```ts
ctx.on('session/event', (_session, event: SessionEvent) => {
    if (event.type === 'user/message' && opts.userMessage) {
      if (event.data.source?.kind !== 'user') return
```
**改**：在 `userMessage` 分支加 `if (event.data.delegationDepth > 0) return`（子代理简报污染知识层的根因）。

**校验**：`node --check` 各自 lib 产物；重启后 `lingshu-bridge-debug.log` 无 ENOENT。

**回滚**：LingShu 改的是本地 fork 源，`git`/`cp` 还原 src 即可。

**验收**：Noema 停服务后设置面板显示「服务不可用」而非「健康」；子代理派发不再新增知识层节点。

---

## P0-6 权限 / 隐私加固（🔴 High · 桌面壳）

### 6a. 加 `setPermissionRequestHandler`（默认全拒）

**文件**：`app.asar.unpacked/lib/electron-runtime-DS52LbUW.js`（`window.webContents.setWindowOpenHandler(...)` 附近，约 851 行）

**改**：新增
```js
window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
```

### 6b. `openExternal` 白名单化

**锚点**（约 851–859 行）：
```js
if (target.protocol === "https:" || target.protocol === "http:" || target.protocol === "mailto:") shell.openExternal(target.href).catch(...)
```
**改**：仅放行 `mailto:` 与显式白名单域名，其余 `return { action: "deny" }`。

### 6c. 诊断导出排除 crash dump + 脱敏

**文件**：`app.asar.unpacked/lib/diagnostic-export-worker.js`

**锚点**（`:96-104` 收集 `.dmp`）：
```js
else if (stats.isFile() && name.toLowerCase().endsWith(".dmp")) entries.push({
    name: `crash-dumps/${relativePath}`,
    path,
    stats
});
```
**改**：默认**不**打包 `.dmp`（进程内存转储），仅统计计数；`active-run.json` 打包前脱敏（去掉 pid/ownerId/timestamp 外的敏感字段）。

**校验**：`grep -c "setPermissionRequestHandler" electron-runtime-*.js` = 1；导出 zip 后 `unzip -l` 确认无 `.dmp`。

**回滚**：`.orig` 还原。

**验收**：网页权限弹窗不再自动放行；诊断 zip 不含进程内存转储。

---

## 执行顺序建议

1. **P0-1（更新器）** → 最高安全风险，先断。
2. **P0-3 + P0-4（compaction / dispose）** → 正在发生的实况故障，最高功能影响。
3. **P0-2（静默回滚）** → 数据完整性。
4. **P0-5（记忆）** → 数据正确性 + 污染。
5. **P0-6（权限/隐私）** → 攻击面收窄。

每条**先备份 → 改 → `node --check` → 重启 → 查日志验收 → 留 `.orig`**。主进程文件与 host 包需整机重启；renderer client bundle 才可 Cmd+R。
