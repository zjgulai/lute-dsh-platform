# 思维模型 → Agent 技能体系 · Phase 2 交接文档

> 交接日期：2026-09-17
> 交付状态：Wave 1 + Wave 2 已全部落地并发布；Phase 2（Router 引擎 host Tool 化）**未启动**，本文档即其执行方案。
> 文档归属：本文档位于 LUTE 平台仓（Magpie-Horch）的 `.scratch/` 工作笔记层，**不属于出货面、未提交 git、产品本体（`packages/` / `packaging/`）零接触**。它的上游事实源是思维模型仓库本身；两处信息冲突时，以仓库为准。

---

## 0. 一分钟看懂

- 一个仓库（`/Users/lute/project/思维模型`，公开 GitHub：`zjgulai/deep-thinking-mode`）是**单一事实源**：2789 个中文思维模型 + 13 章节 + Agent 知识合同（竞技场/链/路由）。
- 一个生成器（仓库内 `.local/xmind-skills/build-skills.mjs`，本地 only）把仓库 JSON 变成 **18 个 DSH 技能**，装在 `~/.dsh/skills/xmind-*`。
- Phase 2 要做的事：把仓库里的 **Router 路由引擎**从「技能触发词被动分流」升级为「agent 可主动调用的 host Tool」，挂到 LUTE 平台 profile 上。
- Phase 2 的**门槛**（不是技术门槛，是价值门槛）：先等这 18 个技能在实战里被真实使用、触发面被验证可靠，再启动。

---

## 1. 项目全貌与资产地图

```
思维模型 repo（单一事实源，公开）                    LUTE 平台 / DSH 桌面（消费侧）
/Users/lute/project/思维模型
├── knowledge/models-v3/          2789 个 V3 模型（quality≥4 者 400+，竞技场角色锚定池）
├── chain-protocols/
│   ├── *-arena-1.json            12 个竞技场数据合同
│   ├── {cot-critic,deep-research,plan-execute-reflect,react-agent,tot-tree-of-thought}-chain.json
│   ├── agent-router-index.json   问题类型路由索引（schema 2.0-router）
│   └── agent-router-prompt.json  路由提示词
├── tools/site-assets/router-engine.mjs        站点端路由引擎实现（Pure JS，可参照）
├── .local/xmind-skills/build-skills.mjs       技能生成器（gitignored，本地 only）
└── site/ + docs/                  公开站点产物（GitHub Pages 自动部署）
                        │
                        └── node .local/xmind-skills/build-skills.mjs
                                   │（repo 数据升级后重跑，全量再生）
                                   ▼
                        ~/.dsh/skills/xmind-*（18 个技能）
                        ├── xmind-gateway              网关：14 行分流表（12 竞技场 + 5 链 + 查库）
                        ├── xmind-arena-{rootcause,sysfail,decision,evaluate,framing,
                        │     creative,learning,emotion,strategy,comms,execution,universal}
                        └── xmind-chain-{cot-critic,per,react,research,tot}
```

竞技场数据文件名与技能席位的对应（注意有两处中文名≠英文直觉，已实测核实）：

| 技能席位 | 数据文件 |
|---|---|
| rootcause 问题根因 | `问题根因-arena-1.json` |
| sysfail 系统失败 | `系统失败-arena-1.json` |
| decision 决策困境 | `决策困境-arena-1.json` |
| evaluate 决策评估 | `决策与选择-arena-1.json` |
| **framing 问题界定** | **`问题分析与根因-arena-1.json`**（命名易误认成 rootcause，实测「追问界定师」在此文件） |
| creative / learning / emotion / strategy / comms / execution / universal | 同名中文 `-arena-1.json` |

## 2. 已交付状态（截至本次交接）

- **18/18 技能在线**：`ls ~/.dsh/skills | grep xmind` 应返回 18。
- **数据层 B 代标准全部达标**：12 竞技场均无 `auto_generated` 占位立场、三角色锚定库内 quality≥4 模型、`system_prompt_ref` 齐全、无孪生组合。其中 9 席（evaluate/framing/creative/learning/emotion/strategy/comms/execution/universal）为 Wave 2 从 A 代全量重写，rootcause/decision/sysfail 三席为已达标的 B 代原作，sysfail 补齐过缺失引用。
- **最新发布**：repo main @ `1ce13203`（`feat: 九个竞技场重写为 B 代标准并补齐系统失败提示引用`）已 push，CI run `35131932123` 全绿（test / check / build / no-drift / public-artifact / manifest / public-tree / Pages deploy 全部通过）。
- **本地门禁证据**：`npm run release:check` 全绿（含全量测试）；变基引入的远端新增对抗测试（`deploy-snapshot-contract` + `frozen-production-verifier`）31/31 通过；双构建确定性证据：site SHA-256 `644273aba44f0394c2f769265ee7344be5c8ef85611337307ae5001fcafbae5d` / 2872 文件，两次一致，`diff -qr site docs` 无输出。
- **生产端（腾讯云 Docker 入口）本次无动作**：本次为纯数据层改动，`site/` 产物逐字节未变；`manuals/RELEASE_CHECKLIST.md` 第 111 行注明的 Router 2.0/组合工坊生产候选部署是**另一条独立管线**，未包含在本交接范围。

## 3. Phase 2 是什么

**目标**：让 agent 在技能触发之外，能**主动调用**一个 `xmind_router` host Tool，输入问题文本，输出「该进哪个竞技场/哪条链/查哪个模型」的结构化推荐——把现由 `xmind-gateway` 技能提示词承载的 14 行分流表，升级为可编程调用的路由服务。

**素材（全部在思维模型 repo，公开可读）**：

| 资产 | 内容 | Phase 2 用法 |
|---|---|---|
| `chain-protocols/agent-router-index.json` | 问题类型（正/负向短语 + 权重 + 澄清标签 + 示例） | Tool 的匹配数据源 |
| `chain-protocols/agent-router-prompt.json` | 路由提示词 | Tool 输出的措辞与澄清策略参照 |
| `tools/site-assets/router-engine.mjs` | 站点端纯 JS 引擎（五状态机：idle/needs_input/matched/clarify/safety_stop，23 条路由，澄清最多一轮） | Host 侧实现的逻辑参照；冻结的 96 条 Router 语料回归测试在 repo `tests/` |
| `chain-protocols/*-arena-1.json` + 5 chain JSON | 12 席 + 5 链的合同 | Tool 输出推荐的落点（席位 id 必须与此对齐） |

**集成路径（LUTE 平台侧）**：按 ADR-0061 的 profile 本地装配模式（先例：`dsh-kol-hunter-local`）——新包（建议名 `dsh-xmind-router-local`）→ `cordis.patch.yml` 对应 preset 下显式挂载 → `dsh.profile.bundles` 确认 → 重启验证。**红线：不进出货 preset**（ADR-0056，`PRODUCT_MOUNTS` 保持为空）；凭证走 DSH 凭据服务。

## 4. 启动门槛（为什么还没启动）

Phase 2 是「可选增强」，不是欠账。启动条件（满足其一即可评估）：

1. 18 技能在实战中被**真实使用**：用户在新会话里自然触发了 xmind-* 技能且席位正确，并处理了真实问题（而非测试句）。
2. 触发面出现可归档的偏差案例：「该触发没触发」「触发错了席」被复现并确认。

理由：Router Tool 的价值建立在「技能层被真实使用」之上；先积累使用证据，Router 的输出才有对齐目标（它的推荐必须与技能实际触发表现一致或更优），否则是在给没人走的路口装红绿灯。

## 5. 执行步骤（T0–T5）

### T0 · 复核启动条件
按 §4 核对；同时读本文件 §1 资产地图，并在 repo 跑 `npm run validate:data` 确认数据合同仍然绿色。

### T1 · 固化 Tool 契约（先写合同再写码）
- Tool 名：`xmind_router`
- 输入：问题文本（必填）；场景标签（可选：决策/诊断/规划/评估…对应 router-index 的 `problem_types[].id`）
- 输出：核心推荐（席位/链 id + 中文名 + 推荐理由）+ 辅助路径（对应 router-engine 的核心/辅助双路径语义）+ 澄清问题（仅当歧义，最多一轮）+ 安全边界提示（复用 arena 的安全边界段）
- 契约草案落在 Phase 2 工作目录（本文件夹），不动 repo。

### T2 · 动态原型验证（当天可完成）
用 `cordis_define` 定义 Host 侧动态 Plugin（注册 `xmind_router` 为模型 Tool，数据源直接读 repo 的 `agent-router-index.json`）；`cordis_run` 经用户批准后，在会话内直调 Tool 验证输出。此步**只验证契约，不留运行时**。开发前先加载 `cordis-plugin-development` Skill 并 Inspect Tool 注册面。

### T3 · 固化为本地包
- 包目录（建议）：`~/project/xmind-router-local/`（仓库外，遵循「外部产品不进 LUTE 出货仓」）
- Host 侧实现要点：Tool 注册用官方 API 返回 disposer；匹配逻辑移植 router-engine 的短语权重 + 澄清状态机（勿重写算法，移植后用 repo 的 96 条冻结语料跑回归）
- 挂载：`~/.dsh/profiles/desktop/cordis.patch.yml` 加产品行 + `dsh.profile.bundles` 确认 → 重启 DSH 验证 Tool 出现
- 红线复述：`PRODUCT_MOUNTS` 不动；`app.asar` 不碰；machine 路径不进包出货面

### T4 · 验收
1. Router 直调：三类典型输入（明确单席 / 复合问题 / 歧义输入）输出符合契约，歧义只澄清一轮。
2. 与技能触发一致：下述三句在新会话应触发对应技能，且 Router 对同一输入给出的推荐席位一致或互补：
   - 「我们团队每个环节都做对了，整体指标反而变差」→ `xmind-arena-strategy`（或 sysfail，二者边缘重叠为设计内的转诊关系）
   - 「话到嘴边组织不起来，汇报老被打断说重点」→ `xmind-arena-comms`
   - 「flag 年年立年年倒」→ `xmind-arena-execution`
3. 96 条冻结语料在 host 侧实现上回归通过（期望分布：80 matched / 8 clarify / 8 safety_stop）。

### T5 · 维护闭环
- repo 数据升级 → `node .local/xmind-skills/build-skills.mjs` 再生技能层 → 若 `agent-router-index.json` 变更，同步 T3 包的数据源并重跑语料回归。
- repo 侧发布纪律：纯数据层改动（site 产物不变）只需 commit + push（CI 自动跑全部门禁并部署 Pages）；**涉及 site 产物变更**时才进入 `manuals/RELEASE_CHECKLIST.md` 的镜像/生产门（Gate 3–6）。
- 本机 git 直连 GitHub 不通，须走系统代理：`git -c http.proxy=http://127.0.0.1:7890 <命令>`（系统代理 127.0.0.1:7890，git 不自动继承）。

## 6. 红线汇总（Phase 2 全程有效）

1. 原始语料与本地处理脚本（`data/`、`.local/`、私钥等）只在思维模型 repo 本地，`.gitignore` 已挡，任何情况下不进平台仓或技能目录。
2. 外部产品不进 LUTE 出货 preset（ADR-0056）；本机使用走 profile 本地装配（ADR-0061）。
3. 凭证只进 DSH 凭据服务，不进任何仓库/包/Markdown。
4. Magpie-Horch 侧：本 handoff 属 `.scratch` 层；若 Phase 2 正式立项，按 ADR-0009「一份事实只有一个家」将决策上移至 `docs/notes/` + ADR 登记，勿在两处维护同一结论。
5. 技能层只嵌「门牌、路由表与查询配方」，模型正文一律按需回 repo 读——Phase 2 的 Router Tool 输出同样只给**引用**（席位 id + 路径），不内嵌正文。

## 7. 交接时状态快照

| 项 | 值 |
|---|---|
| repo main | `1ce13203`（已 push origin/main，两边一致） |
| CI / Pages | run `35131932123` 全绿，Pages 已部署（build 与 deploy job 均通过） |
| 技能层 | 18/18 安装于 `~/.dsh/skills/xmind-*`（网关 1 + 竞技场 12 + 链 5） |
| site 产物 SHA | `644273ab…bae5d` / 2872 文件（本次改动未触及；生产腾讯云入口无需切换） |
| 遗留 | Phase 2 未启动（门槛见 §4）；Router 2.0/组合工坊的腾讯云生产候选部署为独立管线，未含在本交接 |

## 8. 开放问题（Phase 2 启动时须与负责人确认）

1. Router Tool 与技能触发的优先级：技能触发优先、Tool 作为兜底/显式调用？还是 Tool 作为唯一入口？
2. Tool 是否需要输出「为什么不推荐其他席」的反证段（当前 gateway 技能无此行为，Router 2.0 站点端亦无）。
3. host 侧实现是移植 router-engine 算法，还是直接 import repo 的 `.mjs`（涉及包对思维模型 repo 的路径依赖，倾向移植 + 语料回归锁行为）。
4. 动态原型（T2）产出是否需要保留为可复放的 Package 定义，还是验证完即弃。
