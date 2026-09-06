"""
电商CSV预处理核心逻辑 (E-Commerce CSV Processor Core)

提供电商订单CSV数据的字段映射、清洗、标准化和异常检测功能。
可作为独立模块使用，也可通过 run.py CLI 调用。

Usage:
    from scripts.core import process_csv

    df = process_csv("raw_orders.csv", platform="taobao")
    print(generate_quality_report(df))
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

try:
    from skills._shared.data_validator import (
        detect_platform_format as shared_detect_platform,
        generate_quality_report as shared_generate_report,
        validate_fields,
        detect_outliers,
    )
except ImportError:
    shared_detect_platform = None
    shared_generate_report = None
    validate_fields = None
    detect_outliers = None

try:
    from skills._shared.ecom_kpi import (
        DEFAULT_FIELD_MAP,
        TAOBAO_FIELD_MAP,
        normalize_dataframe as shared_normalize,
    )
except ImportError:
    DEFAULT_FIELD_MAP = {}
    TAOBAO_FIELD_MAP = {}
    shared_normalize = None

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════
# Platform Field Maps
# ═══════════════════════════════════════════════════════

PLATFORM_FIELD_MAPS: dict[str, dict[str, str]] = {
    "taobao": {
        "订单编号": "order_id",
        "买家会员名": "customer_id",
        "订单创建时间": "order_date",
        "付款时间": "order_date",
        "订单金额(元)": "amount",
        "实付金额": "amount",
        "商品标题": "sku_name",
        "商品编码": "sku_id",
        "购买数量": "quantity",
        "收货省份": "province",
        "收货城市": "city",
        "订单状态": "order_status",
    },
    "jd": {
        "京东订单号": "order_id",
        "下单时间": "order_date",
        "商品名称": "sku_name",
        "商品编号": "sku_id",
        "数量": "quantity",
        "实付金额": "amount",
        "收件人省份": "province",
        "收件人城市": "city",
        "买家昵称": "customer_id",
    },
    "pinduoduo": {
        "订单号": "order_id",
        "商品": "sku_name",
        "商品ID": "sku_id",
        "数量": "quantity",
        "实付金额": "amount",
        "收货人": "customer_id",
        "省": "province",
        "市": "city",
        "下单时间": "order_date",
    },
    "douyin": {
        "订单ID": "order_id",
        "商品名称": "sku_name",
        "下单时间": "order_date",
        "商家": "platform",
        "实付金额": "amount",
        "数量": "quantity",
        "收货人手机号": "customer_id",
    },
    "amazon": {
        "order-id": "order_id",
        "purchase-date": "order_date",
        "product-name": "sku_name",
        "asin": "sku_id",
        "quantity": "quantity",
        "item-price": "amount",
        "buyer-email": "customer_id",
    },
    "shopify": {
        "Name": "order_id",
        "Created at": "order_date",
        "Lineitem name": "sku_name",
        "Lineitem sku": "sku_id",
        "Lineitem quantity": "quantity",
        "Total": "amount",
        "Email": "customer_id",
    },
}

STANDARD_FIELDS = [
    "order_id",
    "order_date",
    "amount",
    "sku_id",
    "sku_name",
    "quantity",
    "customer_id",
    "province",
    "city",
    "platform",
    "is_promo",
    "order_status",
]

NUMERIC_FIELDS = ["amount", "quantity"]

REQUIRED_FIELDS = ["order_id", "order_date", "amount"]


# ═══════════════════════════════════════════════════════
# CSV Loading
# ═══════════════════════════════════════════════════════

def detect_encoding(file_path: str | Path, sample_bytes: int = 8192) -> str:
    """
    检测CSV文件的字符编码。依次尝试 utf-8, gbk, gb2312。

    Args:
        file_path: CSV文件路径
        sample_bytes: 用于检测的样本字节数

    Returns:
        str: 检测到的编码 ('utf-8', 'gbk', 'gb2312')
    """
    path = Path(file_path)
    raw = path.read_bytes()[:sample_bytes]

    for enc in ("utf-8", "gbk", "gb2312"):
        try:
            raw.decode(enc)
            return enc
        except (UnicodeDecodeError, LookupError):
            continue

    # 最后回退 gbk (中文CSV最常见)
    return "gbk"


def load_csv(
    file_path: str | Path,
    encoding: Optional[str] = None,
    **kwargs,
) -> pd.DataFrame:
    """
    加载CSV文件，自动处理编码检测和常见解析问题。

    Args:
        file_path: CSV文件路径
        encoding: 强制指定编码。为None时自动检测。
        **kwargs: 传递给 pd.read_csv 的额外参数

    Returns:
        pd.DataFrame: 解析后的DataFrame
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"CSV文件不存在: {file_path}")

    if encoding is None:
        encoding = detect_encoding(path)

    logger.info("加载CSV: %s (编码: %s)", file_path, encoding)

    try:
        df = pd.read_csv(path, encoding=encoding, **kwargs)
    except UnicodeDecodeError:
        # 编码检测失败时的回退策略
        logger.warning("编码 %s 解析失败, 尝试 gbk 回退", encoding)
        df = pd.read_csv(path, encoding="gbk", **kwargs)
    except Exception:
        # 尝试检测分隔符
        logger.warning("默认解析失败, 尝试自动检测分隔符")
        with open(path, "rb") as f:
            first_line = f.read(4096).decode(encoding or "gbk", errors="replace")
        sep = detect_separator(first_line)
        df = pd.read_csv(path, encoding=encoding or "gbk", sep=sep)

    df.columns = df.columns.str.strip()
    return df


def detect_separator(first_line: str) -> str:
    """
    检测CSV分隔符: 优先 tab, 逗号, 分号。

    Args:
        first_line: CSV 首行内容

    Returns:
        str: 分隔符
    """
    for sep in ("\t", ",", ";"):
        if sep in first_line:
            return sep
    return ","


# ═══════════════════════════════════════════════════════
# Platform Detection
# ═══════════════════════════════════════════════════════

def detect_platform_format(df: pd.DataFrame) -> str:
    """
    自动检测数据来源平台。使用 _shared.data_validator 的基础检测，
    并叠加 ecom-csv-processor 的专有列签名。

    Args:
        df: 原始 DataFrame

    Returns:
        str: 平台名 ('taobao'/'jd'/'pinduoduo'/'douyin'/'amazon'/'shopify'/'unknown')
    """
    # 先走共享模块的基础检测
    result = shared_detect_platform(df)

    # 如果共享模块检测出结果，直接返回
    if result != "unknown":
        return result

    # 专有二次检测：查找列名中的平台关键词
    cols_str = " ".join(df.columns)
    platform_keywords = {
        "taobao": ["淘宝", "taobao", "天猫", "tmall"],
        "jd": ["京东", "jd"],
        "pinduoduo": ["拼多多", "pdd"],
        "douyin": ["抖音", "douyin", "火山"],
        "amazon": ["amazon", "asin"],
        "shopify": ["shopify", "lineitem"],
    }

    for platform, keywords in platform_keywords.items():
        lower_cols = cols_str.lower()
        if any(kw.lower() in lower_cols for kw in keywords):
            return platform

    return "unknown"


# ═══════════════════════════════════════════════════════
# Field Mapping
# ═══════════════════════════════════════════════════════

def _invert_map(m: dict[str, str]) -> dict[str, str]:
    """反转映射字典: 标准名 -> 原始名"""
    return {v: k for k, v in m.items()}


def map_fields(
    df: pd.DataFrame,
    field_map: Optional[dict[str, str]] = None,
) -> pd.DataFrame:
    """
    应用字段映射，将原始列名转换为标准字段名。

    行为:
    - 如果 field_map 为 None, 会自动检测平台并应用对应的平台映射
    - field_map 格式: {原始列名: 标准列名}
    - 只保留能被映射的列, 未匹配的列会被丢弃
    - 映射后添加 platform 标记（如果未存在）

    Args:
        df: 原始 DataFrame
        field_map: 自定义字段映射。None 时自动检测。

    Returns:
        pd.DataFrame: 映射后的 DataFrame（仅含标准字段的子集）
    """
    if field_map is None:
        platform = detect_platform_format(df)
        logger.info("检测到平台: %s", platform)

        if platform == "unknown":
            logger.warning("平台检测失败, 尝试通用模糊匹配")
            return _fuzzy_map_fields(df)

        mapping = PLATFORM_FIELD_MAPS.get(platform)
        if mapping is None:
            logger.warning("平台 %s 无内置映射, 回退模糊匹配", platform)
            return _fuzzy_map_fields(df)
    else:
        mapping = field_map

    # 只映射存在的列
    valid_mapping = {k: v for k, v in mapping.items() if k in df.columns}
    mapped = df.rename(columns=valid_mapping).copy()

    # 保留的列: 映射后的标准列
    keep_cols = list(set(valid_mapping.values()))
    mapped = mapped[[c for c in keep_cols if c in mapped.columns]]

    # 添加 platform 标记
    if "platform" not in mapped.columns:
        mapped["platform"] = field_map.get("platform") if field_map else None

    return mapped


def _fuzzy_map_fields(df: pd.DataFrame) -> pd.DataFrame:
    """
    通用模糊字段映射: 通过列名关键词匹配来映射未知平台的数据。

    映射规则（不区分大小写）:
    - 含 "id" / "编号" / "订单号" -> order_id
    - 含 "日期" / "时间" / "date" / "time" -> order_date
    - 含 "金额" / "价格" / "price" / "amount" / "total" -> amount
    - 含 "数量" / "quantity" / "qty" / "个数" -> quantity
    - 含 "sku" / "商品" / "产品" / "名称" / "product" / "name" -> sku_name
    - 含 "客户" / "买家" / "会员" / "customer" / "buyer" -> customer_id
    - 含 "省份" / "省" / "province" / "state" -> province
    - 含 "城市" / "市" / "city" -> city
    """
    KEYWORD_RULES = [
        ("order_id", ["id", "编号", "订单号", "order"]),
        ("order_date", ["日期", "时间", "date", "time", "创建", "下单"]),
        ("amount", ["金额", "价格", "price", "amount", "total", "实付"]),
        ("quantity", ["数量", "quantity", "qty", "个数"]),
        ("sku_name", ["sku", "商品", "产品", "名称", "product", "name", "标题"]),
        ("sku_id", ["编码", "sku_id", "sku_id", "商品id"]),
        ("customer_id", ["客户", "买家", "会员", "customer", "buyer", "user", "昵称"]),
        ("province", ["省份", "省", "province", "state"]),
        ("city", ["城市", "市", "city"]),
    ]

    mapping = {}
    for col in df.columns:
        col_lower = col.lower()
        for std_name, keywords in KEYWORD_RULES:
            if any(kw.lower() in col_lower for kw in keywords):
                mapping[col] = std_name
                break

    if not mapping:
        logger.warning("模糊映射无法匹配任何列, 返回原始 DataFrame")
        return df

    logger.info("模糊映射匹配了 %d/%d 列", len(mapping), len(df.columns))
    return df.rename(columns=mapping).copy()


# ═══════════════════════════════════════════════════════
# Data Type Standardization
# ═══════════════════════════════════════════════════════

def _parse_date_flexible(series: pd.Series) -> pd.Series:
    """
    灵活解析多种日期格式为统一的 YYYY-MM-DD 字符串。

    支持的格式示例:
    - 2026-03-15, 2026/03/15, 2026年3月15日
    - 03/15/2026, 15/03/2026
    - 2026-03-15 14:30:00 (日期部分)
    - Unix 时间戳 (秒/毫秒)
    """
    # 尝试标准解析
    parsed = pd.to_datetime(series, errors="coerce")

    # 如果大量解析失败, 尝试其他常见格式
    if parsed.isna().sum() > len(series) * 0.5:
        # 尝试处理中文日期格式: 2026年3月15日
        cleaned = series.astype(str).str.replace(
            r"(\d{4})年(\d{1,2})月(\d{1,2})日?", r"\1-\2-\3", regex=True
        )
        parsed = pd.to_datetime(cleaned, errors="coerce")

    return parsed


def standardize_data_types(df: pd.DataFrame) -> pd.DataFrame:
    """
    标准化DataFrame的数据类型: 日期、金额、数量。

    - order_date: 统一为 datetime 类型
    - amount: 转为 float, 移除货币符号和千分位逗号
    - quantity: 转为 int
    - 字符串列去除首尾空格

    Args:
        df: 待处理的 DataFrame

    Returns:
        pd.DataFrame: 类型标准化后的 DataFrame
    """
    result = df.copy()

    # 去除所有字符串列的首尾空格
    for col in result.select_dtypes(include=["object"]).columns:
        result[col] = result[col].astype(str).str.strip()

    # order_date 标准化
    if "order_date" in result.columns:
        result["order_date"] = _parse_date_flexible(result["order_date"])
        # 保持字符串格式 YYYY-MM-DD 方便CSV输出
        result["order_date"] = result["order_date"].dt.strftime("%Y-%m-%d")

    # order_time 提取 (如果 order_date 含时间信息, 拆到 order_time 列)
    if "order_datetime" in result.columns:
        dt_parsed = pd.to_datetime(result["order_datetime"], errors="coerce")
        result["order_date"] = dt_parsed.dt.strftime("%Y-%m-%d")
        result["order_time"] = dt_parsed.dt.strftime("%H:%M:%S")
        result.drop(columns=["order_datetime"], inplace=True)

    # amount 标准化
    if "amount" in result.columns:
        result["amount"] = result["amount"].astype(str)
        result["amount"] = result["amount"].str.replace(r"[¥￥$,]", "", regex=True)
        result["amount"] = result["amount"].str.replace(",", "")
        result["amount"] = pd.to_numeric(result["amount"], errors="coerce")

    # quantity 标准化
    if "quantity" in result.columns:
        result["quantity"] = pd.to_numeric(result["quantity"], errors="coerce")
        result["quantity"] = result["quantity"].fillna(0).astype(int)

    return result


# ═══════════════════════════════════════════════════════
# Duplicate Detection
# ═══════════════════════════════════════════════════════

def detect_duplicates(
    df: pd.DataFrame,
    key: str = "order_id",
    subset: Optional[list[str]] = None,
) -> pd.DataFrame:
    """
    检测重复订单并生成标记列。

    在 DataFrame 中添加 '_is_duplicate' 列 (bool) 标记重复行。
    首个出现的记录标记为 False, 后续重复为 True。

    Args:
        df: 输入 DataFrame
        key: 用于去重的主键列名
        subset: 用于判断重复的列子集。为 None 时只用 key。

    Returns:
        pd.DataFrame: 含 '_is_duplicate' 标记列的 DataFrame
    """
    result = df.copy()
    dup_cols = subset or [key]

    # 检查必需列是否存在
    missing = [c for c in dup_cols if c not in result.columns]
    if missing:
        logger.warning("去重列 %s 不存在, 跳过去重", missing)
        result["_is_duplicate"] = False
        return result

    result["_is_duplicate"] = result.duplicated(subset=dup_cols, keep="first")

    dup_count = result["_is_duplicate"].sum()
    if dup_count > 0:
        logger.info("检测到 %d 条重复记录 (基于 key=%s)", dup_count, key)

    return result


# ═══════════════════════════════════════════════════════
# Anomaly Detection
# ═══════════════════════════════════════════════════════

def _flag_negative_amounts(series: pd.Series) -> pd.Series:
    """标记负金额为异常"""
    return series < 0 if pd.api.types.is_numeric_dtype(series) else pd.Series(False, index=series.index)


def _flag_zero_amounts(series: pd.Series) -> pd.Series:
    """标记零金额。返回布尔 Series。"""
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric == 0


def _flag_extreme_values(
    series: pd.Series,
    upper_cap: float = 100_000,
    lower_cap: float = 0.01,
) -> pd.Series:
    """标记超出合理范围的值 (默认: 小于0.01或大于10万)"""
    numeric = pd.to_numeric(series, errors="coerce")
    return (numeric > upper_cap) | (numeric < lower_cap)


def detect_anomalies(
    df: pd.DataFrame,
    amount_field: str = "amount",
    quantity_field: str = "quantity",
    amount_upper: float = 100_000,
    amount_lower: float = 0.01,
) -> pd.DataFrame:
    """
    检测数据异常并生成标记列。

    检测项:
    - 负金额 (amount < 0)
    - 零金额 (amount == 0)
    - 超大金额 (amount > upper_cap)
    - 极小金额 (amount < lower_cap)
    - 统计异常值 (IQR 方法, 3倍IQR)
    - 数量异常 (quantity <= 0)

    在 DataFrame 中添加以下列:
    - '_is_anomaly': 整体异常标记
    - '_anomaly_reason': 异常原因描述

    Args:
        df: 输入 DataFrame
        amount_field: 金额字段名
        quantity_field: 数量字段名
        amount_upper: 金额上限阈值
        amount_lower: 金额下限阈值

    Returns:
        pd.DataFrame: 含异常标记列的 DataFrame
    """
    result = df.copy()
    n = len(result)
    result["_is_anomaly"] = False
    result["_anomaly_reason"] = ""

    # 金额异常检测
    if amount_field in result.columns:
        amount = pd.to_numeric(result[amount_field], errors="coerce")

        neg_mask = amount < 0
        zero_mask = amount == 0
        extreme_mask = (amount > amount_upper) | (amount < amount_lower)

        # IQR 异常 (仅对非负、非零的值做)
        positive_amounts = amount[amount > 0]
        if len(positive_amounts) > 5:
            outlier_mask = detect_outliers(positive_amounts, method="iqr", threshold=3.0)
        else:
            outlier_mask = pd.Series(False, index=positive_amounts.index)

        # 汇总异常标记
        result.loc[neg_mask, "_is_anomaly"] = True
        result.loc[neg_mask, "_anomaly_reason"] += "金额为负; "

        result.loc[zero_mask, "_is_anomaly"] = True
        result.loc[zero_mask, "_anomaly_reason"] += "金额为0; "

        result.loc[extreme_mask, "_is_anomaly"] = True
        result.loc[extreme_mask, "_anomaly_reason"] += (
            f"金额超出范围[{amount_lower}, {amount_upper}]; "
        )

        # 统计异常只对有正值的行标记
        anomaly_idx = positive_amounts[outlier_mask].index
        result.loc[anomaly_idx, "_is_anomaly"] = True
        result.loc[anomaly_idx, "_anomaly_reason"] += "金额统计异常(IQR); "

    # 数量异常检测
    if quantity_field in result.columns:
        qty = pd.to_numeric(result[quantity_field], errors="coerce")
        qty_neg_mask = qty <= 0
        result.loc[qty_neg_mask, "_is_anomaly"] = True
        result.loc[qty_neg_mask, "_anomaly_reason"] += "数量异常(<=0); "

    # 清理尾部分隔符
    result["_anomaly_reason"] = result["_anomaly_reason"].str.rstrip("; ")

    anomaly_count = result["_is_anomaly"].sum()
    if anomaly_count > 0:
        logger.info("检测到 %d 条异常记录 (%.1f%%)", anomaly_count, anomaly_count / n * 100)

    return result


# ═══════════════════════════════════════════════════════
# Quality Report
# ═══════════════════════════════════════════════════════

def generate_quality_report(df: pd.DataFrame) -> dict:
    """
    生成全面的数据质量报告。

    委托 _shared.data_validator.generate_quality_report 进行基础分析,
    并补充 ecom-csv-processor 专有内容 (异常分布、建议等)。

    Args:
        df: 经过检测/映射/标准化处理的 DataFrame

    Returns:
        dict: 包含以下键:
            - total_rows: 总记录数
            - total_columns: 总列数
            - detected_platform: 检测到的平台
            - missing_values: {列名: 缺失数}
            - duplicate_rows: 重复行数 (基于 _is_duplicate 列)
            - anomaly_rows: 异常行数 (基于 _is_anomaly 列)
            - anomaly_detail: {类别: 数量} 异常分类明细
            - negative_amounts: 负金额数
            - zero_amounts: 零金额数
            - valid_rows: 有效记录数
            - valid_pct: 有效记录百分比
            - field_stats: {列名: {非空, 空值率, 唯一值数}}
            - suggestions: list[str] 改进建议
    """
    base_report = shared_generate_report(
        df,
        required_fields=REQUIRED_FIELDS,
        numeric_fields=NUMERIC_FIELDS,
        date_field="order_date",
        id_field="order_id",
        amount_field="amount",
    )

    report = base_report.to_dict()

    # 补充专有指标
    report["duplicate_rows"] = int(df["_is_duplicate"].sum()) if "_is_duplicate" in df.columns else 0
    report["anomaly_rows"] = int(df["_is_anomaly"].sum()) if "_is_anomaly" in df.columns else 0

    # 异常分类明细
    anomaly_detail: dict[str, int] = {}
    if "_anomaly_reason" in df.columns:
        anomaly_only = df[df["_is_anomaly"]]
        for reasons in anomaly_only["_anomaly_reason"]:
            for reason_part in reasons.split("; "):
                reason_part = reason_part.strip()
                if reason_part:
                    anomaly_detail[reason_part] = anomaly_detail.get(reason_part, 0) + 1
    report["anomaly_detail"] = anomaly_detail

    # 有效记录统计
    total = report["total_rows"]
    invalid = report["duplicate_rows"] + report["anomaly_rows"]
    report["valid_rows"] = max(total - invalid, 0)
    report["valid_pct"] = round(report["valid_rows"] / max(total, 1) * 100, 1)

    # 字段级统计
    field_stats: dict[str, dict] = {}
    for col in df.columns:
        if col.startswith("_"):
            continue
        total_cells = len(df[col])
        non_null = int(df[col].notna().sum())
        field_stats[col] = {
            "non_null": non_null,
            "null_rate": round((total_cells - non_null) / max(total_cells, 1) * 100, 1),
            "unique_values": int(df[col].nunique()),
        }
    report["field_stats"] = field_stats

    # 改进建议
    suggestions: list[str] = []
    if report["anomaly_rows"] > 0:
        suggestions.append(f"{report['anomaly_rows']} 条异常记录建议人工复核")
    if report["duplicate_rows"] > 0:
        suggestions.append(f"检测到 {report['duplicate_rows']} 条重复记录, 已自动标记")
    if report.get("missing_values"):
        high_missing = [f for f, c in report["missing_values"].items() if c > report["total_rows"] * 0.1]
        if high_missing:
            suggestions.append(f"字段 {', '.join(high_missing)} 缺失率超过10%, 建议完善数据收集")
    if report.get("negative_amounts", 0) > 0:
        suggestions.append(f"存在 {report['negative_amounts']} 条负金额记录, 确认是否为退款订单")
    if report["valid_pct"] < 90:
        suggestions.append("有效数据率低于90%, 建议检查上游数据源")

    report["suggestions"] = suggestions

    return report


# ═══════════════════════════════════════════════════════
# Main Pipeline
# ═══════════════════════════════════════════════════════

def process_csv(
    input_path: str | Path,
    output_path: Optional[str | Path] = None,
    platform: Optional[str] = None,
    field_map: Optional[dict[str, str]] = None,
    encoding: Optional[str] = None,
    dedup_key: str = "order_id",
    remove_duplicates: bool = True,
) -> dict:
    """
    完整的CSV预处理流水线: 加载 -> 映射 -> 标准化 -> 去重 -> 异常检测 -> 报告。

    Args:
        input_path: 输入CSV文件路径
        output_path: 输出CSV文件路径。为 None 时不输出。
        platform: 强制指定平台。为 None 时自动检测。
        field_map: 自定义字段映射。优先于平台映射。
        encoding: 文件编码。为 None 时自动检测。
        dedup_key: 去重主键列名
        remove_duplicates: 是否在输出中移除重复行

    Returns:
        dict: 包含 'report' (质量报告) 和 'data' (处理后的 DataFrame) 的字典
    """
    logger.info("开始处理: %s", input_path)

    # Step 1: 加载
    df = load_csv(input_path, encoding=encoding)

    # Step 2: 字段映射
    if field_map:
        df = map_fields(df, field_map=field_map)
    elif platform:
        mapping = PLATFORM_FIELD_MAPS.get(platform)
        if mapping:
            df = map_fields(df, field_map=mapping)
        else:
            logger.warning("未知平台 '%s', 尝试自动检测", platform)
            df = map_fields(df)
    else:
        df = map_fields(df)

    # Step 3: 标准化
    df = standardize_data_types(df)

    # Step 4: 去重
    df = detect_duplicates(df, key=dedup_key)

    # Step 5: 异常检测
    df = detect_anomalies(df)

    # Step 6: 质量报告
    report = generate_quality_report(df)

    # Step 7: 输出
    if output_path:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        output_df = df.copy()
        if remove_duplicates and "_is_duplicate" in output_df.columns:
            output_df = output_df[~output_df["_is_duplicate"]]

        # 移除辅助列
        output_cols = [c for c in output_df.columns if not c.startswith("_")]
        output_df = output_df[output_cols]

        out_enc = encoding or "utf-8-sig"
        output_df.to_csv(output_path, index=False, encoding=out_enc)
        logger.info("输出文件: %s (%d 行)", output_path, len(output_df))

    return {"report": report, "data": df}


def _json_safe(value):
    """Convert pandas/numpy values to JSON-safe Python primitives."""
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


def process(
    input_path: str | Path | None = None,
    file_path: str | Path | None = None,
    output_path: Optional[str | Path] = None,
    platform: Optional[str] = None,
    field_map: Optional[dict[str, str]] = None,
    encoding: Optional[str] = None,
    dedup_key: str = "order_id",
    remove_duplicates: bool = True,
    **_: object,
) -> dict:
    """
    SkillRunner-compatible entrypoint.

    Returns only JSON-safe data so workflow jobs can persist the output.
    """
    source_path = input_path or file_path
    if not source_path:
        raise ValueError("input_path or file_path is required")

    result = process_csv(
        input_path=source_path,
        output_path=output_path,
        platform=platform,
        field_map=field_map,
        encoding=encoding,
        dedup_key=dedup_key,
        remove_duplicates=remove_duplicates,
    )
    df = result["data"]
    report = _json_safe(result["report"])
    preview_df = df.head(5).where(pd.notnull(df), None)
    preview = _json_safe(preview_df.to_dict(orient="records"))

    valid_pct = report.get("valid_pct")
    anomaly_rows = report.get("anomaly_rows", 0)
    return {
        "summary": (
            f"CSV processed: {len(df)} rows, "
            f"valid_pct={valid_pct}, anomaly_rows={anomaly_rows}"
        ),
        "input_path": str(source_path),
        "output_path": str(output_path) if output_path else "",
        "row_count": int(len(df)),
        "columns": [str(c) for c in df.columns if not str(c).startswith("_")],
        "report": report,
        "preview": preview,
    }
