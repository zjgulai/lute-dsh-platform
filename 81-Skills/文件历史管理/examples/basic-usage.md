# File History Manager - 基础使用示例

## 示例 1: 查看文件历史

### 场景
你修改了 `config.py` 多次，想查看修改历史。

### 操作
```bash
python skills/file-history-manager/scripts/list-history.py config.py
```

### 预期输出
```
📄 文件: config.py
📁 备份位置: /Users/pray/.claude/file-history
📊 共 5 个历史版本:

序号  时间戳               大小        预览
--------------------------------------------------------------------------------
1     2024-04-10 14:30:52  1 KB        DEBUG = True\nDATABASE_URL = "post...
2     2024-04-10 14:25:10  950 B       DEBUG = False\nDATABASE_URL = "pos...
3     2024-04-10 14:20:33  920 B       DEBUG = False\nDATABASE_URL = "my...
...

💡 使用恢复命令:
   python skills/file-history-manager/scripts/restore-file.py --file 'config.py' --version <时间戳>
```

---

## 示例 2: 恢复到最新版本

### 场景
刚才的修改出了问题，想恢复到最新的备份版本。

### 操作
```bash
python skills/file-history-manager/scripts/restore-file.py --file config.py --latest
```

### 交互流程
```
📄 目标文件: config.py
📁 备份来源: 20240410_143052_a1b2c3d4_config.py

📊 差异摘要:
   当前版本: 50 行, 1200 字符
   目标版本: 48 行, 1150 字符
   行数变化: -2

📝 目标版本前5行预览:
   1: import os
   2: from pathlib import Path
   3: 
   4: DEBUG = True
   5: DATABASE_URL = os.getenv("DATABASE_URL")

⚠️  确认恢复?
   当前文件将被备份为: config.py.bak
   输入 'yes' 确认恢复: yes

✅ 当前文件已备份: config.py.bak
✅ 文件已恢复到: 20240410_143052_a1b2c3d4_config.py
```

---

## 示例 3: 恢复到指定时间点

### 场景
需要恢复到 "今天下午2点" 左右的版本。

### 操作
```bash
# 先查看历史找到时间戳
python skills/file-history-manager/scripts/list-history.py main.py

# 使用具体时间戳恢复
python skills/file-history-manager/scripts/restore-file.py \
    --file main.py \
    --version 20240410_140052
```

---

## 示例 4: 关键修改前手动备份

### 场景
即将进行大规模重构，想先创建备份点。

### 操作
```bash
# 备份单个文件
python skills/file-history-manager/scripts/backup-now.py src/main.py
```

### 输出
```
✅ 已备份: src/main.py
   备份位置: /Users/pray/.claude/file-history/20240410_153045_a1b2c3d4_main.py
```

---

## 示例 5: 批量备份整个项目

### 场景
项目重要里程碑，想备份所有代码文件。

### 操作
```bash
python skills/file-history-manager/scripts/backup-now.py --dir ./src
```

### 输出
```
📁 目录: ./src
📊 发现 15 个文件
🚀 开始批量备份...

✅ 已备份: ./src/main.py
   备份位置: /Users/pray/.claude/file-history/20240410_153100_a1b2c3d4_main.py
✅ 已备份: ./src/utils.py
   备份位置: /Users/pray/.claude/file-history/20240410_153100_b2c3d4e5_utils.py
...

✅ 备份完成: 15 成功, 0 失败
```

---

## 示例 6: 配合 Claude Code 使用

### 场景 6.1: 破坏性操作前自动提醒
```
用户: 删除旧的 utils 目录

Claude: ⚠️ 这将删除包含以下文件的目录:
        - utils/helper.py (有 3 个历史备份)
        - utils/parser.py (有 5 个历史备份)
        
        是否先创建备份点? [Y/n]: Y
        
        ✅ 已创建备份点
        📁 备份文件: 20240410_153200_*_utils_*.py
        
        确认继续删除? [y/N]: y
```

### 场景 6.2: 文件被覆盖后找回
```
用户: 刚才生成的 config.py 把原来的覆盖了，能找回吗?

Claude: 🔍 正在查找 config.py 的历史版本...

        📄 文件: config.py
        📊 共 8 个历史版本:
        ...
        3. 2024-04-10 14:25:10 (生成前最后版本)
        
        是否恢复到生成前版本 (2024-04-10 14:25:10)? [Y/n]: Y
        
        ✅ 已恢复: config.py
        📄 被覆盖的版本已备份: config.py.bak
```

---

## 快速命令速查

| 需求 | 命令 |
|------|------|
| 查看历史 | `python list-history.py <filepath>` |
| 恢复最新 | `python restore-file.py -f <filepath> -l` |
| 恢复指定 | `python restore-file.py -f <filepath> -v <timestamp>` |
| 备份单个 | `python backup-now.py <filepath>` |
| 备份目录 | `python backup-now.py --dir <dirpath>` |
