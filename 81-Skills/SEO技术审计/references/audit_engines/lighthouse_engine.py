"""
Lighthouse 审计引擎

支持本地 Lighthouse CLI 和 Chrome DevTools Protocol
需要安装 Node.js 和 Lighthouse
"""

import json
import subprocess
import logging
from typing import Optional, Dict, Any
from .base_engine import BaseAuditEngine, AuditReport, AuditConfig


LOGGER = logging.getLogger(__name__)


class LighthouseEngine(BaseAuditEngine):
    """
    Lighthouse 本地审计引擎

    使用本地安装的 lighthouse 命令行工具进行审计。
    需要先安装: npm install -g lighthouse
    """

    def __init__(self, config: Optional[AuditConfig] = None):
        if config is None:
            config = AuditConfig(
                name='lighthouse',
                config={
                    'chrome_flags': ['--headless', '--no-sandbox'],
                    'preset': 'desktop',  # desktop | mobile
                    'categories': ['performance', 'seo', 'accessibility', 'best-practices'],
                }
            )
        super().__init__(config)

    def is_available(self) -> bool:
        """检查 lighthouse 是否已安装"""
        try:
            result = subprocess.run(
                ['lighthouse', '--version'],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False

    def audit(self, url: str, **kwargs) -> Optional[AuditReport]:
        """
        使用 Lighthouse 审计网站

        Args:
            url: 目标 URL
            **kwargs:
                - preset: 'desktop' 或 'mobile'
                - categories: 审计类别列表

        Returns:
            AuditReport
        """
        if not self.is_available():
            LOGGER.warning("Lighthouse is not available; install with npm install -g lighthouse")
            return None

        preset = kwargs.get('preset', self.config.config.get('preset', 'desktop'))
        categories = kwargs.get('categories', self.config.config.get('categories'))

        # 构建命令
        cmd = [
            'lighthouse',
            url,
            '--output=json',
            '--chrome-flags="--headless --no-sandbox"',
        ]

        if preset == 'mobile':
            cmd.append('--preset=desktop')
        else:
            cmd.append('--preset=desktop')

        # 执行审计
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.config.timeout
            )

            if result.returncode != 0:
                LOGGER.warning("Lighthouse audit failed: %s", result.stderr)
                return None

            # 解析结果
            data = json.loads(result.stdout)
            return self._parse_report(url, data)

        except subprocess.TimeoutExpired:
            LOGGER.warning("Lighthouse audit timeout after %ss", self.config.timeout)
            return None
        except json.JSONDecodeError as e:
            LOGGER.warning("Failed to parse Lighthouse output: %s", e)
            return None

    def _parse_report(self, url: str, data: Dict) -> AuditReport:
        """解析 Lighthouse JSON 输出"""
        categories = data.get('categories', {})
        audits = data.get('audits', {})

        scores = {
            'performance': categories.get('performance', {}).get('score', 0) * 100,
            'seo': categories.get('seo', {}).get('score', 0) * 100,
            'accessibility': categories.get('accessibility', {}).get('score', 0) * 100,
            'best_practices': categories.get('best-practices', {}).get('score', 0) * 100,
        }

        metrics = {
            'lcp': audits.get('largest-contentful-paint', {}).get('numericValue', 0),
            'fid': audits.get('max-potential-fid', {}).get('numericValue', 0),
            'cls': audits.get('cumulative-layout-shift', {}).get('numericValue', 0),
            'fcp': audits.get('first-contentful-paint', {}).get('numericValue', 0),
            'ttfb': audits.get('server-response-time', {}).get('numericValue', 0),
        }

        issues = []
        for audit_id, audit in audits.items():
            if audit.get('score') == 0:  # 失败的审计
                issues.append({
                    'id': audit_id,
                    'title': audit.get('title'),
                    'description': audit.get('description'),
                    'severity': 'error' if audit.get('scoreDisplayMode') == 'error' else 'warning',
                })

        return AuditReport(
            url=url,
            engine='lighthouse',
            scores=scores,
            metrics=metrics,
            issues=issues,
            raw_data=data,
            duration_ms=data.get('timing', {}).get('total', 0),
        )
