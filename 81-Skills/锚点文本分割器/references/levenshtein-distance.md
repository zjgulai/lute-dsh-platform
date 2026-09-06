# Levenshtein 距离（编辑距离）

## 定义

两个字符串之间的 Levenshtein 距离是将一个字符串转换为另一个字符串所需的最少单字符编辑操作（插入、删除、替换）的数量。

## 算法实现

### 动态规划解法

```python
def levenshtein_distance(s1: str, s2: str) -> int:
    # 确保 s1 是较长的字符串
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    
    # 边界情况
    if len(s2) == 0:
        return len(s1)
    
    # 只保留两行以优化空间
    previous_row = list(range(len(s2) + 1))
    
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        
        for j, c2 in enumerate(s2):
            # 计算三种操作的成本
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            
            current_row.append(min(insertions, deletions, substitutions))
        
        previous_row = current_row
    
    return previous_row[-1]
```

### 复杂度

- **时间**: O(n × m)，n 和 m 是两个字符串的长度
- **空间**: O(min(n, m))，使用滚动数组优化

## 在锚点分割中的应用

### 容错阈值计算

```python
def calculate_threshold(anchor_length: int, ratio: float = 0.33) -> int:
    """计算最大允许的编辑距离"""
    return int(anchor_length * ratio)

# 示例
anchor = "第二节 理论基础"  # 8 字符
threshold = calculate_threshold(len(anchor), 0.33)  # 2 字符

# 以下匹配会被接受：
# "第 二节 理论基础"  (距离 1：多了空格)
# "第二节理论基础"    (距离 1：少了空格)
# "第2节 理论基础"    (距离 1：数字替换)
```

### 滑动窗口匹配

```python
def find_best_match(content: str, anchor: str, threshold: float) -> tuple:
    anchor_len = len(anchor)
    best_pos = -1
    best_distance = float('inf')
    max_dist = int(anchor_len * threshold)
    
    # 滑动窗口
    for i in range(len(content) - anchor_len + 1):
        window = content[i:i + anchor_len]
        dist = levenshtein_distance(anchor, window)
        
        if dist < best_distance and dist <= max_dist:
            best_distance = dist
            best_pos = i
    
    return best_pos, best_distance
```

## 阈值选择建议

| 阈值 | 适用场景 | 容错能力 |
|-----|---------|---------|
| 0.1 (10%) | 精确匹配为主 | 仅允许 1-2 字符错误 |
| 0.33 (33%) | OCR 文档 | 允许常见识别错误 |
| 0.5 (50%) | 高度容错 | 可能引入误匹配 |

## 优化技巧

1. **快速拒绝**: 如果首字符不同，直接跳过
2. **长度过滤**: 先检查长度差异，差异过大直接拒绝
3. **缓存**: 缓存常用锚点的距离计算结果
