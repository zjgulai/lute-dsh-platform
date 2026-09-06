"""
电商季度战略核心分析逻辑 (E-Commerce Quarterly Strategy Core)

提供季度维度的电商 KPI 计算、月度细分、年度目标完成预测、增长驱动识别
以及战略建议生成。所有 KPI 计算委托 _shared.ecom_kpi 模块实现，
本层做业务编排与格式化。

Usage:
    from scripts.core import generate_quarterly_report

    report = generate_quarterly_report(df, year=2026, quarter=1,
                                       config={"annual_target": {"total_revenue": 50000000}})
    print(report["kpis"])
"""

from __future__ import annotations

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
    compare_periods as shared_compare_periods,
    compute_core_kpis,
    compute_daily_kpis as shared_compute_daily_kpis,
    detect_signals,
    rank_top_skus as shared_rank_top_skus,
)

logger = logging.getLogger(__name__)

_WARNING_EMPTY_DF = "输入 DataFrame 为空，返回空结果"
_WARNING_INSUFFICIENT_DATA = "数据不足 30 天，季度分析的置信度可能降低"


# ═══════════════════════════════════════════════════════
# Quarter Bounds Helpers
# ═══════════════════════════════════════════════════════

QUARTER_MONTHS: dict[int, tuple[int, int, int]] = {
    1: (1, 2, 3),
    2: (4, 5, 6),
    3: (7, 8, 9),
    4: (10, 11, 12),
}


def _quarter_bounds(year: int, quarter: int) -> tuple[str, str]:
    """
    计算季度起止日期。

    Args:
        year: 年份 (如 2026)
        quarter: 季度 (1-4)

    Returns:
        (start_date, end_date) 格式 "YYYY-MM-DD"
    """
    if quarter not in QUARTER_MONTHS:
        raise ValueError(f"季度必须为 1-4，收到 {quarter}")

    start_month = QUARTER_MONTHS[quarter][0]
    start = datetime(year, start_month, 1)

    end_month = QUARTER_MONTHS[quarter][2]
    if end_month == 12:
        end = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = datetime(year, end_month + 1, 1) - timedelta(days=1)

    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def _prev_quarter(year: int, quarter: int) -> tuple[int, int]:
    """计算上季度 (year, quarter)。"""
    if quarter == 1:
        return year - 1, 4
    return year, quarter - 1


def _month_bounds(year: int, month: int) -> tuple[str, str]:
    """计算月份起止日期。"""
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = datetime(year, month + 1, 1) - timedelta(days=1)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


# ═══════════════════════════════════════════════════════
# Quarterly KPI Computation
# ═══════════════════════════════════════════════════════


def compute_quarterly_kpis(
    df: pd.DataFrame,
    year: int,
    quarter: int,
    annual_target: Optional[dict[str, float]] = None,
) -> dict[str, Any]:
    """
    计算季度核心 KPI 及年度目标完成度。

    委托 _shared.ecom_kpi.compute_core_kpis 进行计算，并与 annual_target 做对比。

    Args:
        df: 标准化后的订单 DataFrame
        year: 年份 (如 2026)
        quarter: 季度 (1-4)
        annual_target: 年度目标字典 (可选)，支持的键:
            - total_revenue: 年度销售额目标
            - total_orders: 年度订单量目标

    Returns:
        dict: {
            "period": "2026-Q1",
            "total_orders": 28500,
            "total_revenue": 11568000.0,
            "unique_customers": 18200,
            "avg_order_value": 405.9,
            "conversion_rate": "3.5%",
            "repeat_purchase_rate": "18.2%",
            "avg_items_per_order": 2.1,
            "refund_rate": "0.9%",
            "attainment": {
                "total_revenue": {"target": 50000000.0, "actual": 11568000.0, "rate": 23.1, "status": "warning"},
                ...
            },
            "data_days": 90
        }

    Raises:
        ValueError: 输入数据为空或季度无效
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return _empty_quarterly_dict(year, quarter)

    start_date, end_date = _quarter_bounds(year, quarter)

    kpi = compute_core_kpis(df, start_date, end_date)

    # 统计有效天数
    ts_start = pd.Timestamp(start_date)
    ts_end = pd.Timestamp(end_date)
    period_df = df[(df["order_date"] >= ts_start) & (df["order_date"] <= ts_end)]
    data_days = period_df["order_date"].dt.date.nunique() if "order_date" in period_df.columns else 0

    result = _kpi_to_dict(kpi)
    result["period"] = f"{year}-Q{quarter}"
    result["data_days"] = int(data_days)

    # 年度目标完成度
    if annual_target:
        result["attainment"] = _compute_annual_attainment(kpi, annual_target)
    else:
        result["attainment"] = {}

    return result


# ═══════════════════════════════════════════════════════
# Monthly Breakdown Within Quarter
# ═══════════════════════════════════════════════════════


def compute_monthly_breakdown(
    df: pd.DataFrame,
    year: int,
    quarter: int,
) -> list[dict[str, Any]]:
    """
    计算季度内三个月的细分 KPI 及环比趋势。

    Args:
        df: 标准化后的订单 DataFrame
        year: 年份
        quarter: 季度 (1-4)

    Returns:
        list[dict]: [
            {
                "month": 1,
                "period": "2026-01",
                "total_revenue": 3500000.0,
                "total_orders": 8500,
                "unique_customers": 6200,
                "avg_order_value": 411.8,
                "share_pct": {"revenue": 30.3, "orders": 29.8},
                "mom_change_pct": null
            },
            {
                "month": 2,
                "period": "2026-02",
                ...
                "mom_change_pct": {"total_revenue": 10.2, "total_orders": 8.5}
            },
            ...
        ]
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return []

    months = QUARTER_MONTHS.get(quarter)
    if months is None:
        raise ValueError(f"季度必须为 1-4，收到 {quarter}")

    # 计算季度合计用于占比
    q_start, q_end = _quarter_bounds(year, quarter)
    ts_qs = pd.Timestamp(q_start)
    ts_qe = pd.Timestamp(q_end)
    q_df = df[(df["order_date"] >= ts_qs) & (df["order_date"] <= ts_qe)]
    q_total_rev = float(q_df["order_amount"].sum()) if len(q_df) > 0 else 0.0
    q_total_ord = len(q_df)

    breakdown: list[dict[str, Any]] = []
    prev_month_kpi: Optional[KPIResult] = None

    for i, month in enumerate(months):
        ms, me = _month_bounds(year, month)
        ts_ms = pd.Timestamp(ms)
        ts_me = pd.Timestamp(me)
        m_df = q_df[(q_df["order_date"] >= ts_ms) & (q_df["order_date"] <= ts_me)]

        month_kpi = compute_core_kpis(df, ms, me)

        m_rev = month_kpi.total_revenue
        m_ord = month_kpi.total_orders

        entry: dict[str, Any] = {
            "month": month,
            "period": f"{year}-{month:02d}",
            "total_revenue": round(m_rev, 2),
            "total_orders": m_ord,
            "unique_customers": month_kpi.unique_customers,
            "avg_order_value": round(month_kpi.avg_order_value, 2),
            "conversion_rate": f"{month_kpi.conversion_rate:.1%}",
            "repeat_purchase_rate": f"{month_kpi.repeat_purchase_rate:.1%}",
            "avg_items_per_order": round(month_kpi.avg_items_per_order, 1),
            "refund_rate": f"{month_kpi.refund_rate:.1%}",
            "share_pct": {
                "revenue": round(m_rev / max(q_total_rev, 1) * 100, 1),
                "orders": round(m_ord / max(q_total_ord, 1) * 100, 1),
            },
            "mom_change_pct": None,
        }

        # 环比上月
        if prev_month_kpi is not None and prev_month_kpi.total_orders > 0:
            mom_changes: dict[str, float] = {}
            if prev_month_kpi.total_revenue > 0:
                mom_changes["total_revenue"] = round(
                    (m_rev - prev_month_kpi.total_revenue) / prev_month_kpi.total_revenue * 100, 1
                )
            if prev_month_kpi.total_orders > 0:
                mom_changes["total_orders"] = round(
                    (m_ord - prev_month_kpi.total_orders) / prev_month_kpi.total_orders * 100, 1
                )
            if mom_changes:
                entry["mom_change_pct"] = mom_changes

        breakdown.append(entry)
        prev_month_kpi = month_kpi

    return breakdown


# ═══════════════════════════════════════════════════════
# Annual Performance Projection
# ═══════════════════════════════════════════════════════


def project_annual_performance(
    ytd_kpis: dict[str, Any],
    annual_target: dict[str, float],
) -> dict[str, Any]:
    """
    基于季度已完成的 YTD KPI，线性推算全年表现。

    假设剩余月份保持当前季度的月均水平。

    Args:
        ytd_kpis: compute_quarterly_kpis 返回的 YTD 累计 KPI
        annual_target: 年度目标字典

    Returns:
        dict: {
            "projected_full_year": {
                "total_revenue": 48500000.0,
                "total_orders": 118000,
                ...
            },
            "attainment": {
                "total_revenue": {"target": 50000000.0, "projected": 48500000.0, "rate": 97.0, "gap": -1500000.0},
                ...
            },
            "remaining_months": 9,
            "monthly_average": {"total_revenue": 3856000.0, "total_orders": 9500},
            "confidence": "medium"
        }
    """
    empty_result: dict[str, Any] = {
        "projected_full_year": {},
        "attainment": {},
        "remaining_months": 12,
        "monthly_average": {},
        "confidence": "low",
        "warning": "数据不足，无法进行可靠预测",
    }

    if not ytd_kpis or not annual_target:
        return empty_result

    # 提取 YTD 累积值
    ytd_revenue = float(ytd_kpis.get("total_revenue", 0))
    ytd_orders = int(ytd_kpis.get("total_orders", 0))
    data_days = int(ytd_kpis.get("data_days", 0))

    if data_days <= 0:
        return empty_result

    # 已过去月数 = 数据天数 / 30 (近似)
    elapsed_months = max(round(data_days / 30), 1)
    remaining_months = max(12 - elapsed_months, 0)

    monthly_avg_rev = ytd_revenue / elapsed_months
    monthly_avg_ord = ytd_orders / elapsed_months

    projected_rev = ytd_revenue + monthly_avg_rev * remaining_months
    projected_ord = ytd_orders + monthly_avg_ord * remaining_months

    projected: dict[str, float] = {
        "total_revenue": round(projected_rev, 2),
        "total_orders": round(projected_ord),
    }

    attainment: dict[str, dict[str, float]] = {}
    for metric, target_val in annual_target.items():
        proj_val = projected.get(metric, 0)
        rate = round(proj_val / max(target_val, 1) * 100, 1)
        gap = round(proj_val - target_val, 2)
        attainment[metric] = {
            "target": target_val,
            "projected": proj_val,
            "rate": rate,
            "gap": gap,
            "status": "exceeded" if rate >= 105 else ("on_track" if rate >= 95 else "at_risk"),
        }

    # 置信度评估
    if elapsed_months >= 9:
        confidence = "high"
    elif elapsed_months >= 6:
        confidence = "medium"
    elif elapsed_months >= 3:
        confidence = "low"
    else:
        confidence = "very_low"

    return {
        "projected_full_year": projected,
        "attainment": attainment,
        "elapsed_months": elapsed_months,
        "remaining_months": remaining_months,
        "monthly_average": {
            "total_revenue": round(monthly_avg_rev, 2),
            "total_orders": round(monthly_avg_ord),
        },
        "confidence": confidence,
    }


# ═══════════════════════════════════════════════════════
# Growth Driver Identification
# ═══════════════════════════════════════════════════════


def identify_growth_drivers(
    monthly_kpis: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    识别季度内增长驱动因素。

    分析维度:
    - 月环比持续增长的指标 (连续正增长)
    - 销售额超出月均水平的月份
    - 占比显著上升的月份

    Args:
        monthly_kpis: compute_monthly_breakdown 返回的三个月数据

    Returns:
        list[dict]: [
            {
                "driver": "revenue_growth",
                "label": "销售额持续增长",
                "direction": "up",
                "strength": "strong",
                "evidence": ["2月环比 +10.2%", "3月环比 +9.2%"],
                "detail": "前两个月受春节影响，3月快速恢复并超越基准。建议持续加大引流投入。"
            },
            ...
        ]
    """
    if not monthly_kpis or len(monthly_kpis) < 2:
        return []

    drivers: list[dict[str, Any]] = []

    # 1) 收入增长趋势
    revenues = [m.get("total_revenue", 0) for m in monthly_kpis]
    orders = [m.get("total_orders", 0) for m in monthly_kpis]
    aovs = [m.get("avg_order_value", 0) for m in monthly_kpis]

    # 连续增长检测
    if len(revenues) >= 2:
        rev_increases = sum(1 for i in range(1, len(revenues)) if revenues[i] > revenues[i - 1])
        if rev_increases == len(revenues) - 1:
            evidence = []
            for i in range(1, len(monthly_kpis)):
                mom = monthly_kpis[i].get("mom_change_pct", {})
                if isinstance(mom, dict) and "total_revenue" in mom:
                    evidence.append(f"{monthly_kpis[i]['period']} 环比 +{mom['total_revenue']:.1f}%")
            drivers.append({
                "driver": "revenue_growth",
                "label": "销售额持续增长",
                "direction": "up",
                "strength": "strong",
                "evidence": evidence or ["各月均环比正增长"],
                "detail": "季度内销售额呈持续上升趋势，产品市场竞争力和营销效率在提升。建议持续关注增长动力的可持续性。",
            })
        elif rev_increases >= len(revenues) // 2:
            # 波动但整体向上
            if revenues[-1] > revenues[0]:
                total_pct = (revenues[-1] - revenues[0]) / max(revenues[0], 1) * 100
                drivers.append({
                    "driver": "revenue_growth",
                    "label": "销售额总体增长",
                    "direction": "up",
                    "strength": "medium",
                    "evidence": [f"季度内累计增长 {total_pct:.1f}%"],
                    "detail": "季度销售额整体呈增长态势，但过程中有波动。建议识别波动原因并平滑增长曲线。",
                })

    # 2) 订单量增长
    ord_increases = sum(1 for i in range(1, len(orders)) if orders[i] > orders[i - 1])
    if ord_increases == len(orders) - 1:
        evidence = []
        for i in range(1, len(monthly_kpis)):
            mom = monthly_kpis[i].get("mom_change_pct", {})
            if isinstance(mom, dict) and "total_orders" in mom:
                evidence.append(f"{monthly_kpis[i]['period']} 环比 +{mom['total_orders']:.1f}%")
        drivers.append({
            "driver": "order_volume_growth",
            "label": "订单量持续增长",
            "direction": "up",
            "strength": "strong",
            "evidence": evidence or ["各月订单量均环比增长"],
            "detail": "订单量季度内持续增长，用户规模和购买频次在提升。建议加大新客获取和复购激励。",
        })

    # 3) 客单价变化
    if len(aovs) >= 2:
        aov_change = (aovs[-1] - aovs[0]) / max(aovs[0], 1) * 100
        if aov_change > 5:
            drivers.append({
                "driver": "aov_improvement",
                "label": "客单价提升",
                "direction": "up",
                "strength": "medium",
                "evidence": [f"客单价从 ¥{aovs[0]:.2f} 升至 ¥{aovs[-1]:.2f} ({aov_change:+.1f}%)"],
                "detail": "客单价呈上升趋势，产品升级或捆绑销售策略有效。建议继续优化产品组合和定价策略。",
            })
        elif aov_change < -5:
            drivers.append({
                "driver": "aov_decline",
                "label": "客单价下降",
                "direction": "down",
                "strength": "warning",
                "evidence": [f"客单价从 ¥{aovs[0]:.2f} 降至 ¥{aovs[-1]:.2f} ({aov_change:+.1f}%)"],
                "detail": "客单价出现下降趋势，可能受促销活动或低价品占比上升影响。建议评估促销折扣力度和品类结构。",
            })

    # 4) 复购率分析
    rprs = [m.get("repeat_purchase_rate", "0.0%") for m in monthly_kpis]
    rpr_values = []
    for r in rprs:
        try:
            rpr_values.append(float(r.replace("%", "")))
        except (ValueError, AttributeError):
            rpr_values.append(0.0)

    if len(rpr_values) >= 2 and rpr_values[-1] > rpr_values[0]:
        rpr_change = rpr_values[-1] - rpr_values[0]
        if rpr_change > 1:
            drivers.append({
                "driver": "repeat_purchase_improvement",
                "label": "复购率提升",
                "direction": "up",
                "strength": "positive",
                "evidence": [f"复购率从 {rpr_values[0]:.1f}% 升至 {rpr_values[-1]:.1f}%"],
                "detail": "复购率呈上升趋势，用户粘性增强，说明留存策略和产品体验在改善。",
            })

    return drivers


# ═══════════════════════════════════════════════════════
# Strategic Recommendations
# ═══════════════════════════════════════════════════════


def generate_strategic_recommendations(
    kpis: dict[str, Any],
    risks: list[dict[str, Any]],
    drivers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    基于 KPI、风险信号和增长驱动生成下季度策略建议。

    Args:
        kpis: compute_quarterly_kpis 返回的 KPI 字典
        risks: detect_signals 返回的风险信号列表 (红色信号)
        drivers: identify_growth_drivers 返回的增长驱动列表

    Returns:
        list[dict]: [
            {
                "priority": 1,
                "category": "target",
                "title": "下季度目标设定",
                "content": "Q2 目标: ¥13,000,000 (+12% QoQ)",
                "actions": ["具体行动项 1", "具体行动项 2"],
                "rationale": "基于 Q1 增长趋势和季节性因素"
            },
            ...
        ]
    """
    recommendations: list[dict[str, Any]] = []

    if not kpis or not kpis.get("total_revenue"):
        recommendations.append({
            "priority": 1,
            "category": "data",
            "title": "数据不足以生成建议",
            "content": "KPI 数据不足，无法生成有效策略建议。请提供完整季度数据。",
            "actions": [],
            "rationale": "需要至少一个月的有效数据",
        })
        return recommendations

    current_revenue = float(kpis.get("total_revenue", 0))
    current_orders = int(kpis.get("total_orders", 0))

    # 1) 目标设定建议
    if current_revenue > 0:
        next_target = round(current_revenue * 1.12, -3)  # 12% QoQ 增长，取整
        recommendations.append({
            "priority": 1,
            "category": "target",
            "title": "下季度目标设定建议",
            "content": f"建议下季度销售额目标: ¥{next_target:,.0f} (+12% QoQ)",
            "actions": [
                "参照本季度实际表现 + 季节性系数调整目标",
                "将目标分解到各月和各渠道",
                "设定对应的营销预算和资源投入计划",
            ],
            "rationale": (
                f"本季度实现销售额 ¥{current_revenue:,.0f}，订单量 {current_orders:,} 单。"
                "基于行业平均环比增长率 (8-15%) 及季度季节性特征，建议 12% 的环比增长目标。"
            ),
        })

    # 2) 从增长驱动生成建议
    up_drivers = [d for d in drivers if d.get("direction") == "up"]
    if up_drivers:
        driver_titles = [d.get("label", "") for d in up_drivers]
        recommendations.append({
            "priority": 2,
            "category": "growth",
            "title": "强化增长动能",
            "content": f"持续投入已验证的增长方向: {'、'.join(driver_titles)}",
            "actions": [
                "加大已验证推广渠道的预算投入",
                "扩大核心增长 SKU 的库存和曝光",
                "基于增长动因设计下季度运营策略",
            ],
            "rationale": "增长驱动因素已在本季度得到验证，此方向确定性较高。",
        })

    # 3) 风险应对
    risk_items = [r for r in risks if r.get("severity") == "red"]
    if risk_items:
        risk_messages = [r.get("message", "") for r in risk_items]
        recommendations.append({
            "priority": 3,
            "category": "risk",
            "title": "风险应对措施",
            "content": "重点关注以下风险领域并制定应对方案",
            "actions": [
                f"排查: {risk_messages[0] if risk_messages else '各项KPI指标'}",
                "制定专项改进计划，明确责任人",
                "设置月度监控预警机制",
            ],
            "rationale": "红色信号表明需立即关注，以避免影响下季度业绩。",
        })

    # 4) 资源分配建议
    recommendations.append({
        "priority": 4,
        "category": "resource",
        "title": "资源分配建议",
        "content": "基于本季度表现优化下季度资源分配",
        "actions": [
            "根据渠道效率重新分配营销预算",
            "基于 SKU 表现调整库存结构",
            "评估团队能力缺口并补充关键岗位",
        ],
        "rationale": (
            "资源应向高回报领域倾斜，同时保持核心业务稳定投入。"
        ),
    })

    # 5) 季节性准备
    recommendations.append({
        "priority": 5,
        "category": "seasonal",
        "title": "季节性准备",
        "content": "提前布局下季度的季节性营销和供应链",
        "actions": [
            "预判下季度促销节点 (如618、暑期等)",
            "提前备货核心 SKU，避免旺季缺货",
            "制定分阶段的营销投放计划",
        ],
        "rationale": "下季度可能包含重要促销节点，提前准备可最大化活动收益。",
    })

    return recommendations


# ═══════════════════════════════════════════════════════
# Full Report Generation
# ═══════════════════════════════════════════════════════


def generate_quarterly_report(
    df: pd.DataFrame,
    year: int,
    quarter: int,
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    完整的季度战略报告流水线。

    整合所有分析维度:
    - 季度核心 KPI 与年度目标完成度
    - 三月月度细分
    - 环比 (与上季度)
    - Top SKU 排行
    - 增长驱动识别
    - 年度目标预测
    - 战略建议
    - 数据质量报告

    Args:
        df: 标准化后的订单 DataFrame
        year: 年份 (如 2026)
        quarter: 季度 (1-4)
        config: 配置字典，支持字段:
            - annual_target: 年度目标字典
            - top_n: SKU 排行数量 (默认 10)
            - prev_period: 环比对比周期 (year, quarter)，默认上季度
            - include_quality_report: 是否包含数据质量 (默认 True)
            - min_sample_size: 样本量阈值 (默认 30)

    Returns:
        dict: {
            "report_type": "quarterly_strategy",
            "period": "2026-Q1",
            "kpis": { ... },
            "monthly_breakdown": [ ... ],
            "qoq_comparison": { ... },
            "top_skus": [ ... ],
            "growth_drivers": [ ... ],
            "annual_projection": { ... },
            "recommendations": [ ... ],
            "quality": { ... },
            "sample_check": { ... },
            "generated_at": "2026-04-01T10:00:00"
        }
    """
    if config is None:
        config = {}

    annual_target: Optional[dict[str, float]] = config.get("annual_target")
    top_n = config.get("top_n", 10)

    # 环比周期：默认上季度
    prev_period = config.get("prev_period")
    if prev_period is None:
        prev_year, prev_q = _prev_quarter(year, quarter)
        prev_period = (prev_year, prev_q)

    include_quality = config.get("include_quality_report", True)
    min_samples = config.get("min_sample_size", 30)

    report: dict[str, Any] = {
        "report_type": "quarterly_strategy",
        "period": f"{year}-Q{quarter}",
        "generated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }

    # 空数据检查
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        report["warning"] = _WARNING_EMPTY_DF
        return report

    # 数据量检查
    start_date, end_date = _quarter_bounds(year, quarter)
    ts_start = pd.Timestamp(start_date)
    ts_end = pd.Timestamp(end_date)
    period_df = df[(df["order_date"] >= ts_start) & (df["order_date"] <= ts_end)]
    total_days = period_df["order_date"].dt.date.nunique() if "order_date" in period_df.columns else 0

    if total_days < 30:
        logger.warning(_WARNING_INSUFFICIENT_DATA)
        report["warning"] = _WARNING_INSUFFICIENT_DATA

    # 1) 季度 KPI
    report["kpis"] = compute_quarterly_kpis(df, year, quarter, annual_target=annual_target)

    # 2) 月度细分
    report["monthly_breakdown"] = compute_monthly_breakdown(df, year, quarter)

    # 3) 环比对比 (与上季度)
    qoq = _compute_qoq_comparison(df, (year, quarter), prev_period)
    report["qoq_comparison"] = qoq

    # 4) Top SKU
    report["top_skus"] = shared_rank_top_skus(df, metric="revenue", top_n=top_n)

    # 5) 增长驱动识别
    report["growth_drivers"] = identify_growth_drivers(report["monthly_breakdown"])

    # 6) 年度目标预测
    if annual_target:
        report["annual_projection"] = project_annual_performance(report["kpis"], annual_target)

    # 7) 战略建议
    risks = qoq.get("signals", []) if "warning" not in qoq else []
    report["recommendations"] = generate_strategic_recommendations(
        report["kpis"], risks, report["growth_drivers"]
    )

    # 8) 数据质量
    if include_quality:
        try:
            report["quality"] = shared_quality_report(df).to_dict()
        except Exception as e:
            logger.warning("数据质量报告生成失败: %s", e)
            report["quality"] = {"error": str(e)}

    # 9) 样本量检查
    report["sample_check"] = check_sample_size(df, min_rows=min_samples)

    return report


# ═══════════════════════════════════════════════════════
# Internal Helpers
# ═══════════════════════════════════════════════════════


def _compute_qoq_comparison(
    df: pd.DataFrame,
    current_period: tuple[int, int],
    prev_period: tuple[int, int],
) -> dict[str, Any]:
    """
    计算季度环比 (QoQ) 对比。

    委托 _shared.ecom_kpi.compare_periods 实现。

    Args:
        df: 标准化后的订单 DataFrame
        current_period: (year, quarter) 当期
        prev_period: (year, quarter) 上期

    Returns:
        dict: 包含当前/上期 KPI、变化率和红绿信号
    """
    if df is None or df.empty:
        logger.warning(_WARNING_EMPTY_DF)
        return {
            "current_period": f"{current_period[0]}-Q{current_period[1]}",
            "previous_period": f"{prev_period[0]}-Q{prev_period[1]}",
            "warning": _WARNING_EMPTY_DF,
        }

    cur_start, cur_end = _quarter_bounds(*current_period)
    prev_start, prev_end = _quarter_bounds(*prev_period)

    comparison = shared_compare_periods(df, cur_start, cur_end, prev_start, prev_end)

    result: dict[str, Any] = {
        "current_period": f"{current_period[0]}-Q{current_period[1]}",
        "previous_period": f"{prev_period[0]}-Q{prev_period[1]}",
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


def _kpi_to_dict(kpi: KPIResult) -> dict[str, Any]:
    """将 KPIResult 转换为纯字典。"""
    d = kpi.to_dict()
    d.pop("period", None)
    return d


def _compute_annual_attainment(
    kpi: KPIResult,
    annual_target: dict[str, float],
) -> dict[str, dict[str, float]]:
    """计算 KPI 年度目标完成度。"""
    metric_map: dict[str, float] = {
        "total_revenue": kpi.total_revenue,
        "total_orders": float(kpi.total_orders),
        "avg_order_value": kpi.avg_order_value,
        "unique_customers": float(kpi.unique_customers),
    }

    attainment: dict[str, dict[str, float]] = {}
    for metric, target_val in annual_target.items():
        actual_val = metric_map.get(metric)
        if actual_val is None:
            continue
        rate = round(actual_val / max(target_val, 1) * 100, 1)

        # 年度目标按时间进度判断
        attainment[metric] = {
            "target": target_val,
            "actual": actual_val,
            "rate": rate,
            "status": "exceeded" if rate >= 100 else ("warning" if rate >= 85 else "missed"),
        }

    return attainment


def _empty_quarterly_dict(year: int, quarter: int) -> dict[str, Any]:
    """返回空的季度 KPI 字典。"""
    return {
        "period": f"{year}-Q{quarter}",
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
