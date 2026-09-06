#!/usr/bin/env python3
"""
seo-content-optimizer - Content SEO optimization core logic.

Analyzes keyword density, heading structure, readability, internal linking,
and generates content optimization reports with prioritized fixes.
"""

from __future__ import annotations

import math
import re
from typing import Any


# ──────────────────────────────────────────────
# Keyword Density Analysis
# ──────────────────────────────────────────────


def calculate_keyword_density(content: str, keywords: list[str]) -> dict:
    """
    Calculate keyword density statistics for given content.

    Args:
        content: plain text or HTML content to analyze.
        keywords: list of target keywords/phrases.

    Returns:
        dict with:
            - 'keyword_analysis': list of per-keyword stats:
                - 'keyword': str
                - 'density_pct': float
                - 'term_frequency': int
                - 'prominence_pct': float (occurrences in first 100 words)
                - 'in_title': bool
                - 'in_h1': bool
            - 'total_word_count': int
            - 'total_keyword_occurrences': int
            - 'overall_density_pct': float
            - 'suggestion': str
    """
    # Strip HTML if present
    text = re.sub(r"<[^>]+>", " ", content)
    text = re.sub(r"\s+", " ", text).strip()

    # Extract title and first h1
    title_match = re.search(r"<title[^>]*>(.*?)</title>", content, re.IGNORECASE | re.DOTALL)
    title = re.sub(r"<[^>]+>", "", title_match.group(1)).strip().lower() if title_match else ""

    h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", content, re.IGNORECASE | re.DOTALL)
    h1 = re.sub(r"<[^>]+>", "", h1_match.group(1)).strip().lower() if h1_match else ""

    words = text.split()
    total_words = len(words)
    first_100_words = set(w.lower() for w in words[:100])

    results: list[dict] = []
    total_occurrences = 0

    for keyword in keywords:
        kw_lower = keyword.lower().strip()
        if not kw_lower:
            continue

        # Term frequency
        tf = sum(1 for w in words if w.lower() == kw_lower)

        # Also check phrase matches for multi-word keywords
        if " " in kw_lower:
            phrase_count = len(re.findall(re.escape(kw_lower), text, re.IGNORECASE))
            tf = max(tf, phrase_count)

        # Density
        density = round((tf / total_words) * 100, 2) if total_words > 0 else 0.0

        # Prominence (in first 100 words)
        prominence = sum(1 for w in words[:100] if kw_lower in w.lower())
        prominence_pct = round((prominence / len(first_100_words)) * 100, 1) if first_100_words else 0.0

        # Title inclusion
        in_title = kw_lower in title

        # H1 inclusion
        in_h1 = kw_lower in h1

        total_occurrences += tf

        results.append({
            "keyword": keyword,
            "density_pct": density,
            "term_frequency": tf,
            "prominence_pct": prominence_pct,
            "in_title": in_title,
            "in_h1": in_h1,
        })

    overall_density = round((total_occurrences / total_words) * 100, 2) if total_words > 0 else 0.0

    # Suggestion based on overall density
    if overall_density > 5:
        suggestion = "Keyword stuffing detected. Reduce keyword density to 1-3% range."
    elif overall_density < 0.5 and total_occurrences > 0:
        suggestion = "Keyword density is low. Consider increasing target keyword usage."
    elif overall_density < 0.1:
        suggestion = "Very few target keywords found. Add more relevant keyword usage."
    else:
        suggestion = "Keyword density is within acceptable range (1-3%)."

    return {
        "keyword_analysis": results,
        "total_word_count": total_words,
        "total_keyword_occurrences": total_occurrences,
        "overall_density_pct": overall_density,
        "suggestion": suggestion,
    }


# ──────────────────────────────────────────────
# Heading Structure Analysis
# ──────────────────────────────────────────────


def analyze_heading_structure(content: str) -> dict:
    """
    Analyze heading hierarchy in HTML content.

    Args:
        content: HTML content string.

    Returns:
        dict with:
            - 'hierarchy': list of extracted headings with level and text
            - 'has_single_h1': bool
            - 'nesting_valid': bool
            - 'nesting_issues': list[str]
            - 'keywords_in_headings': list[str]
            - 'h1_count': int
    """
    headings: list[dict] = []

    for tag in ["h1", "h2", "h3"]:
        pattern = re.compile(rf"<{tag}[^>]*>(.*?)</{tag}>", re.IGNORECASE | re.DOTALL)
        for match in pattern.finditer(content):
            text = re.sub(r"<[^>]+>", "", match.group(1)).strip()
            headings.append({
                "level": tag,
                "text": text,
            })

    # Check for only one h1
    h1_count = sum(1 for h in headings if h["level"] == "h1")
    has_single_h1 = h1_count == 1

    # Validate nesting logic
    nesting_issues: list[str] = []
    if h1_count == 0:
        nesting_issues.append("No H1 tag found. Every page should have exactly one H1.")
    elif h1_count > 1:
        nesting_issues.append(f"Multiple H1 tags found ({h1_count}). Use exactly one H1 per page.")

    for i, heading in enumerate(headings):
        level_num = int(heading["level"][1])
        if i > 0:
            prev_level = int(headings[i - 1]["level"][1])
            if level_num > prev_level + 1:
                nesting_issues.append(
                    f"Heading level jumps from {headings[i-1]['level']} to {heading['level']}: "
                    f"'{headings[i-1]['text']}' -> '{heading['text']}'"
                )

    nesting_valid = len(nesting_issues) == 0

    return {
        "hierarchy": headings,
        "h1_count": h1_count,
        "has_single_h1": has_single_h1,
        "nesting_valid": nesting_valid,
        "nesting_issues": nesting_issues,
    }


# ──────────────────────────────────────────────
# Readability Analysis
# ──────────────────────────────────────────────


def _is_chinese(text: str) -> bool:
    """Detect if text is primarily Chinese."""
    chinese_chars = len(re.findall(r"[一-鿿]", text))
    return chinese_chars > len(text) * 0.1 if len(text) > 0 else False


def _count_syllables(word: str) -> int:
    """Estimate syllable count for an English word."""
    word = word.lower().strip()
    if not word:
        return 0
    # Basic heuristic: vowel groups
    vowels = "aeiouy"
    count = 0
    prev_is_vowel = False
    for char in word:
        is_vowel = char in vowels
        if is_vowel and not prev_is_vowel:
            count += 1
        prev_is_vowel = is_vowel
    return max(count, 1)


def _count_sentences(text: str) -> int:
    """Count sentences in text."""
    return max(len(re.findall(r"[.!?]+", text)), 1)


def _passive_voice_ratio(text: str) -> float:
    """Estimate passive voice ratio in English text."""
    passive_patterns = re.findall(
        r"\b(?:is|are|was|were|be|been|being|am)\s+\w+ed\b",
        text, re.IGNORECASE,
    )
    total_verbs = len(re.findall(r"\b\w+(?:s|ed|ing|en)\b", text, re.IGNORECASE))
    return round(len(passive_patterns) / max(total_verbs, 1) * 100, 1)


def calculate_readability(content: str) -> dict:
    """
    Calculate readability scores for content.

    For English: Flesch Reading Ease score.
    For Chinese: character density per sentence.

    Args:
        content: plain text or HTML content.

    Returns:
        dict with:
            - 'score': float (Flesch RE for English, char density for Chinese)
            - 'method': str ('flesch_reading_ease' | 'chinese_char_density')
            - 'interpretation': str
            - 'avg_sentence_length': float
            - 'avg_paragraph_length': float
            - 'passive_voice_ratio': float
            - 'total_sentences': int
            - 'total_words': int
            - 'total_paragraphs': int
    """
    text = re.sub(r"<[^>]+>", " ", content)
    text = re.sub(r"\s+", " ", text).strip()

    if not text:
        return {
            "score": 0,
            "method": "unknown",
            "interpretation": "No content to analyze.",
            "avg_sentence_length": 0,
            "avg_paragraph_length": 0,
            "passive_voice_ratio": 0,
            "total_sentences": 0,
            "total_words": 0,
            "total_paragraphs": 0,
        }

    is_chinese = _is_chinese(text)
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    num_sentences = max(len(sentences), 1)
    words = [w for w in text.split() if w]
    num_words = max(len(words), 1)

    # Paragraphs (split by double newline)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    num_paragraphs = max(len(paragraphs), 1)

    avg_sentence_len = round(num_words / num_sentences, 1)
    avg_paragraph_len = round(num_words / num_paragraphs, 1)

    if is_chinese:
        # Chinese: character density per sentence
        total_chars = len(re.findall(r"[一-鿿]", text))
        score = round(total_chars / num_sentences, 1)
        method = "chinese_char_density"

        if score <= 20:
            interpretation = "Very easy to read (simple Chinese)."
        elif score <= 40:
            interpretation = "Easy to read (moderate Chinese)."
        elif score <= 60:
            interpretation = "Moderately difficult to read."
        else:
            interpretation = "Difficult to read (dense Chinese)."
    else:
        # English: Flesch Reading Ease
        total_syllables = sum(_count_syllables(w) for w in words)
        score = round(
            206.835 - 1.015 * (num_words / num_sentences)
            - 84.6 * (total_syllables / num_words),
            1,
        )
        method = "flesch_reading_ease"

        if score >= 90:
            interpretation = "Very easy to read (5th grade level)."
        elif score >= 80:
            interpretation = "Easy to read (6th grade level)."
        elif score >= 70:
            interpretation = "Fairly easy to read (7th grade level)."
        elif score >= 60:
            interpretation = "Plain English (8th-9th grade level)."
        elif score >= 50:
            interpretation = "Fairly difficult (10th-12th grade level)."
        elif score >= 30:
            interpretation = "Difficult (college level)."
        else:
            interpretation = "Very difficult (graduate level)."

    passive_ratio = _passive_voice_ratio(text)

    return {
        "score": score,
        "method": method,
        "interpretation": interpretation,
        "avg_sentence_length": avg_sentence_len,
        "avg_paragraph_length": avg_paragraph_len,
        "passive_voice_ratio": passive_ratio,
        "total_sentences": num_sentences,
        "total_words": num_words,
        "total_paragraphs": num_paragraphs,
    }


# ──────────────────────────────────────────────
# Internal Linking Analysis
# ──────────────────────────────────────────────


def analyze_internal_linking(content: str, site_links: list[dict] | None = None) -> dict:
    """
    Analyze internal linking structure within content.

    Args:
        content: HTML content string.
        site_links: optional list of all site links for orphan page detection.
            Each dict with keys: 'url', 'incoming_links' (int), 'title'.

    Returns:
        dict with:
            - 'internal_links': list of extracted internal link dicts
            - 'internal_link_count': int
            - 'anchor_texts': list of anchor text strings
            - 'anchor_text_variety_score': float (0-100)
            - 'unique_anchor_texts': int
            - 'orphan_pages': list[str] (pages with no incoming links)
            - 'suggestion': str
    """
    link_pattern = re.compile(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)

    internal_links: list[dict] = []
    anchor_texts: list[str] = []

    for match in link_pattern.finditer(content):
        href = match.group(1).strip()
        anchor = re.sub(r"<[^>]+>", "", match.group(2)).strip()

        # Consider relative links and same-domain links as internal
        if href.startswith("/") or href.startswith("#") or (site_links and any(href == s.get("url") for s in site_links)):
            if not href.startswith("#"):
                internal_links.append({"url": href, "anchor": anchor})
                if anchor:
                    anchor_texts.append(anchor.lower())

    internal_count = len(internal_links)
    unique_anchor_texts = len(set(anchor_texts))

    # Anchor text variety score
    if internal_count <= 1:
        variety_score = 100.0 if internal_count == 1 else 0.0
    else:
        variety_score = round((unique_anchor_texts / internal_count) * 100, 1)

    # Orphan page detection
    orphan_pages: list[str] = []
    if site_links:
        for page in site_links:
            incoming = page.get("incoming_links", 0)
            if incoming == 0:
                orphan_pages.append(page.get("url", ""))

    # Suggestion
    if internal_count == 0:
        suggestion = "No internal links found. Add contextual internal links to improve SEO."
    elif internal_count < 3:
        suggestion = "Very few internal links. Consider adding more contextual links."
    elif variety_score < 50:
        suggestion = "Low anchor text variety. Use more diverse anchor text."
    else:
        suggestion = "Internal linking structure is healthy."

    return {
        "internal_links": internal_links,
        "internal_link_count": internal_count,
        "anchor_texts": list(set(anchor_texts)),
        "anchor_text_variety_score": variety_score,
        "unique_anchor_texts": unique_anchor_texts,
        "orphan_pages": orphan_pages,
        "suggestion": suggestion,
    }


# ──────────────────────────────────────────────
# Full Report
# ──────────────────────────────────────────────


def generate_content_optimization_report(
    content: str,
    keywords: list[str],
    config: dict | None = None,
) -> dict:
    """
    Generate a comprehensive content optimization report.

    Pipeline:
        1. Keyword density analysis
        2. Heading structure analysis
        3. Readability analysis
        4. Internal linking analysis (if site_links provided in config)

    Args:
        content: HTML or plain text content.
        keywords: list of target keywords.
        config: optional dict with:
            - 'site_links': list[dict] for internal link analysis
            - 'title': str (optional title override)

    Returns:
        dict with full content optimization report and prioritized fixes.
    """
    config = config or {}

    # Step 1: Keyword density
    density = calculate_keyword_density(content, keywords)

    # Step 2: Heading structure
    headings = analyze_heading_structure(content)

    # Step 3: Readability
    readability = calculate_readability(content)

    # Step 4: Internal linking (if site_links provided)
    internal_links = analyze_internal_linking(content, config.get("site_links"))

    # Build priority fixes
    critical_fixes: list[dict] = []
    important_fixes: list[dict] = []
    nice_fixes: list[dict] = []

    # Keyword: missing from title
    kw_not_in_title = [k["keyword"] for k in density.get("keyword_analysis", []) if not k.get("in_title")]
    if kw_not_in_title:
        critical_fixes.append({
            "issue": "Keywords missing from page title",
            "severity": 9,
            "details": f"Keywords not in <title>: {', '.join(kw_not_in_title[:5])}",
            "recommendation": "Include primary target keyword in the page title tag.",
        })

    # Keyword: missing from H1
    kw_not_in_h1 = [k["keyword"] for k in density.get("keyword_analysis", []) if not k.get("in_h1")]
    if kw_not_in_h1:
        critical_fixes.append({
            "issue": "Keywords missing from H1 heading",
            "severity": 8,
            "details": f"Keywords not in H1: {', '.join(kw_not_in_h1[:5])}",
            "recommendation": "Include primary keyword in the H1 heading.",
        })

    # Heading: no H1
    if not headings.get("has_single_h1"):
        critical_fixes.append({
            "issue": "Invalid H1 structure",
            "severity": 9,
            "details": f"H1 count: {headings.get('h1_count', 0)}. Issues: {'; '.join(headings.get('nesting_issues', []))}",
            "recommendation": "Ensure exactly one H1 tag containing the primary keyword.",
        })

    # Keyword density
    overall_density = density.get("overall_density_pct", 0)
    if overall_density > 5:
        critical_fixes.append({
            "issue": "Keyword stuffing detected",
            "severity": 7,
            "details": f"Keyword density is {overall_density}%. Recommended range: 1-3%.",
            "recommendation": "Reduce keyword frequency and use semantic variations instead.",
        })

    # Readability
    readability_score = readability.get("score", 0)
    if readability.get("method") == "flesch_reading_ease" and readability_score < 50:
        important_fixes.append({
            "issue": "Content is difficult to read",
            "severity": 6,
            "details": f"Flesch Reading Ease score: {readability_score}. "
                       f"Interpretation: {readability.get('interpretation', '')}",
            "recommendation": "Shorten sentences, use simpler vocabulary, and break up long paragraphs.",
        })

    # Passive voice
    passive_ratio = readability.get("passive_voice_ratio", 0)
    if passive_ratio > 20:
        important_fixes.append({
            "issue": "High passive voice usage",
            "severity": 5,
            "details": f"Passive voice ratio: {passive_ratio}% (recommended < 10%).",
            "recommendation": "Rewrite passive sentences in active voice for better readability.",
        })

    # Heading nesting issues
    if not headings.get("nesting_valid") and len(headings.get("nesting_issues", [])) > 1:
        important_fixes.append({
            "issue": "Heading hierarchy issues",
            "severity": 5,
            "details": f"Found {len(headings['nesting_issues'])} nesting issues.",
            "recommendation": "Fix heading level jumps; H2 should follow H1, H3 should follow H2.",
        })

    # Internal linking
    int_links = internal_links.get("internal_link_count", 0)
    if int_links == 0:
        important_fixes.append({
            "issue": "No internal links found",
            "severity": 6,
            "details": "Content has zero internal links to other pages.",
            "recommendation": "Add 2-5 contextual internal links to related content.",
        })
    elif int_links < 3:
        nice_fixes.append({
            "issue": "Low internal link count",
            "severity": 3,
            "details": f"Only {int_links} internal link(s) found. Recommended: 3-5 per article.",
            "recommendation": "Add more contextual internal links to improve topical authority.",
        })

    # Low keyword density
    if 0 < overall_density < 0.5:
        important_fixes.append({
            "issue": "Low target keyword presence",
            "severity": 4,
            "details": f"Keyword density is only {overall_density}%. Target 1-3%.",
            "recommendation": "Naturally incorporate target keywords throughout the content.",
        })

    # Anchor text variety
    anchor_variety = internal_links.get("anchor_text_variety_score", 100)
    if int_links >= 3 and anchor_variety < 50:
        nice_fixes.append({
            "issue": "Low anchor text variety",
            "severity": 3,
            "details": f"Anchor text variety score: {anchor_variety}%.",
            "recommendation": "Use more diverse anchor text instead of repeating the same phrases.",
        })

    summary = {
        "total_word_count": density.get("total_word_count", 0),
        "keyword_density_pct": overall_density,
        "readability_score": readability_score,
        "readability_method": readability.get("method", ""),
        "readability_interpretation": readability.get("interpretation", ""),
        "internal_links_count": int_links,
        "h1_count": headings.get("h1_count", 0),
        "heading_issues": len(headings.get("nesting_issues", [])),
        "critical_fixes": len(critical_fixes),
        "important_fixes": len(important_fixes),
        "nice_to_have_fixes": len(nice_fixes),
    }

    return {
        "keyword_density": density,
        "heading_structure": headings,
        "readability": readability,
        "internal_linking": internal_links,
        "priority_fixes": {
            "critical": sorted(critical_fixes, key=lambda x: x["severity"], reverse=True),
            "important": sorted(important_fixes, key=lambda x: x["severity"], reverse=True),
            "nice_to_have": sorted(nice_fixes, key=lambda x: x["severity"], reverse=True),
        },
        "summary": summary,
    }
