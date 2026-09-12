# Loop 协议 · 全量技能安装

> 目标与完成判据见 `.scratch/paper2skills-preset-skills/plan.md` §5。
> 状态文件：`.scratch/paper2skills-preset-skills/state.json`。

---

## 1. 轮次状态机

```
              ┌───────────────────────────────────────────────┐
              │  Round N                                      │
   pick ──────┤  1. 读 state.json，取下一批 pending 批次        │
              │  2. 派 subagent（分类 / 合成），每批 ≤48 张      │
              │  3. 合并产物 → 组装 staging/                   │
              │  4. 跑门禁 classify-check + assemble + verify  │
              │  5. 更新 state.json（done / failed / 计数）     │
              └───────────────────────────────────────────────┘
                              │
              门禁红 ─────────┴───────── 门禁绿 → 下一批
                 │                              │
              停轮并报告                    全部批次 done
              （不静默换方案）                    │
                                    S3 装配：install + 接线 + 全量验证
```

## 2. 三阶段

| 阶段 | 内容 | 批次 | 产物 |
| --- | --- | ---: | --- |
| **S1 分类** | 25 个源域 → L1/L2/L3（1–3 个，按相关度降序） | 25 | `data/classification.json` |
| **S2 适配** | S2a 子任务出「判断类字段」→ S2b 脚本组装 SKILL.md | 28 | `staging/<L2>/<slug>/SKILL.md` |
| **S3 装配** | 安装 + manifest + skill-map + generate + verify | 1 | `~/.dsh/skills/p2s-*` |

**为什么 S2 拆成 a/b 两步**：卡页八段是既成事实，照抄即可（脚本干）；`description` / 触发词 / 执行步骤 / 边界需要判断（模型干）。脚本保证 frontmatter 合法、字节不超限、章节序固定、分类字段与 `classification.json` 逐字一致——**子任务不碰这些机械判据**，因此产出不可能因格式问题报废。

## 3. 每轮门禁（红即停轮，不进入下一批）

| 门禁 | 命令 | 断言 |
| --- | --- | --- |
| 分类门禁 | `node scripts/classify-check.mjs` | 逐域 id 同序同集；每卡 1–3 个 L3；L3 逐字命中 151 条；空 l3 必带 note；`fills_gap` 在缺口白名单内；全库 1338 张零遗漏零重复 |
| 组装门禁 | `node scripts/assemble-skills.mjs` | `description` ≤500 且无换行；`steps` 3–7；`boundaries` ≥2；分类字段照抄；SKILL.md ≤12 KB；合成字段缺失即 exit 1 |
| 安装门禁 | `node scripts/verify-install.mjs` | 目录名 = frontmatter `name`；`disable-model-invocation: true` 齐备；分类字段与 `classification.json` 一致；无本包不认识的 `p2s-*` 目录 |
| 保真门禁 | `node scripts/role-presets/verify-lossless.mjs` | 4060 条断言不得回退 |
| 仓库门禁 | `pnpm run gate` | 14 项契约校验 |

## 4. 停轮条件

1. 门禁红且无法当场修复 → 停轮、写 `docs/loop-halt-<round>.md`、报告。
2. 累计 `failed` 批次 ≥3 → 停轮复核方案。
3. 全部批次 done → 进入 S3，完成后结项。

## 5. 现场记录（本轮）

| 轮 | 动作 | 结果 |
| ---: | --- | --- |
| 1 | 语料物化 + 分类底座 + 包骨架 | `playbook/` 1339 页物化（0 加密）；`taxonomy.json` 4/8/151；gate 14/14 绿 |
| 1 | S1 派发 25 个源域 | 24 域先回，第 25 域（07-NLP-VOC）后到 |
| 1 | **门禁抓出判据错误** | 266 项失败全是同一条「不允许跨面多挂」——判据错，数据对。改为「主归属取首个 L3 + 全量记录 + `cross_plane` 标记」，门禁转绿 | 
| 1 | **缺口认领虚报 41%** | 262 次认领中 108 次跨域且未挂该 L3。补 `auditGapClaims` 三档判据（strong/adjacent/dropped），最终 strong 178 · adjacent 32 · dropped 124 |
| 2 | S2 派发 28 批 | 见 `state.json` |

**这两次纠错是 Loop 的价值所在**：判据先按假设写下，用 1338 张真实数据一撞就暴露；改判据而不是改数据。
