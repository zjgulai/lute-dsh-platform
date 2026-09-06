---
name: complex-skill
description: |
  复杂 Skill 模板，适用于多步骤工作流、脚本执行、多参考文档场景。
  当用户需要创建复杂 Skill、使用 scripts/ 和 assets/、
  管理多配置选项时使用。
  触发词：复杂 skill、多步骤工作流、脚本执行、skill 模板、高级配置。
version: "1.0.0"
complexity: "complex"
compatibility:
  claude: { status: "native" }
  cursor: { status: "native" }
  kimi: { status: "native" }
  gpt: { status: "bridge", limitations: ["脚本执行需适配"] }
  minimax: { status: "bridge", limitations: ["多步骤需简化"] }
---

# Complex Skill

复杂 Skill 模板，展示完整的 Skill 组织能力，适用于多步骤工作流场景。

## When to Use

- Multi-step complex workflows（多步骤复杂工作流）
- Tasks requiring detailed documentation（需要详细文档的任务）
- Advanced configuration scenarios（高级配置场景）
- Script execution required（需要脚本执行）
- Multiple reference documents needed（需要多份参考文档）

## When Not to Use

- Simple tasks (use minimal-skill)
- Standard tasks without complexity (use standard-skill)
- Single-step quick tasks
- No external dependencies allowed

## Core Workflow

### Phase 1: Analysis（分析阶段）

1. **Understand requirements**
   - Clarify task scope
   - Identify complexity level
   - Check compatibility constraints

2. **Analyze constraints**
   - Resource limitations
   - Execution environment
   - Dependency check

### Phase 2: Preparation（准备阶段）

3. **Check references**
   - Review `references/patterns.md` for common patterns
   - Review `references/advanced.md` for advanced usage
   - Review `references/api-reference.md` for API details

4. **Load configurations**
   - Parse input parameters
   - Validate configuration
   - Initialize environment

### Phase 3: Execution（执行阶段）

5. **Execute task**
   - Run main workflow
   - Execute scripts if needed
   - Handle intermediate states

6. **Validate results**
   - Check output quality
   - Verify constraints
   - Generate reports

## Structure

```
complex-skill/
├── README.md
├── SKILL.md
├── .skill-meta/
│   └── manifest.yaml
├── references/
│   ├── patterns.md
│   ├── advanced.md
│   └── api-reference.md
├── examples/
│   └── .gitkeep
├── scripts/
│   └── .gitkeep
└── tests/
    └── .gitkeep
```

## Definition of Done / 完成标准

- [ ] frontmatter 完整（含 limitations）
- [ ] Body 内容超过 3000 字符
- [ ] Core Workflow 分阶段（至少 2 个阶段）
- [ ] 每个阶段有详细子步骤
- [ ] 包含 Error Handling 章节
- [ ] 包含 Limitations 章节
- [ ] references/ 有多份文档
- [ ] scripts/ 目录存在（可选填充）
- [ ] examples/ 有使用示例

## Error Handling

### Validation Failed
**Symptom**: Input format error
**Solution**: 
1. Check `references/patterns.md`
2. Validate against schema
3. Provide clear error message

### Execution Failed
**Symptom**: Script or workflow error
**Solution**:
1. Check logs in `logs/`
2. Verify dependencies
3. Retry with fallback

### Compatibility Issue
**Symptom**: Model doesn't support feature
**Solution**:
1. Check compatibility matrix
2. Use bridge mode
3. Simplify workflow

## Limitations

1. **Specific format required**: Must follow Universal Skill Schema
2. **External dependencies needed**: Some features require external tools
3. **Complexity overhead**: Not suitable for simple tasks
4. **Testing required**: Complex workflows need thorough testing

## Resources

### References
- `references/patterns.md` - Common patterns
- `references/advanced.md` - Advanced usage
- `references/api-reference.md` - API reference

### Examples
- `examples/` - Usage examples directory

### Scripts
- `scripts/` - Utility scripts directory

## Methodology Audit / 方法论审计

本 Skill 采用分阶段执行模式：
1. **Analysis** - 先分析，再行动
2. **Preparation** - 准备充分，减少错误
3. **Execution** - 执行有序，可追溯

每个阶段都有明确的输入输出，便于调试和优化。

## Compatibility Matrix

| Feature | Claude | Cursor | Kimi | GPT | Minimax |
|---------|--------|--------|------|-----|---------|
| Multi-step | native | native | native | bridge | bridge |
| Scripts | native | native | native | limit | limit |
| References | native | native | native | native | native |
