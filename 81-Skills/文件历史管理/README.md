# File History Manager

Claude Code 文件历史管理工具，支持查看、备份和恢复文件历史版本。

## 快速开始

### 查看文件历史
```bash
python skills/file-history-manager/scripts/list-history.py src/main.py
```

### 恢复文件
```bash
# 恢复到最新版本
python skills/file-history-manager/scripts/restore-file.py --file src/main.py --latest

# 恢复到指定时间戳
python skills/file-history-manager/scripts/restore-file.py --file src/main.py --version 20240410_143052
```

### 手动备份
```bash
# 备份单个文件
python skills/file-history-manager/scripts/backup-now.py src/main.py

# 批量备份目录
python skills/file-history-manager/scripts/backup-now.py --dir ./src
```

## 备份存储

备份文件存储在 `~/.claude/file-history/`，命名格式为 `{timestamp}_{filepath_hash}_{filename}`。

## 安全机制

- 恢复前自动创建 `.bak` 备份
- 显示差异摘要，需确认后执行
- 恢复失败自动回滚
