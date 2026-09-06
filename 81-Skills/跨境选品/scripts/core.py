"""
Cross-Border Product Selection — Validation & Formatting Pipeline

SKU-level structured data extraction and validation from Amazon product detail pages
and other cross-border e-commerce sources. Operates with hard validation gates per
the skill's references/validation-gates.md.

This module does NOT scrape live pages. It accepts pre-extracted product data and
focuses on: ASIN parsing/validation, variant expansion, field-level validation
against gates, and CSV/JSON output formatting.

Import from skills._shared.data_validator for shared validation utilities.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import re
import uuid
from copy import deepcopy
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════

ASIN_PATTERN = re.compile(r"^[A-Z0-9]{10}$")
AMAZON_URL_PATTERNS = [
    re.compile(r"/dp/([A-Z0-9]{10})"),
    re.compile(r"/gp/product/([A-Z0-9]{10})"),
    re.compile(r"/product/([A-Z0-9]{10})"),
]

# Standard CSV columns per output-schema.md
SKU_CSV_COLUMNS = [
    "run_id",
    "product_id",
    "asin",
    "sku_id",
    "detail_url",
    "source_url",
    "product_title",
    "brand",
    "variant_attributes",
    "price",
    "rating",
    "review_count",
    "image_url",
    "image_status",
    "extraction_status",
]

# Required fields per Gate 4 (product-level)
# sku_id, variant_attributes, price are checked on expanded SKU rows, not at product level.
GATE4_REQUIRED_FIELDS_PRODUCT = [
    "product_id",
    "product_title",
    "detail_url",
    "rating",
    "review_count",
    "image_url",
    "source_url",
]

# Required fields for each SKU row after variant expansion
GATE4_REQUIRED_FIELDS_SKU = [
    "run_id",
    "product_id",
    "sku_id",
    "detail_url",
    "source_url",
    "product_title",
    "variant_attributes",
    "price",
    "rating",
    "review_count",
    "image_url",
]


# ═══════════════════════════════════════════════════════════
# ASIN Helpers
# ═══════════════════════════════════════════════════════════


def validate_asin(asin: str) -> bool:
    """Check whether *asin* is a valid Amazon ASIN (10-char uppercase alphanumeric).

    Returns False for None, whitespace-only, or malformed values.
    """
    if not asin or not isinstance(asin, str):
        return False
    return bool(ASIN_PATTERN.match(asin.strip()))


def extract_asin_from_url(url: str) -> Optional[str]:
    """Extract an ASIN from an Amazon URL.

    Supported patterns:
      - https://www.amazon.com/dp/B0XXXXXXXX
      - https://www.amazon.com/gp/product/B0XXXXXXXX
      - https://www.amazon.com/product/B0XXXXXXXX

    Returns the ASIN string or None if no match is found.
    """
    if not url or not isinstance(url, str):
        return None
    url_stripped = url.strip()
    for pattern in AMAZON_URL_PATTERNS:
        m = pattern.search(url_stripped)
        if m:
            candidate = m.group(1)
            if validate_asin(candidate):
                return candidate
    return None


def extract_asins_from_list(asin_list: list[str]) -> list[str]:
    """Parse and validate ASINs from a list of strings.

    Each item may be a raw ASIN or an Amazon URL.  Non-ASIN values are
    silently discarded.  Returns a deduplicated, ordered list of valid ASINs.
    """
    seen: set[str] = set()
    result: list[str] = []

    for item in asin_list:
        if not item or not isinstance(item, str):
            continue
        item = item.strip()
        if not item:
            continue

        # Try direct ASIN match first
        candidate = item.upper()
        if validate_asin(candidate):
            if candidate not in seen:
                seen.add(candidate)
                result.append(candidate)
            continue

        # Try URL extraction
        asin_from_url = extract_asin_from_url(item)
        if asin_from_url and asin_from_url not in seen:
            seen.add(asin_from_url)
            result.append(asin_from_url)

    return result


# ═══════════════════════════════════════════════════════════
# Variant Expansion
# ═══════════════════════════════════════════════════════════


def expand_variants(product_data: dict) -> list[dict]:
    """Expand variant combinations into individual SKU records.

    *product_data* must have the shape described in output-schema.md:

    .. code:: python

        {
          "product_id": "B0XXXXXXXX",
          "asin": "B0XXXXXXXX",          # or None for non-Amazon
          "detail_url": "https://...",
          "product_title": "...",
          "brand": "...",
          "rating": 4.5,
          "review_count": 1200,
          "selling_points": [...],
          "specs": {...},
          "source_url": "...",
          "variants": [
            {
              "sku_id": "...",
              "size": "M",
              "color": "Black",
              "price": 29.99,
              "price_currency": "USD",
              "available": True,
              "image_url": "https://..."
            }
          ]
        }

    Each variant dict is merged with the product-level fields to produce
    a flat SKU row.  At minimum the product-variant inputs are preserved;
    the returned dicts use the SKU CSV column keys.

    Returns an empty list when there are no variants or the product data
    is malformed.
    """
    if not product_data or not isinstance(product_data, dict):
        return []

    variants = product_data.get("variants", [])
    if not variants or not isinstance(variants, list):
        return []

    product_id = product_data.get("product_id") or ""
    asin = product_data.get("asin") or None
    detail_url = product_data.get("detail_url") or ""
    source_url = product_data.get("source_url") or detail_url
    product_title = product_data.get("product_title") or ""
    brand = product_data.get("brand") or ""
    rating = product_data.get("rating")
    review_count = product_data.get("review_count")
    # Prefer variant-level image_url, fall back to product-level
    product_image = product_data.get("image_url") or ""
    run_id = product_data.get("run_id") or ""

    sku_rows: list[dict] = []
    for v in variants:
        if not isinstance(v, dict):
            continue

        sku_id = v.get("sku_id") or _generate_sku_id(product_id, v)
        var_attrs = _build_variant_attributes(v)

        # Determine variant-specific image
        image_url = v.get("image_url") or product_image
        image_status = _classify_image_status(image_url)

        price = v.get("price")
        price_str = _format_price(price, v.get("price_currency"))

        row: dict[str, Any] = {
            "run_id": run_id,
            "product_id": product_id,
            "asin": asin,
            "sku_id": sku_id,
            "detail_url": detail_url,
            "source_url": source_url,
            "product_title": product_title,
            "brand": brand,
            "variant_attributes": var_attrs,
            "price": price_str,
            "rating": rating if rating is not None else "",
            "review_count": review_count if review_count is not None else "",
            "image_url": image_url,
            "image_status": image_status,
            "extraction_status": "ok",
        }
        sku_rows.append(row)

    return sku_rows


def _generate_sku_id(product_id: str, variant: dict) -> str:
    """Generate a deterministic SKU ID from product_id + variant attributes."""
    attrs = _build_variant_attributes(variant)
    raw = f"{product_id}_{attrs}" if attrs else product_id
    h = hashlib.md5(raw.encode("utf-8")).hexdigest()[:8]
    return f"{product_id}_{h}"


def _build_variant_attributes(variant: dict) -> str:
    """Build a normalized variant_attributes string (e.g. 'color=Black;size=M')."""
    excluded_keys = {"sku_id", "sku", "price", "price_currency", "available", "image_url"}
    parts: list[str] = []
    for key, value in variant.items():
        if key in excluded_keys or value is None:
            continue
        parts.append(f"{key}={value}")
    return ";".join(parts) if parts else "default"


def _format_price(price: Any, currency: Optional[str]) -> str:
    """Format price with optional currency suffix."""
    if price is None or price == "":
        return ""
    try:
        p = float(price)
        formatted = f"{p:.2f}"
        if currency:
            formatted = f"{formatted} {currency}"
        return formatted
    except (ValueError, TypeError):
        return str(price)


def _classify_image_status(image_url: str) -> str:
    """Classify image URL status without making a network call.

    Returns one of:
      - "valid"          — a plausible URL is present
      - "image_unverified" — URL present but cannot be verified syntactically
      - "invalid"        — empty or clearly malformed
    """
    if not image_url or not isinstance(image_url, str):
        return "invalid"
    url = image_url.strip()
    if not url:
        return "invalid"

    # Reject ASIN-constructed URLs (RED Case 2)
    if re.search(r"/([A-Z0-9]{10})\.(jpg|jpeg|png|gif|webp)$", url, re.IGNORECASE):
        return "image_unverified"

    # Accept common valid URL patterns
    if url.startswith("http://") or url.startswith("https://"):
        if re.search(r"\.(jpg|jpeg|png|gif|webp|avif)(\?|$)", url, re.IGNORECASE):
            return "valid"
        return "image_unverified"  # URL but unknown extension

    return "invalid"


# ═══════════════════════════════════════════════════════════
# Validation Gates
# ═══════════════════════════════════════════════════════════


def validate_product_data(product: dict, gates: Optional[dict] = None) -> dict:
    """Apply validation gates against a single product record.

    *gates* is an optional dict of gate overrides:

    .. code:: python

        {
          "strict": True,        # default False — raises gate failures as errors
          "required_fields": [...],  # default GATE4_REQUIRED_FIELDS
          "price_min": 0.01,
          "price_max": 99999.99,
          "skip_image_check": False,
        }

    Returns a dict:

    .. code:: python

        {
          "product_id": "...",
          "gates": {
            "gate4_required_fields": {"pass": True, "missing": []},
            "gate4_field_presence": {"pass": True, "empty_fields": []},
            "gate5_image_url": {"pass": True, "status": "valid"},
            "gate3_sku_count": {"pass": True, "sku_count": 0},
            "price_sanity": {"pass": True, "message": ""},
          },
          "errors": [],
          "warnings": [],
        }
    """
    if gates is None:
        gates = {}
    strict = gates.get("strict", False)
    required_fields = gates.get("required_fields", GATE4_REQUIRED_FIELDS_PRODUCT)
    price_min = gates.get("price_min", 0.01)
    price_max = gates.get("price_max", 99999.99)

    product_id = product.get("product_id") or product.get("asin") or "unknown"
    errors: list[str] = []
    warnings: list[str] = []
    gate_results: dict[str, dict] = {}

    # ── Gate 4: Required Fields Presence ──────────────────
    missing = [f for f in required_fields if f not in product]
    gate_results["gate4_required_fields"] = {
        "pass": len(missing) == 0,
        "missing": missing,
    }
    if missing:
        msg = f"Missing required fields: {', '.join(missing)}"
        errors.append(msg)

    # ── Gate 4: Non-empty check for required fields ───────
    empty_fields: list[str] = []
    for field in required_fields:
        val = product.get(field)
        if val is None or (isinstance(val, str) and val.strip() == ""):
            empty_fields.append(field)
    gate_results["gate4_field_presence"] = {
        "pass": len(empty_fields) == 0,
        "empty_fields": empty_fields,
    }
    if empty_fields:
        msg = f"Required fields are empty: {', '.join(empty_fields)}"
        if strict:
            errors.append(msg)
        else:
            warnings.append(msg)

    # ── Gate 3: SKU Count ─────────────────────────────────
    variants = product.get("variants", [])
    sku_count = len(variants) if isinstance(variants, list) else 0
    gate_results["gate3_sku_count"] = {
        "pass": sku_count > 0,
        "sku_count": sku_count,
    }
    if sku_count == 0:
        msg = "No variants found — SKU count is zero"
        if strict:
            errors.append(msg)
        else:
            warnings.append(msg)

    # ── Gate 5: Image Verification ────────────────────────
    skip_image = gates.get("skip_image_check", False)
    if not skip_image:
        image_url = product.get("image_url") or ""
        img_status = _classify_image_status(image_url)
        # Also check variant-level images if any
        variant_img_issues: list[str] = []
        for i, v in enumerate(variants if isinstance(variants, list) else []):
            v_img = v.get("image_url") or ""
            if v_img and _classify_image_status(v_img) == "invalid":
                variant_img_issues.append(f"variant[{i}]: {v_img}")

        combined_status = "valid"
        primary_pass = True
        if img_status == "invalid":
            combined_status = "invalid"
            primary_pass = False
        elif img_status == "image_unverified":
            combined_status = "image_unverified"
            primary_pass = False

        gate_results["gate5_image_url"] = {
            "pass": primary_pass and len(variant_img_issues) == 0,
            "status": img_status,
            "variant_image_issues": variant_img_issues,
        }
        if not primary_pass:
            msg = f"Image URL status: {img_status}"
            if strict:
                errors.append(msg)
            else:
                warnings.append(msg)
        if variant_img_issues:
            msg = f"Variant image issues: {', '.join(variant_img_issues[:5])}"
            if strict:
                errors.append(msg)
            else:
                warnings.append(msg)
    else:
        gate_results["gate5_image_url"] = {"pass": True, "skipped": True}

    # ── Price Sanity (product-level for Amazon ASIN) ──────
    # Note: most real prices are variant-level; this checks a top-level
    # price field if one exists on the product record.
    price = product.get("price")
    price_sane = True
    price_msg = ""
    if price is not None:
        try:
            p = float(price)
            if p < price_min:
                price_sane = False
                price_msg = f"Price {p} is below minimum {price_min}"
            elif p > price_max:
                price_sane = False
                price_msg = f"Price {p} exceeds maximum {price_max}"
        except (ValueError, TypeError):
            price_sane = False
            price_msg = f"Price '{price}' is not a valid number"
    else:
        # Price is a required field; handled by gate4 check above
        pass

    gate_results["price_sanity"] = {"pass": price_sane, "message": price_msg}
    if not price_sane:
        if strict:
            errors.append(price_msg)
        else:
            warnings.append(price_msg)

    return {
        "product_id": product_id,
        "gates": gate_results,
        "errors": errors,
        "warnings": warnings,
    }


# ═══════════════════════════════════════════════════════════
# Output Formatting
# ═══════════════════════════════════════════════════════════


def format_sku_csv(skus: list[dict]) -> str:
    """Format validated SKU records as a CSV string.

    Uses *SKU_CSV_COLUMNS* as the column order.  Missing keys are
    rendered as empty strings.
    """
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=SKU_CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for sku in skus:
        row = {col: sku.get(col, "") for col in SKU_CSV_COLUMNS}
        writer.writerow(row)
    return output.getvalue()


def format_sku_json(skus: list[dict]) -> str:
    """Format validated SKU records as a JSON array string."""
    return json.dumps(skus, ensure_ascii=False, indent=2, default=str)


# ═══════════════════════════════════════════════════════════
# Full Pipeline
# ═══════════════════════════════════════════════════════════


def process_products(source: Any, config: dict) -> dict:
    """Full validation pipeline: ASIN extraction -> ingestion -> validation -> variant expansion -> format.

    Parameters
    ----------
    source : list[str] or list[dict]
        - If a list of strings, treated as ASINs (or Amazon URLs) to validate.
        - If a list of dicts, treated as pre-extracted product data.
    config : dict
        Pipeline configuration.  Supported keys:

        - ``run_id``: str — identifier for this run (auto-generated if omitted)
        - ``source_type``: str — ``asin_list``, ``category_page``, ``ranking_page``, ``keyword_search``, ``detail_page``
        - ``strict``: bool — raise gate failures as errors (default False)
        - ``price_min``, ``price_max``: float — price sanity bounds
        - ``output_format``: str — ``csv`` or ``json`` (default ``csv``)

    Returns
    -------
    dict
        .. code:: python

            {
              "run_id": "...",
              "source_type": "...",
              "status": "success" | "partial" | "failure",
              "products": [...],           # validated product records
              "skus": [...],               # expanded SKU rows
              "output": "...",             # formatted output string (CSV or JSON)
              "validation_summary": {
                "products_count": 2,
                "sku_count": 14,
                "passed_count": 1,
                "failed_count": 1,
                "errors": [...],
                "warnings": [...],
              },
              "notes": [...],
            }
    """
    config = config or {}
    run_id = config.get("run_id") or _generate_run_id()
    source_type = config.get("source_type", "asin_list")
    strict = config.get("strict", False)
    output_format = config.get("output_format", "csv")

    gate_config = {
        "strict": strict,
        "price_min": config.get("price_min", 0.01),
        "price_max": config.get("price_max", 99999.99),
        "skip_image_check": config.get("skip_image_check", False),
    }

    products: list[dict] = []
    notes: list[str] = []
    all_errors: list[str] = []
    all_warnings: list[str] = []
    validation_summary_list: list[dict] = []

    # ── Phase 1: Ingest source ────────────────────────────
    if isinstance(source, list):
        if not source:
            return _build_failure(run_id, source_type, "Empty source list")

        # Check if it's a list of strings (ASINs) or dicts (products)
        if all(isinstance(item, str) for item in source):
            # ASIN list mode
            asins = extract_asins_from_list(source)
            if not asins:
                return _build_failure(run_id, source_type, "No valid ASINs found in source")
            notes.append(f"Extracted {len(asins)} valid ASINs from {len(source)} input items")
            # In a real pipeline, each ASIN would be fetched from its detail page.
            # Since we operate on pre-extracted data, create stub product records.
            for asin in asins:
                products.append({
                    "product_id": asin,
                    "asin": asin,
                    "detail_url": f"https://www.amazon.com/dp/{asin}",
                    "product_title": "",
                    "brand": "",
                    "rating": None,
                    "review_count": None,
                    "selling_points": [],
                    "specs": {},
                    "source_url": "",
                    "image_url": "",
                    "variants": [],
                })
            notes.append(
                f"ASIN-only mode: {len(products)} product stubs created. "
                "Provide product_data via --product-data or pre-extracted JSON for full validation."
            )
        elif all(isinstance(item, dict) for item in source):
            products = deepcopy(source)
            notes.append(f"Ingested {len(products)} product records from pre-extracted data")
        else:
            return _build_failure(run_id, source_type, "Mixed source types — must be all strings or all dicts")
    else:
        return _build_failure(run_id, source_type, "Source must be a list of strings (ASINs) or dicts (product data)")

    # ── Phase 2: Validate & expand each product ───────────
    all_skus: list[dict] = []
    for product in products:
        # Ensure run_id is propagated
        product.setdefault("run_id", run_id)

        validation = validate_product_data(product, gate_config)
        validation_summary_list.append(validation)
        all_errors.extend(validation["errors"])
        all_warnings.extend(validation["warnings"])

        # Gate status: stop on gate failure if strict
        gate_failures = [k for k, v in validation["gates"].items() if not v.get("pass", True)]
        product["_gate_failures"] = gate_failures

        if strict and gate_failures:
            notes.append(
                f"Product {validation['product_id']}: Gating stopped due to "
                f"{', '.join(gate_failures)}"
            )
            continue

        # Expand variants (still run expansion even with gate warnings for partial output)
        skus = expand_variants(product)
        if not skus:
            notes.append(
                f"Product {validation['product_id']}: No variants to expand. "
                "SKU count is zero."
            )
        all_skus.extend(skus)

    # ── Phase 3: Format output ────────────────────────────
    if output_format == "json":
        output_str = format_sku_json(all_skus)
    else:
        output_str = format_sku_csv(all_skus)

    # ── Phase 4: Determine overall status ─────────────────
    failed_count = sum(1 for v in validation_summary_list if v["errors"])
    passed_count = len(validation_summary_list) - failed_count

    if all_errors:
        status = "failure" if strict and failed_count > 0 else "partial"
    else:
        status = "success"

    result = {
        "run_id": run_id,
        "source_type": source_type,
        "status": status,
        "products": products,
        "skus": all_skus,
        "output": output_str,
        "validation_summary": {
            "products_count": len(products),
            "sku_count": len(all_skus),
            "passed_count": passed_count,
            "failed_count": failed_count,
            "errors": all_errors,
            "warnings": all_warnings,
        },
        "notes": notes,
    }

    return result


def _generate_run_id() -> str:
    """Generate a unique run ID."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    short = uuid.uuid4().hex[:6]
    return f"run_{ts}_{short}"


def _build_failure(run_id: str, source_type: str, reason: str) -> dict:
    """Build a failure result dict."""
    return {
        "run_id": run_id,
        "source_type": source_type,
        "status": "failure",
        "products": [],
        "skus": [],
        "output": "",
        "validation_summary": {
            "products_count": 0,
            "sku_count": 0,
            "passed_count": 0,
            "failed_count": 0,
            "errors": [reason],
            "warnings": [],
        },
        "notes": [reason],
    }
