# CSO Optimization - 可发现性优化指南

CSO (Contextual Search Optimization) - 确保 Skill 在正确的场景被触发。

## 核心规则

### description 描述触发条件，而非工作流

`description` 的职责是"什么时候应该加载这个 Skill"，不是"这个 Skill 的流程摘要"。

**错误示例**:

```yaml
description: Build skills in four phases: plan, write, validate, publish.
```

问题：描述的是工作流程，agent 可能直接按摘要执行并跳过正文。

**正确示例**:

```yaml
description: Use when creating or reviewing SKILL.md, frontmatter, publishing, or installation workflows.
```

---

## description 公式

```yaml
description: |
  [功能描述]。当用户[触发条件1]、[触发条件2]或[触发条件3]时使用。
  触发词：[关键词1]、[关键词2]、[关键词3]。
```

**检查清单**:
- [ ] 第三人称（"本技能用于..."而非"你可以..."）
- [ ] 仅写 WHEN（触发条件/症状），不写具体执行流程
- [ ] 包含具体触发词
- [ ] 覆盖 3+ 种表达方式
- [ ] 说明不适用场景（防过度触发）

---

## 进阶技巧：克服 Undertrigger

Claude 有 undertrigger 倾向（即使 Skill 适用也可能不触发）。使用 "pushy" description 技巧。

### 技巧 1: Pushy Description

**普通**（可能漏触发）:
```yaml
description: 帮助构建展示内部数据的仪表盘
```

**Pushy**（确保触发）:
```yaml
description: |
  构建展示内部数据的快速仪表盘。
  只要用户提及仪表盘、数据可视化、内部指标，
  或想要展示任何公司数据，即使没明确说"仪表盘"，
  也要确保使用此技能。
```

### 技巧 2: 覆盖多种表达方式

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

### 技巧 3: 明确的 Should/Should Not

```yaml
description: |
  专业 PDF 文档处理工具。
  当用户需要处理 PDF 文件时使用。

  适用场景：文字提取、格式转换、页面合并拆分。
  不适用场景：图片文件处理、纯文本编辑、扫描件 OCR。
```

---

## 触发词检查清单

写好 description 后自检：

| 检查项 | 是否满足 |
|--------|----------|
| 是否包含核心关键词？ | ☐ |
| 是否覆盖 3+ 种表达方式？ | ☐ |
| 是否有明确的触发场景？ | ☐ |
| 是否说明了不适用场景（防过度触发）？ | ☐ |
| 是否足够 "pushy"？ | ☐ |
| 是否使用第三人称（无"你"）？ | ☐ |

---

## 测试触发词

创建 10-20 个测试查询：

### Should Trigger (8-10个)

- 直接的触发词
- 同义表达
- 带上下文的查询
- 隐含需求（用户没说关键词但实际需要）

**示例**:
- "帮我处理这个PDF"
- "PDF转Word怎么弄"
- "从这份PDF提取文字"
- "老板发了个PDF要改"
- "想把几个PDF合一起"

### Should Not Trigger (5-10个)

- 完全不相关的查询
- 边界情况
- 易混淆的领域
- 邻近但不同的需求

**示例**:
- "打开一个Word文档"
- "图片转文字"
- "怎么写PDF阅读器"
- "扫描件怎么识别"

---

## Token 效率

| 类型 | 目标 |
|------|------|
| 高频加载 Skill | 尽量 < 200 词 |
| 普通 Skill 主文件 | < 500 行 |
| 重型参考 | 放 `references/` |

**建议**:
- 默认方案写在正文，细节参数放 `references/`
- 一条高质量示例优于多条重复示例
- 避免大段背景介绍，优先可执行指令
