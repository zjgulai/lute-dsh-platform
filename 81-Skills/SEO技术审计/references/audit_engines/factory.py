"""
审计引擎工厂

管理所有审计引擎的注册、创建和获取
"""

from typing import Dict, Optional
import logging
import os
import yaml
from .base_engine import BaseAuditEngine, AuditConfig
from .lighthouse_engine import LighthouseEngine
from .psi_engine import PageSpeedInsightsEngine
from .custom_crawler import CustomCrawlerEngine


LOGGER = logging.getLogger(__name__)

# 全局引擎注册表
_ENGINE_REGISTRY: Dict[str, type] = {
    'lighthouse': LighthouseEngine,
    'pagespeed_insights': PageSpeedInsightsEngine,
    'custom_crawler': CustomCrawlerEngine,
}

# 引擎实例缓存
_ENGINE_INSTANCES: Dict[str, BaseAuditEngine] = {}


def register_engine(name: str, engine_class: type):
    """注册新的审计引擎"""
    if not issubclass(engine_class, BaseAuditEngine):
        raise ValueError(f"Engine class must inherit from BaseAuditEngine")
    _ENGINE_REGISTRY[name] = engine_class


def get_audit_engine(name: str, config: Optional[AuditConfig] = None) -> Optional[BaseAuditEngine]:
    """获取或创建审计引擎实例"""
    if name in _ENGINE_INSTANCES and config is None:
        return _ENGINE_INSTANCES[name]

    if name not in _ENGINE_REGISTRY:
        LOGGER.warning(
            "Unknown audit engine %s. Available engines: %s",
            name,
            list(_ENGINE_REGISTRY.keys()),
        )
        return None

    engine_class = _ENGINE_REGISTRY[name]
    engine = engine_class(config)

    if config is None:
        _ENGINE_INSTANCES[name] = engine

    return engine


def list_engines() -> Dict[str, str]:
    """列出所有注册的引擎"""
    return {
        name: cls.__doc__.split('\n')[0] if cls.__doc__ else "No description"
        for name, cls in _ENGINE_REGISTRY.items()
    }


def create_seo_auditor(config_path: str = None):
    """创建 SEO 审计器（返回当前可用的首选引擎，自包含，无外部 auditor 依赖）。"""
    if config_path and os.path.exists(config_path):
        engines = _load_engines_from_config(config_path)
        for name in ['lighthouse', 'pagespeed_insights', 'custom_crawler']:
            if name in engines:
                return engines[name]
        return None

    # 自动检测可用引擎：lighthouse → pagespeed_insights → custom_crawler
    for name in ['lighthouse', 'pagespeed_insights', 'custom_crawler']:
        engine = get_audit_engine(name)
        if engine and engine.is_available():
            return engine

    # 兜底：custom_crawler 始终可用
    return get_audit_engine('custom_crawler')


def _load_engines_from_config(config_path: str) -> Dict[str, BaseAuditEngine]:
    """从配置文件加载引擎"""
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    engines = {}
    for name, cfg in config.get('audit_engines', {}).items():
        engine_cfg = AuditConfig(
            name=name,
            enabled=cfg.get('enabled', True),
            priority=cfg.get('priority', 100),
            config=cfg.get('config', {})
        )

        engine = get_audit_engine(name, engine_cfg)
        if engine:
            engines[name] = engine

    return engines


def clear_cache():
    """清除所有缓存的引擎实例"""
    _ENGINE_INSTANCES.clear()
