# 优化模式库 (Optimization Patterns)

基于 Universal Skill Schema v1.1.0 和六维度评估体系的标准优化模式。

---

## Schema 合规性修复模式

### S001: name 格式修正

**问题**: name 不符合 kebab-case（包含下划线、大写字母或空格）

**检测方式**:
```yaml
issues:
  schema_compliance:
    - id: "S001"
      field: "name"
      message: "name 包含下划线，应使用 kebab-case"
```

**自动修复规则**:
```python
# 下划线转连字符
"my_skill_name" → "my-skill-name"

# 大写转小写
"MySkillName" → "my-skill-name"

# 空格转连字符
"my skill name" → "my-skill-name"

# 驼峰转 kebab
"mySkillName" → "my-skill-name"
```

**评分影响**: +3~5 分

**风险**: 低（纯格式修改）

---

### S002: 添加 version 字段

**问题**: 缺少 version 字段

**检测方式**:
```yaml
issues:
  schema_compliance:
    - id: "S002"
      field: "version"
      message: "缺少 version 字段"
```

**自动修复**:
```yaml
version: "1.0.0"
```

**评分影响**: +2 分

**注意事项**:
- 使用语义化版本 (MAJOR.MINOR.PATCH)
- 新 Skill 从 1.0.0 开始

---

### S003: 添加 complexity 字段

**问题**: 缺少 complexity 字段

**自动判断规则**:
```python
body_chars = len(skill_body)
if body_chars < 2000:
    complexity = "minimal"
elif body_chars < 4000:
    complexity = "standard"
else:
    complexity = "complex"
```

**自动修复**:
```yaml
complexity: "standard"  # 根据实际长度
```

**评分影响**: +2 分

---

### S004: 添加 compatibility 字段

**问题**: 缺少 compatibility 字段

**默认修复方案**:
```yaml
compatibility:
  claude: { status: "native" }
  cursor: { status: "native" }
  kimi: { status: "native" }
```

**扩展方案**（如需要跨平台）:
```yaml
compatibility:
  claude: { status: "native" }
  cursor: { status: "native" }
  kimi: { status: "native" }
  gpt: { status: "bridge", limitations: ["渐进式披露需模拟"] }
  minimax: { status: "bridge", limitations: ["需中文优化"] }
```

**评分影响**: +2 分

---

### S005: 修复 description 格式

**问题**: 
- 包含 XML 标签 `< >`
- 使用第二人称
- 描述 workflow 而非功能

**自动修复**:
```yaml
# 修复前
description: "<b>处理</b> PDF 文档，你可以使用此技能"

# 修复后
description: "处理 PDF 文档"
```

**评分影响**: +2~4 分

---

## Frontmatter 质量优化模式

### F001: 优化 description（Pushy 技巧）

**问题**: description 触发词不足，覆盖不全面

**检测标准**:
- 触发词 < 3 个
- 单一场景描述
- 长度 < 150 字符

**人机协作修复**:

**原始描述**:
```yaml
description: "处理 PDF 文档"
```

**优化方向**:
```yaml
description: |
  处理 PDF 文档的提取、转换和合并。
  当用户提及以下任何内容时使用：
  - "PDF转Word"、"PDF转Excel"、"PDF转Markdown"
  - "提取PDF文字"、"提取PDF内容"
  - "合并PDF"、"把多个PDF合并"
  - 上传 .pdf 文件
```

**Pushy 技巧要点**:
1. 多行描述，每行一个场景
2. 多种表达方式（英文 + 中文触发词）
3. 覆盖同义词、变体、隐含需求
4. 明确说明不适用场景（防过度触发）

**评分影响**: +5~10 分

---

### F002: 添加防过度触发说明

**问题**: 缺少不适用场景说明

**修复方案**:
```yaml
description: |
  处理 PDF 文档的提取、转换和合并。
  适用场景：文字提取、格式转换、页面合并拆分。
  不适用场景：图片文件处理、纯文本编辑、扫描件 OCR。
  当用户提及...时使用。
```

**评分影响**: +3~5 分

---

## Body 内容质量优化模式

### B001: 修复写作语态

**问题**: 使用第二人称（"你应该"、"您可以"）

**自动修复规则**:
```markdown
# 修复前
你应该运行脚本验证输入格式。
你可以查阅 references/api-guide.md。

# 修复后
运行脚本验证输入格式。
查阅 references/api-guide.md 获取端点详情。
```

**常见替换**:
- "你应该" → 删除
- "你可以" → 删除
- "你需要" → 删除
- "建议您" → 删除

**评分影响**: +3~6 分

---

### B002: 添加 When to Use 章节

**问题**: 缺少 When to Use / 何时使用 章节

**自动修复模板**:
```markdown
## When to Use / 何时使用

- 场景 1: 具体描述
- 场景 2: 具体描述
- 场景 3: 具体描述
```

**质量要求**:
- 至少 2-3 个具体场景
- 场景描述清晰可理解
- 覆盖主要使用场景

**评分影响**: +5~8 分

---

### B003: 添加 When Not to Use 章节

**问题**: 缺少 When Not to Use / 何时不该使用 章节

**自动修复模板**:
```markdown
## When Not to Use / 何时不该使用

- 不适用于场景 1，建议使用替代方案 X
- 不适用于场景 2，建议使用替代方案 Y
```

**评分影响**: +3~5 分

---

### B004: 优化核心工作流

**问题**: 核心工作流不清晰或过于简单

**优化策略**:

**minimal 级别** (3-4 步):
```markdown
## Core Workflow / 核心流程

1. **理解需求** - 确认任务类型和约束
2. **执行处理** - 应用处理逻辑
3. **验证结果** - 检查输出质量
4. **输出交付** - 生成最终产物
```

**standard 级别** (4-6 步，分阶段):
```markdown
## Core Workflow / 核心流程

### Phase 1: 准备
1. 收集输入
2. 验证约束

### Phase 2: 处理
3. 执行核心逻辑
4. 中间验证

### Phase 3: 输出
5. 生成报告
6. 最终确认
```

**complex 级别** (分阶段，每阶段 2-3 步，含详细子步骤)

**评分影响**: +5~10 分

---

### B005: 添加 Error Handling 章节

**问题**: 缺少错误处理说明

**修复模板**:
```markdown
## Error Handling / 错误处理

### 错误名称
**症状**: [描述现象]
**原因**: [解释原因]
**解决**: [具体步骤]
```

**评分影响**: +3~5 分

---

## 方法论审计模式

### M001: 添加竞争壁垒声明

**问题**: 未体现差异化价值，同质化风险高

**人机协作流程**:

1. **询问壁垒类型**:
   ```
   请选择此 Skill 的竞争壁垒类型：
   [1] 私有数据（内部 SOP、客服记录）
   [2] 行业洞察（深耕行业的特殊判断）
   [3] 失败案例（常见坑、踩雷点）
   [4] 反共识框架（与通用建议不同但更有效）
   [5] 其他（请描述）
   [0] 无明显壁垒
   ```

2. **生成内容**:
   ```markdown
   ## Methodology Audit / 方法论审计

   ### 竞争壁垒

   本 Skill 基于 [壁垒类型]，提供以下独特价值：
   - [具体说明]
   - [与通用方案的区别]

   ### 同质化检测

   通过以下问题验证独特性：
   - [ ] 是否为公开教科书式流程？
   - [ ] 是否几乎任何 AI 都会给出类似步骤？
   - [ ] 是否主要靠模板填空？
   - [ ] 是否没有行业语境？
   ```

**评分影响**: +5~10 分

---

### M002: 添加 DoD（完成定义）

**问题**: 缺少质量门槛检查清单

**修复模板**:
```markdown
## Definition of Done / 完成标准

- [ ] SKILL.md frontmatter 完整
- [ ] Body 内容符合 complexity 级别
- [ ] 包含 When to Use 和 When Not to Use
- [ ] 目录结构符合标准
```

**评分影响**: +2~4 分

---

## 质量门槛达标模式

### Q001: 添加可测试说明

**问题**: 缺少验证方法

**修复模板**:
```markdown
## Testing / 测试方法

验证此 Skill 是否正常工作：

1. 测试查询: "..."
   期望输出: "..."

2. 测试查询: "..."
   期望输出: "..."
```

**评分影响**: +2 分

---

## 目录结构补全模式

### D001: 创建缺失目录

**自动修复操作**:
```bash
# 创建目录并添加 .gitkeep
mkdir -p references/ examples/ scripts/
touch references/.gitkeep examples/.gitkeep scripts/.gitkeep
```

**评分影响**: +1 分/目录

---

### D002: 生成 README.md

**自动提取内容**:

| 内容 | 来源 |
|------|------|
| 标题 | frontmatter.name |
| 副标题 | description 第一行 |
| 简介 | description 完整内容 |
| 功能 | When to Use 章节 |
| 使用 | Core Workflow 章节 |
| 结构 | 扫描现有目录 |
| 版本 | frontmatter.version |
| 兼容性 | frontmatter.compatibility |

**生成模板**:
```markdown
# {name}

> {description-first-line}

## 简介

{description-full}

## 功能

{when-to-use-items}

## 使用

{basic-usage}

## 目录结构

```
{name}/
├── README.md
├── SKILL.md
├── .skill-meta/
│   └── manifest.yaml
├── references/
├── examples/
├── scripts/
└── tests/
```

## 版本

- 当前版本: {version}

## 兼容性

{compatibility-table}
```

**评分影响**: +2 分

---

## 批量优化模式

### 高优先级批量修复（Schema 合规性）

**执行顺序**:
```
1. S001 修复 name 格式
2. S002 添加 version
3. S003 添加 complexity
4. S004 添加 compatibility
5. S005 修复 description 格式
```

**预期提升**: +10~15 分

---

### 中优先级批量修复（内容质量）

**执行顺序**:
```
1. B001 修复写作语态
2. B002 添加 When to Use
3. B003 添加 When Not to Use
4. B004 优化核心工作流
```

**预期提升**: +10~18 分

---

### 人工协作批量修复（方法论）

**执行顺序**:
```
1. M001 添加竞争壁垒声明
2. M002 添加 DoD
3. F001 优化 description
```

**预期提升**: +10~18 分

---

### 结构补全批量修复

**执行顺序**:
```
1. D001 创建缺失目录
2. D002 生成 README.md
```

**预期提升**: +3~5 分

---

## 优化风险与规避

### 高风险修改

| 修改 | 风险 | 规避策略 |
|------|------|----------|
| 修改 name | 破坏引用 | 同时更新所有内部引用 |
| 修改 complexity | 可能需要大量内容调整 | 先评估内容长度 |
| 删除内容 | 丢失重要信息 | 先迁移到 references/ |
| 修改核心流程 | 改变 Skill 行为 | 必须用户确认 |

### 修改前检查清单

- [ ] 是否已备份原文件？
- [ ] 是否理解修改的影响范围？
- [ ] 是否有回滚方案？
- [ ] 是否需要用户确认？

---

**模式库版本**: 2.0.0 | **配套 Skill**: lute-skills-opt v2.0.0 | **Schema 版本**: 1.1.0
