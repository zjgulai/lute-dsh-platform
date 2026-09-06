# Semantic Bucketer

语义分桶器，基于标签重叠度将知识单元分组。

使用 Union-Find 算法处理传递关系，支持大桶递归细分。

## 功能特性

- **标签分桶**：基于标签重叠度自动分组
- **Union-Find 算法**：高效处理传递关系（A~B, B~C → A,B,C 同桶）
- **大桶细分**：递归细分过大的桶，确保桶大小均匀
- **可配置阈值**：灵活调整分桶敏感度

## 快速开始

### 安装

无需额外依赖，纯 Python 实现。

### 基本用法

```python
from semantic_bucketer import SemanticBucketer

bucketer = SemanticBucketer(config={
    "threshold": 0.5,
    "max_bucket_size": 32
})

result = bucketer.bucket(skus=sku_list)

for bucket in result["buckets"]:
    print(f"Bucket {bucket['bucket_id']}: {bucket['size']} SKUs")
```

## 目录结构

```
.
├── README.md                 # 本文件
├── SKILL.md                  # Skill 详细文档
├── .skill-meta/
│   └── manifest.yaml         # Skill 元数据
├── references/               # 参考文档
│   └── union-find.md
├── examples/                 # 使用示例（预留）
├── scripts/                  # 脚本目录（预留）
└── tests/                    # 测试相关
```

## 算法复杂度

| 操作 | 复杂度 | 说明 |
|-----|--------|------|
| find | O(α(n)) ≈ O(1) | 阿克曼函数反函数 |
| union | O(α(n)) ≈ O(1) | 同上 |
| 完整分桶 | O(n² × f) | n=SKU数, f=特征数 |

## 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| threshold | float | 0.5 | 标签重叠度阈值（0-1） |
| max_bucket_size | int | 32 | 最大桶大小 |
| refine_large | bool | True | 是否递归细分大桶 |

## 依赖

- Python 3.8+
- 无第三方依赖

## 相关 Skill

- [taxonomy-normalizer](../taxonomy-normalizer) - 用于预处理标签标准化
- [knowledge-similarity-analyzer](../knowledge-similarity-analyzer) - 用于桶内相似度分析

## 许可证

MIT License
