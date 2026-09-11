# 81-Skills 兼容安装与品牌营销增长官 Preset · 交付报告

> 状态：P1–P6 完成，P7 运行时验收待 DSH 重启。方案讨论稿见 `docs/brand-marketing-growth-plan.md`。

## 1. 交付概览

| 项 | 结果 |
| --- | --- |
| 81-Skills 转换安装 | 81/81（原 4 个加密文件已于 2026-09-06 以明文补齐，见 §14） |
| 兼容替换 | A 类 14 覆盖升级 + B 类 15 替换（其中 3 个 toolBacked 转纯内容） |
| 全新安装 | C 类 52 个 + 3 个新分组（知识工程 8 / 技能工程 5 / 电商数据分析 7） |
| 设置页目录 | 25 组 / 230 行，全行图标，零重名 |
| 存量结构统一 | 123 行批量 + 123 个三批精修，392 条路由引用 0 悬空 |
| 预设 | 品牌营销增长官（brand-marketing-growth），白名单 81 名，LUTE 绿专属 SVG |
| 图标装饰（终版） | LUTE 头像徽章两批：分类 25 枚 + 81 系技能 81 枚（scripts/assign_lute_icons.py → manifest/category-icons.json + skill-icons.json），与 preset 卡片 icon 同一套生成器与品牌规范；暗/浅双主题截图验收通过 |

## 2. 关键产物

- `scripts/81-mapping.json` — 81 技能映射/分类/图标/别名/暂缓清单（单一事实源）
- `scripts/import-81skills.mjs` — 转换+安装管线（frontmatter 压平 JSON 化、内部命名改写、开关保留、完整目录安装）
- `manifest/81-skills.json` — 3 新分类 + C 类 51 行 + A/B 26 覆盖行（生成物）
- `scripts/build_preset_catalog.py` — 扩展：81 清单消费 + 覆盖应用 + 图标体系
- `lib/catalog.js` — 25 组 / 228 行（icon 字段全量）
- `lib/index.js` / `lib/client.js` — icon 透传 + 设置页/卡片墙/胶囊渲染
- `scripts/unify-structure.mjs` + `unify-refine-batch{1,2,3}.json` + `unify-refine.mjs` — 存量统一批量层与三批精修
- `eval/routing-benchmark-81.json` + `eval/llm-picks-81.jsonl` — 81 系路由基准（22 用例）
- `scripts/route_bench81.mjs` + `scripts/verify_p7.sh` — 词法基准与重启后验收
- `~/.dsh/.agent-presets/brand-marketing-growth/` — 预设三件套
- `backup/pre-81/` — 23 个被覆盖技能的回滚备份

## 3. 测试与验收汇总

| 测试 | 结果 |
| --- | --- |
| 转换校验（frontmatter JSON 化/name 正则/UTF-8） | 77/77 通过，0 问题 |
| 安装校验（文件存在/解析/名字唯一） | 77/77，0 重名 |
| 开关保留（overwrite 前后对比） | 无用户状态翻转；19 处仅为「缺省→true」O1 显式化 |
| catalog 完整性 | 25 组 / 228 行 / 0 无图标 / 0 重复 |
| 存量统一文件验收 | 123/123 解析通过、标记齐全 |
| 路由引用完整性 | 392 条引用 0 悬空 |
| 词法路由基准（22 新用例） | Top-1 68.2% / Top-3 90.9% / 平均排名 1.55 |
| LLM 级路由抽查（22 用例） | 严格命中 22/22（100%） |
| profile 同步 | lib 三文件 byte 一致 |
| 预设 SVG | base64 解码 + XML 解析通过 |
| 防白屏预检 | 未新增 bundles 条目（无 dsh.bundle 声明风险）；启动尾事件待重启复查 |

## 4. 待重启验证清单（P7）

重启 DSH Desktop 后执行 `bash scripts/verify_p7.sh` 并人工确认：

1. 设置页「出海技能」：25 分组（含 3 新组）、228 卡带图标、B 类 12 个新标题、3 个 toolBacked 卡片去标
2. 对话卡片墙：分类胶囊图标 + 卡面 emoji + 点击填入不变
3. 预设切换：选「品牌营销增长官」→ 会话内只见 81 系技能；切换回 allround 恢复全量
4. 开关：新技能 toggle 生效（frontmatter 回写）
5. 启动事件 `finalStage: health-commit`、渲染器 healthy（防白屏）

## 5. 增量计划（加密文件补齐后）

用户提供 4 个明文 SKILL.md → 放回 `81-Skills/<中文名>/` → 重跑 `import-81skills.mjs`（自动识别并转换）→ 重跑 `build_preset_catalog.py`（3 个 B 类覆盖行 + ecommerce-quarterly-strategy 新行入 catalog）→ 同步 lib → 重启。预设白名单已含 4 名，无需改动。

## 6. 风险与回滚

- 回滚：`backup/pre-81/` 覆盖回 23 个技能；`lib/catalog.js` 由 builder 幂等重建；预设目录删除即卸载
- 已知留白：4 个暂缓技能的白名单名在预设内安全跳过（subset 插件逐名告警）；2 个暂缓目录行（market-viability-logic-auditor 等）在设置页显示为未安装态
- 81 系技能间「何时不用」引用已全部映射为 DSH 英文名；正文 H1 保留中文文档名

---

## 7. 最终运行时验收（2026-09-05 深夜，重启后实测）

| 检查项 | 结果 |
| --- | --- |
| 设置页目录规模 | 25 组 / 228 条（含 3 新分组） |
| 分类头像 | 25/25 LUTE 头像 |
| 条目图标 | 228/228 SVG 头像（去重 102：81 系专属 + 分类头像），0 空 |
| B 类替换标题 | 12/12 生效（营销主控/营销文案/Skill创建器等） |
| C 类安装态 | 抽查 6 个 installed=true |
| 防白屏 | finalStage=health-commit，renderer=healthy |
| 图标来源 | lute-brand-icons 生成器（139 枚全量），与 preset 卡片 icon 同一品牌规范，暗/浅双主题截图验收通过 |

**交付结论：P1–P7 全流程完成。** 77/81 技能兼容安装 + 4 加密暂缓占位（增量管线就绪）、A14/B12 兼容替换（以 81 为准）、catalog 25 组 228 行全图标、存量结构统一 123 行三批精修（392 路由引用 0 悬空）、词法 Top-3 90.9% + LLM 路由 22/22、brand-marketing-growth 预设（81 名白名单 + 4 占位）就位。


---

## 8. 升级迭代（第二轮：卡面语义 + 工程化，2026-09-05）

- **I1 卡面语义对齐**：B 类 12 个摘要从 81 实时描述首句重生成（消除旧 Accio 文案）；3 个原空摘要补齐；market-viability-logic-auditor 清 toolBacked 误标 + 81 标题提前生效；17 个工具型空白卡加「工具型技能 · 未接入外部工具」占位（index.js 回退）；剩余空 summaryZh = 16 个 toolBacked 未安装行（占位已覆盖）
- **I4 目录完整性**：182 个 Python CLI 全部 py_compile 通过、0 失败；空 assets 目录 3 个（源侧原样，无害保留）；performance-tracking 源侧缺 references/examples（记录为已知缺口）
- **I5 工程化**：新增 scripts/pipeline.sh（闸门式一键管线）、verify_static.mjs（名字唯一/图标覆盖/悬空引用）、gen_bmg_preset.mjs（预设可复现）、preset_mount_probe.sh（挂载验证）
- **I3 子集开关语义**：判定保持现状（预设内全部可调用），因 O1 默认模型关数据下改为「读文件标志」会反向禁用全部 12 预设技能，回归风险高——以文档明示为当前结论
- **待用户动作**：重启生效（catalog 摘要/占位）+ 切换预设做一次挂载实测（probe 脚本已备）

---

## 9. 用户验收（2026-09-05 终）

✅ 设置页图标（LUTE 头像体系）与卡面摘要（148 条精修 + 8 标题中文化 + 0 空白）用户确认一致
✅ I3 严格开关语义实测符合预期（BMG 会话：开关控制模型调用，`/` 菜单始终可点）
✅ 预设挂载、防白屏、路由基准、结构统一全部验收通过

---

## 10. 目录统一（第三轮，2026-09-05 晚）

- 77 个 81 系全量重装：tests 77/77、.skill-meta 60、eval-reports 19、README 75、LICENSE 37（与源目录差异仅 4 个 deferred，源保真 100%）
- 存量 131 个目录统一：README.md 131 + references/README.md 109（触发词/何时不用/安全边界/工作流正文摘录，零虚构）
- 规范文档：docs/skill-directory-spec.md；管线接入 unify-directories（幂等）
- 依据：dsh-skill-filesystem 只扫根目录一层、目录即 resourceBase（渐进式披露）——嵌套 SKILL.md 无注册风险

---

## 11. 斜杠命令全中文（第四轮，2026-09-05 深夜）

- 源码级结论：技能名强制英文 kebab（加载+注册双层校验）、斜杠不经宿主解析（模型按标题路由）、选择器已匹配中文
- L1 三处补丁（patch-cn-slash.mjs，幂等+备份+restore）：选择器填入中文标题、lexicon 加中文标题、卡片墙填入中文标题
- L2 可靠性：description 首部中文触发词 + LLM 路由 22/22 背书
- L3 提案：alias 扩展点（文档沉淀，不实施）
- 文档：docs/cn-slash-commands.md；刷新页面即生效

---

## 12. AI全栈技能（第五轮，2026-09-06）

- 范围：mattpocock/skills 稳定集 29 个（ADR-0001）；8 分类八阶段 MECE 定位
- 汉译：29/29 全文汉译（4 并行子代理；代码块/命令/技能名保留英文）
- 安装：frontmatter JSON 化 + 默认模型可调用（ADR-0006）+ 资源保真；tdd/to-spec/grill-me 全局新版与预设旧版共存（ADR-0002）
- 适配测试：verify-fullstack.mjs 29/29 全项通过（解析/开关/路由冒烟/脚本语法/预设副本）
- 页面：第二 settings.section「AI全栈技能」+ 卡片墙双组 + /fullstack-list 端点 + catalog 双源（ADR-0004）
- 图标：8 分类 + 29 技能专属 LUTE 头像（ADR-0005）
- 基准：FS 词法路由 Top-1 100%（29 用例）；路由型 3 技能冒烟通过（ADR-0007）
- 待办：重启后按 docs/fullstack-acceptance.md 执行 P5 人眼验收


---

## 13. 指令审计与修复（第六轮，2026-09-06）

- 审计：AGENTS.md + 全部技能（F1-F10，报告 docs/agent-instructions-audit.md）
- 修复：F1 分级追问（56 desc + 123 正文）、F2/F3/F5/F9 AGENTS.md 定点（备份 .bak-*）、F4 补偿规则、F6-F10 触发限定
- 验收：目录快照实时生效、解析 106/106、verify 双闸门、路由 228+29 Top-1 100% 零回退
- 有意保障保留：schema 风险确认、安全边界拒绝、不自动 commit、生产 allowlist

---

## 14. 4 个加密技能明文补齐（第七轮，2026-09-06）

- 明文来源：`/Users/lute/Downloads/4-Skills/`（完整技能包，含 references/tests/examples/scripts/README/LICENSE）
- 前置：加密原件备份至 `81-Skills/.doctor-backup/4skills-encrypted-2026-09/`；明文 rsync 覆盖进 `81-Skills/` 对应目录
- 映射转正（scripts/81-mapping.json）：deferred → 上市策略/市场可行性审计/竞品情报 overwrite（B 类保开关），电商季度战略 create（C 类，电商数据分析组）
- 管线结果：OK 81 / Deferred 0 / Problems 0；market-viability-logic-auditor 首次落盘（原仅目录行）
- 目录：230 行（+ecommerce-quarterly-strategy），4 行摘要/图标/路由引用全部刷新；预设 skills 列表 81 = subsetSkillCount 81
- 基准：词法路由 228 用例 Top-1 100%（1 条旧文案用例同步更新为真实摘要）
- 待办：重启 DSH Desktop + 刷新设置页，人工核对 4 张新卡
