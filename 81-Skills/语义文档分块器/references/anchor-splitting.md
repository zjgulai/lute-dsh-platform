# 锚点分割模式（Anchor-Based Splitting）

## 问题背景

直接使用 LLM 分割长文本时，如果让 LLM 输出完整的新块内容：
- **幻觉风险**: LLM 可能修改、遗漏或添加原文内容
- **不可验证**: 无法确认输出是否精确对应原文
- **OCR 错误**: PDF 转 Markdown 可能包含识别错误

## 解决方案

**核心思想**: LLM 只输出"锚点"（原文中的精确片段），而不是完整内容。

## 工作流程

### 1. LLM 生成锚点

```
用户：请将以下文本分割为3段
文本：[长文本内容...]

LLM：{
  "anchors": [
    {"anchor": "第二节 理论基础", "position": "before"},
    {"anchor": "第三节 实验方法", "position": "before"}
  ]
}
```

### 2. 模糊匹配定位

使用 Levenshtein 距离在原文中定位锚点：

```python
def find_anchor_position(content: str, anchor: str) -> int:
    # 1. 尝试精确匹配
    pos = content.find(anchor)
    if pos != -1:
        return pos
    
    # 2. 模糊匹配（滑动窗口）
    best_pos = -1
    best_distance = float('inf')
    threshold = len(anchor) // 3  # 允许 33% 编辑距离
    
    for i in range(len(content) - len(anchor)):
        window = content[i:i + len(anchor)]
        dist = levenshtein_distance(anchor, window)
        if dist < best_distance and dist <= threshold:
            best_distance = dist
            best_pos = i
    
    return best_pos
```

### 3. 基于锚点分割

```python
def split_by_anchors(content: str, anchors: list) -> list:
    positions = [0]
    for anchor in anchors:
        pos = find_anchor_position(content, anchor)
        if pos > 0:
            positions.append(pos)
    positions.append(len(content))
    
    chunks = []
    for i in range(len(positions) - 1):
        chunk = content[positions[i]:positions[i+1]]
        chunks.append(chunk)
    
    return chunks
```

## 关键参数

| 参数 | 说明 | 默认值 |
|-----|------|-------|
| `anchor_length` | 锚点长度（字符） | 30 |
| `levenshtein_threshold` | 编辑距离阈值 | 33% |

## 容错机制

1. **锚点不存在**: 跳过该锚点，记录警告
2. **多个匹配**: 选择编辑距离最小的
3. **重叠锚点**: 去重并排序
4. **锚点在边界**: 调整至合理位置

## 优势

- ✅ **可验证**: 锚点必须在原文中存在
- ✅ **精确**: 分割基于原文，无幻觉
- ✅ **容错**: 处理 OCR 识别错误
- ✅ **可追溯**: 知道每个块的精确来源
