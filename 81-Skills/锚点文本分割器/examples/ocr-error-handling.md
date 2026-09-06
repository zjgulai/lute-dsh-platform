# 示例：OCR 错误容错

## 场景

PDF 经过 OCR 识别后，Markdown 文本中出现了识别错误：
- 空格插入："第二章" → "第 二 章"
- 字符替换："比率" → "比卒"
- 数字混淆："1.5" → "l.5"（字母 l 替代数字 1）

## 输入

**原文（OCR 后）**:
```
第一章 财务分析基础

财务分析是...

第 二 章 比率分析

流动比率是...

第三章 现金流分析

现金流是...
```

**锚点（用户提供）**:
```json
[
  {"text": "第二章", "description": "在第二章之前"},
  {"text": "第三章", "description": "在第三章之前"}
]
```

## 处理过程

### Step 1: 精确匹配失败

- 在原文中搜索 "第二章" → 未找到
- 原文实际是 "第 二 章"（带空格）

### Step 2: 模糊匹配成功

```python
# Levenshtein 距离计算
anchor = "第二章"
window = "第 二 章"  # 从原文滑动窗口获得

distance = levenshtein_distance("第二章", "第 二 章")
# distance = 2（两个空格）

threshold = len(anchor) * 0.33  # 2.64
# distance <= threshold，匹配成功！
```

### Step 3: 定位与分割

找到位置后分割：
- Chunk 1: 第一章 财务分析基础...（到"第 二 章"之前）
- Chunk 2: 第 二 章 比率分析...（到"第三章"之前）
- Chunk 3: 第三章 现金流分析...

## 输出

```json
{
  "chunks": [
    {
      "index": 0,
      "content": "第一章 财务分析基础\n\n财务分析是...",
      "start_pos": 0,
      "end_pos": 45
    },
    {
      "index": 1,
      "content": "第 二 章 比率分析\n\n流动比率是...",
      "start_pos": 45,
      "end_pos": 98
    },
    {
      "index": 2,
      "content": "第三章 现金流分析\n\n现金流是...",
      "start_pos": 98,
      "end_pos": 130
    }
  ],
  "anchor_results": [
    {
      "anchor": "第二章",
      "found": true,
      "position": 45,
      "match_type": "fuzzy",
      "distance": 2,
      "matched_text": "第 二 章"
    },
    {
      "anchor": "第三章",
      "found": true,
      "position": 98,
      "match_type": "exact",
      "distance": 0
    }
  ]
}
```

## 关键观察

1. **容错性**: 33% 的阈值可以容忍常见 OCR 错误
2. **可追溯**: 返回 matched_text 显示实际匹配的内容
3. **混合模式**: 有的锚点精确匹配，有的模糊匹配
4. **无幻觉**: 分割基于原文，不修改内容

## 配置建议

```python
config = {
    "fuzzy_threshold": 0.33,  # 适用于 OCR 文档
    "case_sensitive": False,
    "min_anchor_length": 5    # 避免太短锚点误匹配
}
```

对于高质量文本（无 OCR 错误）：
```python
config = {
    "fuzzy_threshold": 0.1,   # 更严格
    "case_sensitive": True
}
```
