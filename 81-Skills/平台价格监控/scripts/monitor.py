#!/usr/bin/env python3
"""
价格监控器主类

整合多个数据提供者，提供统一的价格监控接口
支持自动降级、缓存、批量查询
"""

from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import json
import logging
from .base_provider import BasePriceProvider, PriceData, ProviderError


LOGGER = logging.getLogger(__name__)


class PriceMonitor:
    """
    价格监控器

    整合多个价格提供者，提供：
    - 统一查询接口
    - 自动降级策略
    - 缓存管理
    - 批量监控
    """

    def __init__(self, providers: Dict[str, BasePriceProvider]):
        """
        初始化监控器

        Args:
            providers: {provider_name: provider_instance}
        """
        self.providers = providers
        self._price_history: Dict[str, List[PriceData]] = {}
        self._alerts: List[Dict] = []

    def fetch_price(self, product_id: str, platform: str = None, **kwargs) -> Optional[PriceData]:
        """
        获取单个产品价格（带自动降级）

        Args:
            product_id: 产品ID
            platform: 指定平台，None则尝试所有
            **kwargs: 额外参数

        Returns:
            PriceData 或 None
        """
        # 按优先级排序提供者
        sorted_providers = sorted(
            self.providers.items(),
            key=lambda x: x[1].config.priority
        )

        # 如果指定了平台，优先使用对应提供者
        if platform and platform in self.providers:
            provider = self.providers[platform]
            if provider.config.enabled:
                result = provider.fetch_with_fallback(
                    product_id,
                    fallback_providers=self._get_fallback_providers(platform),
                    **kwargs
                )
                if result:
                    self._record_price(product_id, result)
                    return result

        # 尝试所有启用的提供者
        for name, provider in sorted_providers:
            if not provider.config.enabled:
                continue

            try:
                result = provider.fetch_price(product_id, **kwargs)
                if result:
                    self._record_price(product_id, result)
                    return result
            except ProviderError as e:
                LOGGER.warning("Provider %s failed: %s", name, e)
                continue

        return None

    def fetch_prices(self, product_ids: List[str], **kwargs) -> Dict[str, Optional[PriceData]]:
        """
        批量获取价格

        Args:
            product_ids: 产品ID列表
            **kwargs: 额外参数

        Returns:
            {product_id: PriceData}
        """
        results = {}
        for pid in product_ids:
            results[pid] = self.fetch_price(pid, **kwargs)
        return results

    def monitor_changes(self, product_ids: List[str], threshold: float = 0.05) -> List[Dict]:
        """
        监控价格变化

        Args:
            product_ids: 监控的产品列表
            threshold: 变化阈值（5% = 0.05）

        Returns:
            变化警报列表
        """
        changes = []
        current_prices = self.fetch_prices(product_ids)

        for pid, current in current_prices.items():
            if not current:
                continue

            history = self._price_history.get(pid, [])
            if len(history) < 2:
                continue

            previous = history[-2]  # 上一次价格
            if previous.price == 0:
                continue

            change_pct = (current.price - previous.price) / previous.price

            if abs(change_pct) >= threshold:
                alert = {
                    'product_id': pid,
                    'platform': current.platform,
                    'old_price': previous.price,
                    'new_price': current.price,
                    'change_pct': change_pct,
                    'timestamp': current.timestamp,
                    'direction': 'up' if change_pct > 0 else 'down',
                }
                changes.append(alert)
                self._alerts.append(alert)

        return changes

    def get_price_history(self, product_id: str, days: int = 30) -> List[PriceData]:
        """
        获取价格历史

        Args:
            product_id: 产品ID
            days: 历史天数

        Returns:
            PriceData 列表
        """
        history = self._price_history.get(product_id, [])
        cutoff = datetime.now() - timedelta(days=days)
        return [h for h in history if h.timestamp > cutoff]

    def get_stats(self) -> Dict[str, Any]:
        """
        获取监控统计

        Returns:
            统计信息字典
        """
        return {
            'providers': {
                name: provider.get_status()
                for name, provider in self.providers.items()
            },
            'monitored_products': len(self._price_history),
            'total_records': sum(
                len(h) for h in self._price_history.values()
            ),
            'alerts_count': len(self._alerts),
            'recent_alerts': self._alerts[-10:],  # 最近10条
        }

    def export_data(self, format: str = 'json') -> str:
        """
        导出监控数据

        Args:
            format: 导出格式 (json/csv)

        Returns:
            导出的数据字符串
        """
        if format == 'json':
            data = {
                'history': {
                    pid: [
                        {
                            'product_id': p.product_id,
                            'platform': p.platform,
                            'price': p.price,
                            'currency': p.currency,
                            'timestamp': p.timestamp.isoformat(),
                        }
                        for p in history
                    ]
                    for pid, history in self._price_history.items()
                },
                'alerts': self._alerts,
            }
            return json.dumps(data, indent=2)

        elif format == 'csv':
            lines = ['product_id,platform,price,currency,timestamp']
            for pid, history in self._price_history.items():
                for p in history:
                    lines.append(
                        f"{p.product_id},{p.platform},{p.price},{p.currency},{p.timestamp}"
                    )
            return '\n'.join(lines)

        else:
            raise ValueError(f"Unsupported format: {format}")

    def _get_fallback_providers(self, exclude: str) -> List[BasePriceProvider]:
        """获取降级提供者列表（排除指定提供者）"""
        fallback = []
        for name, provider in self.providers.items():
            if name != exclude and provider.config.fallback_enabled:
                fallback.append(provider)
        return fallback

    def _record_price(self, product_id: str, data: PriceData):
        """记录价格数据"""
        if product_id not in self._price_history:
            self._price_history[product_id] = []
        self._price_history[product_id].append(data)

        # 限制历史记录数量
        max_history = 1000
        if len(self._price_history[product_id]) > max_history:
            self._price_history[product_id] = self._price_history[product_id][-max_history:]
