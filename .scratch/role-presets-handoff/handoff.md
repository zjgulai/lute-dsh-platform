# 50 个 AI 岗位 Preset 后续落地交接文档

> 交接版本：RP-HANDOFF-1.0
> 交接日期：2026-09-17
> 当前状态：RP-M2 材料注入已完成；RP-M3 至 RP-G8 待按门禁执行
> 文档归属：Magpie-Horch `.scratch` 工作层，不属于出货面
> 上游事实源：`/Users/lute/project/AI组织变革/`

本文件给后续自动执行者使用。它定义执行顺序、证据要求、停止条件和权限边界；它本身
不授予 DSH 导入、企业系统写入、生产发布、预算调动或组织变更权限。任何一步遇到未核实
的版本、schema、凭据、服务身份或外部回执，必须停在该步并记录 `BLOCKED`，不能猜测
配置键或继续下一步。

## 0. 一分钟交接

- 50 个逻辑岗位已由同源 compiler 生成到 `~/.dsh/.agent-presets/agt-001..agt-050`。
- 每个 preset 现在包含 `source_snapshot`、`role_assets`、Soul 摘要、完整岗位卡/Playbook/
  Blueprint 快照和 `RRB-AGT-NNN` Bundle 引用。
- Magpie-Horch 本次已改文件：`scripts/role-presets/generate.mjs`、
  `scripts/role-presets/verify-lossless.mjs`、`scripts/role-presets/README.md`。
- 本地 L1–L12 校验已通过 5106 条断言；连续重生成逐字节一致；篡改 Soul 快照的反向
  探针按预期失败。
- `role_assets.role_playbook.loader=target-host-to-be-verified` 且 `installed=false`：
  当前是可审计的岗位 Skill descriptor，不是已被目标 DSH Host 加载的运行 Skill。
- 所有 Blueprint 为 `blueprint_only_not_importable`，`production_authorized=false`，
  组队模式由外部 Case Control 控制，`peer_chat=false`、`re_delegation=false`。
- Shopify 仍是空白新店；Amazon、独立站、其他站点和业务系统均未在本交接中连接或写入。

## 1. 当前可验证基线

### 1.1 仓库和派生输出

| 项 | 当前值 | 证据/边界 |
| --- | --- | --- |
| Magpie 分支 | `main` | 当前工作树有大量既有脏改动，禁止 reset、clean、worktree 或覆盖无关文件 |
| Magpie HEAD | `cc6f1ac3025fe778f636a9c049bd26e88e6bfd33` | 仅表示当前 checkout，不代表本次改动已提交 |
| 角色源 revision | `source-hash:f4c8fe8f97debfe5a8b87130a7d3aecf01cd66cbe397d5de6400e6e013e9133b` | 来自 `agt-001/manifest.json`，每个岗位应一致 |
| generator revision | `4ed4912df84c8f3e55a5aa933432578390e0132ba63def745e62aaf910310d8c` | 生成器源码 hash；改变代码后必须重生成并复核 |
| DSH pin | `2.0.5` | Magpie 本机证据，不能替代企业目标 Host 版本 |
| Preset 输出 | `~/.dsh/.agent-presets/agt-001..agt-050` | 派生运行目录，不是事实源，不提交仓库 |
| 产品挂载 | `PRODUCT_MOUNTS={}` | 外部产品、Shopify、Amazon 不得烘焙进岗位出货组合 |

### 1.2 必读事实源

自动执行者开始任何新阶段前必须读取：

1. `/Users/lute/project/AI组织变革/docs/00-project/STATUS.md`
2. `/Users/lute/project/AI组织变革/docs/00-project/DEVELOPMENT.md`
3. `/Users/lute/project/AI组织变革/docs/00-project/DECISIONS.md`
4. `/Users/lute/project/AI组织变革/docs/12-rollout/ROLE-PRESET-IMPLEMENTATION-TODO.md`
5. `/Users/lute/project/AI组织变革/docs/12-rollout/MAGPIE-RP-M2-COMPILER-INJECTION-SPEC.md`
6. `/Users/lute/project/AI组织变革/docs/10-platform/deepseek-harness/MAGPIE-RP-M1-SCHEMA-EVIDENCE.md`
7. 本仓库 `AGENTS.md`、`docs/architecture.md`、`docs/pitfalls-playbook.md`

角色事实只从 AI 组织项目读取：

- Role Profile：`docs/05-agents/roles/AGT-NNN.md`
- Soul Contract：`docs/05-agents/roles/souls/AGT-NNN.soul.md`
- Role Playbook：`docs/06-playbooks/role-playbooks/AGT-NNN.md`
- Preset Blueprint：`docs/10-platform/deepseek-harness/preset-blueprints/AGT-NNN.json`
- 两个索引：Role Playbook `index.json`、Preset Blueprint `manifest.json`

## 2. 自动执行协议

1. 每次只执行一个阶段；阶段完成后写入证据并停止，等待下一次调度。
2. 开始前运行只读 `git status --short --branch`，发现不明改动与目标文件冲突立即 `BLOCKED`。
3. 只在 `main` 工作；禁止创建 worktree、reset、clean、强制 checkout 或删除未知文件。
4. 先 `plan/dry-run`，再 `validate`，最后才进入该阶段明确授权的 `apply`。没有明确
   `apply` 权限时不得写入目标 Host 或企业系统。
5. 不把提示词、Soul、Skill 或 manifest 字段当成服务端权限；权限必须由 Host、插件、
   Policy Gate 或 Execution Broker 以可观察拒绝结果证明。
6. 所有结果标记为 `Observed`、`Derived`、`Proposed`、`Blocked` 或 `Accepted`，禁止把
   本机成功、静态 lint、计划文件或模型输出写成生产验收。
7. 凭据、客户明细、订单明细、员工资料、Access Token、Client Secret 和 Service Identity
   不写入本仓库、handoff、日志或 evidence 目录。
8. 任何写操作都记录：操作者、时间、目标、范围、输入 revision、输出 hash、回滚方式和
   外部回执；缺任一项则停止。

## 3. 分阶段执行路线

### H0：接管与源快照（只读）

**目标**：证明自动执行者从正确仓库、正确分支和正确源 revision 开始。

- [ ] 读取本文件第 1 节和所有必读事实源。
- [ ] 核对 Magpie branch、HEAD、工作树脏文件；不处理无关脏改动。
- [ ] 运行 `node scripts/role-presets/verify-lossless.mjs`，必须得到 L1–L12 全绿。
- [ ] 读取 50 个 manifest，核对 `source_revision`、`generator_revision`、`role_assets` 数量。
- [ ] 把本次只读结果写入批准的 evidence 目录，不写任何业务数据。

**通过条件**：50/50、5106 条断言通过、源 revision 一致、无工作树冲突。

**停止条件**：校验失败、源 revision 漂移、manifest 缺件、发现需要覆盖其他人的改动。

### H1：目标 DSH Host 能力取证（只读）

**目标**：确认企业目标 DSH 与本机 `2.0.5` 证据是否同一产品、同一版本和同一 schema。

按目标 Host 的官方文档、已安装包和可审计 API 取证，不预设导入键名。必须记录：

- 产品身份、Host 版本、Preset schema 和 Skills registry schema；
- `select`、`mount`、`composeFrom`、session resolver 的生命周期与错误语义；
- `dsh-skill-subset` 的 `skillsDir`、frontmatter、`source`、`hideOthers` 行为；
- role-specific `SKILL.md` 的实际发现路径和失败行为；
- 工具/MCP/API/hook 的 schema、scope、TTL、审计字段和服务身份位置；
- 目标 Host 是否支持外部 Case Control 为 Lead/Worker 各自启动指定 preset。

**通过条件**：所有结论有官方资料或本机可复现证据，Unknown 单独列出。

**停止条件**：只能从 Prompt 推断权限、找不到 schema、无法证明 loader、或需要登录生产账户。

### H2：岗位 Skill 投影（隔离目录）

**目标**：将 `role_assets.role_playbook` 的 descriptor 转换为目标 Host 可验证的岗位 Skill，
不改变事实源、不写生产技能目录。

执行顺序：

1. 先选四个代表岗位：AGT-001（经营）、AGT-021（Amazon）、AGT-005（独立控制）、
   AGT-049（数据与 Agent 平台）。
2. 在临时目录派生 `role-playbook-agt-nnn/SKILL.md`，frontmatter 至少包含合法 `name`、
   非空 `description`、`user-invocable: false`；正文 hash 必须等于 manifest。
3. 运行目标 Host 的静态 schema/lint；不要把候选键直接写入默认 `~/.dsh/skills`。
4. 将 `loader`、发现路径、注册结果、失败结果和 hash 写入 `RP-M3-skill-projection` 证据。
5. 四个岗位通过后，才可提出其余 46 个岗位的批量投影计划。

**通过条件**：四个岗位均能在隔离目录发现、读取、拒绝非法 frontmatter，并保持 source hash。

**停止条件**：loader 行为未知、Skill 被错误注册到全局、正文 hash 漂移、或目标 Host 需要生产凭据。

### H3：独立 Preset 真实 mount（隔离环境）

**目标**：证明一个岗位能以独立 DSH session 启动并加载自己的 preset 与岗位 Skill。

- [ ] 使用隔离 profile、临时 workspace 和脱敏输入。
- [ ] 只验证 preset resolver、persona、Skill discovery、最小只读工具和失败回执。
- [ ] 验证选择 `agt-001` 后不会落到默认 preset，也不会静默继承另一个岗位身份。
- [ ] 验证缺失 Skill、错误 Bundle、非法 scope、过期输入会失败关闭。
- [ ] 记录 session id、preset id、Bundle version、工具可见集合和实际拒绝结果。

**通过条件**：四个代表岗位独立 mount 回放均通过，且没有业务资产写权限。

**停止条件**：无法证明 session 使用了目标 preset、工具过滤仅靠 Prompt、或出现真实资产写入口。

### H4：外部 Case Control 组队回放（隔离环境）

**目标**：验证一条 Case 由一个 Lead 和有界 Worker 完成，不使用岗位间自由聊天或模型路由。

每个 Case 必须固定：

```text
case_id
主价值流
主场景
Lead role_id / Bundle version
Worker role_id / Bundle version
Case Charter
输入 ArtifactEnvelope
输出 schema
Access Contract
幂等键与过期时间
```

回放必须证明：

- Worker 只能消费已验收 Stage Artifact；
- Worker 不能自行再委派、改变范围或转授权限；
- 冲突、缺件、过期、重复和回执不明都会进入 `HOLD`、`Frozen` 或 `Rework`；
- Lead 汇总的是 ArtifactEnvelope，不是隐式 session transcript；
- Action Intent 只被记录，不能绕过模型外 Policy Gate 和 Execution Broker。

**通过条件**：Case Control、ArtifactEnvelope、Acceptance Record、冲突回退和审计链完整。

**停止条件**：出现 LLM 多 Agent 路由、peer chat、未验收产物直传、或模型可直接执行资产动作。

### H5：业务系统 Sandbox 连接（先读后写）

**目标**：在无生产凭据和无真实资产写入的情况下，验证业务连接器和工具 UI/UX 边界。

推荐顺序：Shopify 空白新店 → Amazon 只读沙箱/模拟数据 → 独立站 → 其他站点。每个连接器
先登记：

- 系统、租户、账号、品牌、市场、渠道和 SKU 范围；
- OAuth/MCP/API 版本、scope、rate limit、分页、幂等键和回执查询；
- 读工具、确定性校验、展示工具、Action Intent 工具和 Broker 的边界；
- 凭据由外部凭据服务持有，模型只看到脱敏结果和工具契约；
- UI 卡片作为工具调用，组件参数和失败状态可回放。

禁止在本阶段：真实商品发布、库存/价格/广告/订单/退款写入、客户触达、预算变更或批量导入。

**通过条件**：模拟数据读链路、错误码、scope 拒绝、限流、幂等和审计证据完整。

**停止条件**：连接器要求生产 token、scope 无法最小化、写操作无法被 Broker 拦截、或数据范围不清。

### H6：Shadow 影子运行

**目标**：用脱敏或只读真实数据并行比较 50 岗位和组队方案的经营质量，不产生资产动作。

首批样本覆盖四个代表岗位和至少一条 GMV 价值流。记录：任务完成率、产物质量、决策延迟、
机会识别、异常冻结率、误动作（必须为零）、人工介入负荷、单位任务成本和外部回执差异。

**通过条件**：结果有基线、有时间窗、有样本数、有失败分类和可回退版本；不能只凭模型自评。

**停止条件**：误动作非零、回执不可核验、成本/质量低于批准阈值、或出现范围扩张。

### H7：Limited 有限动作

**前置授权**：必须取得明确的业务负责人、范围、预算、动作类别、TTL 和回滚授权。

- [ ] 逐岗位、逐价值流、逐渠道生成 Action Policy allowlist。
- [ ] Policy Gate 在模型外拒绝未授权对象、范围、参数和过期请求。
- [ ] Execution Broker 执行幂等、审计、回执查询和失败恢复；模型永远看不到凭据。
- [ ] 先选有限店铺、有限 SKU、有限市场和短时间窗，默认 `NO_ACTION`。
- [ ] 每日检查自治异常、HITL 负荷、GMV 结果、成本和回滚可用性。

**停止条件**：任一 scope 漂移、回执缺失、审计断链、恢复失败、预算超限或人工负荷超阈值。

### H8：Production 生产准入

生产不是自动执行结果，必须形成逐岗位、逐场景、逐渠道的准入记录：

- 目标 Host 版本/schema、插件和服务身份证据；
- Shadow/Limited 经营结果、异常、成本、HITL 负荷和外部验收；
- Role Release Bundle、Access Contract、Policy Gate、Broker、回滚版本和 TTL；
- 业务负责人和安全/合规负责人批准记录；
- 生产变更窗口、监控、告警、止损和撤销方法。

没有这些证据时，保持 `production_authorized=false` 和 `blueprint_only_not_importable`，不发布、不扩大范围。

## 4. 统一产物与证据清单

所有证据保存到经批准的构建记录或本目录的 `evidence/`，不得包含凭据和客户明细：

| 产物 | 阶段 | 最低内容 |
| --- | --- | --- |
| `RP-M3-host-evidence.json` | H1 | 产品/版本/schema/插件/loader/Host 行为/Unknown |
| `RP-M3-skill-projection.json` | H2 | 四岗 Skill 路径、frontmatter、source、hash、注册与失败回放 |
| `RP-M3-mount-results.json` | H3 | session、preset、Bundle、可见工具、拒绝和错误回执 |
| `RP-M4-case-replay.json` | H4 | Case Charter、Lead/Worker、ArtifactEnvelope、Acceptance、冲突回退 |
| `SHOP-G2-sandbox.json` | H5 | Shopify 空店沙箱连接、scope、模拟数据、Broker 拒绝 |
| `SHADOW-<window>.json` | H6 | 样本、基线、GMV 机会、质量、延迟、异常、成本和人工负荷 |
| `LIMITED-<window>.json` | H7 | 授权范围、Policy、Broker、回执、TTL、止损和回滚 |
| `PRODUCTION-READINESS.json` | H8 | 准入批准、经营结果、风险和撤销方案 |

每个证据文件必须携带：`evidence_id`、`stage`、`status`、`created_at`、`source_revision`、
`generator_revision`、`scope`、`inputs`、`outputs`、`hashes`、`operator`、`approval_ref`、
`limitations`。`status=Accepted` 只能由对应门禁的外部验收者写入。

## 5. 权限和停止矩阵

| 动作 | 自动执行默认权限 | 继续条件 |
| --- | --- | --- |
| 读取本地方案、源文件和静态 schema | 允许 | 保持只读并记录来源 |
| 临时目录生成、lint、hash、负向测试 | 允许 | 不覆盖默认运行目录，不含敏感数据 |
| 重生成 `~/.dsh/.agent-presets` | 仅在本交接明确阶段授权 | 先跑 verify，保留非管理行，写后回读 |
| 写入 `~/.dsh/skills` 或目标 Host profile | 默认禁止 | H1/H2 证据、明确授权和可回滚方案齐全 |
| 修改 Magpie-Horch 代码/配置 | 默认禁止 | 新的用户授权、目标文件无冲突、门禁计划明确 |
| 连接 Shopify/Amazon/独立站/其他业务系统 | 默认禁止 | H5 sandbox 授权、最小 scope 和脱敏数据齐全 |
| 商品、库存、价格、广告、订单、退款、客户消息等资产动作 | 禁止 | 只能由模型外 Policy Gate + Broker 在 H7 后执行 |
| 生产发布、预算变更、组织变更、裁员或真人负责人任命 | 禁止自动执行 | 单独的管理层和安全/合规批准 |

## 6. 回滚和事故处理

1. 发现输入 hash 漂移：停止当前阶段，保留现场，重新生成 source snapshot；不覆盖旧 Bundle。
2. 发现 Skill loader 或 preset resolver 行为变化：把角色置为 `HOLD`，恢复上一个已知正常 Bundle。
3. 发现工具 scope、Case 状态或 ArtifactEnvelope 越界：立即停止受影响 Case，保留审计记录，
   不自动重试扩大动作。
4. 发现外部回执不明：标记 `UNKNOWN`，查询 system-of-record；不能凭模型输出判定成功。
5. 发现生产误动作：由模型外 Broker 的止损和回滚流程处理；自动执行者不得删除日志、伪造回执
   或修改历史 Bundle。

## 7. 下一次自动执行的唯一入口

下一次自动执行从 **H0** 开始，且只允许完成 H0 的只读核验和 evidence 生成。H0 通过后，
下一轮才进入 H1。任何自动执行者不得因为 H0 通过而跳到 H2、H5、H7 或 H8。

完成 H1 后必须把以下问题单独提交决策：

1. 目标 DSH Host 是否支持每个 Worker 独立启动并加载自己的 `agt-*` preset？
2. 岗位 Playbook `SKILL.md` 应使用全局 skills 根还是 preset-local skills 根？
3. `dsh-agent-team-gui` 是新增 D-053 Case Control 适配，还是仅复用底层 session 调度？
4. 首个 Shadow 价值流、店铺/SKU 范围、GMV 基线、质量阈值和止损阈值是什么？

未回答这些问题时，自动执行者只能继续取证和隔离回放，不得创建生产连接、执行资产动作或
把方案写成已上线结果。
