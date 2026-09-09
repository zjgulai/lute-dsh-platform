# 出海技能体系 · 近期变更与坑位记录（2026-09-08~09）

> 供明日继续二开前快速对齐。诊断类坑位已同步进 `dsh-dev-platform-diagnostics` 技能案例库（第 12/13 例）。

## 1. 分类体系 v3（他人今晨重构，本侧已适配）

- 分类由 `manifest/taxonomy-v3.json` 驱动：**8 大场景 / 28 细分 / 222 条技能**（preset-* 7 个移出目录）；AI全栈 8 组 / 29 条独立
- `build_preset_catalog.py` 按 `tax_map` 把技能归位（`category`=大场景、`subcategory`=细分场景）；未映射技能会被丢弃并列入 unmapped
- 终审稿文档：`docs/skill-taxonomy-v2.md`（文件名未改，内容已是 v3 终审稿，8 场景/28 细分）
- 胶囊卡分类名随之变化：如「Agent 管理与基建」→「Agent与技能工程」（H 组织与工具 → h2-agent-skill）

## 2. 本侧近两日工程变更

| 变更 | 内容 | 状态 |
| --- | --- | --- |
| catalog 硬链接双杀修复 | lib/catalog.js 曾与 profile 副本同 inode，`cat >` 同步先截断再读→两文件同归 0 字节。已断链 + 恢复 + 重建 | ✅ |
| pipeline.sh 同步加固 | 阶段 8 改为 tmp+mv 原子替换（同 inode 先 rm），杜绝复发 | ✅ |
| 图标防抹 | assign_lute_icons.py 从全量重写改为「保留非 81 系自定义图标」合并写（skill-icons.json 现 83 条） | ✅ |
| 新卡两张 | agent-browser（浏览器自动化）+ self-improvement（知识进）：manifest 条目 + lute 角色头像（qa-tester / ai-assistant）+ catalog 重建 + 斜杠可调 | ✅ |
| SKILL.md 双重 `---` 坑 | 知识进曾因开头 `---\n---\n` 空 frontmatter 被技能加载器静默忽略（卡片/斜杠双消失）。教训：改 frontmatter 后必验无重复分隔符 | ✅ 已修 |
| 契约三键 | 技能「输入→输出契约」改造覆盖 237/248 技能（input_contract/output_contract/example） | ✅ |

## 3. 当前量级

- 技能目录 `~/.dsh/skills/`：**250+ 个技能目录**（含 AI全栈、lute-brand-icons、四个万物互联引导技能）
- catalog：8 大场景 / 222 条 + AI全栈 8 组 / 29 条；skill-icons.json 83 条（81 + 2 自定义）
- lute-brand-icons 资产 manifest：176 条目

## 4. 明日注意

1. 改 catalog 只改 manifest 源 + 重跑 `build_preset_catalog.py`，禁止手改 lib/catalog.js
2. 同步 profile 一律 `cp src dst.tmp && mv -f dst.tmp dst`（或 pipeline.sh 阶段 8）
3. 新装技能改 SKILL.md 后 `od -c` 验文件头（防重复 `---` 静默忽略）
4. 图标新增走 lute-brand-icons 角色头像，重跑 assign 不丢（合并逻辑已固化）
