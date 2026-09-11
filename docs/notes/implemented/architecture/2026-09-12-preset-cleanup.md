# Agent Note: Preset 清理与默认值迁移（ADR-0023）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0023](../../../adr/ADR-0023.md)。

## Problem

用户要求：**「50 个新加入的 Preset，和系统自带的 4 个 Preset，其他的卸载删除（还有没有卸载清理干净的）」**。

清理前用户预设根 56 项，除 50 个 `agt-*` 外还有 6 个历史遗留 preset 与一个 `.DS_Store`。

清理本身是一条命令。**难点全在连带影响上**，而且其中一条是「不处理就会让整个部署出现地雷」：

```
~/.dsh/settings.yaml:90   agent-presets.default: ai-product-developer   ← 正要删掉的那个
```

`dsh-agent-presets` 对 `defaultId` 的原文：*"The preset id mounted when a caller names none.
Missing at mount time fails loud."*

第二条：首条会话记录 `{"type":"session",…,"agentPreset":"<id>"}` 是 deep-frozen 的创建事实，
恢复走 `resolve(id)`，**没有回退**。删掉被引用的 preset = 那些会话永久打不开。

本项目 2026-09-11 已经在这个坑里栽过一次（删 15 个 preset，28 个会话 resume 失败，
报 `RemoteError: agent-presets: preset "ai-product-developer" not found`）。
本次是第二次面对同一结构——区别是这次有预检工具。

## Decision

见 [ADR-0023](../../../adr/ADR-0023.md)。执行顺序与证据：

### 1. 先迁移默认值（在删除之前）

```diff
  agent-presets:
-   default: ai-product-developer
+   default: cordis
```

先备份，再改，再 diff 验证**恰好一行变化**：

```
$ diff settings.yaml.bak-pre-default-migration-20260912004811 settings.yaml
90c90
<   default: ai-product-developer
---
>   default: cordis
diff exit=1
```

`cordis` 是 shipped preset（`presets/cordis/`，`name: 创造模式`，`order: 4`），
在 `user=50 shipped=4 可用合计 54` 之内，可解析。

### 2. 归档完整性门禁（在删除之前）

```
✓ ai-product-developer    文件数=14  逐字节一致
✓ brand-marketing-growth  文件数=3   逐字节一致
✓ dsh-motion-deck-studio  文件数=7   逐字节一致
✓ llm-wiki-fullstack      文件数=6   逐字节一致
✓ overseas-finance        文件数=3   逐字节一致
✓ product-video-director  文件数=26  逐字节一致
归档完整性 fail=0
```

### 3. 引用面预检（门禁确实拦住了）

```
$ node scripts/role-presets/scan-session-refs.mjs --would-remove ai-product-developer,... 
  ✗ ai-product-developer     17 会话 · 192341 条记录 · 304 条用户消息 · 48.8MB
  ✗ dsh-motion-deck-studio    7 会话 ·  48593 条记录 ·  67 条用户消息 · 10.9MB
  ✗ overseas-finance          5 会话 ·  65855 条记录 · 168 条用户消息 · 16.7MB
  ✗ llm-wiki-fullstack        1 会话 ·  29373 条记录 · 108 条用户消息 ·  7.6MB
  ✗ brand-marketing-growth    1 会话 ·  32733 条记录 ·  63 条用户消息 ·  8.1MB
  ✗ product-video-director    1 会话 · 170788 条记录 · 571 条用户消息 · 43.7MB
✗ 门禁未过：该删除会打断既有会话
SCAN_EXIT=1
```

**用户在看到这些数字后明确选择「删，接受会话损失」。** 这条决策因此是有据的。

### 4. 删除与清点

```
删除前 58 项（含 . 与 .. 与 .DS_Store）
✓ 已删 6 个目录 + .DS_Store
删除后：总项 50 · agt-* 50 · 非 agt 0 · 隐藏项 0 · 001–050 连续无缺
```

## Alternatives considered

**保留这 6 个。** 用户已获知「只在选择器里多 6 项、28+ 会话保持可恢复」这个权衡，选择不保留。

**把 `--would-remove` 接进 `pnpm run gate`。** 被否决。
gate 校验仓库产物；会话引用面是**部署态**事实，随本机会话历史变化。
把它塞进去会让 gate 因与本仓库无关的状态而红——门禁一旦会为无关原因变红，就会被绕过。
它属于**删除操作前的操作纪律**。

**不跑预检直接删。** 被否决，那正是 2026-09-11 那次的做法。

## Consequences

### 我先前的一个错误论断，被实测推翻

我在给用户的方案里写过：**「34 个无 `agentPreset` 的会话会用默认 preset」**。
如果这是真的，删默认 preset 的影响面就不止「未来新会话」，还包括这 34 个存量会话。

逐会话解首帧读 `origin` 实测：

```
带 agentPreset: 237
无 agentPreset: 34
=== 无 agentPreset 的 34 个会话 · origin 分布 ===
{ "subagent": 34 }
```

**34/34 全部是 `origin: "subagent"`。** subagent 走父方 `composeFrom` 组合，
**根本不读 `agent-presets.default`**。现存 271 个会话中没有任何一个会解析默认值。

**这个错误论断的源头是我自己的工具。** 扫描器那一行写的是：

```js
line(`  扫描：${scanned} 个会话 · 带 agentPreset ${withPreset} · 用默认 ${scanned - withPreset}`)
```

它把「记录里没有 agentPreset 字段」直接叫成了「用默认」——一个未见得成立的推断，
被写成了报告事实。我读了它的输出，就把推断当成了实测。

已修正：`session-refs.mjs` 采集首条的 `origin`，扫描器改为如实报告
`无 agentPreset 34（subagent 34）`。现在的输出是**测出来的**，不是**推断出来的**。

（同类教训本日第二次：先有 grep 上下文宽度截断造成「官方不消费 icon」的假结论，
再有扫描器措辞造成「34 个会话用默认」的假事实。共同点是**把工具的省略当成了世界的全部**。）

### 仍未验证

`cordis` 作为默认值，在**新建一个不指定 preset 的会话**这条真实路径上未被端到端跑过。
已验证的只有：它存在于 shipped 根、`preset.yml` 可读、可被 roster 解析
（`user=50 shipped=4 可用合计 54`）。这条留待真人开新会话时自然覆盖。
