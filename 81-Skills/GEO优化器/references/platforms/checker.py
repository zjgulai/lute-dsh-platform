"""
GEO 检查器

协调多个平台适配器，提供统一的 GEO 可见性检查接口
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from .base_platform import BasePlatformAdapter, PlatformError, VisibilityReport


LOGGER = logging.getLogger(__name__)


class GEOChecker:
    """
    GEO (Generative Engine Optimization) 检查器

    协调多个 AI 搜索平台适配器，检查网站在各平台的可见性。
    """

    def __init__(self, adapters: Dict[str, BasePlatformAdapter]):
        """
        Args:
            adapters: 平台名称到适配器的映射
        """
        self.adapters = adapters

    def check_all(self, url: str, query: str, **kwargs) -> Dict[str, Optional[VisibilityReport]]:
        """
        检查所有平台的可见性

        Args:
            url: 目标网站 URL
            query: 搜索查询
            **kwargs: 额外参数

        Returns:
            平台名称到可见性报告的映射
        """
        results = {}
        for platform, adapter in self.adapters.items():
            try:
                results[platform] = adapter.check_visibility(url, query, **kwargs)
            except PlatformError as e:
                LOGGER.warning("Error checking %s: %s", platform, e)
                results[platform] = None
        return results

    def check_platform(self, platform: str, url: str, query: str, **kwargs) -> Optional[VisibilityReport]:
        """
        检查指定平台的可见性

        Args:
            platform: 平台名称
            url: 目标网站 URL
            query: 搜索查询

        Returns:
            VisibilityReport 或 None
        """
        adapter = self.adapters.get(platform)
        if not adapter:
            LOGGER.warning("Unknown platform %s", platform)
            return None
        return adapter.check_visibility(url, query, **kwargs)

    def get_coverage_summary(self, url: str) -> Dict[str, Any]:
        """
        获取所有平台的覆盖度摘要

        Args:
            url: 目标网站 URL

        Returns:
            覆盖度摘要字典
        """
        summary = {
            'url': url,
            'timestamp': datetime.now().isoformat(),
            'platforms': {}
        }

        for platform, adapter in self.adapters.items():
            try:
                if hasattr(adapter, 'get_sge_coverage'):
                    coverage = adapter.get_sge_coverage(url)
                elif hasattr(adapter, 'get_copilot_coverage'):
                    coverage = adapter.get_copilot_coverage(url)
                else:
                    coverage = {'note': 'Coverage not supported'}

                summary['platforms'][platform] = coverage
            except PlatformError as e:
                summary['platforms'][platform] = {'error': str(e)}

        # 计算总体统计
        visible_counts = [
            p.get('sge_visible_queries', 0) or p.get('copilot_visible_queries', 0)
            for p in summary['platforms'].values()
            if isinstance(p, dict)
        ]
        summary['total_visible_queries'] = sum(visible_counts)

        return summary

    def get_status(self) -> Dict[str, Any]:
        """获取检查器状态"""
        return {
            'platforms': {
                name: adapter.get_status()
                for name, adapter in self.adapters.items()
            },
            'available_count': sum(
                1 for a in self.adapters.values() if a.is_available()
            )
        }


class MockGEOChecker(GEOChecker):
    """
    Mock GEO 检查器

    用于测试和演示，所有平台返回模拟数据
    """

    def __init__(self):
        from .factory import get_platform_adapter
        adapters = {
            'google_sge': get_platform_adapter('mock_google_sge'),
            'bing_copilot': get_platform_adapter('mock_bing_copilot'),
        }
        super().__init__(adapters)
