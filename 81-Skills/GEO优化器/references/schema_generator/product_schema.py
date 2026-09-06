"""
Product Schema 生成器

生成产品结构化数据，支持 AI Shopping 和搜索结果富媒体展示
"""

from typing import Dict, Any, List, Optional
from .base_schema import BaseSchema, SchemaField


class ProductSchema(BaseSchema):
    """
    Product Schema 生成器

    生成符合 Schema.org/Product 规范的结构化数据，
    用于提升产品页面在搜索引擎和 AI 购物结果中的可见性。
    """

    schema_type = "Product"

    def get_fields(self) -> List[SchemaField]:
        return [
            SchemaField('name', 'string', required=True, description='产品名称'),
            SchemaField('description', 'string', required=False, description='产品描述'),
            SchemaField('image', 'array', required=False, description='产品图片URL列表'),
            SchemaField('sku', 'string', required=False, description='SKU编码'),
            SchemaField('brand', 'object', required=False, description='品牌信息'),
            SchemaField('offers', 'object', required=False, description='价格和供应信息'),
            SchemaField('aggregateRating', 'object', required=False, description='聚合评分'),
            SchemaField('review', 'array', required=False, description='评价列表'),
            SchemaField('color', 'string', required=False, description='颜色'),
            SchemaField('material', 'string', required=False, description='材质'),
            SchemaField('weight', 'object', required=False, description='重量信息'),
            SchemaField('gtin', 'string', required=False, description='全球贸易项目编号'),
            SchemaField('mpn', 'string', required=False, description='制造商零件编号'),
        ]

    def generate(self) -> Dict[str, Any]:
        """生成 Product Schema"""
        schema = self._build_base()

        # 基本信息
        schema['name'] = self._get_value('name')

        if description := self._get_value('description'):
            schema['description'] = description

        # 图片
        if image := self._get_value('image'):
            if isinstance(image, str):
                schema['image'] = [image]
            elif isinstance(image, list):
                schema['image'] = image

        # SKU
        if sku := self._get_value('sku'):
            schema['sku'] = sku

        # 品牌
        if brand := self._get_value('brand'):
            if isinstance(brand, str):
                schema['brand'] = {
                    '@type': 'Brand',
                    'name': brand
                }
            elif isinstance(brand, dict):
                schema['brand'] = {
                    '@type': 'Brand',
                    **brand
                }

        # 价格和供应
        if offers := self._get_value('offers'):
            schema['offers'] = self._build_offers(offers)

        # 聚合评分
        if rating := self._get_value('aggregateRating'):
            schema['aggregateRating'] = self._build_aggregate_rating(rating)

        # 评价
        if reviews := self._get_value('review'):
            schema['review'] = self._build_reviews(reviews)

        # 其他属性
        for field in ['color', 'material', 'gtin', 'mpn']:
            if value := self._get_value(field):
                schema[field] = value

        # 重量
        if weight := self._get_value('weight'):
            schema['weight'] = {
                '@type': 'QuantitativeValue',
                **weight
            }

        return schema

    def _build_offers(self, offers: Dict[str, Any]) -> Dict[str, Any]:
        """构建 Offers 结构"""
        offer_schema = {
            '@type': 'Offer',
            'url': offers.get('url', self._get_value('url', '')),
            'priceCurrency': offers.get('currency', 'USD'),
            'price': str(offers.get('price', '0.00')),
            'availability': offers.get('availability', 'https://schema.org/InStock'),
            'itemCondition': offers.get('condition', 'https://schema.org/NewCondition'),
        }

        # 价格有效期
        if valid_until := offers.get('priceValidUntil'):
            offer_schema['priceValidUntil'] = valid_until

        # 配送信息
        if shipping := offers.get('shippingDetails'):
            offer_schema['shippingDetails'] = {
                '@type': 'OfferShippingDetails',
                'shippingRate': {
                    '@type': 'MonetaryAmount',
                    'value': str(shipping.get('cost', '0.00')),
                    'currency': offer_schema['priceCurrency']
                }
            }

        # 退货政策
        if returns := offers.get('hasMerchantReturnPolicy'):
            offer_schema['hasMerchantReturnPolicy'] = {
                '@type': 'MerchantReturnPolicy',
                'returnPolicyCategory': returns.get('category', 'https://schema.org/MerchantReturnFiniteReturnWindow'),
                'merchantReturnDays': returns.get('days', 30),
                'returnMethod': returns.get('method', 'https://schema.org/ReturnByMail'),
                'returnFees': returns.get('fees', 'https://schema.org/FreeReturn')
            }

        return offer_schema

    def _build_aggregate_rating(self, rating: Dict[str, Any]) -> Dict[str, Any]:
        """构建聚合评分结构"""
        return {
            '@type': 'AggregateRating',
            'ratingValue': str(rating.get('value', '0')),
            'reviewCount': str(rating.get('count', '0')),
            'bestRating': str(rating.get('best', '5')),
            'worstRating': str(rating.get('worst', '1'))
        }

    def _build_reviews(self, reviews: List[Dict]) -> List[Dict[str, Any]]:
        """构建评价结构"""
        review_schemas = []

        for review in reviews:
            review_schema = {
                '@type': 'Review',
                'reviewRating': {
                    '@type': 'Rating',
                    'ratingValue': str(review.get('rating', '5')),
                    'bestRating': '5'
                },
                'author': {
                    '@type': 'Person',
                    'name': review.get('author', 'Anonymous')
                },
                'reviewBody': review.get('body', '')
            }

            if date := review.get('datePublished'):
                review_schema['datePublished'] = date

            review_schemas.append(review_schema)

        return review_schemas

    def generate_shopping_feed(self) -> Dict[str, Any]:
        """
        生成 Google Shopping Feed 格式的数据

        Returns:
            Shopping Feed 格式的字典
        """
        offers = self._get_value('offers', {})

        return {
            'id': self._get_value('sku', ''),
            'title': self._get_value('name', ''),
            'description': self._get_value('description', ''),
            'link': offers.get('url', self._get_value('url', '')),
            'image_link': self._get_value('image', [''])[0] if isinstance(self._get_value('image'), list) else self._get_value('image', ''),
            'condition': 'new',
            'availability': 'in stock',
            'price': f"{offers.get('price', '0.00')} {offers.get('currency', 'USD')}",
            'brand': self._get_value('brand', '') if isinstance(self._get_value('brand'), str) else self._get_value('brand', {}).get('name', ''),
            'gtin': self._get_value('gtin', ''),
            'mpn': self._get_value('mpn', ''),
        }
