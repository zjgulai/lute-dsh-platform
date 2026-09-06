"""
FAQ Schema 生成器

生成 FAQPage 结构化数据，用于 People Also Ask 优化和直接答案展示
"""

from typing import Dict, Any, List, Optional
from .base_schema import BaseSchema, SchemaField


class FAQSchema(BaseSchema):
    """
    FAQPage Schema 生成器

    生成符合 Schema.org/FAQPage 规范的结构化数据，
    帮助页面在搜索结果中获取 FAQ 富媒体展示和 PAA 占位。
    """

    schema_type = "FAQPage"

    def get_fields(self) -> List[SchemaField]:
        return [
            SchemaField('questions', 'array', required=True, description='FAQ问题列表'),
        ]

    def generate(self) -> Dict[str, Any]:
        """生成 FAQPage Schema"""
        schema = self._build_base()

        questions = self._get_value('questions', [])

        schema['mainEntity'] = [
            self._build_question(q) for q in questions
        ]

        return schema

    def _build_question(self, q: Dict[str, Any]) -> Dict[str, Any]:
        """构建单个 Question 结构"""
        return {
            '@type': 'Question',
            'name': q.get('question', q.get('q', '')),
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': q.get('answer', q.get('a', ''))
            }
        }

    def add_question(self, question: str, answer: str):
        """
        添加单个问题

        Args:
            question: 问题文本
            answer: 答案文本
        """
        if 'questions' not in self.data:
            self.data['questions'] = []

        self.data['questions'].append({
            'question': question,
            'answer': answer
        })

    def generate_from_content(self, content: str, max_questions: int = 5) -> 'FAQSchema':
        """
        从内容中提取常见问题（简化实现）

        实际实现应使用 NLP 或 LLM 提取。
        此版本返回模拟数据用于测试。

        Args:
            content: 页面内容
            max_questions: 最大问题数

        Returns:
            FAQSchema 实例
        """
        # 实际实现应分析内容生成相关问题
        # 这里提供框架，具体实现依赖 NLP
        mock_questions = [
            {
                'question': f'关于此内容的常见问题 #{i+1}',
                'answer': f'这是问题 #{i+1} 的答案，基于内容分析生成。'
            }
            for i in range(min(max_questions, 3))
        ]

        self.data['questions'] = mock_questions
        return self

    def validate(self) -> bool:
        """验证 FAQ 数据"""
        valid = super().validate()

        questions = self._get_value('questions', [])
        if not questions:
            self._errors.append("FAQ 需要至少一个问题")
            return False

        for i, q in enumerate(questions):
            if not q.get('question') and not q.get('q'):
                self._errors.append(f"问题 #{i+1} 缺少问题文本")
            if not q.get('answer') and not q.get('a'):
                self._errors.append(f"问题 #{i+1} 缺少答案文本")

        return len(self._errors) == 0
