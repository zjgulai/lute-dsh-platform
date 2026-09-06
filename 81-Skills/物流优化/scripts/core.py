"""
物流优化核心逻辑 (Logistics Optimizer Core)

提供承运商对比、TCO 分析、运输模式优化、承运商绩效评分及完整物流方案生成。
"""

from __future__ import annotations
import math
from typing import Any


def compare_shipping_options(
    origin: str,
    dest: str,
    cargo: dict[str, float],
    carriers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """比较多个承运商的运输方案，排序并评分。

    Args:
        origin: 始发地
        dest: 目的地
        cargo: 货物信息，需包含:
            - weight_kg (float): 重量 (kg)
            - volume_cbm (float): 体积 (立方米)
            - value_usd (float): 货值 (USD)
        carriers: 承运商列表，每个元素需包含:
            - name (str): 承运商名称
            - transit_days (float): 运输天数
            - cost_per_kg (float): 每公斤费用
            - base_rate (float): 基础费率 (可选，默认 0)
            - reliability_score (float): 可靠性评分 (0~1), 可选
            - damage_rate (float): 破损率 (0~1), 可选

    Returns:
        list[dict]: 按综合评分降序排列的承运商方案列表，每项包含:
            - name, transit_days, cost_per_kg, total_cost, reliability_score,
              score (综合评分), rank

    Raises:
        ValueError: 输入参数无效
    """
    if not carriers:
        raise ValueError("承运商列表不能为空")
    if cargo.get("weight_kg", 0) <= 0 and cargo.get("volume_cbm", 0) <= 0:
        raise ValueError("货物重量和体积不能同时为零")

    weight = cargo.get("weight_kg", 0)
    volume = cargo.get("volume_cbm", 0)
    value = cargo.get("value_usd", 0)

    results: list[dict[str, Any]] = []
    for i, carrier in enumerate(carriers):
        name = carrier.get("name", f"承运商_{i}")
        transit_days = float(carrier.get("transit_days", 1))
        cost_per_kg = float(carrier.get("cost_per_kg", 0))
        base_rate = float(carrier.get("base_rate", 0))
        reliability = float(carrier.get("reliability_score", 0.9))
        damage_rate = float(carrier.get("damage_rate", 0.01))

        # Chargeable weight: actual weight vs volumetric weight (assume 1 CBM = 167 kg)
        volumetric_weight = volume * 167
        chargeable_weight = max(weight, volumetric_weight)

        total_cost = base_rate + chargeable_weight * cost_per_kg

        # Composite score: weighted factors
        # - Cost efficiency (lower cost = higher score): normalized 0-1
        # - Transit speed (lower days = higher score): normalized 0-1
        # - Reliability: directly 0-1
        results.append({
            "name": name,
            "transit_days": transit_days,
            "cost_per_kg": round(cost_per_kg, 2),
            "total_cost": round(total_cost, 2),
            "chargeable_weight": round(chargeable_weight, 2),
            "reliability_score": reliability,
            "damage_rate": damage_rate,
        })

    # Normalize cost and transit days for scoring (lower is better)
    max_cost = max(r["total_cost"] for r in results) or 1
    max_days = max(r["transit_days"] for r in results) or 1

    for r in results:
        cost_score = 1 - (r["total_cost"] / max_cost * 0.5)  # capped at 0.5 penalty
        transit_score = 1 - (r["transit_days"] / max_days * 0.3)
        reliability_score = r["reliability_score"] * 0.5
        r["score"] = round(
            cost_score * 0.35
            + transit_score * 0.25
            + reliability_score * 0.25
            + (1 - r["damage_rate"]) * 0.15,
            4,
        )

    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)

    # Assign ranks
    for rank, r in enumerate(results, 1):
        r["rank"] = rank

    return results


def calculate_tco(
    route: dict[str, Any],
    annual_volume: float,
    monthly_shipments: float,
) -> dict[str, Any]:
    """计算运输路线总拥有成本 (Total Cost of Ownership)。

    包含: 运输费用 + 仓储费用 + 关税 + 保险 + 库存持有成本

    Args:
        route: 路线信息，需包含:
            - transport_cost_per_unit (float): 每单运输费用
            - warehousing_cost_per_month (float): 月仓储费用
            - customs_duty_rate (float): 关税率 (如 0.1 = 10%)
            - avg_unit_value (float): 平均每单货值
        annual_volume: 年货量 (单数)
        monthly_shipments: 月均发货频次

    Returns:
        dict: {
            'annual_transport': float, 'annual_warehousing': float,
            'annual_customs': float, 'annual_insurance': float,
            'annual_inventory_carrying': float, 'total_annual_tco': float,
            'cost_per_shipment': float, 'breakdown': dict
        }
    """
    transport_per_unit = route.get("transport_cost_per_unit", 0)
    warehouse_per_month = route.get("warehousing_cost_per_month", 0)
    duty_rate = route.get("customs_duty_rate", 0)
    avg_value = route.get("avg_unit_value", 0)

    annual_transport = transport_per_unit * annual_volume
    annual_warehousing = warehouse_per_month * 12
    annual_customs = duty_rate * avg_value * annual_volume
    annual_insurance = avg_value * annual_volume * 0.005  # standard 0.5% of insured value
    annual_inventory_carrying = avg_value * annual_volume * 0.2  # 20% carrying cost

    total = (
        annual_transport
        + annual_warehousing
        + annual_customs
        + annual_insurance
        + annual_inventory_carrying
    )

    return {
        "annual_transport": round(annual_transport, 2),
        "annual_warehousing": round(annual_warehousing, 2),
        "annual_customs": round(annual_customs, 2),
        "annual_insurance": round(annual_insurance, 2),
        "annual_inventory_carrying": round(annual_inventory_carrying, 2),
        "total_annual_tco": round(total, 2),
        "cost_per_shipment": round(total / annual_volume, 2) if annual_volume > 0 else 0,
        "breakdown": {
            "transport_pct": round(annual_transport / total * 100, 1) if total > 0 else 0,
            "warehousing_pct": round(annual_warehousing / total * 100, 1) if total > 0 else 0,
            "customs_pct": round(annual_customs / total * 100, 1) if total > 0 else 0,
            "insurance_pct": round(annual_insurance / total * 100, 1) if total > 0 else 0,
            "inventory_carrying_pct": round(annual_inventory_carrying / total * 100, 1) if total > 0 else 0,
        },
    }


def optimize_mode_split(
    cargo_volume: float,
    routes: list[dict[str, Any]],
    constraints: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """优化海运/空运/陆运的运输模式分配 (简易背包算法)。

    Args:
        cargo_volume: 总货量 (立方米或吨)
        routes: 各运输模式的路线信息，每项需包含:
            - mode (str): 模式名 (sea/air/rail/road)
            - cost_per_unit (float): 每单位成本
            - transit_days (float): 运输天数
            - max_capacity (float): 最大容量
        constraints:
            - max_budget (float): 最大预算 (可选)
            - max_transit_days (float): 最大运输天数 (可选)
            - min_sea_pct (float): 海运最低比例 (可选)
            - min_air_pct (float): 空运最低比例 (可选)

    Returns:
        dict: {
            'mode_split': {mode: volume},
            'total_cost': float,
            'weighted_transit_days': float,
            'total_volume': float,
            'feasible': bool,
        }
    """
    if not routes:
        raise ValueError("路线列表不能为空")
    if cargo_volume <= 0:
        raise ValueError(f"货量必须 > 0 (当前: {cargo_volume})")

    constraints = constraints or {}
    max_budget = constraints.get("max_budget", float("inf"))
    max_days = constraints.get("max_transit_days", float("inf"))

    # Sort routes by cost per unit ascending
    sorted_routes = sorted(routes, key=lambda r: r.get("cost_per_unit", 0))
    total_capacity = sum(r.get("max_capacity", float("inf")) for r in routes)

    if cargo_volume > total_capacity:
        raise ValueError(
            f"总容量 ({total_capacity}) 不足以承载货量 ({cargo_volume})"
        )

    remaining = cargo_volume
    mode_split: dict[str, float] = {}
    total_cost = 0.0
    weighted_days = 0.0

    # Greedy allocation: fill cheapest modes first
    for route in sorted_routes:
        mode = route.get("mode", "unknown")
        capacity = route.get("max_capacity", float("inf"))
        cost = route.get("cost_per_unit", 0)
        days = route.get("transit_days", 1)

        allocated = min(remaining, capacity)
        if allocated <= 0:
            continue

        mode_split[mode] = round(allocated, 2)
        remaining -= allocated
        total_cost += allocated * cost
        weighted_days += allocated * days

        if remaining <= 0:
            break

    weighted_days = round(weighted_days / cargo_volume, 1) if cargo_volume > 0 else 0

    result: dict[str, Any] = {
        "mode_split": mode_split,
        "total_cost": round(total_cost, 2),
        "weighted_transit_days": weighted_days,
        "total_volume": cargo_volume,
        "feasible": True,
    }

    # Check budget feasibility
    if total_cost > max_budget:
        result["feasible"] = False
        result["budget_overage"] = round(total_cost - max_budget, 2)

    # Check transit time feasibility
    if weighted_days > max_days:
        result["feasible"] = False
        result["days_overage"] = round(weighted_days - max_days, 1)

    return result


def score_carrier_performance(
    historical_data: list[dict[str, Any]],
) -> dict[str, Any]:
    """基于历史数据评估承运商绩效。

    四个维度: 准时率、破损率、成本波动率、沟通评分

    Args:
        historical_data: 历史物流记录列表，每项可包含:
            - on_time (bool): 是否准时送达
            - damaged (bool): 是否有破损
            - actual_cost (float): 实际费用
            - estimated_cost (float): 预估费用
            - communication_score (float): 沟通评分 (0~5)

    Returns:
        dict: {
            'on_time_rate': float, 'damage_rate': float,
            'cost_variance': float, 'communication_score': float,
            'composite_score': float, 'total_shipments': int
        }
    """
    total = len(historical_data)
    if total == 0:
        return {
            "on_time_rate": 0.0,
            "damage_rate": 0.0,
            "cost_variance": 0.0,
            "communication_score": 0.0,
            "composite_score": 0.0,
            "total_shipments": 0,
        }

    on_time_count = sum(1 for s in historical_data if s.get("on_time", False))
    damage_count = sum(1 for s in historical_data if s.get("damaged", False))

    cost_variances = []
    comm_scores = []
    for s in historical_data:
        actual = s.get("actual_cost")
        estimated = s.get("estimated_cost")
        if actual is not None and estimated is not None and estimated > 0:
            cost_variances.append(abs(actual - estimated) / estimated)
        cs = s.get("communication_score")
        if cs is not None:
            comm_scores.append(cs)

    on_time_rate = round(on_time_count / total, 4)
    damage_rate = round(damage_count / total, 4)
    cost_variance = round(
        statistics.mean(cost_variances) if cost_variances else 0.0, 4
    )
    communication_score = round(
        statistics.mean(comm_scores) if comm_scores else 0.0, 4
    )

    # Composite: 40% on-time, 25% damage (inverted), 20% cost stability, 15% communication
    composite = (
        on_time_rate * 0.40
        + (1 - damage_rate) * 0.25
        + (1 - min(cost_variance, 1)) * 0.20
        + (communication_score / 5) * 0.15
    )

    return {
        "on_time_rate": on_time_rate,
        "damage_rate": damage_rate,
        "cost_variance": cost_variance,
        "communication_score": communication_score,
        "composite_score": round(composite, 4),
        "total_shipments": total,
    }


def generate_logistics_plan(
    origin: str,
    dest: str,
    cargo: dict[str, float],
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """生成完整的物流方案报告。

    执行 pipeline: 承运商对比 -> TCO 分析 -> 模式优化 -> 综合建议

    Args:
        origin: 始发地
        dest: 目的地
        cargo: 货物信息 (weight_kg, volume_cbm, value_usd)
        config: 配置字典，支持:
            - carriers (list[dict]): 承运商列表
            - annual_volume (float): 年货量
            - monthly_shipments (float): 月发货频次
            - warehousing_cost (float): 月仓储费
            - customs_rate (float): 关税率
            - constraints (dict): 运力约束

    Returns:
        dict: 完整物流方案报告
    """
    cfg = config or {}
    carriers = cfg.get("carriers", [])
    annual_volume = cfg.get("annual_volume", 1000)
    monthly_shipments = cfg.get("monthly_shipments", 20)
    warehousing_cost = cfg.get("warehousing_cost", 1000)
    customs_rate = cfg.get("customs_rate", 0.0)
    constraints = cfg.get("constraints", {})
    routes_config = cfg.get("routes", [])

    # 1. Compare shipping options
    shipping_options = compare_shipping_options(origin, dest, cargo, carriers) if carriers else []

    # 2. TCO analysis
    avg_value = cargo.get("value_usd", 100)
    avg_transport_cost = (
        shipping_options[0]["total_cost"] / 1 if shipping_options else 50
    )
    route = {
        "transport_cost_per_unit": avg_transport_cost,
        "warehousing_cost_per_month": warehousing_cost,
        "customs_duty_rate": customs_rate,
        "avg_unit_value": avg_value,
    }
    tco = calculate_tco(route, annual_volume, monthly_shipments)

    # 3. Mode split optimization
    total_volume = cargo.get("volume_cbm", 1)
    mode_split = optimize_mode_split(total_volume, routes_config, constraints) if routes_config else None

    return {
        "origin": origin,
        "dest": dest,
        "cargo": cargo,
        "shipping_options_ranked": shipping_options,
        "recommended_carrier": shipping_options[0] if shipping_options else None,
        "tco_analysis": tco,
        "mode_split_optimization": mode_split,
        "summary": {
            "total_carriers_evaluated": len(carriers),
            "estimated_cost_per_shipment": tco["cost_per_shipment"],
            "annual_tco": tco["total_annual_tco"],
            "best_transit_days": shipping_options[0]["transit_days"] if shipping_options else None,
        },
    }


import statistics  # needed for score_carrier_performance
