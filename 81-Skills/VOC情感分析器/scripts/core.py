"""
VOC 情感分析核心逻辑 (Voice of Customer Sentiment Analyzer Core)

提供评价解析、情感分布统计、基于关键词的维度情感提取、痛点/赞美排序、
优先级矩阵和完整报告生成。与 _shared.data_validator 协作进行数据质量校验。

Usage:
    from scripts.core import generate_voc_report

    report = generate_voc_report(reviews, config={})
    print(report["sentiment_distribution"])
"""

from __future__ import annotations

import csv
import json
import logging
import re
from collections import Counter, defaultdict
from datetime import datetime
from io import StringIO
from typing import Any, Optional

import pandas as pd

logger = logging.getLogger(__name__)


def check_sample_size(df: pd.DataFrame, min_rows: int = 50) -> dict:
    """自包含的样本量检查：返回样本量是否足以支撑可靠分析。

    替代对 skills._shared.data_validator 的依赖，保持本包单目录可独立运行。
    """
    n = int(len(df)) if df is not None else 0
    return {
        "sample_size": n,
        "min_required": min_rows,
        "is_sufficient": n >= min_rows,
        "note": (
            "样本量充足，分析结论可靠"
            if n >= min_rows
            else f"样本量不足（{n} < {min_rows}），建议补充评价后再做可靠分析"
        ),
    }

# 默认情感维度关键词
ASPECT_KEYWORDS: dict[str, list[str]] = {
    "quality": [
        "质量", "材质", "做工", "quality", "material", "build",
        "broke", "broken", "cheap", "durable", "耐用", "结实",
    ],
    "price": [
        "价格", "贵", "便宜", "性价比", "price", "expensive",
        "cheap", "worth", "value", "划算", "不值",
    ],
    "delivery": [
        "物流", "快递", "发货", "配送", "delivery", "shipping",
        "arrived", "package", "tracking", "追踪", "收到",
    ],
    "packaging": [
        "包装", "盒子", "packaging", "box", "damaged", "broken box",
        "封口", "破损", "完好",
    ],
    "usability": [
        "好用", "方便", "简单", "难用", "复杂", "easy", "hard",
        "intuitive", "setup", "install", "上手", "操作",
    ],
    "size": [
        "大小", "尺寸", "size", "fit", "small", "large", "tight",
        "loose", "合适", "偏大", "偏小",
    ],
    "appearance": [
        "外观", "颜色", "好看", "漂亮", "丑", "color", "look",
        "design", "ugly", "beautiful", "时尚", "颜值",
    ],
    "customer_service": [
        "客服", "售后", "退货", "换货", "service", "return",
        "refund", "support", "态度", "响应",
    ],
    "performance": [
        "效果", "性能", "功能", "电池", "performance", "battery",
        "function", "power", "续航", "速度", "卡顿",
    ],
    "safety": [
        "安全", "无毒", "过敏", "safe", "toxic", "allergy",
        "allergic", "bpa", "环保", "有害",
    ],
}

# 情感极性关键词 (中英文)
_POSITIVE_WORDS_EN = {
    "great", "excellent", "amazing", "awesome", "fantastic", "wonderful",
    "good", "nice", "love", "perfect", "best", "happy", "satisfied",
    "recommend", "impressed", "outstanding", "superb", "brilliant",
    "fast", "quick", "easy", "comfortable", "beautiful", "durable",
}
_POSITIVE_WORDS_CN = {
    "好", "棒", "赞", "满意", "喜欢", "推荐", "不错", "完美",
    "优秀", "出色", "好用", "方便", "实惠", "值得", "好评",
    "很好", "非常好", "超级好", "值得推荐",
}
_NEGATIVE_WORDS_EN = {
    "bad", "terrible", "awful", "horrible", "poor", "worst", "hate",
    "disappointed", "broken", "defective", "useless", "waste",
    "slow", "difficult", "uncomfortable", "ugly", "cheap", "return",
    "refund", "cancel", "damaged", "frustrating", "annoying",
}
_NEGATIVE_WORDS_CN = {
    "差", "烂", "垃圾", "失望", "后悔", "退款", "退货", "坏",
    "糟糕", "不行", "差评", "太差", "不好", "难用", "复杂",
    "很慢", "卡顿", "不值", "骗", "假", "破损",
}

_NPS_DETRACTOR_THRESHOLD = 3  # 评分 <= 3 = 贬损者
_NPS_PROMOTER_THRESHOLD = 4   # 评分 >= 4 = 推荐者 (对 5 分制)

_WARNING_EMPTY_REVIEWS = "评价列表为空, 返回空结果"
_WARNING_SINGLE_REVIEW = "仅含 1 条评价, 情感分布置信度低"
_WARNING_NO_RATINGS = "评价缺少评分字段, 使用文本情感分析替代"


# ═══════════════════════════════════════════════════════════
# Review Parsing
# ═══════════════════════════════════════════════════════════


def parse_reviews(
    reviews_data: str | list[dict[str, Any]],
    source_format: str = "csv",
) -> list[dict[str, Any]]:
    """
    将原始评价数据规范化为统一记录格式。

    支持 CSV 字符串/路径和 JSON 数组格式。输出每条记录包含:
    {text, rating, date, product_id, platform}

    Args:
        reviews_data: CSV 文本、JSON 文本或字典列表
        source_format: "csv" 或 "json"

    Returns:
        list[dict]: 规范化后的评价记录列表
            [
                {
                    "text": "产品质量很好",
                    "rating": 5.0,
                    "date": "2026-01-15",
                    "product_id": "SKU001",
                    "platform": "amazon",
                },
                ...
            ]

    Raises:
        ValueError: 无法解析输入数据
    """
    if isinstance(reviews_data, list) and len(reviews_data) > 0 and isinstance(reviews_data[0], dict):
        # 已经是字典列表，直接规范化
        return _normalize_records(reviews_data)

    if not isinstance(reviews_data, str) or not reviews_data.strip():
        logger.warning(_WARNING_EMPTY_REVIEWS)
        return []

    try:
        if source_format == "json":
            parsed = json.loads(reviews_data)
            if isinstance(parsed, dict):
                parsed = parsed.get("reviews", parsed.get("data", [parsed]))
            if isinstance(parsed, list):
                return _normalize_records(parsed)
            raise ValueError("JSON 格式不支持, 期望数组或 {reviews: [...]}")
        else:
            return _parse_csv_text(reviews_data)
    except json.JSONDecodeError:
        # 不是 JSON，尝试作为 CSV 文本解析
        return _parse_csv_text(reviews_data)


def _parse_csv_text(csv_text: str) -> list[dict[str, Any]]:
    """解析 CSV 格式文本。"""
    try:
        reader = csv.DictReader(StringIO(csv_text))
        rows = list(reader)
        if not rows:
            return []
        return _normalize_records(rows)
    except Exception as e:
        raise ValueError(f"CSV 解析失败: {e}")


def _normalize_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    将任意字典列表标准化为统一格式。

    自动匹配常见的列名变体（支持中英文）。
    """
    field_mappings = {
        "text": ["text", "review_text", "review", "content", "comment", "body",
                 "评价内容", "评论", "内容", "评价", "review_body", "reviewContent"],
        "rating": ["rating", "star", "stars", "score", "rate", "评分数", "评分",
                   "star_rating", "ratings", "overall"],
        "date": ["date", "review_date", "created_at", "timestamp", "time",
                 "日期", "评价时间", "创建时间", "reviewTime", "unixReviewTime"],
        "product_id": ["product_id", "productId", "product", "asin", "sku",
                       "商品ID", "产品ID", "产品编号"],
        "platform": ["platform", "source", "site", "channel", "平台", "来源"],
    }

    normalized: list[dict[str, Any]] = []
    if not records:
        return normalized

    # 从第一条记录推断列映射
    first = records[0] if records else {}
    col_map: dict[str, str] = {}
    for target, candidates in field_mappings.items():
        for col in first.keys():
            col_lower = col.lower().strip()
            if col_lower in [c.lower() for c in candidates]:
                col_map[target] = col
                break

    for record in records:
        entry: dict[str, Any] = {
            "text": "",
            "rating": None,
            "date": None,
            "product_id": None,
            "platform": None,
        }

        # 文本
        text_field = col_map.get("text")
        if text_field and text_field in record:
            entry["text"] = str(record[text_field]).strip()

        # 评分
        rating_field = col_map.get("rating")
        if rating_field and rating_field in record:
            try:
                val = record[rating_field]
                if isinstance(val, (int, float)):
                    entry["rating"] = float(val)
                elif isinstance(val, str):
                    entry["rating"] = float(val.strip())
            except (ValueError, TypeError):
                entry["rating"] = None

        # 日期
        date_field = col_map.get("date")
        if date_field and date_field in record:
            date_val = str(record[date_field]).strip()
            if date_val:
                try:
                    entry["date"] = _normalize_date(date_val)
                except Exception:
                    entry["date"] = date_val

        # 产品 ID
        pid_field = col_map.get("product_id")
        if pid_field and pid_field in record:
            entry["product_id"] = str(record[pid_field]).strip()

        # 平台
        platform_field = col_map.get("platform")
        if platform_field and platform_field in record:
            entry["platform"] = str(record[platform_field]).strip()

        normalized.append(entry)

    return normalized


def _normalize_date(date_str: str) -> str:
    """尝试多种格式解析日期，返回 YYYY-MM-DD。"""
    formats = [
        "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%m-%d-%Y",
        "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S",
        "%B %d, %Y", "%b %d, %Y", "%d %B %Y",
        "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    # 尝试 pandas 解析 (如果可用)
    try:
        import pandas as pd
        ts = pd.Timestamp(date_str)
        return ts.strftime("%Y-%m-%d")
    except Exception:
        pass
    return date_str


# ═══════════════════════════════════════════════════════════
# Sentiment Distribution
# ═══════════════════════════════════════════════════════════


def compute_sentiment_distribution(reviews: list[dict[str, Any]]) -> dict[str, Any]:
    """
    计算评价的情感分布。

    当有评分字段时，基于 5 星评分划分正/中/负；
    否则基于文本关键词进行情感极性打分。

    Args:
        reviews: 规范化后的评价记录列表

    Returns:
        dict: {
            "total_reviews": 500,
            "by_rating": {1: 10, 2: 15, 3: 50, 4: 200, 5: 225},
            "positive": {"count": 425, "pct": "85.0%"},
            "neutral": {"count": 50, "pct": "10.0%"},
            "negative": {"count": 25, "pct": "5.0%"},
            "nps_score": 40.0,
            "avg_rating": 4.2,
            "method": "rating_based" | "text_based",
        }
    """
    if not reviews:
        logger.warning(_WARNING_EMPTY_REVIEWS)
        return _empty_distribution()

    if len(reviews) == 1:
        logger.warning(_WARNING_SINGLE_REVIEW)

    # 检查是否有评分字段
    has_ratings = any(r.get("rating") is not None for r in reviews)
    rating_counts: dict[int, int] = defaultdict(int)
    star_sum = 0.0
    star_count = 0
    text_positive = 0
    text_negative = 0
    text_neutral = 0

    for review in reviews:
        rating = review.get("rating")
        if rating is not None and has_ratings:
            star = round(rating)
            star = max(1, min(5, star))
            rating_counts[star] += 1
            star_sum += float(rating)
            star_count += 1
        else:
            # 基于文本的情感分析
            sent = _text_sentiment(review.get("text", ""))
            if sent == "positive":
                text_positive += 1
            elif sent == "negative":
                text_negative += 1
            else:
                text_neutral += 1

    if has_ratings and star_count > 0:
        # 基于评分
        positive_count = rating_counts.get(4, 0) + rating_counts.get(5, 0)
        neutral_count = rating_counts.get(3, 0)
        negative_count = rating_counts.get(1, 0) + rating_counts.get(2, 0)
        total = star_count
        avg_rating = round(star_sum / star_count, 2)

        # NPS 计算 (5分制: 推荐者 4-5, 贬损者 1-3)
        promoters = rating_counts.get(4, 0) + rating_counts.get(5, 0)
        detractors = rating_counts.get(1, 0) + rating_counts.get(2, 0) + rating_counts.get(3, 0)
        nps = round((promoters - detractors) / max(total, 1) * 100, 1)

        method = "rating_based"
    else:
        # 基于文本
        total = text_positive + text_negative + text_neutral
        positive_count = text_positive
        neutral_count = text_neutral
        negative_count = text_negative
        avg_rating = None
        nps = None
        method = "text_based"

    return {
        "total_reviews": len(reviews),
        "by_rating": dict(rating_counts) if rating_counts else {},
        "positive": {
            "count": positive_count,
            "pct": f"{positive_count / max(total, 1):.1%}",
        },
        "neutral": {
            "count": neutral_count,
            "pct": f"{neutral_count / max(total, 1):.1%}",
        },
        "negative": {
            "count": negative_count,
            "pct": f"{negative_count / max(total, 1):.1%}",
        },
        "nps_score": nps,
        "avg_rating": avg_rating,
        "method": method,
    }


def _text_sentiment(text: str) -> str:
    """基于关键词的文本情感判断。"""
    if not text:
        return "neutral"

    text_lower = text.lower()

    pos_count = sum(1 for w in _POSITIVE_WORDS_EN if w in text_lower)
    pos_count += sum(1 for w in _POSITIVE_WORDS_CN if w in text)

    neg_count = sum(1 for w in _NEGATIVE_WORDS_EN if w in text_lower)
    neg_count += sum(1 for w in _NEGATIVE_WORDS_CN if w in text)

    if pos_count > neg_count:
        return "positive"
    elif neg_count > pos_count:
        return "negative"
    else:
        return "neutral"


def _empty_distribution() -> dict[str, Any]:
    """返回空的情感分布。"""
    return {
        "total_reviews": 0,
        "by_rating": {},
        "positive": {"count": 0, "pct": "0.0%"},
        "neutral": {"count": 0, "pct": "0.0%"},
        "negative": {"count": 0, "pct": "0.0%"},
        "nps_score": None,
        "avg_rating": None,
        "method": "none",
    }


# ═══════════════════════════════════════════════════════════
# Aspect-Based Sentiment Extraction
# ═══════════════════════════════════════════════════════════


def extract_aspects_by_keyword(
    reviews: list[dict[str, Any]],
    aspect_keywords: Optional[dict[str, list[str]]] = None,
) -> dict[str, dict[str, Any]]:
    """
    基于关键词的维度情感提取。

    遍历每条评价文本，根据各维度的关键词匹配，统计每个维度下的
    正面/中性/负面数量、情感得分和代表性短语。

    Args:
        reviews: 规范化后的评价记录列表
        aspect_keywords: 自定义维度关键词映射，默认使用 ASPECT_KEYWORDS

    Returns:
        dict: {
            "quality": {
                "positive_count": 120,
                "neutral_count": 30,
                "negative_count": 20,
                "total_mentions": 170,
                "score": 0.59,
                "top_phrases": ["品质优秀", "材料扎实"],
            },
            "price": {...},
            ...
        }
    """
    keywords = aspect_keywords or ASPECT_KEYWORDS

    result: dict[str, dict[str, Any]] = {}
    for aspect_name in keywords:
        result[aspect_name] = {
            "positive_count": 0,
            "neutral_count": 0,
            "negative_count": 0,
            "total_mentions": 0,
            "score": 0.0,
            "top_phrases": [],
        }

    if not reviews:
        return result

    phrase_collector: dict[str, list[str]] = {k: [] for k in keywords}

    for review in reviews:
        text = review.get("text", "") or ""
        if not text:
            continue

        text_lower = text.lower()

        for aspect_name, kw_list in keywords.items():
            # 检查是否命中关键词
            matched = False
            matched_kw = None
            for kw in kw_list:
                if kw.lower() in text_lower or kw in text:
                    matched = True
                    matched_kw = kw
                    break

            if not matched:
                continue

            # 情感判断
            sentiment = _text_sentiment(text)
            result[aspect_name]["total_mentions"] += 1
            if sentiment == "positive":
                result[aspect_name]["positive_count"] += 1
            elif sentiment == "negative":
                result[aspect_name]["negative_count"] += 1
            else:
                result[aspect_name]["neutral_count"] += 1

            # 收集短语片段
            if matched_kw:
                idx = text_lower.find(matched_kw.lower()) if matched_kw.lower() in text_lower else text.find(matched_kw)
                if idx >= 0:
                    start = max(0, idx - 15)
                    end = min(len(text), idx + len(matched_kw) + 15)
                    snippet = text[start:end].strip()
                    if snippet and snippet not in phrase_collector[aspect_name]:
                        phrase_collector[aspect_name].append(snippet)

    # 计算得分 (-1 ~ 1) 并整理 top_phrases
    for aspect_name, data in result.items():
        total = data["total_mentions"]
        if total > 0:
            score = (data["positive_count"] - data["negative_count"]) / total
            data["score"] = round(score, 4)
        else:
            data["score"] = 0.0

        # 取代表性短语 (最多 5 条，优先短句)
        phrases = phrase_collector.get(aspect_name, [])
        phrases.sort(key=lambda p: (len(p), p))
        data["top_phrases"] = phrases[:5]

    return result


# ═══════════════════════════════════════════════════════════
# Pain Points and Praise Ranking
# ═══════════════════════════════════════════════════════════


def rank_pain_points_and_praise(
    aspect_analysis: dict[str, dict[str, Any]],
    top_n: int = 10,
) -> dict[str, list[dict[str, Any]]]:
    """
    根据维度情感分析，提取高频痛点（负面集中）和高频赞美（正面集中）。

    Args:
        aspect_analysis: extract_aspects_by_keyword 的输出
        top_n: 返回前 N 项

    Returns:
        dict: {
            "pain_points": [
                {"aspect": "quality", "frequency": 80, "severity": 0.35,
                 "top_complaints": ["材质很一般", ...]},
                ...
            ],
            "praise_areas": [
                {"aspect": "delivery", "frequency": 120, "score": 0.85,
                 "top_praise": ["发货快", ...]},
                ...
            ],
        }
    """
    pain_points: list[dict[str, Any]] = []
    praise_areas: list[dict[str, Any]] = []

    for aspect_name, data in aspect_analysis.items():
        total = data.get("total_mentions", 0)
        if total == 0:
            continue

        neg_count = data.get("negative_count", 0)
        pos_count = data.get("positive_count", 0)
        score = data.get("score", 0.0)

        # 痛点: 负面数量较多且 score 低
        pain_severity = (neg_count / max(total, 1)) * (1.0 - max(score, 0))
        if neg_count > 0:
            pain_points.append({
                "aspect": aspect_name,
                "frequency": total,
                "negative_count": neg_count,
                "severity": round(pain_severity, 4),
                "score": score,
                "top_complaints": data.get("top_phrases", [])[:3],
            })

        # 赞美: 正面数量多且 score 高
        if pos_count > 0 and score > 0.2:
            praise_areas.append({
                "aspect": aspect_name,
                "frequency": total,
                "positive_count": pos_count,
                "score": score,
                "top_praise": data.get("top_phrases", [])[:3],
            })

    # 痛点按 severity 降序
    pain_points.sort(key=lambda p: p["severity"], reverse=True)
    # 赞美按 score 降序
    praise_areas.sort(key=lambda p: p["score"], reverse=True)

    return {
        "pain_points": pain_points[:top_n],
        "praise_areas": praise_areas[:top_n],
    }


# ═══════════════════════════════════════════════════════════
# Priority Matrix
# ═══════════════════════════════════════════════════════════


def build_priority_matrix(
    pain_points: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    将痛点分类为 critical / important / nice-to-have 优先级矩阵。

    分类规则:
    - critical: 频次 high (> median) 且 severity high (> median)
    - important: 频次 high 或 severity high
    - nice_to_have: 频次 low 且 severity low

    Args:
        pain_points: rank_pain_points_and_praise 输出中的 pain_points 列表

    Returns:
        list[dict]: [
            {
                "aspect": "quality",
                "priority": "critical",
                "frequency": 80,
                "severity": 0.35,
                "recommendation": "优先解决质量相关投诉",
            },
            ...
        ]
    """
    if not pain_points:
        return []

    # 计算中位数
    freqs = [p.get("frequency", 0) for p in pain_points]
    sevs = [p.get("severity", 0) for p in pain_points]
    freq_median = _median(freqs) if freqs else 0
    sev_median = _median(sevs) if sevs else 0

    matrix: list[dict[str, Any]] = []
    for pp in pain_points:
        freq = pp.get("frequency", 0)
        sev = pp.get("severity", 0)

        if freq >= freq_median and sev >= sev_median:
            priority = "critical"
        elif freq >= freq_median or sev >= sev_median:
            priority = "important"
        else:
            priority = "nice_to_have"

        aspect = pp.get("aspect", "unknown")
        recommendation = _recommendation_for(aspect, priority)

        matrix.append({
            "aspect": aspect,
            "priority": priority,
            "frequency": freq,
            "severity": sev,
            "recommendation": recommendation,
        })

    # critical 排前
    priority_order = {"critical": 0, "important": 1, "nice_to_have": 2}
    matrix.sort(key=lambda m: (priority_order.get(m["priority"], 9), -m["severity"]))
    return matrix


def _median(values: list[float]) -> float:
    """计算中位数。"""
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    if n == 0:
        return 0.0
    if n % 2 == 1:
        return float(sorted_vals[n // 2])
    return (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2.0


def _recommendation_for(aspect: str, priority: str) -> str:
    """生成针对维度的改进建议。"""
    recs = {
        "quality": "提升原材料品质和品控标准，加强出厂检验",
        "price": "评估定价策略，增加性价比 SKU 或促销活动",
        "delivery": "优化物流链路，缩短配送时效，提升追踪透明度",
        "packaging": "改进包装设计，减少运输破损率",
        "usability": "优化产品设计和用户引导，降低使用门槛",
        "size": "丰富尺码/规格选项，完善尺码指南",
        "appearance": "调研目标用户审美偏好，优化外观设计",
        "customer_service": "加强客服培训，优化退换货流程，提升响应速度",
        "performance": "针对核心性能指标进行技术改进，优化用户体验",
        "safety": "完善安全测试报告，提供权威认证以增强信任",
    }
    base = recs.get(aspect, f"关注 {aspect} 维度用户反馈")
    if priority == "critical":
        return f"【紧急】{base}"
    elif priority == "important":
        return base
    else:
        return f"【后续优化】{base}"


# ═══════════════════════════════════════════════════════════
# Full VOC Report
# ═══════════════════════════════════════════════════════════


def generate_voc_report(
    reviews: list[dict[str, Any]],
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    生成完整 VOC 情感分析报告。

    串联: 数据质量 -> 情感分布 -> 维度情感 -> 痛点/赞美 -> 优先级矩阵

    Args:
        reviews: 规范化后的评价记录列表
        config: 配置字典，支持:
            - aspect_keywords: 自定义维度关键词映射
            - top_n: 痛点/赞美返回数量 (默认 10)
            - min_reviews: 最小评价数量建议 (默认 50)

    Returns:
        dict: {
            "metadata": {"report_type": "voc_sentiment", ...},
            "data_quality": {...},
            "sentiment_distribution": {...},
            "aspect_analysis": {...},
            "pain_points_and_praise": {...},
            "priority_matrix": [...],
            "action_plan": [...],
            "report_text": "...",
        }
    """
    config = config or {}
    aspect_keywords = config.get("aspect_keywords") or ASPECT_KEYWORDS
    top_n = config.get("top_n", 10)
    min_reviews = config.get("min_reviews", 50)

    # 1. 数据质量
    quality = {
        "total_reviews": len(reviews),
        "has_ratings": any(r.get("rating") is not None for r in reviews),
        "has_dates": any(r.get("date") is not None for r in reviews),
        "has_product_ids": any(r.get("product_id") is not None for r in reviews),
        "has_text": any(r.get("text", "").strip() for r in reviews),
        "min_reviews_required": min_reviews,
        "is_analysis_ready": len(reviews) >= min_reviews,
    }
    sample_check = check_sample_size(pd.DataFrame(reviews) if reviews else pd.DataFrame(), min_rows=min_reviews)

    report: dict[str, Any] = {
        "metadata": {
            "report_type": "voc_sentiment",
            "generated_at": datetime.now().isoformat(),
            "total_reviews": len(reviews),
        },
        "data_quality": quality,
        "sample_check": sample_check,
    }

    # 2. 情感分布
    report["sentiment_distribution"] = compute_sentiment_distribution(reviews)

    # 3. 维度情感
    report["aspect_analysis"] = extract_aspects_by_keyword(reviews, aspect_keywords)

    # 4. 痛点与赞美排名
    report["pain_points_and_praise"] = rank_pain_points_and_praise(
        report["aspect_analysis"], top_n=top_n
    )

    # 5. 优先级矩阵
    pain_points = report["pain_points_and_praise"].get("pain_points", [])
    report["priority_matrix"] = build_priority_matrix(pain_points)

    # 6. 行动建议
    report["action_plan"] = _generate_action_plan(
        report["priority_matrix"],
        report["pain_points_and_praise"].get("praise_areas", []),
    )

    # 7. 报告文本
    report["report_text"] = _format_voc_report_text(report)

    return report


def _generate_action_plan(
    priority_matrix: list[dict[str, Any]],
    praise_areas: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """从优先级矩阵生成行动建议列表。"""
    plan: list[dict[str, Any]] = []

    for item in priority_matrix:
        plan.append({
            "priority": 0,
            "aspect": item["aspect"],
            "type": "fix" if item["priority"] == "critical" else "improve",
            "recommendation": item.get("recommendation", ""),
        })

    # 从赞美区域提取卖点建议
    if praise_areas:
        top_praise = praise_areas[0]
        plan.append({
            "priority": 0,
            "aspect": top_praise["aspect"],
            "type": "amplify",
            "recommendation": (
                f"强化 {top_praise['aspect']} 维度优势，将 '{top_praise.get('top_praise', [''])[0] if top_praise.get('top_praise') else ''}'"
                f" 作为核心卖点突出展示"
            ),
        })

    # 优先级编号
    for i, item in enumerate(plan):
        item["priority"] = i + 1

    return plan


def _format_voc_report_text(report: dict[str, Any]) -> str:
    """将报告字典格式化为可读文本。"""
    lines: list[str] = []
    meta = report.get("metadata", {})
    lines.append("=" * 60)
    lines.append("  VOC 情感分析报告")
    lines.append(f"  评价总数: {meta.get('total_reviews', 0)}")
    lines.append(f"  生成时间: {meta.get('generated_at', 'N/A')}")
    lines.append("=" * 60)
    lines.append("")

    # 情感分布
    sd = report.get("sentiment_distribution", {})
    lines.append("[情感分布]")
    lines.append(f"  正面: {sd.get('positive', {}).get('count', 0)} "
                 f"({sd.get('positive', {}).get('pct', '0%')})")
    lines.append(f"  中性: {sd.get('neutral', {}).get('count', 0)} "
                 f"({sd.get('neutral', {}).get('pct', '0%')})")
    lines.append(f"  负面: {sd.get('negative', {}).get('count', 0)} "
                 f"({sd.get('negative', {}).get('pct', '0%')})")
    nps = sd.get("nps_score")
    if nps is not None:
        lines.append(f"  NPS: {nps}")
    avg_r = sd.get("avg_rating")
    if avg_r is not None:
        lines.append(f"  平均评分: {avg_r}")
    lines.append("")

    # 维度分析
    aa = report.get("aspect_analysis", {})
    lines.append("[维度情感分析]")
    lines.append(f"  {'维度':<20} {'提及':>4} {'正面':>4} {'负面':>4} {'得分':>6}")
    lines.append(f"  {'-'*20} {'-'*4} {'-'*4} {'-'*4} {'-'*6}")
    for aspect_name, data in sorted(aa.items(), key=lambda x: x[1].get("total_mentions", 0), reverse=True):
        total = data.get("total_mentions", 0)
        if total > 0:
            pos = data.get("positive_count", 0)
            neg = data.get("negative_count", 0)
            score = data.get("score", 0)
            lines.append(f"  {aspect_name:<20} {total:>4} {pos:>4} {neg:>4} {score:>6.2f}")
    lines.append("")

    # 痛点
    pp = report.get("pain_points_and_praise", {})
    pain = pp.get("pain_points", [])
    if pain:
        lines.append("[Top 痛点]")
        for i, p in enumerate(pain[:5]):
            lines.append(f"  #{i+1} {p.get('aspect', '')} "
                         f"(频次: {p.get('frequency', 0)}, "
                         f"严重度: {p.get('severity', 0):.2f})")
            complaints = p.get("top_complaints", [])
            if complaints:
                lines.append(f"    示例: {complaints[0]}")
        lines.append("")

    # 赞美
    praise = pp.get("praise_areas", [])
    if praise:
        lines.append("[Top 赞美]")
        for i, p in enumerate(praise[:3]):
            lines.append(f"  #{i+1} {p.get('aspect', '')} "
                         f"(得分: {p.get('score', 0):.2f})")
        lines.append("")

    # 优先级
    pm = report.get("priority_matrix", [])
    if pm:
        lines.append("[优先级矩阵]")
        for item in pm:
            tag = {"critical": "CRIT", "important": "IMPT", "nice_to_have": "NICE"}
            lines.append(f"  [{tag.get(item.get('priority', ''), '?')}] "
                         f"{item.get('aspect', '')}: {item.get('recommendation', '')}")
        lines.append("")

    # 行动
    ap = report.get("action_plan", [])
    if ap:
        lines.append("[行动建议]")
        for act in ap:
            tag = {"fix": "FIX", "improve": "IMPROVE", "amplify": "AMPLIFY"}
            lines.append(f"  #{act.get('priority', '?')} [{tag.get(act.get('type', ''), '')}] "
                         f"{act.get('recommendation', '')}")
        lines.append("")

    lines.append("=" * 60)
    return "\n".join(lines)


def process(params: dict) -> dict:
    """Validate the typed contract and run the deterministic VOC pipeline."""
    if not isinstance(params, dict):
        raise ValueError("input must be an object")
    allowed_fields = {"reviews", "aspect_keywords", "top_n", "min_reviews"}
    unknown = sorted(set(params) - allowed_fields)
    if unknown:
        raise ValueError(f"unsupported input fields: {', '.join(unknown)}")
    if "reviews" not in params:
        raise ValueError("reviews is required")

    reviews = params["reviews"]
    if isinstance(reviews, str):
        if not reviews.strip():
            raise ValueError("reviews must not be empty")
        reviews = parse_reviews(reviews)
    elif isinstance(reviews, list):
        for index, review in enumerate(reviews):
            if not isinstance(review, dict):
                raise ValueError(f"reviews[{index}] must be an object")
            text = review.get("text")
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"reviews[{index}].text must be a non-empty string")
            if "rating" in review:
                rating = review["rating"]
                if isinstance(rating, bool) or not isinstance(rating, (int, float)):
                    raise ValueError(f"reviews[{index}].rating must be a number")
            for field in ("date", "product_id"):
                if field in review and not isinstance(review[field], str):
                    raise ValueError(f"reviews[{index}].{field} must be a string")
    else:
        raise ValueError("reviews must be a string or array")

    aspect_keywords = params.get("aspect_keywords")
    if aspect_keywords is not None:
        if not isinstance(aspect_keywords, dict):
            raise ValueError("aspect_keywords must be an object")
        for aspect, keywords in aspect_keywords.items():
            if not isinstance(keywords, list) or any(
                not isinstance(keyword, str) or not keyword for keyword in keywords
            ):
                raise ValueError(
                    f"aspect_keywords.{aspect} must be a string array"
                )
    for field in ("top_n", "min_reviews"):
        if field not in params:
            continue
        value = params[field]
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f"{field} must be an integer >= 1")

    return generate_voc_report(reviews, params)
