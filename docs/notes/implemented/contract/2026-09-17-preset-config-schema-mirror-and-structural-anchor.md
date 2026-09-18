# 预设行的 config 由插件自己的 schema 判；工具不得把上游的键名钉成字面量

- 日期：2026-09-17
- ADR：[ADR-0116](../../../adr/ADR-0116.md)
- 生命周期：implemented
- 类别：contract

## Problem

上游 2.0.10 把 `@deepseek-ai/dsh-persona` 的配置键从 `text` 改成**必填**的 `prefix`。实测
（插件 `0.1.5-rc.2` app-cache 副本，`Config.dict` = `prefix` / `suffix` / `complete` /
`includeRuntimeContext`）：

```
Config({ text: '…' })   → ✗ $.prefix missing required value
Config({ prefix: '…' }) → ✓ 接受
```

后果不是「人格没生效」而是**整棵 preset 树载入失败**：日志以 10MB/2min 洪泛，用户看到的只是
「输入会话，大模型没反应」。而这**三个消费面各自钉着旧值**，没有任何一个会因此变红：

**① 产物面**。2.5.0 待发布出货载荷里仍是旧键——`payload/skills-presets.tar.gz →
presets/agt-003/agent.cordis.yml:25` 写着 `    text: |-`。配置镜实测该载荷 **52 行违法**
（`agt-001`…`agt-050` + `agent-fullstack` + `lute-cordis`）。live 根（53 个预设）已由迁移修好，
**但「live 修好了」与「要发出去的东西修好了」是两件事**，当时没有任何判据在读后者。

**② 工具面：同步器把键名钉进了正则**。`sync-fullstack-persona.mjs` 的锚点是
`/^- id: persona\n  name: '@deepseek-ai\/dsh-persona'\n  config:\n    text: \|-\n/m`。
键名一改，锚点**永久失配**，`extractPersonaBody` 恒返回 `null`。判据红得是对的——门禁报的是
「抽不到 persona 行的正文 —— 锚点形状变了，本条判据已空转」，而不是静默放行。但它的红**要人工
来消**：每跟一次基座就得改一次字面量，而这次的事故正是「改了产物、忘了工具」的形状
（P-07 的变体：一条事实多个家，只改了其中一处）。

**③ 工具面：两个生成器仍写旧键**。`gen_bmg_preset.mjs`（第 52 行）与 `gen_preset.mjs`（第 45 行）
都写 `    text: >-`。它们的落点 `~/.dsh/.agent-presets/brand-marketing-growth/` 与 5 个
`overseas-*` **都不在 live 预设根里**（live = `agent-fullstack` + `agt-001..050` + `bobo-cto` +
`lute-cordis`），仍是 `maintenance-sop.md` / `iteration-runbook.md` 里写着的人工入口——重跑一次
就会把已修好的预设再写坏，而且写坏的是**旧名字的预设**，页面上未必立刻看得出来。

**一个关键负结果：键名不能从 schema 推导。** 先试过「读插件 `Config`，挑出那个 required 的
string 键当正文键」——实测不可行：`Config.dict` 把**四个键全标成 `required:true`**（`suffix` /
`complete` / `includeRuntimeContext` 都带默认值），元数据没有任何区分度。想用 schema 自动**发现**
「哪个键是人格正文」这件事做不到；schema 只能判**内容是否合法**。

## Decision

**产物面：建一面会自己变红的镜子（`scripts/gates/preset-config-schema.mjs`）。** 按**插件自己的
`Config`** 判每一行 config，三层判据：

1. `Config(obj)` 调用一次——与宿主 loader 同一个 schema、同一个调用点，因此同一个判罚；
2. **键集判据**：row 的键集 ⊆ `Config.dict` 的键集。这一层不是装饰：实测 schemastery
   **不拒未知键**（`{ prefix, bogus }` 静默通过），只调一次 schema 会漏掉「上游改了键名、旧键还在、
   新键有默认值」这一形态；
3. 取不到 schema（插件没导出 `Config`）、YAML 解析不了（`!!js` 标签）→ 记 **`unverifiable`**，
   **单独计数、绝不并进「已核实」**——「读不到」不是「都合格」。

读数用四态分母且必须守恒：`discovered = ok + failed + unverifiable + notApplicable`；射程 =
live 根 + **待发布出货载荷**（已打 tag 的版本按 ADR-0067 排除，否则判据会对冻结产物长期判红，
而长期判红的下场是被关掉）。接线两处：`scripts/gate.mjs`（开发期常跑）+ `packaging/assemble.sh`
（在 `tar` 之前判**出货副本**，让坏字节在成为载荷之前就红）。

**工具面：锚点认结构，不认键名。** `sync-fullstack-persona.mjs` 改为
`- id: persona` → `  name: '<pkg>'` → `  config:` → 恰好**一个**字面块标量键：键名任意、写回时
原样保留、不重命名；`0` 个（内联标量）或 `≥2` 个（`prefix` 与 `suffix` 同时是块标量）都**响亮失败**
——猜错键会把人格写进 `suffix`，而读出来的仍是旧正文，两边都不报错，只有行为变了。键名的家只有
一处：插件自己的 `Config`。键名写错的罚单由配置镜开（`$.prefix missing required value`），
同步器只负责「把这行的正文读出来 / 写回去」。两个生成器改 `text:` → `prefix:`。

## Alternatives considered

- **把正则里的 `text` 换成 `prefix`**：换个新字面量继续钉。下次改名的复发概率不降，而且**这次事故
  正是这么来的**。否。
- **从插件 schema 推导正文键**（读 `Config.dict` 挑 required 的 string 键）：实测不可行——四个键
  全 `required:true`，无区分度。否（并把这个负结果写进这里，免得下一个人再试一遍）。
- **让同步器容忍 `text|prefix` 两种键名**（`verify-lossless.mjs` 现在的做法）：读侧容忍可以应急，
  但**容忍集合本身就是第二份会过期的事实**，而且写侧一旦两个键同时存在就得猜——猜错就写进错键。
  否（读侧容忍保留在 `verify-lossless.mjs`，本轮不收口，见后果）。
- **只在 `assemble.sh` 里判、不做成门禁项**：出货前才红，开发期完全看不见。否。
- **给 2.5.0 的 52 条开豁免**：它红的就是「即将发出去的字节是坏的」这件事本身，豁免等于把它发出去
  （ADR-0014：豁免只减不增、到期即拒绝）。否。

## Consequences

**正面**：键名一改，**产物面**有配置镜红、**工具面**同步器不再空转（人格层判据从「空转」回到
「逐字复核」：`persona 同源=是 4224 字符`）。`pnpm run gate` 84/88 → **85/88**，
`agent-fullstack` 与 `agent-fullstack-selftest` 两项由红转绿；反向自测补了 M11（键名换 `preamble`
必须照读照写、且不得擅自改回 `prefix`）与 M12（`|` / `|-` 是格式字节不是事实），
`scripts/gates/agent-fullstack.test.mjs` 22/22。

**反面与残余**（逐条显式）：

- **本轮门禁仍是红的，而且是设计内的红**：`preset-config-schema` 判 `staging/2.5.0` 出货载荷 52 行
  违法。它只能由 **r8 重切**（预设经修好的 `generate.mjs` 重生）清除，**不许豁免**；r8 装配成功并
  验收后**退役 `packaging/staging/2.5.0`**，否则这条判据会永久红（2026-09-17 用户决定）。
- **未核实面 213 行**：`@deepseek-ai/dsh-plan-mode`×105、`dsh-skill-subset`×103 没导出 `Config`；
  `!!js` 表达式×5 静态判不了求值结果。读数点名，**未核实 ≠ 合格**。
- **键集判据只适用于我们生成器的 YAML 形态**；非 package 行×315、无 config 行×1465 归
  `notApplicable`（不是「通过」）。
- **`verify-lossless.mjs` 仍容忍 `text|prefix` 两种键名**（读侧），尚未与「键名只有一个家」收口。
- **两个 legacy 生成器的落点已不在 live 预设根**（`brand-marketing-growth` / `overseas-*`）：
  本轮只保证它们**不再产出非法形状**，是否退役未决——留着它们，SOP 上就还有一条指向已消失产物的
  命令（P-09 的形态）。
- **`backup/intake-2026-09/presets-before-p3/` 里 50 份历史快照仍是 `text: |-`**：历史记录有意不改
  （改它等于篡改历史），且不在任何判据射程内。
- **仪器坑（写给下一个用 `gate.mjs` 的人）**：配置镜交给门禁的 `--json` 载荷必须**有界**——
  `runScript` 只保留子进程输出的**尾部 4000 字节**，一份 6KB 的 JSON 会被切掉头部，门禁会读成
  「判据没有产出读数」并判红。判据本身没错，是载荷超限。
- **另两面镜子**（资源路径镜升级射程守基座布局类、格式镜注册表守扩展点类）排在 **r8 验收之后**
  作为第一批机制工作（2026-09-17 用户决定）。

**验证**：`node scripts/gates/preset-config-schema.mjs`（红：52 行违法，全部落在出货载荷）、
`node --test scripts/gates/preset-config-schema.test.mjs`（11/11）、
`node packages/capabilities/dsh-overseas-skills/scripts/verify-agent-fullstack.mjs`（问题 0）、
`node --test scripts/gates/agent-fullstack.test.mjs`（22/22）、`pnpm run gate`（85/88，2 红：
本条设计内的红 + 出货载荷同源）。
