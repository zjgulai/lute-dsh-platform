# Note · 出货技能面 pycache 排除（含 r4 深检、基线核对与双机制验证）

- 日期：2026-09-17
- 对应 ADR：[ADR-0112](../../../adr/ADR-0112.md)
- 关联主线：基座 2.0.10 升级 T-10 出货组装（docs/research/13 §15）；ADR-0056 机器路径族

## Problem

T-10 装配 r4 首次全绿（SMOKE PASSED、14 产物落盘）后，对 `skills-presets.tar.gz` 做解包全树深检，
`grep -r 'Users/lute'` 命中 **18 个 `__pycache__/*.pyc` 二进制**（7 个技能：customer-voice-analyzer、
ecommerce-seo-optimizer、multilingual-seo、seo-competitor-analysis、seo-page-audit、
multi-platform-listing-generator、p2s-3d-bin-packing-optimization）。文本面守卫全部绿——
因为机器路径钉在字节码 `co_filename` 字段里，仓库的 grep 系守卫根本读不到。

基线核对（防止误判为 2.5.0 新回归）：挂载 `release/2.4.1` DMG、解包其 `skills-presets.tar.gz`
与 `profile.tar.gz`——技能面同样 18 个 pyc 同技能同分布；vendor 面
（dsh-overseas-skills）另有 1 个 pyc。两类都是历史既有。

## Decision

详见 [ADR-0112](../../../adr/ADR-0112.md)。机制实现（`packaging/scripts/select-skills.mjs`）：

- `--copy`：`cpSync(..., { filter: (src) => !src.split(sep).includes('__pycache__') })`。
- `--check`：`readdirSync(join(dir, s), { recursive: true })` 扫落位树，任何 `__pycache__`
  条目入 problems（判罚文案区分「缓存条目」与逐文件）。

## Alternatives considered

- baseline 容忍登记 / 删源树 / tar 后处理：三者拒绝理由见 ADR-0112。
- 只加 filter 不加判据：拒绝——filter 是「这次不带」，判据才是「下次冒出来会被拦」；
  单机制会重演「写了但从没跑到」家族（pitfalls）。

## Consequences

- Red/Green 证据链：**Red** = r4 真实产物解包成树跑 `--check` → exit 1，报 26 个 `__pycache__`
  条目（18 文件 + 8 目录）；**Green** = fixture（源树含 pyc）→ `--copy` 落位树 0 pyc、
  `--check` exit 0。
- r5 全链真实装配：文本面机器路径 0 残留、`find -name '*.pyc'` = 0、技能 435 + preset 52
  全数落位，SMOKE PASSED；tarball 体积 18916147 → 18835868（-80K，与 18 个 pyc 吻合）。
- 装配日志出现新判据文案（r5 log L63：「无受限许可技能、无 __pycache__」）。
- 验证过程插曲两则，均为方法教训：① 对 r4 产物做入口核对时撞上 r5 重建窗口（staging 被
  wipe），「全部存在」是空集上的空洞真话——跨轮读数必须对**稳定产物**做；② 备份树哈希
  manifest 用 `find -exec shasum` 串行 600s 超时，且 `xargs -P 8` 跑完后差 5 文件、`comm`
  比对在 UTF-8 collation 下还有假阳性——最终以 `LC_ALL=C` 双清单 diff 收口（42871/42871 逐名一致）。
- vendor 面 1 个 stale pyc 不随动（overseas-skills 尾债族）。
