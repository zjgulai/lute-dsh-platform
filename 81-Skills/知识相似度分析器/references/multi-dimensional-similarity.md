# 多维相似度理论

## 为什么需要多维度？

单一相似度无法区分不同类型的关系：

| 场景 | 场景相似度 | 逻辑相似度 | 输出相似度 | 关系类型 |
|-----|-----------|-----------|-----------|---------|
| 重复定义 | 高 | 高 | 高 | **重复** |
| 不同方法解决同类问题 | 高 | 低 | 相似 | **替代方案** |
| 同方法用于不同场景 | 低 | 高 | 高 | **泛化** |
| 完全无关 | 低 | 低 | 低 | **独立** |

---

## 三个维度

### 1. S_anchor: 场景相似度

**定义**: 两个 SKU 是否适用于相同的场景/对象

**计算**:
```
S_anchor = 0.5 × Jaccard(objects) + 0.5 × Cosine(trigger_embeddings)
```

**高 S_anchor 含义**:
- 适用对象重叠
- 触发条件相似
- 可能解决同类问题

### 2. S_logic: 执行逻辑相似度

**定义**: 两个 SKU 的执行逻辑/方法是否相似

**计算**:
```
S_logic = Cosine(execution_body_embeddings)
```

**高 S_logic 含义**:
- 使用相同的方法/公式
- 步骤流程相似
- 可能是同一知识的不同表述

### 3. S_outcome: 输出相似度

**定义**: 两个 SKU 的输出结果是否相似

**计算**:
```
S_outcome = 0.3 × TypeMatch + 0.7 × Cosine(result_template_embeddings)
```

**高 S_outcome 含义**:
- 输出类型相同
- 结果格式相似
- 目标一致

---

## 关系分类矩阵

### 分类规则

```
HIGH_THRESHOLD = 0.7
LOW_THRESHOLD = 0.3

IF S_anchor > HIGH AND S_logic > HIGH AND S_outcome > HIGH:
    → DUPLICATE (重复)
    
IF S_anchor > HIGH AND S_logic > HIGH AND S_outcome < LOW:
    → CONFLICT (冲突，同场景不同输出)
    
IF S_anchor > HIGH AND S_logic < LOW:
    → ALTERNATIVE (替代方案，同场景不同方法)
    
IF S_anchor < LOW:
    → INDEPENDENT (独立，不同场景)
    
OTHERWISE:
    → RELATED (相关，可能互补)
```

### 分类详解

#### DUPLICATE (重复)

**特征**: 高 × 高 × 高

**含义**: 同一知识的不同表述，可以合并

**示例**:
- SKU A: "流动比率 = 流动资产 / 流动负债"（中文）
- SKU B: "Current Ratio = Current Assets / Current Liabilities"（英文）

**处理**: 合并为一个 SKU，保留更完整的版本

#### CONFLICT (冲突)

**特征**: 高 × 高 × 低

**含义**: 同一场景下给出不同结论，需要决策

**示例**:
- SKU A: "流动比率 > 2 为健康"
- SKU B: "流动比率 > 1.5 为健康"

**处理**: 创建分支逻辑，添加条件区分

#### ALTERNATIVE (替代方案)

**特征**: 高 × 低 × 任意

**含义**: 解决同一问题的不同方法

**示例**:
- SKU A: 使用流动比率评估流动性
- SKU B: 使用速动比率评估流动性

**处理**: 保留两者，添加选择条件

#### INDEPENDENT (独立)

**特征**: 低 × 任意 × 任意

**含义**: 完全不同的知识

**示例**:
- SKU A: 流动比率计算（财务）
- SKU B: 客户满意度调查（营销）

**处理**: 无需处理，保持独立

#### RELATED (相关)

**特征**: 其他组合

**含义**: 有一定关联但非重复/冲突

**示例**:
- SKU A: 流动比率计算
- SKU B: 流动比率的局限性

**处理**: 建立关联关系，但不合并

---

## 相似度计算细节

### Jaccard 相似度

```python
def jaccard_similarity(set1: set, set2: set) -> float:
    """Jaccard = |A ∩ B| / |A ∪ B|"""
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    return intersection / union if union > 0 else 0.0
```

### Cosine 相似度

```python
import numpy as np

def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Cosine = (A·B) / (|A| × |B|)"""
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    return dot_product / (norm1 * norm2) if norm1 > 0 and norm2 > 0 else 0.0
```

### 嵌入向量

使用 BGE-M3 生成语义嵌入：

```python
class EmbeddingClient:
    def embed(self, texts: list[str]) -> list[np.ndarray]:
        # 调用 BGE-M3 API
        # 返回 1024 维向量
        pass
```

---

## 阈值选择

### 默认阈值

```python
HIGH_THRESHOLD = 0.7   # 视为相似
LOW_THRESHOLD = 0.3    # 视为不相似
```

### 阈值调整

| 场景 | 调整建议 |
|-----|---------|
| 需要严格去重 | 提高 HIGH_THRESHOLD 到 0.8 |
| 需要发现潜在关联 | 降低 LOW_THRESHOLD 到 0.2 |
| 专业领域 | 根据领域特点微调 |

---

## 可视化

### 三维散点图

```
          S_logic
             |
             |  DUPLICATE
             |     /|
             |    / |
             |   /  |
             |  /   |
             | /    |
             |/_____|_____ S_anchor
            /       |
           /        |
          / CONFLICT|
         /          |
        S_outcome
```

### 热力图

```
           Low    Medium   High
         ┌--------┬--------┬--------┐
  High   │RELATED │RELATED │DUPLICATE│
S_logic  │        │        │         │
         ├--------┼--------┼--------┤
  Medium │INDEP.  │RELATED │CONFLICT│
         │        │        │         │
         ├--------┼--------┼--------┤
  Low    │INDEP.  │ALTERN.│ALTERN. │
         └--------┴--------┴--------┘
               Low    Medium   High
                    S_anchor
```
