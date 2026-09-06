"""
SEO 审计引擎模块

支持多种审计工具：
- Lighthouse: 本地/远程性能审计
- PageSpeed Insights: Google API 审计
- Custom Crawler: 自定义爬虫

Usage:
    from audit_engines import get_audit_engine

    engine = get_audit_engine('lighthouse')
    report = engine.audit('https://example.com')
"""

from .base_engine import BaseAuditEngine, AuditReport, AuditConfig
from .lighthouse_engine import LighthouseEngine
from .psi_engine import PageSpeedInsightsEngine
from .custom_crawler import CustomCrawlerEngine
from .factory import get_audit_engine, list_engines

__all__ = [
    'BaseAuditEngine',
    'AuditReport',
    'AuditConfig',
    'LighthouseEngine',
    'PageSpeedInsightsEngine',
    'CustomCrawlerEngine',
    'get_audit_engine',
    'list_engines',
]
