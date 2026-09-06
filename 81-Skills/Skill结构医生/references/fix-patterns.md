---
title: Skill 结构修复模式库
doc_type: reference
module: root-skills-doctor
topic: fix-patterns
status: stable
created: 2026-05-27
updated: 2026-05-27
owner: self
source: human+ai
---

# Skill 结构修复模式库

本文件定义 `root-skills-doctor` 支持的全部修复模式，与 `root-skills-opt` 的 D001-D007 错误代码对齐。

## 修复模式总览

| 错误码 | 问题 | 等级 | 自动修复 | 需确认 | 脚本支持 |
|--------|------|------|---------|--------|---------|
| D001 | 缺少 README.md | warning | 生成模板 | 是 | ✅ |
| D002 | 缺少 SKILL.md | error | ❌ 无法修复 | — | ❌ |
| D003 | 缺少 manifest.yaml | warning | 生成模板 | 是 | ✅ |
| D004 | complex Skill 缺少 references/ | warning | 创建目录 | 否 | ✅ |
| D005 | 根目录存在杂乱文件 | warning | 分类迁移 | 是 | ✅ |
| D006 | 路径引用失效 | warning | 自动更新 | 否 | ✅ |
| D007 | 空目录缺少 .gitkeep | info | 自动添加 | 否 | ✅ |

---

## D001: 缺少 README.md

**检测条件**: `README.md` 不存在于 Skill 根目录

**自动修复**: 生成 README.md 模板

```markdown
# {skill-name}

{description 首句}

## 何时触发

{触发词列表}

## 快速用法

```
/{skill-name} {参数}
```

## 参考资源

- `references/` — 详细文档
- `examples/` — 使用示例
```

**需确认**: 是（用户需补充具体用法）

---

## D002: 缺少 SKILL.md

**检测条件**: `SKILL.md` 不存在于 Skill 根目录

**处理方式**: 报错，无法自动修复。SKILL.md 是 Skill 的核心定义文件，必须由人工创建。

**建议**: 使用 `root-skills-creator` 创建标准 SKILL.md 模板。

---

## D003: 缺少 manifest.yaml

**检测条件**: `.skill-meta/manifest.yaml` 不存在

**自动修复**: 生成最小 manifest.yaml

```yaml
name: {skill-name}
description: |
  {从 SKILL.md frontmatter 提取 description}
version: "1.0.0"
complexity: {从 SKILL.md frontmatter 提取}
compatibility:
  claude: { status: native }
  kimi: { status: native }
  cursor: { status: native }
  gpt: { status: bridge }
  minimax: { status: bridge }
```

**需确认**: 是（用户需核实 compatibility 配置）

---

## D004: complex Skill 缺少 references/

**检测条件**: complexity == "complex" 且 `references/` 目录不存在

**自动修复**: 创建 `references/` 目录（不创建 .gitkeep，因为 complex Skill 应该有实际内容）

**需确认**: 否

---

## D005: 根目录存在杂乱文件

**检测条件**: 根目录存在不属于以下白名单的文件：
- `SKILL.md`
- `README.md`
- `.skill-meta/`
- `references/` / `examples/` / `scripts/` / `tests/` / `assets/` / `templates/`

**自动修复**: 按文件扩展名分类迁移：

| 扩展名 | 目标目录 |
|--------|---------|
| `.md`（非 SKILL/README） | `references/` |
| `.py`, `.sh`, `.js` | `scripts/` |
| `.yaml`, `.yml`, `.json` | `references/` 或 `scripts/`（按内容判断） |
| `.txt`, `.csv` | `references/` |
| 图片/模板 | `assets/` |

**需确认**: 是（迁移前展示文件列表，用户确认后执行）

**路径更新**: 迁移后自动更新 SKILL.md 和 README.md 中的相对路径引用。

---

## D006: 路径引用失效

**检测条件**: SKILL.md 或 README.md 中引用的文件路径不存在

**检测方式**: 正则匹配以下路径模式：
- `` `path/to/file` ``
- `[text](path/to/file)`
- `references/...`, `scripts/...`, `examples/...`

**自动修复**: 若引用路径在迁移后失效，自动更新为新路径。

**示例**:
- 迁移前: `详见 [guide](references.md)`
- 迁移后: `详见 [guide](references/references.md)`

**需确认**: 否（纯机械替换）

---

## D007: 空目录缺少 .gitkeep

**检测条件**: 存在以下目录且为空（无文件）：
- `references/`
- `examples/`
- `scripts/`
- `tests/`
- `assets/`

**自动修复**: 在空目录中创建 `.gitkeep`

**需确认**: 否

**注意**: 若目录已有文件（即使是 .gitkeep），不再重复创建。

---

## 修复优先级

执行修复时按以下优先级排序：

1. **P0 (安全)** — 创建备份（所有修复前自动执行）
2. **P1 (结构)** — D002 检测（报错阻断）→ D005 根目录清理
3. **P2 (必需)** — D001 README → D003 manifest
4. **P3 (推荐)** — D004 references → D007 .gitkeep
5. **P4 (验证)** — D006 路径更新 → 重新验证

---

**最后更新**: 2026-05-27
