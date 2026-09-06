"""
数据校验共享模块 (Data Validator)

提供所有数据处理类 Skill 共享的输入校验、格式检测和质量报告生成。

使用:
    from skills._shared.data_validator import detect_csv_format, validate_fields, generate_quality_report
"""

from __future__ import annotations
from collections.abc import Sized
from typing import Optional
from dataclasses import dataclass, field

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False


# ═══════════════════════════════════════════════════════
# Platform Detection
# ═══════════════════════════════════════════════════════

PLATFORM_SIGNATURES = {
    'taobao': ['订单编号', '买家会员名', '订单创建时间', '商品标题'],
    'jd': ['京东订单号', '下单时间', '商品名称', '商品编号'],
    'pinduoduo': ['订单号', '商品', '收货人', '实付金额'],
    'douyin': ['订单ID', '商品名称', '下单时间', '商家'],
    'amazon': ['order-id', 'purchase-date', 'product-name', 'asin'],
    'shopify': ['Name', 'Created at', 'Lineitem name', 'Lineitem sku'],
}


def detect_platform_format(df: 'pd.DataFrame') -> str:
    """
    根据列名特征自动检测数据平台来源。

    Args:
        df: 原始 DataFrame

    Returns:
        str: 平台名 ('taobao'/'jd'/'pinduoduo'/'douyin'/'amazon'/'shopify'/'unknown')
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    cols = set(df.columns)
    best_match = 'unknown'
    best_score = 0

    for platform, sig_cols in PLATFORM_SIGNATURES.items():
        hits = sum(1 for c in sig_cols if c in cols)
        if hits > best_score:
            best_score = hits
            best_match = platform

    return best_match if best_score >= 2 else 'unknown'


# ═══════════════════════════════════════════════════════
# Data Quality
# ═══════════════════════════════════════════════════════

@dataclass
class DataQualityReport:
    """数据质量报告"""
    total_rows: int = 0
    total_columns: int = 0
    duplicate_rows: int = 0
    missing_values: dict[str, int] = field(default_factory=dict)  # 列名 -> 缺失数
    anomaly_rows: dict[str, int] = field(default_factory=dict)    # 列名 -> 异常数
    invalid_dates: int = 0
    negative_amounts: int = 0
    zero_amounts: int = 0
    detected_platform: str = 'unknown'
    is_ready: bool = False

    def to_dict(self) -> dict:
        return {
            'total_rows': self.total_rows,
            'total_columns': self.total_columns,
            'duplicate_rows': self.duplicate_rows,
            'missing_values': self.missing_values,
            'anomaly_rows': self.anomaly_rows,
            'invalid_dates': self.invalid_dates,
            'negative_amounts': self.negative_amounts,
            'zero_amounts': self.zero_amounts,
            'detected_platform': self.detected_platform,
            'is_ready': self.is_ready,
        }


def generate_quality_report(
    df: 'pd.DataFrame',
    required_fields: list[str] = None,
    numeric_fields: list[str] = None,
    date_field: str = None,
    id_field: str = None,
    amount_field: str = None,
) -> DataQualityReport:
    """
    生成数据质量报告: 检查缺失值、重复行、异常值和日期有效性。

    Args:
        df: 原始 DataFrame
        required_fields: 必需字段列表
        numeric_fields: 应为数值的字段列表
        date_field: 日期字段名
        id_field: ID 字段名 (用于去重检测)
        amount_field: 金额字段名

    Returns:
        DataQualityReport: 质量报告
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    report = DataQualityReport(
        total_rows=len(df),
        total_columns=len(df.columns),
    )

    # 平台检测
    report.detected_platform = detect_platform_format(df)

    # 去重检测
    if id_field and id_field in df.columns:
        report.duplicate_rows = int(df[id_field].duplicated().sum())

    # 缺失值
    if required_fields:
        for field in required_fields:
            if field in df.columns:
                missing = int(df[field].isna().sum())
                if missing > 0:
                    report.missing_values[field] = missing

    # 日期有效性
    if date_field and date_field in df.columns:
        try:
            parsed = pd.to_datetime(df[date_field], errors='coerce')
            report.invalid_dates = int(parsed.isna().sum() - df[date_field].isna().sum())
        except Exception:
            report.invalid_dates = len(df)

    # 负值/零值金额
    if amount_field and amount_field in df.columns:
        amounts = pd.to_numeric(df[amount_field], errors='coerce')
        report.negative_amounts = int((amounts < 0).sum())
        report.zero_amounts = int((amounts == 0).sum())

    # 数值字段异常 (IQR 方法)
    if numeric_fields:
        for field in numeric_fields:
            if field in df.columns:
                vals = pd.to_numeric(df[field], errors='coerce')
                q1, q3 = vals.quantile(0.25), vals.quantile(0.75)
                iqr = q3 - q1
                lower, upper = q1 - 3 * iqr, q3 + 3 * iqr
                anomalies = int(((vals < lower) | (vals > upper)).sum())
                if anomalies > 0:
                    report.anomaly_rows[field] = anomalies

    # 判断是否可用
    critical_issues = (
        report.total_rows == 0 or
        (required_fields and len(report.missing_values) == len(required_fields))
    )
    report.is_ready = not critical_issues

    return report


# ═══════════════════════════════════════════════════════
# Field Validation
# ═══════════════════════════════════════════════════════

def validate_fields(df: 'pd.DataFrame', required_fields: list[str]) -> tuple[bool, list[str]]:
    """
    校验 DataFrame 是否包含所有必需字段。

    Returns:
        (is_valid, missing_fields_list)
    """
    missing = [f for f in required_fields if f not in df.columns]
    return len(missing) == 0, missing


def detect_outliers(series: 'pd.Series', method: str = 'iqr', threshold: float = 3.0) -> 'pd.Series':
    """
    检测数值列的异常值。

    Args:
        series: 数值列
        method: 'iqr' (四分位距) 或 'zscore' (Z分数)
        threshold: IQR 倍数或 Z-score 阈值

    Returns:
        pd.Series: 布尔掩码, True=异常
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    if method == 'iqr':
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        return (series < q1 - threshold * iqr) | (series > q3 + threshold * iqr)
    elif method == 'zscore':
        mean, std = series.mean(), series.std()
        if std == 0:
            return pd.Series(False, index=series.index)
        zscore = (series - mean).abs() / std
        return zscore > threshold
    else:
        raise ValueError(f"Unknown method: {method}")


# ═══════════════════════════════════════════════════════
# Multi-Platform Merge
# ═══════════════════════════════════════════════════════

def merge_multi_platform_dfs(
    platform_dfs: dict[str, 'pd.DataFrame'],
    field_maps: dict[str, dict] = None,
) -> 'pd.DataFrame':
    """
    合并多平台订单数据到统一格式。

    Args:
        platform_dfs: {平台名: DataFrame}
        field_maps: {平台名: {原始列名: 标准列名}}

    Returns:
        pd.DataFrame: 统一格式的合并 DataFrame
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    merged_parts = []
    for platform, df in platform_dfs.items():
        mapping = (field_maps or {}).get(platform, {})
        if mapping:
            df = df.rename(columns=mapping)
        df['platform'] = platform
        merged_parts.append(df)

    if not merged_parts:
        return pd.DataFrame()

    return pd.concat(merged_parts, ignore_index=True)


# ═══════════════════════════════════════════════════════
# Sample Size Check
# ═══════════════════════════════════════════════════════

def check_sample_size(df: Sized, min_rows: int = 30) -> dict:
    """
    检查数据样本是否足够进行统计推断。

    Returns:
        dict: {is_sufficient: bool, actual_rows: int, min_required: int, message: str}
    """
    actual = len(df)
    return {
        'is_sufficient': actual >= min_rows,
        'actual_rows': actual,
        'min_required': min_rows,
        'message': (
            f"数据充足 ({actual} 行 >= {min_rows})"
            if actual >= min_rows else
            f"数据不足 ({actual} 行 < {min_rows} 行最低要求), 分析结论置信度降低"
        ),
    }
