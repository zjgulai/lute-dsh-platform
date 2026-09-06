"""
平台适配器工厂

管理所有 AI 搜索平台适配器的注册、创建和获取
"""

import logging
from typing import Dict, Optional, List
from .base_platform import BasePlatformAdapter, PlatformConfig, PlatformType
from .google_sge import GoogleSGEAdapter, MockGoogleSGEAdapter
from .bing_copilot import BingCopilotAdapter, MockBingCopilotAdapter


LOGGER = logging.getLogger(__name__)

# 全局适配器注册表
_ADAPTER_REGISTRY: Dict[str, type] = {
    'google_sge': GoogleSGEAdapter,
    'bing_copilot': BingCopilotAdapter,
    'mock_google_sge': MockGoogleSGEAdapter,
    'mock_bing_copilot': MockBingCopilotAdapter,
}

# 适配器实例缓存
_ADAPTER_INSTANCES: Dict[str, BasePlatformAdapter] = {}


def register_adapter(name: str, adapter_class: type):
    """注册新的平台适配器"""
    if not issubclass(adapter_class, BasePlatformAdapter):
        raise ValueError(f"Adapter class must inherit from BasePlatformAdapter")
    _ADAPTER_REGISTRY[name] = adapter_class


def get_platform_adapter(name: str, config: Optional[PlatformConfig] = None) -> Optional[BasePlatformAdapter]:
    """获取或创建平台适配器实例"""
    if name in _ADAPTER_INSTANCES and config is None:
        return _ADAPTER_INSTANCES[name]

    if name not in _ADAPTER_REGISTRY:
        LOGGER.warning(
            "Unknown platform adapter %s. Available adapters: %s",
            name,
            list(_ADAPTER_REGISTRY.keys()),
        )
        return None

    adapter_class = _ADAPTER_REGISTRY[name]
    adapter = adapter_class(config)

    if config is None:
        _ADAPTER_INSTANCES[name] = adapter

    return adapter


def list_adapters() -> Dict[str, str]:
    """列出所有注册的适配器"""
    return {
        name: cls.__doc__.split('\n')[0] if cls.__doc__ else "No description"
        for name, cls in _ADAPTER_REGISTRY.items()
    }


def create_geo_checker(use_mock: bool = False) -> 'GEOChecker':
    """
    创建 GEO 检查器

    Args:
        use_mock: 是否使用模拟适配器（用于测试）

    Returns:
        GEOChecker 实例
    """
    from .checker import GEOChecker

    adapters = {}

    if use_mock:
        adapters['google_sge'] = get_platform_adapter('mock_google_sge')
        adapters['bing_copilot'] = get_platform_adapter('mock_bing_copilot')
    else:
        # 尝试获取真实适配器，失败则使用模拟
        for name in ['google_sge', 'bing_copilot']:
            adapter = get_platform_adapter(name)
            if adapter and adapter.is_available():
                adapters[name] = adapter
            else:
                mock_name = f'mock_{name}'
                adapters[name] = get_platform_adapter(mock_name)

    return GEOChecker(adapters)


def get_available_platforms() -> List[str]:
    """获取当前可用的平台列表"""
    available = []
    for name in ['google_sge', 'bing_copilot']:
        adapter = get_platform_adapter(name)
        if adapter and adapter.is_available():
            available.append(name)
    return available


def clear_cache():
    """清除所有缓存的适配器实例"""
    _ADAPTER_INSTANCES.clear()
