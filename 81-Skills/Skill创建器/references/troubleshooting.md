# 常见问题与故障排除

创建 Skill 过程中可能遇到的问题及解决方案。

---

## Skill 不触发

### 症状
- Skill 从不自动加载
- 需要手动启用

### 诊断步骤

1. **检查 description**
   ```bash
   python tools/validate-skill.py ./my-skill
   ```
   查看是否有 description 相关警告。

2. **测试触发词**
   询问模型："你什么时候会使用 [skill name] 技能？"
   - 如果回答准确：description 正确，可能是触发机制问题
   - 如果回答不准确：需要优化 description

3. **检查冲突**
   - 是否有其他 Skill 使用了相似的触发词？
   - 尝试禁用其他 Skill 测试

### 解决方案

**添加更多触发变体**:
```yaml
# 原描述
description: 处理 PDF 文档

# 优化后
description: |
  处理 PDF 文档的提取与转换。
  当用户提及"处理PDF"、"PDF转Word"、
  "提取pdf内容"或上传.pdf文件时激活。
```

**检查关键词密度**:
- 确保核心关键词在 description 中出现
- 添加同义表达

---

## Skill 触发过于频繁

### 症状
- Skill 在不相关的查询中加载
- 用户反馈干扰了其他任务

### 解决方案

**添加负面触发**:
```yaml
description: |
  处理 PDF 文档的提取与转换。
  当用户...时使用。
  不适用于图片文件或纯文本编辑。
```

**更具体的范围**:
```yaml
# 太宽泛
description: 处理文档

# 更具体
description: 处理 PDF 法律文件以进行合同审查
```

---

## 未遵守说明

### 症状
- Skill 加载成功但模型不遵循指令
- 输出不符合预期格式

### 可能原因

1. **指令过于冗长**
   - 解决方案：精简内容，移至 references/

2. **指令埋藏**
   - 解决方案：将关键指令放在顶部，使用 `## Important` 标题

3. **模棱两可的语言**
   - 解决方案：使用祈使语态，避免模糊词汇

### 修复示例

```markdown
# 优化前（模糊）
你可以根据需要验证输入数据。

# 优化后（明确）
在继续前，运行 `scripts/validate.py` 验证输入。
如果验证失败，修复以下常见问题：
- 缺少必填字段
- 日期格式无效
```

---

## 验证工具错误

### 错误："Body too long"

**原因**: SKILL.md 超出当前 complexity 级别的限制

**解决方案**:
1. 将内容移至 references/
2. 或提升 complexity 级别

```yaml
# 原配置
complexity: "standard"  # 限制 4000 字符

# 修改为
complexity: "complex"   # 限制 8000 字符
```

### 错误："Referenced file not found"

**原因**: SKILL.md 中引用的文件不存在

**解决方案**:
- 创建缺失的文件
- 或删除引用

### 错误："Second person usage detected"

**原因**: 使用了第二人称（"你应该..."）

**修复**:
```markdown
# 错误
你应该运行脚本。

# 正确
运行脚本。
```

---

## 跨模型适配问题

### GPT 转换失败

**症状**: convert-for-model.py 报错

**检查**:
1. description 是否包含 XML 标签（`< >`）
2. frontmatter 格式是否正确
3. 是否有必需的字段缺失

### MiniMax 中文触发效果差

**症状**: 中文查询触发率低

**解决方案**:
1. 运行中文优化工具
   ```bash
   python tools/optimize-for-chinese.py ./my-skill
   ```

2. 手动添加同义词
   ```yaml
   triggers:
     keywords: ["PDF", "pdf", "文档", "文件"]
   ```

---

## 性能问题

### Skill 响应慢

**可能原因**:
1. SKILL.md 过大
2. 同时加载了过多 resources/

**解决方案**:
- 将详细内容移至 references/
- 使用渐进式披露
- 检查是否有不必要的资源引用

### 上下文占用过多

**检查**:
```bash
python tools/analyze-tokens.py ./my-skill
```

**优化**:
- 精简 description
- 拆分 SKILL.md
- 延迟加载 resources/

---

## 调试技巧

### 查看加载的技能

在 Claude/Kimi 中询问：
"你现在加载了哪些技能？"

### 测试触发

使用测试工具：
```bash
python tools/test-trigger-accuracy.py \
  ./my-skill \
  --queries test-queries.txt
```

### 验证 YAML

在线 YAML 验证器：
- https://www.yamllint.com/

### 检查模型输出

如果 Skill 触发但不工作，检查：
1. 模型是否正确读取了 SKILL.md
2. 指令是否被正确理解
3. 是否有外部依赖问题

---

## 获取帮助

### 自助资源
- [完整 Schema 规范](./universal-skill-schema.md)
- [最佳实践](./best-practices.md)
- [模型适配指南](./cross-model-adaptation.md)

### 社区支持
- GitHub Issues
- Discussions

---

**最后更新**: 2024-01
