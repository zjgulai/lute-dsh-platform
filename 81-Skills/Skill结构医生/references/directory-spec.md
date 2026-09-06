---
title: 目录规范速查
doc_type: reference
module: root-skills-doctor
topic: directory-spec
status: stable
created: 2026-05-27
updated: 2026-05-31
owner: self
source: human+ai
---

# 目录规范速查

本文件引用 `docs/universal-skill-schema.md` 的目录规范章节，供 `root-skills-doctor` 快速查阅。

> **单一权威源**: `docs/universal-skill-schema.md`
> 本文件为速查引用，不独立定义规范。

## 文件分级

| 路径 | 等级 | validator 行为 |
|------|------|----------------|
| `SKILL.md` | **required** | 缺失 → error |
| `README.md` | **recommended** | 缺失 → warning |
| `.skill-meta/manifest.yaml` | **recommended** | 缺失 → warning |

## 目录分级

| 目录 | 等级 | validator 行为 |
|------|------|----------------|
| `references/` | **optional**（complex 推荐） | complex 缺失 → warning；其他 → info |
| `examples/` | **optional** | 缺失 → info |
| `scripts/` | **optional** | 缺失 → info |
| `tests/` | **optional** | 缺失 → info |
| `assets/` | **optional** | 缺失 → info |
| `eval-reports/` | **optional** | 缺失 → info |

## 等级语义

- **required**: 缺失 → error → 阻塞发布
- **recommended**: 缺失 → warning → 不阻塞，发布前修复
- **optional**: 缺失 → info（complex 的 references/ 例外，升级为 warning）

## 空目录处理

- 刻意保留的占位目录用 `.gitkeep`
- 不要为了过验证而强行创建空目录

## 禁止行为

- ❌ 不允许把 `references/` / `examples/` / `scripts/` / `tests/` / `eval-reports/` 表述为"必须"
- ❌ 不允许把 `README.md` 表述为"应当不存在"
- ❌ 各 Skill 不得另行定义优先级矩阵

---

**权威源**: `docs/universal-skill-schema.md` — 目录与文件规范章节
