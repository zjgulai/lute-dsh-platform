# DSH Desktop 白屏排查手册（White-Screen Playbook）

> 适用：DSH Desktop 2.0.4（LUTE Agentic System 品牌版）二次开发
> 更新：2026-09-07（沉淀自同日两次白屏实战）
> 配套：`~/.agents/skills/dsh-desktop-diagnostics/SKILL.md`（AI 诊断侧已同步本手册要点）

---

## 0. 速查卡（20 秒定位）

```
症状：启动日志 rendererStatus=healthy，但窗口左侧主内容区空白（深灰纯色），
      右侧 Files/任务管理 等独立面板正常。
直接错误：日志出现
  [Renderer] Error: renderSlot('root') before any 'root' registration (boot order)
报错源：app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js
         RootOutlet（渲染 root 槽时无任何注册者）
含义：boot 时序竞态 —— root 槽渲染早于注册，不是插件激活失败。
处置：① 若刚新增/修改过插件或刚跑过 pnpm install → 连续完整重启两次；
      ② 若仍白屏 → 按第 4 节排查路径走。
```

## 1. 背景机制（为什么是"root 槽"）

- `dsh-client-ui-layout` 在 `ctx.effect` 中执行 `ctx.slots.register({name:"root", ...}, AppFrame)`，这是**唯一的 root 槽注册者**（左侧侧边栏+会话区+聊天区全部挂在它名下）。
- `dsh-client-ui-renderer` 的 `RootOutlet` 渲染时取 `host.entriesOfSlot("root")[0]`；为空且 `entriesOf("root").length === 0` 时，原版代码直接 `throw SlotAssemblyError` → React 整树卸载 → 主区白屏。
- 右侧 Files/任务管理面板是独立 tab/渲染树，**不经过 root 槽**，所以白屏时它们仍然正常——这是识别白屏的关键特征。
- `startup.jsonl` 的 `rendererStatus: healthy` 只表示所有 client 插件 fiber 已激活（root 已注册），**不代表渲染时刻 root 注册仍在**；healthy 与白屏可以并存。

## 2. 案例 1：新增插件引发冷启动 boot 竞态（2026-09-07 22:18）

- **触发**：新增 `dsh-my-quotes` 进入 `dependencies` + `dsh.profile.bundles` 后冷启动。
- **叠加疑点**：
  - `dsh.client.inject` 声明了宿主不存在的 `@deepseek-ai/dsh-client-runtime`（宿主只有 `dsh-code-runtime`）；
  - `apply()` 内有 `setInterval`（每秒 1 次 × 60）+ 全文档 `MutationObserver`，扰动 boot settle 时序。
- **处置**：从 `package.json` 删除两条目（dependencies + bundles）→ 宿主 pnpm `install --no-frozen-lockfile` → 重启 → 三路证据复查（package.json 0 / lockfile 0 / node_modules 无）。
- **教训**：
  - 新增插件必须 `dependencies` 与 `bundles` **两条目同时写**（缺一会出现 `cannot resolve package` 或组合不生效）；
  - `dsh.client.inject` 只写宿主真实存在的包名（核对：`ls app.asar.unpacked/node_modules/@deepseek-ai/`）；
  - 客户端插件 `apply()` 避免 boot 期高频 DOM 扫描，改为事件驱动或延迟启动。

## 3. 案例 2：pnpm install 后首次启动的一次性竞态（2026-09-07 22:48）

- **触发**：`pnpm install`（增删插件）修改 node_modules 后**立即首次启动**；启动后约 155 秒 root 注册丢失 → 白屏。
- **关键澄清**：日志中 `mcp-client(pixpix) giving up` 紧跟白屏错误，是**时间伴随而非因果**——mcp 重连退避序列 500ms+1s+2s+4s+8s+16s+30s×4 ≈ 155 秒，恰好与竞态窗口重合。对照实验：同样时刻（giving up 后）的第二次启动完全正常。
- **处置**：**连续重启两次**（第二次自愈）。根治补丁见第 6 节（RootOutlet 防御）。
- **教训**：install / 增删插件后，**不要以第一次启动判定成败**；验收标准 = 连续两次冷启动均 `rendererStatus: healthy` 且截图三栏正常。

## 4. 标准排查路径（按序执行）

1. **看生命周期**：`tail -1 ~/Library/Application\ Support/DSH\ Desktop/lifecycle-events/startup.jsonl` 的 `rendererStatus` 与 `finalStage`。
2. **看日志**：`~/Library/Application Support/DSH Desktop/logs/dsh-<日期>.log` 尾部，找 `[Renderer] Error: renderSlot('root')`。
3. **确认白屏范围**：macos-harness 截图。左侧主区空白 + 右侧面板正常 = root 槽问题；整窗全白 = 其他问题。
4. **查组合三路证据**（插件是否真的在组合、是否刚被改动）：
   ```bash
   P=~/.dsh/profiles/desktop
   grep <pkg> $P/package.json        # dependencies + bundles 两条目
   grep -c <pkg> $P/pnpm-lock.yaml   # 应为 1+
   ls -la $P/node_modules/<pkg>      # 包体是否在
   find $P/node_modules -name client.js -newermt "今天 00:00"   # 今天改过哪些 bundle
   ```
5. **对照重启实验**：完整重启一次；若恢复 → 一次性竞态（install 后首启/组合刚变化）；若仍白屏 → 按组合问题深挖（移除最近新增插件、检查 inject 声明）。
6. **深挖（必要时）**：`ELECTRON_ENABLE_LOGGING=1 "…/DSH Desktop" --enable-logging=stderr > /tmp/dsh-debug.log 2>&1` 抓 renderer 完整 console；提取 asar 读 RootOutlet/layout 源码核对注册链。

## 5. 二次开发红线清单（防再发）

1. 新增客户端插件：`dependencies` + `bundles` 两条目同时写；`dsh.client.inject` 只写宿主真实存在的包名。
2. 客户端插件 `apply()`：禁止 boot 期 `setInterval` / 全文档 `MutationObserver` 高频扫描；用事件驱动或首次交互时再初始化。
3. **改 client bundle 一律在应用关闭后改**；改完完整重启，不要依赖 HMR（热更不完整会引发同类竞态）。
4. install / 增删插件后**连续冷启动两次**验收；两次都 healthy + 截图正常才算通过。
5. 改核心 UI 包（`dsh-client-ui-*`）走外科手术纪律：锚点唯一 → `node --check` → `.orig` 原地备份 + 项目目录持久副本 → 完整重启 → 截图验收。
6. 诊断白屏时，`mcp giving up`（启动后 ~155 秒）只是时间伴随，别误判因果；先查 root 槽注册链。
7. 主机内置 pnpm 用宿主版本：`node "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/pnpm/bin/pnpm.cjs" install --no-frozen-lockfile`（Homebrew 全局 pnpm 在本机已损坏）。

## 6. 修复工具箱

### 6.1 RootOutlet 防御补丁（根治，已应用 2026-09-07）
- 位置：`app.asar.unpacked/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js` 的 `RootOutlet`。
- 改法：root 未注册时不再 `throw`，改为 `console.error`（保留诊断文本）+ 渲染 `data-slot-waiting="root"` 的"UI 正在装载…"占位；因 `useSyncExternalStore` 已订阅 root 槽变更，注册到达后自动重渲染恢复。
- 备份与回滚：原地 `client.js.orig`；持久基线 `~/project/Magpie-Horch/dsh-rootoutlet-heal/dsh-client-ui-renderer.client.js.baseline-20260907`。回滚 = `cp client.js.orig client.js` + 完整重启。**该目录刻意保留在仓库根**：手册把它定位为升级后重放补丁时要用的运行时基线资产，不是文档。
- ⚠ **2026-09-11 实测注记**：该补丁**当前不在 2.0.5 基座的打包树里**。`packaging/staging/2.1.0/…/dsh-client-ui-renderer/lib/client.js` 的 `RootOutlet` 仍是原实现——`if (!entry) { … throw new SlotAssemblyError("renderSlot('root') before any 'root' registration (boot order)") }`，无 `data-slot-waiting` 占位文本；两个持久基线同样不含该标记（它们是**补丁前**状态）；`dsh-patches/patches-manifest-v2.md` 中也没有这一项。按 §6.1 自己的「升级注意」，它很可能在 2.0.5 重锚时丢失，**下次白屏诊断前需先确认是否要重放**。
- 升级注意：官方重打包 `.app` 会覆盖该补丁，升级后需重放（锚点漂移时先 diff 再适配）。

### 6.2 插件移除止损（案例 1 用）
- 从 `package.json` 删除 dependencies + bundles 两条目 → 宿主 pnpm install → 重启 → 三路证据复查。

### 6.3 连续重启自愈（案例 2 用）
- install 后首启白屏：直接再完整重启一次，通常恢复。

## 7. 附录：关键命令

```bash
# 桌面 pnpm（宿主内置，勿用 Homebrew 全局 pnpm）
node "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/pnpm/bin/pnpm.cjs" install --no-frozen-lockfile

# 三路证据
P=~/.dsh/profiles/desktop
grep <pkg> $P/package.json; grep -c <pkg> $P/pnpm-lock.yaml; ls $P/node_modules/<pkg>

# 白屏错误检索
grep -n "renderSlot('root')" ~/Library/Application\ Support/DSH\ Desktop/logs/dsh-$(date +%F).log

# 提取 asar 读源码
npx asar extract "/Applications/DSH Desktop.app/Contents/Resources/app.asar" /tmp/dsh-asar/extracted

# renderer 完整 console
ELECTRON_ENABLE_LOGGING=1 "/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop" --enable-logging=stderr > /tmp/dsh-debug.log 2>&1

# UI 验收截图
macos-harness see "LUTE Agentic System"
```
