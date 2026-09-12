# 分层测试报告 · paper2skills → 50 岗位 Preset 技能库

> 日期：2026-09-12　·　范围：1338 张技能卡全量
> 判据来源：`.scratch/paper2skills-preset-skills/plan.md` §5/§6、`docs/loop-protocol.md` §3

---

## 一、已验证（命令 + 真实输出）

### L1 · 结构层（全自动）

| 断言 | 结果 |
| --- | --- |
| 组装产出 SKILL.md 数 | `1338` |
| `name` 匹配 `^[a-z0-9]+(-[a-z0-9]+)*$` 且 = 目录名 | 1338 / 1338 |
| `description` ≤500 字符、单行、无换行 | 1338 / 1338（最长 343） |
| `disable-model-invocation: "true"` | 1338 / 1338 |
| SKILL.md ≤12 KB | 1338 / 1338（中位 8350 B，最大 12178 B） |
| 与既有 272 技能零同名 | 0 冲突（`p2s-` 前缀保证） |

命令：`node scripts/assemble-skills.mjs` → `组装：1338 个 SKILL.md … ✓ 组装通过`

### L1b · 安装层（全自动）

| 断言 | 结果 |
| --- | --- |
| 技能库目录数 | `272 → 1610`（`ls ~/.dsh/skills \| wc -l`） |
| `p2s-` 技能数 | 1338 |
| `verify-install.mjs` | `应装 1338  已装 1338  缺失 0  问题 0` |
| frontmatter 分类字段与 `data/classification.json` 一致 | 1327 / 1327（11 张矩阵空白卡无分类字段，跳过） |

### L2 · 分类层（全自动）

| 断言 | 结果 |
| --- | --- |
| 每卡 1–3 个 L3 | 通过（跨面多挂 269 张按设计允许） |
| L3 逐字命中 taxonomy 的 151 条 | 通过（0 处改写/新造/简称） |
| 分类覆盖 | 1338 张全部分类；1327 归位 + 11 矩阵空白 |
| L3 供给覆盖 | **134 / 151**，17 条零供给已逐条登记 |
| 缺口认领自洽 | strong 178 · adjacent 32 · **dropped 124（虚报已丢弃留档）** |

命令：`node scripts/classify-check.mjs` → `✓ 分类门禁通过`
`node scripts/merge-classification.mjs` → `L3 覆盖：134/151 有供给，空白 17 条`

### L3 · 目录可见性层

| 断言 | 结果 |
| --- | --- |
| 全局模型目录不被推高 | 1338 张全部 `disable-model-invocation: true`（脚本逐文件核验，非 true 者 0） |
| preset 目录只出现本岗 subset | `generate.mjs` 报告 `skill-subset 全部引用真实存在的技能（0 悬空）` |
| 斜杠可达 | `user-invocable: "true"` 全量，中文 `title` 保留 |

### L4 · 引用完整性层（保真）

| 断言 | 结果 |
| --- | --- |
| `verify-lossless.mjs` | **4821 条断言全绿**（L1–L10）；基线为 4060，增量来自新增的 subset 引用条目 |
| 岗位卡字节 | **142,085**（与装前完全一致，逐个 7 小节无损） |
| `pnpm run gate` | **14/14 项通过** |
| 技能引用悬空 | 0 |

### L5 · 接线效果（核心目标）

| 断言 | 结果 |
| --- | --- |
| 获得新增供给的 L3 | **134** 个，共追加 387 条技能引用 |
| 原 9 个「平台无供给」缺口 | **关闭 8 个**：依赖协调、异常冻结与恢复、抽样审计、证据复核、纠正预防措施、数据管道、容量管理、安全事件处理 |
| 仍如实标注「平台无供给」 | **1 个：利益冲突检查**（全库 0 候选，8 个源域独立判定一致） |
| 含「平台无供给」字样的 preset | 1 个（仅 agt-005 守衡） |

---

## 二、失败（已定位并修复）

| # | 失败 | 定位 | 修复 |
| --- | --- | --- | --- |
| F1 | **分类门禁 266 项失败** | 全部是同一条我写错的判据「不允许跨面多挂」；实测 1296 张卡中 264 张天然跨面（一张合规监控卡确实同时服务独立控制与业务运营） | 判据改为「主归属取首个 L3 + 全量记录 + `cross_plane` 标记」，`lib/taxonomy.js` 的 `validateClassification` 只计数不报错 |
| F2 | **缺口认领 41% 虚报** | 262 次认领中 108 次跨责任域且未挂该 L3（典型：工厂产能卡认领 `容量管理` 缺口，而矩阵指的是 AI 运行容量） | 新增 `auditGapClaims` 三档判据；虚报丢弃但保留在 `fills_gap_dropped` 供审计 |
| F3 | **红线：明文 API Key** | 全库扫描发现 `Skill-FActScore-Claim-Verification-Pipeline` 第 7 段代码模板硬编码 `sk-<32位>` + `base_url=api.deepseek.com` | 装配器新增 `redactSecrets` 闸门（8 类特征模式），装配时拦下 3 处；装后复扫 0 命中 |
| F4 | `S2-09.json` 一度 JSON 不完整 | 子任务增量写入中途被读 | 装配器改为「读取全部 adapt 产物并按 id 去重」，最终 1338 条全覆盖 |
| F5 | 组装报 `problems` 1243 项 | 首批仅 8/28 批就绪时试跑 | 非缺陷：等 28 批齐备后一次跑通，`0` 问题 |
| F6 | 包 `typecheck` 初始 3 项报错 | 测试里 `Map.values().next().value` 的 `undefined` 类型 | 改用带断言的 `anyL3Name()`，现 0 错 |

---

## 三、未覆盖 / 已知边界

| 项 | 状态 | 说明 |
| --- | --- | --- |
| **L6 · 路由与执行实测** | **已运行** | 全量静态面（1338 张）+ 40 例真实 subagent 抽样（158 次有效路由）。**正样本 top-1：keyword 97.4% / situational 89.7%；负向真实误召 5.0%**；5 次错选里 4 次是同 L3 孪生卡。判据、数字与已知边界见 [eval-report.md](eval-report.md) §1–§2 |
| **L7 · SkillOpt 轨迹优化** | **已运行；补丁被验证门拒绝并回滚** | 20 张高价值卡 × 2 题 × 双臂真实 rollout + 盲配对判分。**给卡后交付物反而更差**（holdout Δ −0.95，符号检验 p=0.084；同实验另一次 p=0.0038）。按诊断加的「参数移植纪律」条款未过 held-out 门（Δ −1.10），已回滚并逐字节复核。见 [eval-report.md](eval-report.md) §3 |
| 卡页 ④⑤ 段 | 占位 | 1324/1338 张卡的「输入数据要求」「输出结果」在源站就是占位串，正文跳过 4520 处占位段落，改由合成字段的「输入 / 输出契约」承载 |
| 28 张卡 title = id | 已知 | 源站这些卡页缺 `.skill-main-title`，标题退化为卡 id（占 2%） |
| 近重复族 | 未合并 | 同一 L3 内的近重复卡（合成控制 5、Uplift 5、共形 6 …）各成独立技能；`skill-map` 每 L3 只取排名前 3–5 进 subset，已控制住装配冗余 |
| 11 张矩阵空白卡 | 已安装未装配 | AI 伦理/ESG 披露 10 张 + 口碑管理 1 张；装在 `未归类（矩阵空白）`，不进任何 preset |
| 17 条零供给 L3 | 结构性空白 | 集中在硬件研发/工业设计（9）、B2B 商务（3）、人事/内控（2）、生产现场（1）、术语治理（1）；论文语料不产出这些能力 |

---

## 四、回滚

```sh
# 技能库回滚（1338 个 p2s- 技能一次性移除，回到 272）
rm -rf ~/.dsh/skills/p2s-*
# 全量恢复（含既有 272 技能）
tar xzf packages/capabilities/dsh-paper2skills/staging/backup/skills-pre-paper2skills.tgz -C ~/.dsh
# skill-map 回滚
cp packages/capabilities/dsh-paper2skills/staging/backup/skill-map.json.pre-paper2skills \
   scripts/role-presets/skill-map.json
# preset 重生成 + 复核
node scripts/role-presets/generate.mjs
node scripts/role-presets/verify-lossless.mjs
```
