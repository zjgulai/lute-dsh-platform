# paper2skills 全量语料 → 岗位矩阵四层分类 → 50 岗位 Preset 技能库

> 状态：**方案 v2（已按你的三项裁决定稿，执行中）**
> 日期：2026-09-12
> 上游权威源：`/Users/lute/project/paper_to_skills/`（本地自足，**不再访问 iCloud**）
> 分类基准：`/Users/lute/project/AI组织变革/docs/04-organization/organization-graph.json`（D-021）
> 下游：`~/.dsh/skills/` + `~/.dsh/.agent-presets/agt-001..agt-050` + `scripts/role-presets/skill-map.json`
> 参照先例：`packages/capabilities/dsh-overseas-skills/`（81-Skills 导入闭环）

---

## 0. 本轮已完成的裁决与证据

| # | 事项 | 结论 | 证据 |
| --- | --- | --- | --- |
| **V1** | 语料完整性 | 原「已下载完成」的本地副本**只有 156 个卡文件（130 张唯一卡）**，缺 10 个整域（`17-价格优化`…`25-搜索流量工程`），且无 `playbook/` | `find paper2skills-vault -name 'Skill-*.md' \| wc -l` → 156；iCloud 工作树同名目录 → 1356 |
| **V2** | 语料修复 | 已按你的裁决 A 一次性物化 `playbook/` → 本地。**1339 个卡页 / 1338 张唯一卡 / 1514 文件 / 70 MB / 加密文件 0 个** | `ls playbook/skills/*.html \| wc -l` → 1339；逐文件魔数扫描 `887d1c` → 0 |
| **V3** | 权威源冻结 | 本地 `playbook/` 成为唯一权威卡源；iCloud **工作树永不读取**（其 1356 个 `.md` 全部为加密态 `887d1c8bcd0aa302`，不可用） | 抽样 hexdump 确认 |
| **V4** | 分类维度的基准 | 4 面 / 8 责任域取自 `organization-graph.json`（decision D-021），**L3 = 岗位矩阵中每个岗位的「材料业务技能」名**（151 条唯一） | `data/taxonomy.json` |
| **V5** | 安装范围 | **全量 1338 张**全部适配安装并分类 | 本方案 |
| **V6** | 命名方案 | `p2s-` + 卡片 id 去 `Skill-` 前缀小写化 → **1338 个 slug 全部合法、零重复、与现有 272 技能零冲突** | `scripts/extract-cards.mjs` 附带断言 |
| **V7** | 包骨架 | `packages/capabilities/dsh-paper2skills/` 已建（package.json 三治理字段 + tsconfig + lib/taxonomy.js + 7 个 scripts + 判据单测 10 条），**`pnpm run gate` 14/14 绿** | `pnpm run gate` |
| **V8** | **判据纠错 1：跨面多挂** | 原判据「L1/L2 由 L3 唯一导出，不允许跨面多挂」**被实测推翻**：24 域 1296 张卡中 264 张（20%）天然跨面——一张合规监控卡确实同时服务 `独立控制/产品准入核对` 与 `业务运营/规则监测`。**改为**：树的主归属由**首个 L3**唯一决定，其余 L3 照常记录并参与供给覆盖统计，另标 `cross_plane` 供抽检。 | `node scripts/classify-check.mjs` |
| **V9** | **判据纠错 2：缺口认领虚报 50%** | 9 个平台缺口**本身就是 L3 名**，所以「这张卡补上某缺口」必须与卡的 L3 落点自洽。实测 262 次认领中仅 130 次由本卡 L3 支撑、24 次同责任域邻接、**108 次（41%）跨域虚报**（最典型：工厂**产能**卡认领 `容量管理` 缺口，而矩阵里 `容量管理` 指 AI 运行容量）。**改为三档**：`strong`（缺口名即本卡 L3）→ `direct`；`adjacent`（同 L2 责任域）→ `partial`；`dropped` 留档丢弃。 | `lib/taxonomy.js` 的 `auditGapClaims` |
| **V10** | 矩阵空白登记 | 确实无法归入 151 条 L3 的卡（实测 11 张：AI 伦理/ESG 碳披露/评价与口碑管理/纯方法论）照常适配安装、可斜杠调用，但**不进任何 preset 的 skill-subset**，并逐条登记。 | `data/classification.json` 的 `unassigned` + `generated/coverage.json` |

---

## 1. 目标与范围

### 1.1 目标

把 paper2skills 的 **1338 张技能卡全量**适配为 DSH skill 并安装，每张卡**严格归入岗位矩阵的 4 面（一级）/ 8 责任域（二级）/ 151 细分业务（三级）**，再按岗位逐显式装配进 `skill-subset`，使模型自述能力与平台实况一致。

### 1.2 不在范围内

- 不改 50 个岗位的**材料侧**事实（岗位卡 142,085 字节 / 350 小节逐字保真不破）。
- 不动 `packages/contract/dsh-skill-subset` 与宿主组合。
- 不修 iCloud 加密源（已绕开：只读 `playbook/`）。
- 不新增/删除 preset id。

---

## 2. 分类体系：严格对齐岗位矩阵

**你是对的——技能的分类维度必须和岗位矩阵同构，否则「技能供给」和「岗位责任」两套语言无法对账。** 本方案把 `organization-graph.json` 的 D-021 拓扑**原样**作为分类骨架，不另造一套。

### 2.1 三级（L1 / L2 / L3）

| 级别 | 名称 | 数量 | 来源 | 编码 |
| --- | --- | ---: | --- | --- |
| **L1** | 面（plane，第一视角） | **4** | `planes[].name` | `PLN-MGT / PLN-OPS / PLN-CTL / PLN-PLT` |
| **L2** | 责任域（domain view，第二视角） | **8** | `domain_views[].name` | `DOM-01 … DOM-08` |
| **L3** | 细分业务 | **151** | 每个岗位 `role-catalog.skills[]`（材料事实） | `DOM-0X-NN` |

### 2.2 L1 四面

| id | 名称 | purpose | 岗位数 | order 基座 |
| --- | --- | --- | ---: | ---: |
| `PLN-MGT` | 经营管理 | 目标、优先级、资源约束、经营判断与组织能力 | 5 | 1000 |
| `PLN-OPS` | 业务运营 | 产品、供应、渠道、增长、服务和 GMV 事实闭环 | 35 | 2000 |
| `PLN-CTL` | 独立控制 | 审计、税务、法务、产品合规、隐私、安全与权限边界 | 5 | 3000 |
| `PLN-PLT` | 数据与 Agent 平台 | 数据口径、质量、集成工具、Skills、Memory、Model 与可靠性 | 5 | 4000 |

### 2.3 L2 八责任域 × L3 分布（12 个非空 (面,域) 单元）

| L1 面 | L2 责任域 | L3 条数 | 承载岗位 |
| --- | --- | ---: | --- |
| 经营管理 | 经营与组织 | 13 | 001,002,003,004 |
| 经营管理 | 财务与合规 | 3 | 041 |
| 业务运营 | 产品与创新 | 24 | 006–013 |
| 业务运营 | 供应与履约 | 21 | 014–020 |
| 业务运营 | 渠道经营 | 24 | 021–028 |
| 业务运营 | 品牌与增长 | 21 | 029–035 |
| 业务运营 | 服务与体验 | 12 | 036–039 |
| 业务运营 | 财务与合规 | 3 | 040 |
| 独立控制 | 经营与组织 | 3 | 005 |
| 独立控制 | 财务与合规 | 9 | 042,043,044 |
| 独立控制 | 数据与AI运行 | 3 | 050 |
| 数据与Agent平台 | 数据与AI运行 | 15 | 045–049 |
| **合计** | | **151** | **50 岗** |

> 完整 151 条 L3 清单：`data/taxonomy.json`（机读）与 §附录 B（人读）。

### 2.4 每张 skill 的分类落点（写进 frontmatter）

```yaml
l1_id: PLN-OPS            l1_plane: 业务运营
l2_id: DOM-03             l2_domain: 供应与履约
l3_id: DOM-03-05          l3_business: 需求预测
l1_l2_l3: 业务运营/供应与履约/需求预测
p2s_src_domain: 03-时间序列   # 技术族（正交属性，非分类级）
```

**约束（已按实测修正，见 V8）**：一张卡**至少 1 个 L3**，至多 3 个。**树的主归属由首个 L3 唯一决定**；其余 L3 照常记录、参与供给覆盖统计，并标 `cross_plane`。**跨面多挂是真实供给，不是错误**——实测 1338 张中 269 张（20%）如此，例如一张合规监控卡确实同时服务 `独立控制/产品准入核对` 与 `业务运营/规则监测`。

---

## 3. 语料底座（已验证）

| 资产 | 路径 | 数量 |
| --- | --- | ---: |
| 技能卡页（权威） | `paper_to_skills/playbook/skills/*.html` | 1339（1338 卡 + index） |
| 源域页 | `playbook/domains/` | 26（25 域 + index） |
| 主题 / 工作流 / 手册 / 方案页 | `playbook/{topics,workflows,playbooks,solutions}/` | 33 / 33 / 39 / 20 |
| 关系图 | `playbook/graph/` | 16371 条边（`build-report.json`） |

**卡页结构（比 md 卡更完整）**：`data-skill` 属性 + `.skill-domain-chip` + `.skill-main-title` + 八段正文 `1.解决的问题 / 2.核心算法逻辑 / 3.业务应用场景 / 4.输入数据要求 / 5.输出结果 / 6.业务价值-ROI / 7.代码模板 / 8.论文来源` + `Skill Relations（前置/延伸/可组合）`。

**抽取结果**：1338/1338 成功，缺字段 0，正文中位 2995 字符（min 249 / max 5830）。

---

## 4. 架构设计

### 4.1 包结构（复刻 81-Skills 模式）

```
packages/capabilities/dsh-paper2skills/
├── package.json               luteOrigin:self / luteOwner:lute / lutePublish:false
├── cordis.patch.yml           - insert: { id: dsh-paper2skills, name: dsh-paper2skills }
├── lib/{index.js,catalog.js,client.js}    设置页「论文技能」目录（按 4面/8域/L3 三级导航）
├── scripts/
│   ├── extract-cards.mjs      ★ 卡页 → data/cards.json（已就绪，1338 张零缺陷）
│   ├── taxonomy.mjs           读 taxonomy.json，导出校验/查询 API
│   ├── classify-check.mjs     ★ 分类合法性门禁（每卡 ≥1 L3、L3 必须存在于 taxonomy）
│   ├── adapt-batch.mjs        ★ 单批次卡 → staging/<l2>/<name>/SKILL.md
│   ├── import-paper2skills.mjs ★ 安装器（staging → ~/.dsh/skills，含 overwrite 保护）
│   ├── dedupe-families.mjs    近重复族合并（族定义 families.json）
│   └── verify-install.mjs     安装后结构与引用校验（L1/L2 层）
├── manifest/paper2skills.json categories（4面/8域/L3）/ skills / overrides
├── data/{taxonomy.json,cards.json}         分类底座（入库，只读）
├── staging/<l2>/<name>/SKILL.md            导入中间产物
├── eval/{routing-benchmark-p2s.json,llm-picks-p2s.jsonl,runs/}
├── test/paper2skills.spec.mjs
├── backup/pre-paper2skills/                安装前技能库快照
└── docs/{maintenance-sop.md,skill-directory-spec.md,adaptation-spec.md,
         classification-spec.md,loop-protocol.md,tier-plan.md,test-report.md}
```

### 4.2 数据流

```
playbook/skills/*.html（权威，只读）
   ↓ extract-cards.mjs      → data/cards.json（1338，含八段正文 + 关系）
   ↓ 分类（L1/L2/L3）        → data/classification.json（1338 × {l3[], confidence, fills_gap[]}）
   ↓ adapt-batch.mjs         按 (L2, L3) 邻域切批 → staging/<L2>/<name>/SKILL.md
   ↓ verify-install.mjs      name 正则 / frontmatter 合法性 / 描述≤500 / SKILL.md≤12KB / 零同名
   ↓ import-paper2skills.mjs → ~/.dsh/skills/<name>/  disable-model-invocation: true
   ↓ generate.mjs            → agent.cordis.yml 的 skill-subset + manifest.json
   ↓ verify-lossless.mjs     → 4060 断言必须保持全绿
```

### 4.3 适配规范（卡片 → SKILL.md）

| frontmatter | 来源 | 规则 |
| --- | --- | --- |
| `name` | `p2s-` + id 去 `Skill-` 小写化 | 已实测 1338/1338 合法、零重复、零冲突 |
| `title` | `.skill-main-title` | 中文保留 |
| `description` | **合成** | `触发词：…` + `何时不用：…` + 安全边界，≤500 字符 |
| `user_summary` / `user_try` | 合成 | 卡面一句话 / 「试试：…」 |
| `workflow` | 卡页 3.业务应用场景 + 7.代码模板 提炼 | ≤5 步，**只提炼不新造** |
| `whenToUse` | 合成 | 与相邻 L3 技能的边界 |
| `l1_id/l2_id/l3_id` 等 | 分类结果 | §2.4 |
| `disable-model-invocation` | 固定 `"true"` | 全局 model-off（O1 默认） |
| `user-invocable` | 固定 `"true"` | 保留斜杠可达 |

**正文**：保留卡页八段（知识本体），**追加**三节 —— `## 输入 / 输出契约`（取自 4./5.）、`## 执行步骤`（取自 3./7.）、`## 边界与不做`（取自 9./ADR 边界声明）。卡页 7.代码模板 正文留摘要，完整实现移入 `references/`，避免 SKILL.md 超 12 KB。

### 4.4 可见性双层（装 1338 张也不推高任何 preset 的 prompt）

1. **全局层**：新装技能一律 `disable-model-invocation: true` → 不进模型目录。现有 272 技能的全局目录已占约 7.2 万字符，不可再增。
2. **preset 层**：`agt-*` 的 `agent.cordis.yml` 中 `skill-subset` 把本岗名单重注册为模型可见，`hideOthers: true` 遮蔽其余。

→ 装 1338 张，对每个 preset 的 prompt 成本**只增该岗 subset 的条目数**。

### 4.5 接线四处（漏一处模型就会说谎）

| 落点 | 改什么 |
| --- | --- |
| `scripts/role-presets/skill-map.json` | 业务技能名的 `supply` 追加新 id；`kind: gap → direct/partial` |
| `agent.cordis.yml` 的 `skill-subset.skills` | 新 id 进 subset（`generate.mjs` 重跑） |
| `manifest.json` 的 `x_lute.skills` | `subset` / `mapping` / `gaps` 同步 |
| **persona 的「技能供给实况」段** | `renderSupplyStatus()` 会把 `gap` 渲染成「**平台无供给**」；补齐后必须重渲染 |

---

## 5. 目标（Goal）

> **把 paper2skills 的 1338 张技能卡全量适配为 DSH skill 并安装，每张严格归入岗位矩阵的 4 面 / 8 责任域 / 151 细分业务；据分类结果重写 50 个岗位 preset 的 skill-subset 与技能供给实况，使 8 个「平台无供给」缺口按真实供给改写；全程 `verify-lossless.mjs` 4060 断言与 `pnpm run gate` 保持全绿。**

**完成判据（全部满足才算达成）**

| # | 判据 | 证据 |
| --- | --- | --- |
| G1 | 1338 张卡全部落 staging 且分类合法 | `classify-check.mjs` 退出码 0，`l3_missing=0` |
| G2 | 1338 个 skill 目录装入 `~/.dsh/skills` | `ls ~/.dsh/skills \| wc -l` = 272 + 1338 = 1610 |
| G3 | 全局模型目录不含新技能 | standard 会话技能清单对比 |
| G4 | 目标 preset 目录含本岗 subset 且不含其余 | preset 会话技能清单 |
| G5 | 50 preset 保真不破 | `verify-lossless.mjs` → 4060 断言全绿 |
| G6 | 8 个原缺口按真实供给改写或明确保留 | `agt-002/005/018/046/049/050` persona 抽查 |
| G7 | 151 个 L3 的供给覆盖表产出，空白项逐条登记 | `data/coverage.json` + `docs/classification-spec.md` |
| G8 | `pnpm run gate` 绿 | 退出码 0 |
| G9 | 回滚可用 | 从 `backup/` 恢复后目录数回到 272 |

---

## 6. Loop 协议

### 6.1 轮次状态机

```
              ┌──────────────────────────────────────────────┐
              │  Round N                                     │
   pick ──────┤  1. 读 state.json，取下一批 pending 卡          │
              │  2. 派 subagent（分类 / 适配），每批 ≤48 张      │
              │  3. 合并产物 → staging/                       │
              │  4. 跑门禁 classify-check + verify-install    │
              │  5. 更新 state.json（done / failed / 计数）    │
              └──────────────────────────────────────────────┘
                              │
              门禁红 ─────────┴───────── 门禁绿 → 下一批
                 │                              │
              停轮并报告                    全部批次 done
              （不静默换方案）                    │
                                    S3 装配：install + 接线 + 全量验证
```

### 6.2 阶段（S）与批次

| 阶段 | 内容 | 批次 | 并行度 |
| --- | --- | ---: | ---: |
| **S1 分类** | 25 个源域的卡 → L1/L2/L3（多挂 ≤3） | 25 | 8/轮 |
| **S2 适配** | 按 (L2, L3) 邻域切批 → SKILL.md | ~28（≤48 张/批） | 8/轮 |
| **S3 装配** | 安装 + manifest + skill-map + generate + verify | 1 | 串行 |

### 6.3 状态文件

`state.json`：

```json
{
  "round": 3, "phase": "S2",
  "batches": [ { "id": "S2-07", "l2": "供应与履约", "cards": 48,
                 "status": "done|pending|failed", "artifacts": ["staging/..."],
                 "gate": {"classify": "ok", "frontmatter": "ok", "collisions": 0} } ],
  "totals": { "extracted": 1338, "classified": 1338, "adapted": 336, "installed": 0, "wired": 0 },
  "gates": { "lossless": "4060 ok", "gate": "ok" }
}
```

### 6.4 每轮门禁（红即停轮，不进入下一批）

| 门禁 | 断言 |
| --- | --- |
| `classify-check` | 每卡 ≥1 L3；L3 必须存在于 `taxonomy.json`；L1/L2 由 L3 唯一导出；跨面无多挂 |
| `frontmatter` | `name` 匹配 `^[a-z0-9]+(-[a-z0-9]+)*$` 且目录名一致；描述 ≤500；SKILL.md ≤12 KB |
| `collisions` | 与现有 272 技能 + 本批已产出 slug 零同名 |
| `lossless` | 每轮结束跑 `verify-lossless.mjs`，4060 断言不得回退 |

### 6.5 停轮条件

1. 门禁红且无法当场修复 → 停轮、写 `docs/loop-halt-<round>.md`、报告。
2. 累计 `failed` 批次 ≥3 → 停轮复核方案。
3. 全部批次 done → 进入 S3，完成后结项。

---

## 7. 阶段执行 TODO

| 阶段 | 内容 | 出口 | 状态 |
| --- | --- | --- | --- |
| **P0** 前置闸门 | 语料完整性 / 权威源冻结 / 分类基准提取 / 命名查重 | `data/taxonomy.json` + `generated/cards.json` 零缺陷 | ✅ **完成**（V1–V3、V6） |
| **P1** 目标与 Loop 定义 | 目标、完成判据、状态机、门禁、状态文件 | 本文件 §5/§6 | ✅ **完成** |
| **P2** 包骨架 | `packages/capabilities/dsh-paper2skills/`（package.json 三治理字段 + tsconfig + lib/taxonomy.js + scripts + 单测 10 条） | `pnpm run gate` 14/14 绿 | ✅ **完成**（V7） |
| **P3** 适配规范 | `docs/adaptation-spec.md`（S2b 组装判据）、`docs/synthesis-spec.md`（S2a 合成判据）、`docs/classification-spec.md` | 三份规范落盘 | ✅ **完成** |
| **P4 · S1 分类** | 25 个源域 → L1/L2/L3；产出 `data/classification.json` | **1338 卡全分类，1327 已归位 / 11 矩阵空白；L3 覆盖 134/151** | ✅ **完成**（V8–V10） |
| **P5 · S2 适配** | 28 批 × 48 张；S2a 子任务出合成字段 → `assemble-skills.mjs` 组装 `staging/<L2>/<slug>/SKILL.md` | **1338 个 SKILL.md，0 问题；占位段落跳过 4520、脱敏 3、0 超限** | ✅ **完成** |
| **P6 · S3 安装** | 快照 → `import-paper2skills.mjs` | **272 → 1610**（1338 个 `p2s-`）；`disable-model-invocation` 1338/1338 为 true | ✅ **完成** |
| **P7 接线** | `wire-skill-map.mjs` + `generate.mjs` + `verify-lossless.mjs` | **4821 断言全绿**（基线 4060）；134 个 L3 获供给、**9 缺口关闭 8**、全库只剩 1 处「平台无供给」（`利益冲突检查`） | ✅ **完成** |
| **P8 覆盖表** | 151 个 L3 的供给覆盖 + 空白登记 | `generated/coverage.json` + `docs/classification-spec.md` §4 | ✅ **覆盖表已出**；接线待 P7 |
| **P9 分层测试** | L1–L3 全自动；L4 路由实测；L5 SkillOpt（需授权） | `docs/test-report.md` 三栏已出；**L4/L5 未运行，需你授权** | ⚠️ **部分** |
| **P10 文档收尾** | SOP / 决策记录 Note / ADR 编号 | **ADR-0031 + Note 已落，索引已登记，`adr-index`/`adr-note-links` 门禁绿** | ✅ **完成** |

**注**：§2.3 的「7 张 T1 标 `is_skill_appropriate=false`」与 §2.4 的「近重复族」两条纪律在分类阶段被**分类落点**取代——同族卡会落在同一个 L3，装配阶段按 L3 内去重即可，不再单独维护族表。

**关键路径**：P0→P1→P2→P3→P4→P5→P6→P7→P8→P9→P10。

---

## 8. 测试阶梯

### L1 · 结构层（零成本，全自动）
`name` 正则与目录名一致；frontmatter 值 JSON 引号化或布尔；`description` ≤500；SKILL.md ≤12 KB；与现有技能零同名。

### L2 · 分类层（零成本，全自动）
每卡 ≥1 L3 且 L3 ∈ taxonomy；`l1_id/l2_id` 与 L3 一致；无跨面多挂；151 个 L3 的覆盖计数可对账。

### L3 · 目录可见性层
全局标准会话技能目录**不含**新技能；目标 preset 只出现其 subset；斜杠菜单中文 `title` 可检索。

### L4 · 路由与执行实测（需授权）
每张卡构造 3 类任务（正面触发 / 负面不触发 / 边界模糊）跑 subagent；每 L3 抽 1 张做真实输入产出验收。基准落 `eval/routing-benchmark-p2s.json`。

### L5 · SkillOpt 轨迹优化（需授权）
复用 `docs/skillopt-optimization-plan.md` 方法论：每卡 3–5 rollout + 2 held-out；五维打分；有界编辑 ≤5 处/轮；**held-out 严格改善才接受**。只做高价值卡（≤40 张）。

---

## 9. 风险与回滚

| 风险 | 触发条件 | 预案 |
| --- | --- | --- |
| 1338 张全部进技能库导致技能中心卡顿 | 目录 1610 个 | 全局 `disable-model-invocation` 生效即不进模型目录；目录页按 L1/L2/L3 折叠 |
| 近重复卡造成虚假供给冗余 | 未跑去重族 | 分类后按 (L2,L3) 聚合，同族只让 1 张进 `skill-subset`，其余留库不装配 |
| 全局目录失控 | 误设 `disable-model-invocation: false` | L3 断言 + importer 硬编码 O1 默认 |
| L3 分类被硬凑 | 某卡语义与任何 L3 都不符 | 允许挂 `unassigned` 并逐条登记，**不得**用语义不符的 L3 凑数 |
| 加密层再次污染 | 从 iCloud 工作树读取 | 只读本地 `playbook/`；iCloud 工作树永久只读禁入 |
| 技能库被覆盖 | 同名冲突 | 实测 1338 slug 零冲突；importer 仍有 overwrite 保护 |
| 50 preset 被破坏 | 接线错误 | 每轮跑 `verify-lossless.mjs`；回滚见下 |

**回滚命令**

```sh
rm -rf ~/.dsh/skills/p2s-*                  # 或从 backup/pre-paper2skills/ 整目录恢复
node scripts/role-presets/generate.mjs      # 用回退后的 skill-map.json 重生成
node scripts/role-presets/verify-lossless.mjs
```

---

## 附录 A · 中间产物

| 产物 | 路径 |
| --- | --- |
| 分类底座（4面/8域/151 L3） | `.scratch/paper2skills-preset-skills/data/taxonomy.json` |
| 卡清单（1338 张，含八段正文） | `.scratch/paper2skills-preset-skills/data/cards.json` |
| 卡总表（人读） | `.scratch/paper2skills-preset-skills/data/cards-index.tsv` |
| 抽取器 | `.scratch/paper2skills-preset-skills/scripts/extract-cards.mjs` |
| 历史集群判定（T1/T2，技术视角） | `/tmp/p2s/final.json`、`/tmp/p2s/tiers.json` |
| 岗位需求面 | `/tmp/p2s/preset-roster.md`、`/tmp/p2s/presets.json` |

## 附录 B · 151 条 L3 全量清单

见 `data/taxonomy.json` 的 `l3[]`，每条含 `plane / domain / role_id / role_alias / role_title`。
12 个 (面,域) 单元的分布见 §2.3。
