"""
数据源工厂

管理所有供应商数据源的注册、创建和获取
"""

from typing import Dict, Optional
import logging
import os
import yaml
from .base_source import BaseSupplierDataSource, DataSourceConfig, DataSourceType
from .alibaba_1688 import Alibaba1688Source, Alibaba1688ScraperSource
from .enterprise_registry import EnterpriseRegistrySource, MockEnterpriseSource
from .local_cache import SupplierCache


LOGGER = logging.getLogger(__name__)

# 全局数据源注册表
_SOURCE_REGISTRY: Dict[str, type] = {
    'alibaba_1688': Alibaba1688Source,
    'alibaba_1688_scraper': Alibaba1688ScraperSource,
    'enterprise_registry': EnterpriseRegistrySource,
    'mock_enterprise': MockEnterpriseSource,
}

# 数据源实例缓存
_SOURCE_INSTANCES: Dict[str, BaseSupplierDataSource] = {}


def register_source(name: str, source_class: type):
    """
    注册新的数据源

    Args:
        name: 数据源名称
        source_class: 数据源类（必须继承 BaseSupplierDataSource）
    """
    if not issubclass(source_class, BaseSupplierDataSource):
        raise ValueError(f"Source class must inherit from BaseSupplierDataSource")
    _SOURCE_REGISTRY[name] = source_class


def get_data_source(name: str, config: Optional[DataSourceConfig] = None) -> Optional[BaseSupplierDataSource]:
    """
    获取或创建数据源实例

    Args:
        name: 数据源名称
        config: 可选的配置，不提供则使用默认配置

    Returns:
        数据源实例或 None（未注册时）
    """
    # 检查缓存
    if name in _SOURCE_INSTANCES and config is None:
        return _SOURCE_INSTANCES[name]

    # 创建新实例
    if name not in _SOURCE_REGISTRY:
        LOGGER.warning(
            "Unknown data source %s. Available sources: %s",
            name,
            list(_SOURCE_REGISTRY.keys()),
        )
        return None

    source_class = _SOURCE_REGISTRY[name]
    source = source_class(config)

    # 缓存实例（仅当无自定义配置时）
    if config is None:
        _SOURCE_INSTANCES[name] = source

    return source


def list_sources() -> Dict[str, str]:
    """
    列出所有注册的数据源

    Returns:
        {name: description}
    """
    return {
        name: cls.__doc__.split('\n')[0] if cls.__doc__ else "No description"
        for name, cls in _SOURCE_REGISTRY.items()
    }


def create_supplier_evaluator(config_path: str = None, use_cache: bool = True):
    """
    创建供应商评估器

    Args:
        config_path: 可选的配置文件路径
        use_cache: 是否启用本地缓存

    Returns:
        SupplierEvaluator 实例
    """
    from .evaluator import SupplierEvaluator

    cache = SupplierCache() if use_cache else None

    if config_path and os.path.exists(config_path):
        sources = _load_sources_from_config(config_path)
    else:
        # 使用默认数据源
        sources = {
            'mock_enterprise': get_data_source('mock_enterprise'),
        }

    return SupplierEvaluator(sources, cache)


def _load_sources_from_config(config_path: str) -> Dict[str, BaseSupplierDataSource]:
    """从配置文件加载数据源"""
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    sources = {}
    for name, cfg in config.get('data_sources', {}).items():
        source_cfg = DataSourceConfig(
            name=name,
            type=DataSourceType(cfg.get('type', 'b2b_platform')),
            enabled=cfg.get('enabled', True),
            priority=cfg.get('priority', 100),
            config=cfg.get('config', {})
        )

        source = get_data_source(name, source_cfg)
        if source:
            sources[name] = source

    return sources


def clear_cache():
    """清除所有缓存的数据源实例"""
    _SOURCE_INSTANCES.clear()
