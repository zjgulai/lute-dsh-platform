"""
Multi-Platform Listing Generator - 核心逻辑

从单一产品描述生成适配 Amazon、Shopify、eBay、Walmart、Etsy 的 Listing。
"""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any


# ──────────────────────────────────────────────
# Platform Rules
# ──────────────────────────────────────────────

_PLATFORM_RULES: dict[str, dict[str, Any]] = {
    "amazon": {
        "title_max_chars": 200,
        "bullet_count": (3, 5),
        "bullet_max_chars": 500,
        "description_max_chars": 2000,
        "image_count": (6, 9),
        "image_size": (1000, 10000),  # pixels per side
        "backend_keywords_bytes": 250,
        "style": "benefit_driven",
        "features": ["bullet_points", "aplus_content", "backend_keywords"],
    },
    "shopify": {
        "title_max_chars": 255,
        "bullet_count": (0, 0),  # no fixed bullets; free-form description
        "bullet_max_chars": None,
        "description_max_chars": 50000,
        "image_count": (1, 250),
        "image_size": (800, 4000),
        "backend_keywords_bytes": None,
        "style": "long_form",
        "features": ["rich_description", "meta_description", "tags", "collections"],
    },
    "ebay": {
        "title_max_chars": 80,
        "bullet_count": (0, 0),
        "bullet_max_chars": None,
        "description_max_chars": 80000,
        "image_count": (1, 24),
        "image_size": (500, 4000),
        "backend_keywords_bytes": None,
        "style": "feature_based",
        "features": ["item_specifics", "condition", "shipping"],
    },
    "walmart": {
        "title_max_chars": 150,
        "bullet_count": (4, 8),
        "bullet_max_chars": 400,
        "description_max_chars": 2000,
        "image_count": (1, 25),
        "image_size": (1000, 10000),
        "backend_keywords_bytes": 400,
        "style": "benefit_driven",
        "features": ["bullet_points", "specifications", "backend_keywords"],
    },
    "etsy": {
        "title_max_chars": 140,
        "bullet_count": (0, 0),
        "bullet_max_chars": None,
        "description_max_chars": 50000,
        "image_count": (1, 10),
        "image_size": (2000, 10000),
        "backend_keywords_bytes": None,
        "style": "storytelling",
        "features": ["tags", "materials", "attributes"],
    },
}


def get_platform_rules(platform: str) -> dict:
    """
    Return platform-specific rules for listing generation.

    Args:
        platform: One of 'amazon', 'shopify', 'ebay', 'walmart', 'etsy'

    Returns:
        dict of platform rules (title_max_chars, bullet_count, etc.)

    Raises:
        ValueError: if platform is not supported
    """
    platform = platform.lower().strip()
    rules = _PLATFORM_RULES.get(platform)
    if rules is None:
        supported = ", ".join(_PLATFORM_RULES.keys())
        raise ValueError(f"Unsupported platform '{platform}'. Supported: {supported}")
    return dict(rules)


def _list_supported_platforms() -> list[str]:
    """Return list of supported platform names."""
    return list(_PLATFORM_RULES.keys())


# ──────────────────────────────────────────────
# Listing Adaptation
# ──────────────────────────────────────────────


def _truncate_to_bytes(text: str, max_bytes: int) -> str:
    """Truncate text so UTF-8 encoding fits within max_bytes."""
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    while len(encoded) > max_bytes:
        text = text[:-1]
        encoded = text.encode("utf-8")
    return text


def _adapt_for_amazon(product: dict) -> dict:
    """Adapt product for Amazon listing format."""
    title_raw = product.get("title", product.get("name", ""))
    rules = _PLATFORM_RULES["amazon"]

    # Title: max 200 chars
    title = title_raw[: rules["title_max_chars"]]

    # Bullets: 3-5 points, max 500 chars each
    raw_bullets = product.get("bullets", product.get("features", []))
    bullets = [b[: rules["bullet_max_chars"]] for b in raw_bullets[: rules["bullet_count"][1]]]
    while len(bullets) < rules["bullet_count"][0]:
        bullets.append(f"[Benefit {len(bullets)+1}] Highlight a key product benefit")

    # Description
    description = product.get("description", "")
    description = description[: rules["description_max_chars"]]

    # Backend keywords
    raw_keywords = product.get("keywords", [])
    backend_keywords = " ".join(
        sorted(set(k.lower().strip() for k in raw_keywords if k.strip()))
    )
    # Remove commas
    backend_keywords = backend_keywords.replace(",", "")
    # Truncate to 250 bytes
    backend_keywords = _truncate_to_bytes(backend_keywords, rules["backend_keywords_bytes"])

    return {
        "platform": "amazon",
        "title": title,
        "bullets": bullets,
        "description": description,
        "backend_keywords": backend_keywords,
    }


def _adapt_for_shopify(product: dict) -> dict:
    """Adapt product for Shopify store format (long-form description)."""
    rules = _PLATFORM_RULES["shopify"]
    title = product.get("title", product.get("name", ""))[: rules["title_max_chars"]]

    # Shopify uses rich description — combine all content
    description_parts: list[str] = []
    desc = product.get("description", "")
    if desc:
        description_parts.append(desc)

    raw_benefits = product.get("benefits", product.get("features", []))
    if raw_benefits:
        description_parts.append("## Key Features")
        for b in raw_benefits:
            description_parts.append(f"- {b}")

    raw_specs = product.get("specifications", {})
    if raw_specs:
        description_parts.append("## Specifications")
        for key, val in raw_specs.items():
            description_parts.append(f"- **{key}**: {val}")

    description = "\n\n".join(description_parts)[: rules["description_max_chars"]]

    # Tags (derived from keywords)
    tags = [k.strip().lower() for k in product.get("keywords", []) if k.strip()]
    tags = list(dict.fromkeys(tags))  # dedup, preserve order

    return {
        "platform": "shopify",
        "title": title,
        "description": description,
        "tags": tags[:20],
    }


def _adapt_for_ebay(product: dict) -> dict:
    """Adapt product for eBay listing format (concise title, item specifics)."""
    rules = _PLATFORM_RULES["ebay"]
    title = product.get("title", product.get("name", ""))[: rules["title_max_chars"]]

    description_parts: list[str] = []
    desc = product.get("description", "")
    if desc:
        description_parts.append(desc)

    features = product.get("features", [])
    if features:
        description_parts.append("## Features")
        for f in features:
            description_parts.append(f"* {f}")

    conditions = product.get("condition", "New")
    description = "\n\n".join(description_parts)[: rules["description_max_chars"]]

    # Item specifics
    item_specifics = {}
    specs = product.get("specifications", {})
    for key, val in specs.items():
        item_specifics[key] = str(val)

    return {
        "platform": "ebay",
        "title": title,
        "description": description,
        "condition": conditions,
        "item_specifics": item_specifics,
    }


def _adapt_for_walmart(product: dict) -> dict:
    """Adapt product for Walmart listing format."""
    rules = _PLATFORM_RULES["walmart"]
    title = product.get("title", product.get("name", ""))[: rules["title_max_chars"]]

    raw_bullets = product.get("bullets", product.get("features", []))
    bullets = [b[: rules["bullet_max_chars"]] for b in raw_bullets[: rules["bullet_count"][1]]]
    while len(bullets) < rules["bullet_count"][0]:
        bullets.append(f"[Feature {len(bullets)+1}] Add a key product specification")

    description = (product.get("description") or "")[: rules["description_max_chars"]]

    raw_keywords = product.get("keywords", [])
    backend_keywords = " ".join(set(k.strip().lower() for k in raw_keywords if k.strip()))
    backend_keywords = _truncate_to_bytes(backend_keywords, rules["backend_keywords_bytes"])

    return {
        "platform": "walmart",
        "title": title,
        "bullets": bullets,
        "description": description,
        "backend_keywords": backend_keywords,
    }


def _adapt_for_etsy(product: dict) -> dict:
    """Adapt product for Etsy listing format (storytelling, tags, materials)."""
    rules = _PLATFORM_RULES["etsy"]
    title = product.get("title", product.get("name", ""))[: rules["title_max_chars"]]

    description_parts: list[str] = []
    story = product.get("story", "")
    if story:
        description_parts.append(story)
    else:
        description_parts.append(f"About {product.get('title', product.get('name', 'this product'))}")

    desc = product.get("description", "")
    if desc:
        description_parts.append(desc)

    materials = product.get("materials", [])
    if materials:
        description_parts.append(f"**Materials**: {', '.join(materials)}")

    description = "\n\n".join(description_parts)[: rules["description_max_chars"]]

    # Tags (max 13 on Etsy)
    tags = [k.strip().lower() for k in product.get("keywords", []) if k.strip()]
    tags = list(dict.fromkeys(tags))[:13]

    return {
        "platform": "etsy",
        "title": title,
        "description": description,
        "tags": tags,
        "materials": materials,
        "attributes": product.get("attributes", {}),
    }


_ADAPTER_MAP = {
    "amazon": _adapt_for_amazon,
    "shopify": _adapt_for_shopify,
    "ebay": _adapt_for_ebay,
    "walmart": _adapt_for_walmart,
    "etsy": _adapt_for_etsy,
}


def adapt_listing(product: dict, platform: str) -> dict:
    """
    Adapt a single product description to a platform-optimized listing format.

    Args:
        product: dict with keys 'title'/'name', 'description', 'features'/'bullets',
                 'specifications', 'keywords', 'benefits', 'materials', 'story',
                 'attributes', 'condition'
        platform: target platform name (amazon, shopify, ebay, walmart, etsy)

    Returns:
        Platform-optimized listing dict
    """
    platform = platform.lower().strip()
    adapter = _ADAPTER_MAP.get(platform)
    if adapter is None:
        supported = ", ".join(_ADAPTER_MAP.keys())
        raise ValueError(f"Unsupported platform '{platform}'. Supported: {supported}")
    return adapter(deepcopy(product))


# ──────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────


def validate_platform_listing(listing: dict, platform: str) -> dict:
    """
    Check a generated listing for compliance with platform rules.

    Args:
        listing: platform-optimized listing dict (output of adapt_listing)
        platform: target platform name

    Returns:
        dict with:
            - 'is_compliant': bool
            - 'platform': str
            - 'checks': list[dict] (one per rule checked)
    """
    rules = get_platform_rules(platform)
    checks: list[dict] = []

    # Title length
    title = listing.get("title", "")
    max_chars = rules["title_max_chars"]
    title_ok = len(title) <= max_chars
    checks.append({
        "rule": "title_max_chars",
        "expected": f"<={max_chars}",
        "actual": len(title),
        "pass": title_ok,
    })

    # Bullet count (if applicable)
    bullet_min, bullet_max = rules["bullet_count"]
    if bullet_max > 0:
        bullets = listing.get("bullets", [])
        bullet_count_ok = bullet_min <= len(bullets) <= bullet_max
        checks.append({
            "rule": "bullet_count",
            "expected": f"{bullet_min}-{bullet_max}",
            "actual": len(bullets),
            "pass": bullet_count_ok,
        })

        # Bullet length
        bullet_max_chars = rules.get("bullet_max_chars")
        if bullet_max_chars:
            for i, b in enumerate(bullets):
                blen_ok = len(b) <= bullet_max_chars
                checks.append({
                    "rule": f"bullet_{i+1}_max_chars",
                    "expected": f"<={bullet_max_chars}",
                    "actual": len(b),
                    "pass": blen_ok,
                })

    # Description length
    desc = listing.get("description", "")
    desc_max = rules["description_max_chars"]
    if desc_max:
        desc_ok = len(desc) <= desc_max
        checks.append({
            "rule": "description_max_chars",
            "expected": f"<={desc_max}",
            "actual": len(desc),
            "pass": desc_ok,
        })

    # Backend keywords bytes (if applicable)
    bkw = listing.get("backend_keywords", "")
    bkw_max = rules.get("backend_keywords_bytes")
    if bkw_max:
        bkw_bytes = len(bkw.encode("utf-8"))
        bkw_ok = bkw_bytes <= bkw_max
        checks.append({
            "rule": "backend_keywords_bytes",
            "expected": f"<={bkw_max}",
            "actual": bkw_bytes,
            "pass": bkw_ok,
        })

    # Tags (Etsy: max 13)
    tags = listing.get("tags", [])
    if platform == "etsy" and tags:
        tags_ok = len(tags) <= 13
        checks.append({
            "rule": "tags_max_13",
            "expected": "<=13",
            "actual": len(tags),
            "pass": tags_ok,
        })

    is_compliant = all(c["pass"] for c in checks)
    return {
        "is_compliant": is_compliant,
        "platform": platform,
        "checks": checks,
    }


# ──────────────────────────────────────────────
# Batch Generation
# ──────────────────────────────────────────────


def generate_multi_platform_listings(product: dict, platforms: list[str]) -> dict:
    """
    Batch generate listings for multiple platforms from a single product.

    Generates and validates each listing.

    Args:
        product: product description dict
        platforms: list of platform names

    Returns:
        dict with:
            - 'product_name': str
            - 'listings': dict of platform -> listing dict
            - 'validations': dict of platform -> validation result
            - 'summary': dict with counts
    """
    listings: dict[str, dict] = {}
    validations: dict[str, dict] = {}

    for platform in platforms:
        try:
            listing = adapt_listing(product, platform)
            validation = validate_platform_listing(listing, platform)
            listings[platform] = listing
            validations[platform] = validation
        except ValueError as e:
            listings[platform] = {"error": str(e)}
            validations[platform] = {"is_compliant": False, "platform": platform, "checks": [], "error": str(e)}

    compliant_count = sum(1 for v in validations.values() if v.get("is_compliant"))

    return {
        "product_name": product.get("title", product.get("name", "Unknown")),
        "listings": listings,
        "validations": validations,
        "summary": {
            "total_platforms": len(platforms),
            "compliant_count": compliant_count,
            "issues_count": len(platforms) - compliant_count,
            "compliant_platforms": [p for p, v in validations.items() if v.get("is_compliant")],
            "platforms_with_issues": [p for p, v in validations.items() if not v.get("is_compliant")],
        },
    }
