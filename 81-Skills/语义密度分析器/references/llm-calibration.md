# LLM 评分校准方法

## 为什么需要校准？

### NLP 评分的局限

纯 NLP 特征（逻辑/实体/结构密度）可能不准确：
- 高逻辑密度可能只是一堆连接词，没有实质内容
- 高实体密度可能只是列举，没有推理过程
- 不同领域的知识价值不同

### LLM 的价值判断

LLM 可以理解语义，判断内容是否真正有价值：
- 是否包含可执行的知识？
- 是否值得转化为 Skill？
- 信息密度和实用价值如何？

---

## 校准流程

### Step 1: 分层采样

确保样本覆盖各种密度水平：

```python
def stratified_sample(chunks: list, n_samples: int = 15) -> list:
    # 按基础评分排序
    sorted_chunks = sorted(chunks, key=lambda x: x['base_score'])
    n = len(sorted_chunks)
    
    # 三层采样
    samples = []
    samples.extend(random.sample(sorted_chunks[:n//3], min(5, n//3)))      # 低密度
    samples.extend(random.sample(sorted_chunks[n//3:2*n//3], min(5, n//3)))  # 中密度
    samples.extend(random.sample(sorted_chunks[2*n//3:], min(5, n//3)))      # 高密度
    
    return samples
```

### Step 2: LLM 评分

**Prompt 设计**:

```
评估以下文本片段的"知识含金量"（0-100分）。

评分标准：
- 90-100: 核心知识、关键公式、重要定义
- 70-89: 详细解释、示例说明、推导过程
- 50-69: 一般性描述、背景信息
- 30-49: 过渡性内容、重复说明
- 0-29: 无关内容、填充文本

评估维度：
1. 可执行性：是否包含可操作的步骤/公式/规则？
2. 实用性：是否对解决实际问题有帮助？
3. 独特性：是否包含非通用的专属知识？
4. 完整性：知识是否自成一体、逻辑完整？

文本：
{chunk_content}

输出格式：
```json
{
  "gold_score": 75,
  "reasoning": "简要评分理由（50字内）",
  "dimension_scores": {
    "executability": 80,
    "practicality": 70,
    "uniqueness": 75,
    "completeness": 80
  }
}
```
```

### Step 3: 线性回归校准

```python
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score

def calibrate_weights(samples: list) -> dict:
    # 构建训练数据
    X = [[s['s_logic'], s['s_entity'], s['s_struct']] for s in samples]
    y = [s['llm_score'] for s in samples]
    
    # 训练模型
    model = LinearRegression()
    model.fit(X, y)
    
    # 评估拟合度
    y_pred = model.predict(X)
    r2 = r2_score(y, y_pred)
    
    return {
        'w_logic': max(0, model.coef_[0]),
        'w_entity': max(0, model.coef_[1]),
        'w_struct': max(0, model.coef_[2]),
        'intercept': model.intercept_,
        'r2_score': r2
    }
```

### Step 4: 权重归一化

```python
def normalize_weights(weights: dict) -> dict:
    """确保权重和为 1"""
    total = weights['w_logic'] + weights['w_entity'] + weights['w_struct']
    if total == 0:
        return {'w_logic': 0.33, 'w_entity': 0.33, 'w_struct': 0.33}
    
    return {
        'w_logic': weights['w_logic'] / total,
        'w_entity': weights['w_entity'] / total,
        'w_struct': weights['w_struct'] / total,
        'intercept': weights['intercept'],
        'r2_score': weights['r2_score']
    }
```

---

## 校准结果解读

### 示例：财务分析领域

```python
CALIBRATION_RESULT = {
    'w_logic': 0.25,      # 逻辑重要性较低
    'w_entity': 0.55,     # 实体（公式、指标）最重要
    'w_struct': 0.20,     # 结构中等
    'intercept': 5.0,     # 基础分
    'r2_score': 0.82      # 拟合度良好
}
```

**解读**：
- 财务分析中，公式和指标（实体）比逻辑连接词更重要
- R² = 0.82 表示 NLP 特征可以解释 82% 的 LLM 评分方差

### 示例：技术文档领域

```python
CALIBRATION_RESULT = {
    'w_logic': 0.40,      # 逻辑较重要（步骤顺序）
    'w_entity': 0.30,     # 实体中等（代码、配置）
    'w_struct': 0.30,     # 结构较重要（代码块）
    'intercept': 3.0,
    'r2_score': 0.75
}
```

**解读**：
- 技术文档中，步骤逻辑和代码结构同样重要

---

## 质量门槛

### 可接受的校准

- **R² ≥ 0.7**: 校准成功，可以使用
- **0.5 ≤ R² < 0.7**: 勉强可用，建议增加样本
- **R² < 0.5**: 校准失败，检查特征提取逻辑

### 异常检测

```python
def detect_outliers(samples: list, threshold: float = 20.0) -> list:
    """检测 LLM 评分与 NLP 评分差异过大的异常样本"""
    outliers = []
    for sample in samples:
        nlp_score = (sample['s_logic'] + sample['s_entity'] + sample['s_struct']) / 3 * 100
        llm_score = sample['llm_score']
        
        if abs(nlp_score - llm_score) > threshold:
            outliers.append({
                'chunk_id': sample['id'],
                'nlp_score': nlp_score,
                'llm_score': llm_score,
                'diff': abs(nlp_score - llm_score)
            })
    
    return outliers
```

---

## 实际应用

### 最终评分计算

```python
def calculate_final_score(chunk: dict, weights: dict) -> float:
    raw_score = (
        weights['w_logic'] * chunk['s_logic'] +
        weights['w_entity'] * chunk['s_entity'] +
        weights['w_struct'] * chunk['s_struct']
    ) * 100 + weights['intercept']
    
    # 归一化到 0-100
    return max(0, min(100, raw_score))
```

### 高价值内容筛选

```python
def filter_high_value_chunks(chunks: list, weights: dict, percentile: float = 0.7) -> list:
    """筛选前 30% 高价值内容"""
    scored = [(c, calculate_final_score(c, weights)) for c in chunks]
    scored.sort(key=lambda x: x[1], reverse=True)
    
    cutoff = int(len(scored) * (1 - percentile))
    return [chunk for chunk, score in scored[:cutoff]]
```
