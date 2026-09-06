# 示例：书籍分块

## 输入

一本关于财务分析的 200 页 PDF 书籍，经 MinerU 转换后的 Markdown。

**原始特征**：
- 总字符数：~150,000
- 预估 Tokens：~75,000
- 标题数量：45 个（6 个一级标题，18 个二级标题，21 个三级标题）

## 配置

```python
config = {
    "max_tokens": 8000,
    "max_iterations": 3,
    "chars_per_token": 2.0,
    "language": "zh"
}
```

## 分块过程

### Phase 1: 章节拆分

**LLM 分析结果**：
```json
{
  "split_points": [1, 320, 890, 1560, 2340, 2980, 3560],
  "reasoning": "按章分割，每章一个初始块",
  "estimated_chunks": 7
}
```

**初始块分布**：

| 块 ID | 标题 | 行范围 | 预估 Tokens |
|-------|------|--------|-------------|
| chunk_0001 | 第一章 财务分析基础 | 1-319 | ~6,400 |
| chunk_0002 | 第二章 财务报表解读 | 320-889 | ~11,400 ⚠️ |
| chunk_0003 | 第三章 比率分析 | 890-1559 | ~13,400 ⚠️ |
| chunk_0004 | 第四章 现金流分析 | 1560-2339 | ~15,600 ⚠️ |
| chunk_0005 | 第五章 估值方法 | 2340-2979 | ~12,800 ⚠️ |
| chunk_0006 | 第六章 风险评估 | 2980-3559 | ~11,600 ⚠️ |
| chunk_0007 | 第七章 案例分析 | 3560-4000 | ~8,800 |

> ⚠️ 标记的块超过 8000 tokens，需要 Phase 2 递归细分

### Phase 2: 递归细分

**以 chunk_0004（第四章）为例**：

内容长度：15,600 tokens > 8,000，需要细分

**LLM 生成锚点**：
```json
{
  "anchors": [
    {"anchor": "4.1 直接法与间接法\n\n现金流", "description": "在4.1节之前"},
    {"anchor": "4.2 经营活动现金流\n\n经营活动", "description": "在4.2节之前"}
  ]
}
```

**细分结果**：
- chunk_0004_1: 第四章开头 ~ 4.1节之前 (~5,200 tokens)
- chunk_0004_2: 4.1节 ~ 4.2节之前 (~5,800 tokens)
- chunk_0004_3: 4.2节 ~ 结尾 (~4,600 tokens)

### 最终输出

**分块统计**：
- 初始块：7 个
- 经过递归细分后：14 个
- 平均块大小：~5,400 tokens
- 标准差：~1,200 tokens

**输出结构**：
```yaml
chunks:
  - id: "chunk_0001"
    book_index: 0
    title: "第一章 财务分析基础"
    parent_path: []
    start_line: 1
    end_line: 319
    iteration: 1
    tokens: 6400
    
  - id: "chunk_0004_2"
    book_index: 5
    title: "4.1 直接法与间接法"
    parent_path: ["第四章 现金流分析"]
    start_line: 1560
    end_line: 1950
    iteration: 2
    tokens: 5800
    
  # ... 其他块

tree:
  id: "root"
  title: "财务分析书籍"
  children:
    - id: "chunk_0001"
      title: "第一章 财务分析基础"
      children: []
    - id: "chunk_0002"
      title: "第二章 财务报表解读"
      children: [...]  # 细分后的子块
```

## 验证

### 完整性检查
- ✅ 所有行号连续无遗漏
- ✅ 内容拼接后与原 Markdown 一致
- ✅ 层级关系正确（一级标题 > 二级标题 > 三级标题）

### 质量指标
- ✅ 所有块 < 8,000 tokens
- ✅ 分割点位于章节边界
- ✅ 无段落被切分
