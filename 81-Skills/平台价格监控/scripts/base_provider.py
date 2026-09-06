#!/usr/bin/env python3
"""
价格提供者抽象基类

定义统一的价格数据获取接口，所有具体提供者必须实现此接口。
支持配置驱动、缓存策略、降级机制。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
import logging


LOGGER = logging.getLogger(__name__)


class ProviderType(Enum):
    """提供者类型"""
    API = "api"           # 官方API
    SCRAPER = "scraper"   # 网页抓取
    MOCK = "mock"         # 模拟数据
    CACHE = "cache"       # 缓存回退


class ProviderError(RuntimeError):
    """Expected operational failure from a price provider."""


class ProviderUnavailableError(ProviderError):
    """Provider cannot serve data because integration or credentials are unavailable."""


@dataclass
class PriceData:
    """标准化价格数据结构"""
    product_id: str
    platform: str
    price: float
    currency: str
    availability: str  # 'in_stock', 'out_of_stock', 'unknown'
    seller: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    timestamp: datetime = None
    source: str = ""    # 数据来源标识
    raw_data: Dict[str, Any] = None  # 原始数据（可选）

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


@dataclass
class ProviderConfig:
    """提供者配置"""
    name: str
    type: ProviderType
    enabled: bool = True
    priority: int = 100  # 优先级，数字越小优先级越高
    rate_limit: str = "100/hour"  # 速率限制
    timeout: int = 30
    retries: int = 3
    fallback_enabled: bool = True  # 是否允许降级
    cache_ttl: int = 3600  # 缓存时间（秒）
    config: Dict[str, Any] = None  # 额外配置

    def __post_init__(self):
        if self.config is None:
            self.config = {}


class BasePriceProvider(ABC):
    """
    价格提供者抽象基类

    所有价格数据源必须继承此类并实现抽象方法。
    提供统一的错误处理、缓存、降级机制。
    """

    def __init__(self, config: ProviderConfig):
        self.config = config
        self._cache = {}
        self._last_request_time = None

    @abstractmethod
    def fetch_price(self, product_id: str, **kwargs) -> Optional[PriceData]:
        """
        获取单个产品价格

        Args:
            product_id: 产品ID（ASIN、SKU等）
            **kwargs: 额外参数（marketplace、condition等）

        Returns:
            PriceData 或 None（获取失败时）
        """
        pass

    @abstractmethod
    def fetch_prices(self, product_ids: List[str], **kwargs) -> Dict[str, Optional[PriceData]]:
        """
        批量获取产品价格

        Args:
            product_ids: 产品ID列表
            **kwargs: 额外参数

        Returns:
            Dict[product_id, PriceData]
        """
        pass

    def fetch_with_fallback(self, product_id: str, fallback_providers: List['BasePriceProvider'] = None, **kwargs) -> Optional[PriceData]:
        """
        带降级策略的价格获取

        主提供者失败时，自动尝试备用提供者或缓存数据。

        Args:
            product_id: 产品ID
            fallback_providers: 备用提供者列表
            **kwargs: 额外参数

        Returns:
            PriceData 或 None
        """
        # 首先尝试主提供者
        try:
            data = self.fetch_price(product_id, **kwargs)
            if data is not None:
                self._cache[product_id] = data
                return data
        except ProviderError as e:
            LOGGER.warning("Primary provider %s failed: %s", self.config.name, e)

        # 尝试缓存回退
        if self.config.fallback_enabled and product_id in self._cache:
            cached = self._cache[product_id]
            # 检查缓存是否过期
            age = (datetime.now() - cached.timestamp).total_seconds()
            if age < self.config.cache_ttl:
                LOGGER.info("Using cached data for %s (age: %.0fs)", product_id, age)
                return cached

        # 尝试备用提供者
        if fallback_providers:
            for provider in fallback_providers:
                if not provider.config.enabled:
                    continue
                try:
                    data = provider.fetch_price(product_id, **kwargs)
                    if data is not None:
                        return data
                except ProviderError as e:
                    LOGGER.warning("Fallback provider %s failed: %s", provider.config.name, e)
                    continue

        return None

    def get_status(self) -> Dict[str, Any]:
        """
        获取提供者状态

        Returns:
            状态信息字典
        """
        return {
            'name': self.config.name,
            'type': self.config.type.value,
            'enabled': self.config.enabled,
            'cache_size': len(self._cache),
            'last_request': self._last_request_time,
        }

    def clear_cache(self):
        """清空缓存"""
        self._cache.clear()

    def _is_rate_limited(self) -> bool:
        """检查是否触发速率限制（子类可重写）"""
        # 基础实现，子类可添加更复杂的逻辑
        return False
