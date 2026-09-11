# 提案：DeepSeek Harness Skill 中文别名（aliases）扩展点

> 状态：社区提案稿。当前体系用补丁方案（docs/cn-slash-commands.md）解决中文斜杠，本提案是上游根治路径。

## 背景

- 技能 `name` 强制 `SKILL_NAME`（kebab 英文），加载与运行时注册双层校验——产品硬约束，合理。
- 实际业务用户大量使用中文调用习惯（中文标题/触发词已在 description 中承载语义路由）。
- 中文斜杠命令目前仅靠「客户端补丁 + 模型标题路由」实现，升级需重打补丁，非一等公民。

## 提案内容

1. **frontmatter 新增 `aliases` 字段**（string[]，可空）：
   ```yaml
   name: "geo-optimizer"
   title: "GEO优化器"
   aliases: ["GEO优化器", "AI搜索优化"]
   ```
2. **加载器（dsh-skill-filesystem）**：解析 `aliases`，随定义存入 catalog 条目（`skill.aliases`）。
3. **选择器（dsh-client-ui-skill）**：candidates 匹配与 `lexicon` 合并 `aliases`；`onPick` 保持填入 `name`（别名仅作识别，不改变发送语义）。
4. **编辑器（dsh-client-ui-conversation）**：`TEXT_REF_RE` 的词名部分扩展 CJK 范围 `[\w-\u4e00-\u9fa5·]+`，使别名可成为 text-ref 实体（着色/精确匹配）。
5. **skill 工具（dsh-tool-skill）**：catalog 展示可带别名提示（`别名：GEO优化器`），模型可按别名调用（工具入参仍校验 `name`，别名仅提示）。
6. **运行时注册（dsh-skill register）**：`validateRuntimeSkill` 允许 `aliases` 透传（名字规则不变）。

## 兼容性

- 全部新增字段可选；无 aliases 的技能行为不变。
- `name` 规则不变 → 不影响既有目录、路由、基准。
- 别名不作为注册键，冲突不产生（展示层去重按 title+aliases）。

## 与当前补丁方案的关系

- 提案落地后，`patch-cn-slash.mjs` 可退役（L1 能力被官方覆盖）。
- 未采纳期间，现有补丁 + 文档继续承载中文斜杠体验。

## 参考实现证据

- 本体系 228 技能全部具备中文 `title`，81 系 description 内嵌中文触发词——别名数据源现成。
- 实测：中文命令经默认 sink 完整到达模型、目录刷新后 skill 工具按英文名调用成功（2026-09-05 验收）。
