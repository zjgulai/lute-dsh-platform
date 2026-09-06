# 立项：I3 严格开关语义（dsh-skill-subset respectFileFlags）

## 背景（审计发现 C3）

dsh-skill-subset 正向注册技能时硬编码 `modelInvocable: true / userInvocable: true`，
无视 SKILL.md 中 `disable-model-invocation` 开关 → 用户在设置页关闭的「模型可自动调用」，
在预设会话内依然生效。与 O1「默认模型关」的用户心智冲突。

## 目标

- 预设会话内，技能的模型可调用性 = 设置页开关状态（文件 `disable-model-invocation`）。
- 用户可调用性 = 文件 `user-invocable`。
- 零回归：默认关闭，仅「品牌营销增长官」开启；其余 12 个预设行为不变。

## 方案

| 项 | 内容 |
| --- | --- |
| 插件改动 | dsh-skill-subset 新增 config `respectFileFlags`（默认 false）；true 时正向注册按文件标志：`modelInvocable = !disable-model-invocation`，`userInvocable = user-invocable !== false` |
| 预设改动 | brand-marketing-growth 的 skill-subset 行加 `respectFileFlags: true`（gen_bmg_preset.mjs 已固化） |
| 影响面 | 仅 BMG 预设；12 个存量预设不传该键 → 行为不变 |
| 回滚 | 删除 agent.cordis.yml 中 `respectFileFlags: true` 一行即可回到现状 |

## 语义细节

- 81 系技能 O1 默认 `disable-model-invocation: true` → BMG 会话内默认「模型不自动调用、用户可点卡片」；用户在设置页把某技能开关打开后，该技能在 BMG 会话内变为模型可自动调用。
- 负向遮蔽（hideOthers）不受影响：白名单外技能在 preset 会话内仍完全不可见。

## 验收（重启后）

1. `node --check dsh-skill-subset/lib/index.js`（已过）
2. lint-preset.mjs 对 brand-marketing-growth 静态校验通过
3. 运行时：在 BMG 会话中——
   - 开关全关状态：模型目录不应自动推荐 81 系技能；"/" 菜单仍可见可点
   - 设置页打开某技能开关后：该技能进入模型目录
4. 回归：切换到 overseas-marketing（无 respectFileFlags）→ 行为与之前一致（全部可调用）

## 后续可选

其余 12 个预设如需同样严格语义，逐个加 `respectFileFlags: true` 即可（无需再改插件）。
