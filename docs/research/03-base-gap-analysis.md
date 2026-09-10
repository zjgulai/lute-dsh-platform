# DSH 基座差距分析：LUTE 2.0.4/alpha.1 vs 上游 anywhere-labs/dsh-desktop

> 生成：2026-09-09（deep research 阶段产物）
> 上游仓库：https://github.com/anywhere-labs/dsh-desktop（默认分支 master；tag v2.0.0…v2.0.5、v2.0.5-beta.1）
> 运行时代码：deepseek-harness 子模块 → https://github.com/deepseek-ai/deepseek-harness
> 本地基线：DSH Desktop 2.0.4（dsh-plugin-desktop@2.0.4）+ @deepseek-ai/dsh-*@0.1.2-alpha.1（129 包）
> 姊妹报告：`01-current-base-inventory.md`（本地盘点）、`02-upstream-dsh-desktop-dive.md`（上游侦察）

---

## 0. 一页结论

1. **上游已把整个生态迁离我们的基线。** 稳定版 v2.0.5（2026-09-03）把运行时从 `0.1.2-alpha.1` 换成 `0.1.2-rc.1`；v2.0.5 发布说明原文警告「上游更新可能会导致很多插件不可用」。实测：本 profile 内 13 个 npm 插件的最新版中，dsh-context / better-sidebar / genui / vision-router / dshmarket 等已全部声明 `dsh-*@0.1.2-rc.1` 依赖——**LUTE 当前停留在 alpha.1 兼容孤岛上**。
2. **LUTE 的关键补丁上游一个都没修。** 逐文件核实 rc.1 与 v2.0.5 源码：B-1（imageRequestPricing 无守卫）、B-2（fiber.dispose().catch）、A-1（更新器只验 DMG/PE magic，无哈希签名）、A-2（restoreSlot 静默还原）、A-3（renderer console 不转发）在 v2.0.5 全部原样存在。**升级 2.0.5 ≠ 能删补丁**，而是要把 35 个文件级补丁全部重新锚定到 rc.1 产物上。
3. **上游 master 有真进展但未发布**：`architecture/local-window-security-policy`（窗口安全策略中心化，疑似对应我们的 P0-6）、`profile-transition-ownership`、selective-ASAR 打包优化等已合并 master（领先 v2.0.5 共 138 commits），但无 release。
4. **上游新增了 beta 重写线**（dsh-plugin-desktop-beta）：TS/React 源树 + ~90 个测试文件的完全重写，带安全模式/快速恢复/兼容切换；与稳定版共存、共享数据。工程质量高，但属长期方向，不是今天的增量。
5. **建议路径**：短期冻结 2.0.4+alpha.1（现状已深度验证、32 锚点全绿），做「选择性吸收」；中期建 rc.1 平行评估环境逐插件验证；rc 迁移作为独立大版本立项，不做隐性大爆炸。

---

## 1. 版本坐标系（四条线）

| 线 | 版本 | 运行时 | 状态 |
|---|---|---|---|
| **LUTE 本地** | 2.0.4（lute 1.2.2 打包） | 0.1.2-alpha.1（129 包齐锁） | 生产交付中 |
| 上游 stable | v2.0.5（tag，2026-09-03） | **0.1.2-rc.1**（pin a66e470） | 已发布 |
| 上游 master | 无 tag，138 commits ahead | beta 线试 0.1.3-alpha.1 | 活跃开发 |
| 上游 beta 重写 | v2.0.5-beta.1 | 0.1.2-alpha.2→alpha.5→0.1.3 | 与稳定共存 |

npm 上 0.1.2 系列完整阶梯：`alpha.1（我们）→ alpha.2/3/4/5 → rc.1（2.0.5 stable）→ 0.1.3-alpha.2 → 0.1.5-alpha.1/.2（未来线）`。本地 213 个 dsh-* 包（含未入依赖的）**全部存在 rc.1 及更新版本**——包名未变，无改名断崖；变化在 API 面与布局（monorepo 重组为 50 个领域目录，如 packages/client/ui-chat）。

## 2. 基座逐项差异

### 2.1 桌面壳 dsh-plugin-desktop（2.0.4 → v2.0.5 → master）

| 项 | 2.0.4（本地） | v2.0.5 | master（未发布） |
|---|---|---|---|
| 源码形态 | 打包产物 lib/*.js（本地直补对象） | 转为 src/*.ts + tests/*.spec.ts 源树 | 同左，继续演进 |
| 安全模式/快速恢复 | 无（本地以 P0-7 首启兜底 + 安装器幂等补偿） | ✅ 新增 safe-mode.ts、quick recovery | 继续打磨 |
| 恢复助手 bug 修复（切 profile 二次操作/新建卡顿/删除后加载） | 存在 | ✅ 修复 | ✅ |
| 兼容 profile 切换流程 | 无 | ✅（警告稳定/beta 交叉加载） | ✅ |
| agent-preset 兼容（改名预设会话续跑） | 无 | ✅ agent-preset-compat.ts | ✅ |
| 更新器签名校验（A-1） | 无（magic only） | ❌ 仍是 magic only | 未发布修复 |
| setPermissionRequestHandler（A-4） | 无 | ❌ 未发现 | ⚠️ local-window-security-policy 分支已合并，疑似修复 |
| renderer console 转发（A-3） | 无 | ❌ | 未确认 |
| restoreSlot 日志（A-2） | 无 | ❌ | 未确认 |
| Electron/Node | 43.3.0 / ^22.19\|\|>=24 | 待补（子代理报告） | 待补 |
| 市场包 dshmarket | 1.17.1（app 内置） | 1.38.1 | 1.45.1（npm） |

### 2.2 运行时 @deepseek-ai/dsh-*（alpha.1 vs rc.1）

- 版本：0.1.2-alpha.1 → 0.1.2-rc.1；包名集合几乎一一对应（本地 213 包在 npm 全部有 rc.1+）。
- monorepo 重组：129 细粒度包 → packages/ 下 50 个领域目录（acp/api/attachment/boot/bundle/client/…/typert/util/web/…），发布包名不变。
- rc.1 新增包（本地 alpha.1 没有）：`session-title-all-prompts-llm`、`session-turn-outline`、`ui-schedule`、`guard`、`lsp`+`tool-lsp`+`lsp-stdio`、`e2b`/`fs-e2b`/`subprocess-e2b`、`web-search-exa`、`web-search-perplexity`、`agent-team` 系、`subagent-codex/claude-code/acp/dsh-sdk`、`llm-replay`/`llm-mock-server`、`storage-sqlite`、`session-snapshot`、`webworker-runtime` 等。
- B-8 记录的结构性破坏点（rc 线 API 变化）：`TypertRemoteFailure`、`resolveSessionPreset→standingMountFor`、`registerProvider→ask`、`dsh-client-runtime` 改名——第三方 alpha.1 插件 import 直接失败。

### 2.3 关键补丁修复状态矩阵（逐文件核实，2026-09-09）

| 本地补丁 | 上游 rc.1 / v2.0.5 是否修复 | 证据 |
|---|---|---|
| P0-1 更新器免签执行 | ❌ 未修 | update-download.ts validateArtifact 仍仅 DMG trailer/DOS magic |
| P0-2 restoreSlot 显性化 | ❌ 未修 | profile-checkpoint.ts 无 console.error/.bak 痕迹 |
| P0-3 imageRequestPricing | ❌ 未修 | packages/llm/llm/src/index.ts:660 仍 `?.adapter.imageRequestPricing(provider, model)` |
| P0-4 fiber.dispose().catch | ❌ 未修 | packages/subagent/tool-subagent/src/index.ts:675 仍 `void fiber.dispose().catch(...)` |
| P0-5 记忆/noema | 第三方包，N/A | 本地独立维护 |
| P0-6 权限/隐私 | ❌ stable 未修 | v2.0.5 electron-runtime.ts 无 setPermissionRequestHandler；⚠️ master 有 local-window-security-policy 分支 |
| P0-7 首启占位 | 部分 | 上游 2.0.5 新增兼容切换/safe-mode，但 LUTE 的 __DSH_HOME__ 占位逻辑是自家安装器语义，仍需保留 |
| P0-8 pi-ai 磁盘加载 | ❌ 未修（未知） | 待 rc.1 包内核实 dsh-llm-pi-ai 是否仍静态 lazy import |
| UI-1 ErrorBoundary | 未知 | 上游 beta 有 renderer-health.ts / boot-health；stable 未见 |
| UI-3/4、LB-1~3、chatui-fix、skill-title、clipboard | 大部分未修 | 属产品化定制，升级后按锚点重放 |

**推论**：基座升级到 2.0.5/rc.1 不会减少补丁总量，只把「已验证锚点」清零重锚——这是成本最大项，也是支持「选择性吸收」而非整体升级的主要论据。

## 3. 生态兼容性证据（决定升级紧迫度）

本 profile 13 个 npm 插件：**已装版本 vs npm 最新版 vs 最新版的 dsh 依赖面**：

| 插件 | 已装 | npm 最新 | 最新版依赖的 dsh 线 |
|---|---|---|---|
| dsh-context | 0.38.1 | 0.47.0 | `>=0.1.2-rc.1` ⛔ |
| dsh-better-sidebar | 0.17.1 | 0.18.1 | `0.1.2-rc.1` ⛔ |
| @changfenhuang/dsh-genui | 0.9.6 | 0.9.9 | `rc.1 \|\| 0.1.5-alpha.1` ⛔ |
| dsh-vision-router | 2.0.1 | 2.1.4 | `rc.8/rc.1/0.1.3-alpha.2` ⛔ |
| dshmarket | 1.36.0 | 1.45.1 | `rc.7/rc.2/alpha.2` ⛔ |
| @zseven-w/dsh-noema | 0.1.0-rc.3 | 同 | 0.1.0-rc.6 + `dsh-client-runtime`（已改名包）⛔ |
| dsh-pocket | 2.8.0 | 2.10.3 | 无 dsh 依赖 ✅ |
| @xmanrui/dsh-im | 4.1.0 | 4.18.0 | 无 dsh 依赖 ✅ |
| @liustack/modlens / modsearch | 3.25.2 / 5.10.0 | 3.26.1 / 5.10.2 | 无 dsh 依赖 ✅ |
| @linxin666/git-graph | 0.3.6 | 0.3.19 | 无 dsh 依赖 ✅ |
| @tt-a1i/archify-dsh | 0.1.0 | 同 | 无 dsh 依赖 ✅ |
| @dhicoc/dsh-reverse-skill | 1.0.5 | 同 | cordis 4.0.1 + dsh-skill@0.0.1-rc.1 |

**结论**：6/13 插件的最新版已放弃 alpha.1（⛔），7/13 与运行时无关可随时升。产品内 `dsh-browser-local`（@yuxianglin/dsh-bridge-browser 0.0.3-alpha.1-port）是 LUTE 把 rc 版「apiproxy 面替换」回 alpha.1 的自研移植——证明第三方源头已经 rc 化。**生态漂移是真实且持续的：每季度都会有更多插件只发 rc 版。** 这构成 rc 迁移的紧迫度，但不构成今天大爆炸的理由。

## 4. 稳定性维度

### 4.1 上游 2.0.5 的真实稳定性收益
- 恢复助手三个已知 bug 修复（切换/新建/删除 profile 场景）——LUTE 客户真机价值高（P0-7 兜底路线曾踩过）。
- 安全模式（隔离环境 + 退出即删）：客户环境破坏后的快速自救。
- agent-preset-compat：上游自己改过 preset 名，2.0.5 兼容旧名会话续跑——对 LUTE 12 个岗位化预设的升级保护有参考价值。
- master 上已合但未发：local-window-security-policy、selective-ASAR 打包（启动性能）、profile-transition-ownership。

### 4.2 升级自身的稳定性风险
- rc.1 是运行时大换血（129 包重组+API 变化），官方发布说明自认「很多插件不可用」。
- 我们的 35 个文件级补丁/32 锚点全部要重锚 + 语义复核（打包 hash 全变）。
- profile 30 插件逐一冒烟（6 个 ⛔ 插件必须等其 rc 版适配或自研移植，如 dsh-browser-local 先例）。
- 客户存量安装：升级安装器需处理 alpha.1→rc.1 的会话/存储兼容（storage-sqlite、session-projection 等格式是否迁移，未验证）。

### 4.3 冻结的风险（不升级）
- 生态漂移持续（插件不再发 alpha.1 版）。
- 上游安全修复不会落到我们基线（但本地已有 P0-1/P0-6 等止血）。
- 新客户问题如「DeepSeek request extension preparation failed」类只能自研（P0-8 已证明自研可行）。

## 5. 路径选项（待与用户逐项讨论）

| 路径 | 内容 | 兼容性 | 稳定性 | 工作量 |
|---|---|---|---|---|
| **A 冻结** | 维持 2.0.4+alpha.1，只做产品插件迭代 | 满分（已验证） | 高（现状） | 0 |
| **B 整体升级** | 一步到 2.0.5+rc.1，全量重锚+全插件冒烟 | 大爆炸风险 | 短期下降 | 极大 |
| **C 选择性吸收（推荐）** | 冻结基座；把 2.0.5 高价值壳特性（安全模式/恢复修复/预设兼容）与 rc.1 新包中低耦合项回移为本地补丁/插件 | 满分 | 渐进提升 | 中 |
| **D 平行 rc 轨道** | 另建 rc.1 测试 profile（~/.dsh/profiles/rc-eval），逐插件验证，成熟后切换 | 隔离 | 可测可控 | 中（前置） |

推荐：**C + D 并行**——D 提供 C 的事实基础与未来迁移的回归资产；A/B 均不取（A 慢性漂移、B 一次性风险过大）。最终 rc 迁移作为独立版本（如 2.0.0）立项，走完整冒烟（L1-L4）后再发客户。

## 6. 待讨论决策清单（供逐项访谈）

1. 升级主路径：C+D 是否认可？还是坚持 B（追最新）或 A（冻结）？
2. C 的候选吸收项排序：安全模式 / 快速恢复 / agent-preset-compat / master 安全策略分支——哪些值得回移？
3. rc 新包候选（session-turn-outline、web-search-exa、guard、agent-team…）是否有业务价值？
4. 无 dsh 依赖的 7 个插件是否立刻升到最新（pocket/im/modlens/modsearch/git-graph/archify/reverse-skill）？
5. ⛔ 6 个插件的升级节奏：等上游 rc 适配版 vs 自研移植（browser-local 先例）？
6. dshmarket 双版本（app 1.17.1 / profile 1.36.0）治理与市场通道策略。
7. rc 迁移立项时间窗与验收标准（L1-L4 冒烟矩阵复用）。
8. 上游 master 的安全策略分支是否值得以「预打补丁」方式提前回移 P0-6 等价物。

---

## 7. 上游侦察补录（2026-09-10 子代理 B 全量证据）

- **仓库身份**：anywhere-labs/dsh-desktop 由 deepseek-harness-desktop 改名而来；24,778 star / 1,198 fork / 349 open issues；社区项目非 DeepSeek 官方。
- **版本序列**：v0.1.0(08-13) → v2.0.0(08-15) → … → v2.0.4(08-28, 本地基线) → v2.0.5-beta.1 + v2.0.5(09-03)。master = **dsh-plugin-desktop 2.0.6-dev**（stable pin 0.1.2-rc.1，beta 包 2.0.6-beta.1 pin 0.1.5-alpha.2），领先本地 176 commits。
- **会话格式迁移**：上游新线含 **V2→V3 JSONL 会话迁移**逻辑——alpha.1→rc.1 数据兼容存在官方迁移代码，但未验证覆盖 LUTE 的存量数据形状。
- **新增包**：`@agents-anywhere/dsh-bridge-next`（AA 桥）、`dsh-util-time`；`dsh-community-fabric` 为纯文档 RFC（33 文件，8-16 后休眠）。
- **质量榜**：① dsh-plugin-desktop（69k 行，测试 29k≈源码 32k，1274 测试，双语厚文档，日更）② dsh-plugin-desktop-beta（1297 测试）③ dsh-community-market（263 测试+SECURITY.md，private）④ fabric（纯文档）。
- **稳定性风险登记（B 路径门禁依据）**：#858 2.0.5 全新安装不可用；#893 自愈/迁移剪枝清空 app.asar.unpacked 依赖（死亡螺旋）；#892 端口冲突循环进恢复模式；#887 第三方插件清空内核包；#852 静默前后端分离且坏配置进 healthy checkpoint；#851 窗口 25 秒抢焦点；#865/867 spill ENOENT 主进程崩溃（已有修复 PR）；上游破坏性更新月内 4 次、master 9-09 有 revert 波动。
