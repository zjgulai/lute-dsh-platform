# File History Manager - 高级使用场景

## 场景 1: 代码重构保护

### 背景
需要对核心模块进行大规模重构，但担心破坏现有功能。

### 流程
```bash
# 1. 重构前批量备份
python skills/file-history-manager/scripts/backup-now.py --dir ./src/core

# 2. 进行重构...
# ... 修改代码 ...

# 3. 如果出现问题，恢复到重构前
python skills/file-history-manager/scripts/list-history.py src/core/main.py
# 查看并找到重构前的版本时间戳

python skills/file-history-manager/scripts/restore-file.py \
    --file src/core/main.py \
    --version 20240410_100000
```

---

## 场景 2: 配置文件版本管理

### 背景
配置文件频繁修改，需要追踪变更历史。

### 策略
```bash
# 每次修改前先创建备份
python skills/file-history-manager/scripts/backup-now.py config.yaml

# 编辑配置文件
vim config.yaml

# 如果修改错误，快速回退
python skills/file-history-manager/scripts/restore-file.py \
    --file config.yaml --latest
```

---

## 场景 3: 误操作恢复

### 背景
不小心用生成的代码覆盖了手写的工具函数。

### 恢复流程
```
用户: 刚才 AI 生成的代码把我原来的函数覆盖了

Claude: 🔍 正在查找历史版本...

       📄 文件: utils.py
       📊 发现 5 个历史版本
       
       最近版本:
       1. 2024-04-10 15:30:22  (1.2 KB)  # 生成后的版本
       2. 2024-04-10 15:25:10  (980 B)   # 生成前的版本 ⭐
       
       是否恢复到生成前版本 (2024-04-10 15:25:10)?

用户: 是

Claude: ✅ 已恢复 utils.py 到 2024-04-10 15:25:10
       📄 被覆盖的版本已备份: utils.py.bak
```

---

## 场景 4: 跨会话找回

### 背景
昨天修改的文件，今天发现需要找回。

### 操作
```bash
# 文件历史不受会话影响，随时可查
python skills/file-history-manager/scripts/list-history.py models.py

# 可能看到:
# 1. 2024-04-10 18:20:00  (今天)
# 2. 2024-04-09 14:30:00  (昨天) ⭐

# 恢复到昨天版本
python skills/file-history-manager/scripts/restore-file.py \
    --file models.py \
    --version 20240409_143000
```

---

## 场景 5: 批量项目备份脚本

### 创建备份脚本 `daily-backup.sh`

```bash
#!/bin/bash
# daily-backup.sh - 每日备份关键文件

SKILL_PATH="skills/file-history-manager/scripts"
BACKUP_TARGETS=(
    "src/"
    "config/"
    "scripts/"
)

echo "🚀 开始每日备份..."
echo "时间: $(date)"

for target in "${BACKUP_TARGETS[@]}"; do
    if [ -d "$target" ]; then
        echo "📁 备份: $target"
        python "$SKILL_PATH/backup-now.py" --dir "$target"
    fi
done

echo "✅ 备份完成!"
```

### 使用
```bash
chmod +x daily-backup.sh
./daily-backup.sh
```

---

## 场景 6: 与 Git 配合使用

### 策略
- Git 管理已提交的稳定版本
- File History 管理未提交的临时修改

```bash
# 场景: 修改后未 git add，想快速回退

# 查看 git 状态
$ git status
On branch main
Changes not staged for commit:
  modified:   app.py

# 使用 file-history 回退（比 git checkout 更灵活）
$ python skills/file-history-manager/scripts/list-history.py app.py

$ python skills/file-history-manager/scripts/restore-file.py \
    --file app.py --latest
```

---

## 场景 7: 团队协作中的个人备份

### 背景
多人协作项目，不想把个人实验性修改提交到 Git。

### 方案
```bash
# 实验前备份
python skills/file-history-manager/scripts/backup-now.py api/routes.py

# 进行实验性修改...

# 实验失败，回退
python skills/file-history-manager/scripts/restore-file.py \
    --file api/routes.py --latest

# 实验成功，正常 git add && git commit
```

---

## 最佳实践

1. **关键修改前手动备份**
   - 破坏性操作前: `backup-now.py`
   - 生成代码前: `backup-now.py`

2. **定期查看备份空间**
   ```bash
   ls -lh ~/.claude/file-history/
   du -sh ~/.claude/file-history/
   ```

3. **配合 `.gitignore`**
   ```gitignore
   # 忽略自动生成的 .bak 文件
   *.bak
   ```

4. **重要里程碑创建标签**
   ```bash
   # 发布前完整备份
   python skills/file-history-manager/scripts/backup-now.py --dir .
   ```
