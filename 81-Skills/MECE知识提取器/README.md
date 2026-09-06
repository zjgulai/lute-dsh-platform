# MECE Knowledge Extractor

MECE 原则知识提取器，从文本中提取结构化知识单元（SKU）。

遵循互斥且完备（Mutually Exclusive, Collectively Exhaustive）原则，确保知识单元不重叠、不遗漏。

## 功能特性

- **MECE 原则**：确保提取的知识单元互斥且完备
- **Core + Flex Schema**：固定结构 + 灵活扩展的双区设计
- **密度感知**：根据文本密度自动调整提取数量
- **可追溯性**：每个 SKU 记录完整来源信息

## 快速开始

### 安装

```bash
pip install python-jieba spacy
python -m spacy download en_core_web_sm
```

### 基本用法

```python
from mece_knowledge_extractor import KnowledgeExtractor

extractor = KnowledgeExtractor(config={
    "language": "zh",
    "output_language": "English"
})

result = extractor.extract(chunks=[
    {
        "id": "chunk_1",
        "content": "流动比率 = 流动资产 / 流动负债...",
        "book_index": 5
    }
])

print(f"提取了 {len(result['skus'])} 个 SKU")
```

## 目录结构

```
.
├── README.md                 # 本文件
├── SKILL.md                  # Skill 详细文档
├── .skill-meta/
│   └── manifest.yaml         # Skill 元数据
├── references/               # 参考文档
│   ├── sku-schema.md
│   └── mece-principles.md
├── examples/                 # 使用示例（预留）
├── scripts/                  # 脚本目录（预留）
└── tests/                    # 测试相关
```

## SKU Schema 结构

```python
{
    "metadata": {
        "uuid": "...",
        "name": "知识单元名称",
        "source_ref": {...}  # 来源追溯
    },
    "context": {
        "applicable_objects": [...],  # 适用对象
        "prerequisites": [...],       # 前置条件
        "constraints": [...]          # 约束条件
    },
    "trigger": {
        "condition_logic": "..."     # 触发条件
    },
    "core_logic": {
        "logic_type": "Formula",      # 逻辑类型
        "execution_body": "...",      # 执行逻辑
        "variables": [...]            # 变量定义
    },
    "output": {
        "output_type": "Value",       # 输出类型
        "result_template": "..."      # 结果模板
    },
    "custom_attributes": {...}       # 灵活扩展区
}
```

## 依赖

- Python 3.8+
- jieba（中文分词）
- spacy（英文 NLP）
- 兼容的 LLM API（GLM-4.7 或类似）

## 相关 Skill

- [semantic-density-analyzer](../semantic-density-analyzer) - 用于密度评分
- [taxonomy-normalizer](../taxonomy-normalizer) - 用于术语标准化

## 许可证

MIT License
