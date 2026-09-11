# Agent Note: 岗位头像走官方 `icon` 字段（ADR-0022）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0022](../../../adr/ADR-0022.md)。

## Problem

用户的要求是：**「给 50 个 Preset 岗位卡片加上头像，和之前的 Preset 的卡片头像保持一致性」**。

而我在调研时给出了一个错误结论，并把它当成了方案地基。

### 错误是怎么产生的

我 grep 官方客户端 bundle，用的是这个模式：

```bash
grep -o -n '.\{45\}icon.\{45\}' .../dsh-client-ui-agent-preset/lib/client.js
```

它**要求 `icon` 两侧各有 45 个字符**才算匹配。真实的渲染点长这样：

```js
row.icon ? (0, react_jsx_runtime.jsx)("img", {
  className: "bC90nG_cardAvatar",
  src: row.icon,
  alt: ""
}) : null,
```

`icon` 之后到换行只有 37 个字符——**匹配不到，被静默丢弃**。
我的 `head -60` 又把输出截断在不含它的位置。于是「grep 没找到」变成了「官方不消费」。

这个结论随后被写进了**三个地方**（都是我自己写下的）：

| 位置 | 我写下的话 |
| --- | --- |
| `scripts/role-presets/generate.mjs` 文件头 | `preset.yml 仅官方 3 字段（icon 是死数据，不写）` |
| 同文件 `icon: null` 行内注释 | `官方 UI 不消费该字段；自建矩阵面板可读，暂空` |
| `packages/surfaces/dsh-role-matrix-local/src/collect.ts` 模块注释 | `exactly three fields … Never invent extra keys here` |

并且据此向用户推荐了 D4 =「只写 manifest.json，不写 preset.yml」，用户当时采纳了。

**讽刺之处**：用户要的正是「和之前的 Preset 保持一致」，而旧 preset 的头像一直是显示的。
按我的推荐执行，才会真的造出死数据——正好是我声称要避免的东西。

### 纠正

读源码而非 grep，三层链路全部确认：

```
dsh-agent-presets/lib/index.js          readPresetMetadata()   → carry icon（第 73 行）
dsh-agent-presets/lib/index.js          remoteExportList()     → ship 到前端（第 1365 行）
dsh-client-ui-agent-preset/lib/client.js  render               → <img class="cardAvatar">（第 1070 行）
```

样式本身就是证据——它专为这套图标而写：

```css
bC90nG_cardAvatar{width:52px;height:52px;border-radius:12px;overflow:hidden;
  object-fit:contain;flex-shrink:0;
  box-shadow:0 0 0 1px color-mix(in srgb,#58B848 40%,transparent),
             0 3px 10px color-mix(in srgb,#58B848 20%,rgba(0,0,0,.25))}
```

品牌绿 `#58B848` 的描边环 + 辉光，尺寸 52×52 —— 与 `lute-brand-icons` 的绿色方形徽章严丝合缝。

另一个次生错误来源：我最初只读了 `dsh-agent-presets/lib/types/metadata.js`，
那份是**陈旧的声明副本**（`readPresetMetadata` 里确实没有 icon）；
运行时走的是 `lib/index.js` 的 bundle 版。**同名不同物，读了错的那份。**

## Decision

见 [ADR-0022](../../../adr/ADR-0022.md)。落地的机械细节：

1. **图标是数据，不是绘图。** 50 枚头像作为新 catalog 条目加进
   `~/.dsh/skills/lute-brand-icons/scripts/catalog.js`，**id 直接用 `agt-001..agt-050`**。
   造型全部由 `generator.js` 既有词汇组合（20 发型 / 7 配饰 / 10 衣领 / 46 胸口徽章），
   未新增一行绘图代码。同一责任域内徽章互不重复。
2. **生成器接线。** `generate.mjs` 新增 `loadIconIndex()`，读图标库 `assets/manifest.json`，
   因为条目 id 与 preset id 同名，是直查而非映射。查不到即 `throw` 并指路 `build.js`。
3. **面板接线。** `collect.ts` 的 `RoleCard` 增加 `icon`，从 **`preset.yml`** 读（不是侧车），
   理由是官方卡片读的也是这一份，两处结构上不可能显示不同的脸。
   `RoleMatrixPanel.tsx` 在 `cardTop` 里渲染 `<img class="cardAvatar">`，
   CSS 镜像官方那套（12px 圆角 → 见下）保证视觉同族。
4. **机器契约。** `verify-lossless.mjs` 增加 L10，断言四件事：
   `preset.yml` 有 `icon` / 是内联 SVG data URI / 与图标库和 `manifest.json` 三者同一字符串 /
   50 枚互不重样。
5. **分层纠正。** 移除 `build.js` 里硬编码的 `LIVE_MAP`（它直接改 `~/.dsh/.agent-presets`，
   既让图标库反向依赖 DSH 部署布局，又会在 preset 改名/删除后静默 no-op）。
   图标库只负责图标库；preset 接线归仓库生成器。

## Alternatives considered

**只写 `manifest.json`（我最初的推荐）。** 被否决，理由见上——它正是问题本身。

**只写 `preset.yml`。** 未采纳：两个消费方各持一份可能漂移的真相，
而 L10 的「三处同一字符串」断言正是为钉死这点而存在。

**50 枚全部新画。** 未采纳：既有词汇的组合空间足以让 50 个岗位在同一家族下清晰可辨，
新画只会引入风格漂移。

**复用旧库约 48 个语义角色图标，允许撞车。** 未采纳：3 个财务岗、2 个服务岗、2 个经营岗会撞在一起；
在 50 格的矩阵里「一人一脸」是可辨识性的下限。

## Consequences

### 验证（全部为实跑输出）

```
图标库      184 → 234 枚（新增 岗位 50），id 全局唯一
生成器      50/50 preset.yml 与 manifest.json 都带 icon，与图标库逐字符一致，50 枚互不重样
保真校验    4060 条断言全绿（L10 贡献 151 条；此前 3909）
门禁        gate quick 13/13 · gate:full 15/15
单测        dsh-role-matrix-local 30/30（新增 3 条：头像透传 / 缺头像不降级 / 跨平面责任域去重）
构建        client.js 含 KuuBZG_cardAvatar（CSS module 哈希）与 host 侧 scalars["icon"] 解析
真机数据    collectRoleMatrix 直跑真实根：50 岗位 · 4 平面 · 8 责任域 · 0 降级 · 50/50 带头像
```

**L10 经变异测试证明会咬**（不只是「绿」）：

```
抽掉 agt-001 的 icon 行      → exit 1，2 条 L10 红
换成 agt-002 的头像          → exit 1，1 条 L10 红
复原                        → exit 0，4060 全绿
```

### 顺带修掉的真实缺陷

矩阵面板标题写「四平面 × **八**责任域」，统计行却显示「**12** 个责任域」——自相矛盾。

根因：`totals.domains` 数的是（平面 × 责任域）**树节点**，而经营与组织、财务与合规、
数据与AI运行这三个域**合法地跨平面出现**（8 + 1 + 2 + 1 = 12）。

已改为数**材料定义的、去重后的责任域**（8）；树节点仍是 12，两者各自说实话。
补了回归测试（同一域跨两平面 → 树 2 节点、总数 1 域）。

### 代价

`preset.yml` 从 3 行变 4 行，单文件增大约 3.8 KB（内联 SVG base64），50 个合计约 190 KB。

### 仍未验证

- **面板头像的视觉验收**：浏览器桥本次不可用（`no browser extension is connected`），
  此项留给真人看一眼。
- **生效条件不同**：官方预设卡片的头像**无需重启**即应生效（`list()` 不做记忆化，每次从磁盘读）；
  但矩阵面板读的是插件 host 侧的 `collect.ts`，**需要重启 DSH 才生效**。

### 教训

**grep 的输出格式本身会制造假结论。**

带上下文宽度的模式（`.\{N\}…`）会静默漏掉短匹配，而「没匹配到」与「不存在」在输出上
无法区分；`head` 再一截断，剩下的就只有自信。

本次的补救纪律：**凡是要据以下结论的检索，必须用能区分二者的方式复核**——
读源码、数总数、看行号连续性。这次最终就是靠「数总数 28 却对不上」的直觉回头读源码才发现的。

同类教训在本项目已出现过一次（`cmd | head && echo OK` 掩盖退出码）。
两次的共同点都是：**用了会丢掉信息的工具，却把输出当成了完整事实。**
