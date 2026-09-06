"""
Amazon Listing Optimizer - 核心分析逻辑

Amazon 产品 Listing 质量审计：标题、卖点、后端关键词、A+ Content 合规性检查。
"""

from __future__ import annotations

import math
import re
from typing import Any


# ──────────────────────────────────────────────
# Title Validation
# ──────────────────────────────────────────────

_TITLE_MAX_CHARS = 200
_TITLE_PROHIBITED_PATTERNS = [
    r"\b(?:free shipping|free|shipping|discount|sale|best|cheap|cheapest|guaranteed|warranty)\b",
]

# Common brand names to check in title
_COMMON_BRANDS_FOR_FLAGGING = [
    "amazon",
    "amazon's choice",
    "#1 best seller",
    "best seller",
    "hot new release",
    "limited time",
    "great deal",
    "exclusive",
]


def validate_title_length(title: str, max_chars: int = 200) -> dict:
    """
    Validate Amazon product title against length and content rules.

    Checks:
        - Total character count (max 200)
        - First 80 characters (mobile viewport)
        - Prohibited promotional language
        - Capitalization style
        - Brand stuffing indicators

    Args:
        title: Product title string
        max_chars: Maximum allowed characters (default 200)

    Returns:
        dict with:
            - 'is_valid': bool
            - 'total_length': int
            - 'status': str ('ok' | 'warning' | 'error')
            - 'issues': list[str]
            - 'suggestions': list[str]
    """
    issues: list[str] = []
    suggestions: list[str] = []
    total_length = len(title)

    # Length check
    if total_length > max_chars:
        issues.append(f"Title exceeds {max_chars} characters ({total_length})")
    elif total_length > max_chars * 0.9:
        issues.append(f"Title approaching {max_chars} character limit ({total_length})")

    if total_length < 80:
        issues.append(f"Title is short ({total_length} chars). Consider using more keyword space.")
    elif total_length < 30:
        issues.append(f"Title is too short ({total_length} chars). Amazon recommends 80-200 characters.")

    # Mobile viewport
    viewport_80 = title[:80]
    mobile_keywords = viewport_80.split()[:8]
    if len(mobile_keywords) < 3 or not mobile_keywords:
        issues.append("First 80 characters lack sufficient keywords for mobile viewport")

    # Prohibited patterns
    for pattern in _TITLE_PROHIBITED_PATTERNS:
        if re.search(pattern, title, re.IGNORECASE):
            issues.append(f"Contains promotional language (matches: '{pattern}')")

    # Brand/claim flags
    for brand in _COMMON_BRANDS_FOR_FLAGGING:
        if brand in title.lower():
            issues.append(f"Contains proprietary claim or promotional text: '{brand}'")

    # Capitalization check
    words = title.split()
    capped_count = sum(1 for w in words if w[0].isupper() if len(w) > 1)
    if capped_count < len(words) * 0.4 and len(words) > 3:
        suggestions.append("Ensure each major word starts with a capital letter (Amazon style)")

    # ALL CAPS check
    upper_words = sum(1 for w in words if w.isupper() and len(w) > 2)
    if upper_words > len(words) * 0.5:
        suggestions.append("Reduce all-capital words — avoid keyword stuffing appearance")

    # Pipe separator usage
    if "|" in title:
        suggestions.append("Avoid pipe '|' characters in title — use commas or dashes")

    # Status determination
    error_count = sum(1 for i in issues if "too short" in i or "exceeds" in i or "prohibited" in i)
    warning_count = len(issues) - error_count

    if error_count > 0:
        status = "error"
    elif warning_count > 0 or len(issues) > 0:
        status = "warning"
    else:
        status = "ok"

    return {
        "is_valid": error_count == 0,
        "total_length": total_length,
        "mobile_viewport_chars": len(viewport_80.strip()),
        "status": status,
        "issues": issues,
        "suggestions": suggestions,
    }


# ──────────────────────────────────────────────
# Keyword Extraction
# ──────────────────────────────────────────────


def extract_keywords_from_title(title: str) -> list[str]:
    """
    Extract key search terms from a product title.

    Uses simple heuristics: removes stopwords, extracts capitalized multi-word
    phrases, and identifies product attribute patterns.

    Args:
        title: Product title string

    Returns:
        list of extracted keyword phrases (lowercase, sorted by estimated importance)
    """
    if not title:
        return []

    stopwords = {
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "is",
        "it",
        "its",
        "this",
        "that",
        "from",
        "not",
        "be",
        "are",
        "was",
        "were",
        "has",
        "have",
        "had",
        "all",
        "each",
        "every",
        "no",
        "nor",
        "so",
        "too",
        "very",
        "just",
        "only",
    }

    # Split by common delimiters
    parts = re.split(r"[-–—|,;/]", title)
    keywords: list[str] = []

    for part in parts:
        part = part.strip()
        words = part.split()
        # Filter stopwords and short words
        significant = [w.lower() for w in words if w.lower() not in stopwords and len(w) > 1]
        if significant:
            keywords.append(" ".join(significant))

    # Also extract individual significant words
    all_words = re.findall(r"[A-Za-z0-9]+", title)
    all_filtered = [w.lower() for w in all_words if w.lower() not in stopwords and len(w) > 2]
    unique_words = list(dict.fromkeys(all_filtered))

    # Remove duplicates between phrases and individual words
    result_parts = keywords.copy()
    phrase_words = set(" ".join(keywords).split())
    for w in unique_words:
        if w not in phrase_words:
            result_parts.append(w)

    return result_parts


# ──────────────────────────────────────────────
# Bullet Point Scoring
# ──────────────────────────────────────────────

_BULLET_MAX_CHARS = 500  # Amazon recommended max per bullet


def score_bullet_points(bullets: list[str], product_info: dict | None = None) -> dict:
    """
    Score bullet points on benefits vs features, keyword inclusion, uniqueness, and length.

    Scoring dimensions:
        - Benefits vs Features ratio (30%)
        - Keyword coverage (25%)
        - Uniqueness between bullets (25%)
        - Length compliance (20%)

    Args:
        bullets: list of bullet point strings
        product_info: dict with optional keys 'keywords' (list[str]), 'core_benefits' (list[str])

    Returns:
        dict with:
            - 'overall_score': float (0-100)
            - 'bullet_scores': list[dict] per bullet
            - 'issues': list[str]
            - 'suggestions': list[str]
    """
    if not bullets:
        return {
            "overall_score": 0.0,
            "bullet_scores": [],
            "issues": ["No bullet points provided"],
            "suggestions": ["Add at least 5 bullet points"],
        }

    product_info = product_info or {}
    target_keywords = [k.lower() for k in product_info.get("keywords", [])]
    core_benefits = [b.lower() for b in product_info.get("core_benefits", [])]

    bullet_scores: list[dict] = []
    all_scores = []
    issues: list[str] = []
    suggestions: list[str] = []

    # Benefit signal words
    benefit_words = {
        "designed",
        "perfect",
        "ideal",
        "great",
        "easy",
        "effortless",
        "convenient",
        "comfortable",
        "durable",
        "reliable",
        "portable",
        "lightweight",
        "compact",
        "versatile",
        "adjustable",
        "ergonomic",
        "safe",
        "secure",
        "fast",
        "quick",
        "efficient",
        "powerful",
        "quiet",
        "smooth",
        "built",
        "engineered",
    }

    # Feature signal words
    feature_words = {
        "made",
        "includes",
        "contains",
        "features",
        "material",
        "dimensions",
        "weight",
        "color",
        "size",
        "capacity",
        "battery",
        "wattage",
        "voltage",
        "frequency",
        "compatible",
        "specification",
    }

    for i, bullet in enumerate(bullets):
        bullet_lower = bullet.lower()
        words = set(re.findall(r"[a-z]+", bullet_lower))

        # Benefits vs features
        benefit_count = len(words & benefit_words)
        feature_count = len(words & feature_words)
        total_signal = benefit_count + feature_count
        benefit_ratio = benefit_count / total_signal if total_signal > 0 else 0.5

        # Keyword coverage
        keyword_hits = sum(1 for kw in target_keywords if kw in bullet_lower)
        keyword_coverage = keyword_hits / max(len(target_keywords), 1)

        # Length compliance
        length = len(bullet)
        length_score = 100.0
        if length > _BULLET_MAX_CHARS:
            length_score = 50.0
        elif length < 30:
            length_score = 40.0
        elif length < 80:
            length_score = 70.0

        # Score calculation
        bscore = (
            benefit_ratio * 30 + keyword_coverage * 25 + length_score * 0.20
        ) / 0.75  # normalize to 100

        if len(target_keywords) == 0:
            bscore = (benefit_ratio * 30 + length_score * 0.20) / 0.50

        bullet_scores.append(
            {
                "bullet_number": i + 1,
                "length": length,
                "benefit_ratio": round(benefit_ratio, 2),
                "keyword_hits": keyword_hits,
                "score": round(bscore, 1),
                "text": bullet[:80] + ("..." if len(bullet) > 80 else ""),
            }
        )
        all_scores.append(bscore)

    # Cross-bullet uniqueness check
    word_sets = [set(re.findall(r"[a-z]+", b.lower())) for b in bullets]
    for i in range(len(bullets)):
        for j in range(i + 1, len(bullets)):
            overlap = word_sets[i] & word_sets[j]
            if len(overlap) > max(len(word_sets[i]), len(word_sets[j])) * 0.6:
                issues.append(f"Bullets {i+1} and {j+1} have high content overlap")

    # Overall score
    overall = sum(all_scores) / len(all_scores) if all_scores else 0.0

    # Overall issues
    if len(bullets) < 5:
        issues.append(f"Only {len(bullets)} bullet points (Amazon recommends 5)")
    if overall < 60:
        suggestions.append("Improve benefit-to-feature ratio — customers buy benefits, not specs")
    if not any(b.get("keyword_hits", 0) > 0 for b in bullet_scores):
        suggestions.append("Include target keywords in bullet points for search relevance")

    return {
        "overall_score": round(overall, 1),
        "bullet_scores": bullet_scores,
        "issues": issues,
        "suggestions": suggestions,
    }


# ──────────────────────────────────────────────
# Backend Keywords
# ──────────────────────────────────────────────


def format_backend_keywords(keywords: list[str]) -> str:
    """
    Format backend search terms for Amazon Seller Central.

    Rules:
        - Remove duplicates (case-insensitive)
        - No commas or punctuation
        - No brand names (single-word only filter is a simplification)
        - Total length < 250 bytes
        - Single space between terms
        - Lowercase

    Args:
        keywords: list of keyword strings

    Returns:
        Formatted backend keyword string
    """
    if not keywords:
        return ""

    seen: set[str] = set()
    result_words: list[str] = []

    def normalize(word: str) -> str:
        """Normalize a keyword for dedup."""
        return re.sub(r"[^a-z0-9]", "", word.lower())

    for kw in keywords:
        # Split multi-word phrases
        parts = kw.split()
        for part in parts:
            cleaned = re.sub(r"[^a-zA-Z0-9\s'-]", "", part).strip().lower()
            if not cleaned or len(cleaned) <= 1:
                continue
            norm = normalize(part)
            if norm not in seen:
                seen.add(norm)
                result_words.append(cleaned)

    # Concatenate
    result = " ".join(result_words)

    # Enforce < 250 bytes (UTF-8)
    while len(result.encode("utf-8")) > 250 and result_words:
        result_words.pop()
        result = " ".join(result_words)
        if not result_words:
            break

    return result


# ──────────────────────────────────────────────
# A+ Content Validation
# ──────────────────────────────────────────────

_APLUS_MAX_MODULES = 7
_APLUS_MAX_TEXT_LENGTH = 500  # per text block
_APLUS_MIN_IMAGE_ALT_CHARS = 10


def validate_aplus_content(aplus_sections: list[dict]) -> dict:
    """
    Validate A+ Content against Amazon guidelines.

    Checks:
        - Module count (max 7)
        - Text length per module
        - Image alt text presence and length
        - Section variety

    Args:
        aplus_sections: list of dicts with 'type', 'text', 'image_alt_text' keys

    Returns:
        dict with:
            - 'is_compliant': bool
            - 'module_count': int
            - 'issues': list[str]
            - 'suggestions': list[str]
    """
    issues: list[str] = []
    suggestions: list[str] = []

    if not aplus_sections:
        return {
            "is_compliant": False,
            "module_count": 0,
            "issues": ["No A+ Content sections provided"],
            "suggestions": ["Add A+ Content to improve conversion rate"],
        }

    module_count = len(aplus_sections)

    # Max modules
    if module_count > _APLUS_MAX_MODULES:
        issues.append(f"Too many modules ({module_count}, max {_APLUS_MAX_MODULES})")
    elif module_count < 3:
        suggestions.append(f"Consider more modules ({module_count} of {_APLUS_MAX_MODULES} max)")

    # Module type variety
    types_seen: set[str] = set()
    for section in aplus_sections:
        section_type = section.get("type", "")
        section_text = (section.get("text") or "").strip()
        section_alt = (section.get("image_alt_text") or "").strip()

        types_seen.add(section_type)

        # Text length
        if section_text and len(section_text) > _APLUS_MAX_TEXT_LENGTH:
            issues.append(f"Section '{section_type}' text exceeds {_APLUS_MAX_TEXT_LENGTH} characters")

        # Image alt text
        if section_alt and len(section_alt) < _APLUS_MIN_IMAGE_ALT_CHARS:
            issues.append(f"Section '{section_type}' image alt text is too short ({len(section_alt)} chars)")
        elif not section_alt and section_type not in ("header",):
            suggestions.append(f"Section '{section_type}' is missing image alt text")

    if len(types_seen) < 2:
        suggestions.append("Use diverse module types (comparison chart, feature highlights, etc.)")

    return {
        "is_compliant": len(issues) == 0,
        "module_count": module_count,
        "unique_module_types": list(types_seen),
        "issues": issues,
        "suggestions": suggestions,
    }


# ──────────────────────────────────────────────
# Full Audit
# ──────────────────────────────────────────────


def generate_listing_audit(product_info: dict, listing_data: dict) -> dict:
    """
    Full Amazon listing audit with per-section scores and improvement suggestions.

    Args:
        product_info: dict with 'name', 'category', 'keywords', 'core_benefits'
        listing_data: dict with 'title', 'bullets' (list[str]), 'description',
                       'backend_keywords' (list[str]), 'aplus' (list[dict])

    Returns:
        dict with:
            - 'overall_score': float
            - 'sections': dict of section name -> audit result
            - 'priority_actions': list[dict]
            - 'summary': dict
    """
    title = listing_data.get("title", "")
    bullets = listing_data.get("bullets", [])
    backend_keywords = listing_data.get("backend_keywords", [])
    aplus_sections = listing_data.get("aplus", [])

    # Title audit
    title_audit = validate_title_length(title)

    # Keyword extraction
    extracted_keywords = extract_keywords_from_title(title)

    # Bullet point scoring
    bullet_audit = score_bullet_points(bullets, product_info)

    # Backend keyword formatting
    formatted_backend = format_backend_keywords(backend_keywords)
    backend_size = len(formatted_backend.encode("utf-8"))

    # A+ Content validation
    aplus_audit = validate_aplus_content(aplus_sections)

    # Overall score (weighted average)
    score_weights = {"title": 0.25, "bullets": 0.30, "backend_keywords": 0.15, "aplus": 0.15, "keyword_extraction": 0.15}

    # Derive numeric scores
    title_score = 100.0 if title_audit["status"] == "ok" else (60.0 if title_audit["status"] == "warning" else 30.0)
    bullet_score = bullet_audit.get("overall_score", 50.0)
    backend_score = 100.0 if backend_size <= 250 else 40.0
    aplus_score = 100.0 if aplus_audit["is_compliant"] else (60.0 if len(aplus_audit["issues"]) <= 2 else 30.0)
    keyword_score = min(100.0, len(extracted_keywords) * 10) if extracted_keywords else 20.0

    overall = (
        title_score * score_weights["title"]
        + bullet_score * score_weights["bullets"]
        + backend_score * score_weights["backend_keywords"]
        + aplus_score * score_weights["aplus"]
        + keyword_score * score_weights["keyword_extraction"]
    )

    # Priority actions
    priority_actions: list[dict] = []
    if title_audit["status"] != "ok":
        priority_actions.append({
            "section": "title",
            "priority": "high",
            "action": "Fix title issues",
            "details": title_audit["issues"],
        })
    if bullet_score < 70:
        priority_actions.append({
            "section": "bullets",
            "priority": "high",
            "action": "Improve bullet points: add benefits, include keywords",
            "details": bullet_audit.get("suggestions", []),
        })
    if backend_size > 250:
        priority_actions.append({
            "section": "backend_keywords",
            "priority": "medium",
            "action": f"Backend keywords exceed 250 bytes ({backend_size}). Trim to fit.",
            "details": [],
        })
    if not aplus_audit["is_compliant"]:
        priority_actions.append({
            "section": "aplus",
            "priority": "medium",
            "action": "Fix A+ Content compliance issues",
            "details": aplus_audit["issues"],
        })

    return {
        "overall_score": round(overall, 1),
        "sections": {
            "title": {
                "score": title_score,
                "audit": title_audit,
                "extracted_keywords": extracted_keywords[:10],
            },
            "bullets": bullet_audit,
            "backend_keywords": {
                "score": backend_score,
                "original_count": len(backend_keywords),
                "byte_size": backend_size,
                "formatted": formatted_backend,
            },
            "aplus": aplus_audit,
        },
        "priority_actions": sorted(priority_actions, key=lambda x: 0 if x["priority"] == "high" else 1),
        "summary": {
            "product_name": product_info.get("name", ""),
            "category": product_info.get("category", ""),
            "keyword_count": len(extracted_keywords),
            "overall_rating": "Excellent" if overall >= 85 else ("Good" if overall >= 70 else "Needs Improvement"),
        },
    }
