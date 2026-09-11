# 09 · LUTE Agentic System 功能债务审计（disabled / 降级 / 半成品 / 待验证全景）

> 2026-09-10 定稿 · 功能审计子代理（全程只读，唯一写入即本报告）
> 方法：bash/read 只读核查 · 证据源 = 生产日志 `~/Library/Application Support/DSH Desktop/logs/dsh-2026-09-0*.log`、rc-eval 日志、`~/.dsh/profiles/desktop/cordis.patch.yml`（与 `packaging/staging-src/2.0.0/profile/desktop/cordis.patch.yml` 逐字节一致）、`~/.dsh/integrations/**`、`dsh-wanzh-hulian/lib`、`~/.agents/**`（LoopX）、各包源码
> 状态图例：死（不可用） / 降级（可用但受限或自动退化） / 待验证（未闭环观察项） / 半成品（已装未跑通）/ 已修（本次核实闭环）
> 上游输入：panorama §1–7、research 08 §2/6.5、research 05 ⚠️/⏳、research 03 §7

## 0. 一句话结论

LUTE 的功能债务集中在**连接层**（4 条 MCP + 2 条 IM 长连接中 5 条处于死/间歇状态，根因全部是**凭据/token 失效后无自动恢复路径**）与**两条刚铺好但从未跑通的链路**（LoopX 控制面 0 runs；灰度发布名单未定）；显式禁用项中只有 1 条是僵尸配置（modlens）；「其他能力」组淹没等 panorama 待办已在源码+构建产物双落地。

## 1. 显式禁用 / 降级配置（patch 层逐项）

patch 基准：生产 `~/.dsh/profiles/desktop/cordis.patch.yml` == staging `packaging/staging-src/2.0.0/profile/desktop/cordis.patch.yml`（diff 确认一致）；staging/生产 app 级 `app.asar.unpacked/cordis.patch.yml` 亦一致（内容为 desktop-shell 组合，无 modlens 项）。

| # | 项 | 状态 | 核查结果 | 影响面 | 启用/修复成本 | 优先级 |
|---|---|---|---|---|---|---|
| 1.1 | `reverse-skill` disabled:true（2026-09-03 用户决策） | 死（有意） | `@dhicoc/dsh-reverse-skill@1.0.5` 已装入 profile node_modules，实际承载 **skills/ 下 56 个技能目录**（npm 包描述 87 项；patch 注释写 ~73，三处口径不一致，建议统一为实测 56）。LUTE 可见 15 个 preset（ai-content/kol-hunter 等）无一引用 CTF/逆向域——**禁用原因仍然成立** | 无业务影响（纯安全/逆向技能面，264 技能计数已排除） | 改 yml 一行 + 重启，≈5 分钟 | 维持现状（P3） |
| 1.2 | `modlens` readImageTool:false | **僵尸配置**（死写无效果） | 对 `dsh-profile/node_modules/@liustack/modlens/dist/main.js`（199KB bundle）全文检索：**不存在 `readImageTool`/`ImageTool`/`read_image` 任一键**，config 消费白名单（config.command/exists/guards/mode/note/path…）中亦无此项 → 该 patch 项在当前 modlens 版本上无消费方，是**无效 no-op**（可能对应旧版或未来版本）。生产侧该配置项既未禁用任何东西，也无 read_image 工具存在 | 无（本就没有可禁用的工具） | 清理该 patch 段或改注释说明版本指向，≈10 分钟 | P2 |
| 1.3 | `dsh-memory` 三项降载（`tools:core`、`memory.userMessage:false`、显式 python/dbPath） | 降级（有效，按设计） | 生产日志实锤生效：「已注册 12 个灵枢工具（lingshu_remember…lingshu_session_note）」= 恰好 core 集；dbPath 锚定 `profiles/desktop/data/lingshu.db`（mtime 09-10，写路径活）。**附带发现**：白箱 LLM provider 日志显示 `lingshu-whitebox（降级→deepseek-official）`——白箱通道当前处于**自动降级**态 | 灵枢从 77 工具全量收敛到 12（显式调用仍可用）；自动记忆双写关闭 | 无需修复；白箱 provider 如需恢复需单独配 key，≈30 分钟 | P3（设计内）；白箱项 P2 |
| 1.4 | `~/.agents/skills.disabled/` 6 技能 | 死（1 损坏 + 5 完整禁用） | `agent-reach`：**SKILL.md.corrupt**（文件损坏被移入 disabled，mtime Jul 4）；`understand-dashboard/domain/figma/knowledge/onboard` 5 个：文件完整但被禁用（禁用原因无记录，understand 主家族仍在用 4 个） | agent-reach 完全不可用；understand 子功能（dashboard 可视化/domain/figma/knowledge/onboard）不可用 | agent-reach 需重装修文件 ≈15 分钟；understand*5 仅移回目录 ≈5 分钟 | P2 |
| 1.5 | vision-router 生产版 2.0.1 vs RC 验证版 2.1.4 | 降级（版本滞后） | 生产 vision-router.log 明确 `plugin=2.0.1`；05 矩阵以 2.1.4 做的验证结论不能直接等同生产。且 rc.1 上 2.1.4 的 `restrict("vision_screenshot")` 守卫失败（见 §5.3） | 生产视觉链以旧版运行 | 升级 + 重验证 ≈半天 | P1 |

## 2. MCP / 连接层死链（根因全部：凭据过期 + 无自动恢复路径）

连接注册面（`~/.dsh/integrations/wanzh-hulian/mcp-servers.json`，四条全部 enabled):shopify / pixpix / getnote / apify。生产日志 09-07→09-10 连续 4 天、每天 5+ 轮「10 次重试 → give-up → tools unregistered」循环（如 **15:03:35 pixpix / 15:03:41 shopify**，与 10:33、11:12、16:15 同模式）。

| # | 连接 | 状态 | 证据 | 影响面 | 修复成本 | 优先级 |
|---|---|---|---|---|---|---|
| 2.1 | **pixpix**（streamable-http OAuth-PKCE） | **死** | `oauth-pixpix.json` 计算：`expires_at 2026-09-06 23:59` → **token 已过期 3.7 天**。源码 `ensureOauthToken()`（dsh-wanzh-hulian/lib/index.js:607）refresh 失败后**静默原样挂载过期 token**（"无 refresh 则按原样挂载，401 提示重授权"），重启不自愈 → 09-07 起 invalid_token 循环 | **37 个电商视觉工具全下线**（主图套图/模特试穿/带货视频/精修/A+详情页/配音），pixpix-ecommerce 技能失去执行臂 | UI 点「浏览器授权」重走 OAuth；建议同步在 host 层给 refresh 失败加可见告警（静默降级=观测盲区）。用户操作 ≈5 分钟 + 代码 ≈30 分钟 | **P0** |
| 2.2 | **shopify**（stdio npx shopify-mcp） | **死** | 全天 138 行 `MCP error -32000: Connection closed`（子进程连上即断，09-08 至今）；客户端凭据流（`/admin/oauth/access_token` grant=client_credentials）在日志中无成功记录 | **14 个店铺运营工具下线**（商品/订单/客户/库存/折扣 Admin GraphQL），shopify-store-ops 技能直连断 | 排查 npx 子进程退出原因 + 复验三凭据（client_id/secret/domain）有效性，≈30–60 分钟 | **P0** |
| 2.3 | **getnote** MCP（stdio npx @getnote/mcp） | 降级（间歇断连自愈） | 仅 09-07 出现 4 轮 `connection lost → reconnected and re-synced tools (attempt 1/10)`，均 1 次重连成功；09-10 当天 0 条（无异常） | 38 官方工具偶发秒级抖动，无用户可感损失 | 无需修复，仅登记 | P3 |
| 2.4 | **apify**（streamable-http Bearer） | 待验证 | 09-09 21:15 出现 `invalid_token: Missing or invalid access token` 重试序列（至 attempt 8/10 后无 give-up 记录）；09-10 全天 0 条——未确认是恢复还是当日未挂载。`client.js.bak-apify-20260908` 佐证曾做过一轮修复 | 12 工具（Actor 搜索/调用/取结果/网页直取）可能间歇不可用 | 在 UI 复测一次连接 + 校验 `apify_token` 有效性 ≈15 分钟 | P1 |
| 2.5 | **dsh-feishu**（ABI-KB bot） | **死** | 09-10 全天 `0/1 bots connected; retrying`（46 条，01:12→16:59）；00:36 明确根因之一：**缺 scope `application:app_slash_command:read`**（需飞书开放平台手工开通）。config 显示 08-30 曾连接成功（connectedAt），属 09 月初退化 | 飞书侧 ABI-KB bot 完全离线 | 开放平台开通权限 + 复验 bot 网络 ≈20 分钟 | **P0** |
| 2.6 | **dsh-weixin**（企微/微信 bot） | 降级（间歇失败） | 09-09 23:40 `start request failed → failed to initialize → 0/1 accounts connected`；09-10 三组 `poll failed (1/3)(2/3)`（WeixinApiError code 被打码 ****，无法从日志定位） | 微信通道轮询不稳，窗口期消息可达性受损 | 需先在侧修日志打码问题再定位（api 包层面），≈30 分钟+ | P1 |
| 2.7 | 万物互联内置 getnote-brain 连接 | 正常 | 本会话工具表含全套 getnote_*；settings 页数据同源 | — | — | — |

**wanzh-hulian 注册但当前不可用连接清单**：shopify（死）、pixpix（死）、apify（待验证）、getnote MCP（间歇）——4 条 enabled 全部带病；另外 skills 面登记的「亚马逊合成人像合规标记」为网页端本地工具，无 MCP 工具（设计如此，非债务）。

### 结构性结论
所有连接故障共享同一模式（= panorama 横切模式④的连接层翻版）：**凭据/token 过期 → 静默降级 → 有限重试后 give-up → 等待人工**。唯一修复入口都在「人工重新授权」上，但系统**没有把『已 given up』状态主动暴露给用户**（只在日志里 [E]）。建议：host 层 giv-up 时在 UI 状态面挂「需重新授权」标记（每条连接一行文案的成本）。

## 3. 待验证 / 未闭环项

| # | 项 | 状态 | 核查结论 | 启用/修复成本 | 优先级 |
|---|---|---|---|---|---|
| 3.1 | spill #865/867 后验（08 §2.4） | 待验证 | 生产 8 天日志 grep `spill` = **0 条**（未发生也未触发实验）；实验本身仍未执行（08 §6.5 ⏳）。存量规模参数：sessions 目录 229MB、Magpie-Horch 项目 207 个会话（长会话素材具备，随时可触发） | rc-eval 上跑交互式长会话 ≈半天 | P2（上游已有修复 PR，纯观察项） |
| 3.2 | my-quotes 索引路径观察项 | **生产已修**，rc-eval 仍待 | 生产 `~/.dsh/my-quotes/index.jsonl` 存在（261KB，mtime 09-10 17:39 持续更新）→ **闭环**；但 `~/.dsh-rc-eval/my-quotes/` 目录不存在（rc 评测环境无 UI 触发，残留观察——因环境即弃，价值低） | 0（生产）/ 无需（rc-eval） | P3 |
| 3.3 | UI-3 macOS 按钮翻转 | 待验证（被动） | patches-manifest-v2 §43 已定性：生产基线中该补丁已不存在（资产与审计副本逐字节一致）、2.0.5 dialog 已重构；处置=「如客户反馈按钮顺序再按新结构做」 | 0（等客户反馈触发） | P3 |
| 3.4 | 灰度发布（名单未定） | 待验证 | release-gray-sop.md 已成文，名单栏为「由业务负责人指定并记录（只记编号）」——**至今未定**；08 §6.5 中发布链整体 ⏳（Release 上传+灰度名单+07 转正三连带） | 用户决策为主，0 代码成本；是 2.0.0 发货链的**唯一人卡** | **P0**（阻塞发布） |
| 3.5 | 「其他能力」组淹没（panorama 段③） | **已修** | src（SkillPanel.tsx:228 默认折叠 + localStorage `dsh-skill-center:other-expanded` 持久化）与 lib 构建产物（lib/client.js:748 同逻辑）**双落地**，i18n 收起/展开文案齐 | 0 | 已闭环 |
| 3.6 | 05 矩阵残留 ⏳（context/better-sidebar/dshmarket/genui 的 ②③④⑤；#851 焦点测量受限） | 待验证 | 矩阵文档内大部分 ⏳ 已由「用户目视」闭环（终态注记），剩余 ⏳ 为低频证据补充 | 按需 ≈1–2 小时 | P3 |

## 4. 半成品 / 退化功能

| # | 项 | 状态 | 核查结论 | 影响面 | 修复成本 | 优先级 |
|---|---|---|---|---|---|---|
| 4.1 | 81-Skills TODO/FIXME 扫描 | **零欠账** | 目录内 `TODO\|FIXME\|暂未\|未实现\|尚未实现` 精确计数 = **0**；宽匹配 46 处命中全部是业务术语（「认知空白占位」「品牌占位词」），非代码债务 | — | 0 | 无债务 |
| 4.2 | dsh-overseas-skills TODO | 无实义 | 命中仅为文档标题（docs/ai-fullstack-analysis.md「执行 TODO（决策后定稿）」= 计划文档章节名）+ translations 教学文案；包装 P0（templates.js files 缺失）**已修且已提交**（package.json files 现含 lib/templates.js，文件在位；git 仅余 import-81skills.mjs 一处未提交改动） | — | 提交剩余 1 文件 ≈2 分钟 | P3 |
| 4.3 | agent-team-gui DAG/recipes | 可用（素材薄）+ 间歇激活失败 | 正常态：各 run 段日志 `v0.5 bounded DAG orchestration, durable runs, recipes and insights ready`；deps 在位（曾被移出后又随 taskboard 安装恢复）。**但 09-10 14:50/16:05 两个 run 段出现 `plugin tree failed to load: dsh-agent-team-gui pending (waiting for services)`**（重启时序相关，之后 run 又 ready）。recipes：解析/重映射/交叉引用工具完整（recipes.ts 122 行），预置示例仅 1 个（full-stack-delivery.recipe.json，squad+agents 结构） | DAG 编排可用；失败窗口内 squad UI 不可用 | 追查 pending 根因（服务等待条件）≈1 小时；多备 2–3 个常用 recipe ≈1 小时 | P2 |
| 4.4 | **LoopX 技能链（benchmark/code-review/pr-review）** | **半成品（已装未跑通）** | 装载面完整：`~/.agents/skills/` 7 技能已 materialize（install ledger 09-10 08:13，digest 全部 available:true），CLI（python 发行版）在 `~/.agents/runtime/dsh-loopx-plugin/`；但 `loopx status` 实测：**goals=0, runs=0, events_24h=0, registry 不存在（`.loopx/registry.json`）**——**控制面零账本，7 技能从未产生一次实际闭环**（benchmark/pr-program/pr-review/project/self-repair 全部 0 样本；promotion gate 卡在 warning：promotional readiness 缺失）。本会话 catalog 可见 7 个 loopx-* 技能即来自 `~/.agents/skills` 注入 | 装了整条链无一次实战；技能描述承诺的「experiment-board / 双语 PR 评审」从未发生 | 挑一个真实任务（如本次审计的 PR 流程）跑通 canary ≈2 小时（含 `loopx doctor` + promotion-readiness 冒烟） | P1 |
| 4.5 | lark-tools / loopx 技能族口径 | 正常 | rc_probe/rc_rename、exa_search 等系统注入原语在位（本会话工具表为证），无死键 | — | — | — |

## 5. 能力退化风险（2.0.0 升级对照，03 §7 补录视角）

| # | 风险 | 状态 | 证据 | 影响面 | 处置成本 | 优先级 |
|---|---|---|---|---|---|---|
| 5.1 | **视觉通道限流（ovh 上游 429）** | 降级（外部依赖，趋势上行） | 生产日志 RATE_LIMIT 计数（.log 与 .error.log 双写为同批）：09-03=5、09-04=20、09-05=0、09-06=6、09-07=15、09-08=0、09-09=5、**09-10=40**（40 次独立时间戳去重确认）。模式：`vision_describe http fallback [http:ovh/*] (RATE_LIMIT)` 连锁三模型（Qwen3.5-397B/Qwen2.5-VL-72B/Qwen3.6-27B）全 429；fallback 链打满后向模型回 VISION_RATE_LIMITED（05 矩阵曾因此被迫改用户目视闭环） | 视觉证据采集（截图级验证/图片理解）间歇不可用；09-10 当天恶化 3–8 倍 | provider 换源/加退避策略（vision-router 配置面），≈1–2 小时 | **P1** |
| 5.2 | **vision_screenshot 工具缺位** | 半成品（跨版本未就绪） | 生产 9 天日志 grep `vision_screenshot` = **0 命中（从未注册）**；rc.1 上 6 轮 `tools.restrict() names unknown global tool "vision_screenshot"` 实锤：**该工具在 runtime 0.1.2-rc.1 全局表里不存在**，vision-router 2.1.4 的关-screen 守卫每次会话都失败。生产 vision-router 为 2.0.1（base config summary 无 desktopScreenshot 字段）。工具定义本身声明「需用户在 Vision Router 设置显式启用 Desktop screenshot」+ macOS 屏幕录制 TCC 授权——目前**设置入口与工具注册两端都没到齐** | 桌面截图能力（macos-harness 技能部分场景的替代臂）在 DSH 桌面版不可用 | 阻塞于宿主（dsh-plugin-desktop 工具面），非 LUTE 可单方修复；先升级 vision-router 2.0.1→2.1.4，若上游仍无工具注册则记录为上游依赖 | P2 |
| 5.3 | vision-router limits 配置不完整 | 降级 | 生产 `effective vision limits taskTimeoutMs=120000 taskSource=unknown turnBudgetMs=0 turnSource=unknown`——taskSource/turnSource 均 unknown，说明 limits 是默认值而非显式配置 | 超时行为可预期但未调优 | 写入显式 limits 配置 ≈15 分钟 | P3 |
| 5.4 | 灵枢白箱 LLM 降级 | 降级 | 生产日志：`白箱 LLM provider 已注册: lingshu-whitebox（降级→deepseek-official）`——白箱推理当前走官方通道，属于自动降级带内 | 推理成本/可观测性假设变化 | 恢复原设计需 provider key/端点配置 ≈30 分钟 | P2 |
| 5.5 | 2.0.0 升级面功能回退 | 无系统性回退 | 对照检查过的候选：my-quotes（已恢复写索引）、skill-center（265 技能、折叠已上线）、browser bridge（loopback 围栏正常）、deepresearch/market 数据读写正常（05 ④ 补证）。未发现「2.0.0 比 2.0.4 时代少功能」实例；唯一持续差距即 5.1/5.2 视觉两项（均为外部/上游依赖，非升级引入） | — | — | — |

## 6. 汇总账本（按优先级）

**P0（业务中断级，3 项）**
1. pixpix MCP 死链（token 过期 3.7 天 + 静默降级）→ 重授权 + host 层可见告警
2. shopify MCP 死链（子进程 Connection closed 4 天）→ 凭据/子进程双排查
3. dsh-feishu bot 全天下线（缺开放平台 scope）→ 开权限 + 复验
4. 灰度名单未定 —— 发布链唯一人卡（技术侧零成本）

**P1（显著降级/链路验收，5 项）**
- vision RATE_LIMIT 上行（40 次/日）
- apify token 复测；dsh-weixin 侧修打码再定位
- LoopX 控制面 0 runs：7 技能已装未闭环，跑 canary
- vision-router 2.0.1→2.1.4 生产对齐（连带 5.3 limits）

**P2（债务清理，7 项）**
- modlens 僵尸 patch 清理；agent-reach 损坏修复；understand*5 禁用处置
- agent-team-gui pending 根因 + recipes 素材补充
- spill #865/867 复测；白箱 provider 配置；vision_screenshot 上游依赖登记；5.x limits 显式化

**P3（维持/接受债务）**
- reverse-skill 维持禁用（理由仍成立，56 技能无业务引用）；UI-3 等客户反馈；my-quotes rc-eval 残项；getnote MCP 观察项

## 7. 审计边界与方法说明

- 未运行任何写操作（除本报告）。`loopx status` 为只读 CLI 查询；`oauth-pixpix.json` 读取时**未输出 token 值**（仅计算 expires_at）。
- 生产日志与 rc-eval 日志的 [E]/[W] 均为既有记录；未修改 integrations/patch/skills 任一文件。
- 「~73 技能 / 87 skills / 56 目录」三口径差异、apify 09-10 零日志的两种解释（恢复 vs 未挂载），均在 §1.1 / §2.4 标注不确定性，未做臆断。
