"""
LocalBusiness Schema 生成器

生成本地商家结构化数据，用于本地搜索优化
"""

from typing import Dict, Any, List, Optional
from .base_schema import BaseSchema, SchemaField


class LocalBusinessSchema(BaseSchema):
    """
    LocalBusiness Schema 生成器

    生成符合 Schema.org/LocalBusiness 规范的结构化数据，
    用于提升本地搜索结果中的商家信息展示。
    """

    schema_type = "LocalBusiness"

    def get_fields(self) -> List[SchemaField]:
        return [
            SchemaField('@type', 'string', required=False, default='LocalBusiness', description='商家类型'),
            SchemaField('name', 'string', required=True, description='商家名称'),
            SchemaField('description', 'string', required=False, description='商家描述'),
            SchemaField('image', 'array', required=False, description='商家图片'),
            SchemaField('address', 'object', required=True, description='地址'),
            SchemaField('telephone', 'string', required=False, description='电话'),
            SchemaField('email', 'string', required=False, description='邮箱'),
            SchemaField('url', 'string', required=False, description='网站URL'),
            SchemaField('openingHours', 'array', required=False, description='营业时间'),
            SchemaField('geo', 'object', required=False, description='地理坐标'),
            SchemaField('priceRange', 'string', required=False, description='价格范围'),
            SchemaField('currenciesAccepted', 'string', required=False, description='接受的货币'),
            SchemaField('paymentAccepted', 'string', required=False, description='支付方式'),
            SchemaField('aggregateRating', 'object', required=False, description='聚合评分'),
        ]

    def generate(self) -> Dict[str, Any]:
        """生成 LocalBusiness Schema"""
        # 确定商家类型
        business_type = self._get_value('@type', 'LocalBusiness')
        schema = {
            '@context': self.context,
            '@type': business_type,
        }

        # 基本信息
        schema['name'] = self._get_value('name')

        if description := self._get_value('description'):
            schema['description'] = description

        if image := self._get_value('image'):
            schema['image'] = image if isinstance(image, list) else [image]

        # 地址
        if address := self._get_value('address'):
            schema['address'] = self._build_address(address)

        # 联系方式
        if telephone := self._get_value('telephone'):
            schema['telephone'] = telephone

        if email := self._get_value('email'):
            schema['email'] = email

        if url := self._get_value('url'):
            schema['url'] = url

        # 营业时间
        if hours := self._get_value('openingHours'):
            schema['openingHoursSpecification'] = self._build_opening_hours(hours)

        # 地理坐标
        if geo := self._get_value('geo'):
            schema['geo'] = {
                '@type': 'GeoCoordinates',
                'latitude': str(geo.get('latitude', geo.get('lat', ''))),
                'longitude': str(geo.get('longitude', geo.get('lng', '')))
            }

        # 价格信息
        if price_range := self._get_value('priceRange'):
            schema['priceRange'] = price_range

        if currencies := self._get_value('currenciesAccepted'):
            schema['currenciesAccepted'] = currencies

        if payments := self._get_value('paymentAccepted'):
            schema['paymentAccepted'] = payments

        # 评分
        if rating := self._get_value('aggregateRating'):
            schema['aggregateRating'] = {
                '@type': 'AggregateRating',
                'ratingValue': str(rating.get('value', '0')),
                'reviewCount': str(rating.get('count', '0'))
            }

        return schema

    def _build_address(self, address: Dict[str, Any]) -> Dict[str, Any]:
        """构建地址结构"""
        return {
            '@type': 'PostalAddress',
            'streetAddress': address.get('street', address.get('streetAddress', '')),
            'addressLocality': address.get('city', address.get('addressLocality', '')),
            'addressRegion': address.get('state', address.get('addressRegion', '')),
            'postalCode': address.get('postalCode', address.get('zip', '')),
            'addressCountry': address.get('country', address.get('addressCountry', 'US')),
        }

    def _build_opening_hours(self, hours: List[Dict]) -> List[Dict[str, Any]]:
        """构建营业时间结构"""
        specs = []
        for spec in hours:
            specs.append({
                '@type': 'OpeningHoursSpecification',
                'dayOfWeek': spec.get('dayOfWeek', spec.get('days', [])),
                'opens': spec.get('opens', spec.get('open', '09:00')),
                'closes': spec.get('closes', spec.get('close', '18:00')),
            })
        return specs


class RestaurantSchema(LocalBusinessSchema):
    """
    Restaurant Schema 生成器

    专门用于餐厅的 LocalBusiness 子类。
    """

    schema_type = "Restaurant"

    def get_fields(self) -> List[SchemaField]:
        fields = super().get_fields()
        fields.extend([
            SchemaField('servesCuisine', 'array', required=False, description='菜系'),
            SchemaField('menu', 'string', required=False, description='菜单URL'),
            SchemaField('acceptsReservations', 'boolean', required=False, description='接受预订'),
        ])
        return fields

    def generate(self) -> Dict[str, Any]:
        """生成 Restaurant Schema"""
        schema = super().generate()

        if cuisine := self._get_value('servesCuisine'):
            schema['servesCuisine'] = cuisine if isinstance(cuisine, list) else [cuisine]

        if menu := self._get_value('menu'):
            schema['menu'] = menu

        if reservations := self._get_value('acceptsReservations'):
            schema['acceptsReservations'] = str(reservations).lower()

        return schema
