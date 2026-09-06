# Universal Skill 最佳实践

## 概述

本文档汇总创建高质量、跨模型兼容 Skill 的最佳实践。

## Skill 设计原则

### 1. 单一职责原则

一个 Skill 只做一件事，并做好它。

**良好示例**:
```
pdf-processor/          # 专门处理 PDF
├── SKILL.md
csv-analyzer/           # 专门分析 CSV
├── SKILL.md
```

**不良示例**:
```
document-processor/     # 试图处理所有文档类型
├── SKILL.md            # 过于复杂，难以维护
```

### 2. 渐进式披露

只在必要时加载信息。

**三层结构**:
```
Layer 1 (Metadata):    100-200 tokens    始终加载
Layer 2 (SKILL.md):    1500-2000 tokens  触发时加载
Layer 3 (Resources):   无限制            需要时加载
```

**实践建议**:
- SKILL.md 控制在 3000 字以内
- 超过 2500 字时拆分 references/
- 脚本可直接执行，不占用上下文

### 3. 清晰触发

Description 决定 Skill 是否被使用。

**高质量 Description 特征**:
- 包含具体触发词
- 说明核心功能
- 使用第三人称
- 长度 200-400 字符

**示例对比**:

```yaml
# 差 - 太模糊
description: 帮助处理文档

# 良 - 清晰具体
description: |
  处理 PDF 文档的提取、转换和合并。
  当用户上传.pdf文件、提及"PDF转Word"、
  "提取PDF内容"或"合并PDF"时激活。

# 优 - 全面且精确
description: |
  专业 PDF 文档处理工具，支持文字提取、格式转换、
  页面合并拆分、元数据编辑。当用户提及"处理PDF"、
  "提取pdf文字"、"PDF转Word/Excel"、"合并pdf文件"
  或上传.pdf格式文档时自动使用。
```

#### Description 写作进阶技巧

**技巧 1: "Pushy" Description（克服 Undertrigger）**

Claude 有 undertrigger 倾向（即使 Skill 适用也可能不触发）。Combat this:

```yaml
# 普通（可能漏触发）
description: |
  帮助构建展示 Anthropic 内部数据的仪表盘。

# Pushy（确保触发）
description: |
  构建展示 Anthropic 内部数据的快速仪表盘。
  只要用户提及仪表盘、数据可视化、内部指标，
  或想要展示任何公司数据，即使没明确说"仪表盘"，
  也要确保使用此技能。
```

**技巧 2: 覆盖多种表达方式**

同一意图，多种说法：

```yaml
description: |
  处理 PDF 文档的提取、转换和合并。
  当用户提及以下任何内容时使用：
  - "PDF转Word"、"PDF转Excel"、"PDF转Markdown"
  - "提取PDF文字"、"提取PDF内容"、"从PDF复制文字"
  - "合并PDF"、"合并pdf文件"、"把多个PDF合并"
  - "拆分PDF"、"分割PDF页面"
  - 上传 .pdf 文件
```

**技巧 3: 明确的 Should/Should Not**

```yaml
description: |
  专业 PDF 文档处理工具。
  当用户需要处理 PDF 文件时使用。
  
  适用场景：文字提取、格式转换、页面合并拆分。
  不适用场景：图片文件处理、纯文本编辑、扫描件 OCR。
```

**技巧 4: 触发词检查清单**

写好 description 后自检：

| 检查项 | 是否满足 |
|--------|----------|
| 是否包含核心关键词？ | ☐ |
| 是否覆盖 3+ 种表达方式？ | ☐ |
| 是否有明确的触发场景？ | ☐ |
| 是否说明了不适用场景（防过度触发）？ | ☐ |
| 是否足够 "pushy"（克服 undertrigger）？ | ☐ |

**技巧 5: 测试触发词**

创建 10-20 个测试查询：

**Should Trigger** (8-10个):
- 直接的触发词
- 同义表达
- 带上下文的查询
- 隐含需求（用户没说关键词但实际需要）

**Should Not Trigger** (5-10个):
- 完全不相关的查询
- 边界情况
- 易混淆的领域
- 邻近但不同的需求

```
示例测试集：
Should Trigger:
- "帮我处理这个PDF"
- "PDF转Word怎么弄"
- "从这份PDF提取文字"
- "老板发了个PDF要改"

Should Not Trigger:
- "打开一个Word文档"
- "图片转文字"
- "怎么写PDF阅读器"
```

## 写作风格

### 祈使语态

使用动词开头的指令，不用第二人称。

**正确**:
```markdown
运行脚本验证输入格式。
查阅 references/guide.md 获取 API 详情。
在继续前确认数据完整性。
```

**错误**:
```markdown
你应该运行脚本验证输入格式。
你可以查阅 references/guide.md。
你需要在继续前确认数据完整性。
```

### 简洁清晰

**删除冗余**:
```markdown
# 冗余
在这个步骤中，你需要做的是运行下面的脚本，
这个脚本会帮助你验证输入数据的格式是否正确。

# 简洁
运行脚本验证输入格式。
```

**使用列表**:
```markdown
# 段落形式
首先你需要安装依赖，然后配置环境变量，
最后运行主程序。如果遇到错误，请检查日志。

# 列表形式
1. 安装依赖
2. 配置环境变量
3. 运行主程序

**故障排除**: 检查日志文件
```

### 结构化内容

使用一致的标题层级：

```markdown
# Skill 名称

## 概述

## 适用场景

## 使用方法

### 基本用法

### 高级用法

## 资源引用

## 错误处理

## 限制
```

## 触发优化

### 关键词覆盖

确保覆盖用户可能使用的多种表达方式：

```yaml
triggers:
  keywords:
    - "PDF"           # 英文
    - "pdf"           # 小写
    - "文档"          # 中文
    - "document"      # 同义词
  phrases:
    - "处理PDF"
    - "PDF转Word"
    - "提取pdf内容"
    - "合并pdf文件"
    - "转换pdf文档"
```

### 负面触发

明确说明不适用的情况：

```yaml
description: |
  专业 PDF 处理工具。当用户...时使用。
  不适用于图片文件处理或纯文本编辑。
```

### 上下文触发

考虑对话上下文：

```yaml
description: |
  代码审查助手。当用户提及"审查代码"、
  "review PR"或讨论代码质量时使用。
  在代码仓库上下文中自动激活。
```

## 资源管理

### Scripts 最佳实践

**何时使用**:
- 确定性操作
- 重复执行
- 精确控制

**规范**:
```python
#!/usr/bin/env python3
"""Script description and usage."""

import argparse

def main():
    parser = argparse.ArgumentParser(description='...')
    parser.add_argument('input', help='Input file')
    args = parser.parse_args()
    
    # Implementation
    
if __name__ == '__main__':
    main()
```

**命名**:
- `validate-input.sh`
- `convert-format.py`
- `generate-report.js`

### References 最佳实践

**何时使用**:
- 详细技术文档
- 多配置选项
- 大型示例

**结构**:
```markdown
# Reference Title

## 目录
- [Section 1](#section-1)
- [Section 2](#section-2)

## Section 1
...

## Section 2
...
```

**引用方式**:
```markdown
## 资源引用

### 参考文档
- `references/patterns.md` - 常见处理模式
- `references/api-guide.md` - API 完整文档
- `references/troubleshooting.md` - 故障排除

### 脚本工具
- `scripts/validate.py` - 输入验证
- `scripts/convert.sh` - 格式转换

### 使用示例
- `examples/basic.md` - 基础用法
- `examples/advanced.md` - 高级用法
```

### Assets 最佳实践

**用途**:
- 模板文件
- 品牌资源
- 字体图标

**组织**:
```
assets/
├── templates/
│   ├── report.docx
│   └── invoice.pdf
├── fonts/
│   └── brand-font.ttf
└── images/
    └── logo.png
```

## 错误处理

### 预防性说明

在 Skill 中预见可能的问题：

```markdown
## 常见错误

### 错误：文件格式不支持
**原因**: 输入文件不是预期格式
**解决**: 
1. 检查文件扩展名
2. 确认文件未损坏
3. 使用支持的格式: .pdf, .docx

### 错误：权限不足
**原因**: 无文件读取/写入权限
**解决**:
1. 检查文件权限: `ls -la file`
2. 修改权限: `chmod 644 file`
3. 或更改输出目录
```

### 故障排除指南

提供系统性排查步骤：

```markdown
## 故障排除

### Skill 不触发
1. 检查 description 是否包含触发词
2. 测试更具体的触发短语
3. 检查是否有冲突 Skill

### 执行失败
1. 检查依赖是否安装
2. 验证输入数据格式
3. 查看错误日志

### 结果不符合预期
1. 确认输入参数正确
2. 检查资源文件是否存在
3. 验证输出路径可写
```

## 测试策略

### 触发测试

测试技能是否正确触发：

```python
test_queries = [
    # 应该触发
    ("处理这个PDF文件", True),
    ("PDF转Word", True),
    ("提取pdf内容", True),
    
    # 不应该触发
    ("今天天气怎么样", False),
    ("写一个Python函数", False),
]
```

### 功能测试

测试核心功能：

```python
def test_pdf_extraction():
    """Test PDF text extraction"""
    input_file = "test.pdf"
    expected_output = "extracted text"
    
    result = run_skill("extract text from test.pdf")
    
    assert expected_output in result
```

### 跨模型测试

验证跨模型一致性：

```bash
# 运行所有模型测试
python tests/test_cross_model.py --skill ./my-skill/

# 测试特定模型
python tests/test_cross_model.py --skill ./my-skill/ --models claude,gpt
```

## 版本管理

### Semantic Versioning

```
主版本号.次版本号.修订号
1.0.0
```

**版本规则**:
- **主版本**: 破坏性变更
- **次版本**: 新功能（向后兼容）
- **修订号**: Bug 修复

### 变更日志

```markdown
# Changelog

## [1.1.0] - 2024-01-15

### Added
- 支持批量处理
- 新增输出格式选项

### Changed
- 优化触发准确性
- 改进错误提示

### Fixed
- 修复大文件处理问题
```

## 性能优化

## Token 效率

| 类型 | 目标 |
|------|------|
| 高频加载 Skill | 尽量 < 200 词（约 300 tokens） |
| 普通 Skill 主文件 | < 500 行 |
| 重型参考 | 放 `references/` |

**优化技巧**:
1. 删除冗余词语
2. 使用缩写（首次解释）
3. 列表代替段落
4. 引用代替重复

**示例**:
```markdown
# 优化前 (200 tokens)
在这个步骤中，你需要首先运行验证脚本，
这个脚本会检查你的输入数据是否符合要求的格式。
如果格式正确，脚本会输出成功消息，
然后你可以继续进行下一步操作。

# 优化后 (50 tokens)
1. 运行 `scripts/validate.py`
2. 检查输出
3. 继续下一步
```

详细指南见 `references/cso-optimization.md`

### 上下文管理

**加载控制**:
```markdown
# SKILL.md - 核心内容

## 高级用法
详见 `references/advanced.md`

## API 参考
详见 `references/api.md`
```

**按需加载**:
- 基础功能始终在 SKILL.md
- 高级功能在 references/
- 大型示例在 examples/

## 安全考虑

### 输入验证

始终在 scripts/ 中验证输入：

```python
#!/usr/bin/env python3
import os
import sys

def validate_path(path):
    """Validate file path safety"""
    # 防止路径遍历
    if '..' in path:
        raise ValueError("Path traversal detected")
    
    # 检查敏感文件
    sensitive = ['.env', '.ssh', 'password']
    for s in sensitive:
        if s in path.lower():
            raise ValueError(f"Sensitive file: {s}")
    
    return os.path.abspath(path)
```

### 输出安全

确保输出不会覆盖重要文件：

```python
def safe_write(output_path, content):
    """Safely write to file"""
    if os.path.exists(output_path):
        backup = f"{output_path}.backup"
        os.rename(output_path, backup)
    
    with open(output_path, 'w') as f:
        f.write(content)
```

## 维护指南

### 定期检查清单

**每月检查**:
- [ ] 触发准确率是否达标
- [ ] 用户反馈是否处理
- [ ] 依赖是否需要更新

**每季度检查**:
- [ ] 是否需要新增功能
- [ ] 跨模型兼容性是否变化
- [ ] 文档是否需要更新

### 用户反馈处理

**收集渠道**:
- GitHub Issues
- 用户访谈
- 使用数据分析

**处理流程**:
1. 记录反馈
2. 分类优先级
3. 规划改进
4. 测试验证
5. 发布更新

## 常见错误

### 设计错误

1. **过于复杂**
   - 问题：试图在一个 Skill 中做太多事
   - 解决：拆分为多个简单 Skill

2. **触发模糊**
   - 问题：description 不具体
   - 解决：添加明确的触发词

3. **忽视错误处理**
   - 问题：未预见失败场景
   - 解决：添加错误处理章节

### 实现错误

1. **上下文膨胀**
   - 问题：SKILL.md 超过 5000 字
   - 解决：拆分至 references/

2. **资源未引用**
   - 问题：references/ 文件未被引用
   - 解决：在 SKILL.md 中添加链接

3. **脚本不可执行**
   - 问题：缺少 shebang 或权限
   - 解决：添加 shebang，设置权限

## 参考资源

### 模板

- `templates/minimal-skill/` - 最简结构
- `templates/standard-skill/` - 标准结构
- `templates/complex-skill/` - 复杂结构

### 工具

- `scripts/validate-skill.py` - 验证工具
- `scripts/analyze-tokens.py` - Token 分析
- `scripts/test-trigger.py` - 触发测试

### 示例

- `examples/pdf-processor/` - 文件处理 Skill
- `examples/api-client/` - API 调用 Skill
- `examples/data-analyzer/` - 数据分析 Skill

## 写作模式

### 1) Template Pattern（模板模式）

提供可直接使用的结构模板。

**不良**:
```markdown
Write a report with key points.
```

**良好**:
```markdown
## Report Template
1. Executive Summary
2. Findings (with data)
3. Actions (owner + timeline)
```

### 2) Examples Pattern（示例模式）

提供输入/输出示例。

**不良**:
```markdown
Provide examples.
```

**良好**:
```markdown
Input: "Need commit message for auth bug fix"
Output: "fix(auth): resolve token refresh race condition"
```

### 3) Workflow Pattern（工作流模式）

分步骤的执行流程。

**不良**:
```markdown
Analyze, then write.
```

**良好**:
```markdown
1. Gather context
2. Draft minimal frontmatter
3. Write core sections
4. Run validation
```

### 4) Feedback Loop Pattern（反馈循环模式）

迭代改进的流程。

**不良**:
```markdown
Write once and finish.
```

**良好**:
```markdown
Write → Validate → Fix → Re-validate (repeat until pass)
```

---

## 从现有内容提炼 Skill

从文档/流程转换为 Skill 的最小流程：

1. **判定类型**（Technique / Pattern / Reference）
   - 有明确步骤 → Technique
   - 提供判断框架 → Pattern
   - 信息查询 → Reference

2. **提取触发词**
   - 用户会怎么提问？
   - 有哪些同义表达？

3. **产出 description**
   - 仅 WHEN + 触发词
   - 不写 workflow

4. **内容迁移**
   - 核心流程放 SKILL.md
   - 重型说明放 references/
   - 示例放 examples/

5. **Iron Law 测试**
   - RED: 验证无 Skill 时失败
   - GREEN: 最小修复
   - REFACTOR: 压力测试

详细类型说明见 `references/skill-types.md`

---

*最后更新: 2024-01-15*
