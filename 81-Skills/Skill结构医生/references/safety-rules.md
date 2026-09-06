---
title: Skill 结构医生安全机制
doc_type: reference
module: root-skills-doctor
topic: safety-rules
status: stable
created: 2026-05-27
updated: 2026-05-27
owner: self
source: human+ai
---

# Skill 结构医生安全机制

## 核心原则

**不破坏、可回滚、先预览、后执行。**

---

## 1. 自动备份

### 触发条件

任何文件修改操作（创建、移动、覆盖）前，自动创建备份。

### 备份位置

```
{skill-path}/.doctor-backup/{timestamp}/
```

### 备份内容

- 被修改的原始文件（完整复制）
- 被移动的文件的原始路径记录
- 操作日志

### 保留策略

- 保留最近 10 个备份
- 超过 10 个时自动删除最旧的

---

## 2. --dry-run 预览模式

### 用法

```bash
python scripts/skill-doctor.py /path/to/skill --dry-run
python scripts/skill-doctor.py /path/to/skills --batch --dry-run
```

### 输出

只展示将要执行的操作，不实际修改任何文件：

```
[DRY-RUN] 将要执行以下操作:

1. [创建] references/（目录）
2. [移动] old-guide.md → references/old-guide.md
3. [更新] SKILL.md 中的路径引用
4. [创建] examples/.gitkeep

0 个文件将被修改
```

---

## 3. 渐进式执行

### 批次执行

修复操作按优先级分批次执行，每批之间暂停确认：

```
批次 1: 结构清理（根目录文件迁移）
批次 2: 目录补全（创建缺失目录）
批次 3: 文件生成（README / manifest）
批次 4: 路径更新（引用路径修正）
批次 5: 验证（重新扫描确认）
```

### 批次间确认

每批次执行前展示操作清单，用户确认后继续：

```
批次 2: 目录补全
- 创建 references/
- 创建 examples/

确认执行? [Y/n/skip]:
```

---

## 4. 回滚机制

### 单 Skill 回滚

```bash
python scripts/skill-doctor.py /path/to/skill --rollback
```

自动恢复到最近一次备份状态。

### 批量回滚

```bash
python scripts/skill-doctor.py /path/to/skills --batch --rollback
```

逐个 Skill 回滚，展示进度。

### 回滚前确认

回滚前展示备份信息：

```
将要回滚到: 2026-05-27 14:32:15
受影响文件:
- SKILL.md（将恢复原始版本）
- old-guide.md（将移回根目录）

确认回滚? [Y/n]:
```

---

## 5. 只读检测模式

### 用法

```bash
python scripts/skill-doctor.py /path/to/skill --check-only
```

只检测问题，不生成修复计划，不修改任何文件。

输出纯检测结果，类似 validate-skill.py 但增加 doctor 特有检测项（如根目录杂乱文件检测）。

---

## 6. 误操作防护

### 禁止的操作

| 操作 | 原因 |
|------|------|
| 删除 SKILL.md | 核心文件，任何情况不自动删除 |
| 删除 .git/ | 版本控制目录，完全禁止触碰 |
| 删除非 Skill 目录 | 扫描前验证目录结构，非 Skill 目录拒绝操作 |
| 覆盖已有内容的文件 | 只覆盖空文件或 .gitkeep，有内容的文件需确认 |

### 目录验证

操作前验证目标目录是否为合法 Skill 目录：

```python
def is_skill_directory(path):
    return (path / "SKILL.md").exists()
```

对非 Skill 目录拒绝操作并报错。

---

## 7. 操作日志

### 日志内容

每次修复操作记录：
- 时间戳
- 操作类型（创建/移动/更新/删除）
- 源路径和目标路径
- 操作结果（成功/失败）
- 备份路径

### 日志位置

```
{skill-path}/.doctor-backup/{timestamp}/operation.log
```

---

**最后更新**: 2026-05-27
