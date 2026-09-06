"""
AI 搜索平台适配器模块

支持多种 AI 搜索平台：
- Google SGE (Search Generative Experience)
- Bing Copilot
- Perplexity

Usage:
    from platforms import get_platform_adapter, create_geo_checker

    # 获取单个适配器
    adapter = get_platform_adapter('google_sge')
    visibility = adapter.check_visibility('https://example.com', 'query')

    # 使用检查器检查所有平台
    checker = create_geo_checker(use_mock=True)
    results = checker.check_all('https://example.com', 'query')
"""

from .base_platform import BasePlatformAdapter, VisibilityReport, PlatformConfig, PlatformType
from .google_sge import GoogleSGEAdapter, MockGoogleSGEAdapter
from .bing_copilot import BingCopilotAdapter, MockBingCopilotAdapter
from .factory import get_platform_adapter, list_adapters, create_geo_checker, get_available_platforms
from .checker import GEOChecker, MockGEOChecker

__all__ = [
    # Base classes
    'BasePlatformAdapter',
    'VisibilityReport',
    'PlatformConfig',
    'PlatformType',
    # Adapters
    'GoogleSGEAdapter',
    'BingCopilotAdapter',
    'MockGoogleSGEAdapter',
    'MockBingCopilotAdapter',
    # Factory functions
    'get_platform_adapter',
    'list_adapters',
    'create_geo_checker',
    'get_available_platforms',
    # Checkers
    'GEOChecker',
    'MockGEOChecker',
]
