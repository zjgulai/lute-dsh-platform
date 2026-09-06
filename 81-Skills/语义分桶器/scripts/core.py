"""
Semantic Bucketer Core - 语义分桶器核心算法

基于标签重叠度将知识单元（SKU）分组，使用 Union-Find 算法高效处理传递关系。
支持自适应阈值和大桶递归细分。

算法:
  1. 特征提取: 从 SKU 字典中提取指定字段的标签集合
  2. 相似度计算: 使用 Jaccard Overlap (|A∩B|/min(|A|,|B|))
  3. Union-Find 分组: 合并重叠度 >= 阈值的 SKU
  4. 大桶细分: 对超过 max_size 的桶递归使用更高阈值细分
  5. 报告生成: 计算桶内聚度和共享特征等统计数据

自包含实现：UnionFind 与 jaccard_overlap 内联，无外部依赖。
"""

from __future__ import annotations

import sys
from typing import Any


# ─── 内联基础算法（自包含，不依赖 skills._shared） ─────────────────────────────


class UnionFind:
    """Union-Find（并查集）实现，带路径压缩与按秩合并。"""

    def __init__(self, n: int):
        self.parent = list(range(n))
        self.rank = [0] * n

    def find(self, x: int) -> int:
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])  # 路径压缩
        return self.parent[x]

    def union(self, x: int, y: int) -> None:
        px, py = self.find(x), self.find(y)
        if px == py:
            return
        if self.rank[px] < self.rank[py]:
            px, py = py, px
        self.parent[py] = px
        if self.rank[px] == self.rank[py]:
            self.rank[px] += 1

    def get_buckets(self) -> dict[int, list[int]]:
        """返回 {root: [indices...]} 分组映射。"""
        buckets: dict[int, list[int]] = {}
        for i in range(len(self.parent)):
            root = self.find(i)
            buckets.setdefault(root, []).append(i)
        return buckets


def jaccard_overlap(a: set, b: set) -> float:
    """计算 Jaccard Overlap：|A∩B| / min(|A|,|B|)，较小集合为分母的非对称相似度。"""
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    min_size = min(len(a), len(b))
    return intersection / min_size if min_size > 0 else 0.0


# ─── Default Configuration ───────────────────────────────────────────────────

DEFAULT_FEATURE_FIELDS = ["applicable_objects", "domain_tags", "logic_type"]
DEFAULT_THRESHOLD = 0.5
DEFAULT_MAX_BUCKET_SIZE = 32

# ─── Feature Extraction ──────────────────────────────────────────────────────


def extract_features(sku: dict[str, Any], feature_fields: list[str] | None = None) -> set[str]:
    """
    Extract the tag/feature set from a SKU dictionary for the specified fields.

    Supports nested field paths using dot notation (e.g., "context.applicable_objects").
    Non-string elements in list fields are converted to strings.
    Dict fields are iterated and each key:value pair is added as a feature string.

    Args:
        sku: A SKU dictionary (may contain nested dicts and lists).
        feature_fields: List of field names or dot-notation paths to extract.
                        Defaults to DEFAULT_FEATURE_FIELDS.

    Returns:
        set[str]: Set of feature strings extracted from the specified fields.
                  Returns empty set if sku is empty or fields are missing.

    Examples:
        >>> sku = {"context": {"applicable_objects": ["pdf", "docx"]},
        ...         "custom_attributes": {"domain_tags": ["finance", "legal"]},
        ...         "core_logic": {"logic_type": "extraction"}}
        >>> feats = extract_features(sku)
        >>> sorted(feats)
        ['finance', 'legal', 'pdf', 'docx', 'type:extraction']
    """
    features: set[str] = set()
    if not sku:
        return features

    if feature_fields is None:
        feature_fields = DEFAULT_FEATURE_FIELDS

    for field in feature_fields:
        parts = field.split(".")
        value: Any = sku
        try:
            for part in parts:
                value = value[part]
        except (KeyError, TypeError, IndexError):
            continue

        if isinstance(value, list):
            for item in value:
                features.add(str(item))
        elif isinstance(value, set):
            for item in value:
                features.add(str(item))
        elif isinstance(value, dict):
            for k, v in value.items():
                features.add(f"{k}:{v}")
        else:
            features.add(str(value))

    return features


# ─── Similarity Calculation ──────────────────────────────────────────────────


def calculate_overlap(
    sku1: dict[str, Any],
    sku2: dict[str, Any],
    feature_fields: list[str] | None = None,
) -> float:
    """
    Compute the Jaccard overlap ratio between two SKUs' features.

    Uses |A ∩ B| / min(|A|, |B|) as the overlap measure, which is asymmetric
    and favors cases where one SKU's feature set is a subset of the other's.

    Args:
        sku1: First SKU dictionary.
        sku2: Second SKU dictionary.
        feature_fields: Feature fields to extract. Defaults to DEFAULT_FEATURE_FIELDS.

    Returns:
        float: Overlap ratio in [0.0, 1.0]. Returns 0.0 if either SKU has no features.

    Examples:
        >>> sku_a = {"tags": ["ai", "ml"]}
        >>> sku_b = {"tags": ["ai", "nlp"]}
        >>> calculate_overlap(sku_a, sku_b, feature_fields=["tags"])
        0.5
    """
    f1 = extract_features(sku1, feature_fields)
    f2 = extract_features(sku2, feature_fields)
    return jaccard_overlap(f1, f2)


# ─── Bucketing Algorithm ────────────────────────────────────────────────────


def bucket_skus(
    skus: list[dict[str, Any]],
    threshold: float = DEFAULT_THRESHOLD,
    feature_fields: list[str] | None = None,
) -> dict[int, list[int]]:
    """
    Group SKUs into buckets using Union-Find based on feature overlap.

    Two SKUs are placed in the same bucket when their Jaccard overlap is >= threshold.
    Transitive closure is handled by the Union-Find algorithm.

    Complexity: O(n^2 * f) where n = len(skus), f = average feature count.
    Uses O(n) additional space for the Union-Find structure.

    Args:
        skus: List of SKU dictionaries.
        threshold: Minimum overlap ratio (0.0-1.0) to union two SKUs.
                   Defaults to DEFAULT_THRESHOLD (0.5).
        feature_fields: Feature fields to extract. Defaults to DEFAULT_FEATURE_FIELDS.

    Returns:
        dict[int, list[int]]: {root_index: [sku_indices...]} mapping bucket roots
                              to lists of SKU indices.

    Edge cases:
        - Empty list: returns empty dict
        - Single SKU: returns {0: [0]}
        - All orphans (no overlap >= threshold): each SKU in its own bucket

    Examples:
        >>> skus = [
        ...     {"tags": ["a", "b"]},
        ...     {"tags": ["b", "c"]},
        ...     {"tags": ["d", "e"]},
        ... ]
        >>> buckets = bucket_skus(skus, threshold=0.3, feature_fields=["tags"])
        >>> len(buckets)
        2
    """
    n = len(skus)
    if n == 0:
        return {}
    if n == 1:
        return {0: [0]}

    if feature_fields is None:
        feature_fields = DEFAULT_FEATURE_FIELDS

    uf = UnionFind(n)

    # Pre-extract features to avoid repeated work (O(n * f))
    feature_cache: list[set[str]] = [extract_features(sku, feature_fields) for sku in skus]

    for i in range(n):
        for j in range(i + 1, n):
            # Fast skip: if either has no features, overlap is 0
            if not feature_cache[i] or not feature_cache[j]:
                continue
            overlap = jaccard_overlap(feature_cache[i], feature_cache[j])
            if overlap >= threshold:
                uf.union(i, j)

    return uf.get_buckets()


# ─── Bucket Cohesion ─────────────────────────────────────────────────────────


def compute_bucket_cohesion(
    bucket_skus_list: list[dict[str, Any]],
    feature_fields: list[str] | None = None,
) -> float:
    """
    Compute the average pairwise Jaccard overlap within a single bucket.

    Measures how internally consistent a bucket is. Higher cohesion means
    the SKUs share more features with each other.

    Args:
        bucket_skus_list: List of SKU dictionaries belonging to one bucket.
        feature_fields: Feature fields to extract. Defaults to DEFAULT_FEATURE_FIELDS.

    Returns:
        float: Average pairwise overlap (0.0-1.0). Returns 1.0 for a single-SKU
               bucket (trivially cohesive). Returns 0.0 if bucket is empty.

    Examples:
        >>> bucket = [{"tags": ["a", "b"]}, {"tags": ["a", "c"]}]
        >>> compute_bucket_cohesion(bucket, feature_fields=["tags"])
        0.5
    """
    m = len(bucket_skus_list)
    if m == 0:
        return 0.0
    if m == 1:
        return 1.0

    if feature_fields is None:
        feature_fields = DEFAULT_FEATURE_FIELDS

    total_overlap = 0.0
    pair_count = 0

    for i in range(m):
        for j in range(i + 1, m):
            total_overlap += calculate_overlap(
                bucket_skus_list[i], bucket_skus_list[j], feature_fields
            )
            pair_count += 1

    return total_overlap / pair_count if pair_count > 0 else 0.0


# ─── Large Bucket Refinement ─────────────────────────────────────────────────


def refine_large_buckets(
    buckets: dict[int, list[int]],
    skus: list[dict[str, Any]],
    max_size: int = DEFAULT_MAX_BUCKET_SIZE,
    threshold: float = DEFAULT_THRESHOLD,
) -> dict[int, list[int]]:
    """
    Recursively split oversized buckets using a tighter threshold.

    Strategy: For each bucket exceeding max_size, increase the overlap threshold
    by a factor of 1.5 and re-bucket the contained SKUs. This recursion continues
    until all buckets are within max_size or the threshold reaches 1.0 (at which
    point each SKU becomes its own bucket).

    Args:
        buckets: Current bucket mapping {root_index: [sku_indices...]}.
        skus: Full list of SKU dictionaries (used to extract sub-lists).
        max_size: Maximum allowed bucket size before splitting.
                  Defaults to DEFAULT_MAX_BUCKET_SIZE (32).
        threshold: Current overlap threshold. Defaults to DEFAULT_THRESHOLD (0.5).
                   The refined threshold for splitting is threshold * 1.5.

    Returns:
        dict[int, list[int]]: Refined bucket mapping with consecutive integer keys.
                              Same format as bucket_skus() output.

    Edge cases:
        - Empty buckets dict: returns empty dict
        - All buckets within max_size: returns unchanged mapping (keys may be remapped)
        - Single oversized bucket that resists splitting: eventually splits to singletons
    """
    refined: dict[int, list[int]] = {}
    next_id = 0

    for root, indices in buckets.items():
        if len(indices) <= max_size:
            refined[next_id] = indices
            next_id += 1
        else:
            # Increase threshold and re-bucket within this oversized group
            tighter_threshold = threshold * 1.5
            if tighter_threshold >= 1.0:
                # Threshold saturated: each SKU is its own bucket
                for idx in indices:
                    refined[next_id] = [idx]
                    next_id += 1
            else:
                sub_skus = [skus[i] for i in indices]
                # Re-bucket with tighter threshold
                sub_buckets = bucket_skus(sub_skus, threshold=tighter_threshold)
                # Recursively refine any sub-buckets that are still too large
                sub_refined = refine_large_buckets(
                    sub_buckets, sub_skus, max_size=max_size, threshold=tighter_threshold
                )
                for sub_indices in sub_refined.values():
                    # Map sub-bucket indices back to original SKU indices
                    mapped = [indices[i] for i in sub_indices]
                    refined[next_id] = mapped
                    next_id += 1

    return refined


# ─── Shared Feature Helpers ──────────────────────────────────────────────────


def _shared_features(
    skus_in_bucket: list[dict[str, Any]],
    feature_fields: list[str] | None,
) -> list[str]:
    """Compute the set of features shared by all SKUs in a bucket.

    Args:
        skus_in_bucket: List of SKU dicts belonging to one bucket.
        feature_fields: Feature fields to extract.

    Returns:
        list[str]: Sorted list of features present in every SKU in the bucket.
    """
    if not skus_in_bucket or not feature_fields:
        return []
    features_list = [extract_features(sku, feature_fields) for sku in skus_in_bucket]
    shared: set[str] = set(features_list[0])
    for fset in features_list[1:]:
        shared &= fset
    return sorted(shared)


def _feature_union(
    skus_in_bucket: list[dict[str, Any]],
    feature_fields: list[str] | None,
) -> list[str]:
    """Compute the union of all features across a bucket.

    Args:
        skus_in_bucket: List of SKU dicts belonging to one bucket.
        feature_fields: Feature fields to extract.

    Returns:
        list[str]: Sorted list of all features present in any SKU in the bucket.
    """
    if not skus_in_bucket or not feature_fields:
        return []
    all_features: set[str] = set()
    for sku in skus_in_bucket:
        all_features |= extract_features(sku, feature_fields)
    return sorted(all_features)


# ─── Full Pipeline ───────────────────────────────────────────────────────────


def bucket_and_report(
    skus: list[dict[str, Any]],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Complete bucketing pipeline: bucket, refine (optional), and produce a report.

    The report includes:
      - buckets: list of {bucket_id, sku_uuids, size, shared_features, feature_union, cohesion}
      - statistics: {total_skus, total_buckets, avg_bucket_size, max_bucket_size, singletons}

    Args:
        skus: List of SKU dictionaries. Each should contain a "uuid" or "id" field.
        config: Configuration dict with optional keys:
            - threshold (float, default 0.5): Overlap threshold for bucketing.
            - max_bucket_size (int, default 32): Buckets exceeding this are refined.
            - refine_large (bool, default True): Whether to split oversized buckets.
            - feature_fields (list[str], default ["applicable_objects",
              "domain_tags", "logic_type"]): Fields to extract features from.

    Returns:
        dict with:
            - "buckets": list of bucket dicts (see above)
            - "statistics": aggregate stats dict

    Edge cases:
        - Empty SKU list: 0 buckets, all stats zeroed
        - No config keys: uses defaults
        - SKUs missing uuid field: uses index string as fallback identifier

    Examples:
        >>> skus = [{"uuid": "a", "tags": ["x"]}, {"uuid": "b", "tags": ["x"]}]
        >>> result = bucket_and_report(skus, {"threshold": 0.5, "feature_fields": ["tags"]})
        >>> result["statistics"]["total_skus"]
        2
        >>> result["statistics"]["total_buckets"]
        1
    """
    if config is None:
        config = {}

    threshold = config.get("threshold", DEFAULT_THRESHOLD)
    max_bucket_size = config.get("max_bucket_size", DEFAULT_MAX_BUCKET_SIZE)
    refine_large = config.get("refine_large", True)
    feature_fields = config.get("feature_fields", DEFAULT_FEATURE_FIELDS)

    n = len(skus)
    if n == 0:
        return {
            "buckets": [],
            "statistics": {
                "total_skus": 0,
                "total_buckets": 0,
                "avg_bucket_size": 0.0,
                "max_bucket_size": 0,
                "singletons": 0,
            },
        }

    # Phase 1: initial bucketing
    buckets: dict[int, list[int]] = bucket_skus(skus, threshold, feature_fields)

    # Phase 2: refine large buckets if configured
    if refine_large:
        buckets = refine_large_buckets(
            buckets, skus, max_size=max_bucket_size, threshold=threshold
        )

    # Phase 3: build report
    bucket_reports: list[dict[str, Any]] = []
    singletons = 0

    for bucket_id_str, indices in buckets.items():
        bucket_id = str(bucket_id_str)
        bucket_skus_list = [skus[i] for i in indices]
        size = len(indices)

        # Determine SKU identifiers (uuid field, id field, or fallback to index)
        sku_uuids: list[str] = []
        for i in indices:
            sku = skus[i]
            uid = sku.get("uuid") or sku.get("id")
            if uid is not None:
                sku_uuids.append(str(uid))
            else:
                sku_uuids.append(str(i))

        shared = _shared_features(bucket_skus_list, feature_fields)
        union = _feature_union(bucket_skus_list, feature_fields)
        cohesion = compute_bucket_cohesion(bucket_skus_list, feature_fields)

        if size == 1:
            singletons += 1

        bucket_reports.append(
            {
                "bucket_id": bucket_id,
                "sku_uuids": sku_uuids,
                "size": size,
                "shared_features": shared,
                "feature_union": union,
                "cohesion": round(cohesion, 4),
            }
        )

    # Sort: largest bucket first, then by bucket_id
    bucket_reports.sort(key=lambda b: (-b["size"], b["bucket_id"]))

    total_buckets = len(bucket_reports)
    total_skus = n
    avg_bucket_size = round(total_skus / total_buckets, 2) if total_buckets > 0 else 0.0
    max_bucket_size_computed = max((b["size"] for b in bucket_reports), default=0)

    return {
        "buckets": bucket_reports,
        "statistics": {
            "total_skus": total_skus,
            "total_buckets": total_buckets,
            "avg_bucket_size": avg_bucket_size,
            "max_bucket_size": max_bucket_size_computed,
            "singletons": singletons,
        },
    }


if __name__ == "__main__":
    # Quick self-test when run directly
    import doctest

    results = doctest.testmod(verbose=False)
    sys.exit(0 if results.failed == 0 else 1)
