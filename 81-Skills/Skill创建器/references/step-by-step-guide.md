# Step-by-Step Skill 创建指南

完整的 7 步 Skill 创建流程。

---

## 步骤 1: 需求分析

### 1.1 方法论审计（可选但强烈建议）

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

**竞争壁垒评估**：

一个真正有价值的 Skill，至少应命中以下 1 项：

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

### 1.2 需求确认

通过方法论审计后，继续确认：

1. **核心目标**
   - 这个 Skill 要解决什么问题？
   - 成功的标准是什么？

2. **触发短语**（收集 5-10 个）
   - 用户可能会如何描述需求？
   - 有哪些同义表达方式？
   - 什么情况下**不应该**触发？

3. **集成需求**
   - 是否需要外部工具（MCP）？
   - 需要访问哪些 API 或服务？

4. **目标用户**
   - 技术水平如何？
   - 主要使用场景？

### 输出
用例定义文档，包含：
- 功能描述（1-2 句话）
- **同质化风险评估结果**
- **竞争壁垒说明**
- 触发词列表
- 输入/输出示例
- 成功标准

---

## 步骤 2: 架构设计

### 选择复杂度级别

根据内容量选择合适的 complexity：

| 级别 | 最大长度 | 典型场景 |
|------|----------|----------|
| minimal | 2000 字符 | 简单提示模板、知识库 |
| standard | 4000 字符 | 带示例的工作流 Skill |
| complex | 8000 字符 | 多步骤复杂流程 |

### 规划目录结构

```
skill-name/
├── SKILL.md              # 必需
├── scripts/              # [可选] 可执行脚本
├── references/           # [可选] 详细文档
├── assets/               # [可选] 模板资源
└── examples/             # [推荐] 使用示例
```

### 决策矩阵

| 条件 | minimal | standard | complex |
|------|---------|----------|---------|
| SKILL.md 长度 | < 2000 | < 4000 | < 8000 |
| 需要 scripts/ | 否 | 可选 | 推荐 |
| 需要 references/ | 否 | 可选 | 是 |
| 需要 examples/ | 可选 | 推荐 | 是 |

---

## 步骤 3: 编写 SKILL.md

### 3.1 Frontmatter

```yaml
---
name: [kebab-case-name]
description: |
  [一句话功能描述]。
  当用户[触发条件1]、[触发条件2]或提及"[关键词]"时使用。
version: "1.0.0"
complexity: "standard"
compatibility:
  claude:
    status: "native"
  kimi:
    status: "native"
  cursor:
    status: "native"
  gpt:
    status: "bridge"
    limitations: ["渐进式披露需模拟"]
---
```

#### name 规范
- 使用 kebab-case（小写字母、数字、连字符）
- 示例：`pdf-processor`, `api-integration-helper`
- 限制：无空格、无大写字母、无下划线

#### description 写作

**必须包含**:
1. 功能描述（这个 Skill 做什么）
2. 触发条件（何时使用）
3. 具体触发词（用户可能说的话）

**良好示例**:
```yaml
description: |
  处理 PDF 文档的提取、转换和合并。
  当用户上传.pdf文件、提及"PDF转Word"、
  "提取PDF内容"或"合并PDF"时激活。
```

**不良示例**:
```yaml
# 太模糊
description: 帮助处理文档

# 缺少触发条件
description: 实现PDF文件的解析与转换
```

#### complexity 声明

```yaml
complexity: "standard"  # minimal | standard | complex
```

选择合适的级别，而非强行压缩内容。

### 3.2 Body 结构

使用标准模板：

```markdown
# [Skill 名称]

## 概述
[1-2 句话核心价值]

## 适用场景
- [场景1]: [简要说明]
- [场景2]: [简要说明]

## 使用方法

### 基本流程
1. [步骤1]
2. [步骤2]
3. [步骤3]

### 资源引用
- `references/[file].md` - [何时查阅]
- `scripts/[script].py` - [用途]

## 错误处理

### [错误1]
**症状**: [描述]
**解决**: [步骤]

## 限制
- [限制1]
- [限制2]
```

#### 写作风格

**使用祈使语态**（动词开头）：
```markdown
# 正确 ✓
运行脚本验证输入。
查阅 references/guide.md 获取详情。

# 错误 ✗
你应该运行脚本验证输入。
你可以查阅 references/guide.md。
```

**简洁清晰**:
- 删除冗余词语
- 使用列表代替长段落
- 一个段落一个概念

---

## 步骤 4: 添加资源文件

### scripts/（如需要）

**何时添加**:
- 操作需要确定性结果
- 代码会被重复执行
- 需要精确控制

**规范**:
```python
#!/usr/bin/env python3
"""Brief description."""

import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    args = parser.parse_args()
    # Implementation

if __name__ == '__main__':
    main()
```

**要求**:
- 清晰的文件名（`validate-input.sh`, `convert-pdf.py`）
- 包含 shebang
- 添加执行权限（`chmod +x`）
- 提供 `--help` 支持

### references/（如需要）

**何时添加**:
- SKILL.md 内容超出限制
- 需要详细技术文档
- 有多个配置变体

**规范**:
- 清晰文件名（`patterns.md`, `api-reference.md`）
- 在 SKILL.md 中明确引用
- 超过 100 行时添加目录

### examples/（推荐）

**内容**:
- 典型用例展示
- 输入/输出示例
- 常见变体说明

---

## 步骤 5: Iron Law 测试 (GREEN)

**NO SKILL WITHOUT A FAILING TEST FIRST**

在编写 Skill 前，必须先验证"没有该 Skill 时 agent 会失败"。

### 5.1 RED - 基线失败

**目标**: 证明 Skill 是必要的

**步骤**:
1. 不加载目标 Skill，给 subagent 真实任务
2. 记录错误行为与原话
3. 提炼失败模式（漏步骤、乱用工具、格式不一致）

**输出**: RED 报告（失败场景 + 错误模式）

### 5.2 GREEN - 最小修复

**目标**: 仅针对 RED 暴露的问题写最小内容

**原则**:
- 避免"想当然的全量堆砌"
- 只解决已验证的问题

**输出**: 初版 SKILL.md

详细方法见 `references/iron-law-testing.md`

---

## 步骤 6: 验证与优化

### 运行验证工具

```bash
python tools/validate-skill.py ./skill-name/
```

### 检查清单

**结构验证**:
- [ ] name 符合 kebab-case
- [ ] description 包含功能 + 触发条件
- [ ] description 无 XML 标签
- [ ] SKILL.md 存在且大小写正确
- [ ] 无 README.md 在文件夹内

**内容验证**:
- [ ] 使用祈使语态
- [ ] 无第二人称
- [ ] complexity 已声明
- [ ] 长度符合 complexity 级别
- [ ] 资源文件被正确引用

**功能验证**:
- [ ] 测试 10-20 个触发查询
- [ ] 触发准确率 ≥ 80%

---

## 步骤 7: 质量门槛检查 (REFACTOR)

Iron Law Phase 3: 应对压力场景，消除漏洞。

### REFACTOR - 加固闭环

**施压场景**:
- 时间压力（"尽快"、"简单处理"）
- 模糊需求（"帮我弄一下"）
- 并行任务（"顺便把 X 也做了"）
- 异常输入（空值、超大输入、格式错误）

**步骤**:
1. 收集新借口/失败模式
2. 加入反例/约束到 Skill
3. 重测直到连续 3 次无新问题

详细方法见 `references/iron-law-testing.md`

---

### 发布前质量门槛

打包前必须通过以下质量门槛：

### 门槛 1: 结构完整性
- [ ] `SKILL.md` 存在于根目录且大小写正确
- [ ] `name` 符合 kebab-case 规范
- [ ] `description` 包含功能描述和触发条件
- [ ] `complexity` 已声明且长度符合级别
- [ ] 无 `README.md` 在 skill 文件夹内
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

## 步骤 8: 跨模型适配

### Claude/Kimi/Cursor
无需额外适配，原生支持。

### GPT 桥接

生成 Function Calling Schema：

```bash
python tools/convert-for-model.py ./skill-name --target gpt
```

输出示例：
```json
{
  "name": "use_skill_name",
  "description": "[Skill description]",
  "parameters": {
    "type": "object",
    "properties": {
      "task": {
        "type": "string",
        "description": "用户请求"
      }
    }
  }
}
```

### MiniMax 桥接

```bash
python tools/convert-for-model.py ./skill-name --target minimax
```

自动进行：
- 中文触发词扩展
- 同义词添加
- 语序调整

---

## 步骤 9: 打包与发布

### 打包

```bash
cd skill-parent-directory
zip -r skill-name.skill skill-name/
```

### 发布清单

- [ ] 更新版本号
- [ ] 运行验证工具（无错误）
- [ ] 测试触发准确性
- [ ] 添加 CHANGELOG.md（可选）
- [ ] 创建 GitHub Release（如适用）

---

## 常见问题

### Q: 如何选择 complexity 级别？

**minimal**: 简单知识型 Skill，如代码片段提示
**standard**: 带示例的工作流，如文件处理
**complex**: 多步骤复杂流程，如数据分析管道

### Q: description 多长合适？

理想长度：200-400 字符
最大限制：1024 字符

应包含：功能描述 + 触发条件 + 具体触发词

### Q: 需要测试哪些触发查询？

**应该触发**（5-10 个）:
- 直接的触发词
- 同义表达
- 带上下文的查询

**不应该触发**（3-5 个）:
- 完全不相关的查询
- 边界情况
- 易混淆的领域

---

**文档版本**: 1.0.0
