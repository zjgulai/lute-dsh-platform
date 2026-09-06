# File History Manager 测试说明

## 测试结构

```
tests/
├── README.md                  # 本文件
├── test_backup_restore.py     # 核心功能单元测试
└── test_integration.py        # 集成测试
```

## 运行测试

### 使用 pytest（推荐）

```bash
# 安装 pytest
pip install pytest

# 运行所有测试
cd skills/file-history-manager
pytest tests/ -v

# 运行特定测试文件
pytest tests/test_backup_restore.py -v

# 运行特定测试
pytest tests/test_backup_restore.py::TestBackupRestore::test_backup_creates_file -v
```

### 不使用 pytest

```bash
# 直接运行测试文件
python tests/test_backup_restore.py
```

## 测试覆盖

### 核心功能测试 (`test_backup_restore.py`)

| 测试项 | 描述 |
|--------|------|
| `test_backup_creates_file` | 验证备份文件创建 |
| `test_list_history_shows_backup` | 验证历史列表显示 |
| `test_restore_changes_content` | 验证恢复修改内容 |
| `test_restore_creates_bak` | 验证恢复前创建 .bak |
| `test_multiple_backups` | 验证多版本备份 |
| `test_backup_nonexistent_file` | 验证不存在文件处理 |
| `test_get_file_hash_consistency` | 验证哈希一致性 |

### 边界情况测试 (`test_backup_restore.py::TestEdgeCases`)

| 测试项 | 描述 |
|--------|------|
| `test_empty_file` | 空文件备份 |
| `test_large_file` | 大文件备份 (100KB) |
| `test_special_characters_in_filename` | 特殊字符文件名 |
| `test_unicode_content` | Unicode 内容处理 |

### 集成测试 (`test_integration.py`)

| 测试项 | 描述 |
|--------|------|
| `test_full_workflow` | 完整工作流：备份→修改→备份→列出历史 |
| `test_cli_help` | CLI 帮助信息验证 |

## 测试环境

- 使用临时目录隔离测试数据
- 每个测试后自动清理
- 不依赖实际 `~/.claude/file-history/` 目录

## 添加新测试

```python
def test_new_feature(self):
    """测试新功能"""
    # 准备数据
    test_file = self.test_dir / "new_test.py"
    test_file.write_text("# test")

    # 执行操作
    result = some_function(str(test_file))

    # 验证结果
    assert result is True
    assert test_file.exists()
```
