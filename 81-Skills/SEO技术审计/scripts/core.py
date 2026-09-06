"""
seo-technical-audit - Technical SEO audit core logic.

Analyzes page speed, mobile friendliness, robots.txt, sitemap index issues,
and generates comprehensive technical audit reports.
"""

from __future__ import annotations

import math
import re
from typing import Any


# ──────────────────────────────────────────────
# Page Speed Audit
# ──────────────────────────────────────────────


def _classify_metric(value: float, thresholds: dict) -> dict:
    """
    Classify a metric value against good/needs_work/poor thresholds.

    thresholds = {'good': <max_for_good>, 'needs_work': <max_for_needs_work>}
    """
    if value <= thresholds.get("good", 0):
        rating = "good"
        score = 100
    elif value <= thresholds.get("needs_work", thresholds["good"] * 2):
        rating = "needs_work"
        score = 50
    else:
        rating = "poor"
        score = 0

    return {
        "value": value,
        "rating": rating,
        "score": score,
    }


def audit_page_speed(metrics: dict) -> dict:
    """
    Analyze page speed metrics against recommended thresholds.

    Args:
        metrics: dict with keys:
            - 'lcp': float (Largest Contentful Paint, seconds)
            - 'fid': float (First Input Delay, milliseconds)
            - 'cls': float (Cumulative Layout Shift)
            - 'ttfb': float (Time to First Byte, seconds) — optional
            - 'total_blocking_time': float (seconds) — optional
            - 'fcp': float (First Contentful Paint, seconds) — optional

    Returns:
        dict with:
            - 'metrics': per-metric classification
            - 'overall_score': int (0-100)
            - 'overall_rating': str
            - 'recommendations': list[str]
    """
    lcp = metrics.get("lcp", 0)
    fid = metrics.get("fid", 0)
    cls = metrics.get("cls", 0)
    ttfb = metrics.get("ttfb", None)
    tbt = metrics.get("total_blocking_time", None)
    fcp = metrics.get("fcp", None)

    results: dict[str, dict] = {
        "lcp": _classify_metric(lcp, {"good": 2.5, "needs_work": 4.0}),
        "fid": _classify_metric(fid, {"good": 100, "needs_work": 300}),
        "cls": _classify_metric(cls, {"good": 0.1, "needs_work": 0.25}),
    }

    if ttfb is not None:
        results["ttfb"] = _classify_metric(ttfb, {"good": 0.8, "needs_work": 1.8})

    if tbt is not None:
        results["total_blocking_time"] = _classify_metric(tbt, {"good": 0.2, "needs_work": 0.6})

    if fcp is not None:
        results["fcp"] = _classify_metric(fcp, {"good": 1.8, "needs_work": 3.0})

    # Overall score: weighted average
    weights = {"lcp": 0.30, "fid": 0.25, "cls": 0.20, "ttfb": 0.15, "total_blocking_time": 0.10, "fcp": 0.10}
    total_weight = 0
    weighted_score = 0

    for key, result in results.items():
        w = weights.get(key, 0.1)
        weighted_score += result["score"] * w
        total_weight += w

    overall_score = round(weighted_score / max(total_weight, 0.01))

    if overall_score >= 80:
        overall_rating = "good"
    elif overall_score >= 50:
        overall_rating = "needs_work"
    else:
        overall_rating = "poor"

    # Recommendations
    recommendations: list[str] = []
    for key, result in results.items():
        if result["rating"] == "poor":
            label = key.upper().replace("_", " ")
            recommendations.append(
                f"Poor {label} ({result['value']}). Needs immediate optimization."
            )
        elif result["rating"] == "needs_work":
            label = key.upper().replace("_", " ")
            recommendations.append(
                f"Fair {label} ({result['value']}). Room for improvement."
            )

    return {
        "metrics": results,
        "overall_score": overall_score,
        "overall_rating": overall_rating,
        "recommendations": recommendations,
    }


# ──────────────────────────────────────────────
# Mobile Friendly Check
# ──────────────────────────────────────────────


def check_mobile_friendly(metrics: dict) -> dict:
    """
    Check mobile-friendliness from pre-collected metrics.

    Args:
        metrics: dict with keys:
            - 'viewport_meta': bool — whether viewport meta tag is present
            - 'touch_target_size': int (min touch target size in px)
            - 'font_size': int (minimum font size in px)
            - 'content_width': int (content width in px)
            - 'tap_spacing': int (minimum spacing between tap targets in px)
            - 'viewport_width': int (device viewport width in px) — optional

    Returns:
        dict with:
            - 'checks': per-check pass/fail/warning with details
            - 'overall_score': int (0-100)
            - 'pass_count': int
            - 'check_count': int
            - 'recommendations': list[str]
    """
    viewport = metrics.get("viewport_meta", False)
    touch_size = metrics.get("touch_target_size", 0)
    font_size = metrics.get("font_size", 0)
    content_width = metrics.get("content_width", 0)
    tap_spacing = metrics.get("tap_spacing", 0)

    checks: list[dict] = []

    # Viewport meta
    if viewport:
        checks.append({"check": "viewport_meta", "status": "pass", "details": "Viewport meta tag present."})
    else:
        checks.append({"check": "viewport_meta", "status": "fail", "details": "Viewport meta tag missing. Add <meta name='viewport' content='width=device-width, initial-scale=1'>."})

    # Touch target size (minimum 48px recommended)
    if touch_size >= 48:
        checks.append({"check": "touch_target_size", "status": "pass", "details": f"Touch target size ({touch_size}px) is adequate."})
    elif touch_size >= 32:
        checks.append({"check": "touch_target_size", "status": "warning", "details": f"Touch target size ({touch_size}px) is below recommended 48px."})
    else:
        checks.append({"check": "touch_target_size", "status": "fail", "details": f"Touch target size ({touch_size}px) is too small. Minimum 48px recommended."})

    # Font size (minimum 16px recommended)
    if font_size >= 16:
        checks.append({"check": "font_size", "status": "pass", "details": f"Font size ({font_size}px) is adequate for mobile."})
    elif font_size >= 12:
        checks.append({"check": "font_size", "status": "warning", "details": f"Font size ({font_size}px) may be hard to read on mobile."})
    else:
        checks.append({"check": "font_size", "status": "fail", "details": f"Font size ({font_size}px) is too small for mobile readability."})

    # Content width vs viewport
    viewport_width = metrics.get("viewport_width", 375)
    if content_width <= viewport_width:
        checks.append({"check": "content_width", "status": "pass", "details": f"Content width ({content_width}px) fits viewport ({viewport_width}px)."})
    elif content_width <= viewport_width * 1.2:
        checks.append({"check": "content_width", "status": "warning", "details": f"Content width ({content_width}px) slightly exceeds viewport ({viewport_width}px). Horizontal scrolling may occur."})
    else:
        checks.append({"check": "content_width", "status": "fail", "details": f"Content width ({content_width}px) exceeds viewport ({viewport_width}px). Needs responsive fix."})

    # Tap spacing (minimum 8px recommended)
    if tap_spacing >= 8:
        checks.append({"check": "tap_spacing", "status": "pass", "details": f"Tap spacing ({tap_spacing}px) is adequate."})
    elif tap_spacing >= 4:
        checks.append({"check": "tap_spacing", "status": "warning", "details": f"Tap spacing ({tap_spacing}px) is tight. Users may accidentally tap wrong targets."})
    else:
        checks.append({"check": "tap_spacing", "status": "fail", "details": f"Tap spacing ({tap_spacing}px) is insufficient. Minimum 8px recommended."})

    # Score
    pass_count = sum(1 for c in checks if c["status"] == "pass")
    fail_count = sum(1 for c in checks if c["status"] == "fail")
    total = len(checks)
    overall_score = round((pass_count / total) * 100)

    # Recommendations
    recommendations = [
        c["details"] for c in checks if c["status"] != "pass"
    ]

    return {
        "checks": checks,
        "overall_score": overall_score,
        "pass_count": pass_count,
        "warning_count": sum(1 for c in checks if c["status"] == "warning"),
        "fail_count": fail_count,
        "total_checks": total,
        "recommendations": recommendations,
    }


# ──────────────────────────────────────────────
# Robots.txt Analysis
# ──────────────────────────────────────────────


def analyze_robots_txt(rules: dict) -> dict:
    """
    Analyze robots.txt rules for SEO best practices.

    Args:
        rules: dict with:
            - 'content': str (raw robots.txt content)
            - 'user_agents': list of dicts, each with 'agent' and 'disallow'/'allow' lists
            - 'sitemaps': list[str] of sitemap URLs
            - 'crawl_delay': str or None

    Returns:
        dict with:
            - 'sitemap_referenced': bool
            - 'disallow_coverage': dict
            - 'crawl_delay': dict
            - 'user_agent_coverage': list
            - 'sensitive_paths_blocked': list
            - 'issues': list[str]
            - 'score': int (0-100)
    """
    content = rules.get("content", "")
    ua_list = rules.get("user_agents", [])
    sitemaps = rules.get("sitemaps", [])
    crawl_delay = rules.get("crawl_delay", None)

    issues: list[str] = []

    # Sitemap reference
    sitemap_referenced = len(sitemaps) > 0 or "Sitemap:" in content
    if not sitemap_referenced:
        issues.append("No sitemap referenced in robots.txt. Add Sitemap directive.")

    # Crawl-delay
    cd_info: dict = {"present": False, "value": crawl_delay, "recommendation": ""}
    if crawl_delay or re.search(r"Crawl-Delay:\s*\d+", content, re.IGNORECASE):
        cd_info["present"] = True
        if not crawl_delay:
            cd_match = re.search(r"Crawl-Delay:\s*(\d+)", content, re.IGNORECASE)
            cd_info["value"] = cd_match.group(1) if cd_match else None
        try:
            cd_val = float(cd_info["value"]) if cd_info["value"] else 0
            if cd_val > 10:
                cd_info["recommendation"] = f"Crawl-delay of {cd_val}s is high. May slow down indexing."
        except (ValueError, TypeError):
            pass

    # User-agent coverage
    ua_coverage: list[dict] = []
    if not ua_list:
        # Parse from content
        ua_matches = re.findall(r"^User-agent:\s*(\S+)", content, re.IGNORECASE | re.MULTILINE)
        for agent in ua_matches:
            disallows = re.findall(
                rf"(?:^|(?<=User-agent:\s*{re.escape(agent)}))[\s\S]*?(?=User-agent:|$)",
                content, re.IGNORECASE | re.MULTILINE,
            )
            rule_block = disallows[0] if disallows else ""
            disallow_list = re.findall(r"^Disallow:\s*(\S*)", rule_block, re.IGNORECASE | re.MULTILINE)
            ua_list.append({"agent": agent, "disallow": disallow_list})
    else:
        for entry in ua_list:
            disallows = entry.get("disallow", [])
            ua_coverage.append({
                "agent": entry.get("agent", "*"),
                "disallow_count": len(disallows),
                "disallow_rules": disallows,
            })

    # Parse from content if ua_list was empty after parsing attempt
    if not ua_list:
        ua_coverage.append({"agent": "*", "disallow_count": 0, "disallow_rules": [], "note": "No explicit rules found."})
        issues.append("No User-agent rules found. Recommend setting at least a '*' rule.")

    # Check for missing default '*' user-agent
    has_wildcard = any(u.get("agent", "") == "*" for u in ua_list)
    if not has_wildcard:
        issues.append("No '*' (catch-all) User-agent rule. Some crawlers may not be covered.")

    # Sensitive paths that should be blocked
    sensitive_paths = [
        "/admin", "/wp-admin", "/login", "/.env", "/config", "/backup",
        "/.git", "/private", "/internal",
    ]
    blocked_sensitive: list[str] = []
    all_disallows = set()
    for ue in ua_list:
        for d in ue.get("disallow", []):
            all_disallows.add(d)

    for path in sensitive_paths:
        blocked = any(path in d for d in all_disallows)
        if blocked:
            blocked_sensitive.append(path)

    # Score
    score = 100
    if not sitemap_referenced:
        score -= 20
    if not has_wildcard:
        score -= 15
    if len(issues) > 2:
        score -= 10 * (len(issues) - 2)
    score = max(0, score)

    return {
        "sitemap_referenced": sitemap_referenced,
        "sitemaps": sitemaps,
        "crawl_delay": cd_info,
        "user_agent_coverage": ua_coverage,
        "sensitive_paths_blocked": blocked_sensitive,
        "issues": issues,
        "score": score,
    }


# ──────────────────────────────────────────────
# Index Issues Detection
# ──────────────────────────────────────────────


def detect_index_issues(
    sitemap_entries: list[str] | list[dict],
    indexed_urls: list[str],
) -> list[dict]:
    """
    Detect indexation issues between sitemap entries and indexed URLs.

    Args:
        sitemap_entries: list of URL strings or dicts with 'url' key.
        indexed_urls: list of indexed URL strings.

    Returns:
        list of issue dicts, each with:
            - 'type': str (in_sitemap_not_indexed | indexed_not_in_sitemap | index_bloat)
            - 'url': str or summary
            - 'count': int
            - 'severity': str (high/medium/low)
    """
    sitemap_urls: set[str] = set()
    for entry in sitemap_entries:
        if isinstance(entry, str):
            sitemap_urls.add(entry)
        elif isinstance(entry, dict):
            url = entry.get("url", "")
            if url:
                sitemap_urls.add(url)

    indexed_set = set(indexed_urls)

    issues: list[dict] = []

    # In sitemap but not indexed
    not_indexed = sitemap_urls - indexed_set
    if not_indexed:
        severity = "high" if len(not_indexed) > len(sitemap_urls) * 0.3 else "medium"
        issues.append({
            "type": "in_sitemap_not_indexed",
            "url": list(not_indexed)[:10],
            "count": len(not_indexed),
            "severity": severity,
            "details": f"{len(not_indexed)} URLs in sitemap are not indexed by search engines.",
        })

    # Indexed but not in sitemap
    extra_indexed = indexed_set - sitemap_urls
    if extra_indexed:
        issues.append({
            "type": "indexed_not_in_sitemap",
            "url": list(extra_indexed)[:10],
            "count": len(extra_indexed),
            "severity": "medium",
            "details": f"{len(extra_indexed)} indexed URLs are not listed in the sitemap.",
        })

    # Index bloat (indexed >> sitemap)
    if len(indexed_set) > len(sitemap_urls) * 2 and len(sitemap_urls) > 0:
        bloat_ratio = round(len(indexed_set) / max(len(sitemap_urls), 1), 1)
        issues.append({
            "type": "index_bloat",
            "url": "N/A (summary)",
            "count": len(indexed_set) - len(sitemap_urls),
            "severity": "high" if bloat_ratio > 3 else "medium",
            "details": f"Index bloat detected: {len(indexed_set)} indexed URLs vs {len(sitemap_urls)} in sitemap (ratio: {bloat_ratio}).",
        })

    return issues


# ──────────────────────────────────────────────
# Full Report
# ──────────────────────────────────────────────


def generate_technical_audit_report(
    site_data: dict,
    config: dict | None = None,
) -> dict:
    """
    Generate a comprehensive technical SEO audit report.

    Pipeline:
        1. Page speed audit
        2. Mobile-friendly check
        3. Robots.txt analysis
        4. Index issues detection

    Args:
        site_data: dict with keys:
            - 'url': str
            - 'speed_metrics': dict
            - 'mobile_metrics': dict
            - 'robots_rules': dict
            - 'sitemap_entries': list
            - 'indexed_urls': list
        config: optional dict.

    Returns:
        dict with full technical audit report.
    """
    config = config or {}
    url = site_data.get("url", "unknown")

    # Step 1: Page speed
    speed = audit_page_speed(site_data.get("speed_metrics", {}))

    # Step 2: Mobile
    mobile = check_mobile_friendly(site_data.get("mobile_metrics", {}))

    # Step 3: Robots.txt
    robots = analyze_robots_txt(site_data.get("robots_rules", {}))

    # Step 4: Index issues
    index_issues = detect_index_issues(
        site_data.get("sitemap_entries", []),
        site_data.get("indexed_urls", []),
    )

    # Overall health
    speed_score = speed.get("overall_score", 0)
    mobile_score = mobile.get("overall_score", 0)
    robots_score = robots.get("score", 50)
    index_penalty = sum(
        15 if i["severity"] == "high" else 10 if i["severity"] == "medium" else 5
        for i in index_issues
    )
    base_index_score = max(0, 100 - index_penalty)

    overall_health = round(
        speed_score * 0.35 + mobile_score * 0.25 + robots_score * 0.20 + base_index_score * 0.20
    )

    if overall_health >= 80:
        health_label = "good"
    elif overall_health >= 50:
        health_label = "needs_work"
    else:
        health_label = "poor"

    # Priority fixes
    priority_fixes: list[dict] = []

    for rec in speed.get("recommendations", []):
        priority_fixes.append({
            "category": "page_speed",
            "priority": "high" if "Poor" in rec else "medium",
            "action": rec,
        })

    for rec in mobile.get("recommendations", []):
        priority_fixes.append({
            "category": "mobile",
            "priority": "high",
            "action": rec,
        })

    for issue in robots.get("issues", []):
        priority_fixes.append({
            "category": "crawl",
            "priority": "medium",
            "action": issue,
        })

    for idx_issue in index_issues:
        severity = idx_issue.get("severity", "medium")
        priority_fixes.append({
            "category": "indexation",
            "priority": "high" if severity == "high" else "medium",
            "action": idx_issue.get("details", ""),
        })

    summary = {
        "url": url,
        "speed_score": speed_score,
        "mobile_score": mobile_score,
        "crawl_score": robots_score,
        "index_score": base_index_score,
        "overall_health_pct": overall_health,
        "health_label": health_label,
        "priority_fixes_count": len(priority_fixes),
    }

    return {
        "url": url,
        "page_speed_audit": speed,
        "mobile_friendly_check": mobile,
        "robots_analysis": robots,
        "index_issues": index_issues,
        "overall_health": {
            "score": overall_health,
            "label": health_label,
            "speed_score": speed_score,
            "mobile_score": mobile_score,
            "crawl_score": robots_score,
            "index_score": base_index_score,
        },
        "priority_fixes": priority_fixes,
        "summary": summary,
    }
