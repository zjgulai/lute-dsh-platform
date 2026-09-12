# M1 试点：KOL-Hunter 的选人功能跑通了，压出骨架必须是「多技能组合」（ADR-0034）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0034](../../../adr/ADR-0034.md)。
> **状态：已实现并实测。** 本文所有数字都是本机真实命令输出，不是推测；未跑的项一律标注「未运行」。
> 上游形态决策见 [ADR-0033](../../../adr/ADR-0033.md) 与其 [Note](2026-09-12-native-agent-product-form.md)；规格已升 v2，记在 [.scratch/native-agent-product/spec.md](../../../../.scratch/native-agent-product/spec.md)。

## Problem

ADR-0033 把产品形态定成了「项目目录里的声明 + 实现包」，但只到规格，没有任何功能跑通过。M1 的任务是**用真实项目把规格压一遍**——规格自己写了这条要求（v1 §Consequences：「M1 用真实项目把本规格压一遍，把压出来的偏差写回本文件，而不是让规格与实现各说各话」）。

试点三件事由用户裁定：

| 项 | 裁定 | 确认依据（不是喜好） |
| --- | --- | --- |
| 试点项目 | `/Users/lute/project/KOL-Hunter` | 现状是 Vite + React + React Flow 的零后端 mock 产品，11 种节点已按「流程连接 + 无限下钻」定义好，等于功能与工作流的现成草稿 |
| 归属岗位 | `agt-033 结伴 · 达人与联盟合作` | 该岗位的 `dsh-skill-subset` 已声明 16 个技能，实体全部在盘；其中 `p2s-kol-creator-matching`（达人筛选·六维打分·ROI）与产品本职逐字重合——50 个岗位里唯一以此为专职的 |
| 首个功能 | `select-candidates` 选人条件 → 推荐名单 | 3 个字段（产品 / 目标市场 / 单达人预算），产品自己的 `mockAgent.ts` 里已有同构的 `SelectionRequest` |

要回答的问题：**规格 v1 的 `features[].skill`（单数）+ `kind: "model" | "deterministic"`（功能级二选一），够不够表达一个真功能？**

## 取证：M1 的实际交付物与读数

全部落在产品目录内（`/Users/lute/project/KOL-Hunter`），**本仓库一行代码未动**——这本身验了 ADR-0033「产品代码留在各自项目」这条。

| 件 | 位置 | 说明 |
| --- | --- | --- |
| 声明 | `product.json` | 1 个产品 / 1 个功能 / `preset: agt-033` |
| **L2 产品局部技能** | `skills/kol-hunter-candidate-screen/SKILL.md` | 六维权重表、分级阈值、折减公式、边界——口径的事实之家 |
| L1 岗位专属技能（引用） | `~/.dsh/skills/p2s-kol-creator-matching/` | 岗位已声明，产品只是引用 |
| 确定性步骤 | `pipeline/score.mjs` | 归一化 → 六维加权 → 预算硬约束 → 折减 ROI → 排序 |
| 拼装 | `pipeline/build-prompt.mjs` | `composePrompt({skills, inputs, facts})` 纯函数 |
| 渲染 | `pipeline/render.mjs` + `templates/candidate-list.md` | 模型只出结构化字段，版式由模板定 |
| 一条命令 | `run.mjs` | 跑通 / `--advise` 并入模型产出 / `--check` 自检 |
| 事实表 | `data/kols.json`（24 人）、`data/product-category.json` | 从产品的 `mockData.ts` 冻结 |

真实命令输出：

```
$ node run.mjs --check
✓ preset 归属存在                                  agt-033 = 结伴 · 达人与联盟合作
✓ L1 技能确实属于该岗位                            p2s-kol-creator-matching ⊆ agt-033 的 16 个岗位技能
✓ 技能可解析（L1 ← 全局，L2 ← 产品目录）           L1:p2s-kol-creator-matching@f379af6f8fbb  L2:kol-hunter-candidate-screen@049d562bcde1f8a7
✓ 骨架至少两段（岗位方法 + 产品契约）              1 × L1 + 1 × L2
✓ 六维权重表可解析且权重和为 1                     audience=0.25 relevance=0.15 engagement=0.15 conversion=0.25 safety=0.1 value=0.1
✓ 权重维度与打分工具实现的维度一致                 audience,conversion,engagement,relevance,safety,value
✓ 分级阈值表可解析且主推阈值 > 测试阈值            primary≥75, test≥60
✓ 折减公式在技能正文里逐字存在                     roi365d × (0.5 + 0.5 × audience/100) × (0.7 + 0.3 × relevance/100)
✓ 每个 {{变量}} 都能在 features[].inputs 里找到    product, market, budget
✓ 模板能渲染                                       467 字符
✓ L2 产品技能没有落进全局技能目录                  检查了 1 个 L2 技能
✓ 声明的 schema / template 文件都在
✓ 产物目录可写且上次产物格式合规                   1 份产物，最近 20260912T025805Z.json（24 人）
✓ 提示词快照存在且未过期                           prompts/__snapshots__/select-candidates.md @ b738e62723be
✓ 14 项全部通过
```

```
$ node run.mjs --advise <模型产出> --advise-provider "…"
运行 20260912T025805Z · kol-hunter（agt-033）· select-candidates
技能骨架   L1:p2s-kol-creator-matching  +  L2:kol-hunter-candidate-screen
提示词     b738e62723be  快照 current
✓ 端到端跑通：产物 artifacts/select-candidates/20260912T025805Z.json
```

**确定性实测**（同一输入连跑两次）：提示词 SHA-256 均为 `b738e62723be75b811da75e0a15419edfcbef8ad36fcd4531df6b9c16f96343f`，逐字节相同。

**快照守卫实测**（换输入 `--market 英国 --budget 6000`）：提示词哈希变为 `a9a0608c39b0`，快照状态被标 `stale`；不加 `--update-snapshot` 不落盘。

五条负例探针，全部按契约动作：

| 探针 | 期望 | 实测 |
| --- | --- | --- |
| `--market 德国`（不在声明的 options 里） | 拒 | exit 1：`输入 market="德国" 不在声明的 options 里：美国 / 英国 / 澳大利亚` |
| 模型把 k03 的 `totalScore` 从工具值 70.24 改成 88.88 | 拒 | exit 1：`k03.totalScore: 工具 70.24，模型写了 88.88（数字不得重算或改写）` |
| 模型把 k10 从工具判的 `exclude` 升到 `test` | 拒 | exit 1：`k10: 模型把工具分级 exclude 升到 test（只许降不许升）` |
| 不给 `--advise` | 明说未执行 | exit 2 + `⚠ 模型步未执行`，绝不静默当成成功 |
| 技能正文改口径而快照不更新 | 红 | `--check` 的「快照未过期」项失败 |

## 取证：岗位技能会被平台自己重刷（M1 收尾时撞上）

同一份输入、同一份产品代码，提示词哈希从 `b738e62723be` 变成 `4b22687e11ce`（+443 字节）。追下去的真实读数：

| 探针 | 读数 |
| --- | --- |
| `~/.dsh/skills` 下 10:55–11:01 之间被改写的 `SKILL.md` | **1338 个**（几乎整个技能库） |
| `p2s-kol-creator-matching/SKILL.md` | 8859 → 9302 字节；正文多出「参数移植纪律」段与「技能关联」段 |
| 同期本仓库 `packages/capabilities/dsh-paper2skills/` 的写入 | `generated/assemble-report.json` + `staging/**/SKILL.md` 批量重建 |

即 **p2s 技能装配管线在跑，把全局技能库整体重刷了一遍**，而产品提示词是从 L1 技能正文拼出来的。

处理与实测：

1. 快照加**旁证** `prompts/__snapshots__/<feature>.snapshot.json`：`{promptHash, inputs, skills[{id,layer,hash}]}`。
2. `--check` 在快照 stale 时比对旁证，把结论收敛成两种之一并指名道姓。
3. **实测**：真改一个字节的 L1 技能正文 → exit 1，报
   `技能正文被外部改写（非本次输入变化）：L1:p2s-kol-creator-matching b39e777889eb→2d34c44f5ac3 → 复核后再 --update-snapshot`
   ；还原后 14/14 复位。
4. **顺带定下的纪律**：产品不得依赖 L1 正文的稳定性做缓存或幂等判定；要稳定就把技能哈希写进运行证据（manifest 已记 `skills[].hash`）。

**为什么这条值得单列**：它把「快照 stale」从一句无信息量的报错，变成一个有归因的判据。没有它，运维会去翻产品仓库找自己没做过的改动。

## Decision

见 [ADR-0034](../../../adr/ADR-0034.md) 的六条。核心两条：**骨架是多技能组合（`method` L1 + `contract` L2）**、**功能内部下沉为 `steps[]`**。

## Alternatives considered

- **一条功能只挂一条技能**：放弃。达人方法论在岗位，产品字段/权重/阈值在产品，两者评审人不同。硬塞进一条技能，等于让「产品调一个分级阈值」必须走岗位技能的改动。
- **口径硬编码在 `score.mjs`，技能只写散文**：放弃。同一份口径两个家，改一处忘另一处；代价是技能正文被约束成可解析表格，值得。
- **保留功能级 `kind`，`steps[]` 只作说明**：放弃。那样「数字归工具、只降不升」两条契约就没有声明依据。
- **回执只摘关键数字**（M1 首版的省事做法）：放弃。见下面「压出来的四处偏差」第 4 条。
- **`status` 保持两档枚举，把原因写进文档**：放弃。卡片要当场说实话。

## Consequences

### 压出来的四处偏差（v1 规格没说清的地方，已回写 v2 §11）

1. **`features[].skill` 单数表达不了真功能。** 这是决策性偏差，单独立了 ADR-0034。
2. **功能级 `kind` 二选一表达不了「一个功能里既有算数又有判断」。** 下沉为 `steps[]`。
3. **回执的字段集是由「将来要拿它做什么判定」倒推的。** M1 首版回执只摘了总分与分级，直到要核验「模型回写的数是否等于工具读数」才发现**回执里根本不够做这个核验**。教训写成一句：证据的形状跟着判定走，不跟着「现在有什么」走。
4. **开发中自检抓到 3 个真错**，全部是 v1 没说清导致的不一致：
   - 口径缺 `relevance` 一维（`score.mjs` 的归一窗口表与技能权重表各说各话）→ 加自检项「权重维度集合 == 工具实现维度集合」后当场变红；
   - 模板渲染器把**合法空串**当成缺变量（`budgetNote: ""`）→ 改为视图模型给非空默认值，渲染器保持严格（空 = 缺失，能抓真拼写错）；
   - 产物目录检查把「空目录」误判成「有残留」。

   **这 3 个都是「两份事实」型错误**，形状与 ADR-0009 要治的病一致。

### 正面

- 产品第一次有了家：一个 `product.json` 说清这个目录是什么、有哪些功能、归属哪个岗位。
- 提示词第一次可回放：纯函数 + 快照 + 哈希，同一输入逐字节相同。
- 模型第一次被关进契约：数字逐字相等、分级只降不升，两条都有负例探针。
- **产品技能真的随产品走了**：L2 落在产品目录内，自检机检它没落进 `~/.dsh/skills/`。

### 负面 / 未决

- **模型步尚未收进基座。** M1 是「脚本拼装提示词 → 外部模型产出 → `--advise` 并入」。产品最终形态里这一步应由产品插件在会话内 `ctx.tools.register` 触发，凭证与模型路由归基座。**M2 前必须收口。**
- **入口面板的客户端服务未打包**，所以卡片点开只能走第 2 级回退（新建会话 + 选中 `agt-033`）。这是 `status: draft` + `statusReason` 的真实原因，也是 M2 的范围。
- **自检 14 项还没进门禁。** 它是独立命令 `node run.mjs --check`，靠人记得跑；M4 搬进 `pnpm run gate` 才算硬门槛。
- **`workflow.edges` 还是空的**：只有 1 个功能，两节点工作流是 M3。
- **`.gitignore` 未处理 `artifacts/` 与 `runs/`**：产物要不要进版本库、进多少，落点定了要同步（规格 §10 第 1 条）。
- **L2 技能目前只有「文件形态」，插件包形态未落地。** 现在由产品自己的 `pipeline/skills.mjs` 从 `<产品>/skills/` 读；规格 §5.1 要求的「由产品插件在自身 fiber scope 注册、L2 只在该产品挂载处可见」还没在真会话里证伪。**M2 范围。**

**未运行**：M2/M3/M4 的验收命令（发现/开入口的 curl 探针、两节点工作流、门禁反例）本次一律未运行，不宣称。
