# Skill 评估指南 (Evaluation Guide)

基于 Universal Skill Schema v1.1.0 的详细评估操作指南。

## 评估前准备

### 1. 确认评估目标

在开始评估前，明确：
- 该 Skill 的复杂度级别（minimal/standard/complex）
- 目标用户群体
- 预期触发场景

### 2. 检查文件完整性

确认 Skill 目录存在以下文件：
```
skill-name/
└── SKILL.md          # 必需
```

## 六维度评估流程

### 维度 1: Schema 合规性 (20%)

#### 1.1 name 格式检查

**规范要求**:
- kebab-case（小写字母、数字、连字符）
- 无空格、无大写字母、无下划线
- 不以连字符开头或结尾

**检查方法**:
```bash
# 错误示例
my_skill        # 包含下划线 ❌
My-Skill        # 包含大写 ❌
my skill        # 包含空格 ❌
-my-skill       # 以连字符开头 ❌

# 正确示例
my-skill        # ✓
pdf-processor   # ✓
api-integration-helper  # ✓
```

**评分**:
- 完全符合: 5分
- 有小问题（如长度不当）: 3分
- 不符合规范: 0分

#### 1.2 description 结构检查

**规范要求**:
- 包含功能描述
- 包含触发条件
- 包含具体触发词
- 200-1024 字符（理想区间）

**检查清单**:
- [ ] 第一句说明核心功能
- [ ] 有"当用户...时使用"或类似表达
- [ ] 列出 3+ 个具体触发词/短语
- [ ] 长度在合理范围内

**示例分析**:
```yaml
# 优秀示例 (95分)
description: |
  处理 PDF 文档的提取、转换和合并。
  当用户提及以下任何内容时使用：
  - "PDF转Word"、"PDF转Excel"、"PDF转Markdown"
  - "提取PDF文字"、"提取PDF内容"
  - "合并PDF"、"把多个PDF合并"
  - 上传 .pdf 文件

# 良好示例 (80分)
description: |
  处理 PDF 文档的高级分析与转换。
  当用户上传 .pdf 文件或提及"提取PDF内容"、
  "合并PDF"时使用。

# 不足示例 (60分)
description: 帮助处理文档  # 太模糊

# 不足示例 (50分)
description: 实现PDF文件的解析与转换  # 缺少触发条件
```

#### 1.3 description 格式检查

**禁止项**:
- XML 标签 `< >`
- 第二人称（"你应该"、"您可以"）
- 过于技术化的术语（用户不会说的词）

#### 1.4 complexity 声明检查

**有效值**:
- `minimal` - < 2000 字符
- `standard` - < 4000 字符
- `complex` - < 8000 字符

**检查方法**:
```yaml
# 正确
complexity: "standard"

# 错误
complexity: "medium"  # 无效值
# 或缺少 complexity 声明
```

#### 1.5 compatibility 声明检查

**最低要求**: 至少声明核心联盟之一（claude/kimi/cursor）

**推荐格式**:
```yaml
compatibility:
  claude: { status: "native" }
  kimi: { status: "native" }
  cursor: { status: "native" }
  gpt: { status: "bridge", limitations: ["渐进式披露需模拟"] }
```

---

### 维度 2: Frontmatter 质量 (25%)

#### 2.1 触发短语具体性

**评估标准**: description 是否包含 3+ 种具体的触发表达方式

**优秀示例**:
```yaml
description: |
  构建展示内部数据的快速仪表盘。
  只要用户提及仪表盘、数据可视化、内部指标，
  或想要展示任何公司数据，即使没明确说"仪表盘"，
  也要确保使用此技能。
```

**Pushy Description 技巧**:
- 覆盖同义词（"PDF转Word" vs "Word导出"）
- 覆盖变体（"合并PDF" vs "把PDF合到一起"）
- 覆盖隐含需求（用户没说关键词但实际需要）

#### 2.2 防过度触发

**检查**: description 是否说明了不适用场景

**示例**:
```yaml
# 有防过度触发说明
description: |
  专业 PDF 文档处理工具。
  适用场景：文字提取、格式转换、页面合并拆分。
  不适用场景：图片文件处理、纯文本编辑、扫描件 OCR。
```

---

### 维度 3: Body 内容质量 (30%)

#### 3.1 写作语态检查

**规范**: 使用祈使语态（Imperative），避免第二人称

**错误示例**:
```markdown
你应该运行脚本验证输入格式。
你可以查阅 references/api-guide.md。
```

**正确示例**:
```markdown
运行脚本验证输入格式。
查阅 references/api-guide.md 获取端点详情。
```

#### 3.2 核心工作流检查

**评估标准**:
- 步骤清晰（编号或项目符号）
- 每个步骤可操作
- 有明确输入和输出

**minimal 级别**: 3-4 步
**standard 级别**: 4-6 步
**complex 级别**: 分阶段，每阶段 2-3 步

#### 3.3 适用性说明检查

**必需章节**:
- `## When to Use` 或 `## 何时使用`
- `## When Not to Use` 或 `## 何时不该使用`

**内容要求**:
- When to Use: 3-5 个具体场景
- When Not to Use: 明确的边界条件

#### 3.4 错误处理检查

**推荐章节**: `## Error Handling` 或 `## 错误处理`

**内容结构**:
```markdown
### 错误名称
**症状**: [描述]
**原因**: [解释]
**解决**: [步骤]
```

#### 3.5 长度合规检查

**测量方法**: 统计 Markdown body 字符数（不含 frontmatter）

**合规标准**:

| complexity | 最大长度 | 评分 |
|------------|---------|------|
| minimal | 2000 | 100分 |
| standard | 4000 | 100分 |
| complex | 8000 | 100分 |
| +10% | - | 80分 |
| +30% | - | 60分 |
| +50% | - | 40分 |

---

### 维度 4: 方法论审计 (15%)

#### 4.1 同质化检测

**4个问题检查**:

1. 这个方法是否是公开教科书式流程？
2. 是否几乎任何 AI 都会给出类似步骤？
3. 是否主要靠模板填空，而非判断？
4. 是否没有任何行业语境或私有视角？

**评分**:
- 0-1 项命中: 低风险 (90-100分)
- 2 项命中: 中风险 (70-85分)
- 3-4 项命中: 高风险 (55-70分)

#### 4.2 竞争壁垒评估

**4 选 1 检查**:

| 壁垒类型 | 特征 | 示例 |
|----------|------|------|
| 私有数据 | 内部 SOP、客服记录 | 公司内部审批流程 |
| 行业洞察 | 深耕行业的特殊判断 | 金融合规的特殊要求 |
| 失败案例 | 常见坑、踩雷点 | 某类项目 90% 失败的原因 |
| 反共识框架 | 与通用建议不同但更有效 | 不走寻常路但成功的方法 |

**评分**:
- 命中 1+ 项: 有壁垒 (85-100分)
- 未命中但非通用: 一般 (70-80分)
- 通用流程: 无壁垒 (55-65分)

---

### 维度 5: 质量门槛达标 (10%)

#### 5.1 DoD 检查清单

**5 项检查**:

1. **单一职责明确** (2%)
   - 一句话能说清 Skill 做什么
   - 一句话能说清 Skill 不做什么

2. **差异化价值** (2%)
   - 通过方法论审计
   - 或有明显竞争壁垒

3. **触发准确** (2%)
   - 有明确的触发词
   - 有 When to Use 说明

4. **可测试** (2%)
   - 有关键路径验证方式
   - 或有测试用例说明

5. **可打包** (2%)
   - 目录结构完整
   - 无无效文件

---

### 维度 6: 目录结构 (5%)

#### 6.1 必需项检查

- [ ] `SKILL.md` 存在且大小写正确

#### 6.2 推荐项检查

- [ ] `references/` 存在
- [ ] `examples/` 存在
- [ ] `scripts/` 存在
- [ ] `tests/` 存在（通常为 .gitkeep）

**评分**:
- 全部存在: 100分
- 缺 1 项: 80分
- 缺 2 项: 60分
- 缺 3+ 项: 40分

---

## 问题分级标准

### Error (❌)

违反 Schema 必需规范，必须修复：
- name 格式错误
- 缺少 description
- description 包含 XML 标签
- SKILL.md 不存在

### Warning (⚠️)

影响质量但未违反必需规范，推荐修复：
- description 过短/过长
- 缺少触发词
- 使用第二人称
- 缺少 When Not to Use

### Info (ℹ️)

可选优化建议：
- 可添加竞争壁垒
- 可添加更多示例
- 目录结构可完善

---

## 评估报告生成

### 总分计算

```python
def calculate_score(dimensions):
    """
    dimensions = {
        'schema_compliance': 95,      # 20%
        'frontmatter_quality': 85,    # 25%
        'body_quality': 90,           # 30%
        'methodology_audit': 80,      # 15%
        'quality_gate': 100,          # 10%
        'directory_structure': 80     # 5%
    }
    """
    weights = {
        'schema_compliance': 0.20,
        'frontmatter_quality': 0.25,
        'body_quality': 0.30,
        'methodology_audit': 0.15,
        'quality_gate': 0.10,
        'directory_structure': 0.05
    }
    
    total = sum(dimensions[k] * weights[k] for k in dimensions)
    return round(total)
```

### 状态判定

```python
def determine_status(score, has_errors):
    if has_errors:
        return "needs_optimization"
    if score >= 95:
        return "excellent"
    if score >= 85:
        return "good"
    if score >= 70:
        return "needs_optimization"
    return "needs_refactor"
```

---

## 常见问题 FAQ

### Q1: 目录结构权重为什么只有 5%？

**A**: 为了强调内容质量。一个 Skill 的价值在于其内容和方法论，而非目录是否完整。结构可以通过自动化工具快速补全，但内容质量需要深度评估。

### Q2: 方法论审计怎么做？

**A**: 问自己："这个 Skill 的核心方法是不是任何人用 Google 或通用 AI 都能轻易得到？"如果是，说明同质化风险高，需要添加独特价值。

### Q3: 什么情况下应该给高分？

**A**: 同时满足：
1. 符合所有 Schema 必需规范
2. 有明确的差异化价值（竞争壁垒）
3. 触发词覆盖全面且准确
4. 核心工作流清晰可操作

### Q4: 评估结果用户不认可怎么办？

**A**: 
1. 检查是否严格按照 Schema 标准评估
2. 检查是否有遗漏的关键问题
3. 如果评估正确但用户有异议，可调整为 manual 类型问题，让用户自行决定

---

## 参考链接

- [Universal Skill Schema](./universal-skill-schema.md)
- [评分标准详解](./scoring-criteria.md)
