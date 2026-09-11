# dsh-browser 移植到桌面主机 alpha API 对照清单

> 目标：把 `dsh-browser-local`（依赖 npm rc 生态 `0.1.1-rc.x`）移植到 DSH Desktop 桌面主机内置的 **alpha 生态（0.1.2-alpha.1，未发布）**。

## 背景

桌面主机的 `app.asar` 内置的是未发布的 alpha 版本，与 npm 上的 rc 版本已经分叉。browser 功能的核心 `@deepseek-ai/dsh-host-apiproxy` 在桌面主机里**根本不存在**，因此需要 vendor 进来并整体移植，而不是简单改几个导出。

---

## 一、包级差异

| 包 | 桌面主机 alpha | 处理 |
|---|---|---|
| `@deepseek-ai/dsh-host-apiproxy` | ❌ 无此包 | **browser 核心**（`apiProxy` 服务 + `toFetchHandler` / `RpcId`）。需 vendor 进本地项目后整体移植 |
| `dsh-host-webserver` | ✅ 有 | 导出有差异（见下表） |
| `dsh-invariants` | ✅ 有 | 导出有差异（见下表） |
| `dsh-home-paths` / `dsh-host-directory-picker` / `dsh-native-command` / `dsh-llm` / `dsh-tools` / `dsh-cordis` | ✅ 有 | 无差异，直接用 |

---

## 二、导出级差异（已逐项核实）

| 包 | rc 导出 | alpha 替代 |
|---|---|---|
| `dsh-agent-presets` | `resolveSessionPreset(session)` | 活 agent：`standingMountFor(agentCtx)?.presetId`；持久化 session：`agentPresetProjectionDefinition`（`init: header.agentPreset ?? null` + 折叠 `agent-preset/selected` 事件） |
| `dsh-user-questions` | `registerProvider(provider)` | `ask(request)` **直调**（无 provider 注册） |
| `dsh-host-webserver` | `WebRoute` / `WebUpgradeRoute`（类型） | `webServer.register({ kind: "exact" \| "prefix", path, handler })` / `webServer.registerUpgrade({ path, handler })` |
| `dsh-invariants` | `InvariantInstaller` | `InvariantRegistry`（默认导出） |
| `dsh-typert-protocol` | `TypertRemoteFailure`（rc.2 缺失） | alpha **有** `TypertRemoteFailure`，对齐版本即可 |

---

## 三、运行时冲突

| 错误 | 处理 |
|---|---|
| `typert: lookup "agent" resolver is already configured` | `dsh-host-apiproxy` 重复注册了桌面主机**已经配置好**的 typert `agent` resolver，需去掉这段重复注册 |

---

## 四、服务 API 架构级变化（最难的点）

- **`userQuestions`**：rc 是「provider 注册模式」→ alpha 是「直接 ask 模式」。
  - 原来：`ctx.userQuestions.registerProvider({ ask(request) { ... } })`
  - 现在：`await ctx.userQuestions.ask({ questions, signal, agent })`

---

## 五、建议移植路径

1. vendor `@deepseek-ai/dsh-host-apiproxy`：复制 rc 源码到本地项目（`packages/` 下或新目录）。
2. 逐项替换第二节的 5 处导出差异 + 第四节的 `userQuestions` 调用模型。
3. 去掉 typert `agent` resolver 的重复注册。
4. 对齐 `dsh-typert-protocol` 到 alpha（顺带解决 `TypertRemoteFailure`）。
5. 编译 → `dsh plugin add <本地路径>` 重新安装 → 验证。

---

## 六、参考（桌面主机 alpha 源码位置）

- 提取后的 app.asar：`/tmp/dsh-asar/extracted/node_modules/@deepseek-ai/`
- 需核对的包：
  - `dsh-host-webserver/lib/index.js`（`webServer` 服务：`register` / `registerUpgrade`）
  - `dsh-invariants/lib/index.js`（`InvariantRegistry`）
  - `dsh-user-questions/lib/index.js`（`ask(request)`）
  - `dsh-agent-presets/lib/index.js`（`standingMountFor` / `agentPresetProjectionDefinition`）
  - `dsh-typert-protocol/lib/index.js`（`TypertRemoteFailure`）
