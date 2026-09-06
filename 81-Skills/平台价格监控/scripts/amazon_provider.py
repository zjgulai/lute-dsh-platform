#!/usr/bin/env python3
"""
Amazon 价格提供者

支持 Amazon Product Advertising API 和备用抓取方案
遵循 Amazon 使用政策，支持风控降级
"""

from typing import Optional, Dict, Any, List
import os
import logging
from .base_provider import (
    BasePriceProvider,
    PriceData,
    ProviderConfig,
    ProviderError,
    ProviderType,
    ProviderUnavailableError,
)


LOGGER = logging.getLogger(__name__)


class AmazonProvider(BasePriceProvider):
    """
    Amazon 价格数据提供者

    优先使用 Amazon Product Advertising API (PA API)
    API 受限时自动降级到缓存或 Mock 数据
    """

    MARKETPLACES = {
        'US': 'www.amazon.com',
        'UK': 'www.amazon.co.uk',
        'DE': 'www.amazon.de',
        'JP': 'www.amazon.co.jp',
        'CN': 'www.amazon.cn',
    }

    def __init__(self, config: Optional[ProviderConfig] = None):
        if config is None:
            config = ProviderConfig(
                name='amazon',
                type=ProviderType.API,
                config={
                    'access_key': os.getenv('AMAZON_ACCESS_KEY'),
                    'secret_key': os.getenv('AMAZON_SECRET_KEY'),
                    'partner_tag': os.getenv('AMAZON_PARTNER_TAG'),
                    'marketplace': os.getenv('AMAZON_MARKETPLACE', 'US'),
                    'use_api': os.getenv('AMAZON_USE_API', 'true').lower() == 'true',
                }
            )
        super().__init__(config)
        self.marketplace = self.config.config.get('marketplace', 'US')

    def fetch_price(self, product_id: str, **kwargs) -> Optional[PriceData]:
        """
        获取 Amazon 产品价格

        Args:
            product_id: Amazon ASIN
            **kwargs:
                - marketplace: 市场代码 (US/UK/DE等)
                - use_api: 是否优先使用API

        Returns:
            PriceData 或 None
        """
        marketplace = kwargs.get('marketplace', self.marketplace)
        use_api = kwargs.get('use_api', self.config.config.get('use_api', True))

        if use_api and self._has_api_credentials():
            try:
                return self._fetch_via_api(product_id, marketplace)
            except ProviderError as e:
                LOGGER.warning("Amazon API fetch failed: %s; trying alternative", e)

        # API 失败或禁用时，返回说明信息
        return self._create_no_api_response(product_id, marketplace)

    def fetch_prices(self, product_ids: List[str], **kwargs) -> Dict[str, Optional[PriceData]]:
        """批量获取价格"""
        results = {}
        for pid in product_ids:
            results[pid] = self.fetch_price(pid, **kwargs)
        return results

    def _has_api_credentials(self) -> bool:
        """检查是否有 API 凭证"""
        cfg = self.config.config
        return all([
            cfg.get('access_key'),
            cfg.get('secret_key'),
            cfg.get('partner_tag'),
        ])

    def _fetch_via_api(self, product_id: str, marketplace: str) -> PriceData:
        """
        通过 PA API 获取价格

        Note: 实际实现需要安装 amazon-paapi 或类似库
        这里提供接口框架
        """
        # 实际实现示例:
        # from amazon_paapi import AmazonApi
        # api = AmazonApi(
        #     access_key=self.config.config['access_key'],
        #     secret_key=self.config.config['secret_key'],
        #     partner_tag=self.config.config['partner_tag'],
        #     country=marketplace
        # )
        # item = api.get_items([product_id])[0]
        # return PriceData(...)

        raise ProviderUnavailableError(
            "PA API 实现需要安装 amazon-paapi 库并配置凭证。\n"
            "或使用 MockProvider 进行测试。"
        )

    def _create_no_api_response(self, product_id: str, marketplace: str) -> Optional[PriceData]:
        """
        当无法获取实时数据时返回说明信息

        实际生产环境应该:
        1. 返回缓存数据（如果有）
        2. 或触发异步抓取任务
        3. 或使用 MockProvider 作为降级
        """
        LOGGER.warning(
            "Amazon API is not configured or unavailable for ASIN %s. "
            "Configure AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG; "
            "use MockProvider; or provide pre-fetched price data.",
            product_id,
        )
        return None

    def get_marketplace_url(self, asin: str, marketplace: str = None) -> str:
        """获取产品页面 URL"""
        mp = marketplace or self.marketplace
        domain = self.MARKETPLACES.get(mp, 'www.amazon.com')
        return f"https://{domain}/dp/{asin}"


class AmazonScraperProvider(BasePriceProvider):
    """
    Amazon 网页抓取提供者（风控/备用方案）

    Warning: 需要遵守 robots.txt 和 Amazon 使用条款
    高频抓取可能导致 IP 被封禁
    """

    def __init__(self, config: Optional[ProviderConfig] = None):
        if config is None:
            config = ProviderConfig(
                name='amazon_scraper',
                type=ProviderType.SCRAPER,
                rate_limit="10/hour",  # 严格限速
                config={
                    'proxy_enabled': os.getenv('PROXY_ENABLED', 'false').lower() == 'true',
                    'proxy_url': os.getenv('PROXY_URL'),
                }
            )
        super().__init__(config)

    def fetch_price(self, product_id: str, **kwargs) -> Optional[PriceData]:
        """
        通过网页抓取获取价格

        Warning: 此方法存在法律和合规风险，仅作为最后手段
        """
        LOGGER.warning(
            "Amazon scraping has compliance risk. Prefer the official API; "
            "if scraping is used, obey robots.txt, use intervals >10 seconds, "
            "rotate proxies, and restrict usage to personal/internal workflows."
        )

        # 实际抓取逻辑需要自行实现
        # 建议使用 requests + BeautifulSoup 或 Playwright
        return None

    def fetch_prices(self, product_ids: List[str], **kwargs) -> Dict[str, Optional[PriceData]]:
        results = {}
        for pid in product_ids:
            results[pid] = self.fetch_price(pid, **kwargs)
            # 添加延迟避免被封
            import time
            time.sleep(10)  # 至少10秒间隔
        return results
