"""
Taxonomy Normalizer - 核心规范化逻辑

对知识单元（SKU）中的术语进行统一规范化处理，
包括大小写归一化、等价术语检测、冲突检测。
"""

from __future__ import annotations

import re
from typing import Any, Optional


def levenshtein_ratio(a: str, b: str) -> float:
    """计算两个字符串的相似度比值 [0,1]，自包含实现（不依赖 skills._shared）。

    基于 Levenshtein 编辑距离：ratio = 1 - distance / max(len(a), len(b))。
    空串对空串视为完全相同（返回 1.0）。
    """
    a = a or ""
    b = b or ""
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0

    la, lb = len(a), len(b)
    # 用两行滚动数组节省内存
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = cur
    distance = prev[lb]
    return 1.0 - distance / max(la, lb)


# ──────────────────────────────────────────────
# Term Collection
# ──────────────────────────────────────────────


def collect_terms(
    skus: list[dict[str, Any]],
    fields: list[str],
) -> dict[str, list[str]]:
    """
    从 SKU 列表中收集指定字段的所有唯一值。

    Args:
        skus: SKU 列表
        fields: 要收集的字段名列表（如 ["tags", "applicable_objective"]）

    Returns:
        dict: {field_name: [unique_values]}
    """
    if not skus or not fields:
        return {}

    collected: dict[str, set[str]] = {field: set() for field in fields}

    for sku in skus:
        if not isinstance(sku, dict):
            continue
        for field in fields:
            value = sku.get(field)
            if value is None:
                continue

            if isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and item.strip():
                        collected[field].add(item.strip())
            elif isinstance(value, str) and value.strip():
                collected[field].add(value.strip())

    return {field: sorted(values) for field, values in collected.items()}


# ──────────────────────────────────────────────
# Case Normalization
# ──────────────────────────────────────────────


def normalize_case(terms: list[str]) -> list[str]:
    """
    大小写归一化：转小写、去除首尾空格、按大小写不敏感去重。

    如果两个术语的大小写归一化版本相同，保留第一个出现的。

    Args:
        terms: 术语列表

    Returns:
        list[str]: 归一化后的术语列表（保留原格式的第一个出现）
    """
    if not terms:
        return []

    seen: set[str] = set()
    result: list[str] = []

    for term in terms:
        if not term or not term.strip():
            continue
        normalized = term.strip().lower()
        if normalized not in seen:
            seen.add(normalized)
            result.append(term.strip())

    return result


# ──────────────────────────────────────────────
# Equivalent Detection
# ──────────────────────────────────────────────


def detect_equivalents(
    terms: list[str],
    strategy: str = "flexible",
) -> dict[str, list[str]]:
    """
    检测等价术语。

    策略:
        - strict: 仅精确匹配（归一化后）
        - flexible: 精确匹配 + 子串包含 + 编辑距离 < 20%

    Args:
        terms: 术语列表
        strategy: 检测策略，"strict" 或 "flexible"（默认 "flexible"）

    Returns:
        dict: {标准化术语: [等价变体列表]}
    """
    if not terms:
        return {}

    # Step 1: Normalize to lowercase for comparison
    normalized_terms = [(t.strip(), t.strip().lower()) for t in terms if t and t.strip()]
    if not normalized_terms:
        return {}

    # Step 2: Group by exact normalized match
    groups: dict[str, list[tuple[str, str]]] = {}
    for orig, norm in normalized_terms:
        groups.setdefault(norm, []).append((orig, norm))

    mappings: dict[str, list[str]] = {}

    if strategy == "strict":
        # Strict strategy: only exact normalized matches are equivalent
        for _norm, group in groups.items():
            representatives = list(dict.fromkeys(orig for orig, _ in group))
            if len(representatives) > 1:
                # Use the first alphabetical representative
                representative = sorted(representatives)[0]
                mappings[representative] = [r for r in representatives if r != representative]
            else:
                mappings[representatives[0]] = []
        return mappings

    # Flexible strategy: exact match + substring + edit distance
    unique_terms = list(dict.fromkeys(t.strip() for t in terms if t and t.strip()))
    n = len(unique_terms)
    uf_parent = list(range(n))

    def _uf_find(x: int) -> int:
        while uf_parent[x] != x:
            uf_parent[x] = uf_parent[uf_parent[x]]
            x = uf_parent[x]
        return x

    def _uf_union(x: int, y: int) -> None:
        rx, ry = _uf_find(x), _uf_find(y)
        if rx != ry:
            uf_parent[ry] = rx

    # Step 1: Connect exact normalized matches
    norm_index: dict[str, int] = {}
    for i, term in enumerate(unique_terms):
        norm = term.lower()
        if norm in norm_index:
            _uf_union(norm_index[norm], i)
        else:
            norm_index[norm] = i

    # Step 2: Connect substring matches and edit-distance matches
    for i in range(n):
        for j in range(i + 1, n):
            if _uf_find(i) == _uf_find(j):
                continue
            t1, t2 = unique_terms[i].lower(), unique_terms[j].lower()
            # Substring containment
            if len(t1) >= 3 and len(t2) >= 3:
                if t1 in t2 or t2 in t1:
                    _uf_union(i, j)
                    continue
            # Edit distance < 20% of max length
            ratio = levenshtein_ratio(t1, t2)
            if ratio > 0.8:  # less than 20% difference
                _uf_union(i, j)

    # Group by root
    root_groups: dict[int, list[str]] = {}
    for i, term in enumerate(unique_terms):
        root = _uf_find(i)
        root_groups.setdefault(root, []).append(term)

    # Build mapping: shortest term as representative
    for root, group in root_groups.items():
        if len(group) == 1:
            mappings[group[0]] = []
        else:
            # Use the shortest term as representative
            representative = sorted(group, key=lambda x: (len(x), x))[0]
            mappings[representative] = [t for t in group if t != representative]

    return mappings


# ──────────────────────────────────────────────
# Normalization Application
# ──────────────────────────────────────────────


def apply_normalization(
    skus: list[dict[str, Any]],
    mappings: dict[str, list[str]],
) -> list[dict[str, Any]]:
    """
    将术语映射应用到 SKU 列表。

    将变体术语替换为标准形式。

    Args:
        skus: SKU 列表
        mappings: {标准化术语: [等价变体列表]} 映射

    Returns:
        list[dict]: 应用归一化后的 SKU 列表（原地修改）
    """
    if not skus or not mappings:
        return list(skus)

    # Build reverse lookup: variant -> standardized
    variant_to_standard: dict[str, str] = {}
    for standard, variants in mappings.items():
        for variant in variants:
            variant_to_standard[variant] = standard

    if not variant_to_standard:
        return list(skus)

    normalized_skus: list[dict[str, Any]] = []

    for sku in skus:
        if not isinstance(sku, dict):
            normalized_skus.append(sku)
            continue

        normalized_sku = dict(sku)

        for key, value in normalized_sku.items():
            if isinstance(value, str):
                # Check if entire string is a variant
                if value.strip() in variant_to_standard:
                    normalized_sku[key] = variant_to_standard[value.strip()]
            elif isinstance(value, list):
                # Check list items
                new_list: list[Any] = []
                for item in value:
                    if isinstance(item, str) and item.strip() in variant_to_standard:
                        new_list.append(variant_to_standard[item.strip()])
                    else:
                        new_list.append(item)
                normalized_sku[key] = new_list

        normalized_skus.append(normalized_sku)

    return normalized_skus


# ──────────────────────────────────────────────
# Conflict Detection
# ──────────────────────────────────────────────


def detect_conflicts(
    mappings: dict[str, list[str]],
) -> list[dict[str, Any]]:
    """
    检测术语映射中的冲突。

    冲突类型:
        - many_to_one: 多个标准术语映射到同一个变体
        - circular: 循环映射（A->B, B->C, C->A）
        - missing_target: 映射的目标术语不在标准术语集中

    Args:
        mappings: {标准化术语: [等价变体列表]} 映射

    Returns:
        list[dict]: 冲突列表
    """
    conflicts: list[dict[str, Any]] = []
    all_standards = set(mappings.keys())
    all_variants: set[str] = set()
    for standard, variants in mappings.items():
        for v in variants:
            all_variants.add(v)

    # Many-to-one: a variant should only map to one standard
    # Check if any variant appears in multiple standard groups
    variant_to_sources: dict[str, list[str]] = {}
    for standard, variants in mappings.items():
        for variant in variants:
            variant_to_sources.setdefault(variant, []).append(standard)

    for variant, sources in variant_to_sources.items():
        if len(sources) > 1:
            conflicts.append({
                "type": "many_to_one",
                "variant": variant,
                "sources": sources,
                "description": f"Variant '{variant}' maps to multiple standards: {sources}",
            })

    # Circular: A->B and B->A
    for std_a, vars_a in mappings.items():
        for var in vars_a:
            if var in all_standards:
                # var is itself a standard term
                if std_a in mappings.get(var, []):
                    conflicts.append({
                        "type": "circular",
                        "terms": [std_a, var],
                        "description": (
                            f"Circular mapping: '{std_a}' -> '{var}' and '{var}' -> '{std_a}'"
                        ),
                    })

    # Missing target: a standard term that exists only as a variant of another
    orphan_standards: list[str] = []
    for std in all_standards:
        is_also_variant = False
        for other_std, variants in mappings.items():
            if other_std != std and std in variants:
                is_also_variant = True
                break
        if is_also_variant:
            # Check if this standard has its own variants for stability
            if not mappings[std]:
                orphan_standards.append(std)

    for orphan in orphan_standards:
        conflicts.append({
            "type": "missing_target",
            "term": orphan,
            "description": (
                f"Term '{orphan}' is both a standard term and a variant, "
                f"but has no sub-variants of its own"
            ),
        })

    return conflicts


# ──────────────────────────────────────────────
# Reporting
# ──────────────────────────────────────────────


def generate_normalization_report(
    terms: dict[str, list[str]],
    mappings: dict[str, list[str]],
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    生成完整的术语归一化报告。

    Args:
        terms: {field_name: [term_list]} 字段术语字典
        mappings: {标准化术语: [等价变体列表]} 映射
        config: 配置字典（可选），支持:
            - strategy: 检测策略

    Returns:
        dict: 归一化报告，包含前后统计、冲突列表、合并建议
    """
    if config is None:
        config = {}

    strategy = config.get("strategy", "flexible")

    # Before stats
    before_stats: dict[str, Any] = {}
    for field, term_list in terms.items():
        before_stats[field] = {
            "total_count": len(term_list),
            "terms": term_list,
        }

    # After stats (after normalization)
    simplified_mappings: dict[str, list[str]] = {}
    standardized_terms: dict[str, list[str]] = {}
    total_unique_before = sum(len(t) for t in terms.values())
    total_variants = sum(len(v) for v in mappings.values())
    total_standards = len(mappings)

    # Group by field
    for field, term_list in terms.items():
        normalized = normalize_case(term_list)
        field_mappings = detect_equivalents(normalized, strategy)
        field_standards: list[str] = []
        field_variants: list[str] = []
        for std, vars_list in field_mappings.items():
            field_standards.append(std)
            field_variants.extend(vars_list)

        standardized_terms[field] = field_standards
        simplified_mappings[field] = {}

    # Detect conflicts
    conflicts = detect_conflicts(mappings)

    after_stats: dict[str, Any] = {}
    total_unique_after = 0
    for field in terms:
        std_count = len(standardized_terms.get(field, []))
        after_stats[field] = {
            "standardized_count": std_count,
            "standardized_terms": standardized_terms.get(field, []),
        }
        total_unique_after += std_count

    # Merge suggestions
    merge_suggestions: list[dict[str, Any]] = []
    for standard, variants in mappings.items():
        if variants:
            merge_suggestions.append({
                "standard": standard,
                "variants": variants,
                "merge_action": f"Replace {variants} with '{standard}'",
            })

    return {
        "before": {
            "total_unique_terms": total_unique_before,
            "per_field": before_stats,
        },
        "after": {
            "total_standardized_terms": total_unique_after,
            "reduction": total_unique_before - total_unique_after,
            "reduction_pct": (
                round((total_unique_before - total_unique_after) / max(1, total_unique_before) * 100, 1)
                if total_unique_before > 0 else 0.0
            ),
            "per_field": after_stats,
        },
        "mappings": mappings,
        "conflicts": conflicts,
        "merge_suggestions": merge_suggestions,
        "config": {
            "strategy": strategy,
        },
    }


def process(params: dict) -> dict:
    """Unified entry point for SkillRunner."""
    skus = params.get("skus", [])
    fields = params.get("fields", "name")
    if isinstance(fields, str):
        fields = [fields]
    terms = collect_terms(skus, fields)
    normalized = normalize_case(list(terms.values())[0] if terms else [])
    equivs = detect_equivalents(normalized, params.get("strategy", "flexible"))
    return {"terms": terms, "normalized": normalized, "equivalents": equivs, "total_terms": len(normalized)}
