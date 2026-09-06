"""
锚点文本分割器核心逻辑 (Anchor-Based Text Splitter Core)

基于用户提供的锚点（原文中的标记片段），在原文中精确定位并分割文本。
使用 Levenshtein 距离进行模糊匹配，支持 OCR 识别错误的容错处理。

Usage:
    from scripts.core import split_document

    result = split_document(
        content="...long document...",
        anchors=["第一章 总则", "第二章 组织机构"],
        config={"fuzzy_threshold": 0.33, "case_sensitive": False},
    )
    for chunk in result["chunks"]:
        print(chunk["content"])
"""

from __future__ import annotations

import copy
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════
# Levenshtein 距离（自包含实现）
# ═══════════════════════════════════════════════════════

DEFAULT_CONFIG: dict[str, Any] = {
    "fuzzy_threshold": 0.33,
    "case_sensitive": False,
    "allow_overlap": False,
    "min_anchor_length": 5,
    "max_anchor_length": 100,
}


def levenshtein_distance(s1: str, s2: str) -> int:
    """
    计算两个字符串之间的 Levenshtein 编辑距离（插入、删除、替换的最小操作数）。

    使用滚动数组优化空间复杂度到 O(min(n, m))。

    Args:
        s1: 第一个字符串
        s2: 第二个字符串

    Returns:
        int: 编辑距离

    Examples:
        >>> levenshtein_distance("kitten", "sitting")
        3
        >>> levenshtein_distance("hello", "hello")
        0
    """
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))

    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def levenshtein_ratio(s1: str, s2: str) -> float:
    """
    归一化的编辑距离相似度。

    Args:
        s1: 第一个字符串
        s2: 第二个字符串

    Returns:
        float: 相似度比值 (0.0 = 完全不同, 1.0 = 完全相同)
    """
    if not s1 and not s2:
        return 1.0
    if not s1 or not s2:
        return 0.0
    dist = levenshtein_distance(s1, s2)
    max_len = max(len(s1), len(s2))
    return 1.0 - (dist / max_len)


def fuzzy_find(content: str, anchor: str, threshold: float = 0.33) -> int:
    """
    在原文中模糊匹配锚点位置。

    使用滑动窗口 + Levenshtein 距离对 OCR 错误容错。
    窗口大小为 anchor 长度的 80%~120%，返回第一个满足阈值的匹配位置。

    Args:
        content: 原始文本
        anchor: 锚点文本（可能含 OCR 错误）
        threshold: 最大可接受的编辑距离比（默认 0.33，即允许 33% 差异）

    Returns:
        int: 匹配到的起始位置，未匹配返回 -1

    Examples:
        >>> fuzzy_find("Hello World, this is a test.", "Helo World", 0.3)
        0
    """
    anchor_len = len(anchor)
    if anchor_len == 0:
        return -1

    max_dist = int(anchor_len * threshold)
    if max_dist < 1:
        max_dist = 1

    # 滑动窗口：80%~120% of anchor length
    min_window = max(1, int(anchor_len * 0.8))
    max_window = min(len(content), int(anchor_len * 1.2) + 1)

    best_pos = -1
    best_ratio = 0.0

    for window_size in range(min_window, max_window + 1):
        for i in range(len(content) - window_size + 1):
            window = content[i:i + window_size]
            ratio = levenshtein_ratio(anchor, window)
            if ratio > best_ratio:
                best_ratio = ratio
                best_pos = i

    # 检查是否满足阈值
    if best_pos >= 0:
        best_dist = levenshtein_distance(anchor, content[best_pos:best_pos + min(len(content) - best_pos, int(anchor_len * 1.2))])
        if best_dist <= max_dist:
            return best_pos

    return -1


# ═══════════════════════════════════════════════════════
# Local utility functions
# ═══════════════════════════════════════════════════════


def _normalize_text(text: str, case_sensitive: bool) -> str:
    """根据大小写敏感设置归一化文本。

    Args:
        text: 原始文本
        case_sensitive: 是否大小写敏感

    Returns:
        str: 归一化后的文本
    """
    return text if case_sensitive else text.lower()


def _validate_anchor_length(
    anchor: str,
    min_len: int = 5,
    max_len: int = 100,
) -> tuple[bool, Optional[str]]:
    """验证单个锚点长度是否在允许范围内。

    Args:
        anchor: 锚点文本
        min_len: 最小允许长度
        max_len: 最大允许长度

    Returns:
        tuple: (is_valid, error_message)
    """
    length = len(anchor)
    if length == 0:
        return False, "锚点为空"
    if length < min_len:
        return False, f"锚点过短 ({length} < {min_len})"
    if length > max_len:
        return False, f"锚点过长 ({length} > {max_len})"
    return True, None


def _detect_overlaps(
    results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """检测锚点定位结果中是否存在重叠。

    Args:
        results: find_all_anchors 返回的结果列表

    Returns:
        list: 存在重叠的锚点对描述列表
    """
    overlaps: list[dict[str, Any]] = []
    sorted_results = sorted(results, key=lambda r: r["position"])
    positions = [r for r in sorted_results if r["position"] != -1]

    for i in range(len(positions) - 1):
        current = positions[i]
        next_anchor = positions[i + 1]
        current_end = current["position"] + len(current["anchor_text"])

        if current_end > next_anchor["position"]:
            overlaps.append({
                "anchor_a": current["anchor_text"],
                "anchor_b": next_anchor["anchor_text"],
                "a_end": current_end,
                "b_start": next_anchor["position"],
                "overlap_chars": current_end - next_anchor["position"],
            })

    return overlaps


# ═══════════════════════════════════════════════════════
# Core Functions
# ═══════════════════════════════════════════════════════


def find_all_anchors(
    content: str,
    anchors: list[str],
    threshold: float = 0.33,
) -> list[dict[str, Any]]:
    """
    在内容中定位所有锚点的位置。

    对每个锚点，先尝试精确匹配（content.find），精确匹配失败时回退到模糊匹配。
    返回的结果按在内容中出现的位置排序。

    Args:
        content: 原始文本内容
        anchors: 锚点文本列表
        threshold: 模糊匹配阈值（默认 0.33）

    Returns:
        list[dict]: 每个锚点的定位结果，包含：
            - index: 锚点在输入列表中的序号
            - anchor_text: 原始锚点文本
            - position: 在内容中的起始位置（-1 表示未找到）
            - match_type: "exact" | "fuzzy" | "not_found"
            - similarity: 匹配相似度（精确匹配为 1.0，未找到为 0.0）

    Raises:
        ValueError: content 为空或 anchors 为空

    Examples:
        >>> result = find_all_anchors("第一章 总则...第二章 分则...", ["第一章 总则", "第二章 分则"])
        >>> len(result)
        2
        >>> result[0]["match_type"]
        'exact'
    """
    if not content:
        raise ValueError("content 不能为空")
    if not anchors:
        raise ValueError("anchors 不能为空")

    results: list[dict[str, Any]] = []

    for idx, anchor in enumerate(anchors):
        anchor = anchor.strip()
        if not anchor:
            logger.warning("跳过空锚点 (index=%d)", idx)
            results.append({
                "index": idx,
                "anchor_text": anchor,
                "position": -1,
                "match_type": "not_found",
                "similarity": 0.0,
            })
            continue

        # Step 1: 精确匹配
        position = content.find(anchor)

        if position != -1:
            logger.debug("精确匹配锚点 '%s' 在位置 %d", anchor[:30], position)
            results.append({
                "index": idx,
                "anchor_text": anchor,
                "position": position,
                "match_type": "exact",
                "similarity": 1.0,
            })
            continue

        # Step 2: 模糊匹配
        fuzzy_pos = fuzzy_find(content, anchor, threshold)

        if fuzzy_pos != -1:
            similarity = levenshtein_ratio(
                content[fuzzy_pos:fuzzy_pos + len(anchor)], anchor
            )
            logger.debug(
                "模糊匹配锚点 '%s' 在位置 %d (相似度: %.2f)",
                anchor[:30], fuzzy_pos, similarity,
            )
            results.append({
                "index": idx,
                "anchor_text": anchor,
                "position": fuzzy_pos,
                "match_type": "fuzzy",
                "similarity": round(similarity, 4),
            })
        else:
            logger.warning("锚点 '%s' 未在内容中找到", anchor[:30])
            results.append({
                "index": idx,
                "anchor_text": anchor,
                "position": -1,
                "match_type": "not_found",
                "similarity": 0.0,
            })

    # 按位置排序（未找到的放在最后）
    results.sort(key=lambda r: r["position"] if r["position"] != -1 else float("inf"))
    return results


def split_by_anchors(
    content: str,
    anchors: list[str],
    threshold: float = 0.33,
    include_anchor_before: bool = True,
) -> list[dict[str, Any]]:
    """
    根据锚点位置分割文本。

    以每个锚点作为分界点，将文本切分为连续的块。
    如果锚点未找到，该锚点会被跳过（记录警告）。

    Args:
        content: 原始文本内容
        anchors: 锚点文本列表
        threshold: 模糊匹配阈值（默认 0.33）
        include_anchor_before: 如果为 True（默认），锚点文本属于前一块；
            如果为 False，锚点文本属于后一块。

    Returns:
        list[dict]: 分割后的文本块，每块包含：
            - chunk_index: 块序号（从 0 开始）
            - content: 块内容
            - anchor_text: 该块起始处的锚点文本（首块为 None）
            - char_start: 在原文中的起始位置
            - char_end: 在原文中的结束位置

    Raises:
        ValueError: content 为空

    Examples:
        >>> chunks = split_by_anchors("A...B...C...", ["B", "C"])
        >>> len(chunks)
        3
    """
    if not content:
        raise ValueError("content 不能为空")

    # 找到所有锚点
    anchor_results = find_all_anchors(content, anchors, threshold)

    # 提取有效位置（按位置排序）
    valid_positions: list[dict[str, Any]] = [
        r for r in anchor_results if r["position"] != -1
    ]

    if not valid_positions:
        logger.warning("没有找到任何锚点，返回整段文本作为单个块")
        return [
            {
                "chunk_index": 0,
                "content": content,
                "anchor_text": None,
                "char_start": 0,
                "char_end": len(content),
            }
        ]

    # 构建分割点列表
    positions: list[int] = []
    position_anchor_map: dict[int, str] = {}

    for result in valid_positions:
        pos = result["position"]
        if include_anchor_before:
            # 锚点属于前一块，分割点在锚点之后
            split_pos = pos + len(result["anchor_text"])
        else:
            # 锚点属于后一块，分割点在锚点之前
            split_pos = pos

        if split_pos not in position_anchor_map:
            positions.append(split_pos)
            position_anchor_map[split_pos] = result["anchor_text"]

    # 排序所有分割点
    positions.sort()

    # 检查重叠（仅用于日志警告）
    overlaps = _detect_overlaps(valid_positions)
    if overlaps:
        for ov in overlaps:
            logger.warning(
                "锚点重叠: '%s' 结束于 %d, '%s' 起始于 %d (重叠 %d 字符)",
                ov["anchor_a"], ov["a_end"],
                ov["anchor_b"], ov["b_start"],
                ov["overlap_chars"],
            )

    # 执行分割
    all_boundaries = [0] + positions + [len(content)]
    chunks: list[dict[str, Any]] = []

    for i in range(len(all_boundaries) - 1):
        start = all_boundaries[i]
        end = all_boundaries[i + 1]

        chunk_content = content[start:end]
        chunk_anchor = position_anchor_map.get(start, None)

        # 对于第 0 块，anchor_text 总是 None（位于第一个边界之前）
        if i == 0:
            chunk_anchor = None

        chunk: dict[str, Any] = {
            "chunk_index": i,
            "content": chunk_content,
            "anchor_text": chunk_anchor,
            "char_start": start,
            "char_end": end,
        }
        chunks.append(chunk)

    return chunks


def validate_anchors(
    content: str,
    anchors: list[str],
    threshold: float = 0.33,
) -> dict[str, Any]:
    """
    验证锚点的有效性，检查每个锚点是否能在内容中找到匹配。

    提供详细的验证报告，包括已匹配和未匹配的锚点信息。

    Args:
        content: 原始文本内容
        anchors: 锚点文本列表
        threshold: 模糊匹配阈值（默认 0.33）

    Returns:
        dict: 验证结果，包含：
            - total_anchors: 总锚点数
            - matched: 成功匹配的锚点列表
            - unmatched: 未匹配的锚点列表
            - all_matched: 是否全部匹配成功
            - duplicates: 重复锚点列表（如有）
            - length_issues: 长度不合规的锚点列表（如有）
            - overlaps: 重叠锚点列表（如有）

    Examples:
        >>> result = validate_anchors("hello world", ["hello", "missing"])
        >>> result["all_matched"]
        False
        >>> len(result["unmatched"])
        1
    """
    result: dict[str, Any] = {
        "total_anchors": len(anchors),
        "matched": [],
        "unmatched": [],
        "all_matched": True,
        "duplicates": [],
        "length_issues": [],
        "overlaps": [],
    }

    if not content:
        result["all_matched"] = False
        result["unmatched"] = [{"anchor_text": a, "reason": "content 为空"}
                               for a in anchors]
        return result

    # 检查重复锚点
    seen: set[str] = set()
    for anchor in anchors:
        if anchor in seen:
            result["duplicates"].append(anchor)
        seen.add(anchor)

    # 检查长度
    min_len = DEFAULT_CONFIG["min_anchor_length"]
    max_len = DEFAULT_CONFIG["max_anchor_length"]
    for anchor in anchors:
        valid, error_msg = _validate_anchor_length(anchor, min_len, max_len)
        if not valid:
            result["length_issues"].append({
                "anchor_text": anchor,
                "reason": error_msg,
            })

    # 执行锚点定位
    anchor_results = find_all_anchors(content, anchors, threshold)

    for ar in anchor_results:
        entry = {
            "anchor_text": ar["anchor_text"],
            "position": ar["position"],
            "match_type": ar["match_type"],
            "similarity": ar["similarity"],
        }
        if ar["position"] != -1:
            result["matched"].append(entry)
        else:
            result["unmatched"].append(entry)
            result["all_matched"] = False

    # 检查重叠
    valid_positions = [r for r in anchor_results if r["position"] != -1]
    overlaps = _detect_overlaps(valid_positions)
    if overlaps:
        result["overlaps"] = overlaps
        # 重叠本身不导致验证失败，仅记录

    return result


def split_document(
    content: str,
    anchors: list[str],
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    主入口函数：执行完整的锚点分割流程。

    根据提供的锚点将文本分割为多个块，返回完整结果和元数据。
    是 split_by_anchors 的包装，增加了配置合并、元数据收集和一致性验证。

    Args:
        content: 原始文本内容
        anchors: 锚点文本列表（支持字符串列表或对象列表）
        config: 配置字典，支持以下键：
            - fuzzy_threshold (float): 模糊匹配阈值，默认 0.33
            - case_sensitive (bool): 大小写敏感，默认 False
            - allow_overlap (bool): 允许锚点重叠，默认 False
            - include_anchor_before (bool): 锚点文本是否属于前一块，默认 True

    Returns:
        dict: 包含以下键：
            - chunks: 分割后的文本块列表（每个块有 chunk_index, content,
              anchor_text, char_start, char_end）
            - anchor_results: 每个锚点的定位结果（index, anchor_text, position,
              match_type, similarity）
            - verification: 验证结果（all_anchors_found, concatenation_check,
              empty_chunks, total_chunks, total_chars）
            - config: 实际使用的配置

    Raises:
        ValueError: content 为空或 anchors 为空

    Examples:
        >>> result = split_document("前言...第一章 正文...", ["第一章 正文"])
        >>> len(result["chunks"])
        2
        >>> result["verification"]["all_anchors_found"]
        True
        >>> result["verification"]["concatenation_check"]
        True
    """
    if not content:
        raise ValueError("content 不能为空")
    if not anchors:
        raise ValueError("anchors 不能为空")

    # 合并配置
    resolved_config = copy.deepcopy(DEFAULT_CONFIG)
    if config:
        # 将 fuzzy_threshold 映射到 threshold
        if "fuzzy_threshold" in config:
            resolved_config["fuzzy_threshold"] = config["fuzzy_threshold"]
        if "case_sensitive" in config:
            resolved_config["case_sensitive"] = config["case_sensitive"]
        if "allow_overlap" in config:
            resolved_config["allow_overlap"] = config["allow_overlap"]
        if "min_anchor_length" in config:
            resolved_config["min_anchor_length"] = config["min_anchor_length"]
        if "max_anchor_length" in config:
            resolved_config["max_anchor_length"] = config["max_anchor_length"]

    # 提取锚点文本（支持 [str, ...] 或 [{"text": str}, ...]）
    anchor_texts: list[str] = []
    for anchor in anchors:
        if isinstance(anchor, str):
            anchor_texts.append(anchor)
        elif isinstance(anchor, dict) and "text" in anchor:
            anchor_texts.append(anchor["text"])
        else:
            logger.warning("跳过无效锚点格式: %s", type(anchor))

    if not anchor_texts:
        raise ValueError("anchors 中无有效锚点文本")

    threshold = resolved_config["fuzzy_threshold"]

    # 执行分割
    chunks = split_by_anchors(
        content=content,
        anchors=anchor_texts,
        threshold=threshold,
        include_anchor_before=resolved_config.get("include_anchor_before", True),
    )

    # 获取锚点定位结果（重新调用 find_all_anchors 以获取原始顺序信息）
    anchor_results = find_all_anchors(content, anchor_texts, threshold)

    # 验证结果
    verification: dict[str, Any] = {}

    # 检查所有锚点是否找到
    found_count = sum(1 for r in anchor_results if r["position"] != -1)
    verification["all_anchors_found"] = found_count == len(anchor_texts)

    # 拼接检查（验证分割后拼接是否等于原文）
    reconstructed = "".join(c["content"] for c in chunks)
    verification["concatenation_check"] = reconstructed == content

    # 空块统计
    empty_chunks = sum(1 for c in chunks if not c["content"].strip())
    verification["empty_chunks"] = empty_chunks

    verification["total_chunks"] = len(chunks)
    verification["total_chars"] = len(content)

    # 如果配置不允许重叠，检查并发出警告
    if not resolved_config["allow_overlap"]:
        overlaps = _detect_overlaps(anchor_results)
        if overlaps:
            logger.warning("检测到 %d 组锚点重叠，allow_overlap=False", len(overlaps))
            verification["overlap_warnings"] = [
                f"锚点 '{o['anchor_a']}' 与 '{o['anchor_b']}' 重叠"
                for o in overlaps
            ]

    return {
        "chunks": chunks,
        "anchor_results": anchor_results,
        "verification": verification,
        "config": resolved_config,
    }


def process(params: dict) -> dict:
    """Unified entry point for SkillRunner."""
    content = params.get("content", "")
    anchors = params.get("anchors", [])
    threshold = params.get("threshold", 0.3)
    return split_document(content, anchors, {"threshold": threshold})
