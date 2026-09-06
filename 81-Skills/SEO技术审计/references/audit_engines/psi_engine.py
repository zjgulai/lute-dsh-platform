"""
PageSpeed Insights API 引擎

使用 Google PageSpeed Insights API 进行远程审计
无需本地安装，需要 API Key
"""

import os
import json
import logging
from typing import Optional, Dict, Any
from urllib import request, parse, error
from .base_engine import BaseAuditEngine, AuditReport, AuditConfig


LOGGER = logging.getLogger(__name__)


class PageSpeedInsightsEngine(BaseAuditEngine):
    """
    PageSpeed Insights API 引擎

    使用 Google 的远程 API 进行网站审计，
    无需本地安装 Lighthouse，但需要 API Key。

    API 文档: https://developers.google.com/speed/docs/insights/v5/get-started
    """

    API_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

    def __init__(self, config: Optional[AuditConfig] = None):
        if config is None:
            config = AuditConfig(
                name='pagespeed_insights',
                config={
                    'api_key': os.getenv('GOOGLE_PSI_API_KEY'),
                    'strategy': 'desktop',  # desktop | mobile
                    'categories': ['PERFORMANCE', 'SEO', 'ACCESSIBILITY', 'BEST_PRACTICES'],
                }
            )
        super().__init__(config)

    def is_available(self) -> bool:
        """检查是否有 API Key"""
        return bool(self.config.config.get('api_key'))

    def audit(self, url: str, **kwargs) -> Optional[AuditReport]:
        """
        使用 PSI API 审计网站

        Args:
            url: 目标 URL
            **kwargs:
                - strategy: 'desktop' 或 'mobile'
                - locale: 语言地区

        Returns:
            AuditReport
        """
        api_key = self.config.config.get('api_key')
        if not api_key:
            LOGGER.warning("PageSpeed Insights API key is not configured; set GOOGLE_PSI_API_KEY")
            return None

        strategy = kwargs.get('strategy', self.config.config.get('strategy', 'desktop'))
        categories = self.config.config.get('categories', ['PERFORMANCE', 'SEO'])

        # 构建请求 URL
        params = {
            'url': url,
            'key': api_key,
            'strategy': strategy,
        }
        for cat in categories:
            params[f'category'] = cat

        url_with_params = f"{self.API_BASE}?{parse.urlencode(params)}"

        try:
            req = request.Request(
                url_with_params,
                headers={
                    'Accept': 'application/json',
                    'Referer': 'https://claude-code.local',
                }
            )

            with request.urlopen(req, timeout=self.config.timeout) as response:
                data = json.loads(response.read().decode('utf-8'))
                return self._parse_report(url, data)

        except (error.URLError, OSError, json.JSONDecodeError) as e:
            LOGGER.warning("PSI API request failed: %s", e)
            return None

    def _parse_report(self, url: str, data: Dict) -> AuditReport:
        """解析 PSI API 响应"""
        lighthouse = data.get('lighthouseResult', {})
        categories = lighthouse.get('categories', {})
        audits = lighthouse.get('audits', {})

        scores = {
            'performance': categories.get('performance', {}).get('score', 0) * 100,
            'seo': categories.get('seo', {}).get('score', 0) * 100,
            'accessibility': categories.get('accessibility', {}).get('score', 0) * 100,
            'best_practices': categories.get('best-practices', {}).get('score', 0) * 100,
        }

        metrics = {
            'lcp': self._get_metric_value(audits, 'largest-contentful-paint'),
            'fid': self._get_metric_value(audits, 'max-potential-fid'),
            'cls': self._get_metric_value(audits, 'cumulative-layout-shift'),
            'fcp': self._get_metric_value(audits, 'first-contentful-paint'),
        }

        issues = []
        for audit_id, audit in audits.items():
            if audit.get('score') == 0:
                issues.append({
                    'id': audit_id,
                    'title': audit.get('title'),
                    'description': audit.get('description'),
                    'severity': 'error',
                })

        return AuditReport(
            url=url,
            engine='pagespeed_insights',
            scores=scores,
            metrics=metrics,
            issues=issues,
            raw_data=data,
        )

    def _get_metric_value(self, audits: Dict, metric_id: str) -> float:
        """获取指标数值"""
        audit = audits.get(metric_id, {})
        return audit.get('numericValue', 0)
