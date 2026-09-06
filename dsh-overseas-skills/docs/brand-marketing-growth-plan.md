# 品牌营销增长官 Preset：81-Skills 兼容安装与替换方案（定稿 v2）

> 状态：六项决策已确认，方案定稿；尚未开始改代码。执行前逐阶段向你同步。

## 0. 决策记录（2026-09-05）

| # | 决策点 | 结论 |
| --- | --- | --- |
| D1 | 4 个加密 SKILL.md | **全部暂缓**：先装其余 77 个；预设白名单留空位，源文件补齐后增量更新 |
| D2 | B 类替换 | **按映射表全部替换**（含 3 个 toolBacked 转纯内容技能）；其中 3 个加密的替换随 D1 暂缓 |
| D3 | 结构统一范围 | **全部 177 行目录技能**：批量模板化管线 + 分批精修（见 §6） |
| D4 | 预设范围 | **全部 81 个**（含知识工程/技能工程/LLM技术调研） |
| D5 | 图标方案 | **分类图标 + 81 系卡片 emoji + 预设专属 SVG** |
| D6 | 安装粒度 | **完整目录**：SKILL.md + references/ + scripts/ + examples/；剔除 tests/eval-reports/.skill-meta/README/二进制安装脚本 |

## 1. 目标

1. 检查 `Magpie-Horch/81-Skills/` 与当前 DSH 技能体系的兼容性（完成，见 §3）。
2. 能力相同的：以 81-Skills 为准，对「出海技能」存量技能做兼容替换。
3. 不能被替换的存量技能：全部按 81 风格结构统一完善（D3）。
4. 81 个 skills 兼容安装，设置页「出海技能」呈现带图标装饰的技能卡片。
5. 打包新建「品牌营销增长官」preset（专属 SVG 图标）。

## 2. 当前系统架构（与任务相关的部分）

| 层 | 内容 | 位置 |
| --- | --- | --- |
| 技能文件层 | 每个技能 = `~/.dsh/skills/<english-name>/SKILL.md`（可携带 references/scripts/assets 子目录） | `~/.dsh/skills/` |
| 目录展示层 | `lib/catalog.js`：CATEGORIES 22 组 + SKILLS 177 行（name/title/category/summaryZh/toolBacked/toolGap） | `dsh-overseas-skills` |
| 实时元数据 | `/api/dsh-overseas-skills/list` 读目录 SKILL.md 的 description + disable-model-invocation；toggle 重写 frontmatter | `dsh-overseas-skills/lib/index.js` |
| 设置页/卡片墙 | settings.section「出海技能」+ conversation.input.dock 卡片墙（目前无图标渲染，P4 新增） | `dsh-overseas-skills/lib/client.js` |
| Preset | `~/.dsh/.agent-presets/<id>/`：preset.yml + manifest.json + agent.cordis.yml；图标 = base64 SVG | `~/.dsh/.agent-presets/` |

**替换语义**：覆盖 `~/.dsh/skills/<name>/SKILL.md` + 更新 catalog 行 = 英文名保留 → 现有 preset 白名单引用不断裂、disable-model-invocation 开关状态保留、title 更新为 81 命名。

## 3. 81-Skills 体检结论（7 类兼容问题）

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | `name:` 为中文 | 映射英文 kebab 名（§4 表） |
| 2 | `description: \|` 块标量含 `: ` | 压成单行 JSON 引号字符串 |
| 3 | 自定义字段（compatibility/source/...） | 折叠进 description/正文 |
| 4 | 4 个 SKILL.md 加密（统一魔数 `88 7d 1c ?? 3a 05 f6 03`） | D1 暂缓 |
| 5 | 子目录结构 | D6 完整目录安装，剔除 81 生态专用件 |
| 6 | 「何时不用」引用内部命名（mkt-* 等） | 转换脚本按映射表统一改写为 DSH 英文名 |
| 7 | 正文风格（触发词/何时不用/安全边界/步骤化） | 与已装范式兼容，正文整体保留 |

## 4. 81 技能映射总表（执行口径）

### A 类 · 升级替换（14，本轮全部执行）

亚马逊Listing专家→amazon-listing-expert；Etsy优化器→etsy-seo-optimizer；产品属性分析器→product-attribute-analyzer；市场洞察选品→market-insight-product-selection；场景选品侦察→scenario-driven-product-scout；跨境选品→cross-border-selection；客户之声分析器→customer-voice-analyzer；公司调研→company-research；库存预测→inventory-demand-forecaster；畅销款规律解码器→bestseller-pattern-decoder；趋势时机分析器→trend-stage-timing-analyzer；亚马逊PPC分析→amazon-ppc-campaign-manager；SEO竞品分析→seo-competitor-analysis；AI产品设计师→ai-product-designer。

### B 类 · 兼容替换（15）

**本轮执行 12**（保留目录英文名、清 toolBacked、title 改 81 名）：
转化率优化→optimize-ecommerce-page-conversion；营销文案→copywriting；社媒内容→social-content；邮件序列→email-automation-flow-builder；大促效果分析→performance-tracking；品牌声音提取器→brand-voice-glossary；物流优化→international-shipping-customs；营销主控→ecommerce-marketing（清 toolBacked）；亚马逊Listing优化→amz-product-optimizer（清 toolBacked）；Skill创建器→skill-creator（清 toolBacked）；SEO内容优化→ecommerce-seo-optimizer；SEO技术审计→seo-page-audit。

**暂缓 3（随 D1）**：上市策略→launch-strategy；市场可行性审计→market-viability-logic-auditor；竞品情报→competitor-profiling。

### C 类 · 全新安装（52）

**本轮执行 51**：geo-optimizer、gtm-strategy-planning、jtbd-analyzer、mece-knowledge-extractor、seo-controller、skill-optimizer、skill-family-manager、skill-structure-doctor、skill-evaluator、voc-sentiment-analyzer、amazon-sorftime-research、amazon-competitor-monitor、product-data-deep-analysis、product-research-matrix、paid-advertising、supplier-evaluation、supply-chain-controller、cold-email、single-post-intel-mining、brand-logo-designer、brand-mention-tracking、outreach-automation、multi-platform-listing-generator、multilingual-seo、tech-pack-generator、platform-price-monitor、ad-creative、file-history-manager、terminology-standardizer、viral-video-analyzer、shipment-tracking、icp-profiler、ecommerce-csv-processing、ecommerce-price-monitor、ecommerce-analytics-controller、ecommerce-daily-report、ecommerce-monthly-review、ecommerce-ml-modeling-advisor、ecommerce-business-insights、knowledge-similarity-analyzer、knowledge-extraction-expert、competitor-alternative-analysis、web-scraping-plan-designer、marketing-content-suite、semantic-bucketer、semantic-density-analyzer、semantic-doc-chunker、cross-border-category-feasibility、cross-border-intel-radar、anchor-text-splitter、llm-tech-research。

**暂缓 1（随 D1）**：ecommerce-quarterly-strategy（电商季度战略）。

> 计数：A 14 + B 12 + C 51 = **本轮 77**；暂缓 4。全部 81 = 14 + 15 + 52。
> 目录中另有 sales-negotiator / product-launch-planner / dropshipping-supplier-integrator / product-selection 不在 81 内，保持原样。
> 英文名已逐一核对与现有 157 个技能目录、177 行 catalog 无冲突。

## 5. 转换规范（81 → DSH）

```yaml
---
name: "english-kebab"
title: "中文名"（81 目录名）
description: "单行 JSON 引号串：原 description 压平 + 触发词 + 何时不用 + 安全边界要点"
workflow: "1..N 步骤（若原文有；JSON 引号、\n 转义）"
enabled: "true"
disable-model-invocation: false
user-invocable: true
whenToUse: "路由边界（取自触发词/何时不用）"
---
正文：81 原文主体整体保留；「何时不用」内部命名按映射表改写为 DSH 英文名。
```

- 全部标量 JSON 引号化；不保留 `|`/`>-` 块标量（历史 YAML 事故）。
- 输出统一 UTF-8；逐文件跑 frontmatter 解析校验，77/77 通过才算完成。
- 完整目录安装：references/ + scripts/ + examples/ 随行；tests/eval-reports/.skill-meta/README/`.command` 剔除。

## 6. 存量结构统一（D3：全部 177 行）

实际需要统一的存量 = 177 − 15（B 类替换后即 81 结构）− 14（A 类升级后即 81 结构）≈ **148 行**。执行策略：**批量管线 + 三批精修**。

- **批量层（脚本，覆盖全部 148 行）**：为每个存量技能生成 81 风格骨架——`触发词`（标题+英文名+近义）、`何时不用`（与相邻技能的路由边界，利用 catalog summaryZh 生成初稿）、`安全边界`（通用条款 + 技能特化）、`步骤化流程`（原文有流程则提取）、frontmatter 补 `whenToUse`。
- **精修层（分 3 批）**：① 营销域约 25 个（brand/pr/social-ops/seo/marketing）逐字精修；② 运营/物流/选品域；③ 财务/留存/办公/其他。7 个 preset 组技能（DSH AI 内容视觉编辑等 9 行）只做 frontmatter 对齐，不重写正文。
- 每批完成后回归校验（解析 + 目录行不丢 + 开关状态不变）。

## 7. 预设打包（品牌营销增长官）

```
~/.dsh/.agent-presets/brand-marketing-growth/
├── preset.yml          # name: 品牌营销增长官 / description / order / icon: base64 SVG
├── manifest.json       # id: brand-marketing-growth, subsetSkillCount: 81
└── agent.cordis.yml    # persona + dsh-skill-subset + agent-instructions + tool-fs/search/bash
```

- 白名单 = 81 个英文名；本轮写入 77 个，4 个暂缓技能占位待增量。
- persona：品牌营销增长官——品牌/GTM/内容/流量/增长全链路专家。
- 图标：LUTE 品牌绿系 rounded-square 渐变 + 增长曲线/喇叭元素，复用现有 14 个 preset 的 SVG 骨架（P4 生成）。
- 与 overseas-marketing（跨境营销操盘手）并存。

## 8. 卡片图标装饰（D5 · 终版为 LUTE 头像）

- catalog 行新增 `icon` 字段；client.js 设置页卡片（ovsCardHead）与对话卡片墙（ovpCardTop）渲染图标。
- 81 系 81 张卡：逐卡 emoji（转换脚本按技能语义预配，人工复核）。
- 其余目录行：按分类默认 emoji（15 个存量分类 + 3 个新分类）。
- 分类胶囊：分类级小图标。
- 新增 3 个分组：知识工程（10）、技能工程（5）、电商数据分析（8）。

## 9. 执行阶段（按序，每阶段验收后进下一阶段）

- **P1 转换管线**：映射表 JSON + 转换脚本（frontmatter 转换/内部命名改写/编码统一/加密分流）→ staging 目录 + 校验报告。
- **P2 安装**：A 14 覆盖 + B 12 覆盖 + C 51 新建到 `~/.dsh/skills/`（完整目录）；77/77 解析校验；title/开关状态核对。
- **P3 目录与 UI**：manifest 追加 51 行新目录 + 3 新分组 + summaryZh/toolGap；B 类 12 行更新 title/清 toolBacked；重建 lib/catalog.js；构建 bundle；硬链接同步（`cat src > dst` + `-ef` 守卫）；重启验证。
- **P4 图标**：卡片 icon 渲染（client.js）+ 分类图标 + 81 卡 emoji 配置 + 预设 SVG 生成。
- **P5 存量结构统一**：批量管线覆盖 148 行 + 三批精修（见 §6）。
- **P6 预设打包**：brand-marketing-growth 三文件 + 白名单 77（+4 占位）；会话隔离验证（只见 81 系技能）。
- **P7 验收**：设置页卡片/搜索/开关、卡片墙、preset 切换、路由抽查（复用 route_bench 框架）；产出交付报告。

## 10. 风险与边界

- 4 个加密文件暂缓：预设白名单 77+4 占位；补齐后仅需 P1/P2 增量 + 目录加行。
- 3 个 toolBacked 转纯内容（营销主控/亚马逊Listing优化/Skill创建器）：原 MCP 依赖能力移除，符合「以 81 为准」决策（D2）。
- 替换保留目录英文名：overseas-marketing 等现有 preset 白名单不断裂；开关状态保留。
- 81 系技能互相引用密集，P7 路由抽查覆盖 SEO 五件套/营销主控族/电商分析主控族。

---

## 11. 执行进度（2026-09-05 晚）

| 阶段 | 状态 | 证据 |
| --- | --- | --- |
| P1 转换管线 | ✅ | scripts/81-mapping.json（81 映射+别名+4 暂缓）；import-81skills.mjs；77 转换 0 问题 |
| P2 安装 | ✅ | ~/.dsh/skills 新增/覆盖 77 目录；26 替换目标备份于 backup/pre-81/；开关无翻转（19 处仅为缺省→true 显式化） |
| P3 目录重建 | ✅（待重启生效） | build_preset_catalog.py 扩展 + manifest/81-skills.json → catalog 25 组/228 行/0 重名；B 类 12 个 title 更新 + 3 个清 toolBacked；lib/*.js 已硬链接同步 |
| P4 图标 | ✅（待重启生效） | catalog 全行 icon + index.js 透传 + client.js 设置页/卡片墙/胶囊渲染；预设 SVG（LUTE 绿系） |
| P5 存量统一 | ✅ | 批量层 123 行 + 三批精修 123 个（batch1 营销域 40 / batch2 运营物流 41 / batch3 财务留存 42）；392 条路由引用 0 悬空；词法路由基准 Top-1 68.2% / Top-3 90.9%（22 新用例，2 例属词法弱点待 LLM 档复核） |
| P6 预设打包 | ✅（待重启验证） | ~/.dsh/.agent-presets/brand-marketing-growth/（preset.yml + manifest.json + agent.cordis.yml，白名单 81 名含 4 占位） |
| P7 验收 | ⏳ 等待重启 | 重启后：设置页 25 组/228 卡图标、卡片墙 emoji、预设切换隔离、LLM 级路由、交付报告 |

**待办增量**（加密文件补齐后）：跑 P1/P2 增量（4 个 deferred）+ catalog 加 4 行（3 覆盖 + 1 新）+ 白名单自动生效。
