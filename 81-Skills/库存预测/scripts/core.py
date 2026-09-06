"""
库存预测核心逻辑 (Inventory Forecasting Core)

提供需求预测、安全库存计算、再订货点(ROP)、经济订货量(EOQ)及完整补货计划生成。
"""

from __future__ import annotations
import math
import statistics
from typing import Any

try:
    import pandas as pd
    import numpy as np

    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

# Z-score table for common service levels
Z_SCORE_TABLE: dict[float, float] = {
    0.50: 0.000,
    0.60: 0.253,
    0.70: 0.524,
    0.75: 0.674,
    0.80: 0.842,
    0.85: 1.036,
    0.90: 1.282,
    0.95: 1.645,
    0.96: 1.751,
    0.97: 1.881,
    0.98: 2.054,
    0.99: 2.326,
    0.995: 2.576,
    0.999: 3.090,
}


def _get_z_score(service_level: float) -> float:
    """获取指定服务水平的 Z-score，超出预定义表时线性插值。

    Args:
        service_level: 服务水平 (0~1)

    Returns:
        float: Z-score 值
    """
    levels = sorted(Z_SCORE_TABLE.keys())
    if service_level <= levels[0]:
        return Z_SCORE_TABLE[levels[0]]
    if service_level >= levels[-1]:
        return Z_SCORE_TABLE[levels[-1]]

    # Linear interpolation if service level falls between table entries
    lower = max(l for l in levels if l <= service_level)
    upper = min(l for l in levels if l >= service_level)
    if lower == upper:
        return Z_SCORE_TABLE[lower]

    z_low, z_high = Z_SCORE_TABLE[lower], Z_SCORE_TABLE[upper]
    ratio = (service_level - lower) / (upper - lower)
    return z_low + ratio * (z_high - z_low)


def forecast_demand(
    history: list[float],
    periods: int,
    method: str = "moving_average",
    alpha: float = 0.3,
    weights: list[float] | None = None,
) -> dict[str, Any]:
    """对未来 N 个周期进行需求预测。

    Args:
        history: 历史需求数据列表（按时间顺序）
        periods: 预测的未来周期数
        method: 预测方法
            - 'moving_average': 简单移动平均 (SMA)
            - 'weighted_moving_average': 加权移动平均 (WMA)
            - 'exponential_smoothing': 指数平滑
        alpha: 指数平滑的平滑因子 (0~1)，仅用于 exponential_smoothing
        weights: WMA 的权重列表（长度应等于 len(history)），仅用于 weighted_moving_average

    Returns:
        dict: {
            'forecast_values': list[float] — N 期预测值，
            'confidence_interval': (lower, upper) — 95% 置信区间，
            'method': str — 使用的预测方法，
            'mape': float or None — 历史拟合 MAPE (若历史数据够用)，
            'parameters': dict — 使用的参数
        }

    Raises:
        ValueError: 历史数据不足或 method 无效
    """
    if len(history) < 2:
        raise ValueError(
            f"历史数据不足，至少需要 2 个数据点 (当前: {len(history)})"
        )
    if periods < 1:
        raise ValueError(f"预测周期数必须 >= 1 (当前: {periods})")
    if method not in ("moving_average", "weighted_moving_average", "exponential_smoothing"):
        raise ValueError(
            f"不支持的预测方法: '{method}'。可选: moving_average, "
            f"weighted_moving_average, exponential_smoothing"
        )

    # --- 计算预测值 ---
    if method == "moving_average":
        avg = statistics.mean(history)
        forecast_values = [round(avg, 2)] * periods

    elif method == "weighted_moving_average":
        n = len(history)
        if weights is None:
            # Default: linearly decreasing weights, most recent gets highest
            weights = list(range(1, n + 1))
        if len(weights) != n:
            raise ValueError(
                f"weights 长度 ({len(weights)}) 必须等于 history 长度 ({n})"
            )
        total_weight = sum(weights)
        weighted_avg = sum(h * w for h, w in zip(history, weights)) / total_weight
        forecast_values = [round(weighted_avg, 2)] * periods

    elif method == "exponential_smoothing":
        if not (0 < alpha < 1):
            raise ValueError(f"alpha 必须在 0~1 之间 (当前: {alpha})")
        smoothed = history[0]
        for h in history[1:]:
            smoothed = alpha * h + (1 - alpha) * smoothed
        forecast_values = [round(smoothed, 2)] * periods

    # --- 置信区间 (基于历史标准差) ---
    std_dev = statistics.stdev(history) if len(history) >= 2 else 0.0
    z_95 = 1.96
    margin = z_95 * std_dev
    confidence_interval = (round(sum(forecast_values) / periods - margin, 2),
                           round(sum(forecast_values) / periods + margin, 2))

    # --- MAPE (历史拟合精度) ---
    mape = None
    if method == "moving_average":
        avg = statistics.mean(history)
        mape = _calc_mape(history, [avg] * len(history))
    elif method == "weighted_moving_average":
        mape = _calc_mape(history, [statistics.mean(history)] * len(history))

    return {
        "forecast_values": forecast_values,
        "confidence_interval": confidence_interval,
        "method": method,
        "mape": round(mape, 4) if mape is not None else None,
        "parameters": {"alpha": alpha, "weights": weights, "periods": periods},
    }


def _calc_mape(actual: list[float], predicted: list[float]) -> float | None:
    """计算 MAPE (Mean Absolute Percentage Error)。"""
    if len(actual) != len(predicted) or len(actual) == 0:
        return None
    errors = []
    for a, p in zip(actual, predicted):
        if a == 0:
            continue
        errors.append(abs((a - p) / a))
    if not errors:
        return None
    return (sum(errors) / len(errors)) * 100


def calculate_safety_stock(
    history: list[float],
    lead_time: float,
    service_level: float = 0.95,
) -> float:
    """计算安全库存。

    公式: SS = Z × σ_demand × √LT

    Args:
        history: 历史需求数据（用于计算需求标准差）
        lead_time: 补货周期 (天)
        service_level: 服务水平 (0~1)，默认 0.95

    Returns:
        float: 安全库存数量 (向上取整)

    Raises:
        ValueError: 历史数据不足或 service_level 超出范围
    """
    if len(history) < 2:
        raise ValueError(
            f"历史数据不足，至少需要 2 个数据点计算标准差 (当前: {len(history)})"
        )
    if not (0 < service_level < 1):
        raise ValueError(
            f"service_level 必须在 0~1 之间 (当前: {service_level})"
        )
    if lead_time <= 0:
        raise ValueError(f"lead_time 必须 > 0 (当前: {lead_time})")

    z = _get_z_score(service_level)
    std_demand = statistics.stdev(history)
    safety_stock = z * std_demand * math.sqrt(lead_time)
    return math.ceil(safety_stock * 100) / 100  # 保留2位小数，向上取整


def calculate_rop(
    avg_daily_demand: float,
    lead_time: float,
    safety_stock: float,
) -> float:
    """计算再订货点 (Reorder Point)。

    公式: ROP = d̄ × LT + SS

    Args:
        avg_daily_demand: 平均日需求
        lead_time: 补货周期 (天)
        safety_stock: 安全库存数量

    Returns:
        float: 再订货点 (向上取整)

    Raises:
        ValueError: 输入参数为负
    """
    if avg_daily_demand < 0:
        raise ValueError(f"avg_daily_demand 不能为负 (当前: {avg_daily_demand})")
    if lead_time <= 0:
        raise ValueError(f"lead_time 必须 > 0 (当前: {lead_time})")
    if safety_stock < 0:
        raise ValueError(f"safety_stock 不能为负 (当前: {safety_stock})")

    rop = avg_daily_demand * lead_time + safety_stock
    return math.ceil(rop * 100) / 100


def calculate_eoq(
    annual_demand: float,
    order_cost: float,
    holding_cost: float,
) -> float:
    """计算经济订货量 (Economic Order Quantity)。

    公式: EOQ = √(2DS/H)

    Args:
        annual_demand: 年需求量 (D)
        order_cost: 每次订货成本 (S)
        holding_cost: 单位年持有成本 (H)

    Returns:
        float: 经济订货量 (向上取整)

    Raises:
        ValueError: 输入参数无效
    """
    if annual_demand <= 0:
        raise ValueError(f"annual_demand 必须 > 0 (当前: {annual_demand})")
    if order_cost <= 0:
        raise ValueError(f"order_cost 必须 > 0 (当前: {order_cost})")
    if holding_cost <= 0:
        raise ValueError(f"holding_cost 必须 > 0 (当前: {holding_cost})")

    eoq = math.sqrt(2 * annual_demand * order_cost / holding_cost)
    return math.ceil(eoq * 100) / 100


def generate_replenishment_plan(
    df: "pd.DataFrame",
    product_id: str,
    lead_time: float,
    service_level: float = 0.95,
    config: dict | None = None,
) -> dict[str, Any]:
    """生成完整的补货计划。

    执行 pipeline: 需求预测 -> 安全库存 -> ROP -> EOQ -> 库存预警

    Args:
        df: 包含销售历史数据的 DataFrame，需要 'date' 和 'quantity' 列
        product_id: 产品标识符
        lead_time: 补货周期 (天)
        service_level: 服务水平 (0~1)
        config: 配置字典，支持:
            - forecast_periods (int): 预测未来周期数，默认 30
            - forecast_method (str): 预测方法，默认 'moving_average'
            - order_cost (float): 每次订货成本，默认 100
            - holding_cost_percent (float): 持有成本占单价百分比，默认 0.2
            - unit_price (float): 单价，默认 100
            - current_stock (float): 当前库存，默认 0

    Returns:
        dict: 完整的补货计划报告，包含预测、安全库存、ROP、EOQ 和预警
    """
    cfg = config or {}
    forecast_periods = cfg.get("forecast_periods", 30)
    forecast_method = cfg.get("forecast_method", "moving_average")
    order_cost = cfg.get("order_cost", 100.0)
    holding_cost_percent = cfg.get("holding_cost_percent", 0.2)
    unit_price = cfg.get("unit_price", 100.0)
    current_stock = cfg.get("current_stock", 0.0)

    # Extract quantity history
    if "quantity" not in df.columns:
        raise ValueError("DataFrame 必须包含 'quantity' 列")
    history = df["quantity"].dropna().tolist()
    if len(history) == 0:
        raise ValueError("历史数据为空，无法生成补货计划")

    # 1. Demand forecast
    forecast_result = forecast_demand(
        history, forecast_periods, method=forecast_method
    )
    avg_forecast = (
        sum(forecast_result["forecast_values"]) / forecast_periods
    )

    # 2. Safety stock
    safety_stock = calculate_safety_stock(history, lead_time, service_level)

    # 3. Reorder Point
    avg_daily_demand = avg_forecast  # use forecasted daily average
    rop = calculate_rop(avg_daily_demand, lead_time, safety_stock)

    # 4. EOQ
    annual_demand = avg_daily_demand * 365
    holding_cost = unit_price * holding_cost_percent
    eoq = calculate_eoq(annual_demand, order_cost, holding_cost)

    # 5. Dashboard / alerts
    stockout_risk = current_stock < rop
    days_cover = current_stock / avg_daily_demand if avg_daily_demand > 0 else float("inf")
    overstock_risk = days_cover > 90  # more than 90 days of cover

    alerts = []
    if stockout_risk:
        alerts.append({
            "type": "stockout_risk",
            "severity": "high",
            "message": f"当前库存 ({current_stock}) 低于再订货点 ({rop:.2f})，建议立即补货",
        })
    if overstock_risk:
        alerts.append({
            "type": "overstock_risk",
            "severity": "medium",
            "message": f"当前库存可覆盖 {days_cover:.1f} 天，超过 90 天，建议检查滞销风险",
        })
    if days_cover < lead_time:
        alerts.append({
            "type": "critical_shortage",
            "severity": "critical",
            "message": f"库存仅覆盖 {days_cover:.1f} 天，低于补货周期 ({lead_time} 天)",
        })

    return {
        "product_id": product_id,
        "summary": {
            "avg_forecast": round(avg_forecast, 2),
            "forecast_total": round(sum(forecast_result["forecast_values"]), 2),
            "safety_stock": safety_stock,
            "reorder_point": round(rop, 2),
            "economic_order_quantity": eoq,
            "days_cover": round(days_cover, 1),
        },
        "forecast": forecast_result,
        "inventory_params": {
            "lead_time": lead_time,
            "service_level": service_level,
            "current_stock": current_stock,
            "annual_demand_estimate": round(annual_demand, 2),
        },
        "alerts": alerts,
        "recommendation": (
            "需立即补货" if stockout_risk
            else "库存健康" if not overstock_risk
            else "建议清理库存"
        ),
    }
