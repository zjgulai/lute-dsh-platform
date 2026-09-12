# 出海技能 → 岗位 判定协议 v1

本文件是「222 个出海技能 + 29 个 AI全栈技能」归岗判定的**唯一规则来源**。每个批次执行者都必须
逐条遵守；产物会被**机械校验**（脚本，不看解释），不合格即退回。

## 0. 你的输入（只读，不要修改任何输入文件）

| 文件 | 内容 |
| --- | --- |
| `.scratch/overseas-skills-refactor/evidence/roles.json` | **唯一合法的岗位词表**：50 个岗位的 id / 别名 / 岗位名 / 面 / 责任域 / 使命 / 标准产物 / **三条责任名** / 边界 |
| `.scratch/overseas-skills-refactor/evidence/batches/B<NN>.json` | 你这一批的技能（name / title / 场景 / 中文简介 / 工具缺口 / description / 正文摘录 / `existing` 既有映射） |
| `.scratch/overseas-skills-refactor/evidence/all-skills.json` | 全部技能（需要上下文时查，别整篇读） |

## 1. 判定问题

> **这个技能，能不能承担某个岗位的某条责任？**

不是「词面像不像」，而是「把这个技能交给这个岗位的人，他能不能靠它完成那条责任」。

- 判据优先级：技能的**正文摘录**（适用场景/使用方法）> description > 中文简介 > 标题。
- 岗位侧的判据：**该岗位的三条责任名**最硬（能对上就对上），其次是使命与标准产物。
- **禁止**因为「都属于电商」「都做数据」这类粗糙相似而挂岗。

## 2. 硬规则

1. `id` 必须是 `roles.json` 里 50 个岗位 id 之一。**不得发明岗位 id**。
2. `responsibility` 必须**逐字**取该岗位 `responsibilities` 三条之一；岗位成立但三条都对不上时写 `""`。
3. 每个挂载必须给**两条逐字证据**，会被机械校验（必须是指定文本里的连续子串，长度 4–30 字，不得含换行/引号）：
   - `from_skill`：该技能文本（description 或正文摘录）里的连续子串。
   - `from_role`：该岗位文本（mission / artifact / responsibilities 三条）里的连续子串。
   - 注意：**这是唯一的防伪造闸门**——编造、改写、拼接、跨行截取都会被抓出来。
4. 一技多岗允许，但要**每岗独立证据**。挂到 ≥3 个岗位时，`confidence` 不得为 `high`，并在 `note` 里说明为什么它同时服务这些岗位。
5. `roles: []` 允许，但必须写 `no_role_reason`，并给 `no_role_kind`：
   - `GENERIC_METHOD` 通用工程/方法论，换到任何岗位都成立，因此不归任何一个岗位（如 TDD、访谈、代码评审）
   - `TOOL_ONLY` 纯工具接入 / 平台操作形态，没有岗位责任可言
   - `OUT_OF_SCOPE` 材料《AI组织变革》的责任域里根本没有这个职能
   - `OTHER`（必须在 reason 里说清）
6. `existing` 字段是**人工既定的强先验**。默认保留；删除任何一条必须在 `drop_reasons` 里给出理由（岗位 id + 一句话）。可以新增。
7. `confidence`：`high`（技能正文直接对上责任名）/ `medium`（对上使命或标准产物）/ `low`（间接推断，需人工复核）。

## 3. 输出（严格 JSON，无围栏、无解释文字）

写到 `/Users/lute/project/Magpie-Horch/.scratch/overseas-skills-refactor/assignments/B<NN>.json`：

```json
{
  "batch": "B01",
  "assignments": [
    {
      "name": "amazon-ppc-campaign-manager",
      "roles": [
        {
          "id": "AGT-021",
          "responsibility": "渠道经营分析",
          "confidence": "high",
          "from_skill": "广告投放与预算",
          "from_role": "对指定Amazon经营范围的增长方案负责",
          "note": ""
        }
      ],
      "no_role_reason": null,
      "no_role_kind": null,
      "drop_reasons": []
    }
  ]
}
```

- `assignments` 必须**与输入批次同序、同集**：每个技能恰好出现一次，不增不删。
- `no_role_reason` / `no_role_kind` 只在 `roles` 为空时填，否则为 `null`。
- 全程**不要**写任何其他文件；不要修改 `roles.json`、批次文件、`all-skills.json`。

## 4. 你交付前的自检（必须做，逐条）

1. 条数：`assignments.length` == 输入 `count`；名字集合逐一相等（顺序一致）。
2. 每个 `id` 都在 `roles.json`；每个 `responsibility` 都在该岗位的三条里（或 `""`）。
3. 每条 `from_skill` 用 `grep -F` 能在该技能的 description/正文摘录里命中；每条 `from_role` 能在该岗位的 mission/artifact/responsibilities 里命中。
4. 没有技能被静默丢掉；没有 `roles: []` 却没写 `no_role_reason`。
5. 文件能被 `json.load` 解析。

自检不合格就先修再写盘。**只报结果，不要长篇解释**：回复一段话，写明批次号、输入条数、输出条数、挂岗条数、无岗条数、被删除的既有映射条数。
