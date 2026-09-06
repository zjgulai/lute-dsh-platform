"""
供应商数据源抽象基类

定义统一的供应商数据获取接口
支持配置驱动、缓存策略、降级机制
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
import logging


LOGGER = logging.getLogger(__name__)


class DataSourceType(Enum):
    """数据源类型"""
    B2B_PLATFORM = "b2b_platform"  # 1688等平台
    GOVERNMENT = "government"      # 工商信息
    LOCAL = "local"                # 本地缓存/文件


class DataSourceError(RuntimeError):
    """Expected operational failure from a supplier data source."""


class DataSourceUnavailableError(DataSourceError):
    """Data source cannot serve data because integration or credentials are unavailable."""


@dataclass
class SupplierData:
    """标准化供应商数据结构"""
    supplier_id: str
    source: str                    # 数据来源
    company_name: Optional[str] = None
    legal_status: Optional[str] = None  # 存续状态
    established_date: Optional[str] = None
    registered_capital: Optional[str] = None
    business_scope: Optional[str] = None
    legal_person: Optional[str] = None
    risk_level: Optional[str] = None   # low/medium/high
    risk_details: List[str] = None
    platform_data: Dict[str, Any] = None  # 平台特定数据
    raw_data: Dict[str, Any] = None
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
        if self.risk_details is None:
            self.risk_details = []


@dataclass
class DataSourceConfig:
    """数据源配置"""
    name: str
    type: DataSourceType
    enabled: bool = True
    priority: int = 100
    rate_limit: str = "100/hour"
    timeout: int = 30
    retries: int = 3
    cache_ttl: int = 3600
    config: Dict[str, Any] = None

    def __post_init__(self):
        if self.config is None:
            self.config = {}


class BaseSupplierDataSource(ABC):
    """供应商数据源抽象基类"""

    def __init__(self, config: DataSourceConfig):
        self.config = config
        self._cache = {}

    @abstractmethod
    def fetch_supplier_info(self, supplier_id: str, **kwargs) -> Optional[SupplierData]:
        """获取供应商信息"""
        pass

    def fetch_with_fallback(self, supplier_id: str, fallback_sources: List['BaseSupplierDataSource'] = None, **kwargs) -> Optional[SupplierData]:
        """带降级策略的获取"""
        try:
            data = self.fetch_supplier_info(supplier_id, **kwargs)
            if data is not None:
                self._cache[supplier_id] = data
                return data
        except DataSourceError as e:
            LOGGER.warning("Primary source %s failed: %s", self.config.name, e)

        # 尝试缓存回退
        if supplier_id in self._cache:
            cached = self._cache[supplier_id]
            age = (datetime.now() - cached.timestamp).total_seconds()
            if age < self.config.cache_ttl:
                return cached

        # 尝试备用源
        if fallback_sources:
            for source in fallback_sources:
                if not source.config.enabled:
                    continue
                try:
                    data = source.fetch_supplier_info(supplier_id, **kwargs)
                    if data is not None:
                        return data
                except DataSourceError as e:
                    LOGGER.warning("Fallback source %s failed: %s", source.config.name, e)
                    continue

        return None
