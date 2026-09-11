# 09 · 文档 + 技术债务余额审计（v2.0.0 发布后）

> 2026-09-10 · 子代理全程只读核对（仅写入本报告）
> 上游输入：docs/panorama-code-diagnosis-report.md（段①–⑤）· docs/upgrade-2.0.5-window-plan.md · docs/research/01–08 · packaging/
> 方法：只读 `ls/find/grep/cmp/head` + read 工具；零修改目标文件；不跑测试套件（避免写产物），运行态证据引用 panorama §7 重启验收记录（2026-09-10 15:0x）。

---

# A · panorama 方案段①–⑤落地状态核对

## 段① 灵枢（dsh-memory-local）——✅ 已落地（4/4 子项）

| 子项 | 结论 | 证据 |
|---|---|---|
| tsconfig/scripts 补齐 | ✅ | `dsh-memory-local/tsconfig.json` 在位（493B，rootDir=src/outDir=lib，include `src/**/*.ts`，exclude `.orig`）；package.json scripts：`build=tsc -p tsconfig.json`、`typecheck`、`test`、`prepare=build`；`files` 白名单无 `.orig` |
| lib 已重建、src/lib 同步 | ✅ | workspace lib 全量 mtime **2026-09-10 16:23:56**（与 src/index.ts、src/mutual.ts 同秒批次）；delegationDepth 守卫在 `lib/hooks.js:92`（P0-5e 注释：`if ((_session?.header?.delegationDepth ?? 0) > 0) return`）；DB_PATH_SENTINEL 哨兵 + apply 期 `resolveDbPath → ~/.dsh/data/lingshu.db` 在 `lib/index.js:31-36,68,104-106`（D7/CWD 治理）；ensureHarness 透传 config.python 在 `lib/mutual.js:294-297`（P2 修复达阵） |
| profile 硬链接同步 | ✅（内容零漂移） | 与 `~/.dsh/profiles/desktop/node_modules/@furongjun1999/dsh-memory/lib/` 逐文件 `cmp`：hooks.js / mutual.js / tools.js / bridge.js / index.js **全部 IDENTICAL**。瑕疵：profile 侧 mtime 停在 11:54（首批构建点），workspace 16:23:56 二次重建后未重放同步事件——内容等价，时间戳层面非零漂移 |
| apply-patches 灵枢补丁退役 | ✅ | `~/.dsh/profiles/desktop/apply-patches.mjs` 头部台账：**"Retired 2026-09-10 (segment ④)"** 明列 `dsh-memory roleplay removal`，理由记录在案（"source no longer ships installRoleplayWeb；re-patching a clean artifact is a no-op"） |

运行态旁证（panorama §7，2026-09-10 15:0x）：`db_path` 锚定 `profiles/desktop/data/lingshu.db`、`integrity_ok`（10 节点/0 孤儿边）、AEIS venv 活进程、灵枢服务在装——重启验证已记录。

---

## 段② browser（dsh-browser-local）——✅ 已落地（5/6 子项）

| 子项 | 结论 | 证据 |
|---|---|---|
| tests 复活 | ✅ | `dsh-browser-local/tests/` 在位：10 个 `*.spec.ts`（server 37K/token/tools/protocol/browser-context/session-deferral/session-purge/session-workspace/index）+ `setup-invariant.ts` + `rc-legacy/` 冻结区（vitest.config.ts 显式 exclude + README 说明 revisit at 2.0.5）；`src/invariant.ts` 存在 |
| 心跳 last-pong | ✅ | `src/server.ts:132`（`lastPong: number`）、`:345`（`Date.now() - conn.lastPong > pongTimeoutMs` 超时判定）、`:366`（初始化）、`:390`（收到 pong 更新）；半开检测 → `ws.terminate()`（`:264,346`）→ `replaceConnection`（`:550`）清挂起，链路完整 |
| 白名单 `^https?://` | ✅ | `src/tools.ts` browser_navigate host 侧拦截：`if (!/^https?:\/\//i.test(url))` 拒绝 file:// / about: / chrome-extension:// 并返回 `browser_navigate refused`（2026-09-10 注释标明 defense in depth）；深度防御外层归扩展 |
| 回归测试 | ✅ | `tests/server.spec.ts:774` `"terminates a half-open slot that never answers pongs (2026-09-10 fix)"`；`tests/tools.spec.ts:32-41` 协议校验（file:///etc/passwd、about:blank、chrome-extension、javascript:、ws://、空串六例全拒） |
| purge fail-closed + loopback | ✅ | `src/session-purge.ts:65-72`：running session 拒绝（`SessionPurgeError('running')`）、sessionsRoot 读取失败抛 internal（fail-closed 不降级）；`src/index.ts:194-205` `/ext/bridge-config` loopback-only 应答 |
| 断连恢复人工验证一次 | ⏳ 转待办 | panorama §7：外源 headless 被认证围栏拦截属设计行为，已记"待办转出：用户侧视觉验项"——代码与自动化层闭环，人工场景验证存尾口 |

---

## 段③ fork UX + deepresearch——🟡 部分落地（fork 5/5；deepresearch src 4/4 产物 0/1）

### 3a. skill-center fork（dsh-skill-center-local）——✅ 完全落地

| 子项 | 结论 | 证据 |
|---|---|---|
| 其他能力组默认折叠 | ✅ | `src/client/SkillPanel.tsx:307` `collapsed = group.key === DOMAIN_OTHER && !otherExpanded`；`:314-318` toggle 按钮 + 计数徽标（`list.count`）+ aria-expanded |
| durable 状态 | ✅ | `:232-234` `otherExpanded` 初值走 `window.localStorage['dsh-skill-center:other-expanded']`，缺省 false=默认折叠，跨面板持久 |
| 折叠测试 | ✅ | `tests/panel.spec.tsx:70`（"browse view collapses the unmapped other group by default"）+ 专设 `tests/browse-collapse.spec.tsx` |
| telemetry 死文件/死键 | ✅（留痕残件） | src 零引用（grep 空）；lib 产物零命中；仅 `build/shared-client/telemetry.ts` 构建残件，已被 `.gitignore:5` 显式排除（运行面无影响）。entry.badge 死键已删（grep 全空） |
| health 字段 | ✅ | `src/routes.ts:279` 实报 `plugin:'skill-center-local'`；§7 复核 skills:265 |

### 3b. deepresearch（dsh-deepresearch-local）——src 层完全落地，产物层挂账 2.0.5

| 子项 | 结论 | 证据 |
|---|---|---|
| runnerCwd 哨兵（D7） | ✅ | `src/index.ts:94-97`：空串哨兵 + apply 期解析（2026-09-10 治理注释） |
| addEvidence 告警 | ✅ | `src/index.ts:574-579`：rejected → `logger.warn` + `criteria.warning`（不再静默吞错） |
| build/test 脚本 | ✅ | package.json scripts：`build=tsc -b`、`typecheck`、`test=vitest run`、`verify` |
| void update catch | ✅ | `src/index.ts:709` `.catch(err => logger.warn(...))` |
| lib 以 tsc 真实重建 | ❌ 挂 2.0.5 | `lib/index.js:1312-1313` 仍是 esbuild 形态（`web === void 0`、`web.fetchProviders.has("http")` 无可选链——tsc/ES2022 产物不会消除 `?.`）；阻塞实录见 upgrade-2.0.5-window-plan.md §1：dsh-client-runtime typed 版停在 0.1.1-rc.2，typert-protocol 锁 ^0.1.0-rc.8 与 0.1.5-rc.1 双实例 ESM 绑定错，`tsc -b` 不通，3 套 vitest 挂起（**未计入段③验收**）。apply-patches 第 1 条（http provider gate）按台账保留 |

**判定依据**：panorama §3-段③验收要求"deepresearch 新增默认值测试绿"，但升级窗口文档明确记载测试链未全通；lib 重建被 D3 决议顺延至 2.0.5 窗口 → 段③按"部分"计。

---

## 段④ 假健康观测 + P2 杂项——✅ 已落地（5/5 子项）

| 子项 | 结论 | 证据 |
|---|---|---|
| diagnose.sh scoped 包名修正 | ✅ | `~/.dsh/skills/dsh-dev-platform-diagnostics/scripts/diagnose.sh:53-75`（mtime 09-10 13:58）：probe 同时探测裸名 + `node_modules/@*/<name>`，依赖计数 `bare + scoped` 双统计，注释直言"old bare-name probes underreported as node_modules=无 false alarms"；§7 验收"三路证据全 有" |
| team-gui fetchRecipe 代次守卫 | ✅ | `src/client/RecipesWorkspace.tsx:167-182`：`const generation = (previewGeneration.current += 1)`，与 parse/file/reset 等其他 producer 共享代次计数器；成功/异常/finally 三处校验 generation（2026-09-10 fix 注释）；lib/client.js（16:12:20 批次）已同步，`previewGeneration` 17 处命中 |
| role 模板 note 入 i18n | ✅ | `src/client/SettingsPage.tsx:284/293/302`：`note: t('templateNoteDevelopment'/'templateNoteReview'/'templateNoteProduct')`（三套 role 模板 note 均走 i18n 键） |
| apply-patches 台账/退役 | ✅ | 头部台账三项 Retired 2026-09-10：memory roleplay、team-gui hostDescription→generation（幂等误报根除）、theme inject（原 #4 删除）；"Still active" 仅存 deepresearch http（记因 2.0.5）+ post-hoc guards；§7 验收 8/8 `[ok]` 零误报 |
| team-gui lib 重建 | ✅ | `lib/client.js`、`lib/index.js` mtime 2026-09-10 16:12:20（同秒批次，不再落后 src）；含 src 侧 `reconnectSource` 原生形态 |
| 域外事件复核 | ✅ 已恢复 | §7 记录的"dsh-agent-team-gui 移出 profile deps"（备份 `.bak-c-remove-agentteam-20260910-150024`）当前已不在位：profile package.json 依赖 `file:../../../project/Magpie-Horch/dsh-agent-team-gui-local` 在册，node_modules 安装在位 |

---

## 段⑤ 升级 2.0.5 窗口——❌ 未落地（0/3；按 D3 决议设计性挂账，待官方 2.0.5 触发）

| 子项 | 结论 | 证据 |
|---|---|---|
| §1 deepresearch 类型矩阵 | ❌（阻塞已实录） | 阻塞细节全录于 upgrade-2.0.5-window-plan.md §1（双实例 ESM 绑定错 / tsc -b 不通 / 3 套挂起）；apply-patches 第 1 条保留待 §1 完成退役 |
| §4 UI 家族迁移 | ❌（仍为 2.0.4 形态） | **brand**：workspace `src/client/brand.tsx:168-169` 与 packaging 2.0.0 产物 `dsh-root-brand-local/lib/client.js:180-181` **均仍是 2.0.4 哈希锚**（`._37cUPa_headlineText/previewBadge` + `._37cUPa_headline` 钉扎；`.q2FAPq_root` 统计条折叠版本钉在 183-204）——即 v2.0.0（基座 2.0.5-rc.1）产物里品牌仍是哈希锚形态，未走 settings/theme 官方 token 面。**theme**：仍是 `:root` 全量重定义（`src/client/index.tsx:129`）。**team-gui**：仍是文案驱动导航（`ComposerControl.tsx:285/291` textContent '小队'/'设置\|settings' 正则锚）+ `.atg-*` 类名未迁 `[data-plugin]` 作用域 |
| README 补 q2FAPq 记录 | ❌ | `dsh-root-brand-local/README.local.md:19-20` 有 `_37cUPa_*` 版本钉记录；**无 q2FAPq/StatsLine/统计条任何记载**（源码里 q2FAPq_root 已生效但 README 记录缺） |
| 已随 v2.0.0 完成的部分 | ✅（基础层） | 基座升级与全链重锚本身已完成（packaging/CHANGELOG [2.0.0]：35 补丁重锚 verify-patches-v2 34 锚点 ALL VERIFIED、冒烟 37/37、dmg+pkg 双产物）——但这属于升级工程，不含段⑤的迁移语义 |

**结论**：段⑤零迁移动作（brand/theme/team-gui 三族全部维持 2.0.4 时代形态随 2.0.5-rc.1 基线打包）；2.0.5 正式版发布日为唯一触发条件，现阶段形态符合 D3 决议，属挂账非违约。

### A 汇总

| 段 | 判定 | 子项 |
|---|---|---|
| ① 灵枢 | ✅ 已落地 | 4/4（profile mtime 尾差、内容零漂移） |
| ② browser | ✅ 已落地 | 5/6（人工断连验证转待办） |
| ③ fork+deepresearch | 🟡 部分落地 | fork 5/5；deepresearch src 4/4 + 产物 0/1（tsc 重建挂 2.0.5） |
| ④ 观测+杂项 | ✅ 已落地 | 5/5 |
| ⑤ 升级窗口 | ❌ 未落地（设计性） | 0/3 |

**子项粒度落地率：23/28（≈82%）**。未落地的 5 项中 4 项集中于段⑤（依 D3 决议）、1 项为段②人工验证尾口 + 段③ deepresearch 产物层（同属 2.0.5 窗口语义）。

---

# B · 文档债务全景（v2.0.0 发布后）

## B1 · 版本一致性 —— 🟡 1 处实债 + 1 处空档

| 文档 | 现状 | 判定 |
|---|---|---|
| README.md | `:5` "当前版本：v2.0.0（2026-09-10，DSH 基座 2.0.5 / runtime 0.1.2-rc.1）" | ✅ 最新 |
| docs/architecture.md | `:3` 标题"DSH 基座事实（**2.0.4 壳 + 0.1.2-alpha.1 技能层**）" | ❌ 全文仅此版本锚，仍写 2.0.4/alpha.1，整章未随 2.0.0 升级刷新 |
| docs/release-process.md | 纯流程 SOP，无具体版本数字（无 2.0.4/1.2.2 残留） | ✅ 无版本残留；轻债：无"当前版本锚"字段，靠人肉维持 |
| packaging/PLAN.md | `:4` 2.0.0 更新块（基座 2.0.5、35 补丁重锚 34 锚点、dmg+pkg）；`:5` 明示"本文件的 2.0.4 段落保留为历史基线" | ✅ 双段并存系有意设计，非债 |

**债**：architecture.md 单点过时（1 项）。

## B2 · ADR 覆盖度 —— ❌ 实体 2 / 索引 6 / 决策 31

实体盘点：`docs/adr/` 仅 **ADR-0005.md**（rc.1 基座迁移立项）+ **ADR-0006.md**（上游版本跟进策略）。README 索引声称 ADR-0001~0004 accepted——**全 repo（含 _attic）无对应文件、git 历史无删除记录** → 索引虚挂（版本策略/DMG 渠道/仓库范围等基础决策只剩一行索引）。

决策覆盖对照（实际拍板 vs ADR 落档）：

| 决策批次 | 数量 | 有无 ADR |
|---|---|---|
| research/04 升级计划 12 项 | 12 | 立项层由 ADR-0005 承接；12 项细分无逐项 ADR |
| skill-contract-plan 4 项（frontmatter 三键/先 26+常用/卡片+斜杠都改/契约校验） | 4 | ❌ 无 |
| research/08 优化 5 项（三批提交/pkg adhoc 签名/月度观察窗/盲区实验优先/gitignore+文档化） | 5 | 仅"月度观察窗"≈ADR-0006；余 4 项无档 |
| panorama D1–D10 | 10 | ❌ 无 |

**债**：约 **22/31 项重大决策无 ADR** + 4 条索引虚挂 + 各插件历史决策（AI全栈/万物互联）散在各插件 docs 未归并（2 项）。

## B3 · research 01–08 状态闭环 —— 🟡 2 主债 + 2 轻债

| 文档 | 现状 | 判定 |
|---|---|---|
| 04 升级计划 | "已与用户逐项讨论定稿（12 项决策）" | ✅ |
| 08 最终优化 | "定稿 · 决策：5 项已拍板" | ✅ |
| 05 rc 兼容矩阵 | **26 处 ⏳ 待验残留**（dsh-context、better-sidebar、genui、vision-router 尾列、noema、dshmarket、overseas-skills 等行大面积 ⏳；含图例 1 行） | ❌ 主债：矩阵未闭环，rc 时代"待验"在 2.0.0 已发布后仍未勾销 |
| 07 补丁清单 v2 | 文件名仍 `07-patches-manifest-v2-draft.md`；状态行"P1 执行蓝图 · 起草 · 随重锚进展逐项转正"；`:79` 清单项 `[ ] patches-manifest.md 正式转正 v2（本稿归档）` **未勾选** | ❌ 主债：34 锚点 ALL VERIFIED 已交付（PLAN.md 转述），但 07 未同步转正更名、draft 归档动作未发生 |
| 01 / 02 / 03 / 06 | 历史调研/手册；01、03 标题绑定 2.0.4/alpha.1 基线，无"基线已过时（升 2.0.5）"提示行；06 无状态行 | 🟡 轻债：无过时标注 |

## B4 · 81-Skills SKILL.md 质量抽查 —— ✅ 总体健康（2 小债）

- **抽样 10（确定性步长）**：冷邮件、公司调研、转化率优化、理想客户画像、知识萃取专家、趋势时机分析器、锚点文本分割器、AI产品设计师、多平台Listing生成器、SEO竞品分析 → **9/10 全项合规**（frontmatter 闭合、name、description 块标量、触发词、何时不用）。
- **1 例弱项**：AI产品设计师——frontmatter 结构合规（name/description/license/version/complexity 齐全）但缺显式"触发词"行（触发语义内嵌正文段落）；与 dsh-desktop-diagnostics 式坏 frontmatter（超长单行、无结构化约束、英文混杂）**不同级**，属格式偏弱。
- **全量 82 项扫描**：81 技能 SKILL.md 齐全、name/description 无硬伤；**0 例** dsh-desktop-diagnostics 式超长单行/非常规 description。
- **债**：`.doctor-backup` 目录混入无 SKILL.md（备份污染物，1 项）；1 样本触发词行缺失（1 项）。

## B5 · CHANGELOG 双轨同步 —— ❌ 根轨道停摆

- 根 `CHANGELOG.md`：最新条目 **[1.2.2] - 2026-09-09**——**缺整个 [2.0.0] 段**，与 README"当前版本 v2.0.0"直接矛盾（README 引用 "变更历史见 CHANGELOG.md" 落空）。
- `packaging/CHANGELOG.md`：✅ [2.0.0]（2026-09-10）完整（基座 2.0.4→2.0.5、35 补丁重锚 34 锚点、dmg 685M + pkg 683M、冒烟 37/37、CFBundleVersion 2.0.5-lute.2.0.0）。

**债**：双轨不同步——根轨道缺 2.0.0 条目（1 项，B 部分最重债之一）。

## B6 · 用户技能目录（~/.dsh/skills = 252）组织度 —— ❌ 无组织层

- **无索引文件**：顶层仅 `.DS_Store`；无 README / INDEX / manifest / 分组文件。
- **扁平平铺 252 目录、零分类层级**；命名 kebab-case 英文，靠首词自然聚类（amazon 13 / e-commerce 14 / product 6 / social 5 / brand 6 / dsh 3…）而非显式分类桶。
- **多源混杂同层**：官方技能（dsh-*）、81-Skills 业务镜像（中文意图域）、工具型（agent-browser、accio-mcp-cli）、本地 fork（dsh-dev-platform-diagnostics）无隔离带。
- 对照：panorama 1.1 曾以"技能 264·硬伤 0"为健康基线——数量健康 ≠ 组织健康；title 251/265（research 链路）也只在数据链层面，未沉淀为目录组织。

**债**：无分类/命名规范/索引文件（1 大项，含 3 子症状）。

---

# 总结表

| 维度 | 状态 | 落地率 / 债项 |
|---|---|---|
| A·段① 灵枢 | ✅ 已落地 | 4/4 |
| A·段② browser | ✅ 已落地 | 5/6（人工断连验证转待办） |
| A·段③ fork+deepresearch | 🟡 部分 | fork 5/5；deepresearch 产物层 0/1（挂 2.0.5） |
| A·段④ 观测+杂项 | ✅ 已落地 | 5/5 |
| A·段⑤ 升级窗口 | ❌ 未落地（设计性等待） | 0/3 |
| **A 合计** | — | **23/28（≈82%）** |
| B1 版本一致性 | 🟡 | architecture.md 过时 1 处；root CHANGELOG 停 1.2.2 |
| B2 ADR 覆盖 | ❌ | 实体 2 / 索引虚挂 4；22/31 决策无 ADR |
| B3 research 闭环 | 🟡 | 05 ⏳×26；07 未转正更名；01/02/03/06 无过时标注 |
| B4 81-Skills 质量 | ✅ | 9/10 合规；全量 0 硬伤；.doctor-backup 污染 1 |
| B5 CHANGELOG 双轨 | ❌ | 根轨道缺 [2.0.0] 段 |
| B6 skills 目录组织 | ❌ | 无索引/分类/命名规范层 |
| **B 合计** | — | **6 大类 11 条债**（含 3 条主债：根 CHANGELOG、ADR 覆盖缺口、05/07 未闭环） |

## 建议修复顺序（供上游决策，本审计不执行）

1. **P0（10 分钟级）**：根 CHANGELOG.md 补 [2.0.0] 段（直接复用 packaging/CHANGELOG 同名条目措辞）；architecture.md §1 标题换 2.0.5/0.1.2-rc.1。
2. **P1（收口动作）**：research/07 转正更名去 `-draft` + archive 草稿；research/05 的 24 个 ⏳ 在 2.0.5 正式版上集中勾销或标 N/A；brand README.local.md 补 q2FAPq/StatsLine 版本钉记录。
3. **P2（结构治理）**：补写 ADR 0007+（skill-contract 4 项、panorama D1–D10、research/08 余 4 项择要合并）；docs/adr/README 索引虚挂 4 条补档或降级为"索引即记录"；81-Skills 清理 .doctor-backup；~/.dsh/skills 建 INDEX.md + 分组约定（不强制目录搬迁）。
4. **联动 2.0.5 窗口**：段⑤ 全组 + deepresearch lib 重建 + apply-patches 第 1 条退役，一次窗口内清账。
