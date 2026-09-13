# 出货边界：预设白名单 + 构建机路径改写 + 守卫看见打包后的载荷（ADR-0073）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0073](../../../adr/ADR-0073.md)。

## Problem

用户告知 `bobo-cto` 是本机自有的机器人助理智能体、不参与本项目打包。查下去发现两件事：
**它已经在出货面里**，而且**有一个仪器本该看见它、却报绿**。

### 一、出货边界 = 打包那台机器上碰巧有什么

```sh
# packaging/assemble.sh §0（改前）
cp -R "$DSH_HOME_DIR/.agent-presets/." "$SP/presets/"
```

整目录照搬，没有任何过滤。读数：

| 检查 | 读数 |
| --- | --- |
| 已发布 DMG（2.3.3，今天 16:08 装配）内 `skills-presets.tar.gz` | `presets/bobo-cto/` 在：`agent.cordis.yml`、`manifest.json`、`preset.yml`、`skills/pb-cto-01..04`、3 个插件技能 |
| 出货 `completeness.json` | `presets` = 52 条 = `agt-001..050` + `bobo-cto` + `lute-cordis`（`presets[50] = bobo-cto`） |
| staging 载荷 vs DMG 内载荷 | 哈希一致 `e0a392d8ca3d26e8…`（同一份东西，不是两处巧合） |
| 各版回看 | 2.2.0 只有 `lute-cordis`；**2.3.0 / 2.3.1 / 2.3.2 / 2.3.3 都有 `bobo-cto`** |
| 装配期冻结指纹 `.freeze-2.3.3.start` | 第 54 行记着 `/Users/lute/.dsh/.agent-presets/bobo-cto/agent.cordis.yml` 的哈希 |

`bobo-cto/` 的创建时间晚于 2.2.0 的装配时间，所以这不是「谁决定发它」——
是**那台机器上后来多了个目录**。装配脚本的注释早就写着打包源是「开发机的运行时状态」，
但防线只架在「外部产品挂载」上。

### 二、机器路径守卫看不见打包后的载荷

| 守卫扫什么 | 读数 |
| --- | --- |
| app 内嵌 profile（`$BUNDLED`） | `✓ 无新增（当前 37 条，基线 39 条）`、`exit 0` |
| 把同一版出货的 presets 解开再扫 | `exit 1`、`✗ 出货树新增 103 个含构建机路径的文件` |

103 = 100 个 `presets/agt-*/{agent.cordis.yml,manifest.json}`（岗位卡原文出处
`/Users/lute/project/AI组织变革/05-agents/roles/AGT-0NN.md` 与 manifest 的 `source_root`）
+ `bobo-cto`（`/Users/lute/project/BoBo`，含它自己的角色文件与 workspace 行）
+ `lute-cordis`。另有 13 个随包技能文档/自测报告写着构建机目录
（前缀分布：`/Users/lute/project/AI组织变革` 150、`/Users/lute/Desktop` 13、
`/Users/lute/project/Magpie-Horch` 9、`/Users/lute/.dsh` 3、`/Users/lute/Library` 1）。

两层根因：tarball 是二进制、`grep -rlFI` 一律跳过；守卫也从未被喂过 payload 路径
（调用点只有 `--root "$BUNDLED"`，而那行 tarball 还没生成）。

## Decision

见 [ADR-0073](../../../adr/ADR-0073.md)：

1. **预设出货面 = 白名单**（`select-presets.mjs` + `shipped-presets.json`）：出货面只由 `pattern`
   （岗位且数量相符）与 `allow`（显式登记 + `why`）决定；本机其余目录只有 `allow` / `exclude`
   两种合法状态；两档都没登记即中止并点名；登记了但不存在、数量不符也中止。
2. **出货副本的构建机路径改占位符**（`rewrite-build-paths.mjs`，作用于 `$STAGE/.sp`）：
   最长前缀优先的映射表；未覆盖形态响亮失败；本机原件不动。
3. **守卫学会看 tarball**（`scan-machine-paths.mjs --tarball`）：解包后用同一把尺扫，命中记
   `<tarball 名>!<成员路径>`；`assemble.sh` 在打 tar 之后对 `skills-presets.tar.gz` 再扫一次。
4. **三条判据各自配反向自测并进门禁**（含恒真桩突变与符号链接沙箱两类反向用例）。

## Alternatives considered

- **黑名单（只排除 `bobo-cto`）。** 被否：不治根因——下一个新目录同样静默出货。
- **把 `bobo-cto` 从本机移走。** 被否：本机在用；为流水线让路而搬走自己的资产，方向反了。
- **只在装配后加人工审查。** 被否：P-08——用纪律守只有机制能守住的东西。
- **改写本机原件（`~/.dsh` 下的 preset/skill）。** 被否：那台机器上这些路径有用途；
  「本机保留事实、出货副本用占位符」才是正确分工。
- **四个 payload tarball 全扫。** 部分采纳：只对未被覆盖的 `skills-presets.tar.gz` 开扫描口。
  `profile.tar.gz` ≡ 已扫的 `$BUNDLED`（同一份 §0 快照，构造保证）；`DSH Desktop.app.tar.gz` 除内嵌
  profile 外实测 0 命中；`aeis-portable.tar.gz` 是第三方 venv、由 `reloc-aeis.sh` 重定位。
- **把岗位集合也改成从材料现算。** 被否：材料根在仓库外、装配机未必有；出货意图本就该是一份
  可评审的显式清单。

## Consequences

- **正面**：
  - 「本机多一个预设」不再是静默路径：未登记即中止并点名（`S2`），突变下判据失效（`M1`）。
  - 出货面构建机路径：103 个文件 → 改写器目标 0（`R1`）；守卫盯住回潮（`T1`）。
  - 盲点被堵并**可证伪**：桩掉解包扫描后 `T1` 必须变绿（`M1`）——否则说明钉的不是它。
- **负面 / 边界**：
  - 白名单要维护：新增出货预设需一次显式表态并写理由。
  - 客户看到的是占位符（`__LUTE_MATERIAL_ROOT__/…`）：比指向别人机器的绝对路径诚实，但不可点开。
  - 本机原件与出货副本从此不逐字节相同（仅占位符所在行）——任何逐字节比对要把这步算进差异。
- **过程副产物（两条都是本轮真实踩到、并已变成判据）**：
  - **失败路径上的 `$VAR）`**：测试脚本里 `no "…（rc=$rc）"` 在 bash 3.2（macOS 自带）下会把全角
    `）` 吃进变量名 → `set -u` 当场报 `unbound variable`，于是**断言真的失败时不会报红、而是崩掉**。
    10 处全部改成 `${rc}`，并复查「`$VAR` 紧跟非 ASCII」为空。这正是 P-05 的形态。
  - **入口判定在符号链接路径下静默不干活**：`import.meta.url` 是 realpath，而 `process.argv[1]`
    保留传入形式，macOS 的 `$TMPDIR` 走 `/var → /private/var`，字符串比较判成「被 import」→
    `main()` 不执行、**退出码 0**（一个预设不挑、一处路径不改，装配却报成功）。两侧都取 realpath，
    并留 `P1` 用例把脚本复制进沙箱再跑。

## 第一次真跑：判据把**正确配置**拦住了

重切 2.3.3 的第一次装配**中止**了，而且是新机制干的：

```
[presets] ✗ 本机有 1 个未登记的预设目录，拒绝打包（它们会静默出给客户）：
    · bobo-cto
[assemble] ✗ 预设出货白名单判定失败，中止（见上）
```

这是好消息也是坏消息。好消息：机制在真机上确实会说「不」，而且点名点到了正主。
坏消息：**它在正确配置下把流水线拦住了**——本机就该留着 `bobo-cto`，它本来也不该出厂。
当时只有两态（准入 / 未登记即中止），于是「本机确有、已评审不发」这件事无处表达，
只能二选一地烂掉：要么把本机资产搬走（为出货让路，方向反了），要么把 `bobo-cto` 写进 `allow`
（正好是这次要修的事）。

所以补第三态：`exclude`（已评审「不发」，同样必须写 `why`）。**这不是把机制退回黑名单**——
出货面仍只由 `pattern` + `allow` 决定，未知目录照样中止；`exclude` 只是把「已经表过态」记下来，
免去每次装配重复问一遍。同时补两条自测钉住它：
`S6`（exclude 不发、装配照常、并逐个点名「本机保留、明确不发」）、
`S7`（exclude 登记在本机已不存在 → **告警不判红**：这一档失效方向安全，为一次本机清理弄红
整条发布流水线不值得）、`S8`（同名同时进 `allow`/`exclude` → 配置判坏）。

教训一句话：**一条只会拦住正确配置的判据，不是判据，是路障。**

## 验证读数（改后）

- `bash packaging/scripts/select-presets-test.sh` → **11 通过 0 失败**（S1–S8、P1、M1）。
- `bash packaging/scripts/rewrite-build-paths-test.sh` → **6 通过 0 失败**（R1–R4、P1、M1）。
- `bash packaging/scripts/scan-machine-paths-test.sh` → **5 通过 0 失败**（T1–T4、M1）。
- 重切 2.3.3 的装配/出货读数见下节。
