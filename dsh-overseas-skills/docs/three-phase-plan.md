# 出海技能体系 · 三阶段演进落地方案（1→2→3）

> 基于已实测的基座事实：DSH Desktop 内置 0.1.2-alpha.1；技能注册表只有 register/list/get（无 per-skill restrict）；
> scope 层同名遮蔽全局层；O1 已让 106 项默认 `disable-model-invocation: true`（模型不可见、`/` 菜单可见）；
> preset 组合 = `~/.dsh/.agent-presets/<id>/{preset.yml, agent.cordis.yml, manifest.json}`，
> 指令注入用 `@deepseek-ai/dsh-persona`（text config）+ `@deepseek-ai/dsh-agent-instructions`。

---

## 阶段 1 · 基准迭代闭环（validation-gated，SkillOpt 落地版）

**目标**：任何技能文案/边界修改都必须通过路由基准，成绩留痕可回滚。

### 1.1 基准扩充（~70 条）
- 现 44 条基础上补三类用例：
  - **跨界问句**（故意跨簇/模糊，如「帮我看看这个产品在亚马逊能不能做」）；
  - **英文问句**（外贸业务真实场景，如 "find me 3 winning products on TikTok right now"）；
  - **簇内高混淆负例**（同簇两成员各 2 条互作负例，如 SEO 簇的「找词 vs 对标」再加密）。
- 结构升级：`eval/routing-benchmark.json` 每例加 `cluster`（宽松命中集合）与 `difficulty`（basic/boundary）。
- 冻结基线：首版 70 条全量跑一次 LLM 档，成绩写入 `eval/runs/baseline-70.json`。

### 1.2 评测器加固
- `scripts/route_bench.mjs`（词法档）：阈值 Top-1 ≥ 80% 作快速门（秒级）；
- `scripts/route_bench_llm.mjs`（LLM 档）：修 query 键归一化（给/帮、空白差异）；输出 `eval/runs/<时间戳>.json`；
  与上一轮 diff 输出「回归用例清单」。
- **门禁规则**：LLM 档严格命中 < 95% → 不通过；失败用例驱动文案修改 → 重跑 → 通过才接受。

### 1.3 迭代工作流（文档化）
```
改 description/边界（optimize_data.py 幂等）→ watcher 即时生效
  → 词法快筛（秒级）→ LLM 档评测（4 子代理并行）
  → 成绩入库 → 通过 / 定位失败用例回改
```
- 产出：`docs/iteration-runbook.md`（失败用例 → 诊断 → 修改点的对应表）。

**验收**：70 条 LLM 档 ≥ 95% 严格命中；`eval/runs/` 留痕 ≥ 2 轮。

---

## 阶段 2 · preset 智能体分集打包（真子集隔离，零核心改动）

**核心洞察**：O1 已把 106 项全局副本置为模型不可见，因此「子集隔离」不再需要 per-skill restrict——
preset 只需在**自己的 scope 层**把子集以**运行时技能**重新注册（modelInvocable: true），同名遮蔽全局的
model-off 副本即可。该 preset 会话的模型目录 = 子集 + 核心技能 + 4 个手动例外。

### 2.1 工作流定义（数据）
- `presets/workflows.json`：5 个业务工作流，每个 = {id, 中文名, persona 文案, subset: [技能名...]}：
  | 预设 | 子集（按 manifest 分类映射） |
  |---|---|
  | 选品供应链专家 | sourcing + research-selection + shipping-tariff |
  | 营销增长专家 | content-gtm + seo-ads |
  | 店铺运营专家 | store-ops + crm-retention |
  | 财务分析专家 | analytics-finance |
  | 出海全能助手 | 全部 12 类 |
- 子集名单由 `manifest/skills.json` 的 category 字段生成（单源真源，技能增删自动跟随）。

### 2.2 薄插件 `dsh-skill-subset`（host-only，装入 profile）
- `lib/index.js`：`inject: ["skills"]`，`Config: { skills: string[] }`。
- apply：对每个名字 `ctx.skills.get(name)`（读全局副本的 content/title/description，**不复制文件**）→
  `ctx.skills.register({ name, title, description, content, invocation: { modelInvocable: true, userInvocable: true } })`
  → 注册进 preset scope 层（同名遮蔽全局 model-off 副本）。
- 兼容性验证点：register 的 disposer 语义（停止 preset 时自动撤销）；title 字段已在 core 支持（本项目已扩展）。

### 2.3 生成器 `scripts/gen_preset.mjs`
- 读 workflows.json + manifest → 写 `~/.dsh/.agent-presets/<id>/`：
  - `preset.yml`（name/description/order 递增）
  - `agent.cordis.yml`：persona（角色+「只使用以下 N 个技能」清单）+ agent-instructions + dsh-skill-subset（config.skills=子集）+ 工具行（tool-fs/bash 等，复用现有 preset 基线）
  - `manifest.json`（dsh-preset v1）
- 幂等：重跑覆盖；`--dry-run` 预览。

**验收**：新建/切换 preset 会话，其 `<available_skills>` 只含子集（+核心技能）；全局默认会话目录不受影响；
页面开关对子集成员仍有效（开启=双处可见，关闭=全局副本与本 preset 均隐藏）。

---

## 阶段 3 · 外部工具接入（按凭据门槛分三级）

**总原则**：密钥走 DSH Credentials（`describe/set` 客户端、`resolve` 宿主最后使用点、落 `$DSH_HOME/.credentials.yaml`），
技能正文只写调用方式不写密钥；每接一个工具 → 更新对应技能的环境说明 → 移除 `toolGap` 徽标（manifest 重生成）。

### 3.1 Tier 0 · 零凭据本地 CLI
- `lark-cli`：`npm i -g @larksuite/cli` + 用户扫码登录；更新 `lark-tools` 环境说明为「已接入」。
- 验收：`which lark-cli` + 读一条多维表格记录成功。

### 3.2 Tier 1 · API Key（Exa / TurtleClassify）
- 薄插件 `dsh-overseas-tools`（host）：`ctx.credentials.resolve("overseas.exa")` → 提供 `exa_search` 工具
  （`ctx.tools.register(defineTool(...))`，model 可调）。
- 用户操作：页面/凭据设置写入 key；技能侧更新 `company-research/people-research/org-structure-research`
  （Exa）与 `tariff-search`（TurtleClassify）的环境说明与 `【需X】` 标记。
- 兼容性验证点：alpha 的 credentials namespace 注册方式（`dsh-credentials` 契约）与 Web 暴露面。

### 3.3 Tier 2 · OAuth/重型 MCP（Gmail / Jungle Scout / Klaviyo / Printify / eRank / TikTok / Meta）
- 逐一评估账号可得性（需你确认有哪些账号）→ 每个工具 = 1 个 MCP server 配置（`dsh-mcp-client` 的配置面
  先核对 alpha 版本）+ 对应技能环境说明更新 + 徽标移除。
- 建议顺序：Exa → Gmail → Jungle Scout（7 个 prelaunch 技能收益最大）→ Klaviyo → 其余。
- 每个接入都配一条基准用例（如「帮我调研这家美国竞品公司」→ company-research 且不幻觉工具）。

**验收**：25 个徽标逐个清零（每接一个减 N）；零密钥泄漏（抽查 .credentials.yaml 与技能正文）。

---

## 全局回滚与安全
- 每个阶段的产物都幂等/可删：阶段1 是数据与脚本；阶段2 删 preset 目录即可；阶段3 删凭据 + 改回环境说明。
- 全程不修改 DSH 核心；宿主侧插件改动走「原地覆写 + 重启」，客户端走 HMR rebuilt（本项目已验证的链路）。
