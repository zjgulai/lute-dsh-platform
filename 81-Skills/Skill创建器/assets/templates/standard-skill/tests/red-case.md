# Iron Law RED — Baseline Failure Case

> **目的**：证明"没有这个 Skill 时，agent 处理同类任务会失败或显著低质"。
> **使用时机**：编写 Skill 之前。RED 没跑通就写 Skill = 在解决伪需求。

## 元信息

```yaml
skill_under_test: "{skill-name}"        # 本 Skill 的 kebab-case 名称
test_id: "RED-001"                      # 测试用例编号
test_type: "RED"                        # 固定 RED
created: "{YYYY-MM-DD}"
author: "{your-name-or-handle}"
status: "pending"                       # pending | recorded | superseded
```

## 测试场景

### 用户请求（原样保存）

```
{把真实用户会发出的请求原样贴进来，不要美化}
```

### 上下文

- 平台：Claude Code / Cursor / Kimi（任选一个跑基线）
- 模型：{e.g. claude-sonnet-4.5}
- 启用的其他 Skills：{列出，或写"none"}
- 启用的 MCP/工具：{列出，或写"default only"}

## 基线运行（无本 Skill）

### 输入

```
{完整 prompt，与"用户请求"一致或包含必要补充}
```

### 实际输出

```
{原样保存 agent 的输出。不要做事后修饰。}
```

### 失败证据

至少满足下列**任一**条 RED 才算成立：

- [ ] **结构缺失**：输出缺少 ≥ 1 个关键产物（例如 6-8 秒说服链 4 个时间窗都没分析）
- [ ] **方法论缺失**：使用了通用流程，没有体现领域内的非平凡判断
- [ ] **错误结论**：输出在事实/逻辑上明确错误（举具体反例）
- [ ] **可重复性差**：相同输入跑 3 次得到 3 种结构（说明无稳定方法论）

### 失败程度评分（人工）

| 维度 | 1（无失败） … 5（严重失败） |
|------|---------------------------|
| 输出结构完整性 | {} |
| 方法论体现度 | {} |
| 事实正确性 | {} |
| 可执行性 | {} |

**RED 判定**：任一维度 ≥ 3 即视为 RED 成立。

## 与 GREEN 的关系

- RED 通过后，编写 SKILL.md 与最小 references
- 用 **完全相同** 的"用户请求"跑 GREEN（见 `green-case.md`）
- GREEN 必须能让上述失败证据中至少一项消失

## 注意

- 不要构造"人工设计"的 RED 用例。要用**真实业务里反复出现的请求**
- 不要拿"模型擅长的简单任务"去跑 RED，那不构成 Skill 的存在理由
- RED 失败必须**可重复**（同 prompt 至少 2 次都失败），否则可能只是随机抖动
