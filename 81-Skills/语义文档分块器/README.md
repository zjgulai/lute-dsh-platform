# Semantic Document Chunker

智能文档分块器，保持语义边界，生成层次化的文本块结构。

采用两阶段分块策略：先按章节粗分，再递归细分超大块。

## 功能特性

- **两阶段分块**：章节拆分 + 递归锚点细分
- **语义保持**：在章节和段落边界处分割
- **层级结构**：维护父子关系，支持层次导航
- **LLM 幻觉防护**：使用锚点模式确保精确分割

## 快速开始

### 安装

```bash
pip install python-Levenshtein
```

### 基本用法

```python
from semantic_document_chunker import DocumentChunker

chunker = DocumentChunker(
    content=markdown_text,
    config={"max_tokens": 8000, "language": "zh"}
)

result = chunker.chunk()

for chunk in result["chunks"]:
    print(f"{chunk['id']}: {chunk['title']} (~{chunk['tokens']} tokens)")
```

## 目录结构

```
.
├── README.md                 # 本文件
├── SKILL.md                  # Skill 详细文档
├── .skill-meta/
│   └── manifest.yaml         # Skill 元数据
├── references/               # 参考文档
│   ├── anchor-splitting.md
│   ├── header-patterns.md
│   └── llm-prompts.md
├── examples/                 # 使用示例
│   └── book-chunking.md
├── scripts/                  # 脚本目录
└── tests/                    # 测试相关
```

## 两阶段分块流程

### Phase 1: 章节拆分
- 提取 Markdown 标题结构
- LLM 分析分割点
- 创建初始块

### Phase 2: 递归细分
- 检查块大小
- LLM 生成锚点
- 模糊匹配分割
- 递归直到满足大小限制

## 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| max_tokens | int | 8000 | 最大 tokens 阈值 |
| max_iterations | int | 3 | 最大递归深度 |
| anchor_length | int | 30 | 锚点长度 |

## 依赖

- Python 3.8+
- python-Levenshtein（锚点模糊匹配）
- 兼容的 LLM API（分割点分析）

## 相关 Skill

- [anchor-based-text-splitter](../anchor-based-text-splitter) - 用于锚点精确分割

## 许可证

MIT License
