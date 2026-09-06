"""
Knowledge Similarity Analyzer - 核心分析逻辑

计算知识单元（SKU）间的语义相似度，分类关系类型，
检测重复/冲突/相关的 SKU 对。
"""

from __future__ import annotations

import re
from typing import Any, Optional


def jaccard_similarity(set1: set, set2: set) -> float:
    """计算两个集合的 Jaccard 相似度（自包含，无 skills._shared 依赖）"""
    if not set1 and not set2:
        return 0.0
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    return intersection / union if union else 0.0


# ──────────────────────────────────────────────
# Default Thresholds
# ──────────────────────────────────────────────

DEFAULT_THRESHOLDS: dict[str, float] = {
    "high": 0.85,
    "medium": 0.5,
    "low": 0.3,
}


# ──────────────────────────────────────────────
# Feature Extraction
# ──────────────────────────────────────────────


def _tokenize(text: str) -> set[str]:
    """
    将文本分词为单词集合（用于 Jaccard 计算）。

    对中文按字符分词（考虑 2-gram 以捕获语义），
    对英文按空格和标点分词。

    Args:
        text: 输入文本

    Returns:
        set[str]: 分词后的集合
    """
    if not text:
        return set()

    text = text.lower().strip()

    # Split on whitespace and punctuation
    tokens: list[str] = []

    # Extract English words
    en_words = re.findall(r"[a-z]+(?:'[a-z]+)?", text)
    tokens.extend(en_words)

    # Extract Chinese characters (treat each char as a token, but also create bigrams)
    chinese_chars = re.findall(r"[一-鿿]", text)
    tokens.extend(chinese_chars)

    # Create Chinese bigrams for better semantic capture
    if len(chinese_chars) >= 2:
        bigrams = [
            chinese_chars[i] + chinese_chars[i + 1]
            for i in range(len(chinese_chars) - 1)
        ]
        tokens.extend(bigrams)

    # Filter out empty tokens
    return {t for t in tokens if t}


def extract_similarity_features(sku: dict[str, Any]) -> dict[str, Any]:
    """
    从 SKU 中提取标准化特征，用于相似度计算。

    Args:
        sku: SKU 字典，应包含 applicable_objective, core_logic,
             expected_output, tags 等字段

    Returns:
        dict: 提取的特征，包含:
            - anchor_text: 标准化后的 applicable_objective
            - logic_text: 标准化后的 core_logic
            - outcome_text: 标准化后的 expected_output
            - tags_set: 标签集合
            - anchor_tokens: 分词后的集合（用于 Jaccard 计算）
            - logic_tokens: 分词后的集合
            - outcome_tokens: 分词后的集合
    """
    if not sku:
        return {
            "anchor_text": "",
            "logic_text": "",
            "outcome_text": "",
            "tags_set": set(),
            "anchor_tokens": set(),
            "logic_tokens": set(),
            "outcome_tokens": set(),
        }

    # Extract and normalize text fields
    anchor_text = (sku.get("applicable_objective") or "").strip().lower()
    logic_text = (sku.get("core_logic") or "").strip().lower()
    outcome_text = (sku.get("expected_output") or "").strip().lower()

    # Extract tags
    raw_tags = sku.get("tags") or []
    tags_set: set[str] = set()
    for tag in raw_tags:
        if isinstance(tag, str):
            tags_set.add(tag.strip().lower())

    # Deduplicate tags
    deduped_tags: set[str] = set()
    tag_list = sorted(tags_set)
    for i, tag in enumerate(tag_list):
        is_dup = False
        for j in range(i):
            if tag == tag_list[j] or (
                len(tag) > 2 and tag in tag_list[j]
            ):
                is_dup = True
                break
        if not is_dup:
            deduped_tags.add(tag)

    return {
        "anchor_text": anchor_text,
        "logic_text": logic_text,
        "outcome_text": outcome_text,
        "tags_set": deduped_tags,
        "anchor_tokens": _tokenize(anchor_text),
        "logic_tokens": _tokenize(logic_text),
        "outcome_tokens": _tokenize(outcome_text),
    }


# ──────────────────────────────────────────────
# Similarity Calculations
# ──────────────────────────────────────────────


def calculate_anchor_similarity(sku1: dict[str, Any], sku2: dict[str, Any]) -> float:
    """
    计算两个 SKU 的 Anchor（适用目标）相似度。

    基于 applicable_objective 的 Jaccard 相似度。

    Args:
        sku1: 第一个 SKU
        sku2: 第二个 SKU

    Returns:
        float: 相似度 (0.0-1.0)
    """
    feat1 = extract_similarity_features(sku1)
    feat2 = extract_similarity_features(sku2)

    return jaccard_similarity(feat1["anchor_tokens"], feat2["anchor_tokens"])


def calculate_logic_similarity(sku1: dict[str, Any], sku2: dict[str, Any]) -> float:
    """
    计算两个 SKU 的 Logic（核心逻辑）相似度。

    基于 core_logic 的 Jaccard 相似度。

    Args:
        sku1: 第一个 SKU
        sku2: 第二个 SKU

    Returns:
        float: 相似度 (0.0-1.0)
    """
    feat1 = extract_similarity_features(sku1)
    feat2 = extract_similarity_features(sku2)

    return jaccard_similarity(feat1["logic_tokens"], feat2["logic_tokens"])


def calculate_outcome_similarity(sku1: dict[str, Any], sku2: dict[str, Any]) -> float:
    """
    计算两个 SKU 的 Outcome（预期输出）相似度。

    基于 expected_output 的 Jaccard 相似度。

    Args:
        sku1: 第一个 SKU
        sku2: 第二个 SKU

    Returns:
        float: 相似度 (0.0-1.0)
    """
    feat1 = extract_similarity_features(sku1)
    feat2 = extract_similarity_features(sku2)

    return jaccard_similarity(feat1["outcome_tokens"], feat2["outcome_tokens"])


# ──────────────────────────────────────────────
# Relationship Classification
# ──────────────────────────────────────────────


def classify_relationship(
    anchor_sim: float,
    logic_sim: float,
    outcome_sim: float,
    thresholds: Optional[dict[str, float]] = None,
) -> str:
    """
    根据多维相似度对两个 SKU 的关系进行分类。

    分类规则:
        - DUPLICATE: 所有维度 > high (默认 0.85)
        - CONFLICT: anchor > medium 且 outcome < low
        - RELATED: anchor > medium 或 logic > medium
        - INDEPENDENT: 所有维度 < low

    Args:
        anchor_sim: Anchor 相似度
        logic_sim: Logic 相似度
        outcome_sim: Outcome 相似度
        thresholds: 阈值字典，包含:
            - high: 重复判定阈值（默认 0.85）
            - medium: 相关判定阈值（默认 0.5）
            - low: 独立判定阈值（默认 0.3）

    Returns:
        str: 关系类型: DUPLICATE | CONFLICT | RELATED | INDEPENDENT
    """
    if thresholds is None:
        thresholds = dict(DEFAULT_THRESHOLDS)

    high = thresholds.get("high", 0.85)
    medium = thresholds.get("medium", 0.5)
    low = thresholds.get("low", 0.3)

    # DUPLICATE: all dimensions highly similar
    if anchor_sim > high and logic_sim > high and outcome_sim > high:
        return "DUPLICATE"

    # CONFLICT: similar anchor but very different outcome
    if anchor_sim > medium and outcome_sim < low:
        return "CONFLICT"

    # RELATED: similar anchor or logic
    if anchor_sim > medium or logic_sim > medium:
        return "RELATED"

    # INDEPENDENT: all dimensions dissimilar
    return "INDEPENDENT"


# ──────────────────────────────────────────────
# Pairwise & Batch Analysis
# ──────────────────────────────────────────────


def analyze_pair(
    sku1: dict[str, Any],
    sku2: dict[str, Any],
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    对两个 SKU 进行完整的成对相似度分析。

    Args:
        sku1: 第一个 SKU
        sku2: 第二个 SKU
        config: 配置字典（可选），支持:
            - thresholds: 阈值配置

    Returns:
        dict: 分析结果，包含:
            - sku1_id / sku2_id: SKU 标识
            - similarities: 各维度相似度
            - relationship: 关系类型
            - combined_score: 加权综合得分
    """
    if config is None:
        config = {}

    thresholds = config.get("thresholds", DEFAULT_THRESHOLDS)

    anchor_sim = calculate_anchor_similarity(sku1, sku2)
    logic_sim = calculate_logic_similarity(sku1, sku2)
    outcome_sim = calculate_outcome_similarity(sku1, sku2)
    relationship = classify_relationship(anchor_sim, logic_sim, outcome_sim, thresholds)

    # Combined score: weighted average
    combined = 0.4 * anchor_sim + 0.35 * logic_sim + 0.25 * outcome_sim

    return {
        "sku1_id": sku1.get("id", sku1.get("title", "unknown_1")),
        "sku2_id": sku2.get("id", sku2.get("title", "unknown_2")),
        "similarities": {
            "anchor": round(anchor_sim, 4),
            "logic": round(logic_sim, 4),
            "outcome": round(outcome_sim, 4),
            "combined": round(combined, 4),
        },
        "relationship": relationship,
        "combined_score": round(combined, 4),
    }


def analyze_batch(
    skus: list[dict[str, Any]],
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    对 SKU 列表进行批量相似度分析。

    计算所有配对，检测重复组和冲突组，生成汇总统计。

    Args:
        skus: SKU 列表
        config: 配置字典（可选），支持:
            - thresholds: 阈值配置
            - max_pairs: 最大配对数量（默认 0 = 不限）

    Returns:
        dict: 批量分析结果
    """
    if config is None:
        config = {}

    thresholds = config.get("thresholds", DEFAULT_THRESHOLDS)
    max_pairs = config.get("max_pairs", 0)

    pairs: list[dict[str, Any]] = []
    duplicate_groups: list[list[dict[str, Any]]] = []
    conflict_groups: list[list[dict[str, Any]]] = []

    n = len(skus)
    pair_count = 0

    for i in range(n):
        for j in range(i + 1, n):
            if max_pairs > 0 and pair_count >= max_pairs:
                break

            pair_result = analyze_pair(skus[i], skus[j], config)
            pairs.append(pair_result)
            pair_count += 1

            if pair_result["relationship"] == "DUPLICATE":
                # Try to add to existing duplicate group
                added_to_group = False
                for group in duplicate_groups:
                    group_ids = {s["id"] for s in group}
                    if (
                        pair_result["sku1_id"] in group_ids
                        or pair_result["sku2_id"] in group_ids
                    ):
                        for sku in (skus[i], skus[j]):
                            if sku.get("id") not in group_ids:
                                group.append(sku)
                        added_to_group = True
                        break
                if not added_to_group:
                    duplicate_groups.append([skus[i], skus[j]])

            elif pair_result["relationship"] == "CONFLICT":
                added_to_group = False
                for group in conflict_groups:
                    group_ids = {s["id"] for s in group}
                    if (
                        pair_result["sku1_id"] in group_ids
                        or pair_result["sku2_id"] in group_ids
                    ):
                        for sku in (skus[i], skus[j]):
                            if sku.get("id") not in group_ids:
                                group.append(sku)
                        added_to_group = True
                        break
                if not added_to_group:
                    conflict_groups.append([skus[i], skus[j]])

    # Summary statistics
    relationships = [p["relationship"] for p in pairs]
    total_pairs = len(pairs)

    summary: dict[str, Any] = {
        "total_skus": n,
        "total_pairs_analyzed": total_pairs,
        "duplicate_pairs": relationships.count("DUPLICATE"),
        "conflict_pairs": relationships.count("CONFLICT"),
        "related_pairs": relationships.count("RELATED"),
        "independent_pairs": relationships.count("INDEPENDENT"),
        "duplicate_groups": len(duplicate_groups),
        "conflict_groups": len(conflict_groups),
    }

    # Average similarity scores
    if pairs:
        avg_anchor = sum(p["similarities"]["anchor"] for p in pairs) / total_pairs
        avg_logic = sum(p["similarities"]["logic"] for p in pairs) / total_pairs
        avg_outcome = sum(p["similarities"]["outcome"] for p in pairs) / total_pairs
        avg_combined = sum(p["combined_score"] for p in pairs) / total_pairs
    else:
        avg_anchor = avg_logic = avg_outcome = avg_combined = 0.0

    summary["average_similarities"] = {
        "anchor": round(avg_anchor, 4),
        "logic": round(avg_logic, 4),
        "outcome": round(avg_outcome, 4),
        "combined": round(avg_combined, 4),
    }

    return {
        "summary": summary,
        "pairs": pairs,
        "duplicate_groups": [
            [s.get("id", s.get("title", "unknown")) for s in group]
            for group in duplicate_groups
        ],
        "conflict_groups": [
            [s.get("id", s.get("title", "unknown")) for s in group]
            for group in conflict_groups
        ],
    }
