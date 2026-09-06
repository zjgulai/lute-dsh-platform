"""
Schema 生成器主模块

提供统一的 Schema 生成接口
"""

from typing import Dict, Any, Optional, Type
from .base_schema import BaseSchema
from .product_schema import ProductSchema
from .faq_schema import FAQSchema
from .howto_schema import HowToSchema, HowToSectionSchema
from .review_schema import ReviewSchema, AggregateRatingSchema
from .local_business_schema import LocalBusinessSchema, RestaurantSchema


# Schema 类型映射
_SCHEMA_TYPES: Dict[str, Type[BaseSchema]] = {
    'product': ProductSchema,
    'faq': FAQSchema,
    'howto': HowToSchema,
    'howto_section': HowToSectionSchema,
    'review': ReviewSchema,
    'aggregate_rating': AggregateRatingSchema,
    'local_business': LocalBusinessSchema,
    'restaurant': RestaurantSchema,
}


class SchemaGenerator:
    """
    Schema 生成器

    提供统一的接口生成各种类型的结构化数据。
    """

    def __init__(self):
        self.schemas: Dict[str, BaseSchema] = {}

    def add_schema(self, schema_type: str, data: Dict[str, Any], key: Optional[str] = None):
        """
        添加 Schema

        Args:
            schema_type: Schema 类型
            data: Schema 数据
            key: 可选的键名，用于后续引用
        """
        schema_class = _SCHEMA_TYPES.get(schema_type.lower())
        if not schema_class:
            raise ValueError(f"Unknown schema type: {schema_type}")

        schema = schema_class(data)
        key = key or schema_type
        self.schemas[key] = schema

        return schema

    def generate(self, key: Optional[str] = None) -> Dict[str, Any]:
        """
        生成 Schema

        Args:
            key: 指定 Schema 的键名，None 则生成所有

        Returns:
            Schema 数据字典
        """
        if key:
            schema = self.schemas.get(key)
            if not schema:
                raise KeyError(f"Schema not found: {key}")
            return schema.generate()

        return {k: s.generate() for k, s in self.schemas.items()}

    def generate_json_ld(self, key: Optional[str] = None, pretty: bool = True) -> str:
        """
        生成 JSON-LD 字符串

        Args:
            key: 指定 Schema 的键名
            pretty: 是否格式化

        Returns:
            JSON-LD 字符串
        """
        if key:
            schema = self.schemas.get(key)
            if not schema:
                raise KeyError(f"Schema not found: {key}")
            return schema.to_json_ld(pretty=pretty)

        # 生成所有并合并
        import json
        schemas = [s.generate() for s in self.schemas.values()]

        if len(schemas) == 1:
            return json.dumps(schemas[0], indent=2 if pretty else None, ensure_ascii=False)

        # 多个 schema 使用 @graph
        graph = {
            "@context": "https://schema.org",
            "@graph": schemas
        }
        return json.dumps(graph, indent=2 if pretty else None, ensure_ascii=False)

    def generate_html(self, key: Optional[str] = None, pretty: bool = True) -> str:
        """
        生成 HTML script 标签

        Args:
            key: 指定 Schema 的键名
            pretty: 是否格式化

        Returns:
            HTML script 标签字符串
        """
        json_ld = self.generate_json_ld(key, pretty=pretty)
        return f'<script type="application/ld+json">\n{json_ld}\n</script>'

    def validate(self, key: Optional[str] = None) -> Dict[str, bool]:
        """
        验证 Schema

        Args:
            key: 指定 Schema 的键名

        Returns:
            验证结果字典
        """
        if key:
            schema = self.schemas.get(key)
            if not schema:
                return {key: False}
            return {key: schema.validate()}

        return {k: s.validate() for k, s in self.schemas.items()}

    def get_errors(self, key: Optional[str] = None) -> Dict[str, list]:
        """
        获取验证错误

        Args:
            key: 指定 Schema 的键名

        Returns:
            错误信息字典
        """
        if key:
            schema = self.schemas.get(key)
            if not schema:
                return {key: ["Schema not found"]}
            return {key: schema.get_errors()}

        return {k: s.get_errors() for k, s in self.schemas.items()}

    @classmethod
    def list_types(cls) -> Dict[str, str]:
        """列出所有支持的 Schema 类型"""
        return {
            name: schema_class.__doc__.split('\n')[0] if schema_class.__doc__ else "No description"
            for name, schema_class in _SCHEMA_TYPES.items()
        }


def generate_all_schemas(
    product_data: Optional[Dict] = None,
    faq_data: Optional[Dict] = None,
    howto_data: Optional[Dict] = None,
    local_business_data: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    批量生成多种 Schema

    Args:
        product_data: 产品数据
        faq_data: FAQ 数据
        howto_data: HowTo 数据
        local_business_data: 本地商家数据

    Returns:
        生成的 Schema 字典
    """
    generator = SchemaGenerator()

    if product_data:
        generator.add_schema('product', product_data)
    if faq_data:
        generator.add_schema('faq', faq_data)
    if howto_data:
        generator.add_schema('howto', howto_data)
    if local_business_data:
        generator.add_schema('local_business', local_business_data)

    return generator.generate()
