"""
自定义爬虫审计引擎

使用 requests + BeautifulSoup 进行基础 SEO 审计
无需外部依赖，适合快速检查
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from urllib import request, error
from .base_engine import BaseAuditEngine, AuditReport, AuditConfig


class CustomCrawlerEngine(BaseAuditEngine):
    """
    自定义爬虫审计引擎

    使用标准库进行基础的 SEO 检查：
    - 页面可访问性
    - 基础 Meta 标签
    - 响应时间
    - HTTP 状态码

    无需安装额外工具，作为降级方案使用。
    """

    def __init__(self, config: Optional[AuditConfig] = None):
        if config is None:
            config = AuditConfig(
                name='custom_crawler',
                config={
                    'user_agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)',
                    'follow_redirects': True,
                    'max_redirects': 5,
                }
            )
        super().__init__(config)

    def is_available(self) -> bool:
        """始终可用（使用标准库）"""
        return True

    def audit(self, url: str, **kwargs) -> Optional[AuditReport]:
        """
        执行基础 SEO 审计

        Args:
            url: 目标 URL

        Returns:
            AuditReport（基础信息）
        """
        try:
            start_time = datetime.now()

            req = request.Request(
                url,
                headers={
                    'User-Agent': self.config.config.get('user_agent'),
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            )

            with request.urlopen(req, timeout=self.config.timeout) as response:
                html = response.read().decode('utf-8', errors='ignore')
                duration = (datetime.now() - start_time).total_seconds() * 1000

                return self._analyze_page(url, html, response, duration)

        except error.HTTPError as e:
            return self._create_error_report(url, f"HTTP {e.code}: {e.reason}")
        except error.URLError as e:
            return self._create_error_report(url, f"URL Error: {e.reason}")
        except OSError as e:
            return self._create_error_report(url, f"Error: {str(e)}")

    def _analyze_page(self, url: str, html: str, response, duration_ms: float) -> AuditReport:
        """分析页面内容"""
        issues = []
        scores = {'seo': 50}  # 基础分

        # 检查标题
        title = self._extract_tag(html, 'title')
        if not title:
            issues.append({
                'id': 'missing-title',
                'title': 'Missing Title Tag',
                'description': 'Page does not have a title tag',
                'severity': 'error',
            })
            scores['seo'] -= 20
        elif len(title) > 60:
            issues.append({
                'id': 'title-too-long',
                'title': 'Title Too Long',
                'description': f'Title is {len(title)} chars (recommended: < 60)',
                'severity': 'warning',
            })

        # 检查 Meta Description
        description = self._extract_meta(html, 'description')
        if not description:
            issues.append({
                'id': 'missing-description',
                'title': 'Missing Meta Description',
                'description': 'Page does not have a meta description',
                'severity': 'warning',
            })
            scores['seo'] -= 10

        # 检查 H1
        h1_count = html.count('<h1') + html.count('<H1')
        if h1_count == 0:
            issues.append({
                'id': 'missing-h1',
                'title': 'Missing H1 Tag',
                'description': 'Page does not have an H1 heading',
                'severity': 'warning',
            })
        elif h1_count > 1:
            issues.append({
                'id': 'multiple-h1',
                'title': 'Multiple H1 Tags',
                'description': f'Page has {h1_count} H1 tags (recommended: 1)',
                'severity': 'warning',
            })

        # 检查视口标签
        viewport = self._extract_meta(html, 'viewport')
        if not viewport:
            issues.append({
                'id': 'missing-viewport',
                'title': 'Missing Viewport Meta',
                'description': 'Page is not mobile-friendly',
                'severity': 'error',
            })

        scores['seo'] = max(0, scores['seo'])

        return AuditReport(
            url=url,
            engine='custom_crawler',
            scores=scores,
            metrics={
                'response_time_ms': duration_ms,
                'page_size_bytes': len(html),
                'status_code': response.getcode(),
            },
            issues=issues,
            raw_data={
                'title': title,
                'description': description,
                'h1_count': h1_count,
            },
            duration_ms=int(duration_ms),
        )

    def _extract_tag(self, html: str, tag: str) -> Optional[str]:
        """提取标签内容"""
        start = html.find(f'<{tag}')
        if start == -1:
            return None
        start = html.find('>', start) + 1
        end = html.find(f'</{tag}>', start)
        if end == -1:
            return None
        return html[start:end].strip()

    def _extract_meta(self, html: str, name: str) -> Optional[str]:
        """提取 meta 标签内容"""
        # 查找 name="xxx" 或 property="xxx"
        patterns = [
            f'name="{name}" content="',
            f'name=\'{name}\' content=\'',
            f'property="{name}" content="',
            f'property=\'{name}\' content=\'',
        ]
        for pattern in patterns:
            idx = html.lower().find(pattern.lower())
            if idx != -1:
                start = idx + len(pattern)
                quote = pattern[-1]
                end = html.find(quote, start)
                if end != -1:
                    return html[start:end]
        return None

    def _create_error_report(self, url: str, error_msg: str) -> AuditReport:
        """创建错误报告"""
        return AuditReport(
            url=url,
            engine='custom_crawler',
            scores={'seo': 0},
            metrics={},
            issues=[{
                'id': 'audit-failed',
                'title': 'Audit Failed',
                'description': error_msg,
                'severity': 'error',
            }],
        )
