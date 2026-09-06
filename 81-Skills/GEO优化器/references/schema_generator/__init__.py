"""
结构化数据生成器模块

生成各种 Schema.org 结构化数据标记，提升 AI 搜索可见性。

Usage:
    from schema_generator import ProductSchema, FAQSchema

    product = ProductSchema({
        'name': 'Product Name',
        'price': '99.99',
        'currency': 'USD'
    })
    json_ld = product.generate()
"""

from .base_schema import BaseSchema, SchemaField
from .product_schema import ProductSchema
from .faq_schema import FAQSchema
from .howto_schema import HowToSchema
from .review_schema import ReviewSchema
from .local_business_schema import LocalBusinessSchema
from .generator import SchemaGenerator, generate_all_schemas

__all__ = [
    # Base
    'BaseSchema',
    'SchemaField',
    # Schema types
    'ProductSchema',
    'FAQSchema',
    'HowToSchema',
    'ReviewSchema',
    'LocalBusinessSchema',
    # Generator
    'SchemaGenerator',
    'generate_all_schemas',
]
