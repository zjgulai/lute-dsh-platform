#!/usr/bin/env python3
"""
seo-geo-optimizer - Geo SEO & Schema Markup core logic.

Generates JSON-LD structured data (Product, FAQ, HowTo, LocalBusiness),
validates schema compliance, and produces geo-optimization plans.
"""

from __future__ import annotations

import json
import re
from typing import Any


# ──────────────────────────────────────────────
# Internal Helpers
# ──────────────────────────────────────────────


def _to_json_ld(schema_dict: dict) -> str:
    """Serialize a schema dict to JSON-LD HTML snippet."""
    raw = json.dumps(schema_dict, indent=2, ensure_ascii=False)
    return f'<script type="application/ld+json">\n{raw}\n</script>'


def _is_valid_url(url: str) -> bool:
    """Check if a string is a valid URL."""
    return bool(re.match(r"^https?://[^\s/$.?#].[^\s]*$", url))


def _validate_required_fields(data: dict, required: list[str]) -> list[str]:
    """Check required fields are present and non-empty."""
    missing = []
    for field in required:
        if field not in data or data[field] is None or (isinstance(data[field], str) and not data[field].strip()):
            missing.append(field)
    return missing


# ──────────────────────────────────────────────
# Product Schema
# ──────────────────────────────────────────────


def generate_product_schema(product_info: dict) -> str:
    """
    Generate JSON-LD Product schema.

    Args:
        product_info: dict with keys:
            - 'name': str (required)
            - 'description': str (required)
            - 'image': str URL (required)
            - 'sku': str (required)
            - 'brand': dict with 'name' key (required)
            - 'offers': dict with 'price', 'priceCurrency', 'availability' (required)
            - 'aggregateRating': dict with 'ratingValue', 'reviewCount' (optional)
            - 'review': list[dict] (optional)
            - 'mpn': str (optional)
            - 'gtin': str (optional)
            - 'category': str (optional)

    Returns:
        str: JSON-LD HTML snippet.

    Raises:
        ValueError: if required fields are missing.
    """
    required = ["name", "description", "image", "sku", "brand", "offers"]
    missing = _validate_required_fields(product_info, required)
    if missing:
        raise ValueError(f"Missing required Product schema fields: {', '.join(missing)}")

    schema: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product_info["name"],
        "description": product_info["description"],
        "image": product_info["image"],
        "sku": product_info["sku"],
        "brand": {
            "@type": "Brand",
            "name": product_info["brand"].get("name", ""),
        },
    }

    # Offers
    offers = product_info["offers"]
    offer_required = ["price", "priceCurrency", "availability"]
    if "url" in offers:
        schema["offers"] = {
            "@type": "Offer",
            "url": offers["url"],
            "priceCurrency": offers.get("priceCurrency", "USD"),
            "price": offers["price"],
            "availability": _normalize_availability(offers.get("availability", "InStock")),
        }
    else:
        schema["offers"] = {
            "@type": "Offer",
            "priceCurrency": offers.get("priceCurrency", "USD"),
            "price": offers["price"],
            "availability": _normalize_availability(offers.get("availability", "InStock")),
        }

    # Optional: aggregateRating
    if "aggregateRating" in product_info and product_info["aggregateRating"]:
        ar = product_info["aggregateRating"]
        schema["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": ar.get("ratingValue", 0),
            "reviewCount": ar.get("reviewCount", 0),
        }

    # Optional: review
    if "review" in product_info and product_info["review"]:
        reviews: list[dict] = []
        for r in product_info["review"]:
            review_entry: dict[str, Any] = {
                "@type": "Review",
                "reviewRating": {
                    "@type": "Rating",
                    "ratingValue": r.get("ratingValue", 5),
                },
                "author": {
                    "@type": "Person",
                    "name": r.get("author", "Anonymous"),
                },
            }
            if "reviewBody" in r:
                review_entry["reviewBody"] = r["reviewBody"]
            if "datePublished" in r:
                review_entry["datePublished"] = r["datePublished"]
            reviews.append(review_entry)
        schema["review"] = reviews

    # Optional fields
    for key in ("mpn", "gtin", "gtin13", "gtin14", "category"):
        if key in product_info:
            schema[key] = product_info[key]

    return _to_json_ld(schema)


def _normalize_availability(avail: str) -> str:
    """Normalize availability string to schema.org format."""
    mapping = {
        "in_stock": "https://schema.org/InStock",
        "instock": "https://schema.org/InStock",
        "in stock": "https://schema.org/InStock",
        "out_of_stock": "https://schema.org/OutOfStock",
        "outofstock": "https://schema.org/OutOfStock",
        "out of stock": "https://schema.org/OutOfStock",
        "preorder": "https://schema.org/PreOrder",
        "pre_order": "https://schema.org/PreOrder",
        "discontinued": "https://schema.org/Discontinued",
        "limited": "https://schema.org/LimitedAvailability",
        "limited_availability": "https://schema.org/LimitedAvailability",
    }
    normalized = avail.replace(" ", "_").lower()
    if normalized in mapping:
        return mapping[normalized]
    return f"https://schema.org/{avail}"


# ──────────────────────────────────────────────
# FAQ Schema
# ──────────────────────────────────────────────


def generate_faq_schema(questions: list[dict]) -> str:
    """
    Generate JSON-LD FAQPage schema from Q&A pairs.

    Args:
        questions: list of dicts, each with 'question' (str) and 'answer' (str) keys.

    Returns:
        str: JSON-LD HTML snippet.

    Raises:
        ValueError: if questions list is empty or entries are invalid.
    """
    if not questions:
        raise ValueError("At least one question-answer pair is required.")

    main_entity: list[dict] = []
    for i, qa in enumerate(questions):
        q = qa.get("question", "").strip()
        a = qa.get("answer", "").strip()
        if not q:
            raise ValueError(f"Question {i + 1} is empty.")
        if not a:
            raise ValueError(f"Answer for question '{q[:50]}' is empty.")
        main_entity.append({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": a,
            },
        })

    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": main_entity,
    }

    return _to_json_ld(schema)


# ──────────────────────────────────────────────
# HowTo Schema
# ──────────────────────────────────────────────


def generate_howto_schema(steps: list[dict]) -> str:
    """
    Generate JSON-LD HowTo schema.

    Args:
        steps: list of dicts, each with:
            - 'name': str (step name, required)
            - 'text': str (step description, required)
            - 'url': str (optional)
            - 'image': str (optional)
            - 'duration': str (optional, ISO 8601)

    Returns:
        str: JSON-LD HTML snippet.

    Raises:
        ValueError: if steps list is empty or entries are invalid.
    """
    if not steps:
        raise ValueError("At least one step is required.")

    step_list: list[dict] = []
    for i, step in enumerate(steps):
        name = step.get("name", "").strip()
        text = step.get("text", "").strip()

        if not name and not text:
            raise ValueError(f"Step {i + 1} has no name or text content.")

        step_entry: dict[str, Any] = {
            "@type": "HowToStep",
            "position": i + 1,
        }

        if name:
            step_entry["name"] = name
        if text:
            step_entry["text"] = text
        if step.get("url"):
            step_entry["url"] = step["url"]
        if step.get("image"):
            step_entry["image"] = step["image"]
        if step.get("duration"):
            step_entry["duration"] = step["duration"]

        step_list.append(step_entry)

    schema = {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "step": step_list,
    }

    return _to_json_ld(schema)


# ──────────────────────────────────────────────
# LocalBusiness Schema
# ──────────────────────────────────────────────


def generate_local_business_schema(business_info: dict) -> str:
    """
    Generate JSON-LD LocalBusiness schema.

    Args:
        business_info: dict with keys:
            - 'name': str (required)
            - 'address': dict with 'streetAddress', 'addressLocality', 'addressRegion',
                         'postalCode', 'addressCountry' (required)
            - 'telephone': str (required)
            - 'url': str (required)
            - 'openingHours': list[dict] with 'dayOfWeek' and 'opens'/'closes' (optional)
            - 'priceRange': str (optional, e.g. '$$')
            - 'image': str URL (optional)
            - 'geo': dict with 'latitude', 'longitude' (optional)
            - 'aggregateRating': dict (optional)
            - 'servesCuisine': str (optional, for restaurants)
            - 'businessType': str (optional, defaults to 'LocalBusiness')

    Returns:
        str: JSON-LD HTML snippet.

    Raises:
        ValueError: if required fields are missing.
    """
    required = ["name", "address", "telephone", "url"]
    missing = _validate_required_fields(business_info, required)
    if missing:
        raise ValueError(f"Missing required LocalBusiness schema fields: {', '.join(missing)}")

    business_type = business_info.get("businessType", "LocalBusiness")

    schema: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": business_type,
        "name": business_info["name"],
        "telephone": business_info["telephone"],
        "url": business_info["url"],
        "address": {
            "@type": "PostalAddress",
            "streetAddress": business_info["address"].get("streetAddress", ""),
            "addressLocality": business_info["address"].get("addressLocality", ""),
            "addressRegion": business_info["address"].get("addressRegion", ""),
            "postalCode": business_info["address"].get("postalCode", ""),
            "addressCountry": business_info["address"].get("addressCountry", ""),
        },
    }

    # Optional: opening hours
    if "openingHours" in business_info and business_info["openingHours"]:
        hours_specs: list[dict] = []
        for oh in business_info["openingHours"]:
            hours_specs.append({
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": oh.get("dayOfWeek", ""),
                "opens": oh.get("opens", "09:00"),
                "closes": oh.get("closes", "17:00"),
            })
        schema["openingHoursSpecification"] = hours_specs

    # Optional fields
    for key in ("priceRange", "image", "servesCuisine", "description"):
        if key in business_info:
            schema[key] = business_info[key]

    # Optional: geo coordinates
    if "geo" in business_info and business_info["geo"]:
        schema["geo"] = {
            "@type": "GeoCoordinates",
            "latitude": business_info["geo"].get("latitude", 0),
            "longitude": business_info["geo"].get("longitude", 0),
        }

    # Optional: aggregateRating
    if "aggregateRating" in business_info and business_info["aggregateRating"]:
        schema["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": business_info["aggregateRating"].get("ratingValue", 0),
            "reviewCount": business_info["aggregateRating"].get("reviewCount", 0),
        }

    return _to_json_ld(schema)


# ──────────────────────────────────────────────
# Schema Validation
# ──────────────────────────────────────────────


_SCHEMA_REQUIRED_FIELDS: dict[str, list[str]] = {
    "Product": ["name", "description"],
    "FAQPage": ["mainEntity"],
    "HowTo": ["step"],
    "LocalBusiness": ["name", "address", "telephone"],
}


def validate_schema(schema_json: dict | str, schema_type: str = "") -> dict:
    """
    Validate a JSON-LD schema against schema.org required fields.

    Args:
        schema_json: dict or JSON string of the schema.
        schema_type: expected @type (e.g., 'Product', 'FAQPage'). If empty,
                     inferred from the schema.

    Returns:
        dict with:
            - 'is_valid': bool
            - 'errors': list[str]
            - 'warnings': list[str]
            - 'inferred_type': str
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Parse JSON if string
    if isinstance(schema_json, str):
        try:
            schema_json = json.loads(schema_json)
        except json.JSONDecodeError as e:
            return {
                "is_valid": False,
                "errors": [f"Invalid JSON: {e}"],
                "warnings": [],
                "inferred_type": "",
            }

    if not isinstance(schema_json, dict):
        return {
            "is_valid": False,
            "errors": ["Schema must be a JSON object."],
            "warnings": [],
            "inferred_type": "",
        }

    # Check @context
    context = schema_json.get("@context", "")
    if context != "https://schema.org":
        if not context:
            errors.append("Missing @context. Must be 'https://schema.org'.")
        else:
            warnings.append(f"@context is '{context}', expected 'https://schema.org'.")

    # Identify type
    inferred = schema_json.get("@type", schema_type or "")
    if not inferred:
        errors.append("No @type specified and no schema_type provided.")
        return {
            "is_valid": False,
            "errors": errors,
            "warnings": warnings,
            "inferred_type": "",
        }

    # Check required fields
    expected_required = _SCHEMA_REQUIRED_FIELDS.get(inferred, [])
    for field in expected_required:
        if field not in schema_json or schema_json[field] is None:
            errors.append(f"Missing required field: '{field}' for type '{inferred}'.")

    # Check URL formats for 'url' and 'image' fields
    for field in ("url", "image"):
        val = schema_json.get(field, "")
        if val and not _is_valid_url(str(val)):
            warnings.append(f"Field '{field}' does not appear to be a valid URL: '{val}'.")

    # Validate specific types
    if inferred == "Product":
        offers = schema_json.get("offers", {})
        if offers:
            if "price" not in offers:
                errors.append("Product.offers missing 'price'.")
            if "priceCurrency" not in offers:
                errors.append("Product.offers missing 'priceCurrency'.")
            if "availability" not in offers:
                warnings.append("Product.offers missing 'availability'.")
        else:
            warnings.append("Product schema has no 'offers' block.")

    if inferred == "FAQPage":
        main_entity = schema_json.get("mainEntity", [])
        if not main_entity:
            errors.append("FAQPage.mainEntity is empty.")
        else:
            for i, entry in enumerate(main_entity):
                if not entry.get("name"):
                    errors.append(f"FAQPage.mainEntity[{i}] missing 'name' (question).")
                if not entry.get("acceptedAnswer", {}).get("text"):
                    errors.append(f"FAQPage.mainEntity[{i}] missing acceptedAnswer.text.")

    if inferred == "LocalBusiness":
        addr = schema_json.get("address", {})
        for field in ("streetAddress", "addressLocality", "addressCountry"):
            if not addr.get(field):
                errors.append(f"LocalBusiness.address missing '{field}'.")

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "inferred_type": inferred,
    }


# ──────────────────────────────────────────────
# Geo Optimization Plan
# ──────────────────────────────────────────────


def generate_geo_optimization_plan(
    url: str,
    page_data: dict,
    config: dict | None = None,
) -> dict:
    """
    Generate a comprehensive geo-optimization plan.

    Analyzes the page and recommends schemas, AI visibility improvements,
    and content optimizations for local/geo search.

    Args:
        url: page URL.
        page_data: dict with keys:
            - 'content_type': str (product, faq, howto, local, article)
            - 'product_info': dict (for Product schema)
            - 'faqs': list[dict] (for FAQ schema)
            - 'instructions': list[dict] (for HowTo schema)
            - 'business_info': dict (for LocalBusiness schema)
            - 'content': str (raw content)
            - 'categories': list[str]
            - 'target_location': str
        config: optional dict with:
            - 'include_schema': list[str] limit to specific types
            - 'ai_visibility': bool (default True)

    Returns:
        dict with full optimization plan.
    """
    config = config or {}
    content_type = page_data.get("content_type", "article")
    include_schema = config.get("include_schema", [])
    check_ai = config.get("ai_visibility", True)

    recommended_schemas: list[dict] = []

    # Determine which schemas to generate
    if (not include_schema or "Product" in include_schema) and "product_info" in page_data:
        try:
            product_schema = generate_product_schema(page_data["product_info"])
            recommended_schemas.append({
                "type": "Product",
                "schema": product_schema,
                "priority": "high",
                "reason": "Required for product pages to enable rich results.",
            })
        except ValueError as e:
            recommended_schemas.append({
                "type": "Product",
                "schema": None,
                "priority": "high",
                "reason": f"Cannot generate: {e}",
            })

    if (not include_schema or "FAQPage" in include_schema) and "faqs" in page_data:
        try:
            faq_schema = generate_faq_schema(page_data["faqs"])
            recommended_schemas.append({
                "type": "FAQPage",
                "schema": faq_schema,
                "priority": "medium",
                "reason": "FAQ schema enables rich snippet for Q&A content.",
            })
        except ValueError as e:
            recommended_schemas.append({
                "type": "FAQPage",
                "schema": None,
                "priority": "medium",
                "reason": f"Cannot generate: {e}",
            })

    if (not include_schema or "HowTo" in include_schema) and "instructions" in page_data:
        try:
            howto_schema = generate_howto_schema(page_data["instructions"])
            recommended_schemas.append({
                "type": "HowTo",
                "schema": howto_schema,
                "priority": "medium",
                "reason": "HowTo schema for step-by-step content.",
            })
        except ValueError as e:
            recommended_schemas.append({
                "type": "HowTo",
                "schema": None,
                "priority": "medium",
                "reason": f"Cannot generate: {e}",
            })

    if (not include_schema or "LocalBusiness" in include_schema) and "business_info" in page_data:
        try:
            biz_schema = generate_local_business_schema(page_data["business_info"])
            recommended_schemas.append({
                "type": "LocalBusiness",
                "schema": biz_schema,
                "priority": "high" if content_type == "local" else "medium",
                "reason": "LocalBusiness schema for local search visibility.",
            })
        except ValueError as e:
            recommended_schemas.append({
                "type": "LocalBusiness",
                "schema": None,
                "priority": "high" if content_type == "local" else "medium",
                "reason": f"Cannot generate: {e}",
            })

    # AI visibility checklist
    ai_visibility: list[dict] = []
    if check_ai:
        content = page_data.get("content", "")

        # Checklist items
        checks = [
            ("Clear page title", bool(re.search(r"<title[^>]*>", content))),
            ("Meta description present", bool(re.search(r'<meta\s+[^>]*name=["\']description["\']', content))),
            ("Open Graph tags", bool(re.search(r'<meta\s+[^>]*property=["\']og:', content))),
            ("Heading structure", bool(re.search(r"<h1[^>]*>", content))),
            ("Schema markup present", len(recommended_schemas) > 0),
            ("Alt text on images", bool(re.search(r'alt=["\'][^"\']+["\']', content))),
            ("Canonical URL", bool(re.search(r'<link\s+[^>]*rel=["\']canonical["\']', content))),
            ("Mobile viewport meta", bool(re.search(r'<meta\s+[^>]*name=["\']viewport["\']', content))),
        ]

        for label, passed in checks:
            ai_visibility.append({
                "check": label,
                "passed": passed,
                "status": "pass" if passed else "missing",
            })

        ai_visibility.append({
            "check": "Target location mentioned in content",
            "passed": "target_location" in page_data,
            "status": "pass" if "target_location" in page_data else "info",
        })

    # Content recommendations
    content_recommendations: list[dict] = []
    target_loc = page_data.get("target_location", "")
    categories = page_data.get("categories", [])

    if target_loc:
        content_recommendations.append({
            "type": "local_keyword",
            "recommendation": f"Include location-specific keywords for '{target_loc}' in headings, title, and body.",
            "priority": "high",
        })

    if categories:
        content_recommendations.append({
            "type": "category_content",
            "recommendation": f"Create dedicated landing pages for categories: {', '.join(categories[:5])}.",
            "priority": "medium",
        })

    if not bool(re.search(r"<h1[^>]*>", page_data.get("content", ""))):
        content_recommendations.append({
            "type": "h1",
            "recommendation": "Add an H1 heading containing the primary geo-targeted keyword.",
            "priority": "high",
        })

    return {
        "url": url,
        "content_type": content_type,
        "recommended_schemas": recommended_schemas,
        "ai_visibility_checklist": ai_visibility,
        "content_recommendations": content_recommendations,
        "summary": {
            "schemas_recommended": len(recommended_schemas),
            "schemas_generated": sum(1 for s in recommended_schemas if s.get("schema")),
            "ai_checks_passed": sum(1 for c in ai_visibility if c.get("passed")),
            "ai_checks_total": len(ai_visibility),
            "recommendations_count": len(content_recommendations),
        },
    }


def process(params: dict) -> dict:
    """Unified entry point for SkillRunner."""
    if "product" in params:
        product = dict(params["product"])
        # Normalize fields to match generate_product_schema expectations
        if "offers" not in product:
            product["offers"] = {
                "price": product.pop("price", 0),
                "priceCurrency": product.pop("currency", "USD"),
                "availability": "https://schema.org/InStock"
            }
        if isinstance(product.get("brand"), str):
            product["brand"] = {"name": product["brand"]}
        if "url" not in product:
            product["url"] = product.get("image", "")
        schema_json = generate_product_schema(product)
        return {"schema": schema_json, "type": "Product"}
    if "faqs" in params:
        schema_json = generate_faq_schema(params["faqs"])
        return {"schema": schema_json, "type": "FAQPage"}
    return {"error": "Missing required params (product or faqs)"}
