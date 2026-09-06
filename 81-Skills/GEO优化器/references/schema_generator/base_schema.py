"""
结构化数据生成器基类

定义统一的 Schema.org 结构化数据生成接口
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
import json


@dataclass
class SchemaField:
    """Schema 字段定义"""
    name: str
    field_type: str  # 'string', 'number', 'boolean', 'object', 'array', 'date'
    required: bool = False
    default: Any = None
    description: str = ""


class BaseSchema(ABC):
    """
    Schema.org 结构化数据生成器基类

    子类需要实现：
    - schema_type: Schema.org 类型名称
    - get_fields(): 返回字段定义列表
    - generate(): 生成最终的 JSON-LD 数据
    """

    schema_type: str = "Thing"
    context: str = "https://schema.org"

    def __init__(self, data: Dict[str, Any], config: Optional[Dict] = None):
        """
        Args:
            data: Schema 数据字典
            config: 可选配置
        """
        self.data = data
        self.config = config or {}
        self._validated = False
        self._errors = []

    @abstractmethod
    def get_fields(self) -> List[SchemaField]:
        """返回此 Schema 的字段定义列表"""
        pass

    @abstractmethod
    def generate(self) -> Dict[str, Any]:
        """
        生成 Schema.org 结构化数据

        Returns:
            JSON-LD 格式的字典
        """
        pass

    def validate(self) -> bool:
        """
        验证数据是否满足必需字段

        Returns:
            True if valid, False otherwise
        """
        self._errors = []
        fields = self.get_fields()

        for field in fields:
            if field.required and field.name not in self.data:
                self._errors.append(f"Missing required field: {field.name}")

        self._validated = True
        return len(self._errors) == 0

    def get_errors(self) -> List[str]:
        """获取验证错误列表"""
        if not self._validated:
            self.validate()
        return self._errors

    def to_json_ld(self, pretty: bool = True) -> str:
        """
        生成 JSON-LD 字符串

        Args:
            pretty: 是否格式化输出

        Returns:
            JSON-LD 字符串
        """
        schema_data = self.generate()
        indent = 2 if pretty else None
        return json.dumps(schema_data, indent=indent, ensure_ascii=False)

    def to_html(self, pretty: bool = True) -> str:
        """
        生成 HTML script 标签格式的 JSON-LD

        Args:
            pretty: 是否格式化输出

        Returns:
            HTML script 标签字符串
        """
        json_ld = self.to_json_ld(pretty=pretty)
        return f'<script type="application/ld+json">\n{json_ld}\n</script>'

    def _build_base(self) -> Dict[str, Any]:
        """构建基础 Schema 结构"""
        return {
            "@context": self.context,
            "@type": self.schema_type,
        }

    def _get_value(self, key: str, default: Any = None) -> Any:
        """安全获取数据值"""
        return self.data.get(key, default)

    def _is_valid(self) -> bool:
        """检查数据是否有效（无空值）"""
        return self.validate()
