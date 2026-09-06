#!/usr/bin/env python3
"""
大促效果分析 CLI — 自包含单文件，无外部依赖（仅 pandas）。

输入活动期订单 CSV，输出活动效果评估、ROI 分析、流量转化分析、优化建议。

Usage:
    python scripts/run.py --input orders.csv --campaign-config config.json
    python scripts/run.py --input orders.csv --campaign-config '{"dates": {"pre_heat": ["2026-03-01","2026-03-03"], "peak": ["2026-03-04","2026-03-06"], "return": ["2026-03-07","2026-03-08"]}, "costs": {"ad_spend": 680000, "discount_cost": 852000, "logistics_subsidy": 128000}}' --format json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import pandas as pd


# ══════════════════════════════════════════════════════════════
# Data validation
# ══════════════════════════════════════════════════════════════

def _validate_input(df: pd.DataFrame) -> dict[str, Any]:
    """验证输入数据质量。"""
    issues = []
    if df.empty:
        issues.append("订单数据为空")
        return {"valid": False, "issues": issues, "row_count": 0}

    if "order_date" not in df.columns:
        issues.append("缺少必要列: order_date")

    has_promo_flag = any(
        col in df.columns for col in ["is_promo", "活动标记", "promo_flag", "campaign_flag"]
    )
    if not has_promo_flag:
        issues.append("CSV 缺少活动标记字段（is_promo / 活动标记），无法区分活动订单")

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "row_count": len(df),
        "has_promo_flag": has_promo_flag,
    }


# ══════════════════════════════════════════════════════════════
# Activity KPI computation
# ══════════════════════════════════════════════════════════════

def _compute_kpis(df: pd.DataFrame) -> dict[str, Any]:
    """计算活动期核心 KPI。"""
    amount_col = next((c for c in ["order_amount", "amount", "金额", "sales"] if c in df.columns), None)
    if amount_col is None:
        return {"total_revenue": 0, "total_orders": len(df), "avg_order_value": 0, "unique_customers": 0}

    total_rev = float(df[amount_col].sum())
    total_ord = len(df)
    aov = round(total_rev / max(total_ord, 1), 2)
    cust_col = next((c for c in ["customer_id", "customer", "客户ID"] if c in df.columns), None)
    unique_cust = int(df[cust_col].nunique()) if cust_col else 0

    return {
        "total_revenue": round(total_rev, 2),
        "total_orders": total_ord,
        "avg_order_value": aov,
        "unique_customers": unique_cust,
    }


def _compute_incremental(
    campaign_kpis: dict, baseline_df: Optional[pd.DataFrame]
) -> Optional[dict[str, Any]]:
    """计算 vs 基线的增量效果。"""
    if baseline_df is None or baseline_df.empty:
        return None
    base_kpis = _compute_kpis(baseline_df)
    rev_inc = campaign_kpis["total_revenue"] - base_kpis["total_revenue"]
    ord_inc = campaign_kpis["total_orders"] - base_kpis["total_orders"]
    return {
        "revenue_increment": round(rev_inc, 2),
        "order_increment": ord_inc,
        "revenue_uplift_pct": round(rev_inc / max(base_kpis["total_revenue"], 1) * 100, 1),
        "order_uplift_pct": round(ord_inc / max(base_kpis["total_orders"], 1) * 100, 1),
    }


# ══════════════════════════════════════════════════════════════
# ROI computation
# ══════════════════════════════════════════════════════════════

def _compute_roi(revenue_increment: float, costs: dict[str, float]) -> dict[str, Any]:
    """计算活动 ROI。"""
    total_cost = sum(costs.values())
    roi = round(revenue_increment / max(total_cost, 1), 2)
    net = round(revenue_increment - total_cost, 2)
    breakdown = {}
    for k, v in costs.items():
        breakdown[k] = round(v / max(total_cost, 1) * 100, 1)
    return {
        "costs": costs,
        "total_cost": round(total_cost, 2),
        "revenue_increment": round(revenue_increment, 2),
        "roi_ratio": roi,
        "roi_label": f"{roi}",
        "net_profit": net,
        "cost_breakdown_pct": breakdown,
    }


# ══════════════════════════════════════════════════════════════
# Period segmentation
# ══════════════════════════════════════════════════════════════

def _segment_periods(
    df: pd.DataFrame, dates: dict[str, list[str]]
) -> dict[str, Any]:
    """按预热/爆发/返场切分活动期。"""
    amount_col = next((c for c in ["order_amount", "amount", "金额", "sales"] if c in df.columns), None)
    if amount_col is None:
        return {"segments": {}, "total_revenue": 0, "total_orders": 0}

    segments = {}
    total_rev = 0.0
    total_ord = 0
    for phase, (start, end) in dates.items():
        mask = (df["order_date"] >= start) & (df["order_date"] <= end)
        seg_df = df[mask]
        rev = float(seg_df[amount_col].sum()) if len(seg_df) > 0 else 0.0
        ords = len(seg_df)
        total_rev += rev
        total_ord += ords
        segments[phase] = {
            "period": f"{start} ~ {end}",
            "total_revenue": round(rev, 2),
            "total_orders": ords,
            "avg_order_value": round(rev / max(ords, 1), 2),
        }
    for phase, data in segments.items():
        data["share_pct"] = {
            "revenue": round(data["total_revenue"] / max(total_rev, 1) * 100, 1),
            "orders": round(data["total_orders"] / max(total_ord, 1) * 100, 1),
        }
    return {"segments": segments, "total_revenue": round(total_rev, 2), "total_orders": total_ord}


# ══════════════════════════════════════════════════════════════
# Hourly distribution
# ══════════════════════════════════════════════════════════════

def _hourly_distribution(df: pd.DataFrame) -> list[dict[str, Any]]:
    """计算每日时段销售分布。"""
    if "order_date" not in df.columns:
        return []
    amount_col = next((c for c in ["order_amount", "amount", "金额", "sales"] if c in df.columns), None)
    if amount_col is None:
        return []
    df = df.copy()
    df["date"] = pd.to_datetime(df["order_date"]).dt.date
    daily = df.groupby("date").agg(
        revenue=(amount_col, "sum"),
        orders=(amount_col, "count"),
    ).reset_index()
    return [{"date": str(r.date), "revenue": round(r.revenue, 2), "orders": int(r.orders)}
            for r in daily.itertuples()]


# ══════════════════════════════════════════════════════════════
# Top SKUs
# ══════════════════════════════════════════════════════════════

def _top_skus(df: pd.DataFrame, top_n: int = 10) -> list[dict[str, Any]]:
    """排名 Top SKU。"""
    amount_col = next((c for c in ["order_amount", "amount", "金额", "sales"] if c in df.columns), None)
    sku_col = next((c for c in ["sku", "product", "商品", "product_name"] if c in df.columns), None)
    if amount_col is None or sku_col is None:
        return []
    grouped = df.groupby(sku_col).agg(
        revenue=(amount_col, "sum"),
        orders=(amount_col, "count"),
    ).reset_index().sort_values("revenue", ascending=False).head(top_n)
    return [{"sku": str(r[sku_col]), "revenue": round(r.revenue, 2), "orders": int(r.orders)}
            for r in grouped.itertuples()]


# ══════════════════════════════════════════════════════════════
# Optimization suggestions
# ══════════════════════════════════════════════════════════════

def _generate_suggestions(segments: dict, roi: dict) -> list[str]:
    """生成活动优化建议。"""
    suggestions = []
    segs = segments.get("segments", {})
    pre = segs.get("pre_heat", {})
    peak = segs.get("peak", {})
    ret = segs.get("return", {})
    pre_share = pre.get("share_pct", {}).get("revenue", 0)
    peak_share = peak.get("share_pct", {}).get("revenue", 0)
    ret_share = ret.get("share_pct", {}).get("revenue", 0)

    if pre_share < 10:
        suggestions.append("预热期营收占比偏低（<10%），建议延长预热期或加大蓄客力度")
    if peak_share < 60:
        suggestions.append("爆发期营收占比不足60%，建议在爆发期集中投放和限时优惠")
    if ret_share < 8:
        suggestions.append("返场期营收占比偏低，建议延长返场期并加大推送力度")
    if ret_share > 20:
        suggestions.append("返场期占比偏高，可能爆发期力度不足，建议优化爆发期节奏")

    roi_ratio = roi.get("roi_ratio", 0)
    if roi_ratio < 1.5:
        suggestions.append(f"ROI偏低（{roi_ratio}），建议优化广告投放和折扣策略控制成本")
    elif roi_ratio > 3:
        suggestions.append(f"ROI表现优秀（{roi_ratio}），建议加大投入规模复制成功经验")

    return suggestions


# ══════════════════════════════════════════════════════════════
# Main report generation
# ══════════════════════════════════════════════════════════════

def generate_report(
    df: pd.DataFrame,
    campaign_config: dict[str, Any],
    baseline_df: Optional[pd.DataFrame] = None,
) -> dict[str, Any]:
    """生成大促活动复盘报告。"""
    validation = _validate_input(df)
    if not validation["valid"]:
        return {"error": True, "validation": validation, "message": "数据验证失败，请检查输入"}

    kpis = _compute_kpis(df)
    incremental = _compute_incremental(kpis, baseline_df)

    dates = campaign_config.get("dates", {})
    segments = _segment_periods(df, dates) if dates else {"segments": {}, "total_revenue": 0, "total_orders": 0}

    costs = campaign_config.get("costs", {})
    rev_inc = incremental.get("revenue_increment", kpis["total_revenue"]) if incremental else kpis["total_revenue"]
    roi = _compute_roi(rev_inc, costs) if costs else {"roi_ratio": 0, "total_cost": 0, "net_profit": 0}

    hourly = _hourly_distribution(df)
    top = _top_skus(df)
    suggestions = _generate_suggestions(segments, roi)

    return {
        "error": False,
        "validation": validation,
        "kpis": kpis,
        "incremental": incremental,
        "segments": segments,
        "roi": roi,
        "hourly_distribution": hourly,
        "top_skus": top,
        "suggestions": suggestions,
        "generated_at": datetime.now().isoformat(),
    }


# ══════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════

def _parse_config(config_arg: str) -> dict[str, Any]:
    """解析 campaign-config 参数（JSON 字符串或文件路径）。"""
    path = Path(config_arg)
    if path.exists() and path.suffix in (".json", ".yaml", ".yml"):
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(config_arg)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ecom-promo-analysis",
        description="电商大促活动效果分析 — 输入活动期订单 CSV，输出活动复盘报告、ROI 分析与优化建议",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --input orders.csv --campaign-config '{"dates": {"pre_heat": ["2026-03-01","2026-03-03"], "peak": ["2026-03-04","2026-03-06"], "return": ["2026-03-07","2026-03-08"]}, "costs": {"ad_spend": 680000, "discount_cost": 852000}}'
  %(prog)s --input orders.csv --campaign-config config.json --format json --output report.json
  %(prog)s --input orders.csv --campaign-config config.json --baseline baseline.csv
        """,
    )
    parser.add_argument("--input", required=True, help="活动期订单 CSV 文件路径")
    parser.add_argument("--campaign-config", required=True, help="活动配置 JSON 字符串或文件路径")
    parser.add_argument("--baseline", default=None, help="活动前同期数据 CSV（对比基准）")
    parser.add_argument("--format", choices=["text", "json"], default="text", help="输出格式")
    parser.add_argument("--output", default=None, help="输出文件路径（默认 stdout）")
    return parser


def _format_text(report: dict) -> str:
    """格式化文本报告。"""
    if report.get("error"):
        return f"❌ 错误: {report.get('message', '未知错误')}\n验证: {report.get('validation', {})}"

    kpis = report["kpis"]
    inc = report.get("incremental")
    roi = report["roi"]
    segs = report["segments"]
    sgs = report["suggestions"]

    lines = []
    lines.append("🎉 大促活动复盘报告")
    lines.append("━" * 50)
    lines.append("")
    lines.append("【活动概览】")
    lines.append(f"销售额: ¥{kpis['total_revenue']:,.0f}")
    lines.append(f"订单量: {kpis['total_orders']:,}单")
    lines.append(f"客单价: ¥{kpis['avg_order_value']:,.2f}")
    lines.append(f"独立客户: {kpis['unique_customers']}人")

    if inc:
        lines.append("")
        lines.append("【增量效果】")
        lines.append(f"增量收入: ¥{inc['revenue_increment']:,.0f}")
        lines.append(f"收入增长: +{inc['revenue_uplift_pct']}%")
        lines.append(f"订单增长: +{inc['order_uplift_pct']}%")

    if roi.get("total_cost", 0) > 0:
        lines.append("")
        lines.append("【ROI 分析】")
        lines.append(f"总投入: ¥{roi['total_cost']:,.0f}")
        lines.append(f"ROI: {roi['roi_ratio']}")
        lines.append(f"净利润估算: ¥{roi['net_profit']:,.0f}")

    if segs.get("segments"):
        lines.append("")
        lines.append("【时段分析】")
        for phase, data in segs["segments"].items():
            share = data.get("share_pct", {}).get("revenue", 0)
            star = " ⭐" if share > 50 else ""
            lines.append(f"{phase}: ¥{data['total_revenue']:,.0f} ({share}%){star}")

    if sgs:
        lines.append("")
        lines.append("【优化建议】")
        for s in sgs:
            lines.append(f"  • {s}")

    lines.append("")
    lines.append(f"报告生成时间: {report['generated_at']}")
    return "\n".join(lines)


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"❌ 文件不存在: {args.input}", file=sys.stderr)
        sys.exit(1)
    df = pd.read_csv(input_path)

    baseline_df = None
    if args.baseline:
        bp = Path(args.baseline)
        if bp.exists():
            baseline_df = pd.read_csv(bp)

    config = _parse_config(args.campaign_config)
    report = generate_report(df, config, baseline_df)

    if args.format == "json":
        out = json.dumps(report, ensure_ascii=False, indent=2, default=str)
    else:
        out = _format_text(report)

    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
        print(f"✅ 报告已写入: {args.output}")
    else:
        print(out)


if __name__ == "__main__":
    main()