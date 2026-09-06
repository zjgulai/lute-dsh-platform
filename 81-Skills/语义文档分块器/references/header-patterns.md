# 标题结构识别模式

## Markdown 标题语法

### 标准格式

```markdown
# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题
```

### ATX 格式（带闭合）

```markdown
# 一级标题 #
## 二级标题 ##
```

## 正则表达式模式

### 基础匹配

```python
import re

# 匹配 1-6 级标题
HEADER_PATTERN = re.compile(r'^(#{1,6})\s+(.+?)(?:\s+#*)?$', re.MULTILINE)
```

### 逐行匹配

```python
def extract_headers(content: str) -> list:
    headers = []
    lines = content.split('\n')
    
    for line_num, line in enumerate(lines, 1):
        match = re.match(r'^(#{1,6})\s+(.+)$', line.strip())
        if match:
            level = len(match.group(1))
            text = match.group(2).strip()
            headers.append({
                'level': level,
                'text': text,
                'line_number': line_num
            })
    
    return headers
```

## 标题树构建

### 算法

```python
def build_header_tree(headers: list) -> dict:
    root = {'level': 0, 'text': 'Root', 'children': [], 'line_number': 0}
    stack = [root]
    
    for header in headers:
        node = {
            'level': header['level'],
            'text': header['text'],
            'line_number': header['line_number'],
            'children': []
        }
        
        # 找到父节点
        while stack and stack[-1]['level'] >= header['level']:
            stack.pop()
        
        # 添加到父节点的 children
        if stack:
            stack[-1]['children'].append(node)
        
        # 压入栈
        stack.append(node)
    
    return root
```

### 示例

输入：
```markdown
# 第一章
## 1.1 节
### 1.1.1 小节
## 1.2 节
# 第二章
```

输出树结构：
```
Root (level 0)
├── 第一章 (level 1)
│   ├── 1.1 节 (level 2)
│   │   └── 1.1.1 小节 (level 3)
│   └── 1.2 节 (level 2)
└── 第二章 (level 1)
```

## 特殊处理

### 代码块内的标题

代码块中的 `#` 不应识别为标题：

```python
# 这不是标题，是 Python 注释
def func():
    pass
```

处理方法：先移除代码块再匹配标题

```python
def remove_code_blocks(content: str) -> str:
    # 移除 ```...``` 代码块
    content = re.sub(r'```[\s\S]*?```', '', content)
    # 移除行内代码
    content = re.sub(r'`[^`]+`', '', content)
    return content
```

### 水平线混淆

```markdown
###  三个#后跟空格可能是水平线
```

区分：水平线只有 `#`，没有内容

```python
# 排除纯 # 的行
if re.match(r'^#{1,6}\s*$', line):
    continue  # 不是标题
```

## 统计信息

```python
def analyze_headers(headers: list) -> dict:
    levels = [h['level'] for h in headers]
    return {
        'total': len(headers),
        'max_level': max(levels) if levels else 0,
        'level_distribution': {
            level: levels.count(level) 
            for level in range(1, 7)
        },
        'avg_header_spacing': len(content) / len(headers) if headers else 0
    }
```
