"""
供应商数据源模块

支持多种供应商数据来源：
- 1688 店铺数据
- 企业工商信息
- 本地缓存

Usage:
    from data_sources import get_data_source

    source = get_data_source('alibaba_1688')
    supplier_data = source.fetch_supplier_info('店铺ID')
"""

from .base_source import BaseSupplierDataSource, SupplierData, DataSourceConfig
from .alibaba_1688 import Alibaba1688Source
from .enterprise_registry import EnterpriseRegistrySource
from .local_cache import SupplierCache
from .factory import get_data_source, list_sources

__all__ = [
    'BaseSupplierDataSource',
    'SupplierData',
    'DataSourceConfig',
    'Alibaba1688Source',
    'EnterpriseRegistrySource',
    'SupplierCache',
    'get_data_source',
    'list_sources',
]
