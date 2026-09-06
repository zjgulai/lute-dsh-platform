"""
电商日报核心分析逻辑 (E-Commerce Daily Report Core)

提供单日/周维度的电商 KPI 计算、环比对比、时段分布、SKU 排行和异常检测。
所有 KPI 计算委托 _shared.ecom_kpi 模块实现，本层做业务编排与格式化。

Usage:
    from scripts.core import generate_daily_report

    report = generate_daily_report(df, date="2026-04-08", config={})
    print(report["summary"])
"""

from __future__ import annotations

import copy
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

import pandas as pd

from ._shared.data_validator import (
    generate_quality_report as shared_quality_report,
    check_sample_size,
)
from ._shared.ecom_kpi import (
    KPIResult,
    Signal,
    compare_periods as shared_compare_periods,
    compute_core_kpis,
    compute_hourly_distribution as shared_hourly_distribution,
    detect_signals,
    rank_top_skus as shared_rank_top_skus,
)

logger = logging.getLogger(__name__)

# 默认异常检测阈值
DEFAULT_ANOMALY_THRESHOLDS: dict[str, float] = {
    "revenue_spike_pct": 50.0,       # 销售额日环比涨幅超过此值视为异常 (%)
    "revenue_drop_pct": -30.0,       # 销售额日环比跌幅低于此值视为异常 (%)
    "order_spike_pct": 50.0,         # 订单量日环比涨幅超过此值视为异常 (%)
    "order_drop_pct": -30.0,         # 订单量日环比跌幅低于此值视为异常 (%)
    "aov_spike_pct": 30.0,           # 客单价日环比涨幅超过此值视为异常 (%)
    "aov_drop_pct": -20.0,           # 客单价日环比跌幅低于此值视为异常 (%)
}

_WARNING_EMPTY_DF = "输入 DataFrame 为空, 返回空结果"
_WARNING_SINGLE_DAY = "仅含单日数据, 环比计算无法进行"


# ═══════════════════════════════════════════════════════
# Daily KPI Computation
# ═══════════════════════════════════════════════════════


def compute_daily_kpis(df: pd.DataFrame, date: str) -> dict[str, Any]:
    """
    计算单日核心电商 KPI。

    委托 _shared.ecom_kpi.compute_core_kpis 进行计算，返回格式化字典。

    Args:
        df: 标准化后的订单 DataFrame (需含 order_id, order_date, order_amount 等列)
        date: 目标日期 (YYYY-MM-DD)

    Returns:
        dict: {
            "date": "2026-04-08",
            "total_orders": 342,
            "total_revenue": 128450.0,
            "unique_customers": 280,
            "avg_order_value": 375.6,
            "conversion_rate": "3.2%",
            "repeat_purchase_rate": "12.5%",
            "avg_items_per_order": 1.8,
            "refund_rate": "0.5%"
        }

    Raises:
        ValueError: 输入 DataFrame 为空或日期格式无效
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return _empty_kpi_dict(date)

    kpi = compute_core_kpis(df, date, date)
    return _kpi_to_dict(kpi, date)


def compute_wow_comparison(
    df: pd.DataFrame,
    current_date: str,
    prev_date: str,
) -> dict[str, Any]:
    """
    计算日环比 (day-over-day) 即当前日 vs 昨日。

    Args:
        df: 标准化后的订单 DataFrame
        current_date: 当前目标日期 (YYYY-MM-DD)
        prev_date: 对比日期 (YYYY-MM-DD)，通常为昨日

    Returns:
        dict: 包含 current_kpi, previous_kpi, changes 的对比结果

    Raises:
        ValueError: 输入数据为空或日期格式无效
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return _empty_comparison_dict(current_date, prev_date)

    comparison = shared_compare_periods(
        df, current_date, current_date, prev_date, prev_date
    )
    return _comparison_to_dict(comparison, current_date, prev_date)


# ═══════════════════════════════════════════════════════
# Hourly Distribution
# ═══════════════════════════════════════════════════════


def compute_hourly_distribution(df: pd.DataFrame, date: str) -> dict[str, Any]:
    """
    计算指定日期的时段销售分布 (0-23 时)。

    委托 _shared.ecom_kpi.compute_hourly_distribution 实现。

    Args:
        df: 标准化后的订单 DataFrame
        date: 目标日期 (YYYY-MM-DD)

    Returns:
        dict: {
            "date": "2026-04-08",
            "total_orders": 342,
            "hours": {0: 5, 1: 2, ..., 23: 8},
            "peak_hour": 20,
            "peak_orders": 42,
            "off_peak_rate": 0.12
        }
        其中 off_peak_rate 为凌晨 0-6 时订单占比
    """
    result: dict[str, Any] = {"date": date, "total_orders": 0, "hours": {}, "peak_hour": None, "peak_orders": 0, "off_peak_rate": 0.0}

    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return result

    # 过滤当日数据
    ts = pd.Timestamp(date)
    day_df = df[df["order_date"].dt.date == ts.date()].copy()

    if day_df.empty:
        logger.warning("日期 %s 无数据", date)
        return result

    result["total_orders"] = len(day_df)
    raw_hours = shared_hourly_distribution(day_df)

    # 确保 0-23 时都有值
    full_hours: dict[str, int] = {}
    for h in range(24):
        full_hours[str(h)] = raw_hours.get(h, 0)

    result["hours"] = full_hours

    # 峰值时段
    if full_hours:
        peak_hour_str = max(full_hours, key=lambda k: full_hours[k])
        result["peak_hour"] = int(peak_hour_str)
        result["peak_orders"] = full_hours[peak_hour_str]

    # 非高峰占比 (0-6 时)
    off_peak_orders = sum(full_hours.get(str(h), 0) for h in range(6))
    result["off_peak_rate"] = round(off_peak_orders / max(result["total_orders"], 1), 4)

    return result


# ═══════════════════════════════════════════════════════
# Top SKU Ranking
# ═══════════════════════════════════════════════════════


def rank_top_skus(df: pd.DataFrame, top_n: int = 10) -> list[dict[str, Any]]:
    """
    按销售额排名 Top SKU。

    委托 _shared.ecom_kpi.rank_top_skus 实现。当 DataFrame 不含
    product_name 或 product_id 列时返回空列表。

    Args:
        df: 标准化后的订单 DataFrame
        top_n: 返回条目数 (默认 10)

    Returns:
        list[dict]: [
            {"product": "SKU-A123", "revenue": 23400.0, "share_pct": "18.2%"},
            ...
        ]
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return []

    product_cols = {"product_name", "product_id"}
    if not product_cols.intersection(df.columns):
        logger.warning("DataFrame 缺少 product_name/product_id 列, 无法计算 SKU 排行")
        return []

    return shared_rank_top_skus(df, metric="revenue", top_n=top_n)


# ═══════════════════════════════════════════════════════
# Anomaly Detection
# ═══════════════════════════════════════════════════════


def detect_daily_anomalies(
    df: pd.DataFrame,
    date: str,
    thresholds: Optional[dict[str, float]] = None,
) -> list[dict[str, Any]]:
    """
    检测当日数据异常。

    异常类型：
    - 销售额异常波动 (阈值: revenue_spike_pct / revenue_drop_pct)
    - 订单量异常变化 (阈值: order_spike_pct / order_drop_pct)
    - 客单价异常波动 (阈值: aov_spike_pct / aov_drop_pct)
    - 零销售 SKU 提醒

    Args:
        df: 标准化后的订单 DataFrame (需含至少 2 天的数据用于环比)
        date: 目标日期 (YYYY-MM-DD)
        thresholds: 自定义阈值，覆盖 DEFAULT_ANOMALY_THRESHOLDS

    Returns:
        list[dict]: [
            {
                "type": "revenue_drop",
                "severity": "warning",
                "metric": "total_revenue",
                "current": 90000.0,
                "change_pct": -30.0,
                "message": "销售额环比下降 30.0%，超过预警线 -30%"
            },
            ...
        ]
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return []

    t = {**DEFAULT_ANOMALY_THRESHOLDS, **(thresholds or {})}
    anomalies: list[dict[str, Any]] = []

    ts = pd.Timestamp(date)
    prev_date_str = str((ts - timedelta(days=1)).date())

    # 获取当日和昨日的 KPI
    today_kpi = compute_core_kpis(df, date, date)
    yesterday_kpi = compute_core_kpis(df, prev_date_str, prev_date_str)

    has_prev_data = yesterday_kpi.total_orders > 0

    # 1) 销售额波动检测
    if has_prev_data and today_kpi.total_revenue > 0:
        rev_change = _pct_change(today_kpi.total_revenue, yesterday_kpi.total_revenue)
        if rev_change <= t["revenue_drop_pct"]:
            anomalies.append({
                "type": "revenue_drop",
                "severity": "warning",
                "metric": "total_revenue",
                "current": round(today_kpi.total_revenue, 2),
                "change_pct": round(rev_change, 2),
                "message": f"销售额环比下降 {abs(rev_change):.1f}%，超过预警线 {abs(t['revenue_drop_pct']):.0f}%",
            })
        elif rev_change >= t["revenue_spike_pct"]:
            anomalies.append({
                "type": "revenue_spike",
                "severity": "info",
                "metric": "total_revenue",
                "current": round(today_kpi.total_revenue, 2),
                "change_pct": round(rev_change, 2),
                "message": f"销售额环比飙升 {rev_change:.1f}%，超过预警线 {t['revenue_spike_pct']:.0f}%。建议确认是否有大促活动",
            })

    # 2) 订单量波动检测
    if has_prev_data and today_kpi.total_orders > 0:
        order_change = _pct_change(today_kpi.total_orders, yesterday_kpi.total_orders)
        if order_change <= t["order_drop_pct"]:
            anomalies.append({
                "type": "order_drop",
                "severity": "warning",
                "metric": "total_orders",
                "current": today_kpi.total_orders,
                "change_pct": round(order_change, 2),
                "message": f"订单量环比下降 {abs(order_change):.1f}%，超过预警线 {abs(t['order_drop_pct']):.0f}%",
            })
        elif order_change >= t["order_spike_pct"]:
            anomalies.append({
                "type": "order_spike",
                "severity": "info",
                "metric": "total_orders",
                "current": today_kpi.total_orders,
                "change_pct": round(order_change, 2),
                "message": f"订单量环比飙升 {order_change:.1f}%，需关注流量来源变化",
            })

    # 3) 客单价波动检测
    if has_prev_data and today_kpi.avg_order_value > 0:
        aov_change = _pct_change(today_kpi.avg_order_value, yesterday_kpi.avg_order_value)
        if aov_change <= t["aov_drop_pct"]:
            anomalies.append({
                "type": "aov_drop",
                "severity": "warning",
                "metric": "avg_order_value",
                "current": round(today_kpi.avg_order_value, 2),
                "change_pct": round(aov_change, 2),
                "message": f"客单价环比下降 {abs(aov_change):.1f}%，需关注定价或促销力度",
            })
        elif aov_change >= t["aov_spike_pct"]:
            anomalies.append({
                "type": "aov_spike",
                "severity": "info",
                "metric": "avg_order_value",
                "current": round(today_kpi.avg_order_value, 2),
                "change_pct": round(aov_change, 2),
                "message": f"客单价环比飙升 {aov_change:.1f}%，可能存在高单价商品集中成交",
            })

    # 4) 零销售 SKU 提示
    if "product_id" in df.columns or "product_name" in df.columns or "sku_id" in df.columns:
        group_col = "product_name" if "product_name" in df.columns else ("product_id" if "product_id" in df.columns else "sku_id")
        day_products = df[df["order_date"].dt.date == ts.date()]
        all_products = df[group_col].dropna().unique()
        sold_today = day_products[group_col].dropna().unique()
        zero_skus = set(all_products) - set(sold_today)
        if zero_skus and len(all_products) > 0:
            anomalies.append({
                "type": "zero_sku_sales",
                "severity": "info",
                "metric": "sku_coverage",
                "current": len(sold_today),
                "change_pct": round(-len(zero_skus) / max(len(all_products), 1) * 100, 2),
                "message": f"今日 {len(zero_skus)} 个 SKU 无销售记录 (占比 {len(zero_skus)/len(all_products):.1%})",
            })

    return anomalies


# ═══════════════════════════════════════════════════════
# Full Report Generation
# ═══════════════════════════════════════════════════════


def generate_daily_report(
    df: pd.DataFrame,
    date: str,
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    完整的日报生成流水线: KPI -> 环比 -> 时段 -> Top SKU -> 异常 -> 数据质量。

    这是每日报告的主入口，整合所有分析维度。

    Args:
        df: 标准化后的订单 DataFrame
        date: 目标日期 (YYYY-MM-DD)
        config: 配置字典，支持字段:
            - top_n: SKU 排行数量 (默认 10)
            - prev_date: 环比对比日期，默认昨日 (YYYY-MM-DD)
            - thresholds: 异常检测阈值
            - include_quality_report: 是否包含数据质量报告 (默认 True)
            - min_sample_size: 样本量检查阈值 (默认 30)

    Returns:
        dict: {
            "report_type": "daily",
            "date": "2026-04-08",
            "summary": { ... },         # compute_daily_kpis 结果
            "comparison": { ... },      # compute_wow_comparison 结果
            "hourly_distribution": { ... },
            "top_skus": [ ... ],
            "anomalies": [ ... ],
            "quality": { ... },         # 数据质量报告
            "sample_check": { ... },    # 样本量检查
            "generated_at": "2026-04-09T08:00:00"
        }
        如果输入 DataFrame 为空，返回仅含 date 和 warning 字段的报告。
    """
    if config is None:
        config = {}

    top_n = config.get("top_n", 10)
    ts = pd.Timestamp(date)
    prev_date = config.get("prev_date", str((ts - timedelta(days=1)).date()))
    thresholds = config.get("thresholds")
    include_quality = config.get("include_quality_report", True)
    min_samples = config.get("min_sample_size", 30)

    report: dict[str, Any] = {
        "report_type": "daily",
        "date": date,
        "generated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }

    # 空数据检查
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        report["warning"] = _WARNING_EMPTY_DF
        return report

    # 单日数据检查 (无法做环比)
    ts_date = ts.date()
    unique_dates = df["order_date"].dt.date.nunique() if "order_date" in df.columns else 0
    if unique_dates <= 1:
        logger.warning(_WARNING_SINGLE_DAY)

    # 1) 核心 KPI
    report["summary"] = compute_daily_kpis(df, date)

    # 2) 环比对比
    comparison = compute_wow_comparison(df, date, prev_date)
    if "warning" not in comparison:
        report["comparison"] = comparison
        # 红绿信号 (通过 _shared 的 detect_signals 做二次补充)
        today_kpi = compute_core_kpis(df, date, date)
        prev_kpi = compute_core_kpis(df, prev_date, prev_date)
        if prev_kpi.total_orders > 0:
            signals = detect_signals(today_kpi, prev_kpi, thresholds)
            report["signals"] = [_signal_to_dict(s) for s in signals]

    # 3) 时段分布
    report["hourly_distribution"] = compute_hourly_distribution(df, date)

    # 4) Top SKU
    report["top_skus"] = rank_top_skus(df, top_n=top_n)

    # 5) 异常检测
    report["anomalies"] = detect_daily_anomalies(df, date, thresholds)

    # 6) 数据质量
    if include_quality:
        try:
            report["quality"] = shared_quality_report(df).to_dict()
        except Exception as e:
            logger.warning("数据质量报告生成失败: %s", e)
            report["quality"] = {"error": str(e)}

    # 7) 样本量检查
    report["sample_check"] = check_sample_size(df, min_rows=min_samples)

    return report


# ═══════════════════════════════════════════════════════
# Internal Helpers
# ═══════════════════════════════════════════════════════


def _pct_change(current: float, previous: float) -> float:
    """计算百分比变化。previous 为 0 时返回 0。"""
    if previous and previous != 0:
        return (current - previous) / previous * 100
    return 0.0


def _empty_kpi_dict(date: str) -> dict[str, Any]:
    """返回空 KPI 字典。"""
    return {
        "date": date,
        "total_orders": 0,
        "total_revenue": 0.0,
        "unique_customers": 0,
        "avg_order_value": 0.0,
        "conversion_rate": "0.0%",
        "repeat_purchase_rate": "0.0%",
        "avg_items_per_order": 0.0,
        "refund_rate": "0.0%",
    }


def _empty_comparison_dict(current_date: str, prev_date: str) -> dict[str, Any]:
    """返回空对比字典。"""
    return {
        "current_date": current_date,
        "previous_date": prev_date,
        "warning": _WARNING_EMPTY_DF,
        "current": _empty_kpi_dict(current_date),
        "previous": _empty_kpi_dict(prev_date),
        "changes": {m: "+0.0%" for m in [
            "total_orders", "total_revenue", "unique_customers",
            "avg_order_value", "conversion_rate", "repeat_purchase_rate",
        ]},
    }


def _kpi_to_dict(kpi: KPIResult, date: str) -> dict[str, Any]:
    """将 KPIResult 转换为纯字典。"""
    d = kpi.to_dict()
    d.pop("period", None)
    d["date"] = date
    return d


def _comparison_to_dict(
    comparison,  # ComparisonResult
    current_date: str,
    prev_date: str,
) -> dict[str, Any]:
    """将 ComparisonResult 转换为纯字典。"""
    return {
        "current_date": current_date,
        "previous_date": prev_date,
        "current": _kpi_to_dict(comparison.current, current_date),
        "previous": _kpi_to_dict(comparison.previous, prev_date),
        "changes": _format_changes(comparison.changes),
    }


def _format_changes(changes: dict[str, float]) -> dict[str, str]:
    """将 changes 格式化为百分比字符串。"""
    return {k: f"{v:+.1%}" for k, v in changes.items()}


def _signal_to_dict(signal: Signal) -> dict[str, Any]:
    """将 Signal dataclass 转为纯字典。"""
    return {
        "metric": signal.metric,
        "severity": signal.severity,
        "current_value": round(signal.current_value, 2),
        "threshold": signal.threshold,
        "change_pct": round(signal.change_pct, 4),
        "message": signal.message,
    }
