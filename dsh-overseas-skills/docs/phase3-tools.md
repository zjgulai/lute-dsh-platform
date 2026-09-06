# Phase 3 外部工具接入 · 执行留痕（2026-09-01）

## Tier 0 · lark-cli ✅（已完成）
- v1.0.76 已安装；用户身份授权（周健 ou_302630743abe106ea6ff03703291b4a4），token valid。
- 实读验收：task tasklists list → 「开店管理」。
- lark-tools 环境说明已更新、toolGap 徽标已移除。
- 备注：bitable/v1/apps 列表接口 404（应用未挂多维表格侧入口），其余域可用。

## Tier 1 · Exa ✅（2026-09-01 验收通过）
- exa_search 真实链路实测通过（公司调研 Anker / 人物调研 Tim Cook 均返回结果）。
- 凭据 ref 最终定名 `overseas_exa`（存储只接受 POSIX 标识符，点号非法）。
- 设置页凭据卡显示「Exa 已配置」；3 个技能徽标已移除（25 → lark 1 → Exa 3 = 剩 21）。
- 排障记录（本 tier 三轮重启教训）：
  1) 宿主插件硬链接断裂 → 路由缺失 404 "not found"（JSON 解析报错表象）；
  2) 输出 schema DSL 不支持 `required`（任何层级）——注册抛 JsonSchemaError；
  3) 宿主 ctx.get 服务访问需在 `exports.inject` 声明（未声明 → undefined，报「credentials 服务不可用」）。

- 新宿主插件 `dsh-overseas-tools`（profile deps + bundles，已 pnpm install）：
  - `exa_search` 模型工具：query/numResults/type；凭据 `overseas.exa`（credentials.resolve 每次现读）；
    缺 Key 返回配置指引（优雅降级，绝不编造）；超时 25s；并发安全。
- dsh-overseas-skills 宿主新增 `/api/dsh-overseas-skills/credential`（GET describe / POST set；
  白名单 overseas.exa / overseas.jungle-scout / overseas.klaviyo；值不回显；loopback fence）。
- 设置页新增「外部工具凭据」卡（Exa Key 输入 + 状态 chip + 保存）。
- 3 个调研技能环境说明更新为 exa_search 接入指引（company/people/org-structure-research）。
- **待办**：重启 → 用户在设置页填 Key → exa_search 实测 → 移除 3 个 Exa 徽标（manifest/catalog 再生成 + 重启）。

## Tier 2 · Jungle Scout / Klaviyo ⏳（凭据位预留，待账号）
- 凭据 ref 已白名单预留：overseas.jungle-scout / overseas.klaviyo。
- 需用户确认账号可得性后逐工具实现（MCP/OAuth 接入 + 技能环境说明 + 徽标移除）。

## 连通性实测 · 飞书 preset ✅/⚠️
- 查会议室真实链路 ✓：feishu_meeting.py probe（ABI-KB 机器人凭据链）→ 87 间会议室 / 24 间空闲（航天创新大厦等真实数据）。
- 建任务链路 ✅（2026-09-01 权限开通后复测）：机器人应用创建「DSH 连通性测试」成功（guid 8ee657b7…）并已清理删除。
  lark-cli 用户身份路径同样可用（创建 → 回读 assignee=周健 → 删除，零残留）。
- 排障备注：credentials.yaml 值需 strip 后使用（bash sed 提取多出 1 字节导致 10014；MCP 自身 JS 路径无此问题）。

## 路由基准扩展 ✅
- 基准 70 → 82 条（新增 12 条：9 个 preset 技能正向/边界 + 3 条出海反向确认）。
- LLM 档：82/82 = 100% 严格命中（preset 技能与海外技能零串扰）。
- 词法档：并入 preset 索引，Top-1 70.7% / Top-3 79.3%（preset 用例以 LLM 档为准）。
- 报告：eval/runs/2026-09-02T04-37-09-187Z-llm.json 等。
