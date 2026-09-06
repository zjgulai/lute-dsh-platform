---
title: Skill 结构医生 - 快速开始
doc_type: readme
module: root-skills-doctor
topic: quickstart
status: stable
created: 2026-05-27
updated: 2026-05-27
owner: self
source: human+ai
---

# root-skills-doctor

检测并修复 Skill 目录结构问题。

## 一句话说明

扫描 Skill 目录结构，自动修复缺失目录、杂乱文件、失效路径引用等问题。

## 何时触发

- "修复 skill 结构"
- "skill 目录整理"
- "批量修复 skills"
- "skill 结构检测"

## 快速用法

```bash
# 检测单个 Skill
python scripts/skill-doctor.py /path/to/skill --check

# 预览修复
python scripts/skill-doctor.py /path/to/skill --dry-run

# 执行修复
python scripts/skill-doctor.py /path/to/skill

# 批量检测全部 Skills
python scripts/skill-doctor.py /path/to/skills --batch --check

# 回滚
python scripts/skill-doctor.py /path/to/skill --rollback
```

## 核心能力

| 能力 | 说明 |
|------|------|
| 结构扫描 | 检测目录缺失、杂乱文件、失效引用 |
| 自动修复 | 创建目录、迁移文件、更新路径、生成模板 |
| 批量模式 | 一次性处理全部 Skills |
| 安全机制 | 自动备份、--dry-run、回滚支持 |

## 修复模式

| 代码 | 问题 | 自动修复 |
|------|------|---------|
| D001 | 缺少 README.md | ✅ |
| D003 | 缺少 manifest.yaml | ✅ |
| D004 | complex 缺 references/ | ✅ |
| D005 | 根目录杂乱文件 | ✅ |
| D006 | 路径引用失效 | ✅ |
| D007 | 空目录缺 .gitkeep | ✅ |

## 参考资源

- `references/fix-patterns.md` — 修复模式详解
- `references/safety-rules.md` — 安全机制
- `references/directory-spec.md` — 目录规范
