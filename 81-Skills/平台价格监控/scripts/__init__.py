#!/usr/bin/env python3
"""
价格监控数据提供者模块

支持多种价格数据源：
- Amazon API/Scraper
- eBay API/Scraper
- AliExpress API/Scraper
- Mock Provider（测试/降级用）

Usage:
    from providers import get_provider

    provider = get_provider('amazon')
    price_data = provider.fetch_price('B08N5WRWNW')
"""

from .base_provider import BasePriceProvider, PriceData, ProviderConfig
from .amazon_provider import AmazonProvider
from .ebay_provider import EbayProvider
from .aliexpress_provider import AliexpressProvider
from .mock_provider import MockProvider
from .factory import get_provider, list_providers

__all__ = [
    'BasePriceProvider',
    'PriceData',
    'ProviderConfig',
    'AmazonProvider',
    'EbayProvider',
    'AliexpressProvider',
    'MockProvider',
    'get_provider',
    'list_providers',
]
