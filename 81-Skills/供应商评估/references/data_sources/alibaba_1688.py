"""
1688 数据源

支持 1688 店铺数据获取
注意：1688 数据获取需要遵守平台规则
"""

from typing import Optional
import os
import logging
from .base_source import (
    BaseSupplierDataSource,
    DataSourceConfig,
    DataSourceError,
    DataSourceType,
    DataSourceUnavailableError,
    SupplierData,
)


LOGGER = logging.getLogger(__name__)


class Alibaba1688Source(BaseSupplierDataSource):
    """
    1688 店铺数据源

    获取店铺信息、交易数据、评价等
    支持 API 和备用方案
    """

    def __init__(self, config: Optional[DataSourceConfig] = None):
        if config is None:
            config = DataSourceConfig(
                name='alibaba_1688',
                type=DataSourceType.B2B_PLATFORM,
                config={
                    'api_key': os.getenv('ALIBABA_API_KEY'),
                    'api_secret': os.getenv('ALIBABA_API_SECRET'),
                    'use_api': os.getenv('1688_USE_API', 'false').lower() == 'true',
                }
            )
        super().__init__(config)

    def fetch_supplier_info(self, supplier_id: str, **kwargs) -> Optional[SupplierData]:
        """
        获取 1688 供应商信息

        Args:
            supplier_id: 1688 店铺 ID 或会员名
            **kwargs:
                - include_transactions: 是否包含交易数据
                - include_reviews: 是否包含评价数据

        Returns:
            SupplierData 或 None
        """
        # 检查 API 凭证
        if self.config.config.get('use_api') and self._has_api_credentials():
            try:
                return self._fetch_via_api(supplier_id, **kwargs)
            except DataSourceError as e:
                LOGGER.warning("1688 API fetch failed: %s", e)

        # 返回说明信息
        return self._create_no_api_response(supplier_id)

    def _has_api_credentials(self) -> bool:
        """检查是否有 API 凭证"""
        cfg = self.config.config
        return bool(cfg.get('api_key') and cfg.get('api_secret'))

    def _fetch_via_api(self, supplier_id: str, **kwargs) -> SupplierData:
        """通过 1688 API 获取"""
        # 实际实现需要使用阿里巴巴开放平台 SDK
        # 文档：https://open.1688.com/api/apiDoc.htm
        raise DataSourceUnavailableError(
            "1688 API 需要申请阿里巴巴开放平台权限。\n"
            "或使用 Mock 数据进行测试。"
        )

    def _create_no_api_response(self, supplier_id: str) -> Optional[SupplierData]:
        """无 API 时的说明响应"""
        LOGGER.warning(
            "1688 API is not configured for supplier %s. "
            "Apply for Alibaba Open Platform API access, configure "
            "ALIBABA_API_KEY and ALIBABA_API_SECRET, or use mock data.",
            supplier_id,
        )
        return None


class Alibaba1688ScraperSource(BaseSupplierDataSource):
    """
    1688 网页抓取数据源（备用/风控方案）

    Warning: 需要遵守 robots.txt 和平台规则
    """

    def __init__(self, config: Optional[DataSourceConfig] = None):
        if config is None:
            config = DataSourceConfig(
                name='alibaba_1688_scraper',
                type=DataSourceType.B2B_PLATFORM,
                rate_limit="10/hour",
                config={
                    'proxy_enabled': os.getenv('PROXY_ENABLED', 'false').lower() == 'true',
                }
            )
        super().__init__(config)

    def fetch_supplier_info(self, supplier_id: str, **kwargs) -> Optional[SupplierData]:
        """通过网页抓取获取"""
        LOGGER.warning("1688 scraping has compliance risk; prefer the official API")
        return None
