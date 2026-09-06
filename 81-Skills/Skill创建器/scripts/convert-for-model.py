#!/usr/bin/env python3
"""
Model Converter for Universal Skills

将为核心联盟（Claude/Kimi/Cursor）设计的 Skill 转换为目标平台格式：
- GPT: Function Calling Schema
- MiniMax: 中文优化的系统提示

Usage:
    python convert-for-model.py ./my-skill --target gpt --output ./adapters/
    python convert-for-model.py ./my-skill --target minimax --output ./adapters/
"""

import os
import re
import json
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import yaml


CONVERSION_INPUT_ERRORS = (OSError, UnicodeError, yaml.YAMLError)


class SkillConverter:
    """Convert Universal Skill to target platform format"""
    
    def __init__(self, skill_path: Path):
        self.skill_path = Path(skill_path)
        self.skill_name = self.skill_path.name
        self.frontmatter: Dict = {}
        self.body: str = ""
        self.references: Dict[str, str] = {}
        
        self._load_skill()
    
    def _load_skill(self):
        """Load and parse the Skill"""
        skill_md = self.skill_path / "SKILL.md"
        if not skill_md.exists():
            raise FileNotFoundError(f"SKILL.md not found in {self.skill_path}")
        
        content = skill_md.read_text(encoding='utf-8')
        
        # Parse frontmatter
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                self.frontmatter = yaml.safe_load(parts[1]) or {}
                self.body = parts[2].strip()
        
        # Load references if exist
        refs_dir = self.skill_path / "references"
        if refs_dir.exists():
            for ref_file in refs_dir.glob("*.md"):
                self.references[ref_file.name] = ref_file.read_text(encoding='utf-8')
    
    def convert_to_gpt(self) -> Dict:
        """
        Convert Skill to GPT Function Calling format
        
        Returns:
            Dictionary containing function schema and system prompt
        """
        name = self.frontmatter.get('name', self.skill_name)
        description = self.frontmatter.get('description', '')
        
        # Build function schema
        function_schema = {
            "name": f"use_{name.replace('-', '_')}",
            "description": self._extract_short_description(description),
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "The user's specific task or request"
                    },
                    "context": {
                        "type": "string",
                        "description": "Additional context or constraints (optional)"
                    }
                },
                "required": ["task"]
            }
        }
        
        # Build system prompt (inline all content since GPT doesn't have progressive disclosure)
        system_prompt = self._build_gpt_system_prompt()
        
        return {
            "type": "function",
            "function": function_schema,
            "system_prompt": system_prompt,
            "usage": {
                "description": f"When the user asks about {name}, call this function",
                "example": f'use_{name.replace("-", "_")}(task="help me with...")'
            }
        }
    
    def convert_to_minimax(self) -> Dict:
        """
        Convert Skill to MiniMax format with Chinese optimization
        
        Returns:
            Dictionary containing optimized prompt and triggers
        """
        name = self.frontmatter.get('name', self.skill_name)
        description = self.frontmatter.get('description', '')
        
        # Optimize for Chinese
        chinese_description = self._optimize_for_chinese(description)
        chinese_body = self._optimize_for_chinese(self.body)
        
        # Expand keywords with Chinese synonyms
        triggers = self._expand_chinese_triggers(description)
        
        # Build system prompt
        system_prompt = f"""【技能：{name}】

{chinese_description}

触发条件：
{triggers}

核心能力：
{chinese_body}

当用户请求符合触发条件时，激活此技能并提供专业支持。
"""
        
        return {
            "type": "system_prompt",
            "content": system_prompt,
            "triggers": triggers,
            "notes": "Optimized for Chinese language models"
        }
    
    def _extract_short_description(self, description: str, max_length: int = 200) -> str:
        """Extract a shorter description for function schema"""
        # Take first sentence or first max_length chars
        sentences = re.split(r'[.!?。！？]\s*', description)
        short_desc = sentences[0] if sentences else description
        
        if len(short_desc) > max_length:
            short_desc = short_desc[:max_length].rsplit(' ', 1)[0] + '...'
        
        return short_desc.strip()
    
    def _build_gpt_system_prompt(self) -> str:
        """Build system prompt for GPT (inline all references)"""
        prompt_parts = []
        
        # Add main body
        prompt_parts.append(f"# {self.frontmatter.get('name', 'Skill')}\n")
        prompt_parts.append(self.body)
        
        # Inline critical references
        if self.references:
            prompt_parts.append("\n## Additional Reference Information\n")
            for name, content in self.references.items():
                # Only include essential references to save tokens
                if any(keyword in name.lower() for keyword in ['guide', 'pattern', 'api']):
                    prompt_parts.append(f"\n### From {name}\n")
                    # Truncate long references
                    if len(content) > 2000:
                        content = content[:2000] + "\n... [truncated]"
                    prompt_parts.append(content)
        
        return '\n'.join(prompt_parts)
    
    def _optimize_for_chinese(self, text: str) -> str:
        """Optimize text for Chinese language model"""
        # Basic optimizations
        optimizations = [
            (r'SKILL\.md', '技能文档'),
            (r'references/', '参考文档/'),
            (r'scripts/', '脚本/'),
            (r'frontmatter', '头部元数据'),
        ]
        
        result = text
        for pattern, replacement in optimizations:
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
        
        return result
    
    def _expand_chinese_triggers(self, description: str) -> List[str]:
        """Expand trigger keywords with Chinese synonyms"""
        # Extract keywords from description
        keywords = set()
        
        # Common English-Chinese mappings
        translations = {
            'pdf': ['PDF', 'pdf', 'PDF文档', 'pdf文件'],
            'document': ['文档', '文件', '资料'],
            'process': ['处理', '操作', '加工', '转换'],
            'analyze': ['分析', '解析', '统计'],
            'convert': ['转换', '转化', '改变'],
            'create': ['创建', '建立', '生成'],
            'help': ['帮助', '协助', '辅助'],
        }
        
        # Find keywords in description
        desc_lower = description.lower()
        for eng, ch_list in translations.items():
            if eng in desc_lower:
                keywords.update(ch_list)
        
        # Add direct Chinese words
        chinese_words = re.findall(r'[\u4e00-\u9fff]+', description)
        keywords.update(chinese_words)
        
        return list(keywords) if keywords else ['文档', '处理']


def main():
    parser = argparse.ArgumentParser(
        description='Convert Universal Skill to target platform format'
    )
    parser.add_argument('skill_path', type=Path, help='Path to skill directory')
    parser.add_argument('--target', choices=['gpt', 'minimax', 'openai'], 
                       required=True, help='Target platform')
    parser.add_argument('--output', type=Path, 
                       help='Output directory (default: skill-path/adapters/)')
    parser.add_argument('--format', choices=['json', 'yaml', 'both'], 
                       default='both', help='Output format')
    
    args = parser.parse_args()
    
    # Validate skill path
    if not args.skill_path.exists():
        print(f"❌ Error: Skill path not found: {args.skill_path}")
        return 1
    
    if not (args.skill_path / "SKILL.md").exists():
        print(f"❌ Error: SKILL.md not found in {args.skill_path}")
        return 1
    
    # Determine output path
    output_dir = args.output or args.skill_path / "adapters"
    
    try:
        output_dir.mkdir(parents=True, exist_ok=True)

        # Load and convert
        converter = SkillConverter(args.skill_path)
        skill_name = converter.frontmatter.get('name', args.skill_path.name)
        
        print(f"🔄 Converting '{skill_name}' to {args.target.upper()} format...\n")
        
        # Perform conversion
        if args.target in ['gpt', 'openai']:
            result = converter.convert_to_gpt()
            target_name = 'gpt'
        else:
            result = converter.convert_to_minimax()
            target_name = 'minimax'
        
        # Save output
        output_base = output_dir / f"{target_name}-adapter"
        
        if args.format in ['json', 'both']:
            json_path = output_base.with_suffix('.json')
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"✅ JSON: {json_path}")
        
        if args.format in ['yaml', 'both']:
            yaml_path = output_base.with_suffix('.yaml')
            with open(yaml_path, 'w', encoding='utf-8') as f:
                yaml.dump(result, f, allow_unicode=True, sort_keys=False)
            print(f"✅ YAML: {yaml_path}")
        
        # Print summary
        print(f"\n📊 Conversion Summary:")
        print(f"   Skill: {skill_name}")
        print(f"   Target: {args.target.upper()}")
        print(f"   Body length: {len(converter.body)} chars")
        print(f"   References: {len(converter.references)} files")
        
        if args.target in ['gpt', 'openai']:
            print(f"\n📝 Usage:")
            print(f"   Function name: {result['function']['name']}")
            print(f"   Add the function schema to your GPT's functions list")
            print(f"   Include the system_prompt in your system message")
        else:
            print(f"\n📝 Usage:")
            print(f"   Include the system_prompt in your MiniMax system message")
            print(f"   Triggers: {', '.join(result['triggers'][:5])}...")
        
        return 0
        
    except CONVERSION_INPUT_ERRORS as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit(main())
