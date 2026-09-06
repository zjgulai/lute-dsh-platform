#!/usr/bin/env python3
"""
手动创建文件备份点
"""
import os
import sys
import json
import hashlib
import shutil
from pathlib import Path
from datetime import datetime

HISTORY_DIR_ENV = "CLAUDE_FILE_HISTORY_DIR"
FILE_HISTORY_DIR = Path(os.environ.get(HISTORY_DIR_ENV, Path.home() / ".claude" / "file-history")).expanduser()
METADATA_DIR = FILE_HISTORY_DIR / ".metadata"


def normalize_filepath(filepath: str) -> str:
    """Use canonical paths so backup, listing, and restore share the same hash."""
    return str(Path(filepath).expanduser().resolve())


def get_file_hash(filepath: str) -> str:
    """获取文件路径的哈希值"""
    return hashlib.md5(normalize_filepath(filepath).encode()).hexdigest()[:12]


def ensure_dirs():
    """确保备份目录存在"""
    FILE_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_DIR.mkdir(parents=True, exist_ok=True)


def backup_file(filepath: str) -> bool:
    """备份单个文件"""
    source = Path(filepath).expanduser()

    if not source.exists():
        print(f"❌ 文件不存在: {filepath}")
        return False

    if source.is_dir():
        print(f"❌ 这是一个目录，请使用 --dir 选项: {filepath}")
        return False

    ensure_dirs()

    # 生成备份文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    original_path = normalize_filepath(str(source))
    file_hash = get_file_hash(original_path)
    filename = source.name

    backup_name = f"{timestamp}_{file_hash}_{filename}"
    backup_path = FILE_HISTORY_DIR / backup_name

    try:
        shutil.copy2(source, backup_path)

        # 保存元数据
        meta = {
            "original_path": original_path,
            "backup_time": timestamp,
            "filename": filename,
            "size": source.stat().st_size,
        }
        meta_path = METADATA_DIR / f"{file_hash}.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        print(f"✅ 已备份: {filepath}")
        print(f"   备份位置: {backup_path}")
        return True

    except (OSError, shutil.Error) as e:
        print(f"❌ 备份失败: {e}")
        return False


def backup_directory(dirpath: str, pattern: str = "*"):
    """批量备份目录中的文件"""
    source_dir = Path(dirpath)

    if not source_dir.exists():
        print(f"❌ 目录不存在: {dirpath}")
        return

    if not source_dir.is_dir():
        print(f"❌ 这不是一个目录: {dirpath}")
        return

    # 支持的代码文件扩展名
    code_extensions = {
        ".py", ".js", ".ts", ".jsx", ".tsx", ".vue",
        ".json", ".yaml", ".yml", ".toml", ".ini",
        ".md", ".txt", ".rs", ".go", ".java", ".rb"
    }

    if pattern == "*":
        files = []
        for ext in code_extensions:
            files.extend(source_dir.rglob(f"*{ext}"))
    else:
        files = list(source_dir.rglob(pattern))

    # 排除常见忽略目录
    ignore_dirs = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"}
    files = [f for f in files if not any(part in ignore_dirs for part in f.parts)]

    if not files:
        print(f"⚠️  未找到可备份的文件")
        return

    print(f"📁 目录: {dirpath}")
    print(f"📊 发现 {len(files)} 个文件")
    print(f"🚀 开始批量备份...\n")

    success = 0
    failed = 0

    for f in files:
        if backup_file(str(f)):
            success += 1
        else:
            failed += 1

    print(f"\n✅ 备份完成: {success} 成功, {failed} 失败")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="手动创建备份点")
    parser.add_argument("filepath", nargs="?", help="要备份的文件路径")
    parser.add_argument("--dir", "-d", help="批量备份整个目录")

    args = parser.parse_args()

    if args.dir:
        backup_directory(args.dir)
    elif args.filepath:
        backup_file(args.filepath)
    else:
        print("用法:")
        print("  python backup-now.py <filepath>        # 备份单个文件")
        print("  python backup-now.py --dir <dirpath>   # 批量备份目录")
        sys.exit(1)
