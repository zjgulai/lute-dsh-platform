---
title: 1338 张 p2s 卡的缺陷在流水线的三行里，出处按档位如实渲染
doc_type: decision
module: capabilities/dsh-paper2skills
topic: corpus-rebuild
status: implemented
created: 2026-09-12
updated: 2026-09-12
owner: self
source: human+ai
adr: ADR-0047
---

# p2s 语料重建

对应 [ADR-0047](../../../adr/ADR-0047.md)。本文只记**怎么发现的、怎么验的**，
判据与取舍在 ADR，不在此复述。

## Problem

用户要求给出「1338 张 p2s 技能的优化方案」。在写任何方案之前先做只读体检，
量出来的东西和预期完全不同：**这不像 1338 张卡有 1338 个质量问题，而像 1 条流水线有 3 个 bug。**

三条线索各自独立指向同一结论：

1. 源站 HTML 里代码是 4 空格缩进、`<pre><code>` 完好；`generated/cards.json` 里
   1338 张卡的最大缩进**无一例外等于 1**（`=0` 的 0 张、`>1` 的 0 张）。落点只能是 `strip()`。
2. 已装库里只剩 8 张 ⑧ 有真内容，恰好是唯一 ≥40 字的。规则就是 `<40`，没有第二种解释。
3. 把 `cards.json` 按 `isPlaceholder` 的判据重算：真占位 3,074、真内容 6,190、**误判 1,440**。

## Decision

见 ADR-0047。要点：改三行 + 补回归测试 + 重跑流水线；出处按六档渲染，不做无差别还原。

## Alternatives considered

见 ADR-0047「备选方案」：只修机器（甲）、无差别还原 1,041 个 ID、收缩供给（丙）、逐张手改。

## Consequences

见 ADR-0047「影响」。此处只留**取证命令与真实输出**，便于他人重放。

### 红测 → 绿测（证明测试真能拦住那两个 bug）

把旧实现用开关注入回去再跑，**6/19 砰红**，正是冲着 A/C 两个 bug 去的 6 条：

```
$ P2S_OLD_STRIP=1 P2S_OLD_PLACEHOLDER=1 node --test test/html-text.spec.mjs test/card-render.spec.mjs
✖ isPlaceholder：短的真内容一律不是占位（回归：<40 字规则）
✖ strip：<pre> 内的缩进逐字保留
✖ strip：<pre> 内的单引号实体解成真单引号（回归：&#x27;）
✖ strip：<pre> 内的空行不被并成两行
✖ strip：多个 <pre> 块各自保真，且按原顺序放回
✖ strip：里的比较符与泛型不被当成标签吃掉
ℹ tests 19   ℹ pass 13   ℹ fail 6
```

拆掉开关后：

```
$ node --test test/*.spec.mjs
ℹ tests 35   ℹ pass 35   ℹ fail 0
```

### 重建（抽取 → 合并 → 装配 → 安装）

```
$ node scripts/extract-cards.mjs        # 1338 张，卡数断言通过
$ node scripts/merge-classification.mjs # 1338 条，仅 5 处 title 变化，分类字段一字未动
$ node scripts/assemble-skills.mjs
组装：1338 个 SKILL.md
代码移入 references/：5　·　跳过的占位段落：3084　·　脱敏：3
✓ 组装通过
$ node scripts/import-paper2skills.mjs --dry
staging 技能：1338  新建 0  覆盖 1338  矩阵空白（不装配）11  问题 0
$ node scripts/import-paper2skills.mjs
Installed: 1338 → /Users/lute/.dsh/skills
$ node scripts/verify-install.mjs
应装 1338  已装 1338  缺失 0  问题 0　✓ 安装校验通过
```

### 装后逐项读数（rebuild 前 → 后）

| 指标 | 旧 | 新 |
| --- | ---: | ---: |
| 假占位句出现次数 | 4,514 | **0** |
| ⑦ 代码最大缩进（中位） | 1.0 | **12.0** |
| ⑦ 缩进 > 1 的卡 | 0 | **1,246** |
| 残留 HTML 实体的卡 | 699 | **0** |
| ⑦ 有 ```python 围栏的卡 | 0 | **1,274** |
| ⑦ 代码可 `ast.parse` | 105（8%） | **818（64%）** |
| ⑧ 有 arXiv ID 的卡 | 8 | 272 已核验 + 117 可能对应 + 143 待人工 |
| 总字节 | 11,062,047 | 11,450,842 |

### 461 张代码仍不可解析 —— 不是本流水线的责任

抽取结果与源站 `<pre>` **逐字节相同 1,283/1,283、零例外**；源站卡页把代码截断在
**60 物理行**（965 张正好 60 行），461 张在这 60 行里断了句。

```
$ python3 …  # 代码物理行数分布
[(60, 965), (59, 160), (58, 26), (5, 20), (2, 8), …]   最大 60
```

> 这个归因本身是踩过坑的：第一次算的是「非空行」，得到最大 57 行，于是「60 行截断」的
> 假设被自己推翻。改用**物理行**才看见 60 这个硬上界。

### 出处分档的判据自测

```
$ python3 .scratch/p2s-optimize/provenance-grade.py
VERIFIED 272 · LIKELY 117 · UNDECIDABLE 143 · MISMATCH 515 · NOT_FOUND 2 · NO_ID 289
flags: shared 272 · id_vs_named_conflict 176 · fake_pattern 81 · not_found 2
```

真值取自 `paper2skills-vault/` 41 张过了逐字引文门禁的 `paper_id`：判对 38、假阴性 3（7%）。
随机 12 张 MISMATCH 逐个人判 **12/12 判对**（全部指向物理、天文、路由协议等无关论文）；
随机 8 张 VERIFIED **8/8 判对**（KARMA / iText2KG / Speculative RAG / Argos / DARA 逐个精准命中）。

### 门禁

```
$ pnpm run gate     → ok 15/15 项通过（mode=quick）
$ pnpm run verify:provenance → ✓ provenance 一致（1338 张）
```

## 未做

- 未把 ⑦ 段代码按 `docs/adaptation-spec.md` 默认外移到 `references/<slug>.py`（实现是超 12 KB 才外移，
  当前仅 5 张命中）—— 这是一处实现与规格的落差，见 ADR-0047「后续」。
- 未处理 vault（146 张精选）与批量卡（1338 张）的 93 张重叠。
- 未合并近重复族（合成控制 5 / Uplift 5 / 共形 6）。
- 未提交（本包整体仍是 untracked）。
