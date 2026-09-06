# 跨模型适配指南

## 概述

本文档说明如何将为核心联盟（Claude/Kimi/Cursor）设计的 Skill 桥接到其他平台（GPT、MiniMax）。

### 核心联盟 vs 桥接平台

| 类型 | 平台 | 支持方式 |
|------|------|----------|
| 核心联盟 | Claude, Kimi, Cursor | 原生支持，直接使用 |
| 桥接平台 | GPT, MiniMax | 转换工具适配 |

### 桥接的权衡

**优势**:
- 扩展 Skill 的可用范围
- 复用核心设计

**限制**:
- 无原生渐进式披露（GPT/MiniMax）
- 可能需要额外配置
- 功能可能受限

### 设计理念

**核心联盟优先**: 为核心联盟设计最佳体验，桥接平台作为扩展。

**务实的转换**: 保持核心语义，适配目标平台机制。

## 核心联盟：原生支持

### Claude

Claude 提供完整的原生 Skill 系统支持。

**特性**:
- 完整 YAML frontmatter 解析
- 原生渐进式披露（3层）
- Scripts 直接执行
- References 按需加载
- MCP 集成支持

**最佳实践**:
1. 充分利用渐进式披露
2. 考虑使用 MCP 增强工作流
3. 利用 Hooks 进行验证

### Kimi

Kimi 提供与 Claude 高度兼容的 Skill 系统（80%+ 兼容）。

**特性**:
- 完整 YAML frontmatter 解析
- 原生渐进式披露
- Scripts 直接执行
- 更强调简洁性

**差异点**:
- version 字段不强制
- 对 Token 效率要求更高
- 简洁性优先

**优化建议**:
1. 极致简洁，删除所有冗余
2. 优先使用缩写（首次解释）
3. 严格控制 SKILL.md 长度

### Cursor

Cursor 通过 Claude API 原生支持 Claude Skills。

**支持方式**:
- Cursor 使用 Claude 作为 AI 后端
- 支持 `.cursorrules` 文件（类似 Skill）
- 可在设置中加载 Skill

**使用方法**:
1. 在 Cursor 设置 → AI Rules 中添加 Skill 路径
2. 或在项目根目录创建 `.cursorrules` 文件
3. Skill 内容自动生效

**注意事项**:
- 与 Claude 完全兼容
- 可能需要 Cursor 特定配置
- 支持通过 Claude API 的所有功能

## Kimi 适配

### 原生支持

Kimi 对 Universal Skill Schema 提供完整原生支持。

**特性**:
- 完整 YAML frontmatter 解析
- 原生渐进式披露
- Scripts 直接执行
- 简洁性优先原则

**差异点**:
- 不强制 version 字段
- 更强调 Token 效率
- 支持多层 Skill 加载

### 优化建议

1. **极致简洁**
   ```markdown
   # Kimi 优化版本
   
   ## 核心指令
   1. 验证输入
   2. 执行操作
   3. 返回结果
   
   ## 详情
   见 references/guide.md
   ```

2. **Token 效率**
   - 删除所有冗余词语
   - 使用缩写（在首次出现时解释）
   - 优先使用列表而非段落

3. **加载优先级**
   Kimi 支持多层 Skill 加载：
   ```
   内置 Skills → 用户 Skills → 项目 Skills
   ```

## GPT 桥接

### 桥接策略

GPT 没有原生 Skill 系统。通过 Function Calling 和系统提示注入实现桥接。

**重要**: 这是桥接（Bridge），不是原生支持。需要权衡以下限制：
- 无原生渐进式披露（所有内容一次性加载）
- 依赖 Function Calling 支持
- 可能需要额外配置

**Option 1: Function Calling Schema**（推荐）

将 Skill description 转换为 Function Schema：

```python
def skill_to_function_schema(skill_path):
    """Convert Universal Skill to GPT Function Schema"""
    
    skill = load_skill(skill_path)
    
    return {
        "name": f"use_{skill['name']}",
        "description": skill['description'],
        "parameters": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "用户的具体请求"
                },
                "context": {
                    "type": "string",
                    "description": "额外上下文信息"
                }
            },
            "required": ["task"]
        }
    }
```

**使用方式**:
```python
import openai

functions = [skill_to_function_schema("./my-skill/")]

response = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "处理这个PDF"}],
    functions=functions,
    function_call="auto"
)
```

**Option 2: 系统提示注入**

将 Skill 内容注入系统提示：

```python
def skill_to_system_prompt(skill_path):
    """Convert Universal Skill to GPT system prompt"""
    
    skill = load_skill(skill_path)
    
    prompt = f"""
你拥有以下专业技能：

【{skill['name']}】
{skill['description']}

核心指令：
{extract_core_instructions(skill['body'])}

当用户请求与该技能相关时，请遵循上述指令。
"""
    return prompt
```

### 渐进式披露模拟

GPT 不原生支持渐进式披露，需要手动实现：

```python
class GPTSkillAdapter:
    def __init__(self, skill_path):
        self.skill = load_skill(skill_path)
        self.context_loaded = False
    
    def should_trigger(self, user_message):
        """判断是否应该触发 Skill"""
        # 使用 keywords 和 phrases 匹配
        triggers = self.skill['triggers']
        
        for keyword in triggers['keywords']:
            if keyword in user_message:
                return True
        
        return False
    
    def load_context(self):
        """加载 Skill 上下文"""
        if not self.context_loaded:
            # 加载 SKILL.md 内容到提示
            self.context_loaded = True
            return self.skill['body']
        return ""
    
    def get_system_prompt(self, user_message):
        """获取当前对话的系统提示"""
        if self.should_trigger(user_message):
            base_prompt = f"Skill: {self.skill['name']}\n"
            base_prompt += f"Trigger: {self.skill['description']}\n"
            base_prompt += self.load_context()
            return base_prompt
        return ""
```

### 限制与解决

| 限制 | 影响 | 解决方案 |
|------|------|----------|
| 无原生渐进式披露 | 上下文占用大 | 手动实现加载控制 |
| Function 数量限制 | 多 Skill 冲突 | Skill 聚合或选择 |
| 无 script 执行 | 无法直接运行脚本 | 模拟执行或外部调用 |

## MiniMax 桥接

### 桥接策略

MiniMax 没有原生 Skill 系统。通过系统提示注入和中文化优化实现桥接。

**重要**: 这是桥接（Bridge），不是原生支持。

**特点**:
- 针对中文场景优化
- 扩展同义词覆盖
- 调整语序符合中文习惯

### 桥接实现

MiniMax 与 GPT 类似，通过系统提示注入实现。

**中文优化**:

1. **触发词本地化**
   ```yaml
   # 原始
triggers:
  keywords: ["PDF", "document"]
  
# MiniMax 优化
triggers:
  keywords: ["PDF", "文档", "pdf文件", "文档处理"]
  ```

2. **同义词扩展**
   ```yaml
   triggers:
     phrases:
       - "处理PDF"
       - "提取PDF内容"
       - "PDF转Word"
       - "转换PDF文档"
       - "解析pdf文件"
   ```

### 系统提示模板

```python
def skill_to_minimax_prompt(skill_path):
    """Convert Universal Skill to MiniMax system prompt"""
    
    skill = load_skill(skill_path)
    
    prompt = f"""
【技能：{skill['name']}】

{skill['description']}

触发条件：
{format_triggers_for_chinese(skill['triggers'])}

核心能力：
{extract_core_capabilities(skill['body'])}

当用户请求符合触发条件时，请激活此技能并提供专业支持。
"""
    return prompt
```

### 中文特定优化

1. **模糊匹配支持**
   ```python
   def should_trigger_chinese(user_message, triggers):
       """支持中文模糊匹配"""
       # 同义词扩展
       synonyms = {
           "PDF": ["pdf", "PDF文档", "pdf文件"],
           "处理": ["操作", "编辑", "转换"]
       }
       
       for keyword in triggers['keywords']:
           if keyword in user_message:
               return True
           # 检查同义词
           if keyword in synonyms:
               for syn in synonyms[keyword]:
                   if syn in user_message:
                       return True
       
       return False
   ```

2. **上下文感知**
   ```python
   class ChineseSkillAdapter:
       def __init__(self, skill):
           self.skill = skill
           self.conversation_context = []
       
       def should_trigger(self, message):
           # 结合当前消息和上下文
           context = " ".join(self.conversation_context[-3:])
           combined = context + " " + message
           
           return self._check_triggers(combined)
   ```

## 通用适配工具

### 自动转换脚本

```python
#!/usr/bin/env python3
# scripts/convert-for-model.py

import argparse
import json
import yaml
from pathlib import Path

MODEL_ADAPTERS = {
    'claude': 'native',
    'kimi': 'native',
    'gpt': 'function_calling',
    'minimax': 'prompt_injection'
}

def convert_skill(skill_path: Path, target_model: str) -> dict:
    """Convert Universal Skill to model-specific format"""
    
    skill = load_universal_skill(skill_path)
    
    if target_model in ['claude', 'kimi']:
        # 原生支持，直接返回
        return skill
    
    elif target_model == 'gpt':
        return convert_to_gpt_function(skill)
    
    elif target_model == 'minimax':
        return convert_to_minimax_prompt(skill)
    
    else:
        raise ValueError(f"Unsupported model: {target_model}")

def convert_to_gpt_function(skill: dict) -> dict:
    """Convert to GPT Function Calling format"""
    return {
        "type": "function",
        "function": {
            "name": f"use_{skill['name']}",
            "description": skill['description'],
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "用户的具体任务请求"
                    }
                },
                "required": ["task"]
            }
        },
        "system_prompt_extension": skill.get('body', '')
    }

def convert_to_minimax_prompt(skill: dict) -> dict:
    """Convert to MiniMax system prompt format"""
    
    # 扩展中文触发词
    chinese_keywords = expand_chinese_keywords(skill['triggers']['keywords'])
    
    prompt = f"""
【技能：{skill['name']}】

{skill['description']}

触发关键词：{', '.join(chinese_keywords)}

核心指令：
{skill.get('body', '')}
"""
    
    return {
        "type": "system_prompt",
        "content": prompt,
        "triggers": chinese_keywords
    }

def expand_chinese_keywords(keywords: list) -> list:
    """扩展中文同义词"""
    synonyms = {
        'PDF': ['PDF', 'pdf', 'PDF文档', 'pdf文件', '便携文档'],
        'document': ['文档', '文件', '资料'],
        'process': ['处理', '操作', '加工', '转换'],
    }
    
    expanded = []
    for kw in keywords:
        expanded.append(kw)
        if kw in synonyms:
            expanded.extend(synonyms[kw])
    
    return list(set(expanded))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('skill_path', type=Path)
    parser.add_argument('--target', choices=MODEL_ADAPTERS.keys(), required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    
    result = convert_skill(args.skill_path, args.target)
    
    output = args.output or args.skill_path / f"adapter-{args.target}.json"
    
    with open(output, 'w') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    
    print(f"Converted to {args.target} format: {output}")

if __name__ == '__main__':
    main()
```

### 使用示例

```bash
# 转换为 GPT Function Calling 格式
python scripts/convert-for-model.py ./my-skill/ --target gpt --output ./my-skill/gpt-adapter.json

# 转换为 MiniMax 格式
python scripts/convert-for-model.py ./my-skill/ --target minimax --output ./my-skill/minimax-adapter.json
```

## 兼容性测试

### 跨模型一致性测试

```python
# tests/test_cross_model.py

def test_skill_consistency(skill_path):
    """Test skill behavior consistency across models"""
    
    test_queries = [
        "触发查询1",
        "触发查询2",
        "非触发查询1"
    ]
    
    results = {}
    
    for model in ['claude', 'kimi', 'gpt', 'minimax']:
        adapter = load_adapter(skill_path, model)
        results[model] = []
        
        for query in test_queries:
            should_trigger = adapter.should_trigger(query)
            results[model].append({
                'query': query,
                'triggered': should_trigger
            })
    
    # 检查一致性
    for query in test_queries:
        trigger_results = [
            results[model][i]['triggered'] 
            for model in results
            for i, q in enumerate(test_queries) 
            if q == query
        ]
        
        # 至少 75% 一致性
        consistency = sum(trigger_results) / len(trigger_results)
        if consistency < 0.75:
            print(f"Warning: Low consistency for '{query}': {consistency}")
    
    return results
```

## 最佳实践

### 1. 渐进适配

不要一次性适配所有模型，建议顺序：
1. Claude/Kimi（原生支持）
2. GPT（Function Calling）
3. MiniMax（中文优化）

### 2. 触发词优化

为每个模型优化触发词：
```yaml
# universal-skill.md
triggers:
  keywords: ["PDF", "文档"]
  
# gpt-adapter.json
{
  "triggers": ["process PDF", "handle document", "PDF conversion"]
}

# minimax-adapter.json
{
  "triggers": ["PDF", "pdf", "文档", "文件处理"]
}
```

### 3. 持续验证

定期运行跨模型测试：
```bash
python tests/test_cross_model.py --skill ./my-skill/ --all-models
```

### 4. 版本管理

为不同模型维护适配版本：
```
skill-name/
├── SKILL.md              # 通用定义
├── adapters/
│   ├── gpt-v1.json
│   ├── minimax-v1.json
│   └── README.md
└── versions.json
```

---

## 参考

- [Claude Skills 文档](https://docs.claude.com/skills)
- [Kimi Skills 文档](https://docs.moonshot.cn/skills)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [MiniMax API 文档](https://docs.minimaxi.com/)
