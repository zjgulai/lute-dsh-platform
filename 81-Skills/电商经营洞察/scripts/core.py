"""
电商经营复盘核心分析逻辑 (E-Commerce Business Review Core)

提供 KPI 树层级拆解、环比/同比/季环比趋势对比、红绿信号标注、归因分析
和行动建议生成。所有底层 KPI 计算委托 _shared.ecom_kpi 模块。

Usage:
    from scripts.core import generate_review_report

    report = generate_review_report(df, period_start="2026-01-01",
                                    period_end="2026-01-31", config={})
    print(report["kpi_tree"])
"""

from __future__ import annotations

import copy
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from skills._shared.data_validator import (
    generate_quality_report as shared_quality_report,
    check_sample_size,
)
from skills._shared.ecom_kpi import (
    KPIResult,
    Signal,
    compare_periods as shared_compare_periods,
    compute_core_kpis,
    detect_signals,
    rank_top_skus as shared_rank_top_skus,
)

logger = logging.getLogger(__name__)

# 默认红绿信号阈值
DEFAULT_THRESHOLDS: dict[str, float] = {
    "revenue_drop_red": -0.20,
    "aov_drop_red": -0.10,
    "orders_drop_red": -0.20,
    "new_customer_drop_red": -0.25,
    "repeat_rise_green": 0.05,
    "refund_rise_red": 0.05,
    "revenue_growth_green": 0.10,
    "aov_growth_green": 0.05,
}

_WARNING_EMPTY_DF = "输入 DataFrame 为空, 返回空结果"
_WARNING_INSUFFICIENT_DATA = "数据不足, 部分分析维度跳过"

# ═══════════════════════════════════════════════════════════
# Helper: empty KPI dict
# ═══════════════════════════════════════════════════════════


def _empty_kpi_dict(label: str = "") -> dict[str, Any]:
    """返回全零 KPI 字典，用于空数据兜底。"""
    return {
        "label": label,
        "total_orders": 0,
        "total_revenue": 0.0,
        "unique_customers": 0,
        "avg_order_value": 0.0,
        "conversion_rate": "0.0%",
        "repeat_purchase_rate": "N/A",
        "avg_items_per_order": 0.0,
        "refund_rate": "0.0%",
    }


# ═══════════════════════════════════════════════════════════
# KPI Tree
# ═══════════════════════════════════════════════════════════


def compute_kpi_tree(df: pd.DataFrame, window_days: int = 30) -> dict[str, Any]:
    """
    层级化 KPI 树拆解。

    北极星 GMV/Revenue -> 增长来源 (Orders x AOV) -> 客户质量 (New vs Repeat)
    -> 商品结构/渠道分布.

    拆解结构::

        GMV
        ├── Revenue  (已支付金额)
        │   ├── Orders
        │   │   ├── New Customer Orders
        │   │   └── Repeat Customer Orders
        │   └── AOV  (客单价)
        │       ├── Avg Units per Order
        │       └── Avg Unit Price
        ├── Returns (退款金额)
        └── Net Revenue (GMV - Returns)

    Args:
        df: 标准化后的订单 DataFrame
        window_days: 分析窗口天数 (默认 30 天)

    Returns:
        dict: {
            "window_days": 30,
            "polar_star": {"gmv": ..., "revenue": ..., "returns": ...},
            "growth_factors": {...},
            "customer_quality": {...},
            "product_structure": {...},
            "notes": [...]
        }

    Raises:
        ValueError: 输入 DataFrame 为空
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return {"window_days": window_days, "error": "DataFrame 为空"}

    # 全量计算
    end_date = df["order_date"].max()
    start_date = end_date - pd.Timedelta(days=window_days)
    period_df = df[(df["order_date"] >= start_date) & (df["order_date"] <= end_date)].copy()

    if period_df.empty:
        return {"window_days": window_days, "error": "指定窗口内无数据"}

    kpi = compute_core_kpis(period_df, start_date, end_date)

    # 北极星
    gmv = round(kpi.total_revenue, 2) if kpi.total_revenue else 0.0
    refund_amount = 0.0
    if "is_refunded" in period_df.columns and "order_amount" in period_df.columns:
        refunded = period_df[period_df["is_refunded"].astype(bool)]
        refund_amount = round(float(refunded["order_amount"].sum()), 2)

    polar_star = {
        "gmv": gmv,
        "revenue": round(gmv - refund_amount, 2),
        "returns": refund_amount,
        "total_orders": kpi.total_orders,
    }

    # 增长来源
    growth_factors = {
        "orders": {
            "total": kpi.total_orders,
            "new_customer_orders": 0,
            "repeat_customer_orders": 0,
        },
        "aov": round(kpi.avg_order_value, 2),
        "avg_units_per_order": round(kpi.avg_items_per_order, 1),
        "avg_unit_price": (
            round(kpi.avg_order_value / kpi.avg_items_per_order, 2)
            if kpi.avg_items_per_order > 0
            else 0.0
        ),
    }

    # 新客 vs 回购
    if "customer_id" in period_df.columns:
        customer_orders = period_df.groupby("customer_id").size()
        repeat_customers = customer_orders[customer_orders > 1].index
        repeat_orders = period_df[period_df["customer_id"].isin(repeat_customers)]
        new_orders = period_df[~period_df["customer_id"].isin(repeat_customers)]
        growth_factors["orders"]["new_customer_orders"] = len(new_orders)
        growth_factors["orders"]["repeat_customer_orders"] = len(repeat_orders)

    # 客户质量
    customer_quality = {
        "unique_customers": kpi.unique_customers,
        "repeat_purchase_rate": f"{kpi.repeat_purchase_rate:.1%}" if kpi.repeat_purchase_rate > 0 else "N/A",
        "new_customer_ratio": (
            f"{growth_factors['orders']['new_customer_orders'] / max(kpi.total_orders, 1):.1%}"
            if kpi.total_orders > 0
            else "N/A"
        ),
        "repeat_customer_ratio": (
            f"{growth_factors['orders']['repeat_customer_orders'] / max(kpi.total_orders, 1):.1%}"
            if kpi.total_orders > 0
            else "N/A"
        ),
    }

    # 商品结构 Top 5
    product_structure = {"top_skus_by_revenue": [], "top_skus_by_orders": []}
    if "product_name" in period_df.columns or "product_id" in period_df.columns:
        product_structure["top_skus_by_revenue"] = shared_rank_top_skus(
            period_df, metric="revenue", top_n=5
        )
        product_structure["top_skus_by_orders"] = shared_rank_top_skus(
            period_df, metric="orders", top_n=5
        )

    notes = []
    if refund_amount > 0.05 * gmv:
        notes.append(f"退款金额 ({refund_amount}) 超过 GMV 的 5%，需关注退货率")
    if (kpi.repeat_purchase_rate or 0) < 0.05:
        notes.append("复购率低于 5%，需加强客户留存策略")

    return {
        "window_days": window_days,
        "polar_star": polar_star,
        "growth_factors": growth_factors,
        "customer_quality": customer_quality,
        "product_structure": product_structure,
        "notes": notes,
    }


# ═══════════════════════════════════════════════════════════
# Trend Comparison
# ═══════════════════════════════════════════════════════════


def compute_trend_comparison(
    current_df: pd.DataFrame,
    comparison_df: pd.DataFrame,
    metrics: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    两周期对比分析，支持 MoM / QoQ / YoY。

    Args:
        current_df: 当前周期的 DataFrame
        comparison_df: 对比周期（上月/上季/上年）的 DataFrame
        metrics: 需对比的指标列表（默认全部核心指标）

    Returns:
        dict: {
            "current": {...KPI dict},
            "comparison": {...KPI dict},
            "changes": {"total_revenue": 0.15, ...},
            "flags": ["revenue_up", "aov_down", ...],
        }

    Raises:
        ValueError: 任一输入 DataFrame 为空
    """
    if current_df is None or current_df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return {"error": "当前周期无数据"}
    if comparison_df is None or comparison_df.empty:
        return {"current": _empty_kpi_dict(), "comparison": _empty_kpi_dict(), "changes": {}, "flags": []}

    if metrics is None:
        metrics = [
            "total_orders", "total_revenue", "unique_customers",
            "avg_order_value", "repeat_purchase_rate", "avg_items_per_order",
        ]

    # 计算两个周期的 KPI
    current_start = current_df["order_date"].min()
    current_end = current_df["order_date"].max()
    comparison_start = comparison_df["order_date"].min()
    comparison_end = comparison_df["order_date"].max()

    current_kpi = compute_core_kpis(current_df, current_start, current_end)
    previous_kpi = compute_core_kpis(comparison_df, comparison_start, comparison_end)

    changes: dict[str, float] = {}
    for m in metrics:
        curr_val = float(getattr(current_kpi, m, 0) or 0)
        prev_val = float(getattr(previous_kpi, m, 0) or 0)
        if prev_val != 0:
            changes[m] = round((curr_val - prev_val) / prev_val, 4)
        else:
            changes[m] = 0.0

    # 生成标志
    flags: list[str] = []
    rev_pct = changes.get("total_revenue", 0)
    if rev_pct >= 0.10:
        flags.append("revenue_up")
    elif rev_pct <= -0.10:
        flags.append("revenue_down")

    aov_pct = changes.get("avg_order_value", 0)
    if aov_pct >= 0.05:
        flags.append("aov_up")
    elif aov_pct <= -0.05:
        flags.append("aov_down")

    o_pct = changes.get("total_orders", 0)
    if o_pct >= 0.10:
        flags.append("orders_up")
    elif o_pct <= -0.10:
        flags.append("orders_down")

    return {
        "current": _kpi_to_dict(current_kpi, str(current_start.date())),
        "comparison": _kpi_to_dict(previous_kpi, str(comparison_start.date())),
        "changes": changes,
        "flags": flags,
    }


# ═══════════════════════════════════════════════════════════
# Red / Green Signal Flagging
# ═══════════════════════════════════════════════════════════


def flag_red_green_signals(
    kpi_dict: dict[str, Any],
    thresholds: Optional[dict[str, float]] = None,
) -> list[dict[str, Any]]:
    """
    根据 KPI 数据标记红绿信号。

    红色信号表示需关注的风险/异常，绿色信号表示正向机会。

    Args:
        kpi_dict: KPI 字典（含当前值与变化百分比）
        thresholds: 自定义阈值，覆盖默认值

    Returns:
        list[dict]: [
            {
                "metric": "total_revenue",
                "severity": "red" | "green",
                "current_value": 10000.0,
                "threshold": 0.20,
                "change_pct": -0.25,
                "message": "销售额环比下降 25%"
            },
            ...
        ]
    """
    merged_thresholds = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    signals: list[dict[str, Any]] = []

    if not kpi_dict:
        return signals

    changes = kpi_dict.get("changes", kpi_dict)
    current = kpi_dict.get("current", kpi_dict)

    def _pct(a: float, b: float) -> float:
        return (a - b) / b if b and b != 0 else 0.0

    # 销售额
    curr_rev = float(current.get("total_revenue", 0))
    prev_rev = float(changes.get("previous_revenue", 0)) if "previous_revenue" in changes else (
        curr_rev / (1 + _pct(
            float(current.get("total_revenue", 0)),
            float(changes.get("total_revenue", 0)) if "total_revenue" in changes else 0,
        )) if "total_revenue" in changes and changes.get("total_revenue", 0) != -1 else 0
    )
    rev_change = changes.get("total_revenue", 0.0)
    if isinstance(rev_change, (int, float)):
        if rev_change <= merged_thresholds["revenue_drop_red"]:
            signals.append({
                "metric": "total_revenue",
                "severity": "red",
                "current_value": curr_rev,
                "threshold": merged_thresholds["revenue_drop_red"],
                "change_pct": rev_change,
                "message": f"销售额环比下降 {abs(rev_change):.0%}，超过警戒线 {abs(merged_thresholds['revenue_drop_red']):.0%}",
            })
        elif rev_change >= merged_thresholds["revenue_growth_green"]:
            signals.append({
                "metric": "total_revenue",
                "severity": "green",
                "current_value": curr_rev,
                "threshold": merged_thresholds["revenue_growth_green"],
                "change_pct": rev_change,
                "message": f"销售额环比增长 {rev_change:.0%}，表现良好",
            })

    # 订单量
    order_change = changes.get("total_orders", 0.0)
    if isinstance(order_change, (int, float)):
        if order_change <= merged_thresholds["orders_drop_red"]:
            signals.append({
                "metric": "total_orders",
                "severity": "red",
                "current_value": float(current.get("total_orders", 0)),
                "threshold": merged_thresholds["orders_drop_red"],
                "change_pct": order_change,
                "message": f"订单量环比下降 {abs(order_change):.0%}，需排查流量或转化问题",
            })

    # AOV
    aov_change = changes.get("avg_order_value", 0.0)
    if isinstance(aov_change, (int, float)):
        if aov_change <= merged_thresholds["aov_drop_red"]:
            signals.append({
                "metric": "avg_order_value",
                "severity": "red",
                "current_value": float(current.get("avg_order_value", 0)),
                "threshold": merged_thresholds["aov_drop_red"],
                "change_pct": aov_change,
                "message": f"客单价环比下降 {abs(aov_change):.0%}，需关注定价或品类结构",
            })
        elif aov_change >= merged_thresholds["aov_growth_green"]:
            signals.append({
                "metric": "avg_order_value",
                "severity": "green",
                "current_value": float(current.get("avg_order_value", 0)),
                "threshold": merged_thresholds["aov_growth_green"],
                "change_pct": aov_change,
                "message": f"客单价环比增长 {aov_change:.0%}，客群价值提升",
            })

    # 新客下降
    new_cust_change = changes.get("new_customer_orders", 0.0)
    if isinstance(new_cust_change, (int, float)) and new_cust_change != 0:
        if new_cust_change <= merged_thresholds["new_customer_drop_red"]:
            signals.append({
                "metric": "new_customer_orders",
                "severity": "red",
                "current_value": float(current.get("new_customer_orders", 0)),
                "threshold": merged_thresholds["new_customer_drop_red"],
                "change_pct": new_cust_change,
                "message": f"新客订单量环比下降 {abs(new_cust_change):.0%}，需加强拉新",
            })

    # 按严重程度排序: red 在前
    signals.sort(key=lambda s: (0 if s["severity"] == "red" else 1))
    return signals


# ═══════════════════════════════════════════════════════════
# Attribution Analysis
# ═══════════════════════════════════════════════════════════


def attribute_changes(change_dict: dict[str, Any]) -> list[dict[str, Any]]:
    """
    归因分析：识别驱动变化的因子。

    分析的维度包括：
    - Volume effect: 订单量变化的影响
    - Price effect: 客单价变化的影响
    - Mix effect: 品类结构变化的影响（需有品类列）
    - New vs Repeat shift: 客户结构变化的影响

    Args:
        change_dict: trend_comparison 的输出（含 current, comparison, changes）

    Returns:
        list[dict]: [
            {
                "factor": "volume_effect",
                "direction": "positive" | "negative",
                "impact_pct": 0.12,
                "description": "订单量增长贡献 +12%",
            },
            ...
        ]
    """
    attributions: list[dict[str, Any]] = []

    if not change_dict or "error" in change_dict:
        return attributions

    current = change_dict.get("current", {})
    comparison = change_dict.get("comparison", {})
    changes = change_dict.get("changes", {})

    # Volume effect: 订单量
    order_change = changes.get("total_orders", 0.0)
    if isinstance(order_change, (int, float)) and order_change != 0:
        attributions.append({
            "factor": "volume_effect",
            "direction": "positive" if order_change > 0 else "negative",
            "impact_pct": order_change,
            "description": (
                f"订单量变化贡献 {order_change:+.0%}"
            ),
        })

    # Price effect: AOV
    aov_change = changes.get("avg_order_value", 0.0)
    if isinstance(aov_change, (int, float)) and aov_change != 0:
        attributions.append({
            "factor": "price_effect",
            "direction": "positive" if aov_change > 0 else "negative",
            "impact_pct": aov_change,
            "description": (
                f"客单价变化贡献 {aov_change:+.0%}"
            ),
        })

    # Mix effect: 新客/回购结构漂移
    curr_new = current.get("new_customer_orders", 0) if isinstance(current, dict) else 0
    prev_new = comparison.get("new_customer_orders", 0) if isinstance(comparison, dict) else 0
    curr_total = max(int(current.get("total_orders", 0) if isinstance(current, dict) else 0), 1)
    prev_total = max(int(comparison.get("total_orders", 0) if isinstance(comparison, dict) else 0), 1)

    curr_new_ratio = curr_new / curr_total
    prev_new_ratio = prev_new / prev_total
    mix_shift = curr_new_ratio - prev_new_ratio

    if abs(mix_shift) > 0.02:
        attributions.append({
            "factor": "mix_effect",
            "direction": "positive" if mix_shift > 0 else "negative",
            "impact_pct": mix_shift,
            "description": (
                f"新客占比 {curr_new_ratio:.0%} (上期 {prev_new_ratio:.0%})，"
                f"结构漂移 {mix_shift:+.0%}"
            ),
        })

    # Revenue decomposition
    curr_rev = float(current.get("total_revenue", 0)) if isinstance(current, dict) else 0
    prev_rev = float(comparison.get("total_revenue", 0)) if isinstance(comparison, dict) else 0
    if prev_rev > 0:
        rev_from_volume = (curr_total - prev_total) * (
            float(comparison.get("avg_order_value", 0) if isinstance(comparison, dict) else 0)
        )
        rev_from_price = (curr_rev - prev_rev) - rev_from_volume
        attributions.append({
            "factor": "revenue_decomposition",
            "direction": "positive" if rev_from_volume > 0 else "negative" if rev_from_volume < 0 else "neutral",
            "impact_pct": rev_from_volume / prev_rev,
            "description": (
                f"收入增量: 订单量效应 {rev_from_volume:+.0f}, "
                f"AOV/价格效应 {rev_from_price:+.0f}"
            ),
        })

    # 按影响绝对值排序
    attributions.sort(key=lambda a: abs(a["impact_pct"]), reverse=True)
    return attributions


# ═══════════════════════════════════════════════════════════
# Action Plan Generation
# ═══════════════════════════════════════════════════════════


def generate_action_plan(
    signals: list[dict[str, Any]],
    attribution: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    根据红绿信号和归因结果，生成优先处理行动清单。

    Args:
        signals: flag_red_green_signals 的输出
        attribution: attribute_changes 的输出

    Returns:
        list[dict]: [
            {
                "priority": 1,
                "action": "优化移动端结账流程",
                "category": "转化优化",
                "expected_impact": "高",
                "related_signal": "aov_drop_red",
                "effort": "中",
            },
            ...
        ]
    """
    action_plan: list[dict[str, Any]] = []

    # 从红色信号生成行动项
    red_signals = [s for s in signals if s.get("severity") == "red"]
    for signal in red_signals:
        metric = signal.get("metric", "")
        action = _signal_to_action(metric, signal)
        if action:
            action_plan.append(action)

    # 从归因结果补充行动项
    neg_factors = [a for a in attribution if a.get("direction") == "negative"]
    for factor in neg_factors:
        action = _attribution_to_action(factor)
        if action:
            action_plan.append(action)

    # 优先排降序
    for i, item in enumerate(action_plan):
        item["priority"] = i + 1

    return action_plan


def _signal_to_action(metric: str, signal: dict[str, Any]) -> Optional[dict[str, Any]]:
    """将单个信号映射为行动项。"""
    actions = {
        "total_revenue": {
            "action": "分析销售下滑根因，排查流量来源与转化率变化",
            "category": "营收恢复",
            "expected_impact": "高",
            "effort": "高",
        },
        "total_orders": {
            "action": "评估渠道获取能力，检查广告投放 ROI 与自然流量变化",
            "category": "流量获取",
            "expected_impact": "高",
            "effort": "中",
        },
        "avg_order_value": {
            "action": "优化捆绑销售策略或调整定价，提升客单价",
            "category": "定价策略",
            "expected_impact": "中",
            "effort": "低",
        },
        "new_customer_orders": {
            "action": "加大拉新投入或优化首单转化体验",
            "category": "新客获取",
            "expected_impact": "高",
            "effort": "中",
        },
    }
    action_info = actions.get(metric)
    if action_info:
        return {
            **action_info,
            "related_signal": signal.get("metric", ""),
            "priority": 0,
        }
    return None


def _attribution_to_action(factor: dict[str, Any]) -> Optional[dict[str, Any]]:
    """将负面归因因子映射为行动项。"""
    factor_name = factor.get("factor", "")
    actions_map = {
        "volume_effect": {
            "action": "诊断流量或转化率下降根因，检查各渠道获客效率",
            "category": "流量转化",
            "expected_impact": "高",
            "effort": "高",
        },
        "price_effect": {
            "action": "检查定价策略与促销力度，评估价格弹性对营收的影响",
            "category": "定价策略",
            "expected_impact": "中",
            "effort": "低",
        },
        "mix_effect": {
            "action": "分析新老客结构变化，针对性调整营销策略",
            "category": "客户结构",
            "expected_impact": "中",
            "effort": "中",
        },
    }
    action_info = actions_map.get(factor_name)
    if action_info:
        return {
            **action_info,
            "related_signal": factor_name,
            "priority": 0,
        }
    return None


# ═══════════════════════════════════════════════════════════
# Full Report Generation
# ═══════════════════════════════════════════════════════════


def generate_review_report(
    df: pd.DataFrame,
    period_start: str,
    period_end: str,
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    生成完整经营复盘报告 (REVIEW.md 结构)。

    串联 KPI 树 → 趋势对比 → 红绿信号 → 归因分析 → 行动建议。

    Args:
        df: 标准化后的订单 DataFrame
        period_start: 周期开始日期 (YYYY-MM-DD)
        period_end: 周期结束日期 (YYYY-MM-DD)
        config: 可选配置字典，支持:
            - thresholds: 自定义信号阈值
            - comparison_start / comparison_end: 对比周期范围
            - window_days: KPI 树窗口 (默认 30)
            - top_n: SKU 排行数量 (默认 5)

    Returns:
        dict: {
            "metadata": {"report_type": "review", "period": "..."},
            "data_quality": {...},
            "kpi_tree": {...},
            "trend": {...},
            "signals": [...],
            "attribution": [...],
            "action_plan": [...],
            "review_markdown": "...",
        }
    """
    config = config or {}
    thresholds = config.get("thresholds")
    window_days = config.get("window_days", 30)
    top_n = config.get("top_n", 5)

    # 1. 数据质量
    quality = shared_quality_report(
        df,
        required_fields=["order_date", "order_amount"],
        date_field="order_date",
        amount_field="order_amount",
        id_field="order_id",
    )
    sample_check = check_sample_size(df)

    report: dict[str, Any] = {
        "metadata": {
            "report_type": "business_review",
            "period": f"{period_start} ~ {period_end}",
            "generated_at": datetime.now().isoformat(),
        },
        "data_quality": quality.to_dict() if hasattr(quality, "to_dict") else quality,
        "sample_check": sample_check,
    }

    # 2. KPI 树
    report["kpi_tree"] = compute_kpi_tree(df, window_days=window_days)

    # 3. 趋势对比
    start_dt = pd.Timestamp(period_start)
    end_dt = pd.Timestamp(period_end)
    period_df = df[(df["order_date"] >= start_dt) & (df["order_date"] <= end_dt)].copy()

    comp_start = config.get("comparison_start")
    comp_end = config.get("comparison_end")
    if comp_start and comp_end:
        comp_start_dt = pd.Timestamp(comp_start)
        comp_end_dt = pd.Timestamp(comp_end)
        comparison_df = df[(df["order_date"] >= comp_start_dt) & (df["order_date"] <= comp_end_dt)].copy()
        report["trend"] = compute_trend_comparison(period_df, comparison_df)
    else:
        # 默认对比上一周期
        period_len = (end_dt - start_dt).days
        prev_start = start_dt - pd.Timedelta(days=period_len + 1)
        prev_end = start_dt - pd.Timedelta(days=1)
        comparison_df = df[(df["order_date"] >= prev_start) & (df["order_date"] <= prev_end)].copy()
        report["trend"] = compute_trend_comparison(period_df, comparison_df)

    # 4. 红绿信号
    report["signals"] = flag_red_green_signals(report["trend"], thresholds=thresholds)

    # 5. 归因分析
    report["attribution"] = attribute_changes(report["trend"])

    # 6. 行动计划
    report["action_plan"] = generate_action_plan(report["signals"], report["attribution"])

    # 7. REVIEW.md 文本
    report["review_markdown"] = _format_review_markdown(report)

    return report


def _normalize_order_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize common cross-border order CSV fields for review analysis."""
    result = df.rename(columns={
        "Name": "order_id",
        "Created at": "order_date",
        "Lineitem name": "product_name",
        "Lineitem sku": "product_id",
        "Lineitem quantity": "quantity",
        "Total": "order_amount",
        "Email": "customer_id",
        "order_amount": "order_amount",
        "amount": "order_amount",
        "sku_name": "product_name",
        "sku_id": "product_id",
    }).copy()

    if "order_date" in result.columns:
        result["order_date"] = pd.to_datetime(result["order_date"], errors="coerce")
    if "order_amount" in result.columns:
        result["order_amount"] = (
            result["order_amount"]
            .astype(str)
            .str.replace(r"[¥￥$,]", "", regex=True)
        )
        result["order_amount"] = pd.to_numeric(result["order_amount"], errors="coerce").fillna(0.0)
    if "quantity" in result.columns:
        result["quantity"] = pd.to_numeric(result["quantity"], errors="coerce").fillna(1).astype(int)
    if "customer_id" not in result.columns:
        result["customer_id"] = "unknown"
    if "is_refunded" not in result.columns:
        result["is_refunded"] = False

    required = {"order_date", "order_amount"}
    missing = sorted(required - set(result.columns))
    if missing:
        raise ValueError(f"Missing required order fields: {', '.join(missing)}")
    result = result[result["order_date"].notna()].copy()
    if result.empty:
        raise ValueError("No valid order rows after parsing order_date")
    return result


def _infer_period(df: pd.DataFrame, period_start: str | None, period_end: str | None) -> tuple[str, str]:
    dates = pd.to_datetime(df["order_date"], errors="coerce").dropna()
    if dates.empty:
        raise ValueError("Cannot infer period without valid order_date values")
    start = period_start or str(dates.min().date())
    end = period_end or str(dates.max().date())
    return start, end


def _json_safe(value: Any) -> Any:
    """Convert pandas/numpy values to JSON-safe Python primitives."""
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


def process(
    input_path: str | Path | None = None,
    file_path: str | Path | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    window_days: int = 30,
    top_n: int = 5,
    encoding: str = "utf-8",
    **_: object,
) -> dict[str, Any]:
    """SkillRunner-compatible entrypoint for uploaded order CSV files."""
    source_path = input_path or file_path
    if not source_path:
        raise ValueError("input_path or file_path is required")

    df = pd.read_csv(source_path, encoding=encoding)
    normalized = _normalize_order_columns(df)
    inferred_start, inferred_end = _infer_period(normalized, period_start, period_end)
    report = generate_review_report(
        normalized,
        period_start=inferred_start,
        period_end=inferred_end,
        config={"window_days": window_days, "top_n": top_n},
    )
    safe_report = _json_safe(report)
    polar_star = safe_report.get("kpi_tree", {}).get("polar_star", {})
    actions = safe_report.get("action_plan", [])
    signals = safe_report.get("signals", [])

    return {
        "summary": (
            f"Business review generated: {polar_star.get('total_orders', 0)} orders, "
            f"revenue={polar_star.get('revenue', 0)}"
        ),
        "input_path": str(source_path),
        "period": f"{inferred_start} ~ {inferred_end}",
        "row_count": int(len(normalized)),
        "kpi_tree": safe_report.get("kpi_tree", {}),
        "signals": signals,
        "action_plan": actions,
        "data_quality": safe_report.get("data_quality", {}),
        "review_markdown": safe_report.get("review_markdown", ""),
    }


# ═══════════════════════════════════════════════════════════
# Markdown Formatting
# ═══════════════════════════════════════════════════════════


def _format_review_markdown(report: dict[str, Any]) -> str:
    """将报告字典格式化为 REVIEW.md 风格的 Markdown 文本。"""
    lines: list[str] = []
    meta = report.get("metadata", {})
    lines.append(f"# E-Commerce Business Review")
    lines.append(f"")
    lines.append(f"**Period**: {meta.get('period', 'N/A')}")
    lines.append(f"**Generated**: {meta.get('generated_at', 'N/A')}")
    lines.append(f"")

    # 数据质量
    dq = report.get("data_quality", {})
    lines.append(f"## Data Scope and Quality Gate")
    lines.append(f"")
    lines.append(f"- Total Rows: {dq.get('total_rows', 'N/A')}")
    lines.append(f"- Detected Platform: {dq.get('detected_platform', 'N/A')}")
    lines.append(f"- Missing Values: {dq.get('missing_values', {})}")
    sample = report.get("sample_check", {})
    lines.append(f"- Sample: {sample.get('message', 'N/A')}")
    lines.append(f"")

    # KPI 树
    kt = report.get("kpi_tree", {})
    lines.append(f"## KPI Tree ({kt.get('window_days', 'N/A')}-day window)")
    lines.append(f"")
    ps = kt.get("polar_star", {})
    lines.append(f"### Polar Star Metrics")
    lines.append(f"")
    lines.append(f"| Metric | Value |")
    lines.append(f"|--------|-------|")
    lines.append(f"| GMV | {ps.get('gmv', 'N/A')} |")
    lines.append(f"| Revenue (net) | {ps.get('revenue', 'N/A')} |")
    lines.append(f"| Returns | {ps.get('returns', 'N/A')} |")
    lines.append(f"| Total Orders | {ps.get('total_orders', 'N/A')} |")
    lines.append(f"")

    gf = kt.get("growth_factors", {})
    lines.append(f"### Growth Factors")
    lines.append(f"")
    orders_info = gf.get("orders", {})
    lines.append(f"- Orders: {orders_info.get('total', 0)} (New: {orders_info.get('new_customer_orders', 0)}, Repeat: {orders_info.get('repeat_customer_orders', 0)})")
    lines.append(f"- AOV: {gf.get('aov', 'N/A')}")
    lines.append(f"- Avg Units/Order: {gf.get('avg_units_per_order', 'N/A')}")
    lines.append(f"- Avg Unit Price: {gf.get('avg_unit_price', 'N/A')}")
    lines.append(f"")

    cq = kt.get("customer_quality", {})
    lines.append(f"### Customer Quality")
    lines.append(f"")
    lines.append(f"- Unique Customers: {cq.get('unique_customers', 'N/A')}")
    lines.append(f"- Repeat Purchase Rate: {cq.get('repeat_purchase_rate', 'N/A')}")
    lines.append(f"- New Customer Ratio: {cq.get('new_customer_ratio', 'N/A')}")
    lines.append(f"- Repeat Customer Ratio: {cq.get('repeat_customer_ratio', 'N/A')}")
    lines.append(f"")

    # 趋势
    trend = report.get("trend", {})
    lines.append(f"## Period-over-Period Comparison")
    lines.append(f"")
    changes = trend.get("changes", {})
    if changes:
        lines.append(f"| Metric | Change |")
        lines.append(f"|--------|--------|")
        for metric, pct in changes.items():
            if isinstance(pct, float):
                lines.append(f"| {metric} | {pct:+.1%} |")
            else:
                lines.append(f"| {metric} | {pct} |")
    lines.append(f"")

    # 信号
    signals = report.get("signals", [])
    lines.append(f"## Red / Green Signals")
    lines.append(f"")
    if signals:
        for sig in signals:
            icon = "RED" if sig.get("severity") == "red" else "GREEN"
            lines.append(f"- **{icon}**: {sig.get('message', '')}")
    else:
        lines.append(f"No significant signals detected.")
    lines.append(f"")

    # 归因
    attrs = report.get("attribution", [])
    lines.append(f"## Root Cause Hypotheses")
    lines.append(f"")
    if attrs:
        for attr in attrs:
            lines.append(f"- **{attr.get('factor', '')}** ({attr.get('direction', '')}): {attr.get('description', '')}")
    else:
        lines.append(f"Insufficient data for attribution analysis.")
    lines.append(f"")

    # 行动
    actions = report.get("action_plan", [])
    lines.append(f"## Priority Action Plan")
    lines.append(f"")
    if actions:
        for act in actions:
            lines.append(f"{act.get('priority', '?')}. **{act.get('action', '')}**")
            lines.append(f"   - Category: {act.get('category', 'N/A')}, Expected Impact: {act.get('expected_impact', 'N/A')}, Effort: {act.get('effort', 'N/A')}")
    else:
        lines.append(f"No specific actions recommended at this time.")
    lines.append(f"")

    lines.append(f"## Metrics to Recheck Next Cycle")
    lines.append(f"")
    lines.append(f"- Verify data completeness and field mapping")
    lines.append(f"- Confirm refund rate calculation consistency")
    lines.append(f"- Re-evaluate after next reporting cycle")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════
# Internal: KPI formatting
# ═══════════════════════════════════════════════════════════


def _kpi_to_dict(kpi: KPIResult, label: str = "") -> dict[str, Any]:
    """将 KPIResult 对象转换为可序列化字典。"""
    return {
        "label": label,
        "total_orders": kpi.total_orders,
        "total_revenue": round(kpi.total_revenue, 2) if kpi.total_revenue else 0.0,
        "unique_customers": kpi.unique_customers,
        "avg_order_value": round(kpi.avg_order_value, 2) if kpi.avg_order_value else 0.0,
        "conversion_rate": f"{kpi.conversion_rate:.1%}" if kpi.conversion_rate > 0 else "N/A",
        "repeat_purchase_rate": f"{kpi.repeat_purchase_rate:.1%}" if kpi.repeat_purchase_rate > 0 else "N/A",
        "avg_items_per_order": round(kpi.avg_items_per_order, 1) if kpi.avg_items_per_order else 0.0,
        "refund_rate": f"{kpi.refund_rate:.1%}" if kpi.refund_rate > 0 else "N/A",
    }
