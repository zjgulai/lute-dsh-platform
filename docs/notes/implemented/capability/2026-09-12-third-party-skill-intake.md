# 第三方技能入库：去掉 `.git` 换归属可复现，并给「裸条目」立规矩

> 分类：capability · 生命周期：implemented · 关联决策：[ADR-0052](../../../adr/ADR-0052.md)
> 落地位置：`dsh-overseas-skills/docs/maintenance-sop.md` §12（入库 SOP）、`~/.dsh/skills/lieflat-charts/README.usage.md`（技能接口文档）

## Problem

把 `lieflat-charts` 接入本机时，压出两个此前没有成文规则的问题。

**一、入库要改 frontmatter，而 `git clone` 把每次更新都变成一次冲突。**
技能目录的既有机制是 `git clone` 到 `~/.dsh/skills/<name>/`。但技能页要显示中文名与一句话简介，
就必须改 `SKILL.md` frontmatter（`title` / `user_summary` / `user_try`，另加溯源 `metadata`）。
实测安装后 `git status` 立刻是：

```
 M SKILL.md
?? README.usage.md
```

于是 `git pull` 必然在 frontmatter 处冲突。要保住 `git` 就永远得记住「stash + 重放哪几个字段」——
漏一次就冲突一次。这不是安装期的一次性麻烦，是**每次更新都复发的结构性摩擦**。

**二、「装上了」不等于「有归属」，两个通路完全独立。**
技能装好后在 DSH 会话技能目录里当场可用（watcher 实时生效），但在出海技能页的策展目录里
**压根不存在**——`grep -i lieflat manifest/*.json` 零命中。查下去是宿主 `buildScenarios`
用 `skill.subcategory` 过滤 `manifest/skills.json` 的 `SKILLS` 才能匹配分组：manifest 没条目就静默不出现，
没有任何报错。即「能装」与「有归属」是两条独立通路。

用户随后确立规则：**每个进来的技能都必须落到岗位归属，或明确归为通用型；不允许裸条目。**

## Decision

**一、技能目录不保留 `.git`（用户选定 B 策略）。**
第三方技能以纯目录形态安装，版本控制元数据不留。可复现与回滚改由「锚定 commit SHA 记入接口文档 +
上游 tarball 版本化」承担。`lieflat-charts` 已执行：删 `.git`，释放 18 MB，126 个文件完好，
仓库自带 `validate.mjs` 仍通过。

**二、入库必须二选一。**
`manifest/role-assignments.json` 条目要么挂岗（`roles[]` 非空、`responsibility` 逐字属于该岗三条之一、
`from_skill`/`from_role` 是原文连续子串、≥3 岗不得 high），要么通用型（`roles: []` +
`no_role_kind` ∈ 四值之一 + 必写 `no_role_reason`）。

判别口径：**技能是「产出业务结论」还是「只做呈现/转换」**。`lieflat-charts` 输入任意数据、输出单文件 HTML，
不选品不诊断不归因 → `TOOL_ONLY`；同组 `ecommerce-sales-dashboard` 挂 AGT-021/AGT-003 是因为它自带业务口径。

**三、六步入库固化为 SOP**（`maintenance-sop.md` §12）：
形态判定 → 来源留底 → 补齐元数据 → 场景归位 → 岗位归属/通用分型 → 重建·验收·生效。

## Alternatives considered

- **保留 `.git`，更新时 stash + 重放字段**：保住 `git log` 与一键 `git pull`，但把「记住重放哪几个字段」
  变成永久人工负担。用户明确选定 B。
- **本地改动做成独立 overlay 文件，不改上游 `SKILL.md`**：理论上能同时保住 `.git` 与可更新性。
  但 DSH 技能发现只认 `<dir>/SKILL.md` 单一 frontmatter，没有 overlay 机制；实现它等于改基座，
  被仓库红线排除。这是本决策最主要的「本可更好但做不到」。
- **只写 manifest、不改 frontmatter**：实测无效——`title`/`user_summary` 由技能页读 SKILL.md 侧，
  且会话技能目录也不会显示中文名。两道都要写。
- **保持裸条目（不挂岗也不给分型）**：被用户显式否决，规则即为决策第二条。
- **为第三方另立平行 schema（区分自研/引入）**：语义更干净，但要改 taxonomy / role-assignments /
  skills 三处 schema 与全部消费方，收益不抵成本；改为在 `SKILL.md` 的 `metadata.source: third-party`
  标注来源，不动 manifest schema。

## Consequences

**正面**

- 更新不再有 frontmatter 冲突；失去 `git log` 的代价由文档记录的 SHA 补上，且写入升级流程
  （`README.usage.md` §2.2：备份 → 覆盖 → 重放字段 → `validate.mjs` 校验）。
- 归类可被门禁机器校验：包契约门已含「meta 计数与 manifest coverage 一致」「归位表形状合法」
  「`lib/role-map.js` 是 manifest 的精确投影」，裸条目与非法分型会被挡下，而非靠人记住。
- 入库路径成文，不再依赖这次会话的记忆。

**代价与约束**

- 去 `.git` 后**无法 `git diff` 看上游改了什么**，升级只能整体覆盖 + 重放字段；升级流程已写进文档。
- 锚定 SHA 存在文档而非版本库，**文档丢失即失去可复现性**。
- `lieflat-charts` 判 `TOOL_ONLY` 意味着它在技能页不显示任何岗位。这是刻意的克制，不是漏做。
- 许可证是业务决策不是技术决策：该技能 PolyForm Noncommercial，**对外商业交付超范围**，
  上游 issue #17 至今无回复。本决策只保证事实留档，不代替授权。

**过程中修掉的两个自身偏差（如实记录）**

1. 我最初把 `icon` 塞进 `manifest/skills.json`，被构建器**静默忽略**（该字段只对 81 系生效），
   卡片回退到分类默认头像——表现是「有头像但和同组其它技能一模一样」，极易误判为成功。
   正解是写 `manifest/skill-icons.json`，且已实测重跑 `assign_lute_icons.py` 仍保留（84 条不丢）。
   这条坑现写在 SOP §12.3。
2. 我第一次跑 `build_preset_catalog.py` 时它**静默清空了** `presets/preset-skills.json`
   （`PRESET_IDS` 的 7 个 preset 已不在 `~/.dsh/.agent-presets`，现存 51 个 `agt-NNN`）。
   已 `git checkout HEAD --` 还原，并给脚本加了守卫：**本次解析出 0 个而文件已有内容时跳过写盘并告警**，
   要清空须显式 `--force-empty-presets`。守卫经三重验证：重跑后 md5 未变、git 干净、负向验证可强制清空。
