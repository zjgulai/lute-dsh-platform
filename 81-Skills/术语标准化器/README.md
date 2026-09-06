# Taxonomy Normalizer

术语标准化器，统一多来源数据中的术语表达。

支持严格模式（仅合并完全相同概念）和灵活模式（合并同义词、语言变体）。

## 功能特性

- **双策略模式**：STRICT（严格）/ FLEXIBLE（灵活）
- **多语言支持**：中英文术语统一
- **冲突检测**：识别潜在的错误合并
- **可复用映射**：标准化映射表可导出复用

## 快速开始

### 安装

无需额外依赖，纯 Python 实现。

### 基本用法

```python
from taxonomy_normalizer import TaxonomyNormalizer

normalizer = TaxonomyNormalizer(config={
    "fields": ["applicable_objects", "domain_tags"],
    "strategies": {
        "applicable_objects": "STRICT",
        "domain_tags": "FLEXIBLE"
    }
})

result = normalizer.normalize(skus=sku_list)

# 查看映射
for field, mapping in result["mappings"].items():
    print(f"\n{field}:")
    for original, standard in mapping.items():
        if original != standard:
            print(f"  {original} -> {standard}")
```

## 目录结构

```
.
├── README.md                 # 本文件
├── SKILL.md                  # Skill 详细文档
├── .skill-meta/
│   └── manifest.yaml         # Skill 元数据
├── references/               # 参考文档
│   └── normalization-strategies.md
├── examples/                 # 使用示例
│   └── multi-language.md
├── scripts/                  # 脚本目录（预留）
└── tests/                    # 测试相关
```

## 策略说明

| 策略 | 适用字段 | 合并规则 |
|-----|---------|---------|
| STRICT | applicable_objects | 仅合并 100% 相同概念 |
| FLEXIBLE | domain_tags | 合并同义词、语言变体 |

## 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| fields | list | 所有字段 | 要标准化的字段 |
| strategies | dict | 字段->策略映射 | 每字段的策略 |
| case_sensitive | bool | False | 大小写敏感 |

## 依赖

- Python 3.8+
- 无第三方依赖
- 兼容的 LLM API（术语标准化）

## 相关 Skill

- [semantic-bucketer](../semantic-bucketer) - 使用标准化后的标签分桶
- [knowledge-similarity-analyzer](../knowledge-similarity-analyzer) - 使用标准化后比较

## 许可证

MIT License
