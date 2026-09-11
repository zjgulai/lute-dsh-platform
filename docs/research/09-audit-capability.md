# 09 · LUTE 能力图谱全景审计（capability graph audit）

> 审计日期：2026-09-10 · 审计者：能力图谱审计子代理（全程只读，报告写入为唯一落盘操作）
> 对象：LUTE Agentic System（生产宿主 = 本对话所在 DSH Desktop 2.0.4 / runtime 0.1.2-alpha.1；已发布产物 = 1.2.2；2.0.0（基座 2.0.5/rc.1）构建完成未发布）
> 红线：本报告不复制任何凭据值；密钥一律以「已设置 / 缺失」表述。证据来源标注 `文件:行` 或命令口径。

---

## 0 摘要

LUTE 的能力图谱是「**宿主 68 服务 + 31 插件行 + 264 技能文件 + 11 凭据 / 4 MCP 卡**」四层堆叠。声明面相当完备（81-Skills 81/81 安装、AI 全栈 29 全量进包、得到大脑双通道健康），可用面存在五处断裂，且利用率数据与声明面严重脱节：① 万物互联 4 卡中 Shopify（3 凭据引用缺失）与 PixPix（OAuth token 2026-09-06 过期未刷新）为死链，API 板块空壳（connections=[]）；② LoopX 家族 7 技能零加载、零 CLI 运行（实证 §2.5），benchmark 管线闭环度 0；③ 技能利用率 **19/252 = 7.5%**（Top5 全是平台工程技能，占总加载 58%；81 出海技能合计仅 ~9 次），15 业务预设 30 天仅 6 个被触达且业务工作区实际全跑 standard（§2.2）；④ 四条深度研究链中 anysearch/tavily 近 30 天**任何通道 0 调用**，exa 仅 7 次，路由事实已收敛于宿主 modsearch 桥；⑤ 2.0.0 产物未发布（git tag 止于 1.2.2），README 引导与发布态脱节。上游 2.0.6+ 最大破坏面 = 35 文件直补/34 锚点 + dev/装机双 profile 漂移。

---

## 1 能力清点（三平面）

### 1.1 宿主原生层（DSH Desktop base + web-app）

| 项 | 实测 | 出处 |
| --- | --- | --- |
| 宿主服务 | **68 个服务键**（tools/credentials/skills/llm/web/subagents/goals/jobs/shell/sessions/storage/typert/webServer/webhookRuntime…） | cordis Inspect `Service.listService` 目录计数 |
| 宿主事件 | Event 目录（llm/stream、agent-status、jobs 等可挂监听） | cordis Inspect `Event.listEvents` |
| 客户端 Slot | inspect 超时（30s 未响应），**本次未取证成功**——记为审计限制，不判可用性 | `Slots.listSubTree` 调用记录 |
| 兜底 profile | /Applications 内嵌 dsh-profile **17 bundles**（base/web-app/genui/deepresearch/agent-team/noema/better-sidebar/pocket/modlens/modsearch/vision-router/context/memory/dshmarket/git-graph/skill-explorer/root-brand） | `dsh-profile/package.json` 实测 |
| 用户数据区 profile | `~/.dsh/profiles/desktop` **31 bundles**（本机生产实挂，见 1.2） | 同上 |

**宿主原生工具面（本会话实测注册位 ~156）**，按家族分解：

| 家族 | 计数 | 说明 |
| --- | --- | --- |
| DSH 核心工具 | ~57 | bash/read/edit/write/glob/grep/read_image/web_search/web_fetch/x_search/read_page/skill/goal×3/todo/board×3/task×3/ask/report/subagent×4/subagents 派生/jobs×3/rc×3/render_ui/validate_dsh_ui/sidebar/dsh_im/browser×11 等 |
| noema 记忆 | 15 | recall/remember/catalog/…（write policy=review） |
| 灵枢 lingshu | 12（服务端 77） | 组合联想/感知写入/推理注入/自检 |
| 得到大脑·原生 | 19 | getnote_*（wanzh 插件注册） |
| 得到大脑·MCP 直挂 | 19 | mcp__getnote__*（与上重叠=双通道） |
| Apify MCP | 12 | mcp__apify__*（远程 MCP，Bearer apify_token） |
| Vision | 15 | bootstrap/ocr/ground/crop/pixel_diff/screenshot…（Vision Router 2.0.1） |
| exa_search | 1 | 原生工具（credentials ref `overseas_exa`，已设置） |
| cordis 动态 | 7 | define/run/stop/inspect_*（本会话因平台研发挂载，业务预设不含） |

> 口径说明：用户简报「工具面约 60」对应的是**业务主干**（去掉双通道 19+12、vision 15、cordis 7、研发专属若干后大致吻合）；本表给出的是本机注册位上界。

### 1.2 插件层（profile 31 bundles）

实测拆分（`~/.dsh/profiles/desktop/package.json`，2026-09-10）：**31 行 = 18 个 `file:` 本地行 + 13 个 npm 生态行**；打包时点口径为 30（packaging/CHANGELOG 2.0.0:9 的 completeness 基线），差值来自 09-10 当天并入 `@etony668/dsh-task-board`。

| 分组 | 插件行 |
| --- | --- |
| 出海业务 | dsh-overseas-skills（设置页卡片墙）、dsh-overseas-tools（exa）、dsh-skill-subset |
| 万物互联 | dsh-wanzh-hulian（MCP/API/企业应用/知识库 四板块）、@xmanrui/dsh-im（飞书/微信 bot） |
| 记忆双栈 | @zseven-w/dsh-noema（rc.3）、dsh-memory（灵枢宿主桥）+ aeis-portable 打包 |
| 研究链 | @deepseek-ai/dsh-deepresearch（本地 0.2.2 vendor）、@liustack/modsearch（x_search/read_page）、@changfenhuang/dsh-genui |
| 协作 | dsh-agent-team-gui、@etony668/dsh-task-board、dsh-loopx-plugin |
| 工程治理 | dsh-preset-lint-local、dsh-rename-conversations、dsh-my-quotes、@dhicoc/dsh-reverse-skill |
| 基础设施 | @deepseek-ai/dsh-auto-compact、dsh-file-upload、dsh-browser-local、dsh-theme、dsh-root-brand、dsh-skill-center-local、@linxin666/dsh-client-ui-git-graph、@liustack/modlens、dsh-better-sidebar、dsh-pocket、dsh-context、dsh-vision-router、dshmarket |

**dev/装机版本漂移**（上游演进风险输入，详见 §5）：

| 插件 | dev profile | /Applications 兜底 |
| --- | --- | --- |
| modlens | 3.26.1 | 3.25.2 |
| dsh-pocket | 2.10.3 | 2.8.0 |
| git-graph | 0.3.19 | 0.3.6 |
| skill-explorer |（无此行） | 0.3.6 |
| noema | 0.1.0-rc.3 | 0.1.0-rc.3 |

### 1.3 内容层

**技能**（264 文件 + 3 会话级注册）：

| 层 | 数量 | 明细 |
| --- | --- | --- |
| 用户技能库 `~/.dsh/skills` | **252** | 81-Skills 全量 81/81 + 营销存量 38 + anysearch + 工程存量（mattpocock 29 等）+ 其余安装增量 |
| agent-home 官方 `~/.agents/skills` | **12** | loopx×7（loopx/benchmark/doc-registry/pr-program/pr-review/project/self-repair）+ understand×4 + dsh-desktop-diagnostics×1 |
| bundle 会话注册 | 3 源 | @changfenhuang/dsh-genui（1）、dsh-wanzh-hulian（getnote-brain）、@dhicoc/dsh-reverse-skill |

**预设**：`~/.dsh/.agent-presets` **15 个**（ai-content-image-studio / ai-product-developer / ai-report-analyst / brand-marketing-growth / dsh-motion-deck-studio / feishu-digital-employee / kol-content-expert / kol-hunter / llm-wiki-fullstack / overseas-allround / overseas-finance / overseas-marketing / overseas-sourcing / overseas-store-ops / product-video-director）+ 平台自带（standard / cordis 等）。白名单技能数 1–110 不等（overseas-allround 110、brand-marketing-growth 81、store-ops 34、sourcing 23、marketing 24、finance 11；kol 两预设与 llm-wiki-fullstack 走自定义技能目录）。

**连接与凭据**（万物互联四板块实测）：

| 卡 | 声称 | 实测状态 |
| --- | --- | --- |
| MCP·得到大脑 | 38 工具（stdio @getnote/mcp）+ 19 原生 | ✅ 健康：凭据已设置；月读配额 265/200000 |
| MCP·PixPix | 37 工具（OAuth PKCE，streamable-http） | ❌ **token 2026-09-06 23:59 过期，未刷新**（oauth-pixpix.json mtime 22:59；refresh_token 在盘但 4 天无刷新动作） |
| MCP·Shopify | 14 工具（stdio shopify-mcp，24h 换令牌） | ❌ **3 凭据引用缺失**（shopify_client_id / shopify_client_secret / shopify_domain 均不在 refs）——卡片 enabled=true 但 env 无法注入 |
| MCP·Apify | 12 工具（远程 MCP） | ✅ apify_token 已设置（本会话 mcp__apify__* 实测可枚举） |
| API 板块 | 「Exa 等外部工具原生接入」 | ⚠️ 半兑现：exa 可用 ✅；Jungle Scout/Klaviyo 凭据位仅预留；板块 connections=[] 为空壳 |
| 企业应用 | Shopify + Apify 两卡 | 同上（shopify 死链、apify 活链） |
| 知识库 | 得到大脑 19 原生 + 38 MCP 双通道、OAuth/CLI | ✅（限制：OpenAPI 仅会员、建库日限 50） |
| IM 通道 | 飞书 bot×1、微信 bot×1 | ✅ 已连接（飞书绑定 workteam_info_kb/lark 工作区；微信 group 响应关） |
| 凭据库 | `~/.dsh/.credentials.yaml` refs | **11 refs 全部已设置**（模型/飞书/微信/relay/getnote×2/apify/exa/gjld/deepseek）；无 ANYSEARCH（技能自管 .env，已设置）；无 TAVILY refs（launchctl 环境存在，len≈58，技能可用）；缺 shopify×3 |

### 1.4 邻接表：业务域 × 能力面

| 业务域 | 常用预设 | 技能代表 | 原生工具 | 插件/连接 | 断点 |
| --- | --- | --- | --- | --- | --- |
| D1 跨海选品·供应链 | overseas-sourcing / allround（23/110） | product-selection、Sorftime 系列、dropshipping 系列 | exa、anysearch、tavily、browser | exa ✅；tavily ✅（env） | JS/Klaviyo 凭据位空壳 |
| D2 店群运营 | overseas-store-ops（34） | listing/库存/合规系列（fba、gdpr…） | getnote 原生×19 知识沉淀 | **shopify MCP ❌ 死链** | 凭据三缺失 |
| D3 营销内容 | brand-marketing-growth（81）/ kol×2 | 81 营销存量、social 系列 | lark-cli、graph 生态 | lark-cli ✅ | pixpix ❌ token 过期 |
| D4 电商财务 | overseas-finance（11） | 财务建模/预算/复盘 | — | — | 无（技能自足） |
| D5 视觉内容生产 | ai-content-image-studio / motion-deck / product-video-director | pixpix-ecommerce（技能文案） | vision×15 | **pixpix MCP ❌**（唯一图像生产通道） | 电商视觉承诺未兑现 |
| D6 工程平台研发 | ai-product-developer（grill-me/tdd/to-spec 强制序） | 全栈 29、build-deepseek-harness-plugin、dsh-plugin-acquire | bash/edit 系、subagent 家族、**workflow/ralph**、cordis×7 | modsearch/modlens ✅ | loopx CLI ❌ 缺失（见 §3.2） |
| D7 企业知识管理 | feishu-digital-employee（7 行） | lark-tools、getnote-brain | getnote×19+19 双通道、noema×15、lingshu×12 | 飞书 bot ✅ | 双记忆边界模糊（§4.2） |
| D8 平台自治理 | cordis / standard | dsh-dev-platform-diagnostics、rename-conversations | rc×3、board×3、report | preset-lint ✅ | 自治理依赖 35 补丁锚（§5） |

---

## 2 利用率审计（近 30 天，2026-08-12 ~ 09-10）

### 2.1 方法与总量

- 语料：`~/.dsh/sessions/<工作区>/<会话id>/session.jsonl.zstd`（zstd 压缩 JSONL；目录名 = 工作区路径转义）。窗口覆盖 259 个会话体、11 个工作区、**~16.5k 次 tool/call**（live drift ±0.2%）。调用分布高度失衡：Magpie-Horch **15,341 次（93%）**，Home 128、DTC-Agent 385、KOL-Hunter 288、red-main 283、lark 80、VOA 8；workteam_info_kb 主目录 0（仅 lark 子目录 80）；team-hub 三成员 0。
- 权威记录：`type="tool/call"`（data.name）；技能双通道 = ① tool/call name="skill" ② user/message source.kind="skill-invocation"（斜杠触发）；available_skills/skill-catalog 列举一律不算调用。preset 字段：会话 header `agentPreset`。
- 观测者效应：本次审计集群（09-10 17:30+ 的 6 个并行只读子代理）自身在窗口内贡献约 306 次调用（1.9%），披露不剔除；含 1 次 research 技能加载与 2 次 `loopx --version` 探测（§2.5 c）。
- 置信度见附录 C；「窗口内实证」与「窗口外推断」严格区分。

### 2.2 预设使用度（实证，30 天）

按工作区 × header 预设（`grep -m1 '"agentPreset":"…"'`，zstd 解压流）：

| 工作区 | 会话数（30d） | 实际挂载预设 |
| --- | --- | --- |
| Magpie-Horch（平台研发） | 207 | cordis×181、standard×10、overseas-finance×4、ai-product-developer×2、product-video-director×1、llm-wiki-fullstack×1 |
| `~`（家目录） | 35 | dsh-motion-deck-studio×5、standard、ai-product-developer… |
| 团队工作区（alice/member01/sikong） | 3 | ai-product-developer×3 |
| KOL-Hunter | 3 | **standard×3**（用 KOL 预设名的工作区跑的是 standard） |
| DTC-Agent / red-main / workteam_info_kb(-lark) | 2+2+3+3 | **standard 为主**，overseas-finance×1 |
| VOA | 1 | dsh-motion-deck-studio×1 |

**结论**：
1. **15 个 LUTE 业务预设中仅 6 个在窗口内被触达**（motion-deck 7、ai-product-developer 6+3+1、overseas-finance 5、product-video-director 1、llm-wiki-fullstack 1、brand-marketing-growth 1——后者为早期全库扫描值）；**9/15 零使用**：ai-content-image-studio、ai-report-analyst、feishu-digital-employee、kol-content-expert、kol-hunter、overseas-allround、overseas-marketing、overseas-sourcing、overseas-store-ops。
2. **业务工作区（KOL-Hunter/DTC-Agent/red-main）与业务预设错配**——均跑 standard；预设体系当前更像「交付演示资产」而非「运营生产资料」。
3. 平台研发自身（181 cordis/10 standard）占了 30 天会话的大头——**能力图谱的主要消费者是平台自治理，不是三类终端用户故事**。

### 2.3 技能利用率（实证：19/252 = 7.5%；233 个零调用 = 92.5%）

数据：121 次真实加载事件（tool 通道 89 + 斜杠通道 32；available_skills 列举不计）。Top5 技能占 58%（70/121）——**全部是平台工程技能**：

| 排名 | 次数 | 技能（Top5 = 70/121 ≈ 58%） | 工作区 | 性质 |
| --- | --- | --- | --- | --- |
| 1 | 21 | dsh-plugin-acquire（tool3+slash18） | Magpie | 平台工程 |
| 2 | 17 | build-deepseek-harness-plugin（tool10+slash7） | Magpie | 平台工程 |
| 3 | 14 | dsh-desktop-diagnostics〖内置〗（tool12+slash2） | Magpie | 平台工程 |
| 4 | 10 | genui | Magpie | 平台工程 |
| 5 | 8 | macos-harness | Magpie | 平台工程 |
| 中部 | 7/6/6/4×3 | archify〖内置〗（DTC×4、KOL×1、red×2）； editing-cordis-compositions〖内置〗（KOL×4）； dsh-dev-platform-diagnostics； diagnosing-bugs / code-review / cordis-plugin-development〖内置〗 | Magpie 为主，archify/editing 跨 DTC/KOL/red | 平台工程为主 |
| 尾部 | 3/2/1×9 | research、cocoloop、lute-brand-icons、rename-conversations…；**各 1 次**：getnote-brain（DTC）、agent-browser、handoff、grilling、geo-optimizer、scenario-driven-product-scout、anysearch、cross-border-selection、product-launch-video〖内置〗 | 多数 Magpie | **业务域技能几乎未启动** |

- 81-Skills 出海技能族在窗口内合计加载 **~9 次**（geo-optimizer / scenario-driven-product-scout / cross-border-selection 各 1 次 + 少量尾部）——**81 张卡片墙 vs 实际 9 次触达**。营销 38 存量仅 product-launch…1 次；anysearch 1 次加载且未执行 CLI。
- 官方内置 5 技能（不在 252 内）另计 32 次（dsh-desktop-diagnostics 14、archify 7、editing-cordis 6、cordis-plugin-dev 4、product-launch-video 1）。
- HOME 与 team-hub 工作区 0 次技能加载；DTC-Agent 唯一业务加载是 getnote-brain×1。
- 深度研究补充事实：`~/.dsh/sessions/--Users-lute--/deepresearch-run-*` 23 个会话体 + HOME 的 `deep_research_submit_plan`×4，说明 **deepresearch 工作台有真实运行**（与 README.usage L4 实测一致），集中单日（08-28 前后）。
- **loopx 家族 7 技能**：仅文件存在于 `~/.agents/skills`；全机无 loopx CLI 二进制（PATH / ~/.agents/bin / venv / sqlite / 宿主日志五路空）→「authoritative LoopX CLI」运行面不存在（调用证据见 §2.5）。

### 2.4 工具频次与高成本低使用（实证：109 种，~16.5k 次）

bash 调用占 65%（10,774 次）——平台自身是主要的 bash 消耗者；文件系（read 1,718 / edit 855 / write 511）次之。

**高成本低使用清单（实证零/近零）**：

| 能力 | 30 天调用 | 判定 |
| --- | --- | --- |
| task_board 全族（task_create/update、board_*） | **0** | 插件 09-10 才入 profile——装机与利用同时为零，属「新装未验证」 |
| workflow / ralph / subagent_fork / dispatch_to_squad / interrupt_agent | **0** | 「工具面约 60」中这 5 项在业务上全未启用；subagent 平台自治理有用（181），业务工作区为 0 |
| x_search（modsearch 桥） | 1 | 声明降级有告警，实际近零 |
| lingshu_*（除 remember 家族） | 6 | 灵枢工具面基本空转 |
| mcp__apify__* | 2 | 远程 MCP 连接活、使用近零 |
| noema 家族 | 136（remember 98 / recall 30） | 写入远多于读取——回收率低（§4.2） |
| goal 全族 | 53 | 中低频、平台自治理为主 |
| 得到大脑 getnote_* | ~90 | **业务域里使用最重的内容面**（move_to_topic 34、topic_notes 22、get 16、save 9）——三类用户故事中企业知识管理最接近真实需求 |
| 深度研究链实测 | anysearch 0、tavily 0、exa 7、modsearch 桥 web_search 29/read_page 32、deepresearch 4 | **四链中两条全零、一条 7 次**；实际承担检索的是宿主 modsearch 桥 + exa |
| vision 家族 | ~150 | 中频，集中在 Magpie（vision_html_screenshot 49 / present 48 / describe 58）——平台研发自用 |

### 2.5 LoopX 证据分级（实证闭环度 = 0）

- **(a) 目录列举**：168 个会话挂过 loopx 系技能列举（Magpie 165、DTC 1、team-hub 1、workteam 1）。安装时间线：09-05 21:38-22:04 用户在 session-18749022 要求「增加 loop+goal 能力」→ 下载 dsh-loopx-plugin v0.1.1-beta.4 tgz + tar 校验，当时 `~/.agents/runtime/dsh-loopx-plugin` 为空、提示「CLI 待首次触发安装」。此后 09-07 起几乎每个新会话都带列举。
- **(b) 真实加载**：**0 次**（89 tool 通道 + 32 斜杠通道全量复核，7 个技能无一命中）。
- **(c) CLI 运行**：**业务运行 0 次**；66 条疑似片段人工复核全为 grep 模式/赋值/heredoc；仅 3 次 `loopx --version` 存在性探测（09-05 未装态回显 not available；09-10 两次为本次审计自身）。`benchmark-toolkit` / `experiment-board` 0 次运行；09-02~06 的 `eval/routing-benchmark*.json` 属 Magpie 自建 DSH 技能路由评测，与 LoopX 管线无关。
- **判定**：loopx-benchmark 管线实际闭环度 = 0 —— 「技能文件在、驱动无后端（CLI 缺失）、无实验状态库表、30 天零加载零运行」，仅 09-05 一次性安装与探测行为。

---

## 3 缺口分析（三类用户故事）

### 3.1 跨境出海运营

| 声称但当前不可用 | 证据 |
| --- | --- |
| Shopify 店铺运营（MCP 卡 enabled、能力清单 14 工具） | 3 凭据引用缺失 → env 无法注入 → 连接即失败；文档自报「待应用安装」 |
| PixPix 电商视觉 37 工具（主图/套图/试穿/带货视频/精修，README 核心卖点之一） | OAuth token 09-06 过期未刷新；无过期告警 UI；唯一图像生产通道中断 |
| 「API 连接」板块 | catalog.js connections=[] 空壳；Jungle Scout/Klaviyo 仅凭据位 |
| 万物互联承诺中「企业应用」多样性 | 实际仅 Shopify（死）+ Apify（活）两卡 |
| 出海情报检索（81 卡片墙 + 4 搜索链） | 实证利用率背书：81 技能 30 天 ~9 次加载；anysearch 0 调用、tavily 0、exa 7；实际承担检索的是宿主 modsearch 桥（web_search 29 / read_page 32） |

| 用户会要但没有 | 说明 |
| --- | --- |
| 电商平台 API（Amazon SP-API / TikTok Shop / Etsy）操作通道 | 81 技能全是分析型技能，无平台 API 连接；toolGap 徽标自认「本机未接入」 |
| 凭据生命周期守护 | pixpix 静默过期 4 天无提醒；建议：token 过期倒计时 + 设置页告警列 |
| 广告投放/ERP/库存系统的双向连接 | 均为技能文案，无通道 |
| 已发布版本对客户的可安装性 | README 指向 Release 下载 v2.0.0，实际最新 Release/git tag = 1.2.2（宿主 2.0.4/alpha.1）；2.0.0 未发布（无 tag、无 GitHub Release） |

### 3.2 工程团队

| 声称但当前不可用 | 证据 |
| --- | --- |
| LoopX 基准/目标/心跳管线（7 技能 + Driver + GoalBar） | 三级实证全零（§2.5：168 会话列举 / 0 加载 / 0 业务运行）；CLI 缺失（五路检索空）；无 loopx sqlite 表；benchmark-toolkit/experiment-board 0 次。安装仅 09-05 一次性动作 |
| 多代理编排（workflow / ralph / squad / fork） | 30 天全业务 0 调用；subagent 181 次全部来自平台自治理，业务工作区 0 |
| AI 全栈 29 的「安装覆盖」 | ✅ 已兑现：29 全量在包（组装无名单过滤，assemble.sh §3 整目录复制）；实证使用 4 次（code-review/diagnosing-bugs/grilling/handoff 各 1-4 次）；风险反而在膨胀（全量 252 无差别进包） |
| dist/ 旧形态安装 | 无 node_modules、pnpm 重装——已被 packaging 取代，保留造成口径混乱 |

| 用户会要但没有 | 说明 |
| --- | --- |
| 稳定的升级承诺 | 35 文件直补/34 锚点对 2.0.6-dev 日更极其脆弱（§5） |
| CI 门禁 | `.github/` 仅 PR 模板；无 workflow；冒烟靠 release/ 目录人工脚本 |
| 团队级工作区默认预设 | 业务工作区实际跑 standard（§2.2），预设与工作区无绑定机制 |

### 3.3 企业知识管理

| 声称但当前不可用 | 证据 |
| --- | --- |
| （getnote 双通道） | ✅ 健康：19+38 双通道、凭据已设置、月读 265/20 万 |
| 飞书记忆导入的「活」状态 | noema 144 条记忆中 117 条来自 Codex `.codex/memories/memory.md` 导入（81%），写入 policy=review——**近 30 天新增写入极少**，记忆面近似静态快照 |

| 用户会要但没有 | 说明 |
| --- | --- |
| 跨知识库统一检索 | getnote / noema / lingshu / my-quotes 四库分立，无联邦检索入口 |
| 双记忆的边界声明 | noema vs lingshu 职责未向用户解释（§4.2） |
| 知识治理工具 | recall 有；无去重/审计视图 |

---

## 4 能力冗余 / 重叠（逐对给方向）

### 4.1 深度研究链（实际 ≥4 条，并非只有三套）

| 链 | 形态 | 凭据 | 连通性 | 30 天使用 |
| --- | --- | --- | --- | --- |
| modsearch 桥（web_search/x_search/read_page） | 宿主原生工具 | 无 Key（平台侧） | ✅ | **主力**：web_search 29 / read_page 32 / x_search 1 |
| anysearch | 技能 CLI（垂直域/批搜/整页） | 技能自管 .env ✅ | ✅ | **0**（仅 1 次技能加载未执行 CLI） |
| tavily-search-pro | 技能（5 模式 crawl/map/research） | launchctl env ✅（不在 credentials 服务） | ✅ | **0** |
| exa_search | 原生工具（credentials `overseas_exa`） | ✅ | ✅ | 7 次（含本审计 1） |
| deepresearch | 工作台（Scout/Evaluator/Writer + SQLite 知识库） | 平台模型 | ✅ | 4 次提交（HOME，集中单日）+ 23 个 run 会话体 |

**方向**：不必砍链，砍声明——四条链同时出现在技能目录与系统提示里，模型路由随机化。建议三层路由契约：① 秒级事实核查 → modsearch 桥；② 结构化垂直检索/批查 → anysearch；③ 多页爬取/站点地图/带引用研究 → tavily；④ OSINT（公司/人物）→ exa；⑤ 长周期课题+证据库沉淀 → deepresearch。anysearch/tavily 的触发词去重，并把 tavily 的 Key 迁入 credentials 服务（与 anysearch/exa 同一治理面）。

### 4.2 noema ×15 vs 灵枢 lingshu×12

现状：noema 144 条（81% 静态导入）承担「事实/偏好」记忆；lingshu 仅 10 节点、77 服务端工具中 12 暴露，承担感知/联想。**边界其实设计上清晰**（PageIndex 语义记忆 vs 感知-推理工作记忆），**实践中互相空转**：实证 30 天 noema 写入 98 / 读取 30（回收率低），lingshu 全家族仅 6 次调用、知识层几乎不积累。
**方向**：保留双栈，但写入策略对齐——noema 只收「跨会话要复用的事实/决策/偏好」（把 review 降为 auto-safe 换取写入率），lingshu 只收「会话内推理与联想」，禁止同一事实双写；noema 的导入记忆（117 条）应标注来源域，避免污染 recall。

### 4.3 my-quotes vs 宿主会话搜索（sessionReferenceResolver/rc_probe）

现状：my-quotes 自扫全量会话建「我说过」索引（273 条、meta 记录 32+ 文件、65MB+ zstd 每次重建）；native 会话搜索（引用/候选）平行存在，无互通。
**方向**：保留两者定位（资产检索 vs 引用回链），但 my-quotes 的扫描应复用宿主 `session.jsonl.zstd` 目录变更通知或 rc_probe 清单，避免双份全盘扫描；索引元数据（9 类意图分类）保持 my-quotes 私有。

### 4.4 skill-subset vs preset-lint

现状：subset=运行时白名单（respectFileFlags、hideOthers），lint=开发期 preset 校验（两件不同事，当前无契约：subset 引用了不存在的技能时 lint 不报错）。
**方向**：合并事实源——preset-lint 增加「subset 引用的技能必须存在于技能库且 enabled」规则；运行时 subset 校验器复用同一条规则表。二者保留、契约化，不建议物理合并。

### 4.5 附：双技能库与双 MCP 通道

- `~/.dsh/skills`（252）与 `~/.agents/skills`（12）双库并存：建议在技能中心 UI 标注来源域（当前 skill-center 已有分组）。
- getnote 19 原生 + 19 MCP（`getnote_*` 与 `mcp__getnote__*`）双通道同时挂载（本会话实例 39 个工具位）：**建议默认只挂原生通道、MCP 卡作为能力增量开关**，直接砍一半重复工具位。

---

## 5 演进风险（对上游 2.0.6+）

1. **35 文件直补 / 34 锚点 = 主破坏面**（升级≠删补丁，需清零重锚；P0-1/2/3/4 在 2.0.5-rc.1 仍未修复）：electron-runtime（更新器/权限门）、main.js（RECOVERY/P0-7 家族）、profile-manager（materializeDefaultDesktopProfile=首启真实路径）、dsh-llm:1459、dsh-tool-subagent:634、cordis:183、cordis-plugin-loader:98、skill-title×21、chatui×8、品牌×11（Helper 目录改名缺失即 FATAL）。——详见 docs/research/07-patches-manifest-v2-draft.md；治理节流见 ADR-0006。
2. **双 profile 漂移**：dev 31 行（modlens 3.26.1 / pocket 2.10.3 / git-graph 0.3.19）vs /Applications 兜底 17 行（3.25.2 / 2.8.0 / 0.3.6）。宿主升 2.0.6 时兜底 profile 也要重锚，否则「首启兜底」回退到旧生态。
3. **alpha↔rc API 断崖**：preset code→ptc、会话 V2→V3 JSONL、B-8（Typert/standingMountFor/ask/dsh-client-runtime 改名）——直接威胁 wanzh-hulian 的 skill-filesystem 挂载、goal 家族与 board 工具族。
4. **MCP 凭据时序约束**：`architecture.md:11`「凭据须先写后重启」——若上游改 credentials API（refs 命名/并发/存储位置变更），11 refs 的 yaml 迁移与三张 MCP 卡的 env 注入会同时断裂（当前 shopify 死链已示范该契约的脆性）。
5. **loopx init 行的网络依赖**：`README` 要求首启联网装 CLI——2.0.6 升级包若离线安装，loopx 面继续缺席；且无版本锚（CLI 与技能无版本绑定声明）。
6. **打包全量复制策略**：assemble.sh §3 无名单过滤（252+12 全进包）——技能目录每增 1 行，升级面即膨胀；`.bak-*` 排除模式已覆盖，但建议引入显式技能清单（与 4.4 的 lint 契约联动）。
7. **发布态滞后**：2.0.0 已构建未发布（无 tag/Release）——README 的「下载最新 Release」当前引导到 1.2.2；每次上游 2.0.6 出版，发布差会再放大一级补丁重锚成本。

---

## 附录 A · 版本事实表

| 维度 | 值 | 出处 |
| --- | --- | --- |
| 平台自报 | v2.0.0（2026-09-10；基座 2.0.5 / runtime 0.1.2-rc.1） | README:5 |
| 实际发布 | **1.2.2**（宿主 2.0.4 / alpha.1）；2.0.0 未发布 | git tag；GitHub Releases atom |
| 生产运行宿主 | DSH Desktop.app 2.0.4（本机 /Applications）+ 用户 profile 31 行 | Info.plist |
| 全库官方技能数 | **12**（~/.agents/skills）——与「252 用户」简报口径吻合 | ls 实测 |
| 会话体（30 天） | 259 个 session.jsonl.zstd / 11 工作区 | find 实测 |

## 附录 B · 证据与命令索引（节选）

- 服务计数：cordis Inspect `Service.listService`（spill 文件 grep '"key":' → 68）
- 凭据状态：`python3` 解析 `~/.dsh/.credentials.yaml`（键名 + 在位性，未输出值）
- PixPix 过期：`oauth-pixpix.json` expires_at=2026-09-06T23:59 与 stat mtime 对照
- loopx 缺席：`find ~ -maxdepth 3 -name loopx* -prune`、`mdfind -name loopx`、venv/pip/sqlite/日志五路空
- 预设使用度：`zstd -dc session.jsonl.zstd | head -50 | grep -m1 agentPreset` 按工作区聚合
- 会话体量：my-quotes meta.json total=273；`ls ~/.dsh/sessions/<ws>/ | wc -l`

## 附录 C · 置信度

| 结论 | 置信 | 依据 |
| --- | --- | --- |
| shopify 三凭据缺失 / pixpix 过期 / loopx CLI 缺席 / 11 refs 在位 | 高 | 多路独立检索交叉 |
| 预设使用度（§2.2） | 中高 | header 字段全量抽取；未计会话中途 switch；窗口外历史未计 |
| 工具频次与「233/252 零调用」（§2.3/2.4） | 高（★★★★★） | 121 次加载事件 0 解析失败、0 跨会话重复；109 种工具 live drift ±0.2% |
| loopx 三级判定（§2.5） | 高（★★★★★） | 66 条疑似 EXEC 片段全部人工复核排除假阳性 |
| 「零调用 = 未被使用」外推 | 中高（★★★★☆） | 仅覆盖本机会话记录；窗口起点 08-12 早于磁盘数据起点 08-29（近 30 天窗口实际覆盖全部存量）；被删除会话不可检测 |
| 「9/15 预设零使用」 | 中 | 以 30 天窗口为限；窗口外（8 月中前）可能存在演示使用 |

---
*本报告由只读审计代理生成；落盘前未修改任何被审计对象。利用率部分含并行实证代理的双通道统计（tool/call + skill-invocation）与本次审计集群自身的观测者效应披露。*
