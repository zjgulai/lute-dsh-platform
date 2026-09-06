# Knowledge Similarity Analyzer

知识相似度分析器，从多维度计算知识单元（SKU）的相似度，识别重复、冲突、独立关系。

## 功能特性

- **三维评估**：从 Anchor（场景）、Logic（执行）、Outcome（结果）三个维度评估相似度
- **关系分类**：自动识别 DUPLICATE（重复）、CONFLICT（冲突）、INDEPENDENT（独立）、RELATED（相关）
- **冲突解决**：内置合并和分支策略，处理重复和冲突的知识单元
- **批量处理**：支持批量嵌入和高效计算

## 快速开始

### 安装

```bash
pip install numpy requests
```

### 基本用法

```python
from knowledge_similarity_analyzer import SimilarityAnalyzer

analyzer = SimilarityAnalyzer(config={
    "high_threshold": 0.7,
    "low_threshold": 0.3,
    "resolve_conflicts": True
})

result = analyzer.analyze(skus=sku_list)

# 查看重复
for dup_group in result["grouped"]["duplicates"]:
    print(f"重复: {dup_group}")
```

## 目录结构

```
.
├── README.md                      # 本文件
├── SKILL.md                       # Skill 详细文档
├── .skill-meta/
│   └── manifest.yaml              # Skill 元数据
├── references/                    # 参考文档
│   ├── multi-dimensional-similarity.md
│   └── conflict-resolution.md
├── examples/                      # 使用示例（预留）
├── scripts/                       # 脚本目录（预留）
└── tests/                         # 测试相关
```

## 三维相似度说明

| 维度 | 计算方式 | 说明 |
|-----|---------|------|
| S_anchor | Jaccard + Cosine | 场景相似度 |
| S_logic | Cosine | 执行逻辑相似度 |
| S_outcome | TypeMatch + Cosine | 输出相似度 |

## 关系分类规则

- **DUPLICATE**: 高场景 + 高逻辑 + 高输出 → 重复，需合并
- **CONFLICT**: 高场景 + 低输出 → 冲突，需分支
- **INDEPENDENT**: 低场景 → 独立，保持原样
- **RELATED**: 其他 → 相关，建立关联

## 依赖

- Python 3.8+
- numpy
- requests（用于嵌入 API）
- BGE-M3 嵌入模型访问

## 相关 Skill

- [semantic-bucketer](../semantic-bucketer) - 用于预处理分桶
- [taxonomy-normalizer](../taxonomy-normalizer) - 用于术语标准化

## 许可证

MIT License
