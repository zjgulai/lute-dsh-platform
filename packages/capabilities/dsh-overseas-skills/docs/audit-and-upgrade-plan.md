# 81-Skills 交付后 MECE 深度审计与升级迭代方案（讨论稿）

> 状态：只审计与方案，无代码改动。基线：P7 已交付（77 安装 / 228 行 / LUTE 头像 / 预设默认）。
> 审计方式：现场取证（文件/API/日志/会话）+ 对抗性提问。

## 0. 结论速览

交付质量整体达标（目录结构 77/77、图标 228/228、catalog 零重名、lint 静态通过），但存在 **3 项高优先级债务**（B 类卡面旧文案、预设未实战挂载、子集开关语义漏洞）、**若干中低优先级工程/文档债务**。建议按「先语义后体验」排序迭代。

## A. 卡片描述与元数据（用户关注点 1）

| # | 发现 | 证据 | 级别 |
| --- | --- | --- | --- |
| A1 | **B 类 12 个替换技能中 9 个卡面仍是旧 Accio 中文摘要**（文案/ROAS/物流等与 81 正文语义不符） | copywriting=「用 AIDA 模型撰写首页…」 vs 81 正文为触发词式；seo-page-audit/optimize-ecommerce-page-conversion 等同 | 高 |
| A2 | B 类 3 个（ecommerce-marketing / amz-product-optimizer / skill-creator）summaryZh **为空**（Accio 行无摘要；builder 只覆盖 title/toolBacked，未覆盖 summaryZh） | 空串 | 高 |
| A3 | **17 个双重空白卡**（无本地文件 + 无 summaryZh）：1688-sourcing、review-summarizer、alibaba-amazon-market-intel、jungle-scout-deep-dive-analyzer、content-breakdown、social-media-publisher、instagram-marketing、remotion、product-description-generator、amz-hot-keywords、docx/pdf/pptx/xlsx、skill-finder、self-improvement 等 | 卡面只剩标题+开关 | 高 |
| A4 | 8 个 81 系描述 >450 字符（seo-controller 505 / etsy-seo-optimizer 501 等），卡面 160 字符截断在句中（……）。路由不影响，观感略糙 | 长度统计 | 低 |
| A5 | C 类 51 个 summaryZh 由「第一句截断」自动生成——语义准确但部分截取点位偏短（如「优化AI搜索可见性…」），专业度层次不齐 | 生成逻辑已知 | 中 |
| A6 | 存量 123 个精修技能卡面用旧 summaryZh + 精修后的正文——一致性 OK，但摘要深度仅 1-2 句，与 81 系「触发词+边界」式详摘要存在代差 | 抽查比例 | 中 |

## B. 目录结构与内容填充（用户关注点 2）

| # | 发现 | 证据 | 级别 |
| --- | --- | --- | --- |
| B1 | **77/77 全部携带子目录** ✓（references 76 / scripts 77 / examples 76 / assets 19） | 统计 | ✅ |
| B2 | performance-tracking **81 源侧即缺 references/examples**（仅 scripts+tests）——无法装 | 源目录检查 | 中 |
| B3 | 3 个**空 assets 目录**（gtm-strategy-planning / outreach-automation / viral-video-analyzer）——内容未填充 | 空目录 | 低 |
| B4 | 存量 123 个统一技能为**单文件 SKILL.md**（无 references/scripts 子目录）——按 D6 设计（无源材料，正文自包含），但与 81 系目录形态不同构 | 目录对比 | 中（决策点） |
| B5 | scripts/ 内 Python CLI 真实（route.py/core.py/run.py 等），但**未在 DSH 侧实测**（原生态约定，import 路径/参数可能与 DSH 目录布局不兼容）——模型调用时才能暴露 | 代码抽查 | 中 |
| B6 | tests/eval-reports/.skill-meta 按 D6 剔除 ✓（已文档化） | — | ✅ |

## C. 预设功能完整与基座兼容（用户关注点 3）

| # | 发现 | 证据 | 级别 |
| --- | --- | --- | --- |
| C1 | manifest 键与 overseas-*/kol-* 等 subset 预设**完全一致**；lint-preset.mjs 静态校验通过 | 键对比 + 实跑 lint | ✅ |
| C2 | ⚠️ **无任何会话实际挂载过该预设**（settings.default 已设，历史会话搜索无 brand-marketing-growth 踪迹）——运行时 mount、隔离、卡片墙行为未实战验证 | settings.yaml + 会话事件 | **高** |
| C3 | ⚠️ **子集开关语义漏洞**：dsh-skill-subset 正向注册强制 `modelInvocable:true / userInvocable:true`，**无视文件中的 disable-model-invocation**（O1 默认关）→ 用户在设置页关闭调用的技能，在品牌营销增长官会话中模型仍可自动调用。与现有 12 预设同行为（既有设计），但对新用户心智是一致性陷阱 | 插件源码 | **高（决策点）** |
| C4 | 预设遮蔽 211 个非白名单技能（含 lark-tools 等系统技能）——「功能完整」边界待用户确认（是否保留 lark/搜索类） | subset 逻辑 | 中（决策点） |
| C5 | 工具行 fs/search/bash 与海外预设一致 ✓；web_search 等为基线能力（本会话已验证存在），无需显式行 | 现场 | ✅ |
| C6 | 白名单 81 名中 2 名未安装（market-viability-logic-auditor / ecommerce-quarterly-strategy）——subset 逐名警告后安全跳过；3 个 deferred 替换目标目前显示**旧标题+旧 toolBacked**（market-viability-logic-auditor 仍 toolBacked=true 且已无本地方案，卡面显示「需外部工具」错误信息） | catalog 行 | 中 |
| C7 | 图标/描述/order=60 ✓；persona 手写（可持续优化） | 文件 | ✅ |

## D. 工程债务

| # | 发现 | 级别 |
| --- | --- | --- |
| D1 | 五环管线**无单一入口**：import-81skills → assign_lute_icons → build_preset_catalog → 硬链接同步 → 重启；每一步靠记忆顺序执行，无闸门校验 | 高 |
| D2 | 硬链接同步逻辑散落在历史命令（-ef 守卫重复）；catalog.js 的「同 inode 穿透」语义不显式 | 中 |
| D3 | verify_p7.sh 硬编码端口 43120；**无预设挂载探针**（C2 验证工具缺失） | 中 |
| D4 | gen_category_icons.py（文字徽章）被 assign_lute_icons.py 取代——**死脚本**；plan 文档 §8 仍写 emoji 方案 | 低 |
| D5 | 三处一致性靠手动保证：81-mapping.json ↔ preset 白名单 ↔ catalog 行；gen_preset.mjs 未扩展支持 brand-marketing-growth 再生成 | 中 |
| D6 | backup/pre-81/ 23 个回滚目录（回滚窗口已过，可归档清理） | 低 |
| D7 | /list 每次串行读 228 个 SKILL.md——实测 51ms，可接受；无缓存（未来行数增长再优化） | 低 |

## E. 文档债务

- plan v2 §8 图标方案与终版不符（emoji→徽章→头像）；delivery report 已更新 ✓
- iteration-runbook 未覆盖 81 系增量流程（4 加密补齐的完整操作清单仅在 plan §5 一句话）
- README（项目根无 dsh-overseas-skills README）未说明 manifest 三批与生成顺序

## F. 对抗性审计（找弱点/假设检验）

- **假设「开关=模型不调用」**：在 preset 会话中被击穿（C3）——语义两套，需用户裁决。
- **假设「deferred 只是暂缓」**：market-viability-logic-auditor 的 toolBacked=true 会永久误导「需外部工具」徽标（该技能本无工具依赖）——落地时应修，暂缓期也该修。
- **假设「81 正文引用已全部改写」**：改写基于映射表；若未来改名/删除，392 条引用中越过目录的（如 build-deepseek-harness-plugin 类）无自动检测——需要「悬空引用检查」纳入常规验收。
- **假设「图标=分类归属」**：4 个分类头像与既有 preset 头像同源（design=ux-designer 与 ai-content-image-studio 预设同图）——用户要的「同一套」，接受；但需确认「同图复用」可被识别。
- **假设「B 类替换=内容一致」**：A 类 2 个保留的旧 workflow（etsy/listing）与新正文主题一致 ✓；无错配证据，低风险。
- **稳定性**：/list 51ms、启动 health-commit、无白屏（连续 3 次重启验证）——稳定面达标 ✅。

## G. 升级迭代方案（待决策后定稿）

| 阶段 | 内容 | 关联 |
| --- | --- | --- |
| I1 卡面语义对齐 | B 类 12 个 summaryZh 从 81 描述重新生成（自动+人工复核）；17 个双重空白行加「工具型技能 · 未接入」占位说明 + toolGap 文案；A4 截断优化（生成 140 字精炼版） | A1-A5 |
| I2 预设实战验证 | 用户切换预设实测 + 我写挂载探针（sessionController 建会话/扫技能子集）+ 验证结论入报告 | C2 |
| I3 子集开关语义修缮 | 方案 A（现状+文档明示）或方案 B（subset 读文件标志，改插件+12 预设回归）——用户裁决 | C3 |
| I4 目录完整性 | B3 空 assets 清理或标注；B2 performance-tracking 补 references（源侧）；B5 抽测 2 个 Python CLI 可运行性 | B2/B3/B5 |
| I5 工程化 | 一键管线 pipeline.sh（import→icons→build→sync→lint→verify 闸门）+ 悬空引用检查入 verify + gen_preset 支持 BMG；清理死脚本/更新文档 | D1-D5, E |
| I6 deferred 收尾 | 明示 4 加密补齐后的完整操作清单（并入 runbook）；market-viability-logic-auditor 立即清 toolBacked | C6 |

## H. 决策点清单（待拍板）

1. **D-1 卡面描述策略**：A 全量自动重写 + B类人工精修（推荐）/ B 仅 B类 / C 228 行全量精修
2. **D-2 存量 123 子目录**：A 不补（正文自包含，推荐）/ B 补空骨架 / C 分域补 references
3. **D-3 子集开关语义**：A 保持现状+文档 / B 改插件读文件标志（推荐，需 12 预设回归）
4. **D-4 预设挂载验证**：A 用户切换实测（推荐）+ 探针脚本 / B 仅探针
5. **D-5 一键管线**：A 采纳（推荐）/ B 暂不，保留手工作业
