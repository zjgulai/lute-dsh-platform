"""
电商 KPI 共享计算模块 (E-Commerce KPI Utilities)

所有电商分析类 Skill (ecom-*, da-ecom-insights) 的共享计算层。
提供 GMV/AOV/转化率/复购率/红绿信号等核心 KPI 的标准计算。

使用:
    from skills._shared.ecom_kpi import compute_core_kpis, detect_signals, compare_periods

数据假设:
    输入 DataFrame 需包含以下列 (名可用 field_mapping 配置):
    - order_id: 订单ID
    - order_date: 下单日期 (datetime)
    - order_amount: 订单金额 (float)
    - customer_id: 客户ID (str)
    - is_paid: 是否支付 (bool, 可选, 默认 True)
"""

from __future__ import annotations
from typing import Optional, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, field

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False


# ═══════════════════════════════════════════════════════
# Field Mapping
# ═══════════════════════════════════════════════════════

DEFAULT_FIELD_MAP = {
    'order_id': 'order_id',
    'order_date': 'order_date',
    'order_amount': 'order_amount',
    'customer_id': 'customer_id',
    'product_id': 'product_id',
    'product_name': 'product_name',
    'quantity': 'quantity',
    'is_paid': 'is_paid',
    'platform': 'platform',
}

TAOBAO_FIELD_MAP = {
    'order_id': '订单编号',
    'order_date': '订单创建时间',
    'order_amount': '订单金额(元)',
    'customer_id': '买家会员名',
    'product_name': '商品标题',
    'quantity': '购买数量',
    'is_paid': '订单状态',
    'platform': '平台',
}


def normalize_dataframe(df: 'pd.DataFrame', field_map: dict = None) -> 'pd.DataFrame':
    """
    将原始 DataFrame 的列名映射为标准字段名。
    若 'order_date' 不是 datetime, 自动尝试解析。

    Args:
        df: 原始 DataFrame
        field_map: 自定义字段映射, 默认使用 DEFAULT_FIELD_MAP

    Returns:
        pd.DataFrame: 标准化后的 DataFrame
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required for ecom_kpi module")

    mapping = field_map or DEFAULT_FIELD_MAP
    reverse_map = {v: k for k, v in mapping.items()}

    df = df.rename(columns=reverse_map)

    # 自动解析日期
    if 'order_date' in df.columns and not pd.api.types.is_datetime64_any_dtype(df['order_date']):
        df['order_date'] = pd.to_datetime(df['order_date'], errors='coerce')

    return df


# ═══════════════════════════════════════════════════════
# Data Structures
# ═══════════════════════════════════════════════════════

@dataclass
class KPIResult:
    """单周期 KPI 计算结果。"""
    period_start: str
    period_end: str
    total_orders: int = 0
    total_revenue: float = 0.0
    unique_customers: int = 0
    avg_order_value: float = 0.0
    conversion_rate: float = 0.0        # 支付订单/总订单 (需 is_paid 列)
    repeat_purchase_rate: float = 0.0   # 多单客户/总客户
    avg_items_per_order: float = 0.0
    refund_rate: float = 0.0            # 退款率 (需 is_refunded 列)

    def to_dict(self) -> dict:
        return {
            'period': f"{self.period_start} ~ {self.period_end}",
            'total_orders': self.total_orders,
            'total_revenue': round(self.total_revenue, 2),
            'unique_customers': self.unique_customers,
            'avg_order_value': round(self.avg_order_value, 2),
            'conversion_rate': f"{self.conversion_rate:.1%}",
            'repeat_purchase_rate': f"{self.repeat_purchase_rate:.1%}",
            'avg_items_per_order': round(self.avg_items_per_order, 1),
            'refund_rate': f"{self.refund_rate:.1%}",
        }


@dataclass
class ComparisonResult:
    """两周期对比结果。"""
    current: KPIResult
    previous: KPIResult
    changes: dict[str, float] = field(default_factory=dict)  # metric -> % change

    def to_dict(self) -> dict:
        return {
            'current': self.current.to_dict(),
            'previous': self.previous.to_dict(),
            'changes': {k: f"{v:+.1%}" for k, v in self.changes.items()},
        }


# ═══════════════════════════════════════════════════════
# Core KPI Computation
# ═══════════════════════════════════════════════════════

def compute_core_kpis(
    df: 'pd.DataFrame',
    start_date: str | datetime,
    end_date: str | datetime,
) -> KPIResult:
    """
    计算核心电商 KPI。

    Args:
        df: 标准化后的订单 DataFrame
        start_date: 周期开始日期
        end_date: 周期结束日期

    Returns:
        KPIResult: KPI 计算结果
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    start = pd.Timestamp(start_date)
    end = pd.Timestamp(end_date)

    period_df = df[(df['order_date'] >= start) & (df['order_date'] <= end)].copy()

    result = KPIResult(
        period_start=str(start.date()),
        period_end=str(end.date()),
    )

    if period_df.empty:
        return result

    result.total_orders = len(period_df)
    result.total_revenue = float(period_df['order_amount'].sum())

    if 'customer_id' in period_df.columns:
        customer_orders = period_df.groupby('customer_id').size()
        result.unique_customers = len(customer_orders)
        result.repeat_purchase_rate = float(
            (customer_orders > 1).sum() / max(len(customer_orders), 1)
        )

    if result.total_orders > 0:
        result.avg_order_value = result.total_revenue / result.total_orders

    if 'is_paid' in period_df.columns and 'order_id' in period_df.columns:
        paid = period_df[period_df['is_paid'].astype(bool)]
        total = len(period_df['order_id'].unique())
        result.conversion_rate = len(paid['order_id'].unique()) / max(total, 1)

    if 'quantity' in period_df.columns:
        result.avg_items_per_order = float(period_df['quantity'].sum() / max(result.total_orders, 1))

    if 'is_refunded' in period_df.columns:
        refunded = period_df[period_df['is_refunded'].astype(bool)]
        result.refund_rate = len(refunded) / max(result.total_orders, 1)

    return result


def compute_daily_kpis(df: 'pd.DataFrame', start_date: str, end_date: str) -> list[dict]:
    """计算每日 KPI 序列, 用于趋势分析。"""
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    start = pd.Timestamp(start_date)
    end = pd.Timestamp(end_date)
    period_df = df[(df['order_date'] >= start) & (df['order_date'] <= end)].copy()
    period_df['date_key'] = period_df['order_date'].dt.date

    daily = []
    for date_val, day_df in period_df.groupby('date_key'):
        daily.append({
            'date': str(date_val),
            'orders': len(day_df),
            'revenue': float(day_df['order_amount'].sum()),
            'customers': day_df['customer_id'].nunique() if 'customer_id' in day_df.columns else 0,
            'aov': float(day_df['order_amount'].mean()) if len(day_df) > 0 else 0,
        })

    daily.sort(key=lambda x: x['date'])
    return daily


# ═══════════════════════════════════════════════════════
# Period Comparison
# ═══════════════════════════════════════════════════════

def compare_periods(
    df: 'pd.DataFrame',
    current_start: str,
    current_end: str,
    previous_start: str,
    previous_end: str,
) -> ComparisonResult:
    """
    两周期对比: 计算各 KPI 的环比变化。

    Args:
        df: 标准化后的订单 DataFrame
        current_start/end: 当期范围
        previous_start/end: 上期范围

    Returns:
        ComparisonResult: 对比结果
    """
    current = compute_core_kpis(df, current_start, current_end)
    previous = compute_core_kpis(df, previous_start, previous_end)

    metrics = ['total_orders', 'total_revenue', 'unique_customers',
               'avg_order_value', 'conversion_rate', 'repeat_purchase_rate']

    changes = {}
    for m in metrics:
        curr_val = getattr(current, m, 0)
        prev_val = getattr(previous, m, 0)
        if prev_val and prev_val != 0:
            changes[m] = (curr_val - prev_val) / prev_val
        else:
            changes[m] = 0.0

    return ComparisonResult(current=current, previous=previous, changes=changes)


# ═══════════════════════════════════════════════════════
# Signal Detection (红绿信号)
# ═══════════════════════════════════════════════════════

@dataclass
class Signal:
    """业务信号: 红色 = 异常/风险, 绿色 = 正向/机会"""
    metric: str
    severity: str      # 'red' | 'green' | 'neutral'
    current_value: float
    threshold: float
    change_pct: float
    message: str


def detect_signals(
    current: KPIResult,
    previous: KPIResult,
    thresholds: dict = None,
) -> list[Signal]:
    """
    基于两周期对比检测红绿信号。

    信号规则:
    - 销售额暴跌 > 20% → RED
    - AOV 下降 > 10% → RED
    - 复购率提升 > 5% → GREEN
    - 退款率上升 > 5pp → RED

    Args:
        current: 当期 KPI
        previous: 上期 KPI
        thresholds: 自定义阈值

    Returns:
        list[Signal]: 信号列表
    """
    defaults = {
        'revenue_drop_red': -0.20,
        'aov_drop_red': -0.10,
        'repeat_rise_green': 0.05,
        'refund_rise_red': 0.05,
    }
    t = {**defaults, **(thresholds or {})}

    signals: list[Signal] = []

    def _pct(a: float, b: float) -> float:
        return (a - b) / b if b and b != 0 else 0.0

    # 销售额变化
    rev_pct = _pct(current.total_revenue, previous.total_revenue)
    if rev_pct <= t['revenue_drop_red']:
        signals.append(Signal('total_revenue', 'red', current.total_revenue,
                              t['revenue_drop_red'], rev_pct,
                              f"销售额环比下降 {abs(rev_pct):.0%}，超过警戒线 {abs(t['revenue_drop_red']):.0%}"))
    elif rev_pct >= 0.10:
        signals.append(Signal('total_revenue', 'green', current.total_revenue,
                              0.10, rev_pct, f"销售额环比增长 {rev_pct:.0%}"))

    # AOV 变化
    aov_pct = _pct(current.avg_order_value, previous.avg_order_value)
    if aov_pct <= t['aov_drop_red']:
        signals.append(Signal('avg_order_value', 'red', current.avg_order_value,
                              t['aov_drop_red'], aov_pct,
                              f"客单价环比下降 {abs(aov_pct):.0%}，需关注定价或品类结构"))

    # 复购率变化
    rpr_pct = _pct(current.repeat_purchase_rate, previous.repeat_purchase_rate)
    if rpr_pct >= t['repeat_rise_green']:
        signals.append(Signal('repeat_purchase_rate', 'green', current.repeat_purchase_rate,
                              t['repeat_rise_green'], rpr_pct,
                              f"复购率环比提升 {rpr_pct:.0%}，用户粘性增强"))

    # 退款率变化
    rfd_pct = _pct(current.refund_rate, previous.refund_rate)
    if rfd_pct >= t['refund_rise_red'] and current.refund_rate > 0.03:
        signals.append(Signal('refund_rate', 'red', current.refund_rate,
                              t['refund_rise_red'], rfd_pct,
                              f"退款率异常上升 {rfd_pct:.0%}，需排查产品质量或描述准确性"))

    # 按严重程度排序: red 在前
    signals.sort(key=lambda s: (0 if s.severity == 'red' else 1))
    return signals


# ═══════════════════════════════════════════════════════
# Top SKU Ranking
# ═══════════════════════════════════════════════════════

def rank_top_skus(df: 'pd.DataFrame', metric: str = 'revenue', top_n: int = 10) -> list[dict]:
    """
    按指定指标排名 Top SKU。

    Args:
        df: 标准化 DataFrame (需含 product_name/product_id)
        metric: 'revenue' | 'orders' | 'quantity'
        top_n: 返回数量

    Returns:
        list[dict]: [{product_name, product_id, revenue/orders, share_pct}, ...]
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    group_col = 'product_name' if 'product_name' in df.columns else 'product_id'
    if metric == 'revenue':
        ranked = df.groupby(group_col)['order_amount'].sum().sort_values(ascending=False)
    elif metric == 'orders':
        ranked = df.groupby(group_col).size().sort_values(ascending=False)
    elif metric == 'quantity':
        ranked = df.groupby(group_col)['quantity'].sum().sort_values(ascending=False)
    else:
        raise ValueError(f"Unknown metric: {metric}")

    total = ranked.sum()
    result = []
    for name, val in ranked.head(top_n).items():
        result.append({
            'product': str(name),
            metric: round(float(val), 2),
            'share_pct': f"{val / total:.1%}" if total else "0%",
        })
    return result


# ═══════════════════════════════════════════════════════
# Time-of-Day Distribution
# ═══════════════════════════════════════════════════════

def compute_hourly_distribution(df: 'pd.DataFrame') -> dict[int, int]:
    """
    计算订单的小时分布 (0-23 时)。

    Returns:
        dict: {hour: order_count}
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    if 'order_date' not in df.columns:
        return {}

    hours = df['order_date'].dt.hour.value_counts().sort_index()
    return {int(h): int(c) for h, c in hours.items()}


# ═══════════════════════════════════════════════════════
# Campaign Period Segmentation
# ═══════════════════════════════════════════════════════

def segment_campaign_periods(
    df: 'pd.DataFrame',
    campaign_dates: dict[str, tuple[str, str]],
) -> dict[str, 'pd.DataFrame']:
    """
    按大促阶段切分数据: pre-heat / peak / return。

    Args:
        df: 标准化 DataFrame
        campaign_dates: {'pre-heat': (start, end), 'peak': (start, end), 'return': (start, end)}

    Returns:
        dict: {阶段名: 阶段DataFrame}
    """
    if not HAS_PANDAS:
        raise ImportError("pandas is required")

    segments = {}
    for phase, (start_str, end_str) in campaign_dates.items():
        start = pd.Timestamp(start_str)
        end = pd.Timestamp(end_str)
        segment_df = df[(df['order_date'] >= start) & (df['order_date'] <= end)]
        segments[phase] = segment_df
    return segments
