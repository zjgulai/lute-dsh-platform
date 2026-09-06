"""
供应商本地缓存

本地存储供应商评估结果，避免重复查询
"""

import json
import os
from typing import Optional, Dict, List
from datetime import datetime, timedelta
from .base_source import SupplierData


class SupplierCache:
    """
    供应商本地缓存管理器

    功能：
    - 缓存供应商评估结果
    - 设置 TTL 自动过期
    - 支持持久化到文件
    """

    def __init__(self, cache_dir: str = ".cache/suppliers", default_ttl: int = 86400):
        """
        Args:
            cache_dir: 缓存目录
            default_ttl: 默认缓存时间（秒，默认1天）
        """
        self.cache_dir = cache_dir
        self.default_ttl = default_ttl
        os.makedirs(cache_dir, exist_ok=True)

        # 内存缓存
        self._memory_cache: Dict[str, dict] = {}

    def get(self, supplier_id: str) -> Optional[SupplierData]:
        """
        获取缓存的供应商数据

        Args:
            supplier_id: 供应商ID

        Returns:
            SupplierData 或 None（不存在/已过期）
        """
        filepath = self._get_filepath(supplier_id)

        if not os.path.exists(filepath):
            return None

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 检查是否过期
            cached_time = datetime.fromisoformat(data['cached_at'])
            ttl = data.get('ttl', self.default_ttl)

            if datetime.now() - cached_time > timedelta(seconds=ttl):
                # 已过期，删除
                os.remove(filepath)
                return None

            # 重建 SupplierData
            return SupplierData(**data['supplier_data'])

        except (json.JSONDecodeError, KeyError, TypeError):
            # 文件损坏
            os.remove(filepath)
            return None

    def set(self, supplier_id: str, data: SupplierData, ttl: int = None):
        """
        缓存供应商数据

        Args:
            supplier_id: 供应商ID
            data: 供应商数据
            ttl: 过期时间（秒）
        """
        ttl = ttl or self.default_ttl

        cache_entry = {
            'supplier_id': supplier_id,
            'supplier_data': {
                'supplier_id': data.supplier_id,
                'source': data.source,
                'company_name': data.company_name,
                'legal_status': data.legal_status,
                'established_date': data.established_date,
                'registered_capital': data.registered_capital,
                'business_scope': data.business_scope,
                'legal_person': data.legal_person,
                'risk_level': data.risk_level,
                'risk_details': data.risk_details,
                'platform_data': data.platform_data,
                'raw_data': data.raw_data,
                'timestamp': data.timestamp.isoformat() if data.timestamp else None,
            },
            'cached_at': datetime.now().isoformat(),
            'ttl': ttl,
        }

        filepath = self._get_filepath(supplier_id)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(cache_entry, f, ensure_ascii=False, indent=2)

    def delete(self, supplier_id: str):
        """删除缓存"""
        filepath = self._get_filepath(supplier_id)
        if os.path.exists(filepath):
            os.remove(filepath)

    def clear(self):
        """清空所有缓存"""
        for filename in os.listdir(self.cache_dir):
            if filename.endswith('.json'):
                os.remove(os.path.join(self.cache_dir, filename))

    def list_cached(self) -> List[str]:
        """列出所有已缓存的供应商ID"""
        return [f.replace('.json', '') for f in os.listdir(self.cache_dir) if f.endswith('.json')]

    def get_stats(self) -> dict:
        """获取缓存统计"""
        files = [f for f in os.listdir(self.cache_dir) if f.endswith('.json')]
        return {
            'total_cached': len(files),
            'cache_dir': self.cache_dir,
            'default_ttl': self.default_ttl,
        }

    def _get_filepath(self, supplier_id: str) -> str:
        """获取缓存文件路径"""
        # 清理文件名
        safe_id = "".join(c for c in supplier_id if c.isalnum() or c in ('-', '_')).rstrip()
        return os.path.join(self.cache_dir, f"{safe_id}.json")
