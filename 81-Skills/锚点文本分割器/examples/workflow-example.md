# 完整工作流示例：锚点文本分割器

## 场景：OCR 扫描件按章节分割

### 输入

**原文（OCR后）**：
```
第一章 绪论
本文旨在研究人工智能在医疗领域的应用...

第二章 文 献综述
国内外学者对AI医疗进行了广泛研究...

第三章 研究方法
本研究采用混合方法，结合定量与定性分析...

第四章 实验结 果
实验结果表明，AI辅助诊断准确率达到95%...

第五章 结论
本研究证实了AI在医疗领域的巨大潜力...
```

**锚点**：
```json
[
  {"text": "第二章 文献综述", "description": "文献综述章节开始"},
  {"text": "第三章 研究方法", "description": "研究方法章节开始"},
  {"text": "第四章 实验结果", "description": "实验结果章节开始"},
  {"text": "第五章 结论", "description": "结论章节开始"}
]
```

### 处理过程

#### Step 1: 锚点验证
- 4个锚点均非空，长度≥5字符 ✓
- 无重复锚点 ✓
- 锚点长度合理 ✓

#### Step 2: 锚点定位

| 锚点 | 精确匹配 | 模糊匹配 | 编辑距离 | 匹配类型 |
|------|---------|---------|---------|---------|
| 第二章 文献综述 | ❌ (原文为"第二章 文 献综述") | ✅ | 2 | fuzzy |
| 第三章 研究方法 | ✅ | - | 0 | exact |
| 第四章 实验结果 | ❌ (原文为"第四章 实验结 果") | ✅ | 2 | fuzzy |
| 第五章 结论 | ✅ | - | 0 | exact |

#### Step 3: 分割执行

5个块：
- 块0：第一章 绪论...
- 块1：第二章 文 献综述...
- 块2：第三章 研究方法...
- 块3：第四章 实验结 果...
- 块4：第五章 结论...

#### Step 4: 结果验证
- 所有锚点定位成功 ✓
- 拼接后与原内容一致 ✓
- 无空块 ✓

### 输出

```json
{
  "chunks": [
    {"index": 0, "content": "第一章 绪论\n本文旨在研究...", "start_pos": 0, "end_pos": 45},
    {"index": 1, "content": "第二章 文 献综述\n国内外学者...", "start_pos": 45, "end_pos": 120},
    {"index": 2, "content": "第三章 研究方法\n本研究采用...", "start_pos": 120, "end_pos": 200},
    {"index": 3, "content": "第四章 实验结 果\n实验结果表明...", "start_pos": 200, "end_pos": 280},
    {"index": 4, "content": "第五章 结论\n本研究证实了...", "start_pos": 280, "end_pos": 350}
  ],
  "anchor_results": [
    {"anchor": "第二章 文献综述", "found": true, "position": 45, "match_type": "fuzzy", "distance": 2, "matched_text": "第二章 文 献综述"},
    {"anchor": "第三章 研究方法", "found": true, "position": 120, "match_type": "exact", "distance": 0},
    {"anchor": "第四章 实验结果", "found": true, "position": 200, "match_type": "fuzzy", "distance": 2, "matched_text": "第四章 实验结 果"},
    {"anchor": "第五章 结论", "found": true, "position": 280, "match_type": "exact", "distance": 0}
  ],
  "verification": {
    "all_anchors_found": true,
    "concatenation_check": true,
    "empty_chunks": 0
  }
}
```

### 关键观察

1. **OCR容错**：2个锚点通过模糊匹配成功定位（阈值0.33 → 允许2字符差异）
2. **混合匹配**：精确+模糊混合使用，优先精确匹配
3. **完整性**：分割后拼接验证通过，无内容丢失
4. **可追溯**：每个锚点记录了匹配类型和实际匹配文本