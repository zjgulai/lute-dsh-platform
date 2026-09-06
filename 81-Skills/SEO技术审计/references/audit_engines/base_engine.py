"""
SEO 审计引擎抽象基类

定义统一的网站审计接口，所有具体引擎必须实现此接口。
支持配置驱动、缓存策略、降级机制。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
import logging


LOGGER = logging.getLogger(__name__)


class AuditType(Enum):
    """审计类型"""
    PERFORMANCE = "performance"
    SEO = "seo"
    ACCESSIBILITY = "accessibility"
    BEST_PRACTICES = "best_practices"
    PWA = "pwa"


class AuditEngineError(RuntimeError):
    """Expected operational failure from an SEO audit engine."""


@dataclass
class AuditReport:
    """标准化审计报告结构"""
    url: str
    engine: str
    scores: Dict[str, float]  # performance, seo, accessibility, etc.
    metrics: Dict[str, Any]   # LCP, FID, CLS, etc.
    issues: List[Dict[str, Any]]
    raw_data: Optional[Dict] = None
    timestamp: datetime = None
    duration_ms: int = 0

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


@dataclass
class AuditConfig:
    """审计配置"""
    name: str
    enabled: bool = True
    priority: int = 100
    timeout: int = 60
    retries: int = 3
    cache_ttl: int = 3600
    config: Dict[str, Any] = field(default_factory=dict)


class BaseAuditEngine(ABC):
    """
    SEO 审计引擎抽象基类

    所有审计工具必须继承此类并实现抽象方法。
    """

    def __init__(self, config: AuditConfig):
        self.config = config

    @abstractmethod
    def audit(self, url: str, **kwargs) -> Optional[AuditReport]:
        """
        执行网站审计

        Args:
            url: 目标网站 URL
            **kwargs: 额外参数

        Returns:
            AuditReport 或 None
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """检查引擎是否可用（工具已安装/API凭证有效）"""
        pass

    def audit_with_fallback(self, url: str, fallback_engines: List['BaseAuditEngine'] = None, **kwargs) -> Optional[AuditReport]:
        """
        带降级策略的审计

        主引擎失败时，自动尝试备用引擎。
        """
        try:
            if self.is_available():
                report = self.audit(url, **kwargs)
                if report is not None:
                    return report
        except AuditEngineError as e:
            LOGGER.warning("Primary engine %s failed: %s", self.config.name, e)

        # 尝试备用引擎
        if fallback_engines:
            for engine in fallback_engines:
                if not engine.config.enabled or not engine.is_available():
                    continue
                try:
                    report = engine.audit(url, **kwargs)
                    if report is not None:
                        report.metadata = {'fallback_from': self.config.name}
                        return report
                except AuditEngineError as e:
                    LOGGER.warning("Fallback engine %s failed: %s", engine.config.name, e)
                    continue

        return None

    def get_status(self) -> Dict[str, Any]:
        """获取引擎状态"""
        return {
            'name': self.config.name,
            'enabled': self.config.enabled,
            'available': self.is_available(),
        }
