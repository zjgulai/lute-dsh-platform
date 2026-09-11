# 路由迭代手册（validation-gated runbook）

> SkillOpt 式闭环：**改技能文案 → 跑基准 → 数据说话 → 通过才接受**。
> 数据层修改（description / whenToUse / summaryZh / 边界）经 watcher 即时生效，无需重启。

## 工作循环（每次技能文案修改后）

```bash
cd /Users/lute/project/Magpie-Horch/dsh-overseas-skills

# 1. 词法快筛（秒级快门；语义型失败可预期，仅作粗筛）
node scripts/route_bench.mjs

# 2. LLM 档评测（真实路由精度；7 组并行子代理，产出 eval/llm-picks.jsonl 后聚合）
node scripts/route_bench_llm.mjs
```

- **门禁**：LLM 档严格命中 < 95% → 不通过；本轮新增失败用例即回归，必须修复或回滚文案。
- **留痕**：每轮结果自动写 `eval/runs/<时间戳>-{lexical,llm}.json`，聚合脚本自动与上一轮 diff
  （输出 REGRESS / FIXED 清单）。

## 失败用例诊断 → 修改点对照

| 失败形态 | 诊断 | 修改点 |
|---|---|---|
| 选错同簇技能（如期望 A 实选 B） | A/B 边界声明不够尖锐或缺失 | 收紧 A 与 B 的 description 尾部「边界」与 whenToUse |
| 选到无关分类技能 | 期望技能的关键触发词不在 description | 在 description 补入业务触发词（如「小红书/种草」） |
| 无返回（评估器侧） | 子代理回显 query 失真 | 聚合脚本已做归一化（给/帮、空白）；仍缺则查 picks 行 |
| 边界问句大面积错 | 跨界问句的「第一诉求」不清晰 | 用例维持困难档，但对期望技能补「优先」提示词 |

## 修改规范（与基座兼容）

1. 只改 SKILL.md 的 `description` / `whenToUse`（frontmatter 值保持 JSON 引号化；含转义引号时必须整体重写）。
2. description 总长 ≤ 500（模型目录截断线）；「边界」与「【需X】」标记计入长度。
3. 改完先跑 `node scripts/route_bench.mjs`（词法秒查），再跑 LLM 档。
4. 批量改动用 `scripts/optimize_data.py`（幂等）维护；manifest/summaryZh 变更走 `apply_summaries.py`。

## 当前基线

- 基准：`eval/routing-benchmark.json`（v2，70 条：49 basic + 21 boundary，含英文与簇内负例）。
- 词法基线：见 `eval/runs/*-lexical.json`（最新）。
- LLM 基线：见 `eval/runs/*-llm.json`（最新；首轮为 baseline-70 参照）。


---

## 81-Skills 增量与迭代（2026-09-05 追加）

### 4 个加密技能补齐（上市策略 / 市场可行性审计 / 竞品情报 / 电商季度战略）
1. 用户把明文 SKILL.md 放回 `~/project/Magpie-Horch/81-Skills/<中文名>/`
2. `bash scripts/pipeline.sh --import`（转换+安装+头像+目录+同步+lint 一键）
3. 重启 DSH Desktop → `bash scripts/verify_p7.sh`
4. 预设白名单已含 4 名，无需改动（补齐后自动进入子集）

### 图标再生
`python3 scripts/assign_lute_icons.py`（依赖 lute-brand-icons 技能资产；改角色映射就改本脚本 CAT_ASSIGN/SKILL_ASSIGN）

### 预设再生成
`node scripts/gen_bmg_preset.mjs`（白名单从 81-mapping.json 生成，icon 保留）

### 静态闸门
`node scripts/verify_static.mjs`（名字唯一 / 图标覆盖 / 悬空引用）

### 已定决策（2026-09-05）
- I3 子集开关语义：保持现状（预设内全部可调用），O1 默认关数据下改读文件标志会反向禁用 12 预设技能
- 存量 123 技能：单文件自包含（不补子目录）；摘要保留策展中文，16 个工具型空行用占位文案
- 空 assets 目录 3 个与 performance-tracking 缺 references 为源侧缺口，记录不修
