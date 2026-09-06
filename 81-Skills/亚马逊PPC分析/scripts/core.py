"""
Amazon PPC Analyzer - 核心分析逻辑

Amazon PPC 广告数据解析、健康评分、浪费花费识别、否定词建议和竞价调整。
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any, Optional

try:
    import pandas as pd

    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

def _check_sample_size(data, min_rows: int = 10) -> dict:
    payload = data.get("data", data) if isinstance(data, dict) else data
    n = len(payload) if hasattr(payload, "__len__") else 0
    return {"is_sufficient": n >= min_rows, "row_count": n, "min_rows": min_rows}


def _validate_fields(rows, required=None) -> dict:
    required = required or []
    missing = [f for f in required if not rows or f not in rows[0]]
    return {"valid": not missing, "missing": missing}


class _DataQualityReport:
    def __init__(self, total_rows: int):
        self.total_rows = total_rows

    def to_dict(self) -> dict:
        return {"total_rows": self.total_rows, "is_ready": self.total_rows > 0}


def _generate_quality_report(df, required_fields=None, numeric_fields=None, amount_field=None):
    total = int(len(df)) if df is not None else 0
    return _DataQualityReport(total)


# ──────────────────────────────────────────────
# Column Normalization
# ──────────────────────────────────────────────

_SEARCH_TERM_COLUMN_ALIASES = {
    # Amazon standard headers
    "campaign_name": ("campaign name", "campaign", "campaign_name"),
    "campaign_id": ("campaign id", "campaign-id", "campaign_id"),
    "ad_group_name": ("ad group name", "ad group", "ad_group", "ad_group_name"),
    "ad_group_id": ("ad group id", "ad group-id", "ad_group_id"),
    "targeting": ("targeting", "targeting type", "match type", "match_type"),
    "keyword": (
        "keyword",
        "customer search term",
        "search term",
        "search_term",
        "customer_search_term",
    ),
    "impressions": ("impressions", "impression", "impr."),
    "clicks": ("clicks", "click"),
    "ctr": ("ctr", "click-through rate", "click_thru_rate"),
    "spend": ("spend", "cost", "costs", "total spend", "total_spend"),
    "sales": ("sales", "total sales", "total_sales", "revenue", "total revenue"),
    "acos": ("acos", "a.co.s.", "total acos", "total_acos"),
    "roas": ("roas", "roi", "return on ad spend"),
    "orders": (
        "orders",
        "7 day total orders",
        "14 day total orders",
        "total orders",
        "total_orders",
        "units ordered",
        "units_ordered",
    ),
    "conversions": ("conversions", "conversion", "cvr", "conversion rate"),
}

_NORMALIZED_COLUMNS = [
    "campaign_name",
    "campaign_id",
    "ad_group_name",
    "ad_group_id",
    "targeting",
    "keyword",
    "impressions",
    "clicks",
    "ctr",
    "spend",
    "sales",
    "acos",
    "roas",
    "orders",
    "conversions",
]


def _normalize_column(name: str) -> str:
    """Map a raw CSV column name to the normalized internal name."""
    name_lower = name.strip().lower().replace("_", " ")
    for canonical, aliases in _SEARCH_TERM_COLUMN_ALIASES.items():
        if name_lower in aliases:
            return canonical
    # fallback: snake_case from any delimiters
    return name.strip().replace(" ", "_").lower()


def parse_search_term_report(csv_path: str | Path) -> dict:
    """
    Parse an Amazon Search Term Report CSV and return normalized data.

    Handles BOM, mixed encodings, and column name variations.

    Args:
        csv_path: Path to the Amazon Search Term Report CSV file.

    Returns:
        dict with keys:
            - 'data': list[dict] of normalized rows
            - 'quality_report': DataQualityReport dict
            - 'columns_found': list of normalized column names present
            - 'row_count': int
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        raw_columns = reader.fieldnames or []
        normalized_cols = {c: _normalize_column(c) for c in raw_columns}
        rows: list[dict] = []
        for row in reader:
            normalized_row: dict[str, Any] = {}
            for raw_col, val in row.items():
                norm_col = normalized_cols.get(raw_col, raw_col)
                normalized_row[norm_col] = val.strip() if val else ""
            rows.append(normalized_row)

    # Convert numeric columns
    numeric_fields = [
        "impressions",
        "clicks",
        "ctr",
        "spend",
        "sales",
        "acos",
        "roas",
        "orders",
        "conversions",
    ]
    for row in rows:
        for field in numeric_fields:
            if field in row and row[field]:
                try:
                    row[field] = float(row[field])
                except (ValueError, TypeError):
                    row[field] = 0.0
            elif field in row:
                row[field] = 0.0 if field in ("impressions", "clicks", "orders", "conversions") else 0.0

    # Ensure integer fields are int
    for row in rows:
        for int_field in ("impressions", "clicks", "orders", "conversions"):
            if int_field in row:
                row[int_field] = int(round(row[int_field]))

    quality = None
    if HAS_PANDAS:
        df = pd.DataFrame(rows)
        quality = _generate_quality_report(
            df,
            required_fields=["keyword", "spend"],
            numeric_fields=numeric_fields,
            amount_field="spend",
        )
        quality = quality.to_dict()
    else:
        quality = {
            "total_rows": len(rows),
            "total_columns": len(normalized_cols),
            "is_ready": len(rows) > 0,
        }

    columns_found = list(normalized_cols.values()) if normalized_cols else []

    return {
        "data": rows,
        "quality_report": quality,
        "columns_found": columns_found,
        "row_count": len(rows),
    }


# ──────────────────────────────────────────────
# Health Score
# ──────────────────────────────────────────────


def calculate_ppc_health_score(campaign_data: dict) -> dict:
    """
    Calculate a 0-100 PPC health score with weighted dimension breakdown.

    Dimensions and weights:
        - ACoS health (30%)
        - ROAS health (25%)
        - CTR health (15%)
        - CVR health (15%)
        - Impression share health (15%)

    Args:
        campaign_data: dict with keys:
            - 'acos': float (e.g. 0.25 for 25%)
            - 'target_acos': float (default 0.30)
            - 'roas': float
            - 'ctr': float (e.g. 0.005 for 0.5%)
            - 'cvr': float (e.g. 0.10 for 10%)
            - 'impression_share': float (e.g. 0.60 for 60%), optional

    Returns:
        dict with keys:
            - 'overall_score': float (0-100)
            - 'dimensions': dict of dimension name -> score breakdown
            - 'rating': str (Excellent / Good / Fair / Poor / Critical)
    """
    target_acos = campaign_data.get("target_acos", 0.30)
    acos = campaign_data.get("acos", target_acos)
    roas = campaign_data.get("roas", 0.0)
    ctr = campaign_data.get("ctr", 0.0)
    cvr = campaign_data.get("cvr", 0.0)
    impression_share = campaign_data.get("impression_share", None)

    # --- ACoS score: lower is better ---
    if acos <= 0:
        acos_score = 100.0
    elif acos <= target_acos:
        acos_score = 100.0 - ((acos / target_acos) * 30)
        acos_score = max(60.0, acos_score)
    else:
        # above target: penalty scales with overshoot
        overshoot_ratio = acos / target_acos
        if overshoot_ratio <= 1.5:
            acos_score = 60.0 - (overshoot_ratio - 1.0) * 80
        elif overshoot_ratio <= 2.0:
            acos_score = 30.0 - (overshoot_ratio - 1.5) * 40
        else:
            acos_score = 10.0
        acos_score = max(0.0, acos_score)

    # --- ROAS score: higher is better ---
    if roas <= 0:
        roas_score = 0.0
    elif roas >= 4.0:
        roas_score = 100.0
    else:
        roas_score = (roas / 4.0) * 100.0

    # --- CTR score ---
    BENCHMARK_CTR = 0.005  # 0.5%
    if ctr <= 0:
        ctr_score = 0.0
    elif ctr >= BENCHMARK_CTR * 2:
        ctr_score = 100.0
    else:
        ctr_score = (ctr / (BENCHMARK_CTR * 2)) * 100.0

    # --- CVR score ---
    BENCHMARK_CVR = 0.10  # 10%
    if cvr <= 0:
        cvr_score = 0.0
    elif cvr >= BENCHMARK_CVR * 1.5:
        cvr_score = 100.0
    else:
        cvr_score = (cvr / (BENCHMARK_CVR * 1.5)) * 100.0

    # --- Impression share score ---
    if impression_share is not None and impression_share > 0:
        if impression_share >= 0.80:
            is_score = 100.0
        elif impression_share >= 0.50:
            is_score = 70.0 + ((impression_share - 0.50) / 0.30) * 30.0
        elif impression_share >= 0.20:
            is_score = 30.0 + ((impression_share - 0.20) / 0.30) * 40.0
        else:
            is_score = (impression_share / 0.20) * 30.0
    else:
        is_score = 50.0  # neutral default when unknown

    # --- Weighted composite ---
    weights = {"acos": 0.30, "roas": 0.25, "ctr": 0.15, "cvr": 0.15, "impression_share": 0.15}
    overall = (
        acos_score * weights["acos"]
        + roas_score * weights["roas"]
        + ctr_score * weights["ctr"]
        + cvr_score * weights["cvr"]
        + is_score * weights["impression_share"]
    )

    # Rating
    if overall >= 85:
        rating = "Excellent"
    elif overall >= 70:
        rating = "Good"
    elif overall >= 50:
        rating = "Fair"
    elif overall >= 30:
        rating = "Poor"
    else:
        rating = "Critical"

    return {
        "overall_score": round(overall, 1),
        "rating": rating,
        "dimensions": {
            "acos": {"score": round(acos_score, 1), "weight": weights["acos"], "value": acos, "target": target_acos},
            "roas": {"score": round(roas_score, 1), "weight": weights["roas"], "value": roas},
            "ctr": {"score": round(ctr_score, 1), "weight": weights["ctr"], "value": ctr},
            "cvr": {"score": round(cvr_score, 1), "weight": weights["cvr"], "value": cvr},
            "impression_share": {
                "score": round(is_score, 1),
                "weight": weights["impression_share"],
                "value": impression_share,
            },
        },
    }


# ──────────────────────────────────────────────
# Wasted Spend
# ──────────────────────────────────────────────


def identify_wasted_spend(
    terms: list[dict],
    target_acos: float = 0.30,
) -> list[dict]:
    """
    Identify terms with wasted spend: high spend, high ACoS, zero orders.

    Criteria:
        - spend > $20
        - ACoS > target_acos
        - orders == 0

    Args:
        terms: list of dicts with 'spend', 'sales', 'orders', 'keyword', 'acos' keys
        target_acos: ACoS threshold (default 0.30)

    Returns:
        list of wasted-spend candidate dicts, sorted by spend descending
    """
    candidates: list[dict] = []
    for term in terms:
        spend = float(term.get("spend", 0))
        orders = int(term.get("orders", 0))
        sales = float(term.get("sales", 0))
        acos = term.get("acos")

        if acos is None:
            acos = spend / sales if sales > 0 else float("inf")

        if spend > 20 and acos > target_acos and orders == 0:
            candidates.append(
                {
                    "keyword": term.get("keyword", ""),
                    "campaign_name": term.get("campaign_name", ""),
                    "ad_group_name": term.get("ad_group_name", ""),
                    "targeting": term.get("targeting", ""),
                    "spend": round(spend, 2),
                    "sales": round(sales, 2),
                    "acos": round(acos, 4),
                    "orders": orders,
                    "impressions": int(term.get("impressions", 0)),
                    "clicks": int(term.get("clicks", 0)),
                    "reason": "wasted_spend",
                }
            )

    candidates.sort(key=lambda x: x["spend"], reverse=True)
    return candidates


# ──────────────────────────────────────────────
# Negative Keywords
# ──────────────────────────────────────────────


def suggest_negative_keywords(
    terms: list[dict],
    threshold_spend: float = 15.0,
    threshold_acos: float = 0.50,
) -> list[str]:
    """
    Suggest keywords to add as negatives based on high spend + high ACoS + low/no conversions.

    Args:
        terms: list of dicts with 'keyword', 'spend', 'acos', 'orders', 'sales'
        threshold_spend: minimum spend to consider (default $15)
        threshold_acos: minimum ACoS to consider (default 50%)

    Returns:
        list of keyword strings to consider negating
    """
    negatives: list[str] = []
    seen: set[str] = set()

    for term in terms:
        keyword = term.get("keyword", "").strip()
        if not keyword or keyword in seen:
            continue

        spend = float(term.get("spend", 0))
        acos = term.get("acos")
        orders = int(term.get("orders", 0))
        sales = float(term.get("sales", 0))

        if acos is None:
            acos = spend / sales if sales > 0 else 0.0

        if spend >= threshold_spend and acos >= threshold_acos and orders <= 0:
            negatives.append(keyword)
            seen.add(keyword)

    return negatives


# ──────────────────────────────────────────────
# Bid Adjustments
# ──────────────────────────────────────────────


def suggest_bid_adjustments(
    terms: list[dict],
    target_acos: float,
) -> list[dict]:
    """
    Suggest bid adjustments: up-bid high converters below target ACoS,
    down-bid low performers above target ACoS.

    Args:
        terms: list of dicts with 'keyword', 'spend', 'sales', 'acos', 'orders', 'impressions', 'clicks'
        target_acos: target ACoS (e.g. 0.25)

    Returns:
        list of bid adjustment suggestion dicts sorted by priority
    """
    adjustments: list[dict] = []
    for term in terms:
        keyword = term.get("keyword", "").strip()
        if not keyword:
            continue

        spend = float(term.get("spend", 0))
        sales = float(term.get("sales", 0))
        orders = int(term.get("orders", 0))
        impressions = int(term.get("impressions", 0))
        clicks = int(term.get("clicks", 0))

        acos = term.get("acos")
        if acos is None:
            acos = spend / sales if sales > 0 else 0.0

        # Skip zero-impression terms
        if impressions == 0:
            continue

        # Calculate current bid proxy (spend / clicks)
        current_bid = round(spend / clicks, 2) if clicks > 0 else 0.0

        adjustment: dict[str, Any] = {
            "keyword": keyword,
            "current_bid": current_bid,
            "spend": round(spend, 2),
            "sales": round(sales, 2),
            "acos": round(acos, 4),
            "orders": orders,
            "impressions": impressions,
            "clicks": clicks,
        }

        if acos <= target_acos * 0.8 and orders >= 1 and current_bid > 0:
            # Strong performer: up-bid
            bid_multiplier = min(target_acos / max(acos, 0.001), 2.0)
            adjustment["action"] = "up_bid"
            adjustment["suggested_bid"] = round(current_bid * bid_multiplier, 2)
            adjustment["reason"] = f"ACoS ({acos:.1%}) well below target ({target_acos:.1%}), {orders} orders"
            adjustment["priority"] = "high"
        elif acos > target_acos * 1.2 and orders <= 0:
            # Low performer: down-bid or pause
            if current_bid >= 0.50:
                reduction = min(target_acos / max(acos, 0.001), 0.75)
                adjustment["action"] = "down_bid"
                adjustment["suggested_bid"] = round(current_bid * reduction, 2)
                adjustment["reason"] = f"ACoS ({acos:.1%}) exceeds target ({target_acos:.1%}), 0 orders"
                adjustment["priority"] = "medium"
            else:
                adjustment["action"] = "consider_pause"
                adjustment["suggested_bid"] = 0.0
                adjustment["reason"] = f"ACoS ({acos:.1%}) exceeds target, 0 orders, low bid"
                adjustment["priority"] = "medium"
        else:
            # Maintain
            adjustment["action"] = "maintain"
            adjustment["suggested_bid"] = current_bid
            adjustment["reason"] = "Performance within acceptable range"
            adjustment["priority"] = "low"

        adjustments.append(adjustment)

    # Sort: high priority first
    priority_order = {"high": 0, "medium": 1, "low": 2}
    adjustments.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 99))

    return adjustments


# ──────────────────────────────────────────────
# Full Audit Pipeline
# ──────────────────────────────────────────────


def generate_ppc_audit_report(
    terms: list[dict],
    campaign_data: dict,
    config: dict | None = None,
) -> dict:
    """
    Generate a full PPC audit report.

    Pipeline:
        1. Health score
        2. Wasted spend identification
        3. Negative keyword suggestions
        4. Bid adjustment suggestions
        5. Summary statistics

    Args:
        terms: list of search term dicts (from parse_search_term_report)
        campaign_data: dict with acos, target_acos, roas, ctr, cvr, impression_share
        config: optional config dict with keys:
            - 'target_acos': float
            - 'wasted_spend_threshold': float
            - 'negative_keyword_spend_threshold': float
            - 'negative_keyword_acos_threshold': float

    Returns:
        dict with complete audit results
    """
    config = config or {}
    target_acos = config.get("target_acos", campaign_data.get("target_acos", 0.30))

    # 1. Health score
    health = calculate_ppc_health_score({**campaign_data, "target_acos": target_acos})

    # 2. Wasted spend
    wasted = identify_wasted_spend(terms, target_acos)

    # 3. Negative keywords
    neg_keywords = suggest_negative_keywords(
        terms,
        threshold_spend=config.get("negative_keyword_spend_threshold", 15.0),
        threshold_acos=config.get("negative_keyword_acos_threshold", 0.50),
    )

    # 4. Bid adjustments
    bid_ads = suggest_bid_adjustments(terms, target_acos)

    # 5. Summary statistics
    total_spend = sum(float(t.get("spend", 0)) for t in terms)
    total_sales = sum(float(t.get("sales", 0)) for t in terms)
    total_orders = sum(int(t.get("orders", 0)) for t in terms)
    total_impressions = sum(int(t.get("impressions", 0)) for t in terms)
    total_clicks = sum(int(t.get("clicks", 0)) for t in terms)
    total_acos = total_sales / total_spend if total_spend > 0 else 0.0
    actual_acos = total_spend / total_sales if total_sales > 0 else float("inf")
    overall_ctr = total_clicks / total_impressions if total_impressions > 0 else 0.0

    wasted_total = sum(c["spend"] for c in wasted)

    summary = {
        "total_terms_analyzed": len(terms),
        "total_spend": round(total_spend, 2),
        "total_sales": round(total_sales, 2),
        "total_orders": total_orders,
        "total_impressions": total_impressions,
        "total_clicks": total_clicks,
        "actual_acos": round(actual_acos, 4) if math.isfinite(actual_acos) else None,
        "overall_ctr": round(overall_ctr, 4),
        "wasted_spend_count": len(wasted),
        "wasted_spend_total": round(wasted_total, 2),
        "negative_keyword_suggestions": len(neg_keywords),
        "high_priority_adjustments": sum(1 for a in bid_ads if a.get("priority") == "high"),
    }

    return {
        "health_score": health,
        "wasted_spend": wasted,
        "negative_keywords": neg_keywords,
        "bid_adjustments": bid_ads,
        "summary": summary,
        "target_acos": target_acos,
    }
