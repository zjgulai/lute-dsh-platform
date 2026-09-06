#!/usr/bin/env python3
"""
File History Manager 测试套件
"""
import os
import importlib.util
import tempfile
import shutil
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"


def load_script_module(script_name: str, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, SCRIPTS_DIR / script_name)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


list_history = load_script_module("list-history.py", "list_history_under_test")
restore_file = load_script_module("restore-file.py", "restore_file_under_test")
backup_now = load_script_module("backup-now.py", "backup_now_under_test")


class TestBackupRestore:
    """备份与恢复功能测试"""

    def setup_method(self):
        """每个测试前的准备"""
        # 创建临时目录
        self.test_dir = Path(tempfile.mkdtemp())
        self.test_file = self.test_dir / "test_file.py"

        # 创建测试文件
        self.test_file.write_text("# Original content\nprint('hello')\n")

        # 设置备份目录为临时目录
        self.original_backup_dir = list_history.FILE_HISTORY_DIR
        self.original_restore_dir = restore_file.FILE_HISTORY_DIR
        self.original_backup_now_dir = backup_now.FILE_HISTORY_DIR
        self.original_backup_now_metadata_dir = backup_now.METADATA_DIR
        list_history.FILE_HISTORY_DIR = self.test_dir / "backups"
        list_history.METADATA_DIR = self.test_dir / "backups" / ".metadata"
        restore_file.FILE_HISTORY_DIR = list_history.FILE_HISTORY_DIR
        backup_now.FILE_HISTORY_DIR = list_history.FILE_HISTORY_DIR
        backup_now.METADATA_DIR = list_history.METADATA_DIR

    def teardown_method(self):
        """每个测试后的清理"""
        # 恢复原始备份目录
        list_history.FILE_HISTORY_DIR = self.original_backup_dir
        list_history.METADATA_DIR = self.original_backup_dir / ".metadata"
        restore_file.FILE_HISTORY_DIR = self.original_restore_dir
        backup_now.FILE_HISTORY_DIR = self.original_backup_now_dir
        backup_now.METADATA_DIR = self.original_backup_now_metadata_dir

        # 删除临时目录
        shutil.rmtree(self.test_dir)

    def test_backup_creates_file(self):
        """测试备份创建文件"""
        result = backup_now.backup_file(str(self.test_file))

        assert result is True

        # 检查备份目录是否创建
        assert list_history.FILE_HISTORY_DIR.exists()

        # 检查备份文件是否创建
        backups = list(list_history.FILE_HISTORY_DIR.glob("*_test_file.py"))
        assert len(backups) == 1

    def test_list_history_shows_backup(self):
        """测试列出历史显示备份"""
        # 先创建一个备份
        backup_now.backup_file(str(self.test_file))

        # 捕获输出
        import io
        import contextlib

        f = io.StringIO()
        with contextlib.redirect_stdout(f):
            list_history.list_file_history(str(self.test_file))

        output = f.getvalue()
        assert "test_file.py" in output
        assert "共 1 个历史版本" in output

    def test_restore_changes_content(self):
        """测试恢复修改文件内容"""
        # 创建初始备份
        backup_now.backup_file(str(self.test_file))

        # 修改文件
        self.test_file.write_text("# Modified content\nprint('world')\n")

        # 恢复到最新版本
        result = restore_file.restore_file(
            str(self.test_file),
            version=None,
            latest=True,
            force=True
        )

        assert result is True

        # 验证内容已恢复
        content = self.test_file.read_text()
        assert "Original content" in content
        assert "Modified content" not in content

    def test_restore_creates_bak(self):
        """测试恢复前创建 .bak 备份"""
        # 创建初始备份
        backup_now.backup_file(str(self.test_file))

        # 修改文件
        self.test_file.write_text("# Modified\n")

        # 恢复
        restore_file.restore_file(
            str(self.test_file),
            latest=True,
            force=True
        )

        # 验证 .bak 文件存在
        bak_file = Path(str(self.test_file) + ".bak")
        assert bak_file.exists()

    def test_multiple_backups(self):
        """测试多个备份版本"""
        # 创建3个不同版本的备份
        for i in range(3):
            self.test_file.write_text(f"# Version {i + 1}\n")
            backup_now.backup_file(str(self.test_file))

        # 验证有3个备份文件
        backups = list(list_history.FILE_HISTORY_DIR.glob("*_test_file.py"))
        assert len(backups) == 3

    def test_relative_path_uses_same_hash_as_absolute_path(self):
        """测试相对路径备份后可通过绝对路径查询"""
        old_cwd = Path.cwd()
        os.chdir(self.test_dir)
        try:
            result = backup_now.backup_file(self.test_file.name)
        finally:
            os.chdir(old_cwd)

        assert result is True

        backups = list(list_history.FILE_HISTORY_DIR.glob("*_test_file.py"))
        assert len(backups) == 1

        backup = restore_file.find_backup(str(self.test_file), latest=True)
        assert backup == backups[0]

    def test_backup_nonexistent_file(self):
        """测试备份不存在的文件失败"""
        result = backup_now.backup_file("/nonexistent/path/file.py")
        assert result is False

    def test_backup_does_not_swallow_unexpected_copy_errors(self):
        """测试备份不吞掉实现缺陷类异常"""
        original_copy2 = backup_now.shutil.copy2
        backup_now.shutil.copy2 = lambda *args, **kwargs: (_ for _ in ()).throw(TypeError("programming bug"))
        try:
            try:
                backup_now.backup_file(str(self.test_file))
            except TypeError as exc:
                assert "programming bug" in str(exc)
            else:
                raise AssertionError("TypeError should propagate")
        finally:
            backup_now.shutil.copy2 = original_copy2

    def test_restore_does_not_swallow_unexpected_restore_errors(self):
        """测试恢复不吞掉实现缺陷类异常"""
        backup_now.backup_file(str(self.test_file))
        self.test_file.write_text("# Modified\n")

        original_copy2 = restore_file.shutil.copy2
        calls = {"count": 0}

        def fail_on_restore(*args, **kwargs):
            calls["count"] += 1
            if calls["count"] == 1:
                return original_copy2(*args, **kwargs)
            raise TypeError("programming bug")

        restore_file.shutil.copy2 = fail_on_restore
        try:
            try:
                restore_file.restore_file(str(self.test_file), latest=True, force=True)
            except TypeError as exc:
                assert "programming bug" in str(exc)
            else:
                raise AssertionError("TypeError should propagate")
        finally:
            restore_file.shutil.copy2 = original_copy2

    def test_get_file_hash_consistency(self):
        """测试文件哈希一致性"""
        hash1 = list_history.get_file_hash("/path/to/file.py")
        hash2 = list_history.get_file_hash("/path/to/file.py")
        assert hash1 == hash2

        # 不同路径应该有不同的哈希
        hash3 = list_history.get_file_hash("/path/to/other.py")
        assert hash1 != hash3


class TestEdgeCases:
    """边界情况测试"""

    def setup_method(self):
        self.test_dir = Path(tempfile.mkdtemp())
        self.original_backup_dir = list_history.FILE_HISTORY_DIR
        self.original_restore_dir = restore_file.FILE_HISTORY_DIR
        self.original_backup_now_dir = backup_now.FILE_HISTORY_DIR
        self.original_backup_now_metadata_dir = backup_now.METADATA_DIR
        list_history.FILE_HISTORY_DIR = self.test_dir / "backups"
        restore_file.FILE_HISTORY_DIR = list_history.FILE_HISTORY_DIR
        backup_now.FILE_HISTORY_DIR = list_history.FILE_HISTORY_DIR
        backup_now.METADATA_DIR = list_history.FILE_HISTORY_DIR / ".metadata"

    def teardown_method(self):
        list_history.FILE_HISTORY_DIR = self.original_backup_dir
        restore_file.FILE_HISTORY_DIR = self.original_restore_dir
        backup_now.FILE_HISTORY_DIR = self.original_backup_now_dir
        backup_now.METADATA_DIR = self.original_backup_now_metadata_dir
        shutil.rmtree(self.test_dir)

    def test_empty_file(self):
        """测试空文件备份"""
        empty_file = self.test_dir / "empty.py"
        empty_file.write_text("")

        result = backup_now.backup_file(str(empty_file))
        assert result is True

    def test_large_file(self):
        """测试大文件备份"""
        large_file = self.test_dir / "large.py"
        large_file.write_text("x" * 100000)  # 100KB

        result = backup_now.backup_file(str(large_file))
        assert result is True

    def test_special_characters_in_filename(self):
        """测试特殊字符文件名"""
        special_file = self.test_dir / "file-with_special.chars.py"
        special_file.write_text("# test")

        result = backup_now.backup_file(str(special_file))
        assert result is True

    def test_unicode_content(self):
        """测试 Unicode 内容"""
        unicode_file = self.test_dir / "unicode.py"
        unicode_file.write_text("# 中文注释\nprint('你好')\n# 日本語\n")

        result = backup_now.backup_file(str(unicode_file))
        assert result is True


if __name__ == "__main__":
    import pytest

    # 如果没有 pytest，使用简单测试
    try:
        pytest.main([__file__, "-v"])
    except ImportError:
        print("pytest not installed, running basic tests...")

        test = TestBackupRestore()
        test.setup_method()
        try:
            test.test_backup_creates_file()
            print("✓ test_backup_creates_file passed")
        except AssertionError as e:
            print(f"✗ test_backup_creates_file failed: {e}")
        finally:
            test.teardown_method()

        test.setup_method()
        try:
            test.test_restore_changes_content()
            print("✓ test_restore_changes_content passed")
        except AssertionError as e:
            print(f"✗ test_restore_changes_content failed: {e}")
        finally:
            test.teardown_method()

        print("\nBasic tests completed.")
