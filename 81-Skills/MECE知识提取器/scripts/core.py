"""
MECE Knowledge Extractor - 核心提取逻辑

基于 MECE（相互独立、完全穷尽）原则，从文本中提取
标准知识单元（SKU），确保提取结果全面且无重叠。
"""

from __future__ import annotations

import json
import math
import re
from typing import Any, Optional


# ──────────────────────────────────────────────
# Schema Definition
# ──────────────────────────────────────────────

SKU_V2_SCHEMA: dict[str, Any] = {
    "required": [
        "id",
        "title",
        "applicable_objective",
        "core_logic",
        "expected_output",
    ],
    "optional": [
        "tags",
        "prerequisites",
        "confidence",
        "evidence",
    ],
    "types": {
        "id": str,
        "title": str,
        "applicable_objective": str,
        "core_logic": str,
        "expected_output": str,
        "tags": list,
        "prerequisites": list,
        "confidence": (int, float),
        "evidence": str,
    },
}


# ──────────────────────────────────────────────
# SKU Count Estimation
# ──────────────────────────────────────────────


def estimate_target_count(
    chunk: dict[str, Any],
    density_data: Optional[dict[str, Any]] = None,
) -> int:
    """
    估算应从给定文本块中提取的 SKU 数量。

    基础规则: 每 500-800 字符提取 1 个 SKU。
    如果有密度数据，高密度文本可以提取更多 SKU。

    Args:
        chunk: 文本块字典，必须包含 content 字段
        density_data: 密度分析数据（可选），应包含 composite 得分

    Returns:
        int: 估算的 SKU 数量 (1-5)
    """
    content = chunk.get("content", "")
    char_count = len(content.strip())

    if char_count == 0:
        return 1

    # Base estimate: 1 SKU per 600 chars
    base_count = max(1, round(char_count / 600))

    # Adjust by density if available
    if density_data and isinstance(density_data, dict):
        composite = density_data.get("composite", 0.5)
        # Density adjustment: 0.5 -> 1x, 1.0 -> 2x, 0.0 -> 0.5x
        density_factor = 0.5 + composite
        adjusted = round(base_count * density_factor)
        base_count = adjusted

    # Clamp to [1, 5]
    return max(1, min(5, base_count))


# ──────────────────────────────────────────────
# Prompt Builder
# ──────────────────────────────────────────────


def build_extraction_prompt(
    chunk: dict[str, Any],
    target_count: int,
    config: Optional[dict[str, Any]] = None,
) -> str:
    """
    构建结构化的 LLM 提取提示词。

    注意：本函数仅构建提示词字符串，不调用 LLM。

    Args:
        chunk: 文本块字典
        target_count: 目标 SKU 数量
        config: 配置字典（可选），支持:
            - schema_version: 架构版本（默认 "v2"）
            - language: 提示语言（默认 "zh"）
            - include_examples: 是否包含示例（默认 True）

    Returns:
        str: 构建的提示词
    """
    if config is None:
        config = {}

    schema_version = config.get("schema_version", "v2")
    language = config.get("language", "zh")
    include_examples = config.get("include_examples", True)

    content = chunk.get("content", "")
    chunk_id = chunk.get("id", chunk.get("index", "unknown"))
    header_path = chunk.get("header_path", "")

    if language == "zh":
        prompt = f"请从以下文本中提取最多 {target_count} 个知识单元（Knowledge Unit, SKU）。\n\n"

        if header_path:
            prompt += f"文本来源: {header_path}\n\n"

        prompt += f"文本内容:\n{content}\n\n"

        prompt += "请按以下 MECE 架构输出 JSON 数组，每个 SKU 包含:\n"
        prompt += "- id: 唯一标识符 (如 KU-001)\n"
        prompt += "- title: 简明标题\n"
        prompt += "- applicable_objective: 适用目标/场景\n"
        prompt += "- core_logic: 核心逻辑/方法\n"
        prompt += "- expected_output: 预期输出/结果\n"
        if schema_version == "v2":
            prompt += "- tags: 标签列表（可选）\n"
            prompt += "- prerequisites: 前置条件列表（可选）\n"
            prompt += "- confidence: 置信度 0.0-1.0（可选）\n"
            prompt += "- evidence: 证据来源（可选）\n"

        if include_examples:
            prompt += "\n示例:\n"
            prompt += '[\n'
            prompt += '  {\n'
            prompt += '    "id": "KU-001",\n'
            prompt += '    "title": "标题",\n'
            prompt += '    "applicable_objective": "适用场景",\n'
            prompt += '    "core_logic": "核心方法描述",\n'
            prompt += '    "expected_output": "预期结果",\n'
            prompt += '    "tags": ["标签1", "标签2"]\n'
            prompt += '  }\n'
            prompt += ']\n'

        prompt += "\n请只输出 JSON 数组，不要包含其他内容。"
        prompt += "每个 SKU 应相互独立（MECE），不重叠、不遗漏。"
    else:
        prompt = f"Extract up to {target_count} Knowledge Units (SKUs) from the following text.\n\n"

        if header_path:
            prompt += f"Source: {header_path}\n\n"

        prompt += f"Content:\n{content}\n\n"

        prompt += "Output a JSON array where each SKU has:\n"
        prompt += "- id: unique identifier (e.g. KU-001)\n"
        prompt += "- title: concise title\n"
        prompt += "- applicable_objective: applicable objective/scenario\n"
        prompt += "- core_logic: core logic/method\n"
        prompt += "- expected_output: expected output/result\n"
        if schema_version == "v2":
            prompt += "- tags: list of tags (optional)\n"
            prompt += "- prerequisites: list of prerequisites (optional)\n"
            prompt += "- confidence: confidence score 0.0-1.0 (optional)\n"
            prompt += "- evidence: evidence source (optional)\n"

        if include_examples:
            prompt += "\nExample:\n"
            prompt += '[\n'
            prompt += '  {\n'
            prompt += '    "id": "KU-001",\n'
            prompt += '    "title": "Title",\n'
            prompt += '    "applicable_objective": "Applicable scenario",\n'
            prompt += '    "core_logic": "Core method description",\n'
            prompt += '    "expected_output": "Expected result",\n'
            prompt += '    "tags": ["tag1", "tag2"]\n'
            prompt += '  }\n'
            prompt += ']\n'

        prompt += "\nOutput ONLY the JSON array, no additional text."
        prompt += "Each SKU must be mutually exclusive and collectively exhaustive (MECE)."

    return prompt


# ──────────────────────────────────────────────
# Response Parser
# ──────────────────────────────────────────────


def parse_sku_response(response_text: str) -> list[dict[str, Any]]:
    """
    解析 LLM 返回的 JSON 响应为结构化 SKU 记录。

    支持:
        - ```json ... ``` 代码块
        - 裸 JSON 数组
        - 包含数组的对象

    Args:
        response_text: LLM 响应文本

    Returns:
        list[dict]: 解析后的 SKU 列表
    """
    if not response_text or not response_text.strip():
        return []

    text = response_text.strip()

    # Try to extract from ```json ... ``` block
    json_block_pattern = re.compile(
        r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE
    )
    json_block_match = json_block_pattern.search(text)

    if json_block_match:
        text = json_block_match.group(1).strip()

    # Try parsing as JSON
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Try to find and extract JSON array
        array_match = re.search(r"\[[\s\S]*\]", text)
        if array_match:
            try:
                parsed = json.loads(array_match.group(0))
            except json.JSONDecodeError:
                return []
        else:
            return []

    # Normalize to list
    if isinstance(parsed, dict):
        # Could be {"skus": [...]} or {"knowledge_units": [...]}
        for key in ("skus", "knowledge_units", "units", "data", "results"):
            if key in parsed:
                parsed = parsed[key]
                break
        else:
            # Single SKU wrapped in object
            if all(field in parsed for field in SKU_V2_SCHEMA["required"][:2]):
                return [parsed]
            return []

    if not isinstance(parsed, list):
        return []

    # Validate each entry is a dict
    valid_skus: list[dict[str, Any]] = []
    for item in parsed:
        if isinstance(item, dict):
            valid_skus.append(item)

    return valid_skus


# ──────────────────────────────────────────────
# SKU Validation
# ──────────────────────────────────────────────


def validate_sku(
    sku: dict[str, Any],
    schema_version: str = "v2",
) -> dict[str, Any]:
    """
    验证单个 SKU 是否符合 MECE 架构。

    Args:
        sku: SKU 字典
        schema_version: 架构版本（默认 "v2"）

    Returns:
        dict: {is_valid, errors[], warnings[]}
    """
    errors: list[str] = []
    warnings: list[str] = []

    if schema_version == "v2":
        schema = SKU_V2_SCHEMA
    else:
        # Fallback to v2
        schema = SKU_V2_SCHEMA

    required_fields = schema["required"]
    field_types = schema["types"]

    # Check required fields exist and are not empty
    for field in required_fields:
        if field not in sku:
            errors.append(f"Missing required field: '{field}'")
        elif sku[field] is None:
            errors.append(f"Field '{field}' is null")
        elif isinstance(sku[field], (str, list)) and not sku[field]:
            errors.append(f"Field '{field}' is empty")
        elif isinstance(sku[field], (int, float)) and sku[field] == 0:
            warnings.append(f"Field '{field}' is zero")

    # Check field types
    for field, value in sku.items():
        if field in field_types:
            expected_type = field_types[field]
            if isinstance(expected_type, tuple):
                if not isinstance(value, expected_type):
                    errors.append(
                        f"Field '{field}' type mismatch: "
                        f"expected {expected_type}, got {type(value).__name__}"
                    )
            else:
                if not isinstance(value, expected_type):
                    errors.append(
                        f"Field '{field}' type mismatch: "
                        f"expected {expected_type.__name__}, got {type(value).__name__}"
                    )

    # Check id format (should be like KU-001 or similar)
    if "id" in sku and isinstance(sku["id"], str):
        if not re.match(r"^[\w-]+$", sku["id"]):
            warnings.append(f"Field 'id' has unusual format: '{sku['id']}'")

    is_valid = len(errors) == 0
    return {
        "is_valid": is_valid,
        "errors": errors,
        "warnings": warnings,
    }


# ──────────────────────────────────────────────
# Batch Processing
# ──────────────────────────────────────────────


def process_extraction_results(
    raw_skus: list[dict[str, Any]],
    chunk_info: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    批量验证提取的 SKU，生成汇总报告。

    Args:
        raw_skus: 原始提取的 SKU 列表
        chunk_info: 来源块信息（可选），包含 id/index

    Returns:
        dict: 验证和汇总报告
    """
    validated: list[dict[str, Any]] = []
    all_errors: list[dict[str, Any]] = []
    all_warnings: list[dict[str, Any]] = []

    for i, sku in enumerate(raw_skus):
        result = validate_sku(sku)
        validated.append({
            "sku_id": sku.get("id", f"index_{i}"),
            "is_valid": result["is_valid"],
            "errors": result["errors"],
            "warnings": result["warnings"],
        })
        if result["errors"]:
            all_errors.append({
                "sku_id": sku.get("id", f"index_{i}"),
                "errors": result["errors"],
            })
        if result["warnings"]:
            all_warnings.append({
                "sku_id": sku.get("id", f"index_{i}"),
                "warnings": result["warnings"],
            })

    total = len(raw_skus)
    valid_count = sum(1 for v in validated if v["is_valid"])
    invalid_count = total - valid_count

    summary = {
        "total_skus": total,
        "valid_count": valid_count,
        "invalid_count": invalid_count,
        "pass_rate": round(valid_count / max(1, total) * 100, 1),
    }

    result: dict[str, Any] = {
        "summary": summary,
        "validated_skus": validated,
        "errors": all_errors,
        "warnings": all_warnings,
    }

    if chunk_info:
        result["chunk_id"] = chunk_info.get("id", chunk_info.get("index", "unknown"))

    return result
