# Iron Law RED — Baseline Failure Case

> See `../../standard-skill/tests/red-case.md` for the full template.
> Minimal Skills 也建议至少跑一次 RED，避免造伪需求。

## 极简版字段

```yaml
skill_under_test: "{skill-name}"
test_id: "RED-001"
test_type: "RED"
```

### 用户请求

```
{原样保存}
```

### 基线失败证据

至少一句话说明"没有本 Skill 时输出哪里不够":

```
{e.g. "默认情况下输出 200 字泛泛而谈，没有指出关键约束"}
```

### GREEN 后预期

```
{e.g. "加载 Skill 后能输出 5 条具体可执行项，每条 < 30 字"}
```
