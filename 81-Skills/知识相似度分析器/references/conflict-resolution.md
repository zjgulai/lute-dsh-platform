# 冲突解决策略

## 冲突类型与解决方案

### Type 1: DUPLICATE (重复)

#### 特征
- S_anchor > HIGH
- S_logic > HIGH
- S_outcome > HIGH

#### 解决方案: Merge (合并)

**策略**: 合并两个 SKU，保留所有独特信息

**算法**:
```python
def merge_duplicates(sku1: dict, sku2: dict, llm_client) -> dict:
    prompt = f'''
    合并以下两个重复的 SKU：
    
    SKU 1: {json.dumps(sku1)}
    SKU 2: {json.dumps(sku2)}
    
    合并规则：
    1. execution_body: 整合两个版本的所有细节，去除重复
    2. constraints: 合并为并集
    3. prerequisites: 合并为并集
    4. variables: 合并去重
    5. applicable_objects: 取最具体的共同对象
    6. trigger: 保留更通用的触发条件
    
    输出合并后的 SKU JSON。
    '''
    
    merged = llm_client.generate(prompt)
    merged['metadata']['merged_from'] = [
        sku1['metadata']['uuid'],
        sku2['metadata']['uuid']
    ]
    merged['metadata']['uuid'] = str(uuid.uuid4())
    
    return merged
```

**非破坏性处理**:
```python
# 保留原始 SKU，标记为 deprecated
sku1['metadata']['deprecated_by'] = merged['metadata']['uuid']
sku2['metadata']['deprecated_by'] = merged['metadata']['uuid']
```

---

### Type 2: CONFLICT (冲突)

#### 特征
- S_anchor > HIGH
- S_logic 任意
- S_outcome < LOW

#### 解决方案: Branch (分支)

**策略**: 创建条件分支，明确何时使用哪个 SKU

**算法**:
```python
def branch_conflicts(sku1: dict, sku2: dict, llm_client) -> dict:
    prompt = f'''
    以下两个 SKU 针对相似场景但输出冲突：
    
    SKU 1: {json.dumps(sku1)}
    SKU 2: {json.dumps(sku2)}
    
    任务：
    1. 分析两个 SKU 的适用条件差异
    2. 识别区分条件（什么情况下用 SKU 1，什么情况下用 SKU 2）
    3. 创建统一的 IF-ELSE 逻辑
    4. 输出合并后的分支 SKU
    
    输出格式：
    {{
      "branched_sku": {{...}},
      "differentiating_conditions": "详细区分条件",
      "recommendation": "建议优先使用哪个"
    }}
    '''
    
    result = llm_client.generate(prompt)
    branched = result['branched_sku']
    branched['metadata']['branched_from'] = [
        sku1['metadata']['uuid'],
        sku2['metadata']['uuid']
    ]
    branched['metadata']['uuid'] = str(uuid.uuid4())
    branched['metadata']['conflict_resolution'] = {
        'type': 'branch',
        'conditions': result['differentiating_conditions'],
        'recommendation': result['recommendation']
    }
    
    return branched
```

**示例**:

输入:
- SKU A: "流动比率 > 2 为健康"（保守标准）
- SKU B: "流动比率 > 1.5 为健康"（宽松标准）

输出分支 SKU:
```json
{
  "trigger": {
    "condition_logic": "IF (行业 = 制造业 OR 保守评估) THEN 使用 > 2 标准; ELSE IF (行业 = 零售 OR 宽松评估) THEN 使用 > 1.5 标准"
  },
  "conflict_resolution": {
    "type": "branch",
    "conditions": "制造业和保守评估用 > 2，零售和宽松评估用 > 1.5",
    "recommendation": "根据行业特点选择"
  }
}
```

---

## 解决流程

```
检测相似度
    │
    ▼
分类关系 ── DUPLICATE ──→ Merge ──→ 标记原始 deprecated
    │
    ├── CONFLICT ───────→ Branch ──→ 标记原始 deprecated
    │
    ├── ALTERNATIVE ────→ Link ────→ 建立关联关系
    │
    └── INDEPENDENT ────→ Keep ────→ 保持不变
```

---

## 质量检查

### 合并后检查

- [ ] execution_body 包含两个原始版本的信息
- [ ] 无信息丢失
- [ ] 逻辑一致
- [ ] source_refs 包含两个来源

### 分支后检查

- [ ] IF-ELSE 条件覆盖所有场景
- [ ] 条件无重叠
- [ ] 条件完备（无遗漏场景）
- [ ] 区分条件明确可执行
