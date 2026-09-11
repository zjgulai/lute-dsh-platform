# 其他 preset 出海技能同款处理 · 方案与留痕

> 目标：7 个非海外业务 preset 获得与 overseas 系列同等能力——会话级技能子集隔离 + 输入框上方卡片墙指导。
> 原则：与已安装技能逐一对照，保障兼容性、连通性、稳定性；宿主改动合并为单次重启。

## 1. 现状盘点（执行前）

| preset | 自有技能 | filesystem 行 | 修复项 |
|---|---|---|---|
| ai-content-image-studio | ai-content-images | ✓ false | +subset 行 |
| ai-product-developer | grill-me / tdd / to-spec | ✓ false | +subset 行 |
| ai-report-analyst | build-ai-report | ✓ false | +subset 行 |
| dsh-motion-deck-studio | dsh-motion-deck | ✓ false | +subset 行 |
| feishu-digital-employee | feishu-digital-employee | ✓ false | +subset 行 |
| llm-wiki-fullstack | find-plugins | **缺 includeDefaultRoots:false（泄漏用户技能）** | 补配置 + subset 行 |
| product-video-director | product-launch-video | ✓ false | +subset 行 |

## 2. 已执行改动

### A · 目录化
- `scripts/build_preset_catalog.py`（幂等）：扫描 7 个 preset 的 `skills/` 目录 frontmatter →
  `presets/preset-skills.json`（人工中文标题映射，修复 to-spec 标题占位）；
  重建 `lib/catalog.js`：19 组（海外 12 + preset 7）/ 139 条（海外 130 + preset 9）。
- 宿主 `/list` 无需改逻辑：分组自动包含 preset 组；`installed:false` → 设置页自动隐藏、卡片墙正常显示。

### B · 隔离
- `dsh-skill-subset` 扩展（默认行为不变）：
  - `positiveSource: "dir"|"none"`（none = 仅负向遮蔽，正注册交给自有 filesystem 行）
  - `skillsDir` 可定制（默认 `~/.dsh/skills`）
- 7 个 `agent.cordis.yml` 各加 subset 行：`skills=[自有名单], hideOthers:true, positiveSource:'none'`。
- llm-wiki-fullstack filesystem 行补 `includeDefaultRoots:false`。
- YAML 结构校验全部通过（含 !!js 自定义标签），无重复行 id。

## 3. 兼容性 / 连通性 / 稳定性对照

| 维度 | 结论 |
|---|---|
| 命名冲突 | 9 个自有技能名 vs 130 海外 / 6 本地 / 88 shipped：无重名 |
| 层隔离 | 各 preset 的 subset 注册在本 preset 层内，互不影响；海外 5 preset 行为不变（positiveSource 默认 dir） |
| 卡片墙 | 过滤逻辑天然兼容：preset 会话显示其组；普通/海外会话名单不含 preset 技能名 → 不显示新组 |
| 设置页 | preset 技能 installed:false → 被「仅显示已安装」过滤，不出现无效开关 |
| 连通性 | feishu preset 的 mcp-client 行与已接入的 lark-cli 授权可联动；product-video tool-web（fetch:false）不动 |
| 稳定性 | 宿主改动（catalog.js + subset 插件 + preset 行）合并为一次重启；卡片墙防崩溃+签名防抖已就位 |

## 4. 验收记录（2026-09-01）

- [x] 重启后探针：7 个 preset scope 全部隔离成功
  - ai-content-image-studio: model=1（ai-content-images）/ hidden=204
  - ai-product-developer: model=3（grill-me/tdd/to-spec）/ hidden=204
  - ai-report-analyst: model=1（build-ai-report）/ hidden=204
  - dsh-motion-deck-studio: model=1 / hidden=204
  - feishu-digital-employee: model=1 / hidden=204
  - llm-wiki-fullstack: model=0（find-plugins 自带 disable-model-invocation:true，user=1，设计如此）/ hidden=204
  - product-video-director: model=1 / hidden=204
- [x] 海外 5 preset 回归不变：finance=11 / marketing=24 / sourcing=23 / store-ops=34 / allround=110
- [x] 启动日志 preset-lint 全部 OK；dsh-skill-subset 零告警
- [ ] 卡片墙目测：7 个 preset 会话显示「自有技能 · N 项」+ 对应组（待用户确认）
- 备注：standing 挂载为懒创建 + 异步注册，探针首次触碰可能读到部分注册（约 10 秒内收敛）；会话创建时挂载即触发，不影响真实使用。

## 5. 回滚

- 幂等可删：移除 7 个 subset 行 / 重跑 build_preset_catalog.py 还原 catalog / 恢复 llm-wiki filesystem 配置。
