"""
供应商评估核心逻辑 (Supplier Evaluator Core)

提供多维度供应商评分、供应商排名、验厂清单、1688店铺评估及完整评估报告。
"""

from __future__ import annotations
from typing import Any

# Default dimension weights
DEFAULT_WEIGHTS: dict[str, float] = {
    "quality_capability": 0.25,
    "production_capacity": 0.15,
    "price_competitiveness": 0.20,
    "delivery_reliability": 0.15,
    "certification_compliance": 0.15,
    "financial_stability": 0.05,
    "communication": 0.05,
}

# Tier thresholds (composite score ranges)
TIER_THRESHOLDS: list[tuple[float, float, str, str]] = [
    (85, 100, "preferred", "首选供应商 — 战略合作伙伴级别"),
    (70, 84.99, "approved", "合格供应商 — 可正常合作"),
    (55, 69.99, "conditional", "有条件通过 — 需改善特定维度后升级"),
    (0, 54.99, "rejected", "不通过 — 不符合准入标准"),
]


def score_supplier(
    profile: dict[str, Any],
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    """对单个供应商进行多维度评分。

    支持的维度 (评分范围 0~100):
        - quality_capability: 质量能力
        - production_capacity: 生产能力
        - price_competitiveness: 价格竞争力
        - delivery_reliability: 交付可靠性
        - certification_compliance: 认证合规
        - financial_stability: 财务稳定性
        - communication: 沟通配合度

    Args:
        profile: 供应商画像，每个维度键对应一个 0~100 的评分。
                  也可包含 'name' (供应商名称) 等元信息。
        weights: 各维度权重字典。未指定时使用 DEFAULT_WEIGHTS。

    Returns:
        dict: {
            'name': str or None,
            'dimension_scores': {维度: 评分},
            'weighted_scores': {维度: 加权后得分},
            'weights_used': {维度: 权重},
            'composite_score': float (0~100),
            'tier': str (preferred/approved/conditional/rejected),
            'tier_label': str,
            'max_possible': float (若全部满分则达到的分数),
        }

    Raises:
        ValueError: 评分超出 0~100 范围
    """
    w = weights or DEFAULT_WEIGHTS.copy()

    dimension_scores: dict[str, float] = {}
    weighted_scores: dict[str, float] = {}
    active_weights: dict[str, float] = {}

    for dim, weight in w.items():
        raw = profile.get(dim)
        if raw is None:
            # Dimension not provided — assign 0 and keep weight (penalizes)
            score = 0.0
        else:
            score = float(raw)
            if not (0 <= score <= 100):
                raise ValueError(
                    f"维度 '{dim}' 评分 {score} 超出范围 [0, 100]"
                )

        dimension_scores[dim] = score
        weighted_scores[dim] = round(score * weight, 2)
        active_weights[dim] = weight

    composite = round(sum(weighted_scores.values()), 2)

    # Classify tier
    tier_key = "rejected"
    tier_label = "不通过"
    for low, high, t_key, t_label in TIER_THRESHOLDS:
        if low <= composite <= high:
            tier_key = t_key
            tier_label = t_label
            break

    max_possible = round(sum(100 * w for w in active_weights.values()), 2)

    return {
        "name": profile.get("name"),
        "dimension_scores": dimension_scores,
        "weighted_scores": weighted_scores,
        "weights_used": active_weights,
        "composite_score": composite,
        "tier": tier_key,
        "tier_label": tier_label,
        "max_possible": max_possible,
    }


def rank_suppliers(
    suppliers: list[dict[str, Any]],
    weights: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """对多个供应商进行评分并排名。

    Args:
        suppliers: 供应商画像列表
        weights: 权重字典

    Returns:
        list[dict]: 按 composite_score 降序排列，每项包含:
            - 所有 score_supplier 返回的字段
            - rank (int): 排名
            - tier (str): 分类
    """
    if not suppliers:
        return []

    results = []
    for profile in suppliers:
        scored = score_supplier(profile, weights)
        results.append(scored)

    # Sort by composite score descending
    results.sort(key=lambda r: r["composite_score"], reverse=True)

    # Assign rank
    for rank, r in enumerate(results, 1):
        r["rank"] = rank

    return results


def generate_audit_checklist(
    supplier_type: str,
    risk_level: str,
) -> list[str]:
    """根据供应商类型和风险等级生成验厂检查清单。

    Args:
        supplier_type: 供应商类型
            - 'factory': 工厂
            - 'trader': 贸易商
            - 'agent': 代理商
        risk_level: 风险等级
            - 'low': 低风险
            - 'medium': 中风险
            - 'high': 高风险

    Returns:
        list[str]: 检查项列表

    Raises:
        ValueError: 不支持的供应商类型或风险等级
    """
    valid_types = ("factory", "trader", "agent")
    if supplier_type not in valid_types:
        raise ValueError(
            f"不支持的供应商类型: '{supplier_type}'。可选: {', '.join(valid_types)}"
        )
    valid_risks = ("low", "medium", "high")
    if risk_level not in valid_risks:
        raise ValueError(
            f"不支持的风险等级: '{risk_level}'。可选: {', '.join(valid_risks)}"
        )

    # Shared base checklist
    base_items = [
        "营业执照与经营范围核对",
        "法人代表身份验证",
        "公司注册地址与实际经营地址一致",
        "税务登记证核查",
        "银行开户许可证核对",
    ]

    # Factory-specific
    factory_items = [
        "工厂实地考察 — 生产车间面积与设备",
        "生产线数量与产能核实",
        "设备清单与维护记录检查",
        "质量管理体系文件审查 (ISO 9001 等)",
        "QC 人员配置与质检流程",
        "原材料仓库管理与批次追溯",
        "成品仓库容量与 FIFO 执行情况",
        "环保设施与排污许可证",
        "消防安全设施检查",
        "员工宿舍与食堂条件评估",
        "工人工作时长与社保核查",
    ]

    # Trader-specific
    trader_items = [
        "主要合作工厂列表核实",
        "与工厂的合作协议/授权书",
        "自有质检团队能力评估",
        "仓库管理能力评估",
        "订单管理系统使用情况",
        "客户投诉处理流程",
    ]

    # Agent-specific
    agent_items = [
        "品牌授权书有效期与范围",
        "代理层级与区域核实",
        "价格条款与返点政策",
        "售后服务体系评估",
        "品牌方合作历史与口碑",
    ]

    # Risk-level additional items
    risk_items: dict[str, list[str]] = {
        "low": [
            "抽样产品检测 (3-5 件)",
        ],
        "medium": [
            "抽样产品检测 (10-15 件)",
            "背景调查 — 经营异常查询",
            "法律诉讼记录核查",
            "主要客户背景访问",
        ],
        "high": [
            "抽样产品检测 (20+ 件)",
            "背景调查 — 经营异常查询",
            "法律诉讼记录核查",
            "主要客户背景访问 (至少 3 家)",
            "银行流水与财务报表核查",
            "关联公司穿透核查",
            "行业通报与黑名单查询",
            "第三方信用报告调取",
        ],
    }

    type_items: dict[str, list[str]] = {
        "factory": factory_items,
        "trader": trader_items,
        "agent": agent_items,
    }

    checklist: list[str] = []
    checklist.extend(base_items)
    checklist.extend(type_items.get(supplier_type, []))
    checklist.extend(risk_items.get(risk_level, []))

    return checklist


def assess_1688_shop(
    shop_data: dict[str, Any],
) -> dict[str, Any]:
    """评估 1688 店铺的综合质量。

    Args:
        shop_data: 1688 店铺数据，包含:
            - years_operating (float): 经营年限
            - transaction_level (str): 交易等级 (如 "3A", "4A", "5A")
            - return_rate (float): 退货率 (0~1)
            - dispute_rate (float): 纠纷率 (0~1)
            - certifications (list[str]): 认证列表
            - factory_verified (bool): 是否通过工厂实地认证
            - avg_rating (float): 平均评分 (0~5) 可选
            - monthly_revenue (float): 月交易额 可选
            - repeat_purchase_rate (float): 复购率 (0~1) 可选

    Returns:
        dict: {
            'shop_score': float (0~100),
            'years_score': float,
            'transaction_score': float,
            'quality_score': float,
            'certification_score': float,
            'factory_verified': bool,
            'risk_flags': list[str],
            'recommendation': str,
        }
    """
    risk_flags: list[str] = []
    score_components: dict[str, float] = {}

    # 1. Years operating (max 20 pts)
    years = shop_data.get("years_operating", 0)
    years_score = min(years / 10 * 20, 20)
    score_components["years_operating"] = round(years_score, 1)
    if years < 1:
        risk_flags.append("经营时间不足 1 年，稳定性存疑")
    elif years < 3:
        risk_flags.append("经营时间不足 3 年，建议谨慎合作")

    # 2. Transaction level (max 25 pts)
    level_str = shop_data.get("transaction_level", "1A")
    level_map: dict[str, float] = {
        "1A": 5, "2A": 8, "3A": 12,
        "4A": 16, "5A": 20, "AA": 22, "AAA": 25,
    }
    transaction_score = level_map.get(level_str.upper(), 5)
    score_components["transaction_level"] = transaction_score

    # 3. Quality (return rate + dispute rate + avg rating, max 30 pts)
    return_rate = shop_data.get("return_rate", 0)
    dispute_rate = shop_data.get("dispute_rate", 0)
    avg_rating = shop_data.get("avg_rating", 4.0)

    return_score = max(0, 10 - return_rate * 100)  # each 1% return = -1 pt
    dispute_score = max(0, 10 - dispute_rate * 200)  # each 0.5% dispute = -1 pt
    rating_score = (avg_rating / 5) * 10

    quality_score = min(return_score + dispute_score + rating_score, 30)
    score_components["quality"] = round(quality_score, 1)

    if return_rate > 0.05:
        risk_flags.append(f"退货率 {return_rate:.1%} 高于 5%")
    if dispute_rate > 0.02:
        risk_flags.append(f"纠纷率 {dispute_rate:.1%} 高于 2%")
    if avg_rating < 3.5:
        risk_flags.append(f"平均评分 {avg_rating} 低于 3.5")

    # 4. Certifications (max 15 pts)
    certs = shop_data.get("certifications", [])
    cert_count = len(certs)
    certification_score = min(cert_count * 5, 15)  # 5 pts per cert, max 15
    score_components["certifications"] = certification_score

    # 5. Factory verification (max 10 pts)
    factory_verified = shop_data.get("factory_verified", False)
    verification_score = 10 if factory_verified else 0
    score_components["factory_verified"] = verification_score
    if not factory_verified:
        risk_flags.append("未通过工厂实地认证")

    # Composite score
    shop_score = round(
        years_score
        + transaction_score
        + quality_score
        + certification_score
        + verification_score,
        1,
    )

    # Recommendation
    if shop_score >= 80:
        recommendation = "推荐合作 — 店铺质量优秀"
    elif shop_score >= 60:
        recommendation = "可考虑合作 — 建议小单试水并与实地验厂结合"
    elif shop_score >= 40:
        recommendation = "谨慎评估 — 低分项需重点核实，建议提高验厂标准"
    else:
        recommendation = "不推荐 — 风险较高，不建议作为主力供应商"

    return {
        "shop_score": shop_score,
        "score_breakdown": score_components,
        "years_operating": years,
        "transaction_level": level_str,
        "factory_verified": factory_verified,
        "risk_flags": risk_flags,
        "recommendation": recommendation,
    }


def generate_evaluation_report(
    supplier: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """生成完整的供应商评估报告。

    执行 pipeline: 多维评分 -> 风险标记 -> 验厂清单 -> 整体建议

    Args:
        supplier: 供应商完整画像，包含评分维度和元信息
        config: 配置字典，支持:
            - weights (dict): 自定义权重
            - supplier_type (str): 供应商类型 (factory/trader/agent)
            - risk_level (str): 风险等级 (low/medium/high)
            - include_audit_checklist (bool): 是否包含验厂清单

    Returns:
        dict: 完整评估报告
    """
    cfg = config or {}
    weights = cfg.get("weights")
    supplier_type = cfg.get("supplier_type", "factory")
    risk_level = cfg.get("risk_level", "medium")
    include_audit = cfg.get("include_audit_checklist", True)

    # 1. Score supplier
    scored = score_supplier(supplier, weights)

    # 2. 1688 assessment if shop data present
    shop_data = supplier.get("shop_data", {})
    shop_assessment = assess_1688_shop(shop_data) if shop_data else None

    # 3. Risk flags
    risk_flags: list[dict[str, str]] = []
    for dim, score in scored["dimension_scores"].items():
        if score < 60:
            risk_flags.append({
                "dimension": dim,
                "score": score,
                "severity": "high" if score < 40 else "medium",
                "note": f"{dim} 评分仅 {score} 分，需重点关注",
            })
    if shop_assessment:
        for flag in shop_assessment.get("risk_flags", []):
            risk_flags.append({
                "dimension": "1688_shop",
                "score": shop_assessment["shop_score"],
                "severity": "medium",
                "note": flag,
            })

    # 4. Audit checklist
    audit_checklist = None
    if include_audit:
        audit_checklist = generate_audit_checklist(supplier_type, risk_level)

    # 5. Overall recommendation
    tier = scored["tier"]
    if tier == "preferred":
        recommendation = "推荐准入 — 可建立战略合作关系"
    elif tier == "approved":
        recommendation = "建议准入 — 建议小单试产后正常合作"
    elif tier == "conditional":
        weak_dims = [
            f"{d}({s})" for d, s in scored["dimension_scores"].items() if s < 70
        ]
        recommendation = (
            f"有条件通过 — 以下维度需改善: {', '.join(weak_dims)}"
            if weak_dims
            else "有条件通过 — 建议验厂后再做最终决定"
        )
    else:
        recommendation = "不推荐准入 — 多项维度不达标"

    return {
        "supplier_name": supplier.get("name"),
        "composite_score": scored["composite_score"],
        "tier": scored["tier"],
        "tier_label": scored["tier_label"],
        "dimension_scores": scored["dimension_scores"],
        "weighted_scores": scored["weighted_scores"],
        "risk_flags": risk_flags,
        "audit_checklist": audit_checklist,
        "recommendation": recommendation,
        "parameters": {
            "supplier_type": supplier_type,
            "risk_level": risk_level,
            "weights_used": scored["weights_used"],
        },
    }
