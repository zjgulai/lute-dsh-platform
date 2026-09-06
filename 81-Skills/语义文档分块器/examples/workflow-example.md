# 工作流示例

本文件展示语义文档分块器的完整工作流。输入一篇书籍的 Markdown，输出分块后的结果。

## 步骤 1：准备输入文档

```markdown
# 第一章 绪论

本书介绍语义文档分块的方法与技术背景。

## 1.1 研究背景

随着大模型发展，RAG 知识库需要把长文档切分为块。

## 1.2 研究意义

保持语义边界的分块能提升检索质量。

# 第二章 相关方法

## 2.1 传统固定长度切分

按固定字符数切分，简单但会破坏段落完整。

## 2.2 语义分块

基于标题层级和语义边界的切分，保持章节完整。
```

## 步骤 2：调用分块器

```python
result = chunker.chunk(max_tokens=4000)
```

## 步骤 3：输出结果

```yaml
chunks:
  - id: chunk_0001
    title: "第一章 绪论"
    parent_path: []
    start_line: 1
    end_line: 15
    tokens: 800
  - id: chunk_0002
    title: "1.1 研究背景"
    parent_path: ["第一章 绪论"]
    start_line: 5
    end_line: 9
    tokens: 350
  - ...
tree:
  id: root
  title: 全书
  children:
    - id: chunk_0001
      title: 第一章 绪论
    - id: chunk_0005
      title: 第二章 相关方法
```

## 关键产出

- ✅ 保持了章节完整性（第二章作为一个独立块）
- ✅ 子章节跟随父章节（1.1/1.2 包含在第一章内）
- ✅ parent_path 记录了层级，支持层次化导航