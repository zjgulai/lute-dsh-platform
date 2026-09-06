# 嵌入模型选择指南

## 支持的嵌入模型

### BGE-M3 (推荐)
- **模型**: Pro/BAAI/bge-m3
- **API**: SiliconFlow
- **特点**: 多语言支持，适合中文知识库

### OpenAI Ada-002
- **特点**: 高维度，通用性强
- **限制**: 需要 OpenAI API 访问权限

### 本地模型
- **选项**: sentence-transformers/all-MiniLM-L6-v2
- **特点**: 隐私性好，无 API 成本
- **要求**: 需要本地 GPU/CPU 资源

## 选择建议

| 场景 | 推荐模型 | 原因 |
|------|----------|------|
| 中文知识库 | BGE-M3 | 中文优化 |
| 多语言混合 | Ada-002 | 通用性强 |
| 隐私敏感 | 本地模型 | 数据不出境 |
| 成本敏感 | BGE-M3 | 性价比高 |

## 配置示例

```python
DEFAULT_CONFIG = {
    "embedding_model": "Pro/BAAI/bge-m3",
    "batch_size": 32,
    "rate_limit": 1.0
}
```
