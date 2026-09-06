# NLP 特征提取详解

## 1. 逻辑密度 (S_logic)

### 逻辑连接词分类

| 类别 | 中文模式 | 英文模式 | 权重 |
|-----|---------|---------|------|
| 因果 | 因为/所以/因此/于是/由于/导致 | because/so/therefore/thus | 1.0 |
| 条件 | 如果/那么/则/假设/假如 | if/then/assume/suppose | 1.0 |
| 序列 | 首先/其次/然后/最后/第N | first/second/then/finally | 0.8 |
| 转折 | 虽然/但是/然而/不过/尽管 | although/but/however/though | 0.8 |
| 推论 | 综上/总之/由此可见/这意味着 | in conclusion/thus/it means | 1.2 |

### 计算方式

```python
def calculate_logic_density(text: str, language: str = 'zh') -> float:
    words = tokenize(text, language)
    total_words = len(words)
    
    logic_count = 0
    for pattern, weight in LOGIC_PATTERNS[language].items():
        matches = len(re.findall(pattern, text))
        logic_count += matches * weight
    
    return logic_count / total_words
```

### 示例

**高密度文本**:
```
因为 A 所以 B，如果 C 则 D。首先 E，其次 F。
```
逻辑密度 = 6 / 12 = 0.5

**低密度文本**:
```
这是一个简单的描述性段落，没有复杂的逻辑关系。
```
逻辑密度 = 0 / 15 = 0

---

## 2. 实体密度 (S_entity)

### 实体类型

| 类型 | 识别方式 | 权重 |
|-----|---------|------|
| 命名实体 | spaCy NER / Jieba 词典 | 1.0 |
| 数字 | 正则 \d+\.?\d* | 0.5 |
| LaTeX 公式 | 正则 \$\$?[\s\S]*?\$\$? | 2.0 |
| 专业术语 | 领域词典匹配 | 1.5 |
| 代码标识符 | 正则 [a-zA-Z_][a-zA-Z0-9_]* | 0.3 |

### 中文实体识别

```python
def extract_chinese_entities(text: str) -> list:
    # 1. Jieba 分词
    words = jieba.lcut(text)
    
    # 2. 加载专业术语词典
    technical_terms = load_domain_dictionary()
    
    # 3. 识别专业术语
    entities = [w for w in words if w in technical_terms]
    
    # 4. 识别数字和公式
    numbers = re.findall(r'\d+\.?\d*', text)
    latex = re.findall(r'\$\$?[\s\S]*?\$\$?', text)
    
    return entities + numbers + latex
```

### 示例

**高密度文本**（财务分析）:
```
流动比率(Current Ratio) = 流动资产(Current Assets) / 流动负债(Current Liabilities)
```
实体：流动比率、Current Ratio、流动资产、Current Assets、流动负债、Current Liabilities
实体密度 = 6 / 15 = 0.4

---

## 3. 结构密度 (S_struct)

### 结构元素

| 元素 | 正则模式 | 权重 |
|-----|---------|------|
| 无序列表 | `^[\s]*[-*•]\s+` | 0.5 |
| 有序列表 | `^\d+\.\s+` | 0.5 |
| 表格 | `\|.*\|.*\|` | 1.0 |
| 代码块 | ```[\s\S]*?``` | 1.0 |
| LaTeX 块 | `\$\$[\s\S]*?\$\$` | 1.0 |
| 标题 | `^#{1,6}\s+` | 0.3 |
| 引用块 | `^>\s+` | 0.3 |

### 计算方式

```python
def calculate_struct_density(text: str) -> float:
    lines = text.split('\n')
    total_lines = len(lines)
    
    struct_lines = 0
    for pattern, weight in STRUCT_PATTERNS:
        matches = len(re.findall(pattern, text, re.MULTILINE))
        struct_lines += matches * weight
    
    return struct_lines / total_lines
```

### 示例

**高密度文本**:
```markdown
## 公式列表

1. 比率 A = X / Y
2. 比率 B = M / N

| 指标 | 公式 | 说明 |
|-----|------|------|
| CR | CA/CL | 流动比率 |

$$
E = mc^2
$$
```
结构密度 = (1标题 + 2列表 + 1表格 + 1公式) / 10行 = 0.5

---

## 4. 特征组合

### 综合密度公式

```python
final_score = (
    w_logic * s_logic +
    w_entity * s_entity +
    w_struct * s_struct
) * 100  # 归一化到 0-100
```

### 默认权重（校准前）

```python
DEFAULT_WEIGHTS = {
    'w_logic': 0.33,
    'w_entity': 0.33,
    'w_struct': 0.33
}
```

### 校准后权重示例

```python
# 针对财务分析领域
CALIBRATED_WEIGHTS = {
    'w_logic': 0.25,   # 逻辑较稳定
    'w_entity': 0.50,  # 实体（公式、指标）更重要
    'w_struct': 0.25   # 结构中等重要
}
```

---

## 5. 语言差异处理

### 中文 vs 英文

| 特征 | 中文处理 | 英文处理 |
|-----|---------|---------|
| 分词 | Jieba | spaCy tokenization |
| 实体识别 | 词典匹配 + 规则 | spaCy NER |
| 逻辑词 | 固定搭配 | 更多连接词形式 |
| Token 估算 | 2 字符/token | 4 字符/token |

### 代码示例

```python
def calculate_density(text: str, language: str = 'zh') -> dict:
    if language == 'zh':
        s_logic = calculate_chinese_logic_density(text)
        s_entity = calculate_chinese_entity_density(text)
    else:
        s_logic = calculate_english_logic_density(text)
        s_entity = calculate_english_entity_density(text)
    
    s_struct = calculate_struct_density(text)  # 语言无关
    
    return {
        's_logic': s_logic,
        's_entity': s_entity,
        's_struct': s_struct
    }
```
