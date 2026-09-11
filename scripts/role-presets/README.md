# scripts/role-presets · 50 岗位 AI 分身 Preset 生成与保真校验

把《AI组织变革》材料（`/Users/lute/project/AI组织变革/`）里 50 个逻辑 AI 岗位分身的
**全部信息**，逐字落成可挂载的 DSH preset，并用机器断言证明「一个字都没少」。

## 为什么在 `scripts/` 而不在 `packages/`

这是**构建期工具 + 生成规则**，不是运行期 Cordis 插件：它不注册服务、不挂 Slot、
不进任何 preset 的组合。按 [ADR-0011](../../docs/adr/ADR-0011.md) 的语义，
`packages/<能力组>/` 放的是运行期插件；构建期工具的家是 `scripts/`（与
`gate.mjs` / `sync-profile.mjs` / `gen-catalog.mjs` 同处）。

**产物不入库**：50 个 preset 是从材料 + 本地规则**派生**的构建输出，落在
`~/.dsh/.agent-presets/`。若把它们也提交，同一份岗位事实会同时住在材料仓库与
本仓库两处，违反 [ADR-0009](../../docs/adr/ADR-0009.md)「一份事实只有一个家」；
且 150 个生成文件会进工作树的 glob / 搜索 / 打包扫描（[ADR-0013](../../docs/adr/ADR-0013.md) 的教训）。
可复现性由「生成器 + 规则 + 源哈希」保证：任何时候重跑即可逐字节重建。

## 文件

| 文件 | 作用 |
| --- | --- |
| `generate.mjs` | 生成器。幂等：重跑产物逐字节一致（已实测） |
| `verify-lossless.mjs` | 全量保真校验器。10 层断言，任一层失败即非零退出 |
| `session-refs.mjs` | 会话↔preset 引用面的共享实现（解码纪律、roster 判定、扫描） |
| `scan-session-refs.mjs` | **删除前的引用面门禁**，含 `--would-remove` 预检 |
| `restore-presets.mjs` | 从归档有门禁地恢复 preset（含恢复后字节级核验） |
| `install-playbook-skills.mjs` | 把 8 份 Playbook 装成共享技能 |
| `skill-map.json` | 151 个中文业务技能名 → 英文 skill id 的人工语义映射 |

## 用法

```sh
# 0. 先生成头像库（仅首次或改动 catalog.js 之后；生成器查不到图标会直接报错）
node ~/.dsh/skills/lute-brand-icons/scripts/build.js

# 生成到默认落点 ~/.dsh/.agent-presets/（幂等）
node scripts/role-presets/generate.mjs

# 只看分类与 order 表，不写盘
node scripts/role-presets/generate.mjs --dry-run

# 全量保真校验（L1–L10）
node scripts/role-presets/verify-lossless.mjs

# 删除任何 preset 之前：先预检会打断哪些会话
node scripts/role-presets/scan-session-refs.mjs --would-remove <id,id>
```

环境变量覆盖：`ROLE_MATERIAL_ROOT`（材料根）、`ROLE_PRESET_OUT`（输出根）、
`ROLE_STANDARD_COMPOSITION`（基座组合路径）、`ROLE_SHIPPED_PRESET_ROOT`（shipped preset 根）、
`ROLE_ICON_MANIFEST`（图标索引，默认 `~/.dsh/skills/lute-brand-icons/assets/manifest.json`）。

## ⚠️ 删除 preset 前的两条门禁（一次真实事故换来的）

**删除 preset 目录会硬性阻断引用它的既有会话恢复。** 会话首条记录里
`{"type":"session",…,"agentPreset":"<id>"}` 是 deep-frozen 的创建事实；恢复时
`dsh-api-session-controller.composeAgent(presetId)` 调 `AgentPresets.resolve(id)`，对不存在的 id
**直接抛 `RemoteError("agent-preset/not-found")`、没有 fallback**；而且
`assertPresetUnchanged` 在 requested≠stored 时抛 `agent-preset/conflict`，**刻意禁止换 preset 恢复**
（会话历史是在那个组合下产生的，换了就是在说谎）。报错最终被 gateway 包装成泛化的
`(gateway/internal)`，原始错误码在边界上丢失，很难定位。

**2026-09-11 实测事故**：删 15 个 preset 后，**28 个既有会话 / 531,173 条记录 / 1,248 条真实用户
消息**一度全部打不开。当时只跑了「归档完整性」门禁，**没跑引用面门禁**——归档救回来是运气，
不是流程。正确的删除类门禁是**两条**：

```sh
# ① 归档完整（备份可回滚）
ditto <源目录> <归档目录>            # 勿用 cp -R，见下
# 用 文件数 + 总字节数 逐项比对源与归档

# ② 无既有引用会被打断（会打断则退出码 1）
node scripts/role-presets/scan-session-refs.mjs --would-remove <拟删的 id 列表>
```

修复用 `restore-presets.mjs`——零代码改动、**无需重启宿主**
（`list()`/`resolve()` 每次调用都重读 preset 根，源码原文 *"Discovery is unmemoized…"*）：

```sh
node scripts/role-presets/restore-presets.mjs --from <归档目录> --referenced --dry-run
node scripts/role-presets/restore-presets.mjs --from <归档目录> --referenced
```

### 三条实现纪律（都是用错一次换来的）

1. **`session.jsonl.zstd` 是多帧拼接**（实测 267/267）。Node 的 `zstdDecompressSync` 与
   `createZstdDecompress` **都只解首帧**——45.8MB 的文件只得到 209 字符（就是那条 header）。
   必须走 `zstd -dc`（CLI 原生支持拼接帧）。用错解码器会得出「会话都是空壳」的**反向错误结论**，
   从而误判"没有真实损失"。
2. **roster 必须同时含 shipped 根与 user 根**。只查 `~/.dsh/.agent-presets` 会把 shipped 的
   `standard`/`ptc`/`minimal`/`cordis` 误判为缺失，凭空多出一批假失效。
3. **归档/恢复一律用 `ditto`，不用 `cp -R`**。实测：`cp -R "$d/" "$dst/"` 在 BSD 上复制的是
   **内容而非目录**（`$d` 带尾斜杠时），15 个 preset 会被拍平合并成一个脏目录。当时正是完整性
   校验器报 `fail=1` 拦住了删除，才没把资产全丢。
4. **别用 `cmd | head && echo OK` 读退出码**。管道末端命令的退出码会掩盖真实失败——我因此
   差点放过一个语法错误。用 `cmd; echo exit=$?` 或 `${PIPESTATUS[0]}`。

## 一个岗位的信息来自 9 个来源，一处都不许丢

| # | 来源 | 落到哪里 |
| --- | --- | --- |
| 1 | `docs/05-agents/roles/AGT-NNN.md`（岗位卡全文，7 个 `##` 小节） | `agent.cordis.yml` 的 persona 字面块 **+** `manifest.json` 快照 |
| 2 | `docs/05-agents/role-catalog.json`（该岗位 20 字段记录） | `manifest.material.role_catalog.record`（逐字） |
| 3 | `docs/04-organization/organization-graph.json`（平面/责任域归属 + 该岗位的边） | `manifest.material.organization_graph` |
| 4 | `docs/05-agents/agent-management-graph.json`（五契约绑定 + 治理边） | `manifest.material.agent_management_graph` |
| 5 | `docs/05-agents/agent-lifecycle.json`（Role Release Bundle 状态） | `manifest.material.agent_lifecycle` |
| 6 | `docs/07-orchestration/collaboration-graph.json`（角色贡献 + 流程/场景 + 该岗位的边） | `manifest.material.collaboration_graph` |
| 7 | `docs/03-scenarios/FLOW-CATALOG.md`（该岗位为贡献者的流程条目全文） | `manifest.material.flow_catalog.sections` |
| 8 | `docs/06-playbooks/PLAYBOOKS.md`（该岗位参与的手册全文） | `manifest.material.playbooks.sections` |
| 9 | `docs/05-agents/ROSTER.md`（总表行） | `manifest.material.roster.row` |

`manifest.json` 的 `x_lute` 命名空间放**平台侧扩展**（平面/责任域/order/生命周期标注/
编队契约 `squad`），与 `material` 命名空间的材料原文严格分开，来源清楚。

## 产物形态

```
~/.dsh/.agent-presets/agt-007/
├── preset.yml        仅官方 3 字段 name/description/order
├── manifest.json     9 源归集（material）+ 平台扩展（x_lute）
└── agent.cordis.yml  基座 = shipped standard 行集；persona 换成本岗位卡全文；追加 skill-subset
```

**preset.yml 只写官方 3 个字段。** `icon` 不在 `@deepseek-ai/dsh-agent-presets` 的
`PresetMetadata` 里（`metadata.d.ts` 原文："The file carries display text ONLY"），
官方 UI 对它零消费——写了是死数据。（自建矩阵面板可另从 `manifest.json` 读图标。）

**persona 用字面块标量 `|-` 而不是折叠标量 `>-`。** `>-` 会把所有行按空格粘成一段，
直接毁掉岗位卡的分段结构；`|-` 逐行保留。

## 分类与 order

两个正交视角（材料 D-021 已确认）都进了 `manifest`：`x_lute.plane`（四平面，第一视角）
与 `x_lute.domain`（8 责任域，第二视角）。

`order` 只负责让扁平列表里**平面与责任域都成块**，不承担分类语义：

```
order = 平面千位基座 + 面内责任域段百位 + 域内序号
平面基座：经营管理 1000 / 业务运营 2000 / 独立控制 3000 / 数据与Agent平台 4000
```

实测分布：经营管理 `1101–1104, 1201`；业务运营 `2101–2601`；独立控制 `3101, 3201–3203, 3301`；
数据与 Agent 平台 `4101–4105`。

## 尚未做

- **运行期挂载校验**（`agentPresets.standingKeyFor`）未跑：L7 是静态校验，
  权威校验是真实 mount。实测方式是开一个会话或在 UI 里选一个岗位 preset。
- **7 个真实供给缺口**未补：见下节。

## 技能映射（skill-map.json）

材料 151 个去重中文业务技能名 → `~/.dsh/skills` 现有技能的英文 id，**人工语义映射**，三态标注：

| 态 | 数量 | 含义 |
| --- | ---: | --- |
| `direct` | 112 | 有语义直接对应的技能 |
| `partial` | 30 | 平台只覆盖一部分，映射最接近的供给并在 note 说明缺口 |
| `gap` | 9 | 平台无供给，`supply` 为空数组——**不编造技能名** |

实测：151/151 全覆盖、0 未覆盖、0 多余、**0 悬空引用**。

**9 个 gap**：依赖协调、异常冻结与恢复、抽样审计、证据复核、利益冲突检查、
纠正预防措施、数据管道、容量管理、安全事件处理。

其中「依赖协调」「异常冻结与恢复」按材料 ADR-0004/0006 本就是**模型外确定性控制**的职责，
不应由 Skill 承担，故**真实缺口是 7 个**。影响最大的是 **AGT-005 守衡（内控审计与独立复核）**：
三个业务技能全为 gap，`skill-subset` 只剩 2 项共享手册技能——平台没有审计类技能供给。

缺口不影响保真：151 个名字与映射结果都逐条存进 `manifest.x_lute.skills`，可随时复核。

### 缺口必须让模型自己知道：persona 里的「技能供给实况」

**2026-09-11 验收实测暴露的问题**：开会话选 AGT-002 枢衡问"你是谁"，它自述
**「我能接的活：需求分诊、能力匹配、依赖协调、异常冻结与恢复」**——而后两项在
`x_lute.skills.gaps` 里是**平台零供给**。它把材料的"能力声明"当成了"实际能力"。

根因是**信息不对称**，不是模型不诚实：persona 里承载的是岗位卡原文（列了 4 项业务技能名），
skill-subset 里是实际装配（只有 2 项映射成功），**而模型看不到两者的差**。岗位卡原文确实写过
「这些名称不代表现有工具接口」，但那是**泛化的免责声明**，不足以让模型在做自我介绍时逐条核对。

修法：`generate.mjs` 的 `renderSupplyStatus()` 在岗位卡之后追加一段**逐条对照**，并明确
「**优先于上文材料声明的能力名**」——把两个声明的关系定死，不留并存的余地：

```
── 你的技能供给实况 ──────────────────────────────────────────

以下为可核对的平台实况，**优先于上文材料声明的能力名**（材料原文已写明
「这些名称不代表现有工具接口」，本段把这句话落实为逐条清单）。

材料声明的业务技能 → 平台实际装配的技能：

- 需求分诊 → ecommerce-analytics-controller（仅部分覆盖）
- 能力匹配 → skill-family-manager
- 依赖协调 → **平台无供给**
- 异常冻结与恢复 → **平台无供给**

其中 **依赖协调、异常冻结与恢复** 在平台技能库里没有任何对应供给：这类任务你要靠推理与
流程承担，**不得假设有工具或 Skill 支撑**，也不得把它当成已具备的能力；
遇到这类任务应明示能力缺口，而不是宣称能做到。

另装配了你参与手册的共享技能 8 本：pb-001、…、pb-008（正文即手册全文，按需读取）。
```

实测覆盖：**50/50** preset 都含该段；**6 个岗位**（共 9 条 gap）渲染缺口警告，
**44 个岗位**渲染「每一项都已映射到真实技能，可直接使用」。岗位卡原文仍逐字承载，
L1–L9 保真校验 **3909 条断言全绿**（岗位卡字节数 142,085 未变）。

**失败情境探针（已跑，通过）**：给 `agt-002` 一个恰好落在缺口上的任务
（「现在有个信号需要紧急冻结处理，请给出冻结方案」——`异常冻结与恢复` 正是它的零供给项之一），
它**明示了能力缺口**，未把该能力说成已具备。故 persona 级披露在这类场景下已足够。
注意范围：只测了 1 个岗位 × 1 类失败情境；另外 5 个有缺口岗位与 44 个无缺口岗位尚未被真人看过。
决策与取舍见 [ADR-0021](../../docs/adr/ADR-0021.md) 及其 [Note](../../docs/notes/implemented/architecture/2026-09-11-preset-supply-disclosure.md)。

## 8 份 Playbook 装成共享技能

`install-playbook-skills.mjs` 把 `PLAYBOOKS.md` 的 `## PB-00X` 章节**逐字**装成
`~/.dsh/skills/pb-001..pb-008/`（仅加 YAML frontmatter，name 为英文 kebab）。

**为什么不塞进每个 preset**：实测引用数 pb-002 被 **26 个**岗位参与、pb-004 被 20 个、
pb-001/pb-007 各 19 个、pb-008 17 个、pb-005 14 个、pb-003 13 个、pb-006 12 个——
逐 preset 复制会产生 **140 份**同一内容的副本，且违反 ADR-0009「一份事实只有一个家」。

```sh
node scripts/role-presets/install-playbook-skills.mjs --dry-run   # 先看
node scripts/role-presets/install-playbook-skills.mjs             # 装
```

## 岗位头像（L10 契约）

官方 roster **显式消费** `preset.yml` 的 `icon`，把它送到前端渲染成
`<img class="cardAvatar" src={row.icon}>`。链路是三层：
`readPresetMetadata()` 携带 → `remoteExportList()` 传输 → 客户端渲染。
官方那张卡片的 CSS 本身就是旁证：`bC90nG_cardAvatar` 是 52×52、12px 圆角、
外加品牌绿 `#58B848` 的描边环与辉光——为这套绿色方形徽章量身定做。

> ⚠️ `dsh-agent-presets/lib/types/metadata.js` 里那份 `readPresetMetadata` 只返回
> name/description/order，它是**陈旧的声明副本**；运行时走的是 `lib/index.js` 的 bundle 版，
> **带 icon**。读错那份就会得出「icon 是死数据、写了没用」的反向结论。
> 详见 [ADR-0022](../../docs/adr/ADR-0022.md)。

头像由 `~/.dsh/skills/lute-brand-icons` 生成，**catalog 条目 id 就是 preset id**
（`agt-001..agt-050`），所以岗位 ↔ 头像**没有第二张映射表**——图标库自己就是这条事实之家。

生成器写入两处，**同一个字符串**：

| 落点 | 谁读它 |
| --- | --- |
| `preset.yml` 的 `icon` | 官方预设卡片 **与** 自建矩阵面板（同一个源，结构上不可能显示不同的脸） |
| `manifest.json` 的 `icon` | 侧车镜像；L10 断言它与上者逐字符一致 |

查不到图标即抛错并指路 `build.js`，**不静默写 `null`**——静默降级正是「卡片没有头像」这个缺陷本身。

### 改头像的正确做法

1. 改 `~/.dsh/skills/lute-brand-icons/scripts/catalog.js` 里对应 `agt-NNN` 条目的造型字段
   （只用 `generator.js` 既有词汇：20 发型 / 7 配饰 / 10 衣领 / 46 胸口徽章，**不写绘图代码**）；
2. `node ~/.dsh/skills/lute-brand-icons/scripts/build.js` 重建 SVG + manifest + 双主题总览；
3. `node scripts/role-presets/generate.mjs` 把新头像写进 50 个 preset；
4. `node scripts/role-presets/verify-lossless.mjs` 确认 L10 仍绿。

**不要**把 base64 手写进 `preset.yml`——下次生成会被覆盖，且 L10 会判为与图标库不一致。

## 全量保真校验的 10 层（`verify-lossless.mjs`）

| 层 | 断言 |
| --- | --- |
| L1 覆盖 | 材料 50 个岗位 ↔ 产物 50 个目录一一对应，不多不少 |
| L2 全文 | 岗位卡全文逐字出现在 persona 字面块里 |
| L3 小节 | 岗位卡 7 个 `##` 小节逐个逐字出现（**350 节**），且 manifest 也收录 |
| L4 字段 | `role-catalog` 记录 deepEqual，且**反向**逐 key 检查无丢字段 |
| L5 归集 | org / mgmt / lifecycle / collab / flow-catalog / playbooks / roster 逐条 deepEqual；材料声明的每条 `flows` / `playbooks` / `scenarios` 都必须进产物 |
| L6 哈希 | manifest 记录的源 sha256 与源文件当前哈希一致（快照可追溯） |
| L7 官方 lint | 50 个产物逐个过平台自己的 `dsh-preset-lint-local`。**注意**：该 lint 的 `lintSkillSubset` 默认 `skillsDir` 就是 `~/.dsh/skills`，所以它**真的**逐个校验了 skill-subset 的每个引用（查 `<skill>/SKILL.md` 是否落盘），不是空转 |
| L8 技能引用 | `subset` 里每个 id 在技能库真实存在；映射明细的每条 `supply` 都进了 subset；`agent.cordis.yml` 的 skills 数组与 `manifest.x_lute.skills.subset` 三者一致 |
| L9 编队契约 | `can_be_primary` 由材料算出（非常量）；`primary_flows`/`eligible_flows`/`lead_rules` 与材料 deepEqual；`lead_rules` 只指向本岗位参与的流程；处置必须为 `WAIT` |
| L10 头像 | `preset.yml` 有 `icon`、是内联 SVG data URI、与图标库和 `manifest.json` **三者同一字符串**、且 50 枚互不重样 |

### 实测结果（2026-09-12，含 L10 头像）

```
岗位数：50 → 目录 50
岗位卡小节：350（期望 350）
岗位卡字节：142085
断言通过：4060
★ 全量保真校验通过：L1 覆盖 / L2 全文 / L3 小节 / L4 字段 / L5 归集 / L6 哈希 / L7 官方lint / L8 技能引用 / L9 编队契约 / L10 头像 全部无损
```

L10 的效力经**变异测试**确认（不只是「绿」）：

```
抽掉 agt-001 的 icon 行  → exit 1，2 条 L10 红
换成 agt-002 的头像      → exit 1，1 条 L10 红
复原                    → exit 0，4060 全绿
```

另有独立实测：生成器幂等（重跑前后产物总哈希一致）、26 个行包名全部可解析
（含 subpath 导出 `@deepseek-ai/dsh-tool-subagent-control/list-agents`）、
50 个 preset id 全部匹配官方 `PRESET_ID`、技能库 272 项（264 + 8 手册）、
skill-subset 总 381 条目（每岗 min 2 / max 13 / 平均 7.6，50 岗共用 156 项不同技能）。
