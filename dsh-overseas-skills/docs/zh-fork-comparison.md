# mattpocock-skills-zh-CN 对照分析与采纳记录（2026-09-06）

## 对照结论

fork（vinvcn/mattpocock-skills-zh-CN）为上游内容刷新式本地化镜像，四类差异：
① frontmatter 汉化（含 argument-hint）；② Unicode 框图→ASCII 修正；③ 中英混排标点统一（`:`→`：`/`-`/`—`、`→`→`->`）；④ 个别内容与上游快照的版本差。

## 决策（已确认）

- D1：采纳三项必采修正（argument-hint / ASCII 化 / 标点归一），以今日上游为基准，不整体替换 fork 译文
- D2：版本差异逐处人工评审后采纳
- D3：normalize-zh.mjs 幂等脚本一次归一 + verify 回归（技能层实时生效，无需重启）

## 采纳清单

| 修正 | 范围 | 状态 |
| --- | --- | --- |
| argument-hint 汉化 | handoff / teach 两个技能 | 已执行 |
| Unicode 框图→ASCII | codebase-design ×2、domain-modeling 树图（凡含 ┌│├─ 的代码块） | 已执行 |
| 箭头/标点归一 | 29 个：`→`→`->`、标题 `: `→` - `、句尾 `Word:`→`Word：`、`# <NN>: `→`# <NN> — ` | 已执行 |
| diagnosing-bugs Phase 6 | fork 标题 `Cleanup + post-mortem`（内容与上游一致，仅标题语义更明确） | 已采纳标题 |
