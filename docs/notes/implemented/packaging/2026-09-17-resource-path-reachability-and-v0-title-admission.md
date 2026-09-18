# Note · 资源路径可达性门禁 + v0 会话 title 准入（2.5.0 恢复模式事故）

- 日期：2026-09-17
- 对应 ADR：[ADR-0114](../../../adr/ADR-0114.md)
- 关联：ADR-0005（补丁登记）、ADR-0067（产物即证据）、ADR-0075（判据射程）、ADR-0102（分母与四态）
- 现场：T-11 装机后恢复模式；日志 `logs/host/dsh-2026-09-17.log`；`lifecycle-events/startup.jsonl` `finalStage=host-boot`

## Problem

两个各自独立、都不在「补丁打没打上」这个维度上的缺陷，在同一次装机里先后暴露。

### A. 悬空的环境常量（恢复模式的直接原因）

T-11 装完 2.5.0 后应用立刻进恢复模式，`lifecycle-events/startup.jsonl` 末条
`startup.run.failed · finalStage=host-boot`，日志：

```
failed to import loader entry llm-pi-ai (@deepseek-ai/dsh-llm-pi-ai): Cannot find module
'<Resources>/app.asar.unpacked/node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.lazy.js'
```

取证链：

1. `Resources/app.asar` 与 `Resources/app.asar.unpacked` **都不存在**（新产物是 no-ASAR，
   `Resources/app/` 就是普通目录）；旧包 `/Applications/DSH Desktop.app.pre-lute-20260917-210309`
   两者俱在。即路径的**前提在本次产物上不成立**。
2. 全 app 只有一处犯这个错，正是崩点：`dsh-llm-pi-ai/lib/index.js:11` 的
   ``const PI_AI_API_DIR = `${process.resourcesPath}/app.asar.unpacked/...` ``。
3. 离线复现：用该字面量做 `import()` → `ERR_MODULE_NOT_FOUND`，与现场逐字同形。
4. 补丁源头 `packaging/patches/nm/@deepseek-ai/dsh-llm-pi-ai/lib/index.js.patch` mtime
   `Sep 11 10:57`，manifest v3 记为「未漂」——**基座迁到 no-ASAR 时它一字未改**，因为
   「锚点没漂」正是它被记成健康的原因。

于是第一条根因是：**补丁的锚点判据量的是补丁的身份标记，不是产物上的可达性**。
`verify-patches-v2.sh` 的 `ck … "PI_AI_API_DIR"` 亮绿灯，与「装上去能跑」被当成同一件事。

### B. LUTE 自己的 v0 扩展成员让 LUTE 自己的会话读不出来

修完 A、应用起来后，历史会话加载失败：

```
failed to observe session "session-8740ad97-…".@deepseek-ai/dsh-session-format-v0-to-v1
  refuses this format v0 Session: user/message 13 source entries[0] has unexpected member "title"
```

取证链：

1. 解压该会话：55 条 `user/message`，其中 10 条 `source.kind === "skill-catalog"`，
   **每条 87 个条目全部带 `title`**（`{name, description, title}`）。
2. 迁移器 `dsh-session-format-v0-to-v1` 对 `skill-catalog` 条目用精确成员校验
   （`exactRecord(member, label, ["name","description"])`），多一个键即整条会话失败。
3. `title` 是**我们自己的扩展**：`packaging/patches/nm/@deepseek-ai/dsh-tool-skill/lib/index.js.patch`
   的 `catalogSourceEntries()` 从 2.0.5 起就写入 `title`（并同时进了 digest、模型可见目录行与
   读回校验三处），`dsh-api-session-controller/lib/types/skill-catalog.js` 也被 LUTE 同步改过。
   即：**生产面写了它，消费面（迁移器）不知道它**。
4. 射程实测（本机 470 份 v0 会话，走真实 `sessionFormatCatalog.createRestore` 迁移链）：

   | | 修复前 | 修复后 |
   |---|---|---|
   | 可迁移 | **74** | **469** |
   | 失败 | 396（全为 `unexpected member "title"`） | 1（另一缺陷，见下） |

## Decision

详见 [ADR-0114](../../../adr/ADR-0114.md)。落地清单：

- **P0-8 退役**：删除 `packaging/patches/nm/@deepseek-ai/dsh-llm-pi-ai/lib/index.js.patch`，
  上游静态 import 回归（`@earendil-works/pi-ai/api/anthropic-messages.lazy` 等三行），
  解析交给 Node——asar / no-ASAR 两种布局都成立，**不新增路径常量**。
- **迁移器准入 `title`**：`packaging/patches/nm/@deepseek-ai/dsh-session-format-v0-to-v1/lib/index.js.patch`
  把 `title` 加成可选成员并**保留类型校验**（非字符串即红）。用仓库 applier 的同一套标志验证：
  `patch -p1 --forward` 干净应用、二次应用按 `_classify` 报 skip、产出与已部署字节**逐字节相同**。
- **新门禁**：`resource-path-reachability` + `resource-path-reachability-selftest`
  （`scripts/gates/resource-path-reachability.mjs` / `.test.mjs`，接进 `scripts/gate.mjs`）。
- **安装器随身判据**：`packaging/verify-patches-v2.sh` 的 P0-8 断言改为钉上游静态 import
  + 否定式 `ckn`（不得把 `app.asar.unpacked` 写进路径），并补迁移器两条断言。
- **同根因的第二、三处（顺手收掉）**：另有两处**我们自己**的工具/依赖仍钉着旧 asar 路径，
  装完 2.5.0 后一并暴露，按同一原则修掉——
  · `dsh-patches/lint-preset.mjs`（权威家）与其派生副本
    `packages/contract/dsh-preset-lint-local/lib/lint-preset.mjs`：硬编码
    `…/Resources/app.asar.unpacked/node_modules/yaml` → 改为**按两种产物形态探测**
    （no-ASAR 用 `app/node_modules`，asar 用 `app.asar.unpacked/node_modules`），app 不在场时
    退回仓库解析。修复后该包 `typecheck` 变绿、`test` 10/10 通过（含那条**同源守卫**：
    两份 linter 必须逐字节一致）。
  · `packages/capabilities/dsh-overseas-skills/node_modules/@deepseek-ai/{cordis,dsh-tools}`
    两条绝对软链（`ln -s` 于 09-11，指向当时的 `app.asar.unpacked`）→ 重指向
    `app/node_modules/...`，断链解除（ADR-0016 的「包目录层级变化会让链接失效」正是此形态）。

## Alternatives considered

- P0-8 改成布局自适应（`existsSync` 探测）：把可在解析器解决的事留在源码，且引入在 no-ASAR
  产物上**永远走不到**的分支（P-04）。
- 迁移器整体放宽未知成员：会连**真正损坏**的产物一起放过；封闭成员清单是 v0 迁移器的有意策略。
- 让生产面不再写 `title`：为迁就跑通砍掉已上线的用户可见能力，且 396 份历史会话里的 `title`
  已经落盘、删不掉。

## Consequences

- 恢复模式解除；396 份被 `title` 卡死的历史会话恢复可读（870 个 `title` 无损进入 v3 产物）。
- 门禁从「补丁在不在」扩到「路径在产物上可不可达」，且**只钉路径形态**：
  `main.js` 的 `.replace(/app\.asar(?!\.unpacked)/g, "app.asar.unpacked")` 是合法 no-op，
  判它红就是仪器假红——`.test.mjs` 里有专门的反向用例守这条。
- 射程为空的树按**未核实**计数（`checked=0`），不与「已核实」同形；staging/2.4.1（ASAR，
  核心在 `app.asar` 内）据此如实报未核实而非判红。
- **尾债 1（另案）**：`session-6d32eef5` 以 `cannot safely transform unclassified message source`
  被拒，与 `title` 无关（`session-00454adc` 等同族另有 1 例）。
- **尾债 3（本轮未修，均与本次改动无因果关系，已实测取证）**：`scripts-runnable` 有 4 条
  预先存在的脚本失败（`dsh-overseas-skills` 的 TS2345/TS18047、`dsh-team-hub` 的 3 处
  `possibly null`、`dsh-newapp-local` 的 1 个 design-preview 用例）；`release-artifacts-intact`
  以退出码 124（超时）失败——按 ADR-0058，已发布版本产物由仓库外归档负责，需用
  `packaging/scripts/release-restore.sh` 找回。三者都在本轮之前的状态即已失败或超时。
- **尾债 2（判据射程）**：把路径两段拼接或先存变量再传可绕过本门禁；缺口已写在模块头部，
  不假装守住全称。
- staging/2.5.0 树按源码语义就地修正（P0-8 退役 + 迁移器补丁），使装配产物与修正后的
  补丁语料一致；下次真实装配会从 pristine 重放同一语料。
