"""
HowTo Schema 生成器

生成 HowTo 结构化数据，用于步骤指南内容的富媒体展示
"""

from typing import Dict, Any, List, Optional
from .base_schema import BaseSchema, SchemaField


class HowToSchema(BaseSchema):
    """
    HowTo Schema 生成器

    生成符合 Schema.org/HowTo 规范的结构化数据，
    帮助指南内容在搜索结果中获取步骤展示和富媒体结果。
    """

    schema_type = "HowTo"

    def get_fields(self) -> List[SchemaField]:
        return [
            SchemaField('name', 'string', required=True, description='指南名称'),
            SchemaField('description', 'string', required=True, description='指南描述'),
            SchemaField('image', 'string', required=False, description='指南图片URL'),
            SchemaField('totalTime', 'string', required=False, description='总耗时 (ISO 8601格式)'),
            SchemaField('estimatedCost', 'object', required=False, description='预估成本'),
            SchemaField('supply', 'array', required=False, description='所需材料'),
            SchemaField('tool', 'array', required=False, description='所需工具'),
            SchemaField('step', 'array', required=True, description='步骤列表'),
        ]

    def generate(self) -> Dict[str, Any]:
        """生成 HowTo Schema"""
        schema = self._build_base()

        # 基本信息
        schema['name'] = self._get_value('name')
        schema['description'] = self._get_value('description')

        # 可选字段
        if image := self._get_value('image'):
            schema['image'] = {
                '@type': 'ImageObject',
                'url': image
            }

        if total_time := self._get_value('totalTime'):
            schema['totalTime'] = total_time

        if cost := self._get_value('estimatedCost'):
            schema['estimatedCost'] = {
                '@type': 'MonetaryAmount',
                'currency': cost.get('currency', 'USD'),
                'value': str(cost.get('value', '0'))
            }

        # 材料
        if supplies := self._get_value('supply'):
            schema['supply'] = [
                {'@type': 'HowToSupply', 'name': s} if isinstance(s, str) else s
                for s in supplies
            ]

        # 工具
        if tools := self._get_value('tool'):
            schema['tool'] = [
                {'@type': 'HowToTool', 'name': t} if isinstance(t, str) else t
                for t in tools
            ]

        # 步骤
        if steps := self._get_value('step'):
            schema['step'] = [self._build_step(s) for s in steps]

        return schema

    def _build_step(self, step: Dict[str, Any]) -> Dict[str, Any]:
        """构建单个 Step 结构"""
        step_schema = {
            '@type': 'HowToStep',
            'name': step.get('name', step.get('title', '')),
            'text': step.get('text', step.get('description', '')),
        }

        if url := step.get('url'):
            step_schema['url'] = url

        if image := step.get('image'):
            step_schema['image'] = {
                '@type': 'ImageObject',
                'url': image
            }

        return step_schema

    def add_step(self, name: str, text: str, image: Optional[str] = None):
        """
        添加单个步骤

        Args:
            name: 步骤名称
            text: 步骤详细说明
            image: 步骤图片URL（可选）
        """
        if 'step' not in self.data:
            self.data['step'] = []

        step = {'name': name, 'text': text}
        if image:
            step['image'] = image

        self.data['step'].append(step)


class HowToSectionSchema(BaseSchema):
    """
    HowTo with Sections Schema 生成器

    用于复杂指南，包含多个章节。
    """

    schema_type = "HowTo"

    def get_fields(self) -> List[SchemaField]:
        return [
            SchemaField('name', 'string', required=True, description='指南名称'),
            SchemaField('description', 'string', required=True, description='指南描述'),
            SchemaField('sections', 'array', required=True, description='章节列表'),
        ]

    def generate(self) -> Dict[str, Any]:
        """生成带章节的 HowTo Schema"""
        schema = self._build_base()

        schema['name'] = self._get_value('name')
        schema['description'] = self._get_value('description')

        if sections := self._get_value('sections'):
            schema['step'] = []
            for section in sections:
                section_steps = section.get('steps', [])
                for step in section_steps:
                    full_step = {
                        'name': f"{section.get('name', '')}: {step.get('name', '')}",
                        'text': step.get('text', ''),
                    }
                    if image := step.get('image'):
                        full_step['image'] = image
                    schema['step'].append(full_step)

        return schema
