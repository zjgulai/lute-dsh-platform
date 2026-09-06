# SKU Schema 完整规范

## 概述

SKU（Standardized Knowledge Unit）是结构化的知识单元，采用 Core + Flex 双区设计：
- **Core Area**: 固定结构，确保一致性
- **Flex Area**: 允许扩展，适应不同领域

## Core Area（核心区域）

### 1. Metadata（元数据）

```json
{
  "metadata": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "流动比率计算",
    "source_ref": {
      "chunk_id": "chunk_0015",
      "book_index": 15,
      "start_line": 245,
      "end_line": 278,
      "snippet": "流动比率是衡量企业短期偿债能力的重要指标"
    }
  }
}
```

| 字段 | 类型 | 必需 | 说明 |
|-----|------|------|------|
| uuid | string | ✅ | 唯一标识符，UUID v4 |
| name | string | ✅ | 知识单元名称，简洁描述性 |
| source_ref | object | ✅ | 来源追溯信息 |

**source_ref 字段**:
- `chunk_id`: 来源块 ID
- `book_index`: 在书中的顺序索引
- `start_line`/`end_line`: 起始/结束行号
- `snippet`: 原文摘要（≤100字符）

---

### 2. Context（上下文）

```json
{
  "context": {
    "applicable_objects": ["企业财务分析", "流动资产管理"],
    "prerequisites": ["资产负债表", "流动资产数据", "流动负债数据"],
    "constraints": ["不适用于长期偿债能力评估", "不考虑资产质量差异"]
  }
}
```

| 字段 | 类型 | 必需 | 说明 |
|-----|------|------|------|
| applicable_objects | list[string] | ✅ | 适用对象/场景 |
| prerequisites | list[string] | ✅ | 前置条件/数据依赖 |
| constraints | list[string] | ✅ | 约束条件/不适用场景 |

**设计原则**:
- `applicable_objects`: 回答"这适用于什么？"
- `prerequisites`: 回答"需要什么前提？"
- `constraints`: 回答"什么时候不能用？"

---

### 3. Trigger（触发条件）

```json
{
  "trigger": {
    "condition_logic": "IF (需要评估企业短期偿债能力) AND (有流动资产和负债数据) THEN 应用此知识"
  }
}
```

| 字段 | 类型 | 必需 | 说明 |
|-----|------|------|------|
| condition_logic | string | ✅ | 触发条件的伪代码描述 |

**格式建议**:
```
IF (条件1) AND (条件2) THEN 应用
IF (场景A) OR (场景B) THEN 应用
WHEN (状态变化) AND (满足X) THEN 应用
```

---

### 4. Core Logic（核心逻辑）

```json
{
  "core_logic": {
    "logic_type": "Formula",
    "execution_body": "1. 获取流动资产总额 CA\n2. 获取流动负债总额 CL\n3. 计算：Current Ratio = CA / CL\n4. 判断：\n   - CR > 2.0: 强流动性\n   - 1.0 < CR <= 2.0: 正常\n   - CR <= 1.0: 流动性风险\n5. 考虑行业差异：制造业通常需要 > 1.5",
    "variables": [
      {"name": "CA", "type": "float", "description": "流动资产总额"},
      {"name": "CL", "type": "float", "description": "流动负债总额"},
      {"name": "CR", "type": "float", "description": "流动比率计算结果"}
    ]
  }
}
```

| 字段 | 类型 | 必需 | 说明 |
|-----|------|------|------|
| logic_type | enum | ✅ | Formula/Decision_Tree/Heuristic/Process |
| execution_body | string | ✅ | 详细执行逻辑 |
| variables | list[object] | ✅ | 变量定义列表 |

**logic_type 枚举**:
- `Formula`: 公式计算
- `Decision_Tree`: 决策树/条件判断
- `Heuristic`: 启发式规则/经验法则
- `Process`: 多步骤流程

**execution_body 要求**:
- ✅ 全面详尽，不省略细节
- ✅ 保留所有数字、阈值、公式
- ✅ 使用结构化格式（编号、列表）
- ✅ 包含边界情况和例外

---

### 5. Output（输出）

```json
{
  "output": {
    "output_type": "Value",
    "result_template": "流动比率为 {CR:.2f}，{judgment}。{suggestion}"
  }
}
```

| 字段 | 类型 | 必需 | 说明 |
|-----|------|------|------|
| output_type | enum | ✅ | Value/Alert/Action |
| result_template | string | ✅ | 结果解释模板 |

**output_type 枚举**:
- `Value`: 数值/计算结果
- `Alert`: 警告/风险提示
- `Action`: 行动建议

**result_template 变量**:
使用 `{variable_name}` 语法引用 core_logic.variables 中定义的变量

---

## Flex Area（灵活区域）

允许 LLM 根据领域需求添加自定义字段。

### 示例：财务分析领域

```json
{
  "custom_attributes": {
    "domain_tags": ["财务分析", "流动性指标", "短期偿债"],
    "importance": "high",
    "formula_complexity": "low",
    "calculation_steps": 3,
    "industry_adjustment": true,
    "benchmark_values": {
      "manufacturing": 1.5,
      "retail": 2.0,
      "tech": 3.0
    }
  },
  "schema_explanation": "添加了 formula_complexity 和 industry_adjustment 以支持自动代码生成和个性化评估"
}
```

### 常见自定义字段

| 字段 | 类型 | 说明 |
|-----|------|------|
| domain_tags | list[string] | 领域标签，用于分组 |
| importance | enum | high/medium/low |
| complexity | enum | high/medium/low |
| related_skus | list[string] | 相关 SKU UUID |
| frequency | enum | 使用频率 common/occasional/rare |

### schema_explanation

**必需**: 解释自定义字段的用途，帮助后续理解和维护。

---

## 完整示例

```json
{
  "metadata": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "流动比率计算与评估",
    "source_ref": {
      "chunk_id": "chunk_0015",
      "book_index": 15,
      "start_line": 245,
      "end_line": 278,
      "snippet": "流动比率是衡量企业短期偿债能力的重要指标"
    }
  },
  "context": {
    "applicable_objects": ["企业财务分析", "信贷风险评估"],
    "prerequisites": ["资产负债表", "流动资产数据", "流动负债数据"],
    "constraints": ["仅评估短期偿债能力", "不考虑资产质量"]
  },
  "trigger": {
    "condition_logic": "IF (需要评估企业流动性) AND (有资产负债数据) THEN 应用"
  },
  "core_logic": {
    "logic_type": "Formula",
    "execution_body": "1. 从资产负债表获取流动资产总额 CA\n2. 获取流动负债总额 CL\n3. 计算：Current Ratio = CA / CL\n4. 评估：\n   - CR > 2.0: 流动性强\n   - 1.0 < CR <= 2.0: 正常范围\n   - CR <= 1.0: 存在流动性风险\n5. 行业调整：制造业标准通常为 1.5 而非 2.0",
    "variables": [
      {"name": "CA", "type": "float", "description": "流动资产总额"},
      {"name": "CL", "type": "float", "description": "流动负债总额"},
      {"name": "CR", "type": "float", "description": "流动比率"}
    ]
  },
  "output": {
    "output_type": "Value",
    "result_template": "流动比率 {CR:.2f}，{assessment}"
  },
  "custom_attributes": {
    "domain_tags": ["财务分析", "流动性指标"],
    "importance": "high",
    "formula_complexity": "low",
    "industry_specific": true
  },
  "schema_explanation": "添加了 industry_specific 标记以支持行业特定调整"
}
```

---

## 验证规则

### 必需字段检查

```python
REQUIRED_FIELDS = [
    'metadata.uuid',
    'metadata.name',
    'metadata.source_ref',
    'context.applicable_objects',
    'core_logic.execution_body',
    'trigger.condition_logic'
]
```

### 值域检查

```python
VALID_LOGIC_TYPES = ['Formula', 'Decision_Tree', 'Heuristic', 'Process']
VALID_OUTPUT_TYPES = ['Value', 'Alert', 'Action']
VALID_IMPORTANCE = ['high', 'medium', 'low']
```

### 质量检查

```python
QUALITY_RULES = {
    'execution_body_min_length': 50,
    'execution_body_max_length': 5000,
    'name_max_length': 100,
    'snippet_max_length': 100
}
```
