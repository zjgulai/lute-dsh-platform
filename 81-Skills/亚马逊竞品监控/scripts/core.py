"""Core data processing functions for Amazon Competitor Monitor.

Provides price comparison, listing change detection, buy box analysis,
and report generation for Amazon ASIN monitoring workflows.
"""

import datetime
from statistics import median
from typing import Any


def detect_price_changes(current: dict, previous: dict) -> list[dict]:
    """Compare current vs previous ASIN prices and flag significant changes.

    Performs per-ASIN price comparison between two snapshots. Flags
    any price movement exceeding 5% as a notable change. Also detects
    new and removed ASINs between snapshots.

    Args:
        current: Dict mapping ASIN strings to their current price data.
            Each value should have 'price' (float) and optional fields
            like 'seller', 'title'.
        previous: Dict mapping ASIN strings to their previous price data
            with the same schema.

    Returns:
        List of change dicts, each with: asin, old_price, new_price,
        change_pct, direction ('up'/'down'/'new'/'removed'), severity
        ('high'/'medium'/'low'), and optional seller fields.
    """
    changes: list[dict] = []
    all_asins = set(current.keys()) | set(previous.keys())

    for asin in all_asins:
        curr_data = current.get(asin)
        prev_data = previous.get(asin)

        if curr_data and not prev_data:
            # New ASIN appeared
            changes.append({
                "asin": asin,
                "old_price": None,
                "new_price": curr_data.get("price"),
                "change_pct": None,
                "direction": "new",
                "severity": "medium",
                "title": curr_data.get("title", ""),
                "current_seller": curr_data.get("seller", ""),
            })
        elif prev_data and not curr_data:
            # ASIN removed from tracking
            changes.append({
                "asin": asin,
                "old_price": prev_data.get("price"),
                "new_price": None,
                "change_pct": None,
                "direction": "removed",
                "severity": "low",
                "title": prev_data.get("title", ""),
                "previous_seller": prev_data.get("seller", ""),
            })
        elif curr_data and prev_data:
            old_price = prev_data.get("price")
            new_price = curr_data.get("price")

            if old_price is not None and new_price is not None and old_price > 0:
                change_pct = ((new_price - old_price) / old_price) * 100

                if abs(change_pct) >= 5:
                    direction = "up" if change_pct > 0 else "down"
                    if abs(change_pct) >= 20:
                        severity = "high"
                    elif abs(change_pct) >= 10:
                        severity = "medium"
                    else:
                        severity = "low"

                    changes.append({
                        "asin": asin,
                        "old_price": round(old_price, 2),
                        "new_price": round(new_price, 2),
                        "change_pct": round(change_pct, 2),
                        "direction": direction,
                        "severity": severity,
                        "title": curr_data.get("title", prev_data.get("title", "")),
                        "current_seller": curr_data.get("seller", ""),
                        "previous_seller": prev_data.get("seller", ""),
                    })
            elif old_price != new_price:
                # Non-numeric or zero price comparison
                changes.append({
                    "asin": asin,
                    "old_price": old_price,
                    "new_price": new_price,
                    "change_pct": None,
                    "direction": "changed",
                    "severity": "low",
                    "title": curr_data.get("title", ""),
                })

    return changes


def detect_listing_changes(before: dict, after: dict) -> list[dict]:
    """Detect changes in Amazon listing content between two snapshots.

    Compares listing fields including title, bullet points, images,
    price, and description. Reports additions, removals, and
    modifications.

    Args:
        before: Previous listing snapshot dict. Expected keys include
            'title', 'bullet_points' (list), 'images' (list),
            'price' (float), 'description' (str).
        after: Current listing snapshot dict with the same schema.

    Returns:
        List of change dicts, each with: field, change_type
        ('modified'/'added'/'removed'), old_value, new_value.
    """
    changes: list[dict] = []

    # Scalar field comparisons
    scalar_fields = ["title", "price", "description", "brand", "manufacturer", "model"]

    for field in scalar_fields:
        old_val = before.get(field)
        new_val = after.get(field)

        if old_val is None and new_val is not None:
            changes.append({
                "field": field,
                "change_type": "added",
                "old_value": None,
                "new_value": new_val,
            })
        elif old_val is not None and new_val is None:
            changes.append({
                "field": field,
                "change_type": "removed",
                "old_value": old_val,
                "new_value": None,
            })
        elif old_val is not None and new_val is not None and old_val != new_val:
            changes.append({
                "field": field,
                "change_type": "modified",
                "old_value": old_val,
                "new_value": new_val,
            })

    # List field comparisons: bullet_points
    old_bullets = before.get("bullet_points") or []
    new_bullets = after.get("bullet_points") or []

    # Find added bullets
    for bullet in new_bullets:
        if bullet not in old_bullets:
            changes.append({
                "field": "bullet_points",
                "change_type": "added",
                "old_value": None,
                "new_value": bullet,
            })

    # Find removed bullets
    for bullet in old_bullets:
        if bullet not in new_bullets:
            changes.append({
                "field": "bullet_points",
                "change_type": "removed",
                "old_value": bullet,
                "new_value": None,
            })

    # Image comparison
    old_images = before.get("images") or []
    new_images = after.get("images") or []

    old_image_urls = {img.get("url") or img if isinstance(img, str) else str(img) for img in old_images}
    new_image_urls = {img.get("url") or img if isinstance(img, str) else str(img) for img in new_images}

    added_images = new_image_urls - old_image_urls
    removed_images = old_image_urls - new_image_urls

    for img in added_images:
        changes.append({
            "field": "images",
            "change_type": "added",
            "old_value": None,
            "new_value": img,
        })

    for img in removed_images:
        changes.append({
            "field": "images",
            "change_type": "removed",
            "old_value": img,
            "new_value": None,
        })

    return changes


def detect_buy_box_shifts(buy_box_history: list[dict]) -> list[dict]:
    """Analyze buy box ownership history and detect seller shifts.

    Processes a chronological list of buy box ownership snapshots and
    identifies each time ownership transfers from one seller to another.

    Args:
        buy_box_history: List of dicts sorted chronologically, each with
            'timestamp' (ISO string or datetime), 'seller' (str), and
            'asin' (str).

    Returns:
        List of shift dicts, each with: asin, previous_owner, new_owner,
        won_at (ISO timestamp), duration_hours (float, how long the
        previous owner held the buy box), and price (optional).
    """
    shifts: list[dict] = []

    if not buy_box_history:
        return shifts

    # Group by ASIN
    asin_groups: dict[str, list[dict]] = {}
    for entry in buy_box_history:
        asin = entry.get("asin", "_unknown_")
        asin_groups.setdefault(asin, []).append(entry)

    for asin, entries in asin_groups.items():
        current_owner: str | None = None
        current_start: Any = None

        for entry in entries:
            seller = entry.get("seller", "")
            ts = entry.get("timestamp", "")

            if not seller or not ts:
                continue

            if seller != current_owner:
                if current_owner is not None and current_start is not None:
                    # Calculate duration
                    try:
                        if isinstance(ts, str):
                            next_ts = _parse_timestamp(ts)
                        else:
                            next_ts = ts

                        if isinstance(current_start, str):
                            start_dt = _parse_timestamp(current_start)
                        else:
                            start_dt = current_start

                        duration = (next_ts - start_dt).total_seconds() / 3600
                    except (ValueError, TypeError, AttributeError):
                        duration = 0.0

                    shifts.append({
                        "asin": asin,
                        "previous_owner": current_owner,
                        "new_owner": seller,
                        "won_at": ts if isinstance(ts, str) else ts.isoformat(),
                        "duration_hours": round(duration, 2),
                        "price": entry.get("price"),
                    })

                current_owner = seller
                current_start = ts

    return shifts


def _parse_timestamp(ts: Any) -> datetime.datetime:
    """Parse various timestamp formats into a datetime object."""
    if isinstance(ts, datetime.datetime):
        return ts
    if isinstance(ts, str):
        for fmt in (
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ):
            try:
                return datetime.datetime.strptime(ts, fmt)
            except ValueError:
                continue
        raise ValueError(f"Unrecognized timestamp format: {ts}")
    raise TypeError(f"Expected str or datetime, got {type(ts).__name__}")


def generate_competitor_monitor_report(data: dict, config: dict) -> dict:
    """Aggregate all monitoring data into a comprehensive report.

    Runs all analysis functions (price changes, listing changes, buy box
    shifts) and consolidates results into a structured report with
    summary statistics, priority alerts, and recommendations.

    Args:
        data: Input dict with keys:
            - 'current_prices': dict of ASIN -> price data
            - 'previous_prices': dict of ASIN -> previous price data
            - 'current_listings': dict of ASIN -> listing content
            - 'previous_listings': dict of ASIN -> listing content (optional)
            - 'buy_box_history': list of buy box snapshots (optional)
        config: Configuration dict with optional keys:
            - 'price_change_threshold': float, default 5.0
            - 'alert_on_buy_box_loss': bool, default True
            - 'max_alerts': int, default 10

    Returns:
        Dict with keys: summary, price_changes, listing_changes,
        buy_box_analysis, priority_alerts, generated_at.
    """
    config = config or {}
    threshold = config.get("price_change_threshold", 5.0)

    current_prices = data.get("current_prices", {})
    previous_prices = data.get("previous_prices", {})

    # Price analysis
    price_changes = detect_price_changes(current_prices, previous_prices)
    price_changes_sorted = sorted(
        price_changes,
        key=lambda x: abs(x.get("change_pct") or 0),
        reverse=True,
    )

    # Listing change analysis
    listing_changes: list[dict] = []
    current_listings = data.get("current_listings", {})
    previous_listings = data.get("previous_listings", {})

    all_listing_asins = set(current_listings.keys()) | set(previous_listings.keys())
    for asin in all_listing_asins:
        before = previous_listings.get(asin, {})
        after = current_listings.get(asin, {})
        if before and after:
            asin_changes = detect_listing_changes(before, after)
            for change in asin_changes:
                change["asin"] = asin
                listing_changes.append(change)

    # Buy box analysis
    buy_box_history = data.get("buy_box_history", [])
    buy_box_shifts = detect_buy_box_shifts(buy_box_history)

    # Build priority alerts
    priority_alerts: list[dict] = []
    alert_count = 0
    max_alerts = config.get("max_alerts", 10)

    for change in price_changes_sorted:
        if alert_count >= max_alerts:
            break
        direction = change.get("direction", "")
        severity = change.get("severity", "low")
        change_pct = change.get("change_pct", 0)

        # Alert on significant price drops (competitors lowering prices)
        if direction == "down" and severity in ("high", "medium"):
            priority_alerts.append({
                "type": "price_drop",
                "severity": severity,
                "message": (
                    f"ASIN {change['asin']} dropped "
                    f"{abs(change_pct):.1f}% to ${change['new_price']:.2f}"
                ),
                "details": change,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
            alert_count += 1

        # Alert on large price increases
        elif direction == "up" and severity == "high":
            priority_alerts.append({
                "type": "price_spike",
                "severity": "high",
                "message": (
                    f"ASIN {change['asin']} increased "
                    f"{change_pct:.1f}% to ${change['new_price']:.2f}"
                ),
                "details": change,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
            alert_count += 1

    # Buy box alerts
    if config.get("alert_on_buy_box_loss", True):
        for shift in buy_box_shifts:
            if alert_count >= max_alerts:
                break
            priority_alerts.append({
                "type": "buy_box_shift",
                "severity": "medium",
                "message": (
                    f"Buy box for ASIN {shift['asin']} shifted from "
                    f"{shift.get('previous_owner', 'unknown')} to "
                    f"{shift.get('new_owner', 'unknown')}"
                ),
                "details": shift,
                "timestamp": shift.get("won_at", ""),
            })
            alert_count += 1

    # Summary
    total_asins = len(set(current_prices.keys()) | set(previous_prices.keys()))
    asins_changed = len({c["asin"] for c in price_changes})
    asins_with_listing_changes = len({c.get("asin", "") for c in listing_changes})

    summary = {
        "total_asins_tracked": total_asins,
        "asins_with_price_change": asins_changed,
        "asins_with_listing_change": asins_with_listing_changes,
        "total_buy_box_shifts": len(buy_box_shifts),
        "total_alerts": len(priority_alerts),
        "high_severity_alerts": sum(
            1 for a in priority_alerts if a.get("severity") == "high"
        ),
    }

    return {
        "summary": summary,
        "price_changes": price_changes_sorted,
        "listing_changes": listing_changes,
        "buy_box_analysis": {
            "total_shifts": len(buy_box_shifts),
            "shifts": buy_box_shifts,
        },
        "priority_alerts": priority_alerts,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def process(params: dict) -> dict:
    """Unified entry point for SkillRunner."""
    if "previous" in params and "current" in params:
        return {"price_changes": _simple_price_changes(params["current"], params["previous"])}
    return generate_competitor_monitor_report(params, {})

def _simple_price_changes(current: dict, previous: dict) -> list[dict]:
    """Simple price change detection for dicts of {sku: price}."""
    changes = []
    for sku, price in current.items():
        prev_price = previous.get(sku)
        if prev_price is None:
            changes.append({"sku": sku, "change": "new", "current": price, "severity": "info"})
        elif isinstance(price, (int, float)) and isinstance(prev_price, (int, float)):
            pct = (price - prev_price) / prev_price
            severity = "critical" if abs(pct) > 0.10 else "warning" if abs(pct) > 0.05 else "info"
            changes.append({"sku": sku, "from": prev_price, "to": price, "change_pct": round(pct*100, 1), "severity": severity})
    for sku in previous:
        if sku not in current:
            changes.append({"sku": sku, "change": "removed", "previous": previous[sku], "severity": "warning"})
    return changes
