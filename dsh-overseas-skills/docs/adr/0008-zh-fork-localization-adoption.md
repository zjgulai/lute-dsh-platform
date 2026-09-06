# ADR-0008：对照 zh-CN fork 的本地化修正采纳（三项必采 + 逐处评审）

- Context：vinvcn/mattpocock-skills-zh-CN 为上游内容刷新式本地化镜像，包含排版修正（ASCII 框图/中英混排标点）与 argument-hint 汉化，以及与上游快照的个别版本差。
- Decision：以今日上游为内容基准，选择性反向采纳 fork 修正：① 补 argument-hint（handoff/teach）；② Unicode 框图→ASCII（代码块内）；③ 中英混排标点归一（`→`→`->`、标题 `:`→`-`、行尾 `Word:`→`Word：`）；④ 版本差异逐处人工评审（diagnosing-bugs Phase 6 标题采纳 `清理 + 事后复盘`）。整体不替换为 fork 译文（防旧内容回退）。
- Consequences：normalize-zh.mjs 幂等脚本承载（fence 感知）；技能层实时生效无需重启；未来 fork 再更新时按本 ADR 流程重跑对照。
