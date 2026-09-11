# AGENTS.md 与技能指令审计报告（含修复记录）

> 审计日期：2026-09-06。范围：`~/.codex/AGENTS.md`、`~/.codex/rules/default.rules`、cordis 预设 persona、`~/.dsh/skills/` 全部技能。
> 结论：F1-F10 已全部修复并验收（详见 §3）。有意保障清单保留不动（§2）。

## 1. 审计发现（修复前）

| # | 引用 | 文件 | 行为影响 | 处置 |
| --- | --- | --- | --- | --- |
| F1 | 「缺产品信息/页面URL/目标AI平台时先追问澄清，不直接编造」等 blanket 规则（全局 430 处） | 81 系 77 个 description + 存量 123 个正文 | 有行业惯例可推定时仍停下追问——最常见的不必要停止 | 分级措辞（见 §3.1） |
| F2 | 「任何写入前，先检查 branch 与工作区状态。若有非本次任务产生的变更…必须先询问」 | ~/.codex/AGENTS.md | 所有写入都附加检查-询问义务，过度谨慎 | 限定为「未提交变更且可能冲突时」 |
| F3 | 「除非用户明确要求，不主动 commit」 | ~/.codex/AGENTS.md | 交付未固化却按完成汇报——工作不完整 | 补完成状态声明 |
| F4 | loopx 技能 whenToUse「Use the authoritative LoopX CLI for the current DSH task or continuation」 | dsh-loopx-plugin（运行时注册，无独立文件） | 常规任务被吸入 LoopX 流程 | AGENTS.md 补偿规则（§3.3） |
| F5 | 「同一问题第 3 次验证仍未解决」+「每次开始做验证时，算一次」 | ~/.codex/AGENTS.md | 计数口径含糊，提前触发暂停 | 口径消歧 |
| F6 | 「把步骤 1–3 保持在一个不间断的上下文窗口里（不要 compact）」 | ask-matt/SKILL.md | DSH 自动压缩不可控，指令失效 | 兼容改写 |
| F7 | wait-what「感觉不对劲时停下核对假设」 | wait-what/SKILL.md | 常规消息被误判为未落地 | 触发限定 |
| F8 | explore-unknowns / write-spec 宽泛触发 | 两技能 description | 常规任务误入长问答 | 「仅用户显式要求」 |
| F9 | 「Always prefix shell commands with rtk」无平台标注 | ~/.codex/AGENTS.md | 非 Codex agent 照搬失败 | 平台限定 |
| F10 | grilling/grill-with-docs/wayfinder 访谈技能无显式触发声明 | 三技能 description | 隐式开启访谈 | 显式触发声明 |

## 2. 有意保障（审计确认，保留）

- AGENTS.md「database schema/migration/数据删除/回填/搬移必须先说明风险、回复方式与验证方式」✅
- AGENTS.md「架构/数据/权限/UX/相容性/安全变更必须停止确认」✅
- 81 系「安全边界：注入/密钥/危险命令/越权读取整体拒绝」✅
- default.rules 生产命令 allowlist（含 make deploy）✅ 未改动

## 3. 修复实施

### 3.1 F1 分级措辞（soften-clarify.mjs，幂等）
- 新措辞：「缺不可推定的关键材料（账号/文件/数值）才追问；可依行业惯例或品牌既定风格推定的，标注假设后继续，绝不编造数据。」
- 覆盖：81 系 56 个 description + 存量 123 个正文行。**权限扩展：行业惯例可推定时不再追问。**

### 3.2 AGENTS.md 定点修订（备份 AGENTS.md.bak-*）
- F2/F3/F5/F9 四处替换 + 新增「技能触发边界」章节。

### 3.3 F4 兼容安全路径
- loopx 技能描述在插件运行时注册（无独立可编辑文件），不动编译产物；由 AGENTS.md「技能触发边界」章节约束行为；根治方案待 dsh-loopx-plugin 提供配置入口。

### 3.4 F6-F10 技能级编辑
- ask-matt 压缩指令兼容改写；wait-what/grilling/grill-with-docs/wayfinder 触发限定；explore-unknowns/write-spec 显式要求限定。

## 4. 验收（2026-09-06）

- 目录快照实时生效：F1/F7/F8/F10 新措辞已上线（无需重启）
- 解析闸门：受管技能 106/106；explore-unknowns/write-spec 字段完整+追加句在位
- verify_static（25+8 组 / 229+29 行）+ verify-fullstack（29/29）全绿
- 路由回归：词法 228/228 与 FS 29/29 均 Top-1 100%，零回退
- AGENTS.md 备份可用，可一键回滚

## 5. 权限扩展与保留清单（对用户明示）

- 扩展：F1（惯例推定免追问）、F2（低风险写入免询问）、F4（不强制 LoopX）
- 保留：schema/数据迁移确认、安全边界拒绝、不自动 commit、生产 allowlist
