"""
Semantic Density Analyzer - 核心分析逻辑

计算文本的语义密度（逻辑密度、实体密度、结构密度），
用于评估文本的知识密度和结构完整性。
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional


# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────

ZH_LOGIC_CONNECTORS: set[str] = {
    "因为", "所以", "但是", "因此", "如果",
    "虽然", "然而", "并且", "首先", "然后",
    "最后", "总之", "不仅", "而且", "然而",
    "尽管", "但是", "却", "由于", "因而",
    "于是", "从而", "以致", "致使", "以便",
    "以免", "免得", "除非", "倘若", "假如",
    "要是", "否则", "不然", "要不", "无论",
    "不论", "不管", "即使", "即便", "哪怕",
}

EN_LOGIC_CONNECTORS: set[str] = {
    "because", "therefore", "however", "if", "although",
    "and", "but", "first", "then", "finally",
    "summary", "consequently", "furthermore", "moreover",
    "nevertheless", "nonetheless", "whereas", "meanwhile",
    "subsequently", "accordingly", "hence", "thus",
    "otherwise", "unless", "provided", "despite",
    "regardless", "notwithstanding", "alternatively",
    "specifically", "particularly", "importantly",
}

ZH_PROPER_NOUN_MARKERS: set[str] = {
    "公司", "集团", "品牌", "平台", "系统",
    "中心", "机构", "组织", "协会", "联盟",
    "大学", "学院", "研究院", "局", "部", "委",
}

# 中文数字/百分比匹配
ZH_NUMBER_PATTERN = re.compile(r"[零一二三四五六七八九十百千万亿\d]+(?:%|％|万|亿|千|百)?")
# 英文数字/百分比匹配
EN_NUMBER_PATTERN = re.compile(r"\d+(?:\.\d+)?%?")

# 中文日期模式
ZH_DATE_PATTERN = re.compile(
    r"(?:\d{4}年)?\d{1,2}月\d{1,2}[日号]?"
    r"|(?:\d{4}[-/]\d{1,2}[-/]\d{1,2})"
    r"|(?:今年|去年|明年|本月|上月|下月|本周|上周|下周)"
)

# 英文日期模式
EN_DATE_PATTERN = re.compile(
    r"\d{4}[-/]\d{1,2}[-/]\d{1,2}"
    r"|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}"
    r"|\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}"
)

# 结构性元素模式
BULLET_PATTERN = re.compile(r"^[\s]*[-*+•·][\s]+", re.MULTILINE)
NUMBERED_LIST_PATTERN = re.compile(r"^[\s]*\d+[.、\)][\s]+", re.MULTILINE)
HEADER_PATTERN = re.compile(r"^#{1,6}\s+", re.MULTILINE)
CODE_BLOCK_PATTERN = re.compile(r"```[\s\S]*?```", re.MULTILINE)
TABLE_MARKER_PATTERN = re.compile(r"^[\s]*\|[^|]+\|[\s]*$", re.MULTILINE)

# 英文大写匹配
EN_UPPER_PATTERN = re.compile(r"\b[A-Z][a-z]+\b")


# ──────────────────────────────────────────────
# Core Calculation Functions
# ──────────────────────────────────────────────


def _normalize_score(raw: float, expected_max: float = 50.0, scale: float = 1.0) -> float:
    """
    将原始分数归一化到 0-1 区间。

    Args:
        raw: 原始值（如每千字符的连接词数）
        expected_max: 期望最大值，超过此值压缩
        scale: 缩放系数

    Returns:
        float: 归一化后的值 (0.0-1.0)
    """
    if raw <= 0:
        return 0.0
    normalized = math.log1p(raw * scale) / math.log1p(expected_max * scale)
    return min(1.0, normalized)


def calculate_logic_density(text: str, language: str = "zh") -> float:
    """
    计算文本的逻辑密度：每千字符的逻辑连接词数量，归一化至 0-1。

    Args:
        text: 输入文本
        language: 语言代码，"zh" 或 "en"

    Returns:
        float: 逻辑密度得分 (0.0-1.0)
    """
    if not text or not text.strip():
        return 0.0

    char_count = len(text.strip())
    if char_count == 0:
        return 0.0

    if language == "en":
        connectors = EN_LOGIC_CONNECTORS
        words = text.lower().split()
        # 英文按单词匹配
        connector_count = sum(1 for w in words if w.strip(".,;:!?") in connectors)
        # 每千词计算
        word_count = len(words) or 1
        raw_density = connector_count / word_count * 1000
    else:
        connectors = ZH_LOGIC_CONNECTORS
        # 中文按字符滑动窗口匹配
        connector_count = 0
        for conn in connectors:
            connector_count += text.count(conn)
        raw_density = connector_count / char_count * 1000

    return _normalize_score(raw_density, expected_max=40.0)


def calculate_entity_density(text: str, language: str = "zh") -> float:
    """
    计算文本的实体密度：每千字符的命名实体数量，归一化至 0-1。

    实体包括：数字/百分比、专有名词、领域术语、日期。
    中文通过特定后缀标记识别专有名词，英文通过大写识别。

    Args:
        text: 输入文本
        language: 语言代码，"zh" 或 "en"

    Returns:
        float: 实体密度得分 (0.0-1.0)
    """
    if not text or not text.strip():
        return 0.0

    char_count = len(text.strip())
    if char_count == 0:
        return 0.0

    entity_count = 0.0

    if language == "en":
        # 数字/百分比
        entity_count += len(EN_NUMBER_PATTERN.findall(text)) * 0.5
        # 大写专有名词
        entity_count += len(EN_UPPER_PATTERN.findall(text)) * 0.5
        # 日期
        entity_count += len(EN_DATE_PATTERN.findall(text)) * 0.5
    else:
        # 数字/百分比
        entity_count += len(ZH_NUMBER_PATTERN.findall(text)) * 0.5
        # 带后缀的专有名词
        for marker in ZH_PROPER_NOUN_MARKERS:
            pattern = re.compile(
                rf"[^\s，。、；：！？,\.;:!?]{{{1,10}}}{marker}"
            )
            entity_count += len(pattern.findall(text)) * 0.3
        # 日期
        entity_count += len(ZH_DATE_PATTERN.findall(text)) * 0.5

    raw_density = entity_count / char_count * 1000
    return _normalize_score(raw_density, expected_max=30.0)


def calculate_struct_density(text: str) -> float:
    """
    计算文本的结构密度：衡量结构性元素（列表、标题、代码块、表格）的密度。

    不依赖语言参数，因为结构性标记语言无关。

    Args:
        text: 输入文本

    Returns:
        float: 结构密度得分 (0.0-1.0)
    """
    if not text or not text.strip():
        return 0.0

    char_count = len(text.strip())
    if char_count == 0:
        return 0.0

    struct_count = 0.0

    # Bullet points
    struct_count += len(BULLET_PATTERN.findall(text)) * 0.3
    # Numbered lists
    struct_count += len(NUMBERED_LIST_PATTERN.findall(text)) * 0.3
    # Headers
    struct_count += len(HEADER_PATTERN.findall(text)) * 0.5
    # Code blocks (weighted higher for substantial structure)
    struct_count += len(CODE_BLOCK_PATTERN.findall(text)) * 1.0
    # Table markers
    struct_count += len(TABLE_MARKER_PATTERN.findall(text)) * 0.4

    raw_density = struct_count / char_count * 1000
    return _normalize_score(raw_density, expected_max=20.0)


def calculate_base_score(text: str, language: str = "zh") -> dict[str, Any]:
    """
    计算文本的综合语义密度得分。

    权重:
        - 逻辑密度 (logic): 0.35
        - 实体密度 (entity): 0.35
        - 结构密度 (struct): 0.30

    Args:
        text: 输入文本
        language: 语言代码，"zh" 或 "en"

    Returns:
        dict: 包含各项密度得分和综合得分
    """
    logic = calculate_logic_density(text, language)
    entity = calculate_entity_density(text, language)
    struct = calculate_struct_density(text)

    composite = 0.35 * logic + 0.35 * entity + 0.30 * struct

    return {
        "logic": round(logic, 4),
        "entity": round(entity, 4),
        "struct": round(struct, 4),
        "composite": round(composite, 4),
        "language": language,
    }


def _compute_distribution(scores: list[float]) -> dict[str, float]:
    """
    计算分数分布统计。

    Args:
        scores: 分数列表

    Returns:
        dict: 分布统计（mean, median, std, min, max, q1, q3）
    """
    if not scores:
        return {
            "mean": 0.0, "median": 0.0, "std": 0.0,
            "min": 0.0, "max": 0.0, "q1": 0.0, "q3": 0.0,
            "count": 0,
        }

    sorted_scores = sorted(scores)
    n = len(sorted_scores)
    mean_val = sum(sorted_scores) / n
    variance = sum((x - mean_val) ** 2 for x in sorted_scores) / n
    std_val = math.sqrt(variance)

    def percentile(sorted_data: list[float], p: float) -> float:
        idx = p / 100.0 * (len(sorted_data) - 1)
        lo = int(idx)
        hi = min(lo + 1, len(sorted_data) - 1)
        frac = idx - lo
        return sorted_data[lo] * (1 - frac) + sorted_data[hi] * frac

    return {
        "mean": round(mean_val, 4),
        "median": round(sorted_scores[n // 2], 4),
        "std": round(std_val, 4),
        "min": round(sorted_scores[0], 4),
        "max": round(sorted_scores[-1], 4),
        "q1": round(percentile(sorted_scores, 25), 4),
        "q3": round(percentile(sorted_scores, 75), 4),
        "count": n,
    }


def analyze_density_report(
    chunks: list[dict[str, Any]],
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    处理多个文本块，返回按密度排序的分析报告。

    每个 chunk 应包含:
        - id: 块标识符
        - content: 文本内容
        - language: 语言代码（可选，默认 "zh"）

    Args:
        chunks: 文本块列表
        config: 配置字典（可选），支持:
            - language: 默认语言（默认 "zh"）
            - top_k: 最高密度块数量（默认 5）
            - bottom_k: 最低密度块数量（默认 5）

    Returns:
        dict: 排名结果、四分位摘要、分布统计
    """
    if config is None:
        config = {}

    default_language = config.get("language", "zh")
    top_k = config.get("top_k", 5)
    bottom_k = config.get("bottom_k", 5)

    scored_chunks: list[dict[str, Any]] = []
    composite_scores: list[float] = []

    for chunk in chunks:
        chunk_id = chunk.get("id", "unknown")
        content = chunk.get("content", "")
        lang = chunk.get("language", default_language)

        scores = calculate_base_score(content, lang)
        scored_chunks.append({
            "id": chunk_id,
            "scores": scores,
            "content_length": len(content.strip()),
        })
        composite_scores.append(scores["composite"])

    # Sort by composite score descending
    scored_chunks.sort(key=lambda x: x["scores"]["composite"], reverse=True)

    # Get ranked items
    ranked_items = []
    for item in scored_chunks:
        ranked_items.append({
            "id": item["id"],
            "rank": len(ranked_items) + 1,
            "scores": item["scores"],
            "content_length": item["content_length"],
        })

    # Quartile summary
    n = len(ranked_items)
    if n >= 4:
        q_size = n // 4
        top_quartile = [r["id"] for r in ranked_items[:q_size]]
        bottom_quartile = [r["id"] for r in ranked_items[-q_size:]] if q_size > 0 else []
    else:
        top_quartile = [r["id"] for r in ranked_items[:max(1, n)]]
        bottom_quartile = [r["id"] for r in ranked_items[-max(1, n):]]

    distribution = _compute_distribution(composite_scores)

    return {
        "ranked": ranked_items[:max(top_k + bottom_k, len(ranked_items))],
        "top_quartile": top_quartile,
        "bottom_quartile": bottom_quartile,
        "distribution": distribution,
        "total_chunks": len(chunks),
    }
