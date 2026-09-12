# 维护 SOP · 论文技能库

> 包：`packages/capabilities/dsh-paper2skills/`　·　决策依据：[ADR-0031](../../../../docs/adr/ADR-0031.md)
> 目标技能库：`~/.dsh/skills/p2s-*`（1338 项）　·　装配出口：50 个岗位 preset 的 `skill-subset`

---

## 1. 一段话现状

1338 张卡全部装进技能库（`p2s-` 前缀，全局 `disable-model-invocation: true`，不进模型目录），
按岗位矩阵 **4 面 / 8 责任域 / 151 细分业务** 分类，再有选择地接进 50 个岗位的 `skill-subset`
（每个 L3 取排名前 3、原缺口放宽到 5）。**151 个 L3 中 134 有供给、17 零供给；9 个原平台缺口关闭 8 个。**

## 2. 数据源纪律

| 源 | 用途 | 纪律 |
| --- | --- | --- |
| `/Users/lute/project/paper_to_skills/playbook/` | **唯一权威卡源**（1,339 个卡页 HTML） | 只读。**iCloud 工作树永久禁入**——那里的 1,356 个 `.md` 全是加密态（魔数 `887d1c8bcd0aa302`） |
| `/Users/lute/project/AI组织变革/docs/` | 分类骨架（`organization-graph.json` D-021 + `role-catalog.json`） | 只读。L3 逐字取，不改写、不合并同义词 |
| `generated/` | 派生产物（`cards.json` / `coverage.json` / `batches/` / `adapt/`） | 可重建，已 gitignore |
| `staging/` | 适配中间产物 + 安装前快照 | 可重建，已 gitignore |

## 3. 全量重跑（源站更新后）

```sh
cd packages/capabilities/dsh-paper2skills

node scripts/build-taxonomy.mjs        # 岗位矩阵材料 → data/taxonomy.json（断言 4/8/151）
node scripts/extract-cards.mjs         # playbook HTML → generated/cards.json（断言 1338 张）

# S1 分类：按源域派子任务（25 个），每个改写 generated/classification 的对应域
#         判据：每卡 1–3 个 L3，L3 逐字取自 taxonomy，空 l3 必带理由
node scripts/classify-check.mjs        # 门禁：逐域 id 同序同集 / L3 逐字命中 / 缺口白名单
node scripts/merge-classification.mjs  # → data/classification.json + generated/coverage.json
                                       #   内含 auditGapClaims 三档缺口校准

# S2 适配：切批 → 子任务出「判断类字段」→ 脚本组装
node scripts/build-batches.mjs         # → generated/batches/S2-NN.json（每批 ≤48 张）
#         子任务只写 generated/adapt/S2-NN.json（description/steps/boundaries/契约…）
#         判据见 docs/synthesis-spec.md
node scripts/assemble-skills.mjs       # 脚本组装 SKILL.md：frontmatter / 章节序 / 字节上限
                                       #  / 占位段落跳过 / **密钥脱敏** / 分类字段照抄

# S3 装配
node scripts/import-paper2skills.mjs --dry   # 先演练
tar czf staging/backup/skills-pre.tgz -C ~/.dsh skills   # 快照
node scripts/import-paper2skills.mjs         # 装进 ~/.dsh/skills
node scripts/verify-install.mjs              # 结构 + 分类一致性

# 接线（会改仓库文件，先备份）
node scripts/wire-skill-map.mjs --dry        # 先看会关闭哪些缺口
node scripts/wire-skill-map.mjs              # 写回 scripts/role-presets/skill-map.json
cd ../../.. && node scripts/role-presets/generate.mjs
node scripts/role-presets/verify-lossless.mjs   # 必须全绿，且岗位卡字节 142,085 不变
pnpm run gate
```

## 4. 增量（新增一张卡）

1. 把卡页放进源站 `playbook/skills/`，重跑 `extract-cards.mjs`（会断言新总数，记得同步 `P2S_EXPECT`）。
2. 只对该源域重跑 S1 与对应批次的 S2。
3. `merge-classification` → `build-batches` → `assemble-skills` → `import-paper2skills`。
4. `wire-skill-map` 只增不减：已有 `supply` 不会被删，只按排名追加。

## 5. 三条不许破的约束

| # | 约束 | 后果 |
| --- | --- | --- |
| 1 | **`disable-model-invocation: "true"`** | 全局模型目录已占约 7.2 万字符；1338 张若可见会直接压垮每个会话的 prompt。可见性只经 preset 的 `skill-subset` 逐岗开放 |
| 2 | **`skill-map.json` 只增不减** | `wire-skill-map.mjs` 从不删已有 supply；人工改时也须保持。`verify-lossless.mjs` 的 L8 会校验每个引用的技能真实存在 |
| 3 | **分类字段逐字来自 `data/classification.json`** | `assemble-skills.mjs` 从分类资产取 `facets`，不信子任务的输出；`verify-install.mjs` 会双向核对 |

## 6. 缺口与空白的当前状态

| 项 | 数量 | 位置 |
| --- | ---: | --- |
| 「平台无供给」缺口 | **1**（`利益冲突检查`，AGT-005） | 全库唯一仍写「平台无供给」的 persona 段 |
| 零供给 L3 | **17** | `generated/coverage.json` 的 `empty[]` + `docs/classification-spec.md` §4 |
| 无家可归的卡（矩阵空白） | **11** | 装在 `未归类（矩阵空白）`，不进任何 preset；`data/classification.json` 的 `unassigned` |
| 缺口认领虚报（已丢弃留档） | 124 | `data/classification.json` 的 `gap_audit.dropped` 与每条的 `fills_gap_dropped` |

**这三类空白都不是"没找到卡"，是论文语料结构上不产出**（硬件研发/工业设计、B2B 商务、人事内控、
AI 伦理/ESG 披露）。补它们要么走公司 SOP，要么新造卡，要么给矩阵补 L3（材料侧决策）。

## 7. 效果实测（改任何合成字段之前必跑）

**结构门禁管不到效果。** `verify-install.mjs`、`verify-lossless.mjs`、`pnpm run gate` 证明的是
「装上了、没丢字、字段合法」；它们**不能**证明「挂上去有用」。实测过一次，结论是反的——
技能卡让业务交付物得分下降。所以：

> **改 `description` / `whenToUse` / `workflow` / `steps` / `contract_*` / `boundaries`
> 这六个合成字段中的任何一个，都必须先跑下面的效果门。**
> 判据、数字与噪声尺度见 [eval-report.md](eval-report.md)，纪律见 [ADR-0035](../../../docs/adr/ADR-0035.md)。

```sh
cd packages/capabilities/dsh-paper2skills

# ① 结构面回归（每次必跑，秒级）
node eval/static-routing.mjs        # M0–M6；M2 越岗暴露必须为 0，M6 必须 1338/1338

# ② 用例（确定性，重跑逐字节一致）
node eval/build-cases.mjs           # L6 抽样 40 例（种子 20260912）
node eval/build-l7-cases.mjs        # L7 高价值卡 20 张（种子 20260913）

# ③ 效果面（真实 subagent，走 workflow 工具；跑批产物落 eval/out/l7-rollout/）
#    control 臂产物要留档——它是后续所有对比的基线
node eval/l6-report.mjs             # L6 汇总
```

三条判读纪律（不遵守就会把噪声当结论）：

1. **`null` 不计入分母。** workflow 子任务有约三成瞬时失败率，重试上限 6、把尝试次数记下来；
   基础设施失败被算成模型答错，会把准确率凭空压掉几十个百分点。
2. **判官噪声实测 ±0.6～0.7。** 同一批 control 文件在两轮里被判出 12.75 与 13.45。
   低于这个量级的 Δ 只能写「不可分辨」。
3. **位置偏差检验必须做且必须成对。** X/Y 顺序由 case_id 奇偶决定，跑完核一次
   「同一内容在 X 位与 Y 位的均分差」；差值不抵消就不许下结论。

**未过 held-out 门的改动一律回滚**，并留可复核证据（`grep -rl <新措辞> ~/.dsh/skills | wc -l` 应为 0、
受影响卡的 SKILL.md 与改前 `cmp` 逐字节一致、`verify-install.mjs` 全绿）。

## 8. 回滚

```sh
rm -rf ~/.dsh/skills/p2s-*                                   # 一次性移除 1338 项 → 回到 272
tar xzf packages/capabilities/dsh-paper2skills/staging/backup/skills-pre-paper2skills.tgz -C ~/.dsh
cp packages/capabilities/dsh-paper2skills/staging/backup/skill-map.json.pre-paper2skills \
   scripts/role-presets/skill-map.json
node scripts/role-presets/generate.mjs && node scripts/role-presets/verify-lossless.mjs
```
