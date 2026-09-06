#!/usr/bin/env python3
"""Core data processing functions for SCM Logistics Tracker.

Provides parsing, estimation, exception detection, and reporting
functionality for multi-carrier parcel tracking data.
"""

import datetime
from statistics import median
from typing import Any


def parse_tracking_event(raw: dict) -> dict:
    """Normalize carrier-specific tracking data into a unified event format.

    Accepts raw tracking data from carriers including fedex, ups, usps,
    dhl, and others. Maps carrier-specific field names to a canonical
    output schema.

    Args:
        raw: Raw tracking data containing at minimum a carrier identifier
            and tracking number. Expected fields vary by carrier:
            - fedex: keyed_event_status_descr, event_timestamp, event_location
            - ups:  current_status, status_datetime, scan_location
            - usps: event_type, event_date, event_city_state_zip
            - dhl:  check_point_status, checkpoint_date, checkpoint_location

    Returns:
        Normalized dict with keys: carrier, tracking_number, status,
        location, timestamp, event_type, description.
    """
    carrier = (raw.get("carrier") or raw.get("carrier_name") or "").strip().lower()
    tracking = raw.get("tracking_number") or raw.get("tracking_no") or ""

    field_map = {
        "fedex": {
            "status": "keyed_event_status_descr",
            "location": "event_location",
            "timestamp": "event_timestamp",
            "description": "keyed_event_status_descr",
        },
        "ups": {
            "status": "current_status",
            "location": "scan_location",
            "timestamp": "status_datetime",
            "description": "current_status",
        },
        "usps": {
            "status": "event_type",
            "location": "event_city_state_zip",
            "timestamp": "event_date",
            "description": "event_type",
        },
        "dhl": {
            "status": "check_point_status",
            "location": "checkpoint_location",
            "timestamp": "checkpoint_date",
            "description": "check_point_status",
        },
    }

    mapping = field_map.get(carrier, {})
    status = raw.get(mapping.get("status", "")) or raw.get("status", "")
    location = raw.get(mapping.get("location", "")) or raw.get("location", "")
    timestamp = raw.get(mapping.get("timestamp", "")) or raw.get("timestamp", "")
    description = raw.get(mapping.get("description", "")) or raw.get("description", "")

    # Determine event type from status text
    event_type = _classify_event_type(status)

    return {
        "carrier": carrier,
        "tracking_number": tracking,
        "status": status,
        "location": location,
        "timestamp": timestamp,
        "event_type": event_type,
        "description": description,
    }


def _classify_event_type(status: str) -> str:
    """Classify a tracking status string into a canonical event type."""
    if not status:
        return "unknown"
    s = status.lower()
    if any(kw in s for kw in ("delivered", "signed for", "left at")):
        return "delivered"
    if any(kw in s for kw in ("out for delivery", "on vehicle", "on fedex vehicle")):
        return "out_for_delivery"
    if any(kw in s for kw in ("in transit", "departed", "arrived", "processed")):
        return "in_transit"
    if any(kw in s for kw in ("picked up", "accepted", "origin")):
        return "picked_up"
    if any(kw in s for kw in ("label created", "shipping label", "pre-shipment")):
        return "label_created"
    if any(kw in s for kw in ("exception", "delay", "hold", "customs hold")):
        return "exception"
    if any(kw in s for kw in ("return", "undeliverable")):
        return "return"
    return "unknown"


def estimate_delivery_date(tracking_history: list[dict]) -> str:
    """Estimate delivery date from tracking scan history.

    Uses average transit time based on carrier norms, current status,
    and carrier SLA patterns to produce a predicted delivery date.

    Args:
        tracking_history: List of normalized tracking event dicts,
            expected to be sorted chronologically.

    Returns:
        ISO 8601 date string (YYYY-MM-DD) or "Unknown" when insufficient
        data is available to make a prediction.
    """
    if not tracking_history:
        return "Unknown"

    # Carrier average transit days (business days for standard service)
    carrier_sla = {
        "fedex": 3,
        "ups": 3,
        "usps": 5,
        "dhl": 4,
        "default": 5,
    }

    first_event = tracking_history[0]
    last_event = tracking_history[-1]

    carrier = (last_event.get("carrier") or "").strip().lower()
    base_days = carrier_sla.get(carrier, carrier_sla["default"])

    # If already delivered, return the delivery date
    if last_event.get("event_type") == "delivered":
        ts = last_event.get("timestamp")
        if ts:
            try:
                dt = _parse_timestamp(ts)
                return dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                pass
        return "Unknown"

    # If out for delivery, estimate today
    if last_event.get("event_type") == "out_for_delivery":
        ts = last_event.get("timestamp")
        if ts:
            try:
                dt = _parse_timestamp(ts)
                return dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                pass
        return (datetime.date.today()).isoformat()

    # Calculate elapsed days since first event
    try:
        first_ts = _parse_timestamp(first_event["timestamp"])
        last_ts = _parse_timestamp(last_event["timestamp"])
        elapsed_days = (last_ts - first_ts).days
    except (KeyError, ValueError, TypeError):
        elapsed_days = 0
        last_ts = datetime.datetime.now()

    # Adjust prediction based on carrier SLA and progress
    remaining = max(1, base_days - elapsed_days)

    # Adjust confidence: if elapsed days exceed SLA, add delay days
    if elapsed_days > base_days:
        remaining = remaining + (elapsed_days - base_days)

    # State-based adjustments
    event_type = last_event.get("event_type", "")
    location = last_event.get("location", "")

    if event_type == "picked_up" and location:
        # Just picked up, close to full SLA
        remaining = max(remaining, base_days - 1)
    elif event_type == "exception":
        # Exceptions add 2-3 days
        remaining += 2

    estimated_date = last_ts.date() + datetime.timedelta(days=remaining)
    return estimated_date.isoformat()


def _parse_timestamp(ts: Any) -> datetime.datetime:
    """Parse a timestamp string or datetime object into a datetime."""
    if isinstance(ts, datetime.datetime):
        return ts
    if isinstance(ts, datetime.date):
        return datetime.datetime.combine(ts, datetime.time.min)
    if isinstance(ts, str):
        # Try common formats
        for fmt in (
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%m/%d/%Y %H:%M:%S",
            "%m/%d/%Y",
        ):
            try:
                return datetime.datetime.strptime(ts, fmt)
            except ValueError:
                continue
        raise ValueError(f"Unrecognized timestamp format: {ts}")
    raise TypeError(f"Expected str, datetime, or date; got {type(ts).__name__}")


def detect_delivery_exceptions(tracking_history: list[dict]) -> list[dict]:
    """Detect and classify delivery exceptions from tracking history.

    Scans the tracking event sequence for patterns indicating delivery
    problems: service delays, customs holds, address issues, lost or
    damaged parcels.

    Args:
        tracking_history: List of normalized tracking event dicts sorted
            chronologically.

    Returns:
        List of exception dicts, each with keys: type, severity
        (high/medium/low), description, and timestamp.
    """
    exceptions: list[dict] = []

    if not tracking_history:
        return exceptions

    last_event = tracking_history[-1]
    carrier = (last_event.get("carrier") or "").strip().lower()

    # 1. Check the latest status for explicit exception keywords
    status_text = (last_event.get("status") or "").lower()
    event_type = (last_event.get("event_type") or "").lower()

    explicit_exceptions = {
        "delayed": ["delay", "delayed", "late", "behind schedule", "past due"],
        "customs_hold": ["customs hold", "clearance", "customs delay", "import"],
        "delivery_hold": ["on hold", "hold", "held", "awaiting"],
        "address_issue": [
            "address", "incorrect address", "invalid",
            "return to sender", "undeliverable as addressed",
        ],
        "lost": ["lost", "missing", "cannot locate", "whereabouts"],
        "damaged": ["damaged", "broken", "crushed", "destroyed"],
    }

    for exc_type, keywords in explicit_exceptions.items():
        if any(kw in status_text for kw in keywords):
            severity = "high" if exc_type in ("lost", "damaged") else "medium"
            exceptions.append({
                "type": exc_type,
                "severity": severity,
                "description": f"Explicit {exc_type} status detected: {last_event.get('status', '')}",
                "timestamp": last_event.get("timestamp", ""),
            })

    # 2. Detect stale tracking (no update for >72 hours and not delivered)
    if event_type != "delivered":
        try:
            latest_ts = _parse_timestamp(last_event["timestamp"])
            if latest_ts.tzinfo is not None:
                now = datetime.datetime.now(datetime.timezone.utc)
            else:
                now = datetime.datetime.now()
            hours_since_update = (now - latest_ts).total_seconds() / 3600

            if hours_since_update > 72:
                exceptions.append({
                    "type": "stale_tracking",
                    "severity": "medium",
                    "description": (
                        f"No tracking update for {int(hours_since_update)} hours. "
                        f"Latest: {last_event.get('status', '')} at {last_event.get('location', '')}."
                    ),
                    "timestamp": last_event.get("timestamp", ""),
                })
        except (KeyError, ValueError, TypeError):
            pass

    # 3. Routing anomaly: carrier mismatch with origin/destination hints
    origin = (last_event.get("origin_country") or "").lower()
    if origin and carrier == "usps":
        # Domestic USPS should not trigger customs
        pass

    # 4. Identify repeated same-location scans (possible delay)
    location_counts: dict[str, int] = {}
    for event in tracking_history:
        loc = event.get("location", "")
        if loc:
            location_counts[loc] = location_counts.get(loc, 0) + 1

    for loc, count in location_counts.items():
        if count >= 3:
            exceptions.append({
                "type": "repeated_location_scan",
                "severity": "low",
                "description": (
                    f"Package scanned {count} times at same location: {loc}. "
                    "Possible processing delay."
                ),
                "timestamp": last_event.get("timestamp", ""),
            })

    return exceptions


def generate_tracking_report(shipments: list[dict], config: dict) -> dict:
    """Generate a comprehensive multi-shipment tracking report.

    Aggregates individual shipment tracking data, runs all analyses,
    and produces a structured report with summary statistics,
    per-shipment status breakdowns, exception summaries, and
    estimated delivery dates.

    Args:
        shipments: List of shipment dicts, each containing at minimum
            a tracking_number and optionally a tracking_history list.
        config: Configuration dict with optional keys:
            - carrier_sla_overrides: dict of carrier -> business days
            - alert_on_exceptions: bool (default True)
            - include_delivery_estimates: bool (default True)

    Returns:
        Dict with keys: summary (total/in_transit/delivered/exceptions),
        shipments (per-shipment detail), exception_summary,
        estimated_delivery_dates, generated_at.
    """
    total = len(shipments)
    in_transit = 0
    delivered = 0
    all_exceptions: list[dict] = []
    shipment_details: list[dict] = []
    delivery_estimates: dict[str, str] = {}

    # Apply carrier SLA overrides if provided
    config = config or {}
    sla_overrides = config.get("carrier_sla_overrides", {})

    for shipment in shipments:
        tracking = (
            shipment.get("tracking_number")
            or shipment.get("tracking_no")
            or "unknown"
        )
        history = shipment.get("tracking_history") or []

        # Parse events if raw
        parsed_history = [parse_tracking_event(e) for e in history]

        # Determine current status
        if parsed_history:
            last = parsed_history[-1]
            event_type = last.get("event_type", "unknown")
            if event_type == "delivered":
                delivered += 1
            else:
                in_transit += 1

            # Detect exceptions
            exc_list = detect_delivery_exceptions(parsed_history)
            all_exceptions.extend(exc_list)

            # Estimate delivery
            if config.get("include_delivery_estimates", True):
                delivery_estimates[tracking] = estimate_delivery_date(parsed_history)
            else:
                delivery_estimates[tracking] = "N/A"
        else:
            in_transit += 1
            delivery_estimates[tracking] = "Unknown"

        shipment_entry: dict[str, Any] = {
            "tracking_number": tracking,
            "carrier": shipment.get("carrier", ""),
            "status": parsed_history[-1].get("event_type", "unknown") if parsed_history else "no_data",
            "event_count": len(parsed_history),
            "latest_event": parsed_history[-1] if parsed_history else None,
        }

        if parsed_history and config.get("include_delivery_estimates", True):
            shipment_entry["estimated_delivery"] = delivery_estimates[tracking]

        shipment_details.append(shipment_entry)

    # Build exception summary
    exception_summary: dict[str, Any] = {
        "total_exceptions": len(all_exceptions),
        "by_severity": {"high": 0, "medium": 0, "low": 0},
        "by_type": {},
    }
    for exc in all_exceptions:
        sev = exc.get("severity", "low")
        exception_summary["by_severity"][sev] = (
            exception_summary["by_severity"].get(sev, 0) + 1
        )
        etype = exc.get("type", "unknown")
        exception_summary["by_type"][etype] = (
            exception_summary["by_type"].get(etype, 0) + 1
        )

    return {
        "summary": {
            "total_shipments": total,
            "in_transit": in_transit,
            "delivered": delivered,
            "exceptions": len(all_exceptions),
        },
        "shipments": shipment_details,
        "exception_summary": exception_summary,
        "estimated_delivery_dates": delivery_estimates,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
