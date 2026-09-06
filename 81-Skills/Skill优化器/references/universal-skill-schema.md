# Universal Skill Schema (通用技能标准)

## 概述

Universal Skill Schema 是一个针对 **Claude + Kimi + Cursor** 核心联盟的 Skill 定义标准，同时为 GPT、MiniMax 等平台提供桥接支持。

### 设计哲学

**核心联盟优先**: 为原生支持 Skill 系统的平台（Claude、Kimi、Cursor）提供最佳体验。

**务实的桥接**: 为核心联盟之外的模型提供实用的转换工具，而非强制统一。

**渐进式采用**: 支持从简单到复杂的多种 Skill 规模。

## 设计原则

1. **渐进式披露** - 三层加载结构，最小化上下文占用
2. **描述驱动触发** - 通过高质量的 description 实现自动触发
3. **模型适配透明** - 核心定义与模型适配分离
4. **简洁优先** - 上下文窗口是公共资源

## 文件结构

```
skill-name/
├── SKILL.md              # 必需 - 主要技能定义
├── scripts/              # 可选 - 可执行代码
│   ├── *.py
│   ├── *.sh
│   └── *.js
├── references/           # 可选 - 按需加载文档
│   └── *.md
├── assets/               # 可选 - 输出资源
│   ├── templates/
│   ├── fonts/
│   └── images/
├── eval-reports/         # 可选 - 评估报告输出
│   └── *.yaml
└── examples/             # 可选 - 使用示例
    └── *.md
```

**注意**: 不再使用 `manifest.json`。所有元数据应放在 `SKILL.md` 的 YAML frontmatter 中。

## SKILL.md 规范

### YAML Frontmatter（必需）

```yaml
---
name: skill-name-in-kebab-case
description: |
  [功能描述] + [触发条件]
  
  本技能用于...当用户提及"关键词1"、"关键词2"或请求"具体操作"时使用。
version: "1.0.0"                    # 可选但推荐
author:                             # 可选
  name: "Author Name"
  email: "author@example.com"
compatibility:                      # 跨模型兼容性声明
  claude: "native"                  # native | adapted | unsupported
  kimi: "native"
  gpt: "adapted"
  minimax: "adapted"
triggers:                           # 结构化触发条件
  keywords: ["关键词1", "关键词2"]
  phrases: ["具体操作1", "具体操作2"]
  contexts: ["场景1", "场景2"]
---
```

### Frontmatter 字段详解

#### name（必需）
- **格式**: kebab-case（小写字母、数字、连字符）
- **限制**: 
  - 无空格
  - 无大写字母
  - 无下划线
  - 不以连字符开头或结尾
- **示例**: `pdf-processor`, `api-integration-helper`

#### description（必需）
- **目的**: 决定技能何时被触发
- **结构**: `[功能] + [何时使用] + [触发词]`
- **要求**:
  - 包含具体触发短语
  - 说明核心功能
  - 不超过 1024 字符
  - 禁止使用 XML 标签 `< >`
  - 使用第三人称（"本技能用于..."）

**良好示例**:
```yaml
description: |
  处理 PDF 文档的高级分析与转换。当用户上传 .pdf 文件、
  提及"提取PDF内容"、"合并PDF"、"PDF转Word"或讨论
  文档处理任务时自动激活。
```

**不良示例**:
```yaml
# 太模糊
description: 帮助处理文档

# 缺少触发条件
description: 实现PDF文件的解析与转换

# 使用第二人称
description: 你可以使用这个技能来处理PDF
```

#### 进阶技巧：克服 Undertrigger

Claude 有 undertrigger 倾向（即使 Skill 适用也可能不触发）。使用 "pushy" description 技巧：

```yaml
# 普通（可能漏触发）
description: 帮助构建展示内部数据的仪表盘

# Pushy（确保触发）
description: |
  构建展示内部数据的快速仪表盘。
  只要用户提及仪表盘、数据可视化、内部指标，
  或想要展示任何公司数据，即使没明确说"仪表盘"，
  也要确保使用此技能。
```

**技巧 1: 覆盖多种表达方式**

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

**技巧 2: 明确的 Should/Should Not**

```yaml
description: |
  专业 PDF 文档处理工具。
  当用户需要处理 PDF 文件时使用。
  
  适用场景：文字提取、格式转换、页面合并拆分。
  不适用场景：图片文件处理、纯文本编辑、扫描件 OCR。
```

**技巧 3: 触发词检查清单**

写好 description 后自检：

| 检查项 | 是否满足 |
|--------|----------|
| 是否包含核心关键词？ | ☐ |
| 是否覆盖 3+ 种表达方式？ | ☐ |
| 是否有明确的触发场景？ | ☐ |
| 是否说明了不适用场景（防过度触发）？ | ☐ |
| 是否足够 "pushy"？ | ☐ |

**技巧 4: 测试触发词**

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

#### compatibility（推荐）
声明技能在各模型上的支持级别和详细信息：

```yaml
compatibility:
  claude:
    status: "native"                    # native | bridge | unsupported
    tested_versions: ["claude-3-opus", "claude-3-sonnet"]
    notes: "完整功能支持"
  
  kimi:
    status: "native"
    tested_versions: ["kimi-latest"]
    notes: "Works best with extended thinking"
  
  cursor:
    status: "native"
    notes: "通过 Claude API 原生支持"
  
  gpt:
    status: "bridge"
    models: ["gpt-4", "gpt-3.5-turbo"]
    limitations:
      - "无原生渐进式披露（需模拟）"
      - "需要 Function Calling 支持"
    adapter: "adapters/gpt/function-schema.json"
  
  minimax:
    status: "bridge"
    limitations: ["需要中文优化"]
    adapter: "adapters/minimax/prompt-template.md"
```

**状态说明**:
- `native` - 原生支持，完整功能（核心联盟）
- `bridge` - 桥接支持，通过转换工具适配
- `unsupported` - 不支持

#### complexity（推荐）
声明 Skill 的复杂度级别，影响验证规则：

```yaml
complexity: "standard"  # minimal | standard | complex
```

| 级别 | 最大长度 | references/ | 说明 |
|------|----------|-------------|------|
| `minimal` | 2000 字符 | 不需要 | 简单知识型 Skill |
| `standard` | 4000 字符 | 可选 | 大多数 Skill |
| `complex` | 8000 字符 | 推荐 | 复杂工作流 |

**为何需要**:
- 避免一刀切的长度限制
- 允许复杂 Skill 存在
- 提供更精准的验证

#### triggers（可选）
结构化的触发条件，用于自动化验证和优化。

注意：从 description 自动提取 triggers 的工具正在开发中。在此之前，可以手动维护以确保准确性。

### Markdown Body（必需）

#### 写作风格

**使用祈使语态（Imperative/Infinitive）**:
```markdown
# 正确
运行脚本验证输入格式。
查阅 references/api-guide.md 获取端点详情。

# 错误
你应该运行脚本验证输入格式。
你可以查阅 references/api-guide.md。
```

**简洁清晰**:
- 优先使用项目符号和编号列表
- 一个段落只传达一个核心概念
- 删除冗余词语

#### 推荐结构

```markdown
# [技能名称]

## 概述
1-2句话描述技能的核心价值。

## 适用场景
- 场景1: 简要说明
- 场景2: 简要说明

## 使用方法

### 基本用法
1. 步骤1
2. 步骤2

### 高级用法
- 选项1: 说明
- 选项2: 说明

## 资源引用

### 参考文档
- `references/patterns.md` - [何时查阅]
- `references/advanced.md` - [何时查阅]

### 脚本工具
- `scripts/validate.py` - [用途]
- `scripts/convert.sh` - [用途]

### 示例
- `examples/basic.md` - 基础示例
- `examples/advanced.md` - 高级示例

## 错误处理

### 常见错误1
**症状**: [描述]
**原因**: [解释]
**解决**: [步骤]

## 限制与注意事项
- 限制1
- 限制2
```

#### 长度控制

根据 complexity 级别确定长度限制：

| 复杂度 | SKILL.md 正文 | references/ | 示例 |
|--------|---------------|-------------|------|
| `minimal` | < 2000 字符 | 不需要 | 简单提示模板 |
| `standard` | < 4000 字符 | 可选 | 带示例的工作流 |
| `complex` | < 8000 字符 | 推荐 | 多步骤复杂流程 |

**通用规则**:
- description: 200-400 字符（理想），最大 1024 字符
- 单个 references/ 文件: 无硬性限制
- 超过限制时，将内容移至 references/

**为何放宽限制**:
- 复杂 Skill 需要详细说明
- 强制拆分可能破坏阅读体验
- 通过 complexity 显式声明，而非隐藏限制

## 推荐创建流程

### 阶段 0: 方法论审计（前置步骤）

> 💡 **核心原则**: 先问"这个 Skill 凭什么值得存在"，再问"怎么写"。

在编写 Skill 前，先进行**同质化检测**和**竞争壁垒评估**：

**同质化检测**：

| 问题 | 如果答案是"是"，风险就高 |
|------|------------------------|
| 这个方法是否是公开教科书式流程？ | 是 |
| 是否几乎任何 AI 都会给出类似步骤？ | 是 |
| 是否主要靠模板填空，而非判断？ | 是 |
| 是否没有任何行业语境或私有视角？ | 是 |

若命中 2 项以上，应视为 **高同质化风险**。考虑：
- 这个 Skill 的核心方法是不是任何人用 Google 或通用 AI 都能轻易得到
- 如果答案是"是"，那它大概率还不够好

**竞争壁垒评估**（一个真正有价值的 Skill，至少应命中 1 项）：

| 壁垒类型 | 说明 | 示例 |
|---------|------|------|
| **私有数据** | 内部 SOP、客服记录、社群数据 | 公司内部审批流程 |
| **行业洞察** | 只有深做该行业的人才会强调的判断 | 金融合规的特殊要求 |
| **失败案例** | 常见坑、踩雷点、误判模式 | 某类项目90%失败的原因 |
| **反共识框架** | 与通用建议不同但更有效 | 不走寻常路但成功的方法 |

如果四项全空，这个 Skill 通常只能算"通用说明文档"。

**方法论审计输出模板**：
```text
通用解法是什么：[描述]
为什么不够：[同质化风险]
我要加入什么独特判断：[差异化策略]
```

---

### 阶段 1-7: 标准创建流程

通过方法论审计后，进入标准创建流程：

1. **需求分析** - 确定用例、触发词、目标用户
2. **架构设计** - 选择 complexity 级别，规划目录结构
3. **编写 SKILL.md** - frontmatter + body（遵循本规范）
4. **添加资源** - scripts/, references/, assets/（如需要）
5. **验证** - 运行验证工具，通过质量门槛
6. **跨模型适配** - 转换为 GPT/MiniMax 格式（如需要）
7. **打包发布** - 生成 .skill 文件，准备发布

## 渐进式披露设计

### 三层加载系统

```
┌─────────────────────────────────────────────────────────┐
│ 第一层: Metadata (name + description)                   │
│ • 始终加载在系统提示中                                   │
│ • 约 100-200 tokens                                     │
│ • 决定技能是否触发                                       │
└─────────────────────────────────────────────────────────┘
                           ↓ 技能触发时加载
┌─────────────────────────────────────────────────────────┐
│ 第二层: SKILL.md Body                                   │
│ • 技能触发时加载                                        │
│ • 约 1500-2000 tokens                                   │
│ • 提供核心工作流指导                                     │
└─────────────────────────────────────────────────────────┘
                           ↓ 需要时加载
┌─────────────────────────────────────────────────────────┐
│ 第三层: Bundled Resources                               │
│ • Claude/Kimi: 按需加载                                 │
│ • GPT/MiniMax: 内联或 Function Calling                  │
│ • 无固定限制                                            │
│ • Scripts 可直接执行                                    │
└─────────────────────────────────────────────────────────┘
```

### 内容分配策略

**放在 SKILL.md（核心层）**:
- 核心概念和概述
- 主要工作流步骤
- 常用模式和示例
- 资源引用链接

**放在 references/（扩展层）**:
- 详细的 API 文档
- 完整的参数说明
- 边界情况和故障排除
- 高级配置选项
- 大型代码示例

**放在 scripts/（执行层）**:
- 确定性操作（如格式验证）
- 重复执行的代码
- 需要精确性的计算
- 外部工具调用

## 跨模型兼容性

### Claude 原生支持

- 完整支持 YAML frontmatter
- 原生渐进式披露
- 支持 scripts/ 执行
- 支持 references/ 按需加载
- 支持 MCP 集成

### Kimi 原生支持

- 完整支持 YAML frontmatter
- 原生渐进式披露
- 支持 scripts/ 执行
- 强调简洁性原则

### GPT 适配策略

由于 GPT 主要通过 Function Calling 触发，需要适配层：

**Option 1: Function Schema 映射**:
```json
{
  "name": "skill_trigger",
  "description": "[原 skill description]",
  "parameters": {
    "type": "object",
    "properties": {
      "reason": {
        "type": "string",
        "description": "为什么这个技能适用"
      }
    }
  }
}
```

**Option 2: 系统提示注入**:
将 SKILL.md 内容压缩后注入系统提示，通过关键词匹配触发。

### MiniMax 适配策略

与 GPT 类似，通过系统提示注入实现：
- 针对中文场景优化触发词
- 强化中文描述中的关键词

## 验证规则

### 自动验证清单

**结构验证**:
- [ ] name 符合 kebab-case
- [ ] description 包含功能+触发条件
- [ ] description 无 XML 标签
- [ ] SKILL.md 存在且大小写正确
- [ ] `README.md` 按推荐策略处理（缺失记 warning，发布前建议补齐）
- [ ] references/ 中文件被 SKILL.md 引用
- [ ] scripts/ 中脚本可执行

**内容验证**:
- [ ] 使用祈使语态
- [ ] 无第二人称
- [ ] complexity 已声明（推荐）
- [ ] SKILL.md 长度符合 complexity 级别
- [ ] compatibility 声明完整（如支持多平台）

**复杂度分级验证**:
- [ ] `minimal`: < 2000 字符，无 references/
- [ ] `standard`: < 4000 字符
- [ ] `complex`: < 8000 字符，有 references/，有理由说明

### 手动验证清单

- [ ] 技能在相关查询中触发（测试 10-20 个查询）
- [ ] 触发准确率达 80%+
- [ ] 工作流程无需用户纠正即可完成
- [ ] 多次执行结果一致
- [ ] 资源文件按需加载正常

---

## 质量门槛（发布前必做）

打包发布前，必须通过以下质量门槛：

### 门槛 1: 结构完整性
- [ ] `SKILL.md` 存在于根目录且大小写正确
- [ ] `name` 符合 kebab-case 规范
- [ ] `description` 包含功能描述和触发条件
- [ ] `complexity` 已声明且长度符合级别
- [ ] `README.md` 按推荐策略处理（存在为 recommended，缺失不阻塞）
- [ ] 无无效或占位文件

### 门槛 2: 内容质量
- [ ] 使用祈使语态（非第二人称）
- [ ] description 具体、可操作、有明确触发词
- [ ] 核心方法论清晰（不是通用流程的简单重复）
- [ ] 资源文件（如有）被正确引用
- [ ] 错误处理说明完整

### 门槛 3: 验证通过
```bash
python tools/validate-skill.py ./skill-name/
```
- [ ] 无 ERROR
- [ ] WARNING 已审查并处理
- [ ] 质量评分 ≥ 90 分

### 门槛 4: 完成定义（DoD）

**必须满足以下所有条件**：

- [ ] **单一职责明确**：一句话能说清 Skill 做什么、不做什么
- [ ] **差异化价值**：已通过方法论审计或有明显竞争壁垒
- [ ] **触发准确**：在预期场景下能可靠触发
- [ ] **可测试**：有关键路径的验证方式
- [ ] **可打包**：`zip -r` 能生成可用产物

**发布检查清单**:
- [ ] 版本号遵循语义化版本（x.y.z）
- [ ] 如为更新，版本号已递增
- [ ] 打包产物已测试可正常加载
- [ ] 用户面向的摘要已准备（包含变更内容、原因、使用方法）

**安全原则**:
- 不打包 secrets、本地凭证或无关文件
- 不包含符号链接等可能逃逸 root 的结构
- 拒绝不安全的文件系统操作

---

## 版本控制

### Semantic Versioning

```
主版本号.次版本号.修订号
```

- **主版本号**: 破坏性变更，不向后兼容
- **次版本号**: 新功能，向后兼容
- **修订号**: Bug 修复，向后兼容

### 变更日志

建议在 references/CHANGELOG.md 中记录：
- 新增功能
- 修复的问题
- 破坏性变更
- 兼容性更新

## 最佳实践总结

### Do's ✅

1. 使用具体、可操作的触发短语
2. 保持 SKILL.md 简洁（< 3000 字）
3. 使用祈使语态写作
4. 为复杂任务提供清晰的步骤
5. 包含错误处理说明
6. 测试技能触发准确性
7. 使用 version 字段追踪变更
8. 明确声明跨模型兼容性

### Don'ts ❌

1. 使用模糊的触发条件（如"帮助处理数据"）
2. 在 SKILL.md 中放入所有细节
3. 使用第二人称（"你应该..."）
4. 忽略错误处理
5. 创建无明确用途的技能
6. 把 `README.md` 当成禁止项，或为了“过验证”把它从 skill 根目录移走
7. 使用 XML 标签在 frontmatter 中
8. 忽略模型特定的限制

---

## 版本历史

### v1.1.0 (2024-01-XX)

**新增**:
- 添加方法论审计要求（同质化检测+竞争壁垒评估）
- 添加 description 进阶技巧（pushy description、触发词检查清单）
- 添加质量门槛章节（DoD检查清单）
- 添加推荐创建流程（阶段0-7）
- 优化 complexity 分级说明

**改进**:
- 完善 compatibility 字段格式
- 更新验证规则，支持 complexity 分级验证

### v1.0.0 (2024-01-XX)

**初始版本**:
- 定义 Universal Skill Schema 基础规范
- 建立核心联盟（Claude + Kimi + Cursor）+ 桥接（GPT + MiniMax）架构
- 定义渐进式披露三层结构
- 定义 complexity 分级（minimal/standard/complex）
- 定义验证规则

---

## 附录

### 参考文档

- `references/claude-specific.md` - Claude 特定功能
- `references/kimi-specific.md` - Kimi 特定功能
- `references/gpt-adaptation.md` - GPT 适配指南
- `references/minimax-adaptation.md` - MiniMax 适配指南

### 工具

- `tools/validate-skill.py` - 技能验证脚本（支持 complexity 分级）
- `tools/convert-for-model.py` - 模型转换工具（Claude/Kimi → GPT/MiniMax）
- `tools/extract-triggers.py` - 从 description 自动提取 triggers
- `tools/test-trigger-accuracy.py` - 触发准确性测试
