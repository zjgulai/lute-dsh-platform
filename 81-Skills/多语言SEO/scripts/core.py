"""
seo-multilingual - Multilingual SEO core logic.

Generates and validates hreflang tags, recommends site architecture
for international targeting, and produces multilingual SEO plans.
"""

from __future__ import annotations

import re
from typing import Any

# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────

# Basic ISO 639-1 language codes (a subset of common ones for validation)
_VALID_LANGUAGE_CODES = {
    "af", "ar", "az", "be", "bg", "bn", "bs", "ca", "cs", "cy", "da", "de",
    "el", "en", "es", "et", "eu", "fa", "fi", "fr", "ga", "gl", "gu", "he",
    "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "ka", "kk", "km",
    "kn", "ko", "ky", "lo", "lt", "lv", "mk", "ml", "mn", "mr", "ms", "my",
    "ne", "nl", "no", "pa", "pl", "pt", "ro", "ru", "si", "sk", "sl", "sq",
    "sr", "sv", "sw", "ta", "te", "th", "tl", "tr", "uk", "ur", "uz", "vi",
    "zh", "zu",
}

# ISO 3166-1 alpha-2 country codes (a subset)
_VALID_REGION_CODES = {
    "AD", "AE", "AF", "AG", "AL", "AM", "AO", "AR", "AT", "AU", "AW", "AZ",
    "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BN", "BO", "BR",
    "BS", "BT", "BW", "BY", "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CL",
    "CM", "CN", "CO", "CR", "CU", "CV", "CY", "CZ", "DE", "DJ", "DK", "DM",
    "DO", "DZ", "EC", "EE", "EG", "ER", "ES", "ET", "FI", "FJ", "FR", "GA",
    "GB", "GD", "GE", "GH", "GL", "GM", "GN", "GQ", "GR", "GT", "GW", "GY",
    "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IN", "IQ", "IR", "IS",
    "IT", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR",
    "KW", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV",
    "LY", "MA", "MC", "MD", "ME", "MG", "MK", "ML", "MM", "MN", "MO", "MR",
    "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NE", "NG", "NI", "NL",
    "NO", "NP", "NR", "NZ", "OM", "PA", "PE", "PG", "PH", "PK", "PL", "PT",
    "PW", "PY", "QA", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE",
    "SG", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SY",
    "SZ", "TD", "TG", "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT", "TV",
    "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VN", "VU",
    "WS", "YE", "ZA", "ZM", "ZW",
}


def _is_valid_locale(locale: str) -> bool:
    """Validate locale string (ISO 639-1, optionally with ISO 3166-1)."""
    if not locale or not isinstance(locale, str):
        return False
    locale = locale.strip()
    # x-default is a special valid value
    if locale == "x-default":
        return True

    parts = locale.replace("-", "_").split("_")
    if len(parts) == 1:
        return parts[0].lower() in _VALID_LANGUAGE_CODES
    elif len(parts) == 2:
        return parts[0].lower() in _VALID_LANGUAGE_CODES and parts[1].upper() in _VALID_REGION_CODES
    return False


# ──────────────────────────────────────────────
# Hreflang Tag Generation
# ──────────────────────────────────────────────


def generate_hreflang_tags(urls: dict[str, str], default_locale: str = "") -> dict:
    """
    Generate hreflang link elements for each locale.

    Args:
        urls: dict mapping locale code to URL, e.g.:
            {"en": "https://example.com/", "fr": "https://example.com/fr/"}
            Include 'x-default' key for the fallback if desired.
        default_locale: the default locale for the x-default tag. If provided
                        and x-default is not in urls, the default locale URL
                        will be used as x-default.

    Returns:
        dict with:
            - 'html': str (HTML link elements as a block)
            - 'link_tags': list[dict] (parsed link elements)
            - 'locales': list[str]
            - 'x_default_present': bool
    """
    if not urls:
        return {
            "html": "",
            "link_tags": [],
            "locales": [],
            "x_default_present": False,
            "validation": {"errors": ["No URLs provided."], "warnings": []},
        }

    link_tags: list[dict] = []
    html_parts: list[str] = []
    processed_urls = dict(urls)

    # Ensure x-default is present
    has_x_default = "x-default" in processed_urls
    if not has_x_default and default_locale and default_locale in processed_urls:
        processed_urls["x-default"] = processed_urls[default_locale]
        has_x_default = True

    for locale, url in processed_urls.items():
        link_tags.append({
            "locale": locale,
            "url": url,
            "tag": f'<link rel="alternate" hreflang="{locale}" href="{url}" />',
        })
        html_parts.append(f'<link rel="alternate" hreflang="{locale}" href="{url}" />')

    return {
        "html": "\n".join(html_parts),
        "link_tags": link_tags,
        "locales": list(processed_urls.keys()),
        "x_default_present": has_x_default,
        "validation": {
            "errors": [],
            "warnings": [] if has_x_default else ["No x-default locale specified. Consider adding one for unmatched language users."],
        },
    }


# ──────────────────────────────────────────────
# Hreflang Validation
# ──────────────────────────────────────────────


def validate_hreflang_config(hreflang_map: dict[str, str]) -> list[dict]:
    """
    Validate hreflang configuration.

    Checks bidirectional links, self-referencing, valid locale codes,
    x-default presence, and canonical alignment.

    Args:
        hreflang_map: dict mapping locale -> URL.

    Returns:
        list of issue dicts, each with:
            - 'type': str
            - 'severity': 'error' | 'warning'
            - 'locale': str or empty
            - 'message': str
    """
    issues: list[dict] = []

    if not hreflang_map:
        issues.append({
            "type": "empty_config",
            "severity": "error",
            "locale": "",
            "message": "Hreflang map is empty. Provide at least one locale-URL pair.",
        })
        return issues

    # Check x-default presence
    if "x-default" not in hreflang_map:
        issues.append({
            "type": "missing_x_default",
            "severity": "warning",
            "locale": "",
            "message": "Missing x-default locale. Add x-default for users with unsupported languages.",
        })

    # Validate locale codes
    for locale in hreflang_map:
        if not _is_valid_locale(locale):
            issues.append({
                "type": "invalid_locale",
                "severity": "error",
                "locale": locale,
                "message": f"Invalid locale code: '{locale}'. Use ISO 639-1 format (e.g., 'en') "
                           f"or language-region (e.g., 'en-US').",
            })

    # Check self-referencing (each page should have a self-referencing hreflang)
    # For a single map, we expect the page URL to be in the map
    # Check that each URL is unique
    urls = list(hreflang_map.values())
    if len(urls) != len(set(urls)):
        # Find duplicates
        seen = {}
        for locale, url in hreflang_map.items():
            if url in seen:
                issues.append({
                    "type": "duplicate_url",
                    "severity": "error",
                    "locale": locale,
                    "message": f"URL '{url}' is shared between locales '{seen[url]}' and '{locale}'. "
                               f"Each locale needs a unique URL.",
                })
            seen[url] = locale

    return issues


# ──────────────────────────────────────────────
# Site Architecture Suggestion
# ──────────────────────────────────────────────


def suggest_site_architecture(target_markets: list[dict]) -> dict:
    """
    Recommend site architecture strategy for international markets.

    Args:
        target_markets: list of dicts, each with:
            - 'locale': str (e.g., 'en-US', 'fr-FR')
            - 'market': str (e.g., 'US', 'France')
            - 'search_volume': int (relative size) — optional
            - 'language': str
            - 'server_location': str (optional)
            - 'budget': str ('high'/'medium'/'low') — optional

    Returns:
        dict with:
            - 'recommended_architecture': str (subdirectory | subdomain | ccTLD)
            - 'alternatives': list[str]
            - 'recommendations': list[dict] per market
            - 'rationale': dict with reasoning for each architecture type
    """
    if not target_markets:
        return {
            "recommended_architecture": "subdirectory",
            "alternatives": ["subdomain", "ccTLD"],
            "recommendations": [],
            "rationale": {},
        }

    # Count by factors
    region_count = len(target_markets)
    has_multiple_languages = len(set(m.get("language", "") for m in target_markets)) > 1
    has_high_budget = any(m.get("budget") == "high" for m in target_markets)
    has_specific_server = any(m.get("server_location") for m in target_markets)

    # Decision logic
    rationale = {
        "subdirectory": {
            "description": "example.com/fr/, example.com/de/",
            "pros": [
                "Consolidated SEO authority to root domain",
                "Easiest to maintain (single CMS install)",
                "Lowest cost and technical complexity",
                "Easy to add new markets",
            ],
            "cons": [
                "Less geo-targeting signal than ccTLD",
                "Server location not localized",
            ],
            "best_for": "Multiple languages, limited budget, single server location",
        },
        "subdomain": {
            "description": "fr.example.com, de.example.com",
            "pros": [
                "Moderate SEO authority separation",
                "Can host on different servers per region",
                "Moderate maintenance cost",
            ],
            "cons": [
                "Search engines may treat as separate sites",
                "More complex than subdirectory",
                "Requires separate tracking setup",
            ],
            "best_for": "Organizations with regional teams, moderate budget",
        },
        "ccTLD": {
            "description": "example.fr, example.de",
            "pros": [
                "Strongest geo-targeting signal",
                "Preferred by local users",
                "Best for local search rankings",
            ],
            "cons": [
                "Highest cost (multiple domains, hosting)",
                "SEO authority does not flow between domains",
                "Most complex maintenance",
                "Renewal and compliance burden per country",
            ],
            "best_for": "Dedicated local presence, high budget, specific server locations",
        },
    }

    if has_multiple_languages and not has_high_budget:
        recommended = "subdirectory"
    elif region_count <= 3 and has_high_budget and has_specific_server:
        recommended = "ccTLD"
    elif has_high_budget:
        recommended = "ccTLD" if region_count <= 5 else "subdomain"
    else:
        recommended = "subdirectory"

    alternatives = [a for a in ["subdirectory", "subdomain", "ccTLD"] if a != recommended]

    # Per-market recommendations
    recommendations: list[dict] = []
    for market in target_markets:
        locale = market.get("locale", "")
        arch = recommended
        # For ccTLD strategy, each market might have its own TLD
        if recommended == "ccTLD":
            country_tld_map = {
                "US": ".com", "UK": ".co.uk", "GB": ".co.uk",
                "DE": ".de", "FR": ".fr", "JP": ".jp",
                "CN": ".cn", "BR": ".br", "AU": ".com.au",
                "CA": ".ca", "IT": ".it", "ES": ".es",
                "NL": ".nl", "KR": ".kr", "IN": ".in",
                "RU": ".ru", "MX": ".mx", "SE": ".se",
            }
            country = market.get("market", "")
            tld = country_tld_map.get(country, f".{country.lower()}")
            domain_hint = f"example{tld}"
        elif recommended == "subdomain":
            lang_part = locale.split("-")[0].split("_")[0]
            domain_hint = f"{lang_part}.example.com"
        else:
            lang_part = locale.split("-")[0].split("_")[0]
            domain_hint = f"example.com/{lang_part}/"

        recommendations.append({
            "locale": locale,
            "market": market.get("market", ""),
            "language": market.get("language", ""),
            "recommended_url_pattern": domain_hint,
            "architecture": recommended,
        })

    return {
        "recommended_architecture": recommended,
        "alternatives": alternatives,
        "recommendations": recommendations,
        "rationale": rationale,
        "summary": {
            "market_count": region_count,
            "multilingual": has_multiple_languages,
            "architecture": recommended,
            "note": f"Recommended: {rationale[recommended]['best_for']}",
        },
    }


# ──────────────────────────────────────────────
# Full Multilingual SEO Plan
# ──────────────────────────────────────────────


def generate_multilingual_seo_plan(
    markets: list[dict],
    pages: list[dict],
    config: dict | None = None,
) -> dict:
    """
    Generate a complete multilingual SEO plan.

    Pipeline:
        1. Site architecture recommendation
        2. Hreflang map generation
        3. Content localization priority
        4. Technical implementation checklist

    Args:
        markets: list of target market dicts with 'locale', 'market', 'language'.
        pages: list of page dicts, each with:
            - 'url': str
            - 'locale': str
            - 'title': str (optional)
            - 'priority': int (1-10, optional)
        config: optional dict with:
            - 'default_locale': str
            - 'site_url': str (base URL of the site)
            - 'include_x_default': bool (default True)

    Returns:
        dict with full multilingual SEO plan.
    """
    config = config or {}
    default_locale = config.get("default_locale", "")
    site_url = config.get("site_url", "")
    include_x_default = config.get("include_x_default", True)

    # Step 1: Architecture recommendation
    architecture = suggest_site_architecture(markets)

    # Step 2: Generate hreflang map
    hreflang_map: dict[str, str] = {}
    for page in pages:
        locale = page.get("locale", "")
        if locale and page.get("url"):
            hreflang_map[locale] = page["url"]

    if include_x_default and "x-default" not in hreflang_map and default_locale:
        default_url = next(
            (p["url"] for p in pages if p.get("locale") == default_locale),
            None,
        )
        if default_url:
            hreflang_map["x-default"] = default_url
        elif site_url:
            hreflang_map["x-default"] = site_url

    hreflang = generate_hreflang_tags(hreflang_map, default_locale)

    # Validate
    hreflang_issues = validate_hreflang_config(hreflang_map)

    # Step 3: Content localization priority
    content_priority: list[dict] = []
    for page in pages:
        locale = page.get("locale", "")
        priority = page.get("priority", 5)
        title = page.get("title", page.get("url", ""))
        content_priority.append({
            "locale": locale,
            "url": page.get("url", ""),
            "title": title,
            "priority_score": priority,
            "priority_tier": "high" if priority >= 7 else "medium" if priority >= 4 else "low",
        })

    # Sort by priority descending
    content_priority.sort(key=lambda x: x["priority_score"], reverse=True)

    # Step 4: Technical checklist
    tech_checklist: list[dict] = [
        {"item": "Set up hreflang tags on all pages", "required": True, "done": len(hreflang.get("link_tags", [])) > 0},
        {"item": "Configure Google Search Console international targeting", "required": True, "done": False},
        {"item": "Implement canonical tags pointing to correct locale version", "required": True, "done": False},
        {"item": "Set up language-specific sitemaps", "required": True, "done": False},
        {"item": "Configure Content-Language headers if using subdomain/ccTLD", "required": False, "done": False},
        {"item": "Add language switcher UI with hreflang self-referencing", "required": True, "done": False},
        {"item": "Verify no duplicate content across locale pages", "required": True, "done": False},
        {"item": "Check URL structure consistency across all locales", "required": True, "done": False},
        {"item": "Implement locale-specific Open Graph tags", "required": False, "done": False},
        {"item": "Monitor indexing per locale in Search Console", "required": True, "done": False},
    ]

    summary = {
        "markets_count": len(markets),
        "pages_count": len(pages),
        "architecture": architecture.get("recommended_architecture", ""),
        "hreflang_entries": len(hreflang_map),
        "x_default_present": "x-default" in hreflang_map,
        "validation_issues": len(hreflang_issues),
        "high_priority_pages": sum(1 for p in content_priority if p["priority_tier"] == "high"),
    }

    return {
        "architecture": architecture,
        "hreflang": hreflang,
        "hreflang_validation": hreflang_issues,
        "content_localization_priority": content_priority,
        "technical_checklist": tech_checklist,
        "summary": summary,
    }
