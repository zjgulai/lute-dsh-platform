#!/usr/bin/env python3
"""
锚点文本分割器 CLI (Anchor-Based Text Splitter Command Line)

基于用户提供的锚点（原文中的标记片段），在原文中精确定位并分割文本。
使用 Levenshtein 距离进行模糊匹配，支持 OCR 识别错误的容错处理。

Usage:
    # 从文件读取内容，从JSON文件读取锚点
    python scripts/run.py --content document.txt --anchors anchors.json --output result.json

    # 指定模糊匹配阈值
    python scripts/run.py --content doc.txt --anchors anchors.json --threshold 0.25

    # 内容从标准输入读取（适用于管道）
    cat document.txt | python scripts/run.py --anchors anchors.json --stdin

    # 输出分割后的块到单独文件
    python scripts/run.py --content doc.txt --anchors anchors.json --output-dir ./chunks/

Examples:
    python scripts/run.py --content ./data/report.txt --anchors ./data/anchors.json
    python scripts/run.py --content ./data/report.txt --anchors ./data/anchors.json \\
        --threshold 0.33 --output ./data/split_result.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any, Optional

from .core import (
    find_all_anchors,
    levenshtein_distance,
    levenshtein_ratio,
    split_by_anchors,
    split_document,
    validate_anchors,
)

logger = logging.getLogger("kee-anchor-based-text-splitter")


# ═══════════════════════════════════════════════════════
# CLI Argument Parsing
# ═══════════════════════════════════════════════════════


def build_parser() -> argparse.ArgumentParser:
    """构建命令行参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="kee-anchor-based-text-splitter",
        description="锚点文本分割器 -- 基于锚点 + Levenshtein 模糊匹配精确分割文本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --content doc.txt --anchors anchors.json
  %(prog)s --content doc.txt --anchors anchors.json --threshold 0.25 --output result.json
  %(prog)s --content doc.txt --anchors anchors.json --output-dir ./chunks/
  cat doc.txt | %(prog)s --anchors anchors.json --stdin
        """,
    )

    # 内容来源
    content_group = parser.add_argument_group("Content Source")
    content_group.add_argument(
        "-c", "--content",
        default=None,
        help="输入文本文件路径 (包含待分割的全文)",
    )
    content_group.add_argument(
        "--stdin",
        action="store_true",
        default=False,
        help="从标准输入读取内容 (与 --content 互斥)",
    )

    # 锚点
    anchors_group = parser.add_argument_group("Anchor Configuration")
    anchors_group.add_argument(
        "-a", "--anchors",
        required=True,
        help="锚点JSON文件路径。格式: [\"锚点文本1\", \"锚点文本2\", ...] "
             "或 [{\"text\": \"锚点文本\", \"description\": \"可选说明\"}, ...]",
    )

    # 分割配置
    split_group = parser.add_argument_group("Split Configuration")
    split_group.add_argument(
        "-t", "--threshold",
        type=float,
        default=0.33,
        help="模糊匹配阈值 (0.0-1.0)，默认 0.33。值越大越宽松",
    )
    split_group.add_argument(
        "--include-anchor-before",
        action="store_true",
        default=True,
        help="锚点文本属于前一块（默认行为）",
    )
    split_group.add_argument(
        "--exclude-anchor-before",
        action="store_true",
        default=False,
        help="锚点文本属于后一块（与 --include-anchor-before 互斥）",
    )

    # 输出
    output_group = parser.add_argument_group("Output")
    output_group.add_argument(
        "-o", "--output",
        default=None,
        help="输出JSON文件路径（包含完整分割结果）",
    )
    output_group.add_argument(
        "--output-dir",
        default=None,
        help="输出目录：将每个分割块写入单独文件（文件名为 block_000.txt 等）",
    )
    output_group.add_argument(
        "--output-format",
        default="json",
        choices=["json", "text"],
        help="控制台输出格式 (默认: json)",
    )
    output_group.add_argument(
        "--verbose", "-v",
        action="store_true",
        default=False,
        help="输出详细日志信息",
    )

    return parser


# ═══════════════════════════════════════════════════════
# File Loading
# ═══════════════════════════════════════════════════════


def load_content(file_path: str | Path) -> str:
    """
    从文件加载文本内容。

    Args:
        file_path: 文本文件路径

    Returns:
        str: 文件内容

    Raises:
        FileNotFoundError: 文件不存在
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"内容文件不存在: {file_path}")
    return path.read_text(encoding="utf-8")


def load_anchors(file_path: str | Path) -> list[Any]:
    """
    从 JSON 文件加载锚点列表。

    支持两种格式:
    1. 字符串列表: ["锚点1", "锚点2", ...]
    2. 对象列表: [{"text": "锚点1", "description": "说明"}, ...]

    Args:
        file_path: JSON 文件路径

    Returns:
        list: 锚点列表

    Raises:
        FileNotFoundError: 文件不存在
        json.JSONDecodeError: JSON 解析失败
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"锚点文件不存在: {file_path}")

    data = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(data, list):
        raise ValueError("锚点文件必须包含 JSON 数组")

    if not data:
        raise ValueError("锚点列表为空")

    return data


# ═══════════════════════════════════════════════════════
# Output Formatting
# ═══════════════════════════════════════════════════════


def format_result_text(result: dict[str, Any]) -> str:
    """
    将分割结果格式化为可读文本。

    Args:
        result: split_document 返回的结果字典

    Returns:
        str: 格式化文本
    """
    lines: list[str] = []
    lines.append("=" * 48)
    lines.append("  锚点文本分割结果")
    lines.append("=" * 48)

    verification = result.get("verification", {})
    lines.append("")
    lines.append("[验证信息]")
    lines.append(f"  总块数:       {verification.get('total_chunks', 0)}")
    lines.append(f"  总字符数:     {verification.get('total_chars', 0):,}")
    lines.append(f"  锚点全匹配:   {'是' if verification.get('all_anchors_found') else '否'}")
    lines.append(f"  拼接一致性:   {'通过' if verification.get('concatenation_check') else '失败'}")
    lines.append(f"  空块数:       {verification.get('empty_chunks', 0)}")

    lines.append("")
    lines.append("[锚点定位结果]")
    for ar in result.get("anchor_results", []):
        match_label = {"exact": "精确", "fuzzy": "模糊", "not_found": "未找到"}.get(
            ar["match_type"], ar["match_type"]
        )
        pos_str = str(ar["position"]) if ar["position"] != -1 else "未找到"
        lines.append(
            f"  [{ar['index']}] '{ar['anchor_text'][:40]}' -> "
            f"位置: {pos_str}, 匹配: {match_label} (相似度: {ar['similarity']:.2f})"
        )

    lines.append("")
    lines.append("[分割块概览]")
    for chunk in result.get("chunks", []):
        preview = chunk["content"][:60].replace("\n", " ").strip()
        anchor_info = f" | 锚点: '{chunk['anchor_text'][:30]}'" if chunk["anchor_text"] else ""
        lines.append(
            f"  块 #{chunk['chunk_index']}: [{chunk['char_start']}-{chunk['char_end']}] "
            f"({len(chunk['content']):,} 字符){anchor_info}"
        )
        lines.append(f"    预览: {preview}...")

    # 重叠警告
    overlap_warnings = verification.get("overlap_warnings", [])
    if overlap_warnings:
        lines.append("")
        lines.append("[重叠警告]")
        for w in overlap_warnings:
            lines.append(f"  ! {w}")

    lines.append("")
    lines.append("=" * 48)

    return "\n".join(lines)


def make_serializable(obj: Any) -> Any:
    """
    递归地将对象转换为 JSON 可序列化格式。

    处理 None、int、float、str、list、dict 等标准类型。
    numpy/pandas 类型需要显式转换。

    Args:
        obj: 任意对象

    Returns:
        JSON 可序列化的值
    """
    if obj is None:
        return None
    if isinstance(obj, (int, float)):
        return obj
    if isinstance(obj, str):
        return obj
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    if isinstance(obj, list):
        return [make_serializable(v) for v in obj]
    if isinstance(obj, dict):
        return {make_serializable(k): make_serializable(v) for k, v in obj.items()}
    return str(obj)


def format_result_json(result: dict[str, Any]) -> str:
    """
    将分割结果格式化为 JSON 字符串。

    Args:
        result: split_document 返回的结果字典

    Returns:
        str: 格式化后的 JSON 字符串
    """
    serializable = make_serializable(result)
    return json.dumps(serializable, ensure_ascii=False, indent=2)


def write_chunks_to_dir(
    result: dict[str, Any],
    output_dir: str | Path,
) -> None:
    """
    将分割块写入目录中的单独文件。

    文件命名: block_000.txt, block_001.txt, ...

    Args:
        result: split_document 返回的结果字典
        output_dir: 输出目录路径

    Raises:
        OSError: 目录创建或文件写入失败
    """
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    for chunk in result.get("chunks", []):
        filename = f"block_{chunk['chunk_index']:03d}.txt"
        filepath = out_path / filename
        filepath.write_text(chunk["content"], encoding="utf-8")

    logger.info(
        "已输出 %d 个块到目录: %s",
        len(result.get("chunks", [])),
        out_path,
    )


# ═══════════════════════════════════════════════════════
# Main Entry Point
# ═══════════════════════════════════════════════════════


def main(argv: Optional[list[str]] = None) -> int:
    """
    CLI 主入口。

    Args:
        argv: 命令行参数列表。为 None 时使用 sys.argv[1:]。

    Returns:
        int: 退出码 (0 = 成功, 1 = 错误)
    """
    parser = build_parser()
    args = parser.parse_args(argv)

    # 日志级别
    log_level = logging.DEBUG if args.verbose else logging.WARNING
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    start_time = time.time()

    try:
        # ──── 读取内容 ────
        content: Optional[str] = None

        if args.stdin:
            # 从标准输入读取
            content = sys.stdin.read()
            if not content:
                logger.error("标准输入为空")
                print("错误: 标准输入为空", file=sys.stderr)
                return 1
            logger.info("从标准输入读取内容: %d 字符", len(content))

        elif args.content:
            # 从文件读取
            content = load_content(args.content)
            logger.info("从文件读取内容: %s (%d 字符)", args.content, len(content))

        else:
            print("错误: 必须提供 --content 或 --stdin", file=sys.stderr)
            return 1

        # ──── 读取锚点 ────
        anchors = load_anchors(args.anchors)
        logger.info("从文件读取锚点: %s (%d 个)", args.anchors, len(anchors))

        # ──── 确定 include_anchor_before ────
        include_anchor_before = args.include_anchor_before
        if args.exclude_anchor_before:
            include_anchor_before = False

        # ──── 执行分割 ────
        config: dict[str, Any] = {
            "fuzzy_threshold": args.threshold,
            "include_anchor_before": include_anchor_before,
        }

        result = split_document(
            content=content,
            anchors=anchors,
            config=config,
        )

        elapsed = time.time() - start_time
        result["_metadata"] = {
            "elapsed_seconds": round(elapsed, 3),
            "content_length": len(content),
            "anchor_count": len(anchors),
            "threshold": args.threshold,
        }

        # ──── 输出 ────
        # 写入块到目录（如果指定）
        if args.output_dir:
            write_chunks_to_dir(result, args.output_dir)

        # 输出到文件（如果指定）
        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(
                format_result_json(result), encoding="utf-8"
            )
            logger.info("结果已输出到: %s", out_path)
            print(f"结果已输出到: {out_path}")

        # 输出到控制台
        if args.output_format == "text":
            print(format_result_text(result))
        else:
            print(format_result_json(result))

        # 摘要信息
        verification = result.get("verification", {})
        chunks = result.get("chunks", [])
        found = verification.get("all_anchors_found", False)
        empty = verification.get("empty_chunks", 0)
        passed = verification.get("concatenation_check", False)

        logger.info(
            "分割完成: %d 个块, 锚点全匹配=%s, 拼接一致=%s, 空块=%d, 耗时=%.2fs",
            len(chunks), found, passed, empty, elapsed,
        )

        # 非零退出码表示有异常
        if not found:
            # 锚点未全找到是常见情况，不视为错误
            logger.warning("部分锚点未找到")
        if not passed:
            logger.error("拼接一致性检查失败！分割后内容与原文不一致")
            print(
                "警告: 拼接一致性检查失败！分割后内容与原文不一致",
                file=sys.stderr,
            )
            return 1

        return 0

    except FileNotFoundError as e:
        logger.error("文件未找到: %s", e)
        print(f"错误: {e}", file=sys.stderr)
        return 1

    except json.JSONDecodeError as e:
        logger.error("JSON 解析失败: %s", e)
        print(f"错误: 锚点文件 JSON 格式错误: {e}", file=sys.stderr)
        return 1

    except ValueError as e:
        logger.error("参数错误: %s", e)
        print(f"错误: {e}", file=sys.stderr)
        return 1

    except Exception as e:
        logger.exception("处理失败: %s", e)
        print(f"错误: {e}", file=sys.stderr)
        return 1


# ═══════════════════════════════════════════════════════
# Script Entry
# ═══════════════════════════════════════════════════════

if __name__ == "__main__":
    sys.exit(main())
