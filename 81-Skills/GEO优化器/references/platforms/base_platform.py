"""
AI 搜索平台适配器抽象基类

定义统一的 AI 搜索可见性检查接口
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum


class PlatformType(Enum):
    """平台类型"""
    GOOGLE_SGE = "google_sge"
    BING_COPILOT = "bing_copilot"
    PERPLEXITY = "perplexity"


class PlatformError(RuntimeError):
    """Expected operational failure from an AI search platform adapter."""


class PlatformUnavailableError(PlatformError):
    """Platform adapter cannot serve data because integration or credentials are unavailable."""


@dataclass
class VisibilityReport:
    """AI 搜索可见性报告"""
    url: str
    platform: str
    query: str
    is_visible: bool
    position: Optional[int] = None  # 在 AI 回答中的位置
    snippet: Optional[str] = None   # 被引用的片段
    citations: List[str] = field(default_factory=list)
    timestamp: datetime = None
    raw_data: Optional[Dict] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
        if self.citations is None:
            self.citations = []


@dataclass
class PlatformConfig:
    """平台适配器配置"""
    name: str
    type: PlatformType
    enabled: bool = True
    api_key: Optional[str] = None
    rate_limit: str = "100/hour"
    timeout: int = 30
    config: Dict[str, Any] = field(default_factory=dict)


class BasePlatformAdapter(ABC):
    """
    AI 搜索平台适配器抽象基类
    """

    def __init__(self, config: PlatformConfig):
        self.config = config

    @abstractmethod
    def check_visibility(self, url: str, query: str, **kwargs) -> Optional[VisibilityReport]:
        """
        检查网站在 AI 搜索中的可见性

        Args:
            url: 目标网站 URL
            query: 搜索查询
            **kwargs: 额外参数

        Returns:
            VisibilityReport 或 None
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """检查适配器是否可用（API 凭证有效）"""
        pass

    def get_status(self) -> Dict[str, Any]:
        """获取适配器状态"""
        return {
            'name': self.config.name,
            'type': self.config.type.value,
            'enabled': self.config.enabled,
            'available': self.is_available(),
        }
