"""
企业工商信息数据源

支持多个工商信息查询源：
- 国家企业信用信息公示系统（官方）
- 天眼查 API（需申请）
- 企查查 API（需申请）
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


class EnterpriseRegistrySource(BaseSupplierDataSource):
    """
    企业工商信息数据源

    获取企业注册信息、股东信息、法律诉讼等
    """

    def __init__(self, config: Optional[DataSourceConfig] = None):
        if config is None:
            config = DataSourceConfig(
                name='enterprise_registry',
                type=DataSourceType.GOVERNMENT,
                config={
                    # 天眼查
                    'tianyancha_token': os.getenv('TIANYANCHA_TOKEN'),
                    # 企查查
                    'qichacha_key': os.getenv('QICHACHA_KEY'),
                    'qichacha_secret': os.getenv('QICHACHA_SECRET'),
                    # 官方系统
                    'use_official': os.getenv('USE_OFFICIAL_REGISTRY', 'false').lower() == 'true',
                }
            )
        super().__init__(config)

    def fetch_supplier_info(self, company_name: str, **kwargs) -> Optional[SupplierData]:
        """
        获取企业工商信息

        Args:
            company_name: 企业全称或统一社会信用代码
            **kwargs:
                - include_shareholders: 包含股东信息
                - include_legal_cases: 包含法律诉讼

        Returns:
            SupplierData 或 None
        """
        # 优先尝试天眼查
        if self._has_tianyancha():
            try:
                return self._fetch_via_tianyancha(company_name, **kwargs)
            except DataSourceError as e:
                LOGGER.warning("Tianyancha fetch failed: %s", e)

        # 其次尝试企查查
        if self._has_qichacha():
            try:
                return self._fetch_via_qichacha(company_name, **kwargs)
            except DataSourceError as e:
                LOGGER.warning("Qichacha fetch failed: %s", e)

        # 返回说明
        return self._create_no_api_response(company_name)

    def _has_tianyancha(self) -> bool:
        """检查天眼查凭证"""
        return bool(self.config.config.get('tianyancha_token'))

    def _has_qichacha(self) -> bool:
        """检查企查查凭证"""
        cfg = self.config.config
        return bool(cfg.get('qichacha_key') and cfg.get('qichacha_secret'))

    def _fetch_via_tianyancha(self, company_name: str, **kwargs) -> SupplierData:
        """通过天眼查 API 获取"""
        # 实际实现使用天眼查开放平台 API
        # 文档：https://openapi.tianyancha.com/
        raise DataSourceUnavailableError(
            "天眼查 API 需要申请开放平台权限。\n"
            "或使用 Mock 数据进行测试。"
        )

    def _fetch_via_qichacha(self, company_name: str, **kwargs) -> SupplierData:
        """通过企查查 API 获取"""
        # 实际实现使用企查查 API
        # 文档：https://www.qcc.com/
        raise DataSourceUnavailableError(
            "企查查 API 需要申请权限。\n"
            "或使用 Mock 数据进行测试。"
        )

    def _create_no_api_response(self, company_name: str) -> Optional[SupplierData]:
        """无 API 时的说明响应"""
        LOGGER.warning(
            "Enterprise registry API is not configured for company %s. "
            "Configure TIANYANCHA_TOKEN, or QICHACHA_KEY plus QICHACHA_SECRET, "
            "or use mock data.",
            company_name,
        )
        return None


class MockEnterpriseSource(BaseSupplierDataSource):
    """
    企业信息 Mock 数据源

    用于测试和演示
    """

    def __init__(self, config: Optional[DataSourceConfig] = None):
        if config is None:
            config = DataSourceConfig(
                name='mock_enterprise',
                type=DataSourceType.LOCAL,
                enabled=True,
                config={}
            )
        super().__init__(config)

    def fetch_supplier_info(self, company_name: str, **kwargs) -> SupplierData:
        """返回模拟的企业信息"""
        return SupplierData(
            supplier_id=company_name,
            source='mock',
            company_name=company_name,
            legal_status='存续',
            established_date='2015-06-18',
            registered_capital='500万人民币',
            business_scope='批发零售; 进出口业务',
            legal_person='张某某',
            risk_level='low',
            risk_details=[],
            raw_data={'mock': True, 'note': 'Simulated data for testing'}
        )
