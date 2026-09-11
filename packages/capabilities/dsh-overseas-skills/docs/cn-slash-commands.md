# 斜杠命令全中文 · 完整优化解决方案

## 一、产品形态结论（DSH 0.1.2-alpha.1 源码级）

| 事实 | 依据 |
| --- | --- |
| 技能 `name` 必须是英文 kebab，中文名在**加载与运行时注册两层**都被硬性拒绝 | `dsh-skill` 的 `isSkillName`（`SKILL_NAME` 正则）+ `validateRuntimeSkill` 同样校验 |
| frontmatter 无别名机制（解析字段仅 name/description/title/whenToUse/invocation/metadata） | `dsh-skill-filesystem` 解析器 |
| 斜杠命令不经宿主解析：skill 触发器源无 `matchEnter`/`codec`，`/xxx` 全文进模型消息，由模型按 catalog 中文标题路由 | `dsh-client-ui-skill` source 定义 + `dsh-client-ui-input-trigger` adjudicate |
| 选择器 `candidates` 已按 title/name/description 匹配中文 | `dsh-client-ui-skill` candidates filter |
| 编辑器 `TEXT_REF_RE = (^|\s)([/@])([\w-]+)` 不认中文 → 中文 token 不产生 text-ref 实体、无序列化风险，走默认 sink 原样发送（与英文命令同路径） | `dsh-client-ui-conversation` |

**结论**：中文斜杠命令在模型层今天已可用（标题路由），缺的是 UI 全中文闭环；名字层不可改造（产品硬约束），中文承载在「选择器/卡片填入文本 + 模型标题路由」两层。

## 二、分层方案

### L1 已实施（本次，3 处小补丁，低风险）

| # | 补丁 | 效果 |
| --- | --- | --- |
| A1 | `dsh-client-ui-skill` onPick 改为填入中文标题 | 选择器选中后输入 `/GEO优化器`（原为英文名） |
| A2 | `dsh-client-ui-skill` lexicon 加入中文标题 | `/中文` 精确匹配与词法高亮（中文不产生 occurrence，无序列化风险） |
| A3 | `dsh-overseas-skills` 卡片墙点击填入中文标题 | 对话卡片墙与设置页卡片点击 → `/中文标题` |

补丁工具：`scripts/patch-cn-slash.mjs`（锚点匹配、幂等、首次自动备份 `.bak-cn-slash`、`--restore` 还原）。

### L2 触发可靠性保障（已就绪，无需新改动）

- 每个技能的 `description` 首部都含中文标题 + 触发词（81 系原生设计）
- LLM 路由基准：中文提问 → 英文技能名 22/22 命中（同机制适用于中文命令文本）
- 兜底语义：即便模型未立即调用，用户消息里的 `/中文标题` 与 catalog 标题精确同名，模型可纠正

### L3 核心规格提案（长期，不实施）

向 harness 提交 alias 扩展点：frontmatter `aliases: [中文…]` → 加载器解析 + 选择器 lexicon 合并 + 编辑器 TEXT_REF 支持 CJK + 模型目录显式别名。好处：不依赖补丁、升级永续。作为提案文档沉淀，等官方采纳。

## 三、维护与回滚

| 场景 | 操作 |
| --- | --- |
| DSH 升级后补丁失效 | `node scripts/patch-cn-slash.mjs` 重打（锚点未命中会显式报告） |
| 回滚 | `node scripts/patch-cn-slash.mjs --restore` + 刷新页面 |
| 生效方式 | 补丁在客户端代码 → 刷新浏览器页面（Cmd+R）即生效，无需重启进程 |

## 四、验收清单（刷新页面后）

1. 输入框键入 `/GEO优化器` → 菜单出现中文候选（GEO优化器 + 描述）
2. 选中 → 输入框填入 `/GEO优化器 `（中文，非 geo-optimizer）
3. 发送「/GEO优化器 帮我看这个页面的AI可见性」→ 模型调用 geo-optimizer 技能并执行
4. 对话卡片墙点 GEO优化器 卡 → 填入 `/GEO优化器 请使用…`
5. 回归：输入 `/geo-optimizer`（英文）仍正常工作（lexicon 双名共存）
6. 回归：`@` 文件夹引用、其他触发器不受影响
