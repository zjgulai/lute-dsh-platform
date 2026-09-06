"""Core data processing functions for E-Commerce Price Monitor.

Provides cross-platform price aggregation, trend detection, alert
generation, and reporting for multi-platform price monitoring.
"""

import datetime
import math
from statistics import median, stdev
from typing import Any


def aggregate_prices(product_id: str, platform_data: dict) -> dict:
    """Cross-platform price comparison for a single product.

    Accepts price data from multiple e-commerce platforms and computes
    aggregate statistics including min, max, average, median prices,
    and the overall price spread.

    Args:
        product_id: Unique product identifier (e.g., SKU or ASIN).
        platform_data: Dict mapping platform names (e.g., 'amazon',
            'walmart', 'ebay') to their price data dicts. Each price
            data dict should have 'price' (float) and may optionally
            include 'seller', 'title', 'url', 'in_stock'.

    Returns:
        Dict with keys: product_id, platform_count, min_price,
        max_price, avg_price, median_price, platform_prices,
        price_spread (difference between max and min, or None if < 2
        platforms have data).
    """
    valid_prices: list[float] = []
    platform_prices: dict[str, dict[str, Any]] = {}
    platform_count = 0

    for platform, data in platform_data.items():
        price = None
        if isinstance(data, dict):
            price = data.get("price")
        elif isinstance(data, (int, float)):
            price = float(data)

        if price is not None and isinstance(price, (int, float)) and price > 0:
            valid_prices.append(float(price))
            platform_prices[platform] = {
                "price": float(price),
                "seller": data.get("seller", "") if isinstance(data, dict) else "",
                "in_stock": data.get("in_stock", True) if isinstance(data, dict) else True,
                "url": data.get("url", "") if isinstance(data, dict) else "",
                "title": data.get("title", "") if isinstance(data, dict) else "",
            }
            platform_count += 1

    if not valid_prices:
        return {
            "product_id": product_id,
            "platform_count": 0,
            "min_price": None,
            "max_price": None,
            "avg_price": None,
            "median_price": None,
            "platform_prices": {},
            "price_spread": None,
        }

    min_p = min(valid_prices)
    max_p = max(valid_prices)
    avg_p = sum(valid_prices) / len(valid_prices)
    med_p = median(valid_prices)
    spread = max_p - min_p if len(valid_prices) >= 2 else None

    return {
        "product_id": product_id,
        "platform_count": platform_count,
        "min_price": round(min_p, 2),
        "max_price": round(max_p, 2),
        "avg_price": round(avg_p, 2),
        "median_price": round(med_p, 2),
        "platform_prices": platform_prices,
        "price_spread": round(spread, 2) if spread is not None else None,
    }


def detect_price_trends(price_history: list[dict]) -> dict:
    """Analyze price history data to detect trends and patterns.

    Processes chronological price data points and computes trend
    direction, volatility, seasonality patterns, and a short-term
    price prediction.

    Args:
        price_history: List of price data point dicts sorted
            chronologically. Each should have 'timestamp' (ISO string
            or datetime), 'price' (float), and 'platform' (str).

    Returns:
        Dict with keys: trend_direction ('up'/'down'/'stable'/'volatile'),
        volatility_score (float 0-1), price_changes (list of per-point
        changes), seasonality_pattern (str or null), prediction (dict
        with predicted_price and confidence), data_points (int).
    """
    if not price_history or len(price_history) < 2:
        return {
            "trend_direction": "stable",
            "volatility_score": 0.0,
            "price_changes": [],
            "seasonality_pattern": None,
            "prediction": {
                "predicted_price": None,
                "confidence": "low",
            },
            "data_points": len(price_history),
        }

    prices = []
    timestamps = []

    for entry in price_history:
        p = entry.get("price")
        ts = entry.get("timestamp")
        if p is not None and isinstance(p, (int, float)) and ts:
            prices.append(float(p))
            try:
                if isinstance(ts, datetime.datetime):
                    timestamps.append(ts)
                else:
                    timestamps.append(_parse_timestamp(ts))
            except (ValueError, TypeError):
                timestamps.append(datetime.datetime.now())

    if len(prices) < 2:
        return {
            "trend_direction": "stable",
            "volatility_score": 0.0,
            "price_changes": [],
            "seasonality_pattern": None,
            "prediction": {"predicted_price": None, "confidence": "low"},
            "data_points": len(prices),
        }

    # Calculate per-point percentage changes
    price_changes = []
    for i in range(1, len(prices)):
        if prices[i - 1] > 0:
            pct_change = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100
        else:
            pct_change = 0.0
        price_changes.append({
            "from_price": round(prices[i - 1], 2),
            "to_price": round(prices[i], 2),
            "change_pct": round(pct_change, 2),
            "timestamp": timestamps[i].isoformat() if i < len(timestamps) else "",
        })

    # Volatility: coefficient of variation
    avg_price = sum(prices) / len(prices)
    if avg_price > 0 and len(prices) >= 2:
        try:
            std_dev = stdev(prices)
            volatility_score = min(std_dev / avg_price, 1.0)
        except (ZeroDivisionError, ValueError):
            volatility_score = 0.0
    else:
        volatility_score = 0.0

    # Trend direction: linear regression slope
    n = len(prices)
    x_mean = (n - 1) / 2
    y_mean = avg_price
    numerator = sum(i * prices[i] for i in range(n)) - n * x_mean * y_mean
    denominator = sum(i * i for i in range(n)) - n * x_mean * x_mean

    if denominator != 0:
        slope = numerator / denominator
    else:
        slope = 0.0

    # Normalize slope as percentage of average price
    slope_pct = (slope / avg_price) * 100 if avg_price > 0 else 0

    if volatility_score > 0.15:
        trend_direction = "volatile"
    elif slope_pct > 2:
        trend_direction = "up"
    elif slope_pct < -2:
        trend_direction = "down"
    else:
        trend_direction = "stable"

    # Seasonality: check if prices follow a weekly pattern
    seasonality_pattern = _detect_seasonality(prices, timestamps)

    # Simple prediction: extend slope
    predicted_price = prices[-1] + slope * 3  # 3 periods forward
    if predicted_price < 0:
        predicted_price = prices[-1] * 0.9

    if volatility_score > 0.2 or len(prices) < 5:
        confidence = "low"
    elif volatility_score > 0.1:
        confidence = "medium"
    else:
        confidence = "high"

    return {
        "trend_direction": trend_direction,
        "volatility_score": round(volatility_score, 4),
        "price_changes": price_changes,
        "seasonality_pattern": seasonality_pattern,
        "prediction": {
            "predicted_price": round(predicted_price, 2),
            "confidence": confidence,
        },
        "data_points": len(prices),
    }


def _detect_seasonality(
    prices: list[float], timestamps: list[datetime.datetime]
) -> str | None:
    """Detect weekly seasonality patterns in price data.

    Analyzes average prices by day of week to identify recurring
    patterns (e.g., weekend discounts, Monday spikes).

    Args:
        prices: List of price values.
        timestamps: Corresponding datetime objects.

    Returns:
        Description of seasonality pattern, or None if no clear
        pattern detected (fewer than 7 data points or all same day).
    """
    if len(prices) < 7:
        return None

    day_prices: dict[int, list[float]] = {}
    for i, ts in enumerate(timestamps):
        dow = ts.weekday()
        day_prices.setdefault(dow, []).append(prices[i])

    if len(day_prices) < 2:
        return None

    day_avgs = {d: sum(vs) / len(vs) for d, vs in day_prices.items()}
    overall_avg = sum(prices) / len(prices)
    deviations = {d: (avg - overall_avg) / overall_avg * 100 for d, avg in day_avgs.items()}

    # Check for significant deviation on any day
    significant_days = {d: dev for d, dev in deviations.items() if abs(dev) > 3}
    if significant_days:
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        parts = []
        for d in sorted(significant_days.keys()):
            direction = "higher" if significant_days[d] > 0 else "lower"
            parts.append(f"prices {direction} on {day_names[d]} ({significant_days[d]:+.1f}%)")
        if parts:
            return "; ".join(parts)

    return None


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


def generate_price_alert(price_data: dict, thresholds: dict) -> list[dict]:
    """Generate price monitoring alerts based on configured thresholds.

    Evaluates cross-platform price data against three alert conditions:
    competitor prices dropping below a threshold, MAP (Minimum Advertised
    Price) violations, and promotion detection.

    Args:
        price_data: Dict mapping product_id to aggregated price data
            (from aggregate_prices) or raw platform_data.
        thresholds: Dict with optional keys:
            - 'price_drop_pct': float, threshold for competitor drop alert
              (default 10.0)
            - 'map_prices': dict of product_id -> MAP (minimum allowed price)
            - 'promotion_discount_pct': float, minimum discount to flag
              as a promotion (default 15.0)

    Returns:
        List of alert dicts, each with: type ('price_drop'/'map_violation'/
        'promotion_detected'), severity ('high'/'medium'/'low'), message,
        details, and timestamp.
    """
    thresholds = thresholds or {}
    price_drop_threshold = thresholds.get("price_drop_pct", 10.0)
    map_prices = thresholds.get("map_prices", {})
    promo_threshold = thresholds.get("promotion_discount_pct", 15.0)

    alerts: list[dict] = []

    for product_id, data in price_data.items():
        # Ensure data is aggregated
        if "platform_prices" not in data:
            # Assume it's raw platform_data
            aggregated = aggregate_prices(product_id, data)
        else:
            aggregated = data

        platform_prices = aggregated.get("platform_prices", {})

        # 1. MAP violation detection
        map_price = map_prices.get(product_id)
        if map_price is not None:
            for platform, pp in platform_prices.items():
                pp_price = pp.get("price")
                if pp_price is not None and pp_price < map_price:
                    discount_pct = ((map_price - pp_price) / map_price) * 100
                    severity = "high" if discount_pct > 10 else "medium"
                    alerts.append({
                        "type": "map_violation",
                        "severity": severity,
                        "message": (
                            f"MAP violation on {platform} for {product_id}: "
                            f"${pp_price:.2f} (MAP: ${map_price:.2f}, "
                            f"{discount_pct:.1f}% below MAP)"
                        ),
                        "details": {
                            "product_id": product_id,
                            "platform": platform,
                            "current_price": pp_price,
                            "map_price": map_price,
                            "discount_pct": round(discount_pct, 2),
                        },
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    })

        # 2. Competitor price drop detection
        for platform, pp in platform_prices.items():
            pp_price = pp.get("price")
            reference_price = pp.get("reference_price") or pp.get("list_price") or aggregated.get("avg_price")

            if reference_price and pp_price and reference_price > 0:
                drop_pct = ((reference_price - pp_price) / reference_price) * 100
                if drop_pct >= price_drop_threshold:
                    severity = "high" if drop_pct >= 20 else "medium"
                    alerts.append({
                        "type": "price_drop",
                        "severity": severity,
                        "message": (
                            f"Competitor dropped price on {product_id} at {platform}: "
                            f"${pp_price:.2f} ({drop_pct:.1f}% below reference ${reference_price:.2f})"
                        ),
                        "details": {
                            "product_id": product_id,
                            "platform": platform,
                            "current_price": pp_price,
                            "reference_price": reference_price,
                            "drop_pct": round(drop_pct, 2),
                        },
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    })

        # 3. Promotion detection
        for platform, pp in platform_prices.items():
            pp_price = pp.get("price")
            list_price = pp.get("list_price") or aggregated.get("max_price")

            if list_price and pp_price and list_price > 0 and list_price > pp_price:
                discount_pct = ((list_price - pp_price) / list_price) * 100
                if discount_pct >= promo_threshold:
                    alerts.append({
                        "type": "promotion_detected",
                        "severity": "low",
                        "message": (
                            f"Promotion detected on {product_id} at {platform}: "
                            f"${pp_price:.2f} ({discount_pct:.1f}% off list ${list_price:.2f})"
                        ),
                        "details": {
                            "product_id": product_id,
                            "platform": platform,
                            "current_price": pp_price,
                            "list_price": list_price,
                            "discount_pct": round(discount_pct, 2),
                        },
                        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    })

    # Sort by severity (high first), then by timestamp
    severity_order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: (severity_order.get(a.get("severity", "low"), 99), a.get("timestamp", "")))

    return alerts


def generate_price_report(price_data: dict, config: dict) -> dict:
    """Generate a comprehensive multi-platform price monitoring report.

    Aggregates all price data across products, runs trend analysis,
    alert generation, and compiles the results into a structured report.

    Args:
        price_data: Dict mapping product_id -> platform_data (dict of
            platform -> price info) OR aggregated data. May also include
            a 'price_history' key mapping product_id -> list of history
            dicts for trend analysis.
        config: Configuration dict with optional keys:
            - 'thresholds': dict passed to generate_price_alert
            - 'include_trends': bool (default True)
            - 'include_alerts': bool (default True)

    Returns:
        Dict with keys: summary, competitor_price_analysis (per-product
        aggregation), trend_analysis (per-product trends), alerts_summary,
        recommendations, generated_at.
    """
    config = config or {}
    thresholds = config.get("thresholds", {})
    include_trends = config.get("include_trends", True)
    include_alerts = config.get("include_alerts", True)

    # Separate price_data and price_history
    product_prices: dict[str, Any] = {}
    product_histories: dict[str, list[dict]] = {}

    for key, value in price_data.items():
        if key == "price_history":
            # Nested: price_history -> product_id -> list
            if isinstance(value, dict):
                product_histories.update(value)
        elif isinstance(value, dict):
            product_prices[key] = value

    # Aggregate prices per product
    aggregated_products: dict[str, dict] = {}
    aggregated_prices_for_alert: dict[str, dict] = {}

    for pid, pdata in product_prices.items():
        aggregated = aggregate_prices(pid, pdata)
        aggregated_products[pid] = aggregated
        aggregated_prices_for_alert[pid] = aggregated

    # Trend analysis
    trend_analysis: dict[str, dict] = {}
    if include_trends:
        for pid, history in product_histories.items():
            trend_analysis[pid] = detect_price_trends(history)

        # Also run trends from compiled price data if enough snapshots exist
        # (normally requires explicit price_history input)

    # Alert generation
    alerts: list[dict] = []
    if include_alerts and aggregated_prices_for_alert:
        alerts = generate_price_alert(aggregated_prices_for_alert, thresholds)

    # Build summary
    total_products = len(aggregated_products)
    total_platforms = sum(
        ap.get("platform_count", 0) for ap in aggregated_products.values()
    )
    products_with_trends = len(trend_analysis)

    low_price_count = 0
    for ap in aggregated_products.values():
        if ap.get("price_spread") is not None and ap["price_spread"] > ap.get("avg_price", 0) * 0.2:
            low_price_count += 1

    alert_counts = {"price_drop": 0, "map_violation": 0, "promotion_detected": 0}
    for alert in alerts:
        atype = alert.get("type", "other")
        alert_counts[atype] = alert_counts.get(atype, 0) + 1

    summary = {
        "total_products": total_products,
        "total_platform_instances": total_platforms,
        "products_with_trend_analysis": products_with_trends,
        "alerts_generated": len(alerts),
        "alert_breakdown": alert_counts,
    }

    # Recommendations
    recommendations: list[str] = []
    if alert_counts.get("map_violation", 0) > 0:
        recommendations.append(
            f"Address {alert_counts['map_violation']} MAP violation(s) "
            "with enforcement actions or supplier communication."
        )
    if alert_counts.get("price_drop", 0) > 0:
        recommendations.append(
            f"Review {alert_counts['price_drop']} competitor price drop(s) "
            "and consider matching or value-differentiation strategies."
        )
    if low_price_count > 0:
        recommendations.append(
            f"{low_price_count} product(s) have price spreads exceeding 20% "
            "of average price; standardize pricing across platforms."
        )

    return {
        "summary": summary,
        "competitor_price_analysis": aggregated_products,
        "trend_analysis": trend_analysis,
        "alerts": alerts,
        "alerts_summary": alert_counts,
        "recommendations": recommendations,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def process(params: dict) -> dict:
    """Unified entry point for SkillRunner."""
    if "platform_data" in params:
        return aggregate_prices(params.get("product_id", "unknown"), params["platform_data"])
    if "price_data" in params:
        return generate_price_report(params["price_data"], {})
    return {"error": "Missing required params"}
