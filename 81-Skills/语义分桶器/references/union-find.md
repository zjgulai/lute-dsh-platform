# Union-Find 并查集算法

## 算法概述

并查集（Disjoint Set Union, DSU）是一种处理不相交集合合并与查询的数据结构。

**核心操作**:
- `find(x)`: 查找 x 所属集合的根
- `union(x, y)`: 合并 x 和 y 所在的集合

---

## 应用场景

在语义分桶中：
- SKU = 元素
- 相似关系 = 连接边
- 桶 = 连通分量

**为什么用并查集？**
1. **传递性**: A~B 且 B~C → A,B,C 同桶
2. **高效**: 近乎 O(1) 的查询和合并
3. **动态**: 可以增量添加相似关系

---

## 算法实现

### 基础版本

```python
class UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))
    
    def find(self, x: int) -> int:
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]
    
    def union(self, x: int, y: int):
        px, py = self.find(x), self.find(y)
        if px != py:
            self.parent[px] = py
```

### 优化版本（路径压缩 + 按秩合并）

```python
class UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))
        self.rank = [0] * n
        self.size = [1] * n  # 记录集合大小
    
    def find(self, x: int) -> int:
        """路径压缩：找到根后直接连接"""
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]
    
    def union(self, x: int, y: int):
        """按秩合并：小树合并到大树"""
        px, py = self.find(x), self.find(y)
        if px == py:
            return
        
        # 按秩合并
        if self.rank[px] < self.rank[py]:
            px, py = py, px
        self.parent[py] = px
        self.size[px] += self.size[py]
        
        if self.rank[px] == self.rank[py]:
            self.rank[px] += 1
    
    def get_size(self, x: int) -> int:
        """获取集合大小"""
        return self.size[self.find(x)]
    
    def is_connected(self, x: int, y: int) -> bool:
        """检查是否在同一集合"""
        return self.find(x) == self.find(y)
```

---

## 复杂度分析

| 操作 | 时间复杂度 | 说明 |
|-----|-----------|------|
| find | O(α(n)) ≈ O(1) | α 是阿克曼函数的反函数 |
| union | O(α(n)) ≈ O(1) | 同上 |

对于任何实际应用，α(n) < 5。

---

## 在语义分桶中的应用

### 算法流程

```python
def bucket_with_union_find(skus: list, threshold: float) -> dict:
    n = len(skus)
    uf = UnionFind(n)
    
    # 计算相似度并合并
    for i in range(n):
        for j in range(i + 1, n):
            similarity = calculate_similarity(skus[i], skus[j])
            if similarity >= threshold:
                uf.union(i, j)
    
    # 收集分组
    buckets = {}
    for i in range(n):
        root = uf.find(i)
        if root not in buckets:
            buckets[root] = []
        buckets[root].append(i)
    
    return buckets
```

### 示例

**输入**: 6 个 SKU，相似度阈值 0.5

相似关系：
- SKU 0 ~ SKU 1 (0.7)
- SKU 1 ~ SKU 2 (0.6)
- SKU 3 ~ SKU 4 (0.8)
- SKU 5 独立

**并查集过程**:
```
初始: [0, 1, 2, 3, 4, 5]

union(0, 1): [1, 1, 2, 3, 4, 5]  (0→1)
union(1, 2): [1, 1, 1, 3, 4, 5]  (2→1，传递性)
union(3, 4): [1, 1, 1, 4, 4, 5]  (3→4)

结果桶:
- Bucket 1: [0, 1, 2]  (通过传递性连接)
- Bucket 4: [3, 4]
- Bucket 5: [5]  (单元素)
```

---

## 优化技巧

### 1. 预筛选

在计算精确相似度前，先用简单规则过滤：

```python
def quick_filter(sku1: dict, sku2: dict) -> bool:
    """快速判断是否需要计算精确相似度"""
    # 如果标签完全没有交集，不可能相似
    tags1 = set(sku1['custom_attributes']['domain_tags'])
    tags2 = set(sku2['custom_attributes']['domain_tags'])
    
    if not tags1.intersection(tags2):
        return False
    
    return True
```

### 2. 倒排索引

```python
def build_inverted_index(skus: list) -> dict:
    """构建标签到 SKU 索引"""
    index = {}
    for i, sku in enumerate(skus):
        for tag in sku['custom_attributes']['domain_tags']:
            if tag not in index:
                index[tag] = []
            index[tag].append(i)
    return index

# 只比较有共同标签的 SKU
def get_candidates(sku: dict, index: dict) -> set:
    candidates = set()
    for tag in sku['custom_attributes']['domain_tags']:
        candidates.update(index.get(tag, []))
    return candidates
```

### 3. 大桶细分

```python
def refine_large_bucket(bucket: list, skus: list, max_size: int) -> list:
    """递归细分过大的桶"""
    if len(bucket) <= max_size:
        return [bucket]
    
    # 提高阈值重新分桶
    sub_skus = [skus[i] for i in bucket]
    sub_buckets = bucket_with_union_find(sub_skus, threshold * 1.5)
    
    # 映射回原始索引
    result = []
    for sub_bucket in sub_buckets.values():
        result.append([bucket[i] for i in sub_bucket])
    
    return result
```

---

## 与其他聚类算法的对比

| 算法 | 时间复杂度 | 优点 | 缺点 |
|-----|-----------|------|------|
| Union-Find | O(n² α(n)) | 简单、高效、支持动态合并 | 需要预定义相似度阈值 |
| K-Means | O(nki) | 无需阈值 | 需要预设 k、对初始值敏感 |
| DBSCAN | O(n log n) | 自动确定簇数 | 密度不均匀时效果差 |
| 层次聚类 | O(n²) | 可视化层次 | 计算慢 |

**为什么选 Union-Find？**
- 我们需要传递性（A~B~C → A~C）
- 阈值明确（标签重叠度）
- 实现简单高效
