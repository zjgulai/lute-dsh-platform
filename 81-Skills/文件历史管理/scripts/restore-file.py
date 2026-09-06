#!/usr/bin/env python3
"""
恢复文件到指定历史版本
"""
import os
import sys
import glob
import hashlib
import shutil
from pathlib import Path
from typing import Optional

HISTORY_DIR_ENV = "CLAUDE_FILE_HISTORY_DIR"
FILE_HISTORY_DIR = Path(os.environ.get(HISTORY_DIR_ENV, Path.home() / ".claude" / "file-history")).expanduser()


def normalize_filepath(filepath: str) -> str:
    """Use canonical paths so restore finds backups created from relative paths."""
    return str(Path(filepath).expanduser().resolve())


def get_file_hash(filepath: str) -> str:
    """获取文件路径的哈希值"""
    return hashlib.md5(normalize_filepath(filepath).encode()).hexdigest()[:12]


def find_backup(filepath: str, version: Optional[str] = None, latest: bool = False) -> Optional[Path]:
    """查找备份文件"""
    normalized_path = normalize_filepath(filepath)
    file_hash = get_file_hash(normalized_path)
    filename = os.path.basename(normalized_path)

    pattern = f"{FILE_HISTORY_DIR}/*_{file_hash}_{filename}"
    backups = glob.glob(pattern)

    if not backups:
        return None

    backups.sort(reverse=True)

    if latest:
        return Path(backups[0])

    if version is None:
        return None

    # 查找匹配的版本
    for backup in backups:
        if version in os.path.basename(backup):
            return Path(backup)

    return None


def show_diff(current: Path, backup: Path):
    """显示两个文件的差异摘要"""
    try:
        with open(current, "r", encoding="utf-8", errors="ignore") as f:
            current_content = f.read()
        with open(backup, "r", encoding="utf-8", errors="ignore") as f:
            backup_content = f.read()

        current_lines = current_content.split("\n")
        backup_lines = backup_content.split("\n")

        print(f"\n📊 差异摘要:")
        print(f"   当前版本: {len(current_lines)} 行, {len(current_content)} 字符")
        print(f"   目标版本: {len(backup_lines)} 行, {len(backup_content)} 字符")
        print(f"   行数变化: {len(backup_lines) - len(current_lines):+d}")

        # 显示前5行差异预览
        print(f"\n📝 目标版本前5行预览:")
        for i, line in enumerate(backup_lines[:5], 1):
            print(f"   {i}: {line[:60]}{'...' if len(line) > 60 else ''}")

    except OSError as e:
        print(f"⚠️  无法生成差异预览: {e}")


def restore_file(filepath: str, version: str = None, latest: bool = False, force: bool = False):
    """恢复文件到指定版本"""
    target = Path(filepath).expanduser()

    if not target.exists():
        print(f"❌ 文件不存在: {filepath}")
        return False

    # 查找备份
    backup = find_backup(filepath, version, latest)
    if not backup:
        print(f"❌ 未找到备份版本")
        return False

    print(f"📄 目标文件: {filepath}")
    print(f"📁 备份来源: {backup.name}")

    # 显示差异
    if not force:
        show_diff(target, backup)

        # 确认
        print(f"\n⚠️  确认恢复?")
        print(f"   当前文件将被备份为: {filepath}.bak")
        confirm = input("   输入 'yes' 确认恢复: ")
        if confirm.lower() != "yes":
            print("❌ 已取消恢复")
            return False

    # 备份当前文件
    bak_path = Path(f"{filepath}.bak")
    try:
        shutil.copy2(target, bak_path)
        print(f"✅ 当前文件已备份: {bak_path}")
    except (OSError, shutil.Error) as e:
        print(f"❌ 备份当前文件失败: {e}")
        return False

    # 执行恢复
    try:
        shutil.copy2(backup, target)
        print(f"✅ 文件已恢复到: {backup.name}")
        return True
    except (OSError, shutil.Error) as e:
        print(f"❌ 恢复失败: {e}")
        # 尝试回滚
        try:
            shutil.copy2(bak_path, target)
            print(f"⚠️  已回滚到恢复前状态")
        except (OSError, shutil.Error) as rollback_error:
            print(f"❌ 回滚失败，请手动检查 {bak_path}: {rollback_error}")
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="恢复文件到历史版本")
    parser.add_argument("--file", "-f", required=True, help="要恢复的文件路径")
    parser.add_argument("--version", "-v", help="版本时间戳 (如: 20240410_143052)")
    parser.add_argument("--latest", "-l", action="store_true", help="恢复到最新版本")
    parser.add_argument("--force", action="store_true", help="跳过确认")

    args = parser.parse_args()

    if not args.version and not args.latest:
        print("❌ 请指定 --version 或 --latest")
        sys.exit(1)

    success = restore_file(args.file, args.version, args.latest, args.force)
    sys.exit(0 if success else 1)
