#!/usr/bin/env python3
"""
集成测试：完整工作流程测试
"""
import os
import sys
import subprocess
import tempfile
import shutil
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent


class TestIntegration:
    """集成测试"""

    def setup_method(self):
        """准备测试环境"""
        self.test_dir = Path(tempfile.mkdtemp())
        self.test_file = self.test_dir / "integration_test.py"
        self.test_file.write_text("# Version 1: Original\n")

        # 设置环境变量使用临时备份目录
        self.env = os.environ.copy()
        self.env["CLAUDE_FILE_HISTORY_DIR"] = str(self.test_dir / "backups")

    def teardown_method(self):
        """清理测试环境"""
        shutil.rmtree(self.test_dir)

    def test_full_workflow(self):
        """测试完整工作流程"""
        scripts_dir = PROJECT_ROOT / "scripts"

        # Step 1: 创建初始备份
        result = subprocess.run(
            [sys.executable, str(scripts_dir / "backup-now.py"), str(self.test_file)],
            capture_output=True,
            text=True,
            env=self.env,
        )
        assert result.returncode == 0, f"Backup failed: {result.stderr}"
        assert "已备份" in result.stdout

        # Step 2: 修改文件
        self.test_file.write_text("# Version 2: Modified\n")

        # Step 3: 再次备份
        subprocess.run(
            [sys.executable, str(scripts_dir / "backup-now.py"), str(self.test_file)],
            capture_output=True,
            text=True,
            env=self.env,
            check=True,
        )

        # Step 4: 列出历史
        result = subprocess.run(
            [sys.executable, str(scripts_dir / "list-history.py"), str(self.test_file)],
            capture_output=True,
            text=True,
            env=self.env,
        )
        assert result.returncode == 0
        assert "共 2 个历史版本" in result.stdout

    def test_cli_help(self):
        """测试 CLI 帮助信息"""
        scripts_dir = PROJECT_ROOT / "scripts"

        # 测试 restore-file 帮助
        result = subprocess.run(
            [sys.executable, str(scripts_dir / "restore-file.py"), "--help"],
            capture_output=True,
            text=True,
            env=self.env,
        )
        assert result.returncode == 0
        assert "--file" in result.stdout
        assert "--latest" in result.stdout


if __name__ == "__main__":
    import pytest

    try:
        pytest.main([__file__, "-v"])
    except ImportError:
        print("pytest not installed, skipping integration tests.")
