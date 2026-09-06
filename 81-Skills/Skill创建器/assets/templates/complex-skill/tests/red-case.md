# Iron Law RED — Baseline Failure Case

> Complex Skill 必须有可重复的 RED 证据。
> 详细模板：`../../standard-skill/tests/red-case.md`
>
> Complex 级别额外要求：
> - 至少 **2 个不同业务场景** 的 RED（证明问题不是一次性的）
> - 每个 RED 用例对应一个 GREEN
> - 跨 3 个模型（Claude / Kimi / Cursor）验证可重复性，结果记入下表

## 元信息

```yaml
skill_under_test: "{skill-name}"
complexity: "complex"
test_id: "RED-001"
scenarios:
  - id: "scenario-a"
    description: "{业务场景 A}"
  - id: "scenario-b"
    description: "{业务场景 B}"
```

## Scenario A — {业务场景}

### 用户请求

```
{原样保存}
```

### 跨模型基线表

| 模型 | 是否失败 | 失败维度 | 备注 |
|------|---------|---------|------|
| claude-sonnet-4.5 | ☐ 是 / ☐ 否 | | |
| kimi-{version} | ☐ 是 / ☐ 否 | | |
| cursor-default | ☐ 是 / ☐ 否 | | |

**Complex RED 判定**：≥ 2/3 模型失败才视为成立（避免依赖单模型行为）。

## Scenario B — {业务场景}

（同上结构）

## 与 REFACTOR 的关系

Complex Skill 在 REFACTOR 阶段必须额外跑：

- 长输入压力（输入 > 10K tokens）
- 模糊输入（缺少关键字段时是否合理降级）
- 反例输入（与 description 描述场景不符时是否正确拒绝）

详见 `references/iron-law-testing.md`。
