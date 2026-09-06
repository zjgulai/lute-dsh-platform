"""
电商月度复盘核心分析逻辑 (E-Commerce Monthly Review Core)

提供月度维度的电商 KPI 分析、日趋势、工作日/周末对比、环比分析、短版诊断。
所有 KPI 计算委托 _shared.ecom_kpi 模块实现，本层做业务编排与格式化。

Usage:
    from scripts.core import generate_monthly_report

    report = generate_monthly_report(df, year=2026, month=3, config={"targets": {...}})
    print(report["kpis"])
"""

from __future__ import annotations

import copy
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

import pandas as pd

from skills._shared.data_validator import (
    generate_quality_report as shared_quality_report,
    check_sample_size,
)
from skills._shared.ecom_kpi import (
    KPIResult,
    ComparisonResult,
    compare_periods as shared_compare_periods,
    compute_core_kpis,
    compute_daily_kpis as shared_compute_daily_kpis,
    detect_signals,
    rank_top_skus as shared_rank_top_skus,
)

logger = logging.getLogger(__name__)

_WARNING_EMPTY_DF = "输入 DataFrame 为空，返回空结果"
_WARNING_INSUFFICIENT_DATA = "数据不足 7 天，月度分析的置信度可能降低"


# ═══════════════════════════════════════════════════════
# Monthly KPI Computation
# ═══════════════════════════════════════════════════════


def compute_monthly_kpis(
    df: pd.DataFrame,
    year: int,
    month: int,
    targets: Optional[dict[str, float]] = None,
) -> dict[str, Any]:
    """
    计算月度核心 KPI 及完成度分析。

    委托 _shared.ecom_kpi.compute_core_kpis 进行计算，并与 targets 做对比。

    支持的 targets 键:
    - total_revenue: 销售额目标
    - total_orders: 订单量目标
    - avg_order_value: 客单价目标
    - unique_customers: 客户数目标

    Args:
        df: 标准化后的订单 DataFrame
        year: 年份 (如 2026)
        month: 月份 (1-12)
        targets: 月度目标值字典 (可选)

    Returns:
        dict: {
            "period": "2026-03",
            "total_orders": 10240,
            "total_revenue": 3856000.0,
            "unique_customers": 8200,
            "avg_order_value": 376.6,
            "conversion_rate": "3.1%",
            "repeat_purchase_rate": "15.3%",
            "avg_items_per_order": 1.9,
            "refund_rate": "0.8%",
            "attainment": {
                "total_revenue": {"target": 4000000.0, "actual": 3856000.0, "rate": 96.4},
                ...
            },
            "data_days": 30
        }

    Raises:
        ValueError: 输入数据为空或日期范围无效
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return _empty_monthly_dict(year, month)

    start_date, end_date = _month_bounds(year, month)

    kpi = compute_core_kpis(df, start_date, end_date)

    # 统计有效天数
    ts_start = pd.Timestamp(start_date)
    ts_end = pd.Timestamp(end_date)
    period_df = df[(df["order_date"] >= ts_start) & (df["order_date"] <= ts_end)]
    data_days = period_df["order_date"].dt.date.nunique() if "order_date" in period_df.columns else 0

    result = _kpi_to_dict(kpi)
    result["period"] = f"{year}-{month:02d}"
    result["data_days"] = int(data_days)

    # 目标完成度
    if targets:
        result["attainment"] = _compute_attainment(kpi, targets)
    else:
        result["attainment"] = {}

    return result


# ═══════════════════════════════════════════════════════
# Daily Trend
# ═══════════════════════════════════════════════════════


def compute_daily_trend(df: pd.DataFrame, year: int, month: int) -> list[dict[str, Any]]:
    """
    计算月度内的日趋势数据。

    委托 _shared.ecom_kpi.compute_daily_kpis 获取基础日数据，补充
    累计值 (cumulative) 和日均值参考线。

    Args:
        df: 标准化后的订单 DataFrame
        year: 年份
        month: 月份

    Returns:
        list[dict]: [
            {"date": "2026-03-01", "orders": 320, "revenue": 120000.0, "customers": 280,
             "aov": 375.0, "cumulative_revenue": 120000.0, "cumulative_orders": 320},
            ...
        ]
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return []

    start_date, end_date = _month_bounds(year, month)

    daily_data = shared_compute_daily_kpis(df, start_date, end_date)

    if not daily_data:
        return []

    # 补充累计值
    cum_rev = 0
    cum_ord = 0
    for day in daily_data:
        cum_rev += day.get("revenue", 0)
        cum_ord += day.get("orders", 0)
        day["cumulative_revenue"] = round(cum_rev, 2)
        day["cumulative_orders"] = cum_ord

    return daily_data


# ═══════════════════════════════════════════════════════
# Weekday vs Weekend Breakdown
# ═══════════════════════════════════════════════════════


def compute_weekday_weekend_breakdown(
    df: pd.DataFrame,
    year: int,
    month: int,
) -> dict[str, Any]:
    """
    计算月度内工作日 vs 周末的销售对比。

    定义: 周一至周五 = 工作日, 周六/周日 = 周末

    Args:
        df: 标准化后的订单 DataFrame
        year: 年份
        month: 月份

    Returns:
        dict: {
            "weekday": {
                "days": 22,
                "total_revenue": 2500000.0,
                "total_orders": 6500,
                "avg_daily_revenue": 113636.36,
                "avg_daily_orders": 295,
                "share_pct": {"revenue": 64.8, "orders": 63.5}
            },
            "weekend": {
                "days": 8,
                "total_revenue": 1356000.0,
                "total_orders": 3740,
                "avg_daily_revenue": 169500.0,
                "avg_daily_orders": 467,
                "share_pct": {"revenue": 35.2, "orders": 36.5}
            }
        }
    """
    empty_result: dict[str, Any] = {
        "weekday": {"days": 0, "total_revenue": 0.0, "total_orders": 0,
                    "avg_daily_revenue": 0.0, "avg_daily_orders": 0,
                    "share_pct": {"revenue": 0.0, "orders": 0.0}},
        "weekend": {"days": 0, "total_revenue": 0.0, "total_orders": 0,
                    "avg_daily_revenue": 0.0, "avg_daily_orders": 0,
                    "share_pct": {"revenue": 0.0, "orders": 0.0}},
    }

    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return empty_result

    start_date, end_date = _month_bounds(year, month)
    ts_start = pd.Timestamp(start_date)
    ts_end = pd.Timestamp(end_date)

    period_df = df[(df["order_date"] >= ts_start) & (df["order_date"] <= ts_end)].copy()
    if period_df.empty:
        logger.warning("月份 %d-%02d 无数据", year, month)
        return empty_result

    # 标记工作日/周末
    period_df["_is_weekend"] = period_df["order_date"].dt.weekday >= 5  # 5=Sat, 6=Sun

    weekday_df = period_df[~period_df["_is_weekend"]]
    weekend_df = period_df[period_df["_is_weekend"]]

    total_rev = float(period_df["order_amount"].sum())
    total_ord = len(period_df)

    def _build_segment(df_seg: pd.DataFrame, label: str) -> dict[str, Any]:
        seg_rev = float(df_seg["order_amount"].sum()) if len(df_seg) > 0 else 0.0
        seg_ord = len(df_seg)
        unique_dates = df_seg["order_date"].dt.date.nunique() if "order_date" in df_seg.columns else 0
        return {
            "days": int(unique_dates),
            "total_revenue": round(seg_rev, 2),
            "total_orders": seg_ord,
            "avg_daily_revenue": round(seg_rev / max(unique_dates, 1), 2),
            "avg_daily_orders": round(seg_ord / max(unique_dates, 1), 1),
            "share_pct": {
                "revenue": round(seg_rev / max(total_rev, 1) * 100, 1),
                "orders": round(seg_ord / max(total_ord, 1) * 100, 1),
            },
        }

    return {
        "weekday": _build_segment(weekday_df, "weekday"),
        "weekend": _build_segment(weekend_df, "weekend"),
    }


# ═══════════════════════════════════════════════════════
# Month-over-Month Comparison
# ═══════════════════════════════════════════════════════


def compute_mom_comparison(
    df: pd.DataFrame,
    current_period: tuple[int, int],
    prev_period: tuple[int, int],
) -> dict[str, Any]:
    """
    计算月环比 (Month-over-Month) 对比。

    委托 _shared.ecom_kpi.compare_periods 实现。

    Args:
        df: 标准化后的订单 DataFrame
        current_period: (year, month) 当期
        prev_period: (year, month) 上期

    Returns:
        dict: {
            "current_period": "2026-03",
            "previous_period": "2026-02",
            "current": { ... },
            "previous": { ... },
            "changes": { "total_revenue": "+15.3%", ... },
            "signals": [ ... ]
        }
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return _empty_mom_dict(current_period, prev_period)

    cur_start, cur_end = _month_bounds(*current_period)
    prev_start, prev_end = _month_bounds(*prev_period)

    comparison = shared_compare_periods(df, cur_start, cur_end, prev_start, prev_end)

    result: dict[str, Any] = {
        "current_period": f"{current_period[0]}-{current_period[1]:02d}",
        "previous_period": f"{prev_period[0]}-{prev_period[1]:02d}",
        "current": _kpi_to_dict(comparison.current),
        "previous": _kpi_to_dict(comparison.previous),
        "changes": {k: f"{v:+.1%}" for k, v in comparison.changes.items()},
    }

    # 红绿信号
    if comparison.previous.total_orders > 0:
        signals = detect_signals(comparison.current, comparison.previous)
        result["signals"] = [
            {
                "metric": s.metric,
                "severity": s.severity,
                "current_value": round(s.current_value, 2),
                "threshold": s.threshold,
                "change_pct": round(s.change_pct, 4),
                "message": s.message,
            }
            for s in signals
        ]

    return result


# ═══════════════════════════════════════════════════════
# Shortfall Diagnosis
# ═══════════════════════════════════════════════════════


def diagnose_shortfalls(
    kpis: dict[str, Any],
    targets: dict[str, float],
) -> list[dict[str, Any]]:
    """
    诊断月度 KPI 未达标项，分析可能原因。

    Args:
        kpis: compute_monthly_kpis 返回的 KPI 字典
        targets: 月度目标值字典

    Returns:
        list[dict]: [
            {
                "metric": "total_revenue",
                "target": 4000000.0,
                "actual": 3856000.0,
                "gap_pct": -3.6,
                "diagnosis": "销售额未达标（目标差距 3.6%）。常见原因：流量下降、转化率降低、客单价下滑。建议检查各渠道流量变化和产品定价策略。"
            },
            ...
        ]
    """
    diagnoses: list[dict[str, Any]] = []

    if not targets:
        return diagnoses

    if not kpis:
        return diagnoses

    METRIC_NAMES: dict[str, str] = {
        "total_revenue": "销售额",
        "total_orders": "订单量",
        "avg_order_value": "客单价",
        "unique_customers": "客户数",
    }

    DIAGNOSIS_TEMPLATES: dict[str, list[str]] = {
        "total_revenue": [
            "流量下降",
            "转化率降低",
            "客单价下滑",
        ],
        "total_orders": [
            "流量减少",
            "转化率下降",
            "竞争加剧",
            "促销力度不足",
        ],
        "avg_order_value": [
            "促销活动拉低均价",
            "低价商品占比上升",
            "搭售推荐效果不佳",
        ],
        "unique_customers": [
            "新客获取减少",
            "渠道投放效果下降",
            "品牌曝光不足",
        ],
    }

    for metric, target_val in targets.items():
        actual_val = kpis.get(metric, 0)

        # 兼容百分比字符串和数值
        if isinstance(actual_val, str) and "%" in actual_val:
            actual_num = float(actual_val.replace("%", ""))
        else:
            actual_num = float(actual_val) if actual_val is not None else 0.0

        if target_val <= 0:
            continue

        gap_pct = round((actual_num - target_val) / target_val * 100, 1)

        # 只记录未达标或严重超标的
        if gap_pct >= -5.0:
            continue

        metric_label = METRIC_NAMES.get(metric, metric)
        reasons = DIAGNOSIS_TEMPLATES.get(metric, ["业务表现低于预期"])
        reason_text = "、".join(reasons)

        diagnoses.append({
            "metric": metric,
            "target": target_val,
            "actual": actual_num,
            "gap_pct": gap_pct,
            "diagnosis": (
                f"{metric_label}未达标（目标差距 {abs(gap_pct):.1f}%）。"
                f"常见原因：{reason_text}。"
                f"建议检查各项指标变化并优化对应环节。"
            ),
        })

    # 按差距严重程度排序 (最严重在前)
    diagnoses.sort(key=lambda d: d["gap_pct"])

    return diagnoses


# ═══════════════════════════════════════════════════════
# Full Report Generation
# ═══════════════════════════════════════════════════════


def generate_monthly_report(
    df: pd.DataFrame,
    year: int,
    month: int,
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    完整的月度复盘报告流水线。

    这是月度复盘的主入口，整合所有分析维度:
    - KPI 概览与目标完成度
    - 日趋势分析
    - 工作日/周末对比
    - 月环比 (与上月)
    - Top SKU 排行
    - 短版诊断
    - 数据质量报告

    Args:
        df: 标准化后的订单 DataFrame
        year: 年份 (如 2026)
        month: 月份 (1-12)
        config: 配置字典，支持字段:
            - targets: 月度目标字典
            - top_n: SKU 排行数量 (默认 10)
            - prev_period: 环比对比周期 (year, month)，默认上月
            - include_quality_report: 是否包含数据质量 (默认 True)
            - min_sample_size: 样本量阈值 (默认 30)

    Returns:
        dict: {
            "report_type": "monthly_review",
            "period": "2026-03",
            "kpis": { ... },
            "daily_trend": [ ... ],
            "weekday_weekend": { ... },
            "mom_comparison": { ... },
            "top_skus": [ ... ],
            "shortfalls": [ ... ],
            "quality": { ... },
            "sample_check": { ... },
            "generated_at": "2026-04-01T10:00:00"
        }
    """
    if config is None:
        config = {}

    targets = config.get("targets")
    top_n = config.get("top_n", 10)

    # 环比周期：默认上月
    prev_period = config.get("prev_period")
    if prev_period is None:
        prev_year, prev_month = _prev_month(year, month)
        prev_period = (prev_year, prev_month)

    include_quality = config.get("include_quality_report", True)
    min_samples = config.get("min_sample_size", 30)

    report: dict[str, Any] = {
        "report_type": "monthly_review",
        "period": f"{year}-{month:02d}",
        "generated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }

    # 空数据检查
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        report["warning"] = _WARNING_EMPTY_DF
        return report

    # 数据量检查
    start_date, end_date = _month_bounds(year, month)
    ts_start = pd.Timestamp(start_date)
    ts_end = pd.Timestamp(end_date)
    period_df = df[(df["order_date"] >= ts_start) & (df["order_date"] <= ts_end)]
    total_days = period_df["order_date"].dt.date.nunique() if "order_date" in period_df.columns else 0

    if total_days < 7:
        logger.warning(_WARNING_INSUFFICIENT_DATA)
        report["warning"] = _WARNING_INSUFFICIENT_DATA

    # 1) 月度 KPI
    report["kpis"] = compute_monthly_kpis(df, year, month, targets=targets)

    # 2) 日趋势
    report["daily_trend"] = compute_daily_trend(df, year, month)

    # 3) 工作日/周末对比
    report["weekday_weekend"] = compute_weekday_weekend_breakdown(df, year, month)

    # 4) 月环比
    mom = compute_mom_comparison(df, (year, month), prev_period)
    report["mom_comparison"] = mom

    # 5) Top SKU
    report["top_skus"] = shared_rank_top_skus(df, metric="revenue", top_n=top_n)

    # 6) 短版诊断
    if targets:
        report["shortfalls"] = diagnose_shortfalls(report["kpis"], targets)

    # 7) 数据质量
    if include_quality:
        try:
            report["quality"] = shared_quality_report(df).to_dict()
        except Exception as e:
            logger.warning("数据质量报告生成失败: %s", e)
            report["quality"] = {"error": str(e)}

    # 8) 样本量检查
    report["sample_check"] = check_sample_size(df, min_rows=min_samples)

    return report


# ═══════════════════════════════════════════════════════
# Internal Helpers
# ═══════════════════════════════════════════════════════


def _month_bounds(year: int, month: int) -> tuple[str, str]:
    """
    计算月份起止日期。

    Returns:
        (start_date, end_date) 格式 "YYYY-MM-DD"
    """
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = datetime(year, month + 1, 1) - timedelta(days=1)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def _prev_month(year: int, month: int) -> tuple[int, int]:
    """计算上个月的年月。"""
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _kpi_to_dict(kpi: KPIResult) -> dict[str, Any]:
    """将 KPIResult 转换为纯字典。"""
    d = kpi.to_dict()
    d.pop("period", None)
    return d


def _compute_attainment(
    kpi: KPIResult,
    targets: dict[str, float],
) -> dict[str, dict[str, float]]:
    """计算 KPI 目标完成度。"""
    metric_map: dict[str, float] = {
        "total_revenue": kpi.total_revenue,
        "total_orders": float(kpi.total_orders),
        "avg_order_value": kpi.avg_order_value,
        "unique_customers": float(kpi.unique_customers),
    }

    attainment: dict[str, dict[str, float]] = {}
    for metric, target_val in targets.items():
        actual_val = metric_map.get(metric)
        if actual_val is None:
            continue
        rate = round(actual_val / max(target_val, 1) * 100, 1)
        attainment[metric] = {
            "target": target_val,
            "actual": actual_val,
            "rate": rate,
            "status": "exceeded" if rate >= 100 else ("warning" if rate >= 85 else "missed"),
        }

    return attainment


def _empty_monthly_dict(year: int, month: int) -> dict[str, Any]:
    """返回空的月度 KPI 字典。"""
    return {
        "period": f"{year}-{month:02d}",
        "total_orders": 0,
        "total_revenue": 0.0,
        "unique_customers": 0,
        "avg_order_value": 0.0,
        "conversion_rate": "0.0%",
        "repeat_purchase_rate": "0.0%",
        "avg_items_per_order": 0.0,
        "refund_rate": "0.0%",
        "attainment": {},
        "data_days": 0,
    }


def _empty_mom_dict(
    current_period: tuple[int, int],
    prev_period: tuple[int, int],
) -> dict[str, Any]:
    """返回空的环比对比字典。"""
    return {
        "current_period": f"{current_period[0]}-{current_period[1]:02d}",
        "previous_period": f"{prev_period[0]}-{prev_period[1]:02d}",
        "warning": _WARNING_EMPTY_DF,
    }
