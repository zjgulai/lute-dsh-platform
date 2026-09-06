# Anchor-Based Text Splitter

基于锚点的精确文本分割工具，使用模糊匹配定位锚点位置，支持 OCR 错误容错。

## 功能特性

- **精确分割**：基于用户提供的锚点在原文中精确定位
- **OCR 容错**：使用 Levenshtein 距离进行模糊匹配，处理识别错误
- **验证机制**：确保分割后内容拼接与原内容一致
- **灵活配置**：支持自定义模糊匹配阈值

## 快速开始

### 安装

无需安装，直接导入使用：

```python
from anchor_based_text_splitter import AnchorBasedSplitter
```

### 基本用法

```python
splitter = AnchorBasedSplitter()

result = splitter.split(
    content="第一章...第二章...第三章...",
    anchors=[
        {"text": "第二章"},
        {"text": "第三章"}
    ]
)

# 结果: ["第一章...", "第二章...", "第三章..."]
```

### OCR 容错示例

```python
# OCR 可能将"第二章"识别为"第 二 章"
result = splitter.split(
    content="第一章...第 二 章...第三章...",
    anchors=[{"text": "第二章"}],
    config={"fuzzy_threshold": 0.33}
)
```

## 目录结构

```
.
├── README.md                 # 本文件
├── SKILL.md                  # Skill 详细文档
├── .skill-meta/
│   └── manifest.yaml         # Skill 元数据
├── references/               # 参考文档
│   └── levenshtein-distance.md
├── examples/                 # 使用示例
│   └── ocr-error-handling.md
├── scripts/                  # 脚本目录（预留）
└── tests/                    # 测试相关
```

## 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| fuzzy_threshold | float | 0.33 | 模糊匹配阈值（0-1） |
| case_sensitive | bool | False | 大小写敏感 |
| min_anchor_length | int | 5 | 最小锚点长度 |

## 依赖

- Python 3.8+
- python-Levenshtein（用于模糊匹配）

## 相关 Skill

- [semantic-document-chunker](../semantic-document-chunker) - 通常与本 Skill 配合使用

## 许可证

MIT License
