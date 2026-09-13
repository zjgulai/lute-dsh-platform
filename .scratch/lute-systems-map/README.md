---
title: 外部系统卡片（systems.html → 新应用「业务系统」分区）· 工作目录索引
status: 已完成（2026-09-13）；本目录只放**方案与证据**，任何结论的家都不在这里
---

# 本目录是什么

一件工作：把 `https://lute-tlz-dddd.top/systems.html` 的 31 个系统卡片，按 **50 个岗位角色**
分类收进 DSH 桌面端「新应用」抽屉的第二分区。

**本目录不是事实的家。** 三个结论各有归属，改结论请改那里，不要改这里：

| 结论 | 家在 |
| --- | --- |
| 为什么这么决定、被取代的是什么 | [ADR-0062](../../docs/adr/ADR-0062.md)（并部分修订 [ADR-0045](../../docs/adr/ADR-0045.md)） |
| 怎么做的、实测读数、还剩哪些开放项 | [Note](../../docs/notes/implemented/surface/2026-09-13-newapp-systems-section.md) |
| 目录本身长什么样 | `packages/surfaces/dsh-newapp-local/src/catalog/` |

本目录里的 `plan.md` 是**施工时的方案与执行 TODO**（含取证方式与裁决记录），
已标注 `implemented`；它是过程档案，不是当前契约。

## 文件清单

| 文件 | 是什么 | 它是哪条断言的证据 |
| --- | --- | --- |
| `plan.md` | 方案 + 执行 TODO（P0–P5 全部落地）+ 风险表 + 裁决记录 | 「这件事被规划过、每个分叉当时怎么裁的」 |
| `design/light.png` · `design/dark.png` | 真 Chrome 截的**整页**（预览页，1280 宽，fullPage） | 「双主题下卡片的排版都成立」——分组、多列网格、行内卡底对齐 |
| `design/light-card.png` · `design/dark-card.png` | 同一页里**单张卡**的特写（`scale: css`） | **品牌一致性主验收图**：品牌绿 chip、圆角、字色层级、技术标签 |
| `acceptance/newapp-systems-live.json` | `accept:newapp-systems` 的机读输出（stages A/D，34 条，`passed: 34`） | 「产物里真有这两条路由 / catalog 真被内联进 `lib/index.js` / 栅栏包住了会开浏览器的动作路由 / `open-system` 只认那 31 个 slug」 |

## 这三样各自**不能**证明什么（读之前必读）

- **截图不是抽屉实况。** 预览页是 `tests/design-preview.spec.tsx` 渲染的**真组件**，但取样是
  **11 张卡 / 8 组**的夹具，不是完整的 31 张 / 14 组。它证明「卡长对了」，**不证明**「抽屉里
  31 张都在」。后者由 `accept:newapp-systems` 的实况 curl 读数负责。
- **实况探针不打成功路径。** 打它会在你机器上真的弹浏览器，所以它只打拒绝路径（未知 slug
  404、只送 `url` 不送 `slug` 400、非对象 body 400）。**「探针全绿」≠「点开能开」**——
  点一次是人的验收项。
- **`exit 3` 不是绿。** 退出码三态：`0` 全绿 / `1` 有真失败 / `3` = A–C 全绿但 D 因宿主未
  重启**无法判决**。本目录留存的 JSON 是重启后的终态（`passed: 34`、`restartRequired: false`）。

## 怎么重新生成

```bash
# 1) 巡检读数（写 src/catalog/reachability.json）—— 无需凭据
cd packages/surfaces/dsh-newapp-local && pnpm run probe:systems

# 2) 视觉证据：先生成预览页，再用真 Chrome 截图（两步不能省，探针会拒绝在缺页时运行）
npx vitest run tests/design-preview.spec.tsx
pnpm run probe:design -- --out ../../.scratch/lute-systems-map/design

# 3) 实况验收（需宿主已重启且 catalog 已装配到 profile）
cd ../../.. && pnpm run accept:newapp-systems
```

`probe:design` 默认写到 `node_modules/.cache/design-probe`（缓存位，可弃）；
只有带 `--out` 才会落到本目录——**本目录的图是明确指定路径的产物，不是默认行为的残留**。

`sync:systems`（重新抓取 catalog）**需要凭据** `LUTE_PORTAL_EMAIL` / `LUTE_PORTAL_PASSWORD`
（只从 DSH 凭据服务或环境读，脚本不写凭据）。本机当前未配置，直接跑是响亮的 `exit 2`。
详见 Note 的开放项 T0.3。

## 出处

`design/*.png` 于 2026-09-13 12:20 由**当时的构建**重新生成，与 11:44 那一版**逐字节同尺寸**——
即构建未改变渲染，图与当前产物一致。任何一版别的页面产生的图都不得当作本目录的证据。
