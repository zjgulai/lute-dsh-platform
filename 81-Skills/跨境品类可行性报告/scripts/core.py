"""
cbec-category-sourcing-report - Category Sourcing Feasibility Report core logic.

Compiles global market data, analyzes price segments, evaluates supply chain
maturity, runs Gate checks, and generates a complete category feasibility report.
"""

from __future__ import annotations

import math
from typing import Any


# ──────────────────────────────────────────────
# Market Data Aggregation
# ──────────────────────────────────────────────


def aggregate_market_data(category: str, sources: list[dict]) -> dict:
    """
    Compile market data from multiple research sources.

    Aggregates market_size, CAGR, regional split (NA/EU/APAC), seasonality
    index, and growth stage classification.

    Args:
        category: category name string.
        sources: list of source dicts, each with at minimum:
            - 'market_size': float (USD M)
            - 'cagr': float (decimal, e.g. 0.08 for 8%)
            - 'regional_split': dict with 'NA', 'EU', 'APAC' keys
            Optional:
            - 'seasonality_index': float
            - 'growth_stage': str

    Returns:
        dict with:
            - 'category': str
            - 'source_count': int
            - 'data_sources_single': bool (True if only 1 source)
            - 'market_size': dict with 'min', 'max', 'avg', 'confidence'
            - 'cagr': dict with 'min', 'max', 'avg'
            - 'regional_split': dict with averaged NA/EU/APAC shares
            - 'seasonality_index': float or None
            - 'growth_stage': str (emerging/growing/mature/declining)
            - 'disclaimer': str if sources insufficient
    """
    if not sources:
        return {
            "category": category,
            "source_count": 0,
            "data_sources_single": True,
            "market_size": {"min": 0, "max": 0, "avg": 0, "confidence": "low"},
            "cagr": {"min": 0, "max": 0, "avg": 0},
            "regional_split": {"NA": 0, "EU": 0, "APAC": 0},
            "seasonality_index": None,
            "growth_stage": "unknown",
            "disclaimer": "No data sources provided. Insufficient for reliable analysis.",
        }

    sizes = [s.get("market_size", 0) for s in sources if s.get("market_size")]
    cagrs = [s.get("cagr") for s in sources if s.get("cagr")]
    region_splits = [s.get("regional_split", {}) for s in sources if s.get("regional_split")]

    # Average regional split
    avg_region: dict[str, float] = {"NA": 0.0, "EU": 0.0, "APAC": 0.0}
    if region_splits:
        for r in region_splits:
            for key in avg_region:
                avg_region[key] += r.get(key, 0)
        count = len(region_splits)
        for key in avg_region:
            avg_region[key] = round(avg_region[key] / count, 1)

    # Determine growth stage by majority vote
    stages = [s.get("growth_stage", "").lower() for s in sources if s.get("growth_stage")]
    stage_counts: dict[str, int] = {}
    for st in stages:
        stage_counts[st] = stage_counts.get(st, 0) + 1
    majority_stage = max(stage_counts, key=stage_counts.get) if stage_counts else "unknown"

    # Seasonality index: first non-None
    seasonality = None
    for s in sources:
        si = s.get("seasonality_index")
        if si is not None:
            seasonality = si
            break

    source_count = len(sources)
    data_sources_single = source_count < 2
    disclaimer = ""
    if data_sources_single:
        disclaimer = "Data source single, for reference only (Gate A not met)."

    return {
        "category": category,
        "source_count": source_count,
        "data_sources_single": data_sources_single,
        "market_size": {
            "min": min(sizes) if sizes else 0,
            "max": max(sizes) if sizes else 0,
            "avg": round(sum(sizes) / len(sizes), 2) if sizes else 0,
            "confidence": "low" if data_sources_single else "medium",
        },
        "cagr": {
            "min": min(cagrs) if cagrs else 0,
            "max": max(cagrs) if cagrs else 0,
            "avg": round(sum(cagrs) / len(cagrs), 3) if cagrs else 0,
        },
        "regional_split": avg_region,
        "seasonality_index": seasonality,
        "growth_stage": majority_stage,
        "disclaimer": disclaimer,
    }


# ──────────────────────────────────────────────
# Price Segment Analysis
# ──────────────────────────────────────────────


def analyze_price_segments(products: list[dict]) -> list[dict]:
    """
    Classify products into 4 price tiers and analyze each.

    Tiers:
        - budget: < $15
        - value: $15-35
        - premium: $35-80
        - luxury: > $80

    Args:
        products: list of product dicts with at minimum 'price', and optionally
                  'rating', 'reviews', 'brand', 'margin_estimate'.

    Returns:
        list of segment dicts sorted by share_pct descending:
            - 'segment': str
            - 'price_range': str
            - 'share_pct': float
            - 'product_count': int
            - 'avg_rating': float
            - 'avg_reviews': float (review count)
            - 'brand_count': int
            - 'margin_estimate': float (decimal)
    """
    if not products:
        return []

    segments_def = {
        "budget": (0, 15, "<$15"),
        "value": (15, 35, "$15-35"),
        "premium": (35, 80, "$35-80"),
        "luxury": (80, float("inf"), ">$80"),
    }

    segment_map: dict[str, list[dict]] = {s: [] for s in segments_def}
    for product in products:
        price = float(product.get("price", 0) or 0)
        for seg_name, (lo, hi, _) in segments_def.items():
            if lo <= price < hi:
                segment_map[seg_name].append(product)
                break

    total = len(products)
    results: list[dict] = []
    for seg_name, (lo, hi, label) in segments_def.items():
        seg_products = segment_map[seg_name]
        count = len(seg_products)
        if count == 0:
            results.append({
                "segment": seg_name,
                "price_range": label,
                "share_pct": 0.0,
                "product_count": 0,
                "avg_rating": 0.0,
                "avg_reviews": 0.0,
                "brand_count": 0,
                "margin_estimate": 0.0,
            })
            continue

        avg_rating = sum(float(p.get("rating", 0) or 0) for p in seg_products) / count
        avg_reviews = sum(float(p.get("reviews", 0) or 0) for p in seg_products) / count
        brands = set(p.get("brand", "") for p in seg_products if p.get("brand"))
        avg_margin = sum(float(p.get("margin_estimate", 0.3) or 0.3) for p in seg_products) / count

        results.append({
            "segment": seg_name,
            "price_range": label,
            "share_pct": round(count / max(total, 1) * 100, 2),
            "product_count": count,
            "avg_rating": round(avg_rating, 2),
            "avg_reviews": round(avg_reviews, 1),
            "brand_count": len(brands),
            "margin_estimate": round(avg_margin, 2),
        })

    results.sort(key=lambda x: x["share_pct"], reverse=True)
    return results


# ──────────────────────────────────────────────
# Supply Chain Evaluation
# ──────────────────────────────────────────────


def evaluate_supply_chain(category: str, suppliers: list[dict]) -> dict:
    """
    Evaluate supply chain maturity for a category.

    Scores based on OEM/ODM coverage, average MOQ, certification rate, lead
    time range, and geographic concentration.

    Args:
        category: category name string.
        suppliers: list of supplier dicts with:
            - 'name': str
            - 'oem_odm': bool
            - 'moq': int
            - 'certifications': list[str]
            - 'lead_time_days': int
            - 'region': str
            - 'rating': float
            - 'repeat_rate': float

    Returns:
        dict with:
            - 'category': str
            - 'total_suppliers': int
            - 'supplier_count_insufficient': bool (< 3 triggers warning)
            - 'oem_odm_coverage_pct': float
            - 'avg_moq': float
            - 'certification_rate': float
            - 'lead_time_range': dict with 'min', 'max', 'avg'
            - 'geographic_concentration': str
            - 'top_suppliers': list[dict]
            - 'disclaimer': str
    """
    if not suppliers:
        return {
            "category": category,
            "total_suppliers": 0,
            "supplier_count_insufficient": True,
            "oem_odm_coverage_pct": 0.0,
            "avg_moq": 0,
            "certification_rate": 0.0,
            "lead_time_range": {"min": 0, "max": 0, "avg": 0},
            "geographic_concentration": "unknown",
            "top_suppliers": [],
            "disclaimer": "Supplier count insufficient (< 3). Manual verification recommended.",
        }

    oem_count = sum(1 for s in suppliers if s.get("oem_odm", False))
    moqs = [s.get("moq", 0) for s in suppliers if s.get("moq")]
    lead_times = [s.get("lead_time_days", 0) for s in suppliers if s.get("lead_time_days")]

    # Certification: common standards
    cert_standards = {"CE", "FCC", "RoHS", "ISO 13485", "ISO 9001"}
    total_certs = 0
    max_certs_per_supplier = len(cert_standards)
    for s in suppliers:
        certs = set(s.get("certifications", []))
        total_certs += sum(1 for c in cert_standards if c in certs)
    max_possible = len(suppliers) * max_certs_per_supplier
    cert_rate = total_certs / max_possible if max_possible > 0 else 0.0

    # Geographic concentration
    regions = [s.get("region", "unknown") for s in suppliers]
    region_counts: dict[str, int] = {}
    for r in regions:
        region_counts[r] = region_counts.get(r, 0) + 1
    dominant_region = max(region_counts, key=region_counts.get) if region_counts else "unknown"
    if len(region_counts) <= 1 and len(suppliers) > 0:
        geo_concentration = f"highly concentrated ({dominant_region})"
    elif len(region_counts) <= 2:
        geo_concentration = f"moderately concentrated ({', '.join(sorted(region_counts, key=region_counts.get, reverse=True)[:2])})"
    else:
        geo_concentration = f"diversified ({len(region_counts)} regions)"

    # Top suppliers by rating
    top_suppliers = sorted(suppliers, key=lambda s: s.get("rating", 0), reverse=True)[:5]

    insufficient = len(suppliers) < 3
    disclaimer = ""
    if insufficient:
        disclaimer = "Supplier count insufficient (< 3). Manual verification recommended. Provide search keywords for further scouting."

    return {
        "category": category,
        "total_suppliers": len(suppliers),
        "supplier_count_insufficient": insufficient,
        "oem_odm_coverage_pct": round(oem_count / max(len(suppliers), 1) * 100, 1),
        "avg_moq": round(sum(moqs) / len(moqs)) if moqs else 0,
        "certification_rate": round(cert_rate * 100, 1),
        "lead_time_range": {
            "min": min(lead_times) if lead_times else 0,
            "max": max(lead_times) if lead_times else 0,
            "avg": round(sum(lead_times) / len(lead_times)) if lead_times else 0,
        },
        "geographic_concentration": geo_concentration,
        "top_suppliers": [
            {
                "name": s.get("name", "unknown"),
                "rating": s.get("rating", 0),
                "repeat_rate": s.get("repeat_rate", 0),
                "region": s.get("region", ""),
                "moq": s.get("moq", 0),
                "certifications": s.get("certifications", []),
            }
            for s in top_suppliers
        ],
        "disclaimer": disclaimer,
    }


# ──────────────────────────────────────────────
# Gate Checks
# ──────────────────────────────────────────────


def run_gate_checks(
    market_data: dict, price_data: list[dict], supply_data: dict
) -> dict:
    """
    Run 5 Gate checks from the category sourcing report framework.

    Gates:
        G1: sources >= 2
        G2: suppliers >= 3
        G3: margin >= 30% (profit margin)
        G4: market >= $5M (market size)
        G5: growth > 0 (CAGR positive)

    Args:
        market_data: dict from aggregate_market_data.
        price_data: list from analyze_price_segments.
        supply_data: dict from evaluate_supply_chain.

    Returns:
        dict with:
            - 'gates': list[dict] per gate:
                - 'gate': str
                - 'name': str
                - 'passed': bool
                - 'value': Any
                - 'threshold': str
            - 'all_passed': bool
            - 'passed_count': int
            - 'failed_gates': list[str]
    """
    gates: list[dict] = []

    # G1: sources >= 2
    source_count = market_data.get("source_count", 0)
    g1_passed = source_count >= 2
    gates.append({
        "gate": "G1",
        "name": "Data Sources",
        "passed": g1_passed,
        "value": source_count,
        "threshold": ">= 2 sources",
    })

    # G2: suppliers >= 3
    supplier_count = supply_data.get("total_suppliers", 0)
    g2_passed = supplier_count >= 3
    gates.append({
        "gate": "G2",
        "name": "Supplier Count",
        "passed": g2_passed,
        "value": supplier_count,
        "threshold": ">= 3 suppliers",
    })

    # G3: margin >= 30%
    # Use best-case margin estimate across price segments
    margins = [s.get("margin_estimate", 0) for s in price_data if s.get("margin_estimate")]
    best_margin = max(margins) if margins else 0
    g3_passed = best_margin >= 0.30
    gates.append({
        "gate": "G3",
        "name": "Profit Margin",
        "passed": g3_passed,
        "value": f"{best_margin:.0%}",
        "threshold": ">= 30%",
    })

    # G4: market >= $5M
    market_avg = market_data.get("market_size", {}).get("avg", 0)
    g4_passed = market_avg >= 5.0
    gates.append({
        "gate": "G4",
        "name": "Market Size",
        "passed": g4_passed,
        "value": f"${market_avg:.1f}M",
        "threshold": ">= $5M",
    })

    # G5: growth > 0
    cagr = market_data.get("cagr", {}).get("avg", 0)
    g5_passed = cagr > 0
    gates.append({
        "gate": "G5",
        "name": "Market Growth",
        "passed": g5_passed,
        "value": f"{cagr:.1%}",
        "threshold": "> 0% CAGR",
    })

    passed_count = sum(1 for g in gates if g["passed"])
    failed_gates = [g["gate"] for g in gates if not g["passed"]]

    return {
        "gates": gates,
        "all_passed": passed_count == len(gates),
        "passed_count": passed_count,
        "total_gates": len(gates),
        "failed_gates": failed_gates,
    }


# ──────────────────────────────────────────────
# Full Report
# ──────────────────────────────────────────────


def generate_category_report(
    category: str,
    market_data: dict,
    price_data: list[dict],
    supply_data: dict,
) -> dict:
    """
    Generate a complete category sourcing feasibility report.

    Combines market data, price segment analysis, supply chain evaluation,
    and Gate checks into a structured report with downgrade handling.

    Args:
        category: category name string.
        market_data: dict from aggregate_market_data.
        price_data: list from analyze_price_segments.
        supply_data: dict from evaluate_supply_chain.

    Returns:
        dict with complete feasibility report.
    """
    gate_results = run_gate_checks(market_data, price_data, supply_data)

    # Build key flags
    downgrade_flags: list[str] = []
    if market_data.get("data_sources_single"):
        downgrade_flags.append("G1 failed: Single data source")
    if supply_data.get("supplier_count_insufficient"):
        downgrade_flags.append("G2 failed: Insufficient suppliers")

    # Growth stage
    growth_stage = market_data.get("growth_stage", "unknown")
    region_split = market_data.get("regional_split", {})
    has_apac_first = region_split.get("APAC", 0) > region_split.get("NA", 0)
    apac_note = ""
    if has_apac_first:
        apac_note = (
            "APAC price sensitivity high. New brand conversion at $150-$250 significantly "
            "lower than NA. Recommend NA-first launch before horizontal expansion."
        )

    # Price segment summary
    avg_margin_by_segment = {s["segment"]: s["margin_estimate"] for s in price_data}
    margin_ok = any(m >= 0.30 for m in avg_margin_by_segment.values())

    summary = {
        "category": category,
        "overall_verdict": "FEASIBLE" if gate_results["all_passed"] else "CONDITIONAL",
        "gates_passed": gate_results["passed_count"],
        "gates_total": gate_results["total_gates"],
        "failed_gates": gate_results["failed_gates"],
        "growth_stage": growth_stage,
        "margin_opportunity": "Present" if margin_ok else "Limited",
        "downgrade_flags": downgrade_flags,
        "apac_first_note": apac_note,
    }

    return {
        "category": category,
        "market_data": market_data,
        "price_segments": price_data,
        "supply_chain": supply_data,
        "gate_checks": gate_results,
        "summary": summary,
    }
