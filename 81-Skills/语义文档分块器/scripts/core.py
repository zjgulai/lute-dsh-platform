"""
Semantic Document Chunker - 核心分割逻辑

基于 Markdown 标题结构进行语义分割，将长文档按章节层级
拆分为逻辑独立、上下文完整的文本块。
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional


# ──────────────────────────────────────────────
# Pattern Constants
# ──────────────────────────────────────────────

# ATX 标题: # ~ ######
ATX_HEADER_PATTERN = re.compile(
    r"^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$", re.MULTILINE
)

# Setext 标题: === (h1) 或 --- (h2)
SETEXT_H1_PATTERN = re.compile(r"^=+\s*$", re.MULTILINE)
SETEXT_H2_PATTERN = re.compile(r"^-+\s*$", re.MULTILINE)


# ──────────────────────────────────────────────
# Header Parsing
# ──────────────────────────────────────────────


def _estimate_tokens(text: str) -> int:
    """
    估算文本的 token 数量。
    中文约 1.5 token/字，英文约 0.75 token/词。

    Args:
        text: 输入文本

    Returns:
        int: 估算的 token 数
    """
    if not text:
        return 0

    # Count Chinese characters
    chinese_chars = len(re.findall(r"[一-鿿]", text))
    # Count non-Chinese words (split by whitespace)
    non_chinese = re.sub(r"[一-鿿]", " ", text)
    english_words = len(non_chinese.split())

    return int(chinese_chars * 1.5 + english_words * 0.75)


def parse_headers(content: str) -> list[dict[str, Any]]:
    """
    从 Markdown 内容中提取所有标题。

    同时支持 ATX (#) 和 Setext (===, ---) 标题样式。

    Args:
        content: Markdown 文本内容

    Returns:
        list[dict]: 标题列表，每项包含:
            - level: 标题层级 (1-6)
            - text: 标题文本
            - char_position: 字符位置
            - line_number: 行号
    """
    if not content:
        return []

    lines = content.split("\n")
    headers: list[dict[str, Any]] = []
    char_pos = 0
    setext_pending: Optional[dict[str, Any]] = None

    for line_no, line in enumerate(lines):
        original_line = line
        line_len = len(line) + 1  # +1 for newline

        # Check for ATX headers
        atx_match = ATX_HEADER_PATTERN.match(line)
        if atx_match:
            # Flush any pending setext header
            setext_pending = None
            level = len(atx_match.group(1))
            text = atx_match.group(2).strip()
            headers.append({
                "level": level,
                "text": text,
                "char_position": char_pos,
                "line_number": line_no + 1,
            })
            char_pos += line_len
            continue

        # Check for setext headers (=== or ---)
        setext_h1_match = SETEXT_H1_PATTERN.match(line)
        setext_h2_match = SETEXT_H2_PATTERN.match(line)

        if setext_h1_match or setext_h2_match:
            if setext_pending is not None:
                level = 1 if setext_h1_match else 2
                setext_pending["level"] = level
                setext_pending["line_number"] = line_no + 1
                headers.append(setext_pending)
                setext_pending = None
            char_pos += line_len
            continue

        # Check if this line could be a setext header title (previous line)
        # A setext title line is any non-empty line followed by === or ---
        if line.strip() and line_no + 1 < len(lines):
            next_line = lines[line_no + 1]
            if SETEXT_H1_PATTERN.match(next_line) or SETEXT_H2_PATTERN.match(next_line):
                if setext_pending is None:
                    setext_pending = {
                        "level": 1,  # placeholder, will be updated
                        "text": line.strip(),
                        "char_position": char_pos,
                        "line_number": line_no + 1,
                    }
                    char_pos += line_len
                    continue

        # Flush setext_pending if this is not a setext header line
        setext_pending = None
        char_pos += line_len

    return headers


# ──────────────────────────────────────────────
# Header Tree Building
# ──────────────────────────────────────────────


def build_header_tree(headers: list[dict[str, Any]]) -> dict[str, Any]:
    """
    从扁平标题列表构建嵌套的标题树。

    每个节点包含:
        - level: 标题层级
        - text: 标题文本
        - char_start: 起始字符位置
        - children: 子标题列表
        - char_end: 结束字符位置（需后续填充）

    Args:
        headers: parse_headers 的输出

    Returns:
        dict: 标题树的根节点
    """
    if not headers:
        return {"level": 0, "text": "root", "children": [], "char_start": 0, "char_end": 0}

    root: dict[str, Any] = {
        "level": 0,
        "text": "root",
        "children": [],
        "char_start": 0,
        "char_end": 0,
    }

    stack: list[dict[str, Any]] = [root]

    for h in headers:
        node: dict[str, Any] = {
            "level": h["level"],
            "text": h["text"],
            "char_start": h["char_position"],
            "children": [],
            "char_end": 0,
        }

        # Pop stack until parent level is found
        while stack and stack[-1]["level"] >= h["level"]:
            stack.pop()

        # Attach to parent
        if stack:
            stack[-1]["children"].append(node)
        else:
            root["children"].append(node)

        stack.append(node)

    # Fill char_end for all nodes
    _fill_end_positions(root)

    return root


def _fill_end_positions(node: dict[str, Any]) -> None:
    """
    递归填充每个节点的 char_end 字段。

    Args:
        node: 树节点
    """
    if not node.get("children"):
        return

    for i, child in enumerate(node["children"]):
        _fill_end_positions(child)
        if i + 1 < len(node["children"]):
            child["char_end"] = node["children"][i + 1]["char_start"]
        else:
            # Last child; end will be set by parent
            pass


# ──────────────────────────────────────────────
# Chapter Splitting
# ──────────────────────────────────────────────


def split_by_chapters(
    content: str,
    headers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    在 h1/h2 边界处分割文档。

    生成的每个块包含:
        - index: 块序号（从 1 开始）
        - content: 块文本内容
        - header_path: 标题路径（如 "Chapter 1 > Section 2.1"）
        - char_start: 起始字符位置
        - char_end: 结束字符位置
        - token_estimate: 估算的 token 数

    Args:
        content: 原始文档内容
        headers: parse_headers 的输出（仅 h1/h2 用于分割）

    Returns:
        list[dict]: 分割后的文本块列表
    """
    if not content:
        return []

    if not headers:
        # No headers: return whole content as single chunk
        return [{
            "index": 1,
            "content": content,
            "header_path": "root",
            "char_start": 0,
            "char_end": len(content),
            "token_estimate": _estimate_tokens(content),
        }]

    # Filter to h1 and h2 for chapter-level splitting
    chapter_headers = [h for h in headers if h["level"] <= 2]

    if not chapter_headers:
        chapter_headers = [headers[0]]

    chunks: list[dict[str, Any]] = []
    total_length = len(content)

    for i, h in enumerate(chapter_headers):
        start = h["char_position"]
        if i + 1 < len(chapter_headers):
            end = chapter_headers[i + 1]["char_position"]
        else:
            end = total_length

        chunk_content = content[start:end].strip()
        if not chunk_content:
            continue

        # Build header path
        path_parts = [h["text"]]
        # Walk up to find parent headers
        for j in range(i - 1, -1, -1):
            if chapter_headers[j]["level"] < h["level"]:
                path_parts.insert(0, chapter_headers[j]["text"])
                h["level"] = chapter_headers[j]["level"]
        header_path = " > ".join(path_parts)

        chunks.append({
            "index": len(chunks) + 1,
            "content": chunk_content,
            "header_path": header_path,
            "char_start": start,
            "char_end": end,
            "token_estimate": _estimate_tokens(chunk_content),
        })

    return chunks


# ──────────────────────────────────────────────
# Recursive Splitting
# ──────────────────────────────────────────────


def recursive_split_chunks(
    chunks: list[dict[str, Any]],
    max_tokens: int = 8000,
) -> list[dict[str, Any]]:
    """
    递归拆分过大的文本块，超过 max_tokens 的块会沿子标题继续拆分。

    Args:
        chunks: 文本块列表
        max_tokens: 最大 token 数（默认 8000）

    Returns:
        list[dict]: 拆分后的文本块列表
    """
    result: list[dict[str, Any]] = []
    max_iterations = 5

    def _split_chunk_at_subheaders(
        chunk: dict[str, Any],
        iteration: int,
    ) -> list[dict[str, Any]]:
        if iteration >= max_iterations:
            return [chunk]

        token_estimate = chunk.get("token_estimate", _estimate_tokens(chunk.get("content", "")))
        if token_estimate <= max_tokens:
            return [chunk]

        content = chunk.get("content", "")
        sub_headers_list = parse_headers(content)

        # Filter to h3-h6 for sub-splitting
        sub_headers = [h for h in sub_headers_list if 3 <= h["level"] <= 6]

        if not sub_headers:
            # No sub-headers: split at paragraph boundaries
            return _split_at_paragraphs(chunk, max_tokens, iteration)

        # Split at sub-header boundaries
        sub_chunks = split_by_chapters(content, sub_headers)
        result_sub: list[dict[str, Any]] = []
        for sc in sub_chunks:
            result_sub.extend(
                _split_chunk_at_subheaders(sc, iteration + 1)
            )
        return result_sub

    def _split_at_paragraphs(
        chunk: dict[str, Any],
        max_tok: int,
        iteration: int,
    ) -> list[dict[str, Any]]:
        content = chunk.get("content", "")
        paragraphs = re.split(r"\n\s*\n", content)
        current_parts: list[str] = []
        current_tokens = 0
        split_result: list[dict[str, Any]] = []

        for para in paragraphs:
            para_tokens = _estimate_tokens(para)
            if current_tokens + para_tokens > max_tok and current_parts:
                split_result.append({
                    "index": -1,
                    "content": "\n\n".join(current_parts),
                    "header_path": chunk.get("header_path", ""),
                    "char_start": 0,
                    "char_end": 0,
                    "token_estimate": current_tokens,
                })
                current_parts = []
                current_tokens = 0
            current_parts.append(para)
            current_tokens += para_tokens

        if current_parts:
            split_result.append({
                "index": -1,
                "content": "\n\n".join(current_parts),
                "header_path": chunk.get("header_path", ""),
                "char_start": 0,
                "char_end": 0,
                "token_estimate": current_tokens,
            })

        # Re-index after splitting
        for j, sc in enumerate(split_result):
            sc["index"] = j + 1

        return _merge_small_chunks(split_result)

    current_index = 0
    for chunk in chunks:
        sub = _split_chunk_at_subheaders(chunk, 0)
        for s in sub:
            current_index += 1
            s["index"] = current_index
            result.append(s)

    return result


def _merge_small_chunks(
    chunks: list[dict[str, Any]],
    min_tokens: int = 500,
) -> list[dict[str, Any]]:
    """
    合并过小的文本块，避免碎片化。

    Args:
        chunks: 文本块列表
        min_tokens: 最小 token 数（默认 500）

    Returns:
        list[dict]: 合并后的文本块列表
    """
    if not chunks:
        return []

    merged: list[dict[str, Any]] = []
    buffer: Optional[dict[str, Any]] = None

    for chunk in chunks:
        if buffer is None:
            buffer = dict(chunk)
            continue

        buffer_tokens = buffer.get("token_estimate", 0)
        chunk_tokens = chunk.get("token_estimate", 0)

        if buffer_tokens + chunk_tokens <= min_tokens:
            # Merge into buffer
            buffer["content"] = buffer.get("content", "") + "\n\n" + chunk.get("content", "")
            buffer["token_estimate"] = _estimate_tokens(buffer["content"])
            buffer["char_end"] = chunk.get("char_end", 0)
        else:
            merged.append(buffer)
            buffer = dict(chunk)

    if buffer is not None:
        merged.append(buffer)

    return merged


# ──────────────────────────────────────────────
# Full Pipeline
# ──────────────────────────────────────────────


def chunk_document(
    content: str,
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    完整的分割流水线。

    步骤:
        1. parse_headers: 提取标题
        2. build_header_tree: 构建标题树（仅用于元数据）
        3. split_by_chapters: 按章节分割
        4. recursive_split_chunks: 递归拆分过大的块
        5. 收集元数据

    Args:
        content: 文档内容
        config: 配置字典，支持:
            - max_tokens: 最大 token 数（默认 8000）

    Returns:
        dict: 包含分割后的块和元数据的报告
    """
    if config is None:
        config = {}

    max_tokens = config.get("max_tokens", 8000)

    # Step 1 & 2: Parse headers and build tree
    headers = parse_headers(content)
    header_tree = build_header_tree(headers)

    # Step 3: Split by chapters
    chapter_chunks = split_by_chapters(content, headers)

    # Step 4: Recursive split
    final_chunks = recursive_split_chunks(chapter_chunks, max_tokens)

    # Step 5: Collect metadata
    total_tokens = sum(c.get("token_estimate", 0) for c in final_chunks)
    total_chars = len(content)

    metadata = {
        "total_chunks": len(final_chunks),
        "total_tokens": total_tokens,
        "total_chars": total_chars,
        "max_tokens_setting": max_tokens,
        "header_count": len(headers),
        "avg_chunk_tokens": round(total_tokens / max(1, len(final_chunks)), 1),
        "chunk_sizes": [c.get("token_estimate", 0) for c in final_chunks],
        "chunk_header_paths": [c.get("header_path", "") for c in final_chunks],
    }

    return {
        "chunks": final_chunks,
        "header_tree": header_tree,
        "metadata": metadata,
    }
