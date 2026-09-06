# MECE 原则详解

## 什么是 MECE？

**MECE** = **M**utually **E**xclusive, **C**ollectively **E**xhaustive

（互斥且完备）

由麦肯锡咨询公司开发，用于结构化思维和问题分解。

---

## 两个核心原则

### 1. Mutually Exclusive（互斥）

**定义**: 各个部分之间没有重叠

**含义**:
- 每个知识点只在一个 SKU 中出现
- SKU 之间边界清晰
- 避免重复描述同一概念

**示例**:

✅ **互斥**（好）:
- SKU A: 流动比率 = 流动资产 / 流动负债
- SKU B: 速动比率 = (流动资产 - 存货) / 流动负债
- *两者是不同的公式，无重叠*

❌ **不互斥**（坏）:
- SKU A: 流动比率计算与应用
- SKU B: 如何使用流动比率
- *两者都讲流动比率，内容重叠*

### 2. Collectively Exhaustive（完备）

**定义**: 所有部分合起来覆盖全部内容

**含义**:
- 所有 SKU 一起覆盖原文全部知识
- 无遗漏
- 无信息丢失

**示例**:

✅ **完备**（好）:
- 原文讲了：定义、公式、阈值、应用、限制
- SKU A: 定义 + 公式
- SKU B: 阈值 + 应用
- SKU C: 限制
- *全部覆盖*

❌ **不完备**（坏）:
- 原文讲了：定义、公式、阈值、应用、限制
- SKU A: 定义 + 公式
- SKU B: 阈值
- *遗漏了应用和限制*

---

## MECE 在知识提取中的应用

### 分解策略

#### 策略 1: 二分法

将知识按二元维度划分：
- 内部 vs 外部
- 定性 vs 定量
- 短期 vs 长期

**示例**:
```
财务分析
├── 定性分析
│   ├── 管理层质量评估
│   └── 行业前景分析
└── 定量分析
    ├── 比率分析
    └── 趋势分析
```

#### 策略 2: 过程法

按时间或流程顺序划分：
- 步骤 1 → 步骤 2 → 步骤 3
- 输入 → 处理 → 输出

**示例**:
```
信用评估流程
├── 数据收集
├── 数据分析
├── 风险评估
└── 决策建议
```

#### 策略 3: 要素法

按组成部分划分：
- 要素 A + 要素 B + 要素 C = 整体

**示例**:
```
杜邦分析
├── 净利润率
├── 资产周转率
└── 权益乘数
```

### 提取时的 MECE 检查

#### 提取前

1. **阅读全文**: 理解整体结构和主要知识点
2. **识别边界**: 找出知识点之间的边界
3. **分类**: 预先规划 SKU 的类别

#### 提取中

1. **逐段分析**: 每段内容应该归到哪个 SKU
2. **标记重叠**: 如果发现内容可以归到两个 SKU，需要重新定义边界
3. **记录遗漏**: 确保每个段落都被覆盖

#### 提取后

**互斥检查**:
```python
def check_mutual_exclusive(skus: list) -> list:
    """检查 SKU 之间是否有重叠"""
    overlaps = []
    for i, sku1 in enumerate(skus):
        for sku2 in skus[i+1:]:
            # 检查名称相似度
            name_sim = text_similarity(sku1['name'], sku2['name'])
            # 检查 execution_body 相似度
            body_sim = text_similarity(
                sku1['core_logic']['execution_body'],
                sku2['core_logic']['execution_body']
            )
            
            if name_sim > 0.7 or body_sim > 0.5:
                overlaps.append((sku1['name'], sku2['name']))
    
    return overlaps
```

**完备检查**:
```python
def check_collective_exhaustive(skus: list, source_text: str) -> float:
    """检查覆盖率"""
    # 提取所有 source_ref 覆盖的行号
    covered_lines = set()
    for sku in skus:
        start = sku['metadata']['source_ref']['start_line']
        end = sku['metadata']['source_ref']['end_line']
        covered_lines.update(range(start, end + 1))
    
    # 计算覆盖率
    total_lines = len(source_text.split('\n'))
    coverage = len(covered_lines) / total_lines
    
    return coverage
```

---

## 常见 MECE 违规

### 违规 1: 内容重叠

**问题**: 两个 SKU 描述同一概念的不同方面，但边界不清

**解决**: 按单一职责原则重新定义边界

```
❌ 原来:
- SKU A: 流动比率计算与应用
- SKU B: 流动比率的优缺点

✅ 改进:
- SKU A: 流动比率计算（仅公式和计算）
- SKU B: 流动比率评估标准（阈值和判断）
- SKU C: 流动比率局限性（限制和注意）
```

### 违规 2: 粒度不均

**问题**: 有的 SKU 很详细，有的很简略

**解决**: 统一粒度，或按层级组织

```
❌ 原来:
- SKU A: 财务报表分析（涵盖 5 个报表）
- SKU B: 现金流量表中的经营活动现金流计算

✅ 改进:
- SKU A: 资产负债表分析
- SKU B: 利润表分析
- SKU C: 现金流量表分析
- SKU D: 现金流量表 - 经营活动分析
```

### 违规 3: 遗漏关键内容

**问题**: 原文中的重要内容没有提取为 SKU

**解决**: 逐段检查，确保全覆盖

---

## Prompt 中的 MECE 指导

在知识提取 Prompt 中强调 MECE:

```
## MECE 原则（Mutually Exclusive, Collectively Exhaustive）

**互斥**: 每个 SKU 代表 ONE 独立概念，与其他 SKU 无重叠
- 如果两个 SKU 标题相似，重新划分边界
- 如果两个 SKU 包含相同公式，合并为一个

**完备**: 一起覆盖文本全部内容
- 读完一段，确保提取了所有知识点
- 检查是否有段落没有被任何 SKU 引用

**示例**:
❌ 不好的分解:
- SKU 1: 财务比率分析
- SKU 2: 流动比率
（重叠：SKU 2 是 SKU 1 的子集）

✅ 好的分解:
- SKU 1: 财务比率概述（定义、分类）
- SKU 2: 流动比率计算（公式、示例）
- SKU 3: 速动比率计算（公式、示例）
（互斥：各讲不同内容；完备：覆盖原文全部）
```

---

## 验证清单

- [ ] 任意两个 SKU 的 execution_body 相似度 < 50%
- [ ] 所有 SKU 的 source_ref 行号覆盖原文 90%+
- [ ] 没有 SKU 的 name 包含"和"/"与"/"及"（可能包含多个概念）
- [ ] 每个 SKU 可以独立理解和使用
