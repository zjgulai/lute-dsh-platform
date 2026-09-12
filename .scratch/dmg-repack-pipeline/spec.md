---
title: dmg 打包链修复与重出包（adhoc · 不出 pkg）
status: ready-for-agent
test_seam: ① packaging/verify-patches-v2.sh（默认参数）的退出码 ② packaging/scripts/smoke-test.sh <payload> 的退出码与 FAIL 行 ③ 产出 dmg 内载荷 app 的 codesign --verify --deep --strict 退出码
---

# dmg 打包链修复与重出包 产品规格

> 本规格来自 2026-09-11 的 grill-me 决策树（含三轮事实更正）与用户确认的共同理解摘要（修订版）。
> 只综合已确认事实与工具核验结果，不重新访谈。
> 关键约束由用户拍板：**不使用 Developer ID、不公证；本次不出 pkg，只发 dmg。**

## Problem Statement

要重新出桌面端 dmg，但三处事实经实测后与预期不同，必须先说清哪些是真问题、哪些不是：

**不是问题的（实测排除）**

- **签名链是好的**：`assemble.sh:223-226` 在注入 `dsh-profile` 与应用补丁**之后**执行
  `codesign --force --deep --sign -` 并立即 `codesign --verify --deep --strict` 自验（注释写明
  「内容已改写 + 注入 dsh-profile，原签名失效，打包前重签」）。`staging/2.1.0` 载荷里的 app 实测
  `codesign --verify --deep --strict` **退出码 0**，补丁锚点（cordis clamp）在位。
- **安装态的签名无效是开发机现象**：`/Applications/DSH Desktop.app` 的 seal 破损点是
  `build/tray-icon*.png`、`build/app-icon*.png`、`@deepseek-ai/dsh-client-ui-conversation/lib/client.js`、
  `@deepseek-ai/dsh-web-frontend/dist/assets/*.js` 与品牌图标重打包留下的孤儿
  `icon.icns.250-20260910-235740`——都是在开发机上对已装 app 反复迭代的结果，与打包链无关。
- **载荷的依赖解析是健全的**：载荷 profile 里 18 条 `file:./vendor/<name>` 依赖
  （隔离冒烟 home 实测）**全部解析成功，缺失 0**。

**真正的问题（两个，都是小改）**

1. **补丁校验默认命令失败**（`packaging/verify-patches-v2.sh:5`）：
   默认 `DSH_APP=…/packaging/staging/2.0.0/app/DSH Desktop.app`，而 `packaging/staging/2.0.0/` **已被删除**
   （现存 `2.0.1`、`2.1.0`）。于是默认调用产出 10 条 `MISSING … (target absent)` 与
   `PATCHES v2 DRIFT`，**退出码 1**。脚本本身支持 `DSH_APP` 覆盖——指对树即 `PATCHES v2 ALL VERIFIED`（退出码 0），
   所以这不是补丁漂移，是**默认路径失效**。
2. **`completeness.json` 生成器与实际交付形态不匹配**（`packaging/assemble.sh:357-364`）：
   生成器只匹配 `file:../../../project/Magpie-Horch/` 与 `file:/Users/lute/project/Magpie-Horch/` 两种前缀，
   但同脚本 `:193` 的 `scripts/rewrite-file-deps.mjs` **已经把依赖改写成 `file:./vendor/<name>`**，
   而生成器读取的是改写后的 `package.json` → 一条都匹配不上 → 只余硬塞的 `dsh-patches` 与恰好 1 条残留，
   于是 `vendor: 2`（实测 `["dsh-patches","dsh-task-board-local"]`），而真实 vendor 目录有 **19** 项、
   载荷里有 **18** 条相对依赖。

   这不是单纯的元数据不准：冒烟脚本 `:77-79` 用 `completeness.vendor.length - 1` 作期望值去比
   `grep -c 'file:./vendor/'`，于是**一个正确的载荷被报成失败**——
   2.0.1 与 2.1.0 两棵树的冒烟都是 `36 项通过 / 1 项失败`，那唯一失败项就是它（`expected=1 actual=18`）。

**第三处缝（本次新增守卫的原因）**

`assemble.sh` 在签名（`:225`）与归档（`:229` `tar … > DSH Desktop.app.tar.gz`）之间**没有任何再校验**。
签名之后、归档之前对 app 的任何写入都会让 seal 失效，且**静默**——开发机现状正是这个形态的极端版本。
把这个缝留给人工纪律，等于让「包对不对」重新依赖人眼。

**另需如实登记、但本次不修的**

- `sign-and-dmg.sh:46` 只对 `LUTE Setup.app` 做 `--verify`，没有对 `dmg` 本体或载荷 app 做终验。
- `build-pkg.sh:41-44` 注释已明示 `productbuild/productsign` **不支持 adhoc**，无证书时只能产出未签名 pkg；
  `release/2.0.0` 的 pkg 即为此形态。用户已决定**本次不出 pkg**，故该约束不构成阻塞。
- adhoc 签名被 `spctl` 拒绝是**固有行为**：对载荷 app 实测，无论是否带 `com.apple.quarantine`，
  `spctl -a -vv` 均返回 `rejected`；而 `codesign --verify --deep --strict` 退出码 0。
  即「签名有效」与「Gatekeeper 放行」在 adhoc 下不可兼得，右键打开是既定绕过方式（SOLUTION.md 决策 D3）。

## Solution

两阶段，先修链再出包；A 阶段是硬前置，因为带着红门禁去打包等于把「这次包对不对」交回人工判断。

**A. 修链（三个小改 + 一条负向验证）**

1. `verify-patches-v2.sh` 的默认 staging 树从已删除的 `2.0.0` 改为当前权威树，并把版本参数化
   （保留 `DSH_APP` 覆盖能力）。
2. `assemble.sh` 的 `completeness.json` 生成器补上 `file:./vendor/<name>` 这一形态，
   使 `vendor` 列表与实际载荷一致（预期 19 项：18 条相对依赖 + `dsh-patches`）。
3. 在签名与归档之间插入**签名守卫**：归档前再跑一次 `codesign --verify --deep --strict`，
   失败即终止并给出可读原因，杜绝「签名后又被改」静默出海。
4. 负向验证：证明该守卫会真的失败（签名后改一个字节 → 守卫报失败），避免它成为摆设。

**B. 出 dmg（一次装配 + 一条发布记录）**

5. 以当前权威 staging 树为基础，按既有链路装配出新版本 dmg（`assemble.sh` → `sign-and-dmg.sh`）。
6. 对**产出 dmg 内的载荷 app** 做终验：`codesign --verify --deep --strict` 退出码 0。
7. `shasum -a 256` 写入 `release/<version>/SHA256SUMS`，与 dmg 逐字节一致。
8. 补丁校验对产出物 `ALL VERIFIED`。

## User Stories

1. 作为维护者，我想在仓库根直接跑 `packaging/verify-patches-v2.sh` 就得到真实结论（退出码 0 或明确失败），不必先猜它默认指向哪棵树。
2. 作为维护者，我想让补丁校验的默认目标跟着「当前权威 staging」走，这样删旧树不会把它变成结构性红灯。
3. 作为维护者，我想让 `completeness.json` 的 `vendor` 列表等于载荷里真实存在的 vendor 依赖集合，这样它作为权威清单才可信。
4. 作为维护者，我想在冒烟脚本报失败时能确定失败是**产品问题**而不是元数据过时，因为后者的代价是让人开始忽略冒烟。
5. 作为维护者，我想让「签名后、归档前被改动」这种错误在构建期就炸掉，而不是等客户装上才发现包坏了。
6. 作为审查者，我想看到这条守卫的**负向证据**（故意破坏签名后守卫真的失败），否则我无法区分守卫与摆设。
7. 作为打包执行者，我想用一条命令产出一个 dmg，且它内部的 app 签名经机器验证有效。
8. 作为打包执行者，我想让产出的 dmg 有可复算的 SHA256 记录，这样「同一工程能否复现同版本」可被外部核对。
9. 作为用户，我想在安装说明里看到 adhoc 包被 Gatekeeper 拦截时的**确切绕过步骤**（右键打开 + 一次性 TCC 重授），而不是自己猜。
10. 作为维护者，我想让本次范围明确排除 pkg，因为无证书环境下 pkg 无法签名，混进来只会让交付标准含糊。
11. 作为下一个接手的人，我想在文档里读到「adhoc 下 spctl 必拒、codesign 有效」这组事实，这样不会把它误判成构建缺陷。

## Implementation Decisions

### 事实基线（实测，作为期望值来源）

| 项 | 实测值 |
| --- | --- |
| 现存 staging 树 | `packaging/staging/2.0.1`、`packaging/staging/2.1.0`（`2.0.0` 已删除） |
| 两棵树的补丁校验 | `DSH_APP=<树> bash packaging/verify-patches-v2.sh` → `PATCHES v2 ALL VERIFIED`，退出码 0 |
| 两棵树的冒烟 | `36 项 ok / 1 项 FAIL`，失败项恒为 `file: 依赖指向 ./vendor/（=vendor 数-1）: expected=1 actual=18` |
| `completeness.json`（2.1.0） | `bundles=33, vendor=2 ["dsh-patches","dsh-task-board-local"], skills=264, presets=15` |
| 隔离冒烟 home 的载荷 profile | `file:./vendor/` 出现 18 次，`vendor/` 目录 19 项，**18 条全部解析成功** |
| 载荷 app 签名 | `Signature=adhoc`；`codesign --verify --deep --strict` 退出码 0；`spctl -a -vv` → `rejected`（有无 quarantine 一致） |
| 已发布产物 | `packaging/release/2.0.1/DSH-Desktop-LUTE-2.0.1-mac-arm64.dmg`（686,153,172 B），与其 `SHA256SUMS` 一致；`release/2.0.0/` 含 dmg 与未签名 pkg |
| 签名身份 | `security find-identity -v -p codesigning` → `0 valid identities found` |
| 门禁 | `pnpm run gate` → 13/13，退出码 0 |

### 决策边界（grill-me 已确认）

| # | 决策 | 取值 |
| --- | --- | --- |
| 1 | 目标 | 分两阶段：先修链（A），再出包（B） |
| 2 | 签名与分发 | 保持 adhoc；不申请 Developer ID、不公证（本机 0 证书） |
| 3 | 交付形态 | **只发 dmg**，本次不出 pkg |
| 4 | staging 权威 | 默认值改为当前权威树并参数化，保留 `DSH_APP` 覆盖 |
| 5 | 版本号 | 用 **2.0.2**（发布线递增，不跳号；`2.1.0` 仅在 staging 未发布） |
| 6 | `completeness.json` 缺陷 | **纳入 A 阶段必要项**，不作为可选治理项 |
| 7 | C1–C4 与两套上游来源 | 全部不入本次范围，只记录 |

### A 阶段实现要点

1. `packaging/verify-patches-v2.sh:5`：默认值改为指向当前权威 staging 树；版本以变量表达
   （例如从环境或参数取，缺省为权威版本），**不硬编码历史版本号**。`DSH_APP` 覆盖能力必须保留
   （现有调用方依赖它）。
2. `packaging/assemble.sh:357-364`：生成器的 vendor 提取补上 `file:./vendor/` 前缀分支。
   注意与 `:174-175` 已有实现保持一致的口径（同样 `.replace(/\/+$/,'')` 去尾斜杠）；
   `dsh-patches` 仍按现有逻辑追加。
3. `packaging/assemble.sh`：在 `:225-226` 之后、`:229` 归档之前加入再校验。
   现有 `:226` 的 `codesign --verify --deep --strict` 已在签名后立即执行——守卫的价值在于**归档前的第二次**：
   任何在两者之间发生的写入都必须被抓住。同一断言在本阶段要能被人为制造的破坏触发（见 Testing Decisions 的负向用例）。
4. 不改 `sign-and-dmg.sh` 的既有行为（本次不动它；`LUTE Setup.app` 的 `--verify` 保持原样），
   dmg 本体的终验放到 B 阶段的验收里做。

### B 阶段实现要点

5. 版本 `2.0.2`；以当前权威 staging 树为基座按既有链路（`assemble.sh` → `sign-and-dmg.sh`）装配。
6. **不修改任何 app 内容**：B 阶段只做「装配 + 签名 + 归档 + 制 dmg」，避免自己制造 seal 破损。
7. `release/2.0.2/SHA256SUMS` 记录 dmg 的 sha256；`VERSION`/`manifest.json` 由既有脚本产出。
   `packaging/release/` 不在版本管理内（`.gitignore` 白名单式）——本次不改该策略，
   但 SHA256SUMS 的内容需在交付报告里贴出以便外部核对。

### 交付说明（adhoc 边界的书面化）

8. 在安装说明（`packaging/INSTALL-CARD.md` 或 `SOLUTION.md` 相邻位置，取既有单一事实源所在处）
   写清 adhoc 包的两个事实：`codesign --verify --deep --strict` 有效、`spctl` 必拒；
   绕过方式为右键打开 + 一次性 TCC 重授。**不新造文档**——写进既有安装说明。

## Testing Decisions

- **seam ①（构建前门禁）**：`packaging/verify-patches-v2.sh`（**默认参数**）的退出码与输出。
  期望值来自现有权威清单（`dsh-patches/patches-manifest-v2.md`）与实测的 `ALL VERIFIED` 字样。
- **seam ②（交付形态）**：`packaging/scripts/smoke-test.sh <payload>` 的退出码与 FAIL 行。
  期望值来自载荷字面量（`file:./vendor/` 计数 18、`vendor/` 目录 19 项），
  **不复制生成器算法**——断言应比对「清单 vs 载荷实际」这一对独立事实。
- **seam ③（产物签名与完整性）**：对产出 dmg 挂载后取载荷 app 执行 `codesign --verify --deep --strict`，
  以及 `shasum -a 256 <dmg>` 与 `SHA256SUMS` 比对。这是最高层、最接近用户行为的 seam。
- **先例沿用**：冒烟脚本已是隔离式（`SMOKE_HOME`/`SMOKE_APPS` 默认落 `/tmp`，不触碰本机 `/Applications` 与 `~/.dsh`），
  本次沿用该隔离方式，不新写测试框架。
- **负向用例必须存在**（守卫不得是摆设）：在签名之后人为改一个字节（例如向载荷 app 内某文件追加一字节），
  断言**归档前守卫失败**且给出可读原因；恢复后同一断言转绿。
- **不做的**：不为 `completeness.json` 的每个字段做逐字段断言（会退化成生成器副本）；
  不引入新测试框架；不对 dmg 做 Gatekeeper 放行断言（adhoc 下必拒，断言它只会制造永红项）。
- **每轮保留同一断言的真实 Red 与 Green**；Red 必须因能力缺失（默认路径失效 / 生成器形态缺失 / 守卫不存在），
  不得靠改选择器或 mock 制造。
- **最终验收**：seam ①②③ 全绿 + `pnpm run gate`（13/13，退出码 0）；
  并在交付报告里贴出真实命令输出，不以文字总结代替。

## Out of Scope

- **不出 pkg**（无证书环境下 `productbuild/productsign` 不支持 adhoc，pkg 只能未签名）。
- 不申请 Developer ID、不做公证、不改签名方式为真实证书。
- 不修 `/Applications` 里开发机 app 的 seal 破损（属开发痕迹，重装即消；不属交付物）。
- **C1** deepresearch 双实例（`CallId` ESM 绑定错 → `tsc -b` 不通、3 套测试挂起）。
- **C2** browser `tests/rc-legacy/` 两套测试按 alpha.1 形态重写。
- **C3** team-gui `scripts/quality/clean-build.mjs` 破坏 `file:` 硬链接（改 in-place 或构建后 relink）。
- **C4** 品牌哈希锚点（`_37cUPa` / `_q2Fapq`）重探测。
- 不动两套上游来源：`vendor/dsh-desktop` pin（`lute-sha=4e23031e9…`）、`harness-submodule`（`a66e470…`，ADR-0008 只读参照系）、
  `vendor/dsh-runtime/0.1.2-rc.1`（运行时实际来源）。本轮只记录不收敛，属升级窗口议题。
- 不改 `release/` 的版本管理策略（仍不入库）；不重做 1.x / 2.0.0 / 2.0.1 的历史产物。
- 不改 `sign-and-dmg.sh` 与 `build-pkg.sh` 的既有行为。

## Further Notes

- **本规格与既有决策的关系**：签名与分发沿用 `packaging/SOLUTION.md` 的 D3（adhoc 长期）；
  分发通道沿用 D5（官方更新禁用 + 手动分发）。本次不推翻，只把边界书面化并加一道守卫。
- **已知缺口（下一轮候选）**：`sign-and-dmg.sh` 对 dmg 本体无终验；
  `completeness.json` 的 `skills`/`presets` 只做「存在性」比对、不做内容校验。
  两者都不阻塞本次出包，登记备查。
- **风险**：A 阶段修好后若 staging 树再次被删，默认值会二次失效——参数化的意义是把「权威树是谁」变成显式输入；
  若后续引入多版本并存，需再评估默认值策略。
- **外部依赖**：无。全部工作在本机离线可完成；`pnpm run gate` 不依赖网络。
- **上游参照**：用户提到 `https://github.com/deepseek-ai/deepseek-harness`，与 pin 中的
  `anywhere-labs/dsh-desktop` 非同一仓库；harness 既是 `harness-submodule`（只读参照系）又不驱动运行时
  （运行时取自 `vendor/dsh-runtime`）。该双来源问题本轮**只记录**，见 Out of Scope。
