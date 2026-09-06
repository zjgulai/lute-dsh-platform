# Semantic Density Analyzer

语义密度分析器，评估文本的知识密度。

结合传统 NLP 特征提取与 LLM 校准，识别高价值内容区域。

## 功能特性

- **三维度评估**：逻辑密度、实体密度、结构密度
- **混合评分**：NLP 快速初筛 + LLM 采样校准
- **语言感知**：支持中英文不同策略
- **热力图可视化**：直观展示知识分布

## 快速开始

### 安装

```bash
pip install jieba spacy scikit-learn
python -m spacy download en_core_web_sm
```

### 基本用法

```python
from semantic_density_analyzer import DensityAnalyzer

analyzer = DensityAnalyzer(config={
    "language": "zh",
    "calibrate": True
})

result = analyzer.analyze(chunks=chunk_list)

# 查看评分
for chunk in result["chunks"]:
    print(f"{chunk['id']}: {chunk['scores']['final_score']:.1f}")
```

## 目录结构

```
.
├── README.md                 # 本文件
├── SKILL.md                  # Skill 详细文档
├── .skill-meta/
│   └── manifest.yaml         # Skill 元数据
├── references/               # 参考文档
│   ├── nlp-features.md
│   └── llm-calibration.md
├── examples/                 # 使用示例（预留）
├── scripts/                  # 脚本目录（预留）
└── tests/                    # 测试相关
```

## 三维度说明

| 维度 | 特征 | 计算方式 |
|-----|------|---------|
| S_logic | 逻辑连接词 | 因果/条件/序列/转折词密度 |
| S_entity | 命名实体 | NER + 数字 + LaTeX 密度 |
| S_struct | 结构元素 | 列表/表格/代码块密度 |

## 校准流程

1. **分层采样**：低/中/高密度各采样
2. **LLM 评分**：DeepSeek-R1 评估"含金量"
3. **线性回归**：校准权重系数
4. **最终评分**：应用权重计算

## 依赖

- Python 3.8+
- jieba（中文分词）
- spacy（英文 NLP）
- scikit-learn（线性回归）
- 兼容的 LLM API（用于校准）

## 相关 Skill

- [mece-knowledge-extractor](../mece-knowledge-extractor) - 使用密度评分优化提取

## 许可证

MIT License
