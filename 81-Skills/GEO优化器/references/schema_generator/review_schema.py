"""
Review Schema 生成器

生成 Review 和 AggregateRating 结构化数据
"""

from typing import Dict, Any, List, Optional
from .base_schema import BaseSchema, SchemaField


class ReviewSchema(BaseSchema):
    """
    Review Schema 生成器

    生成符合 Schema.org/Review 规范的结构化数据。
    """

    schema_type = "Review"

    def get_fields(self) -> List[SchemaField]:
        return [
            SchemaField('itemReviewed', 'object', required=True, description='被评价的项目'),
            SchemaField('reviewRating', 'object', required=True, description='评分'),
            SchemaField('author', 'object', required=True, description='作者'),
            SchemaField('reviewBody', 'string', required=False, description='评价内容'),
            SchemaField('datePublished', 'string', required=False, description='发布日期'),
            SchemaField('publisher', 'object', required=False, description='发布者'),
        ]

    def generate(self) -> Dict[str, Any]:
        """生成 Review Schema"""
        schema = self._build_base()

        # 被评价项目
        if item := self._get_value('itemReviewed'):
            schema['itemReviewed'] = self._build_item_reviewed(item)

        # 评分
        if rating := self._get_value('reviewRating'):
            schema['reviewRating'] = self._build_rating(rating)

        # 作者
        if author := self._get_value('author'):
            schema['author'] = self._build_author(author)

        # 其他字段
        for field in ['reviewBody', 'datePublished', 'headline']:
            if value := self._get_value(field):
                schema[field] = value

        # 发布者
        if publisher := self._get_value('publisher'):
            schema['publisher'] = {
                '@type': 'Organization',
                **publisher
            }

        return schema

    def _build_item_reviewed(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """构建被评价项目"""
        return {
            '@type': item.get('@type', 'Product'),
            'name': item.get('name', ''),
            'image': item.get('image', []),
        }

    def _build_rating(self, rating: Dict[str, Any]) -> Dict[str, Any]:
        """构建评分结构"""
        return {
            '@type': 'Rating',
            'ratingValue': str(rating.get('value', rating.get('ratingValue', '5'))),
            'bestRating': str(rating.get('best', rating.get('bestRating', '5'))),
            'worstRating': str(rating.get('worst', rating.get('worstRating', '1'))),
        }

    def _build_author(self, author: Dict[str, Any]) -> Dict[str, Any]:
        """构建作者结构"""
        if isinstance(author, str):
            return {
                '@type': 'Person',
                'name': author
            }
        return {
            '@type': author.get('@type', 'Person'),
            'name': author.get('name', ''),
        }


class AggregateRatingSchema(BaseSchema):
    """
    AggregateRating Schema 生成器

    用于产品或服务的聚合评分。
    """

    schema_type = "AggregateRating"

    def get_fields(self) -> List[SchemaField]:
        return [
            SchemaField('ratingValue', 'string', required=True, description='平均评分'),
            SchemaField('reviewCount', 'string', required=True, description='评价数量'),
            SchemaField('bestRating', 'string', required=False, description='最高分'),
            SchemaField('worstRating', 'string', required=False, description='最低分'),
        ]

    def generate(self) -> Dict[str, Any]:
        """生成 AggregateRating Schema"""
        schema = self._build_base()

        schema['ratingValue'] = str(self._get_value('ratingValue', '0'))
        schema['reviewCount'] = str(self._get_value('reviewCount', '0'))

        if best := self._get_value('bestRating', '5'):
            schema['bestRating'] = str(best)

        if worst := self._get_value('worstRating', '1'):
            schema['worstRating'] = str(worst)

        return schema
