#!/usr/bin/env python3
"""
列出文件的备份历史版本
"""
import os
import sys
import glob
import hashlib
import re
from pathlib import Path
from datetime import datetime

HISTORY_DIR_ENV = "CLAUDE_FILE_HISTORY_DIR"
FILE_HISTORY_DIR = Path(os.environ.get(HISTORY_DIR_ENV, Path.home() / ".claude" / "file-history")).expanduser()
METADATA_DIR = FILE_HISTORY_DIR / ".metadata"
BACKUP_NAME_RE = re.compile(r"(?P<timestamp>\d{8}_\d{6}(?:_\d{6})?)_[0-9a-f]{12}_.+")


def normalize_filepath(filepath: str) -> str:
    """Use canonical paths so relative and absolute calls resolve to the same history."""
    return str(Path(filepath).expanduser().resolve())


def get_file_hash(filepath: str) -> str:
    """获取文件路径的哈希值"""
    return hashlib.md5(normalize_filepath(filepath).encode()).hexdigest()[:12]


def extract_timestamp(backup_path: Path) -> str:
    match = BACKUP_NAME_RE.match(backup_path.name)
    if not match:
        return backup_path.name.split("_", 1)[0]
    return match.group("timestamp")


def format_timestamp(timestamp: str) -> str:
    for fmt in ("%Y%m%d_%H%M%S_%f", "%Y%m%d_%H%M%S"):
        try:
            return datetime.strptime(timestamp, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return timestamp


def list_file_history(filepath: str):
    """列出指定文件的所有历史版本"""
    if not FILE_HISTORY_DIR.exists():
        print(f"暂无备份历史")
        return

    normalized_path = normalize_filepath(filepath)
    file_hash = get_file_hash(normalized_path)
    filename = os.path.basename(normalized_path)

    # 查找匹配的备份文件
    pattern = f"{FILE_HISTORY_DIR}/*_{file_hash}_{filename}"
    backups = glob.glob(pattern)

    if not backups:
        print(f"文件 '{normalized_path}' 暂无备份历史")
        return

    # 按时间排序
    backups.sort(reverse=True)

    print(f"\n📄 文件: {normalized_path}")
    print(f"📁 备份位置: {FILE_HISTORY_DIR}")
    print(f"📊 共 {len(backups)} 个历史版本:\n")

    print(f"{'序号':<6}{'时间戳':<20}{'大小':<12}{'预览':<40}")
    print("-" * 80)

    for idx, backup in enumerate(backups[:50], 1):  # 最多显示50个
        backup_path = Path(backup)
        timestamp = extract_timestamp(backup_path)
        time_str = format_timestamp(timestamp)

        # 文件大小
        size = backup_path.stat().st_size
        size_str = f"{size} B" if size < 1024 else f"{size//1024} KB"

        # 内容预览
        try:
            with open(backup, "r", encoding="utf-8", errors="ignore") as f:
                preview = f.read(40).replace("\n", " ")
                if len(preview) == 40:
                    preview += "..."
        except OSError:
            preview = "(无法预览)"

        print(f"{idx:<6}{time_str:<20}{size_str:<12}{preview:<40}")

    print(f"\n💡 使用恢复命令:")
    print(f"   python scripts/restore-file.py --file '{filepath}' --version <时间戳>")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python list-history.py <filepath>")
        print("示例: python list-history.py src/main.py")
        sys.exit(1)

    filepath = sys.argv[1]
    list_file_history(filepath)
