# Loop 2.4 输入 · 六处 DRIFT 的逐项取证（2026-09-11 实测）

问题：verify-patches.sh 报告的 6 处 DRIFT，是「补丁真的失效」还是「锚点字符串陈旧」？
结论：**全部是后者**——补丁本体都在当前产物里，锚点比对的是已不存在的旧标记。

| # | 锚点 | 期望 | 实测 | 补丁本体是否在 | 判据 |
| --- | --- | --- | --- | --- | --- |
| 1 | P0-5 LingShu python3 | 1 | 空 | ✅ 在（`$LING` 解析后命中 1） | 路径失效（已修） |
| 2 | P0-5 LingShu depth 过滤 | 1 | 空 | ✅ 在（同上） | 路径失效（已修） |
| 3 | P0-3 override 版本 | 1 | 空 | ✅ 在：`adapter.imageRequestPricing?.` 在 app 与 profile **各命中 1** | 版本标记陈旧 |
| 4 | P0-4 tool-subagent override | 1 | 空 | ✅ 在：`Promise.resolve(fiber.dispose())` 在两侧**各命中 1** | 版本标记陈旧 |
| 5 | override dsh-file-reference-local 版本胜出 | 1 | 0 | ✅ 在：该包 app 与 profile **逐文件零差异** | 机制已不存在 |
| 6 | P0-7 首启占位替换 hook | 1 | 0 | ✅ 在：`P0-7v2 LUTE 首启兜底`、`P0-7v2c` 注释命中 3；`__DSH_HOME__` 命中 2；`clearDesktopSetupWizardStateSync` 命中 3 | 注释字符串陈旧 |

## 关键机制发现

三个 override 包（dsh-llm / dsh-tool-subagent / dsh-file-reference-local）的
**app 侧与 profile 侧文件逐文件零差异**（`diff -rq` 差异文件数 = 0）。
即 rc 基座迁移后，补丁是**直接打进应用 bundle**，`profiles/desktop/node_modules`
的 override 副本不再承担任何作用。

因此这三处锚点校验的「profile 版本 > 应用版本」判据**测的是一个已不存在的机制**，
不是补丁失效。`0.1.2-alpha.1-override` 这个版本标记在全仓 **0 命中**，同样属旧机制残留。

## 待决策（两条路，各锚点可独立选择）

A. **重锚**：把锚点改为校验「补丁内容在应用产物中存在」。事实依据充分（见上表判据列）。
   适用于：3（P0-3 版本）、4（P0-4 override）、6（P0-7 hook）。
B. **退役**：删除锚点，理由是它测的机制已不存在，且其覆盖的补丁内容**已被同文件内的内容锚点覆盖**
   （P0-3 的 `imageRequestPricing?.`、P0-4 的 `Promise.resolve(fiber.dispose())` 各自都有独立锚点）。
   适用于：5（file-reference 版本胜出 —— 该包无对应内容锚点，故退役前需确认是否补一个内容锚点）。

## 不变量（无论选哪条）

- 锚点必须测**当前真实存在**的东西，否则它只会制造假 DRIFT，训练人忽略输出。
- 「缺失/不匹配必须响亮」的机制已在 Loop 2.2 建立（`require_dir` + `[MISSING]`）。

---

## 追加取证（同轮）：glob 修好后又暴露的真问题

### A. 锚点腐化的根因已定位：内容哈希文件名

`electron-runtime-<hash>.js` 的哈希**随上游每次构建变化**。锚点曾写死
`electron-runtime-DS52LbUW.js`，而当前产物是 `electron-runtime-DLNj0vyk.js`
——四个 P0-1 锚点因此全部返回空值，却被读成「0 次命中」（其中两个期望值正好是 0，于是**假通过**）。

**这就是「重锚 3-5 人日/窗口」的主要成因。** 已修为 glob 定位
（`ls "$CHK"/electron-runtime-*.js | head -1`）+ 找不到时显式 `[MISSING]`。

### B. glob 修好后暴露：P0-1 补丁内容不在当前 bundle 里

| 危险调用 | 锚点期望 | 实测命中 |
| --- | --- | --- |
| `shell.openPath(artifactPath)` | 0（期望已移除） | **1** |
| `launchWindowsUpdateInstaller(artifactPath)` | 0（期望已移除） | **1** |
| `setPermissionRequestHandler` | 1 | 1 ✅ |
| `downloadAndOpenUpdate`（P0-1v2 的 throw 入口） | — | 2 |

`patches-manifest-v2.md` 记 P0-1v2 锚在 `electron-runtime-DLNj0vyk.js` **同一文件**，
而当前 bundle 正是该文件名——说明**文件对得上，补丁内容对不上**：
`downloadAndOpenUpdate` 的 throw 守卫在（2 处），但两个「已移除」的危险调用仍在。

**结论（待你决策，不是我能单方面定的）**：P0-1 是安全类补丁（更新器自动执行）。
三种可能，需要重跑一次应用补丁流程才能分辨：
1. rc 迁移重建 bundle 时补丁丢失；
2. 补丁只作用于另一处代码路径，而这两处是**未被覆盖的新入口**；
3. 补丁有意放宽（需有对应决策记录——目前没查到）。

**这是 Loop 2 真正要抓的东西**：不是「锚点字符串陈旧」，而是**锚点守着一个已经失守的补丁**。
在分辨清楚前不要挪动这些锚点的期望值——把它们改成 1 只会把失守掩盖掉。

## 当前锚点统计

```
24 ok / 6 drift
剩余 drift：P0-1 ×2（上面的真问题）、P0-2 main.js restore 日志、P0-3 ×2、P0-7（P0-2/P0-3/P0-7 为陈旧标记类，判据见上表）
```

---

## P0-1 复现实验结论（2026-09-11 · 请求的复现实验已完成）

### 问题

P0-1 是安全类补丁（无签名更新器）。它的移除操作是否还在当前产物里？

### 三类证据

**① manifest 明确记载了它该做什么**
`patches-manifest.md:12`：
> P0-1 | 无签名更新器 | `app.asar.unpacked/lib/electron-runtime-**DS52LbUW**.js` |
> 移除 `shell.openPath`/`launchWindowsUpdateInstaller` **自动执行**；
> `macInstallInstructions` 文案改「已下载」 | `cp .orig`（含 P0-1 前状态）

**② 备份原件与当前产物都没移除**

| 危险调用 | `.p01.orig`（补丁前） | 当前产物 |
| --- | --- | --- |
| `shell.openPath(artifactPath)` | 1 | **1** |
| `launchWindowsUpdateInstaller(artifactPath)` | 1 | **1** |

原件与产物都含这些调用 → **移除操作从未落到当前这一代 bundle 上**。
（同一代的 P0-1**v2** throw 守卫**是**在的 —— 见下 —— 所以不是「整代补丁都没打」。）

**③ 代码是活的，不是死代码**

```js
if (platform === "darwin") {
  const openError = await shell.openPath(artifactPath);   // ← 自动打开安装包
  if (openError !== "") throw new Error(/* ... */);
  signal.throwIfAborted();
  await this.showUpdateMessageBox({ /* detail: copy.macInstallInstructions */ });  // ← 文案仍是旧版
}
```

`openPath` 在 darwin 分支内被真实 await 调用；紧随其后的 `macInstallInstructions`
文案也**没有**被改成 manifest 要求的「已下载」。两处都未生效。

### 结论：属于「情况 1」——迁移重建 bundle 时补丁丢失

P0-1 的**移除型**改动没有随 rc 迁移重放，而**守卫型**改动（v2 的 throw）在。
差别在于锚定方式：
- P0-1v2 用**稳定锚**（`downloadAndOpenUpdate` 入口，函数名不随构建变化）→ 重放成功；
- P0-1 用**文件哈希名**（`electron-runtime-DS52LbUW.js`）→ 哈希一变，补丁无处可落，静默失效。

**这是与锚点腐化同源的缺陷**：补丁的定位依赖了随上游构建变化的东西。

### 待你决策（两条路）

**A. 按原设计补做移除**（推荐，理由见下）
把 `shell.openPath(artifactPath)` 的自动执行改为「只提示已下载、由用户手动打开」，
并同步 `macInstallInstructions` 文案。依据充分：manifest 有明确记载、代码是活的、
属安全类 P0。改动点是单个 bundle 文件内的两处，可控。

**B. 判定为有意放宽并退役该补丁**
若 rc 之后上游已自行修好无签名更新问题（需证据，目前**未查到**任何决策记录），
则应补一篇 ADR 说明放宽理由并退役锚点。**在没有该证据前不建议选 B。**

### 无论选哪条：锚点必须改为哈希无关

现有的 4 个 P0-1 锚点已改为 glob 定位（本轮完成）。但**补丁本身**若仍以文件哈希名
定位，下次上游构建还会丢。修法是让补丁脚本用稳定锚（函数名/代码片段）定位文件。
