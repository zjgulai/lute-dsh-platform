# 论文分块示例

## 输入
学术论文《Attention Is All You Need》

## 分块策略

### 1. 结构感知分块

```
[Introduction]
- Transformer 架构概述
- 自注意力机制引入

[Method]
- Multi-Head Attention 细节
- Position-wise Feed-Forward Networks

[Experiments]
- WMT 2014 英德翻译任务
- 训练配置

[Results]
- BLEU 分数对比
- 训练效率分析
```

### 2. 语义连贯分块

- 每个分块包含完整论点
- 保留上下文引用关系
- 交叉引用建立链接

### 3. 输出结构

```json
{
  "chunks": [
    {
      "id": "intro-1",
      "content": "...",
      "type": "introduction",
      "references": ["method-1", "method-2"]
    }
  ]
}
```

## 最佳实践

1. 保留章节标题作为上下文
2. 处理交叉引用
3. 维护参考文献链接
