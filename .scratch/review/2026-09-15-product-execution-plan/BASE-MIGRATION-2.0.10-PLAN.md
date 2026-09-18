# 基座迁移方案：DSH Desktop v2.0.5 → v2.0.10

- 状态：**用户已拍板方向，方案待执行**（执行排在 review 剩余 TODO 之后）
- 日期：2026-09-16
- 前置文件：[UPSTREAM-BASELINE-AND-MIGRATION.md](UPSTREAM-BASELINE-AND-MIGRATION.md)（E0 调查与 U0–U8 骨架，本文件在其上补实测并落成执行方案）
- 估算口径：S ≈ 半天以内；M ≈ 1–2 天；L ≈ 3–5 天；XL 需拆批。不含外部账号、证书与客户等待。

---

## 1. 决策记录（2026-09-16 用户拍板）

| # | 决策 | 结论 | 备注 |
| --- | --- | --- | --- |
| M-D1 | 迁移路径 | **A · 整体迁移到 2.0.10**，不做选择性回移、不等观察窗 | 否决了 B（选择性回移）与 C（观察窗到期） |
| M-D2 | 授权范围 | **授权下载官方 DMG + 建立隔离评估轨道**；不修改 `/Applications/DSH Desktop.app`、不修改生产 profile | 已执行下载，见 §3 |
| M-D3 | 执行顺序 | **review 剩余 TODO 先做，基座迁移在后** | 避免基座变更导致既有验证证据批量作废 |
| M-D4 | 治理前提 | 迁移立项必须同步出 **ADR-0006 修订记录**，且**写明真实放行理由＝用户决定越过观察窗**，不得写成「红线触发」 | 未完成前不得进入 U1 |

### 1.1 与现行 ADR-0006 的冲突（不可静默）

`ADR-0006` 规定：上游新稳定版发布后观察 2 周；非红线只做选择性回移；整体大版本迁移仅由客户需求驱动立项。

- 2.0.10 发布于 2026-09-13，距今 **3 天**，观察窗未满。
- 截至本文件，**未发现** 2.0.6–2.0.10 存在被点名的安全修复（2.0.7 / 2.0.9 / 2.0.10 发布说明中无安全条目）。**因此红线未触发。**
- 结论：本迁移的合法性来自 **M-D1 的用户决定**，而非红线。任何后续文档、门禁豁免或复盘都不得改写成「因安全红线必须跟进」——那会伪造证据。

---

## 2. 实测基座对照（Fact，非推断）

| 维度 | 2.0.5（现行装机） | 2.0.10（DMG 实测） | 证据 |
| --- | --- | --- | --- |
| 应用版本 | `2.0.5` / build `2.0.5-lute.2.4.1` | `2.0.10` / build `2.0.10` | `PlistBuddy` |
| 打包形态 | `Resources/app.asar`（5,125,076 B）+ `app.asar.unpacked/` | **`Resources/app/`（普通目录）** | 挂载 DMG 直读 |
| `app.asar` | 存在 | **不存在** | 同上 |
| `app.asar.unpacked` | 存在 | **不存在** | 同上 |
| 内嵌 profile | `Resources/dsh-profile/profiles/desktop` 存在 | **不存在** | 同上 |
| `cordis.patch.yml` | `app.asar.unpacked/cordis.patch.yml` | `app/cordis.patch.yml` | `find` |
| Harness | `@deepseek-ai/dsh` = `0.1.2-rc.1` | `0.1.5-rc.2` | 包内 `package.json` |
| `@deepseek-ai` 包数 | 226 | 245 | `ls \| wc -l` |
| `dsh-plugin-desktop/src` 源文件 | 157 | 182 | git tree / GitHub trees API |
| `build.asar` | `true` | **`false`** | 两版 `package.json` |

### 2.1 版本与制品标识（冻结用）

| 项 | 值 |
| --- | --- |
| 上游 tag v2.0.5 | `423406fe225442995902015cb6f10eed670ff115`（与 `vendor/dsh-desktop.pin` **逐位一致**） |
| 上游 tag v2.0.7 | `a7f1ffebb40d25e879a9879834cb9c265b869a50` |
| 上游 tag v2.0.9 | `63e160ab4387988db894adef766865eab897cf80`（等于本地 `upstream/master`） |
| 上游 tag v2.0.10 | `697e7d782cbfc2b9e8fa0ac862ef26bba9ac1326` |
| 官方 DMG | `DSH Desktop-2.0.10-universal.dmg`，319,280,480 B |
| DMG SHA-256 | `f143c54726cf2f966187b82a4a48057a8b2884f46743390cf94650663433fb79` |
| 发布节奏 | v2.0.5 09-03 · v2.0.7 09-10 · v2.0.9 09-10 · **v2.0.10 09-13** |
| 改动规模 | `v2.0.5...v2.0.10` **194 commits**，GitHub compare 文件列表 **300 项封顶**（实际更多） |

DMG 完整性旁证：ModelScope CDN 的 LFS 对象路径内嵌 `f1/43/c54726cf2f966187b82a4a48057a8b2884f46743390cf94650663433fb79`，与本地 `shasum -a 256` 逐位吻合；`hdiutil` 挂载时报 `已验证CRC32 $5701C0D8`。

---

## 3. 四个破坏面

### 3.1 打包路径契约整体失效（结构性，前两次迁移从未遇到）

- 事实：`Resources/app.asar.unpacked/**` → `Resources/app/**`（§2 实测）。
- 冲击面（全部是硬编码路径，非配置项）：
  - `packaging/assemble.sh` 暂存改写与 `NM_DIR`
  - `packaging/verify-patches-v2.sh` 的 `NM=` / `LIB=` 常量与 `RECOVERY_DOCUMENT` 锚点
  - `packaging/scripts/apply-nm-patches.py` 的 NM 根
  - `dsh-patches/brand-replay.sh` 的 hash bundle glob 与 `app.asar.unpacked` 定位
  - `dsh-patches/runtime-guards/apply-fixes.sh`（G1/G2 守卫）
- 附带影响：LUTE 出货 installer 假设「外层 DMG → installer → 内嵌 app tar」，需重验 no-ASAR 下的字节落点与签名顺序（见 §6 U7）。

### 3.2 运行时整体替换

- 事实：**135 个** `@deepseek-ai/*` 依赖同时从 `0.1.2-rc.1` 位移到 `0.1.5-rc.2`；依赖数 148 → 154；新增 4 个、移除 **0** 个。
- 新增：`dsh-client-file-upload`、`dsh-http-proxy`、`dsh-session-persistence-jsonl`、`dsh-util-values`。
- 冲击：24 个 NM 补丁的目标包全部换版；11 个产品包的宿主 API 绑定需在新运行时重验（即既有 `05-rc-compat-matrix.md` 的口径重做）。

### 3.3 上游改写的就是我们补丁所在的文件

我们 12 个 fork 提交的改动面（`git diff --stat v2.0.5..HEAD` 拆分后）：

- 功能性补丁：**34 个源码文件，229 增 / 147 删**
- 品牌改名（机械可重跑）：29 文件，140/140

上游同期改动（GitHub compare）：

| 我们补丁的目标 | 上游改动 |
| --- | --- |
| `src/electron-runtime.ts`（P0-1v2 更新器守卫、P0-6v2 权限门） | **+79 / −25** |
| `src/profile.ts` | **+189 / −35** |
| `src/profile-service.ts` | **+91 / −23** |
| `src/recovery-copy.ts`（P0-2v2 恢复日志） | **+193 / −76** |
| `src/profile-manager.ts`（P0-7v2 真路径） | +3 / −0 |
| `src/native-ui/recovery/App.tsx` | +77 / −8 |
| **新增** `src/asar-module-resolver-state.ts`、`src/renderer-recovery.ts`、`src/desktop-data-directory.ts` | 全新 |

**12 个提交没有一个落在上游未改写的文件上。**

### 3.4 语义断裂：内嵌 profile 输入源消失（比锚点漂移更重）

- 事实：`Resources/dsh-profile/` 在 2.0.10 **不存在**。
- 事实：2.0.10 的 `createDesktopWebProfile` 注释为 *"Create a safe Web profile using only the shipped template"*，模板取自 `PROFILE_TEMPLATES.web`（在 `dsh-app-boot` 内），**不再从内嵌目录拷贝**。
- 事实：2.0.10 的 `materializeDefaultDesktopProfile` 会把已存在但非真实目录的 target **改名保全为 `.incomplete-<pid>-<uuid>`**，并对普通文件/符号链接 **fail closed**。
- 判定：**上游已自行实现我们 P0-7v2 / v2b / v2c 想达成的目标**（稳健的首启 profile 物化）。差异是上游走「模板合成」，我们走「拷贝内嵌目录」——而后者在 2.0.10 已无输入。
- 附带事实：`embeddedRoot` 一词在纯净 2.0.5 与 2.0.10 中**都不存在**，它**纯粹是我们 P0-7v2 自己引入的标识**。因此不能用「上游是否保留 embeddedRoot」判断兼容性。

> 更正记录：本文件起草过程中曾据 `grep -rl 'dsh-profile\|…\|embeddedRoot'` 的命中误判「2.0.10 仍有 embeddedRoot 概念」。逐字重测后 `grep -c 'embeddedRoot'` 在 2.0.10 `main.js` 与 `electron-runtime-*.js` 均为 **0**；先前的命中来自无关的 `dsh-profile-create:` scheme。已更正，原误判作废。

---

## 4. 补丁处置预判（U2 账本的输入，非结论）

分类沿用既有 spec：`clean-apply` / `semantic-conflict` / `obsolete-upstreamed` / `obsolete-product` / `redesign`。

| 补丁 | 预判 | 依据 |
| --- | --- | --- |
| P0-6v2 外链白名单 + 权限门 | **obsolete-upstreamed（候选）** | 2.0.10 已含 `src/local-window-policy.ts`，2.0.5 无此文件。**须逐条比对语义覆盖度，不得假定等价** |
| P0-7v2 / v2b / v2c 首启内嵌 profile 兜底 | **obsolete-upstreamed（候选）** | §3.4：上游已实现等目标且更稳健 |
| P0-2v2 恢复日志 | **semantic-conflict（高概率）** | `recovery-copy.ts` +193/−76，是本轮改动最大的目标文件 |
| P0-1v2 更新器守卫 | **redesign / semantic-conflict** | `electron-runtime.ts` +79/−25 |
| P0-6c 诊断导出脱敏 | 待查 | 未取得 2.0.10 对应用例 |
| P0-9 RootOutlet 兜底 | 待查 | 上游新增 `renderer-recovery.ts`，可能重叠 |
| 24 个 NM 补丁 | **全部重做** | §3.2：目标包全部换版 |
| 品牌改写 | **clean-apply（机械）** | hash 锚自动漂移；但 wordmark 文本模式需补 2.0.10 形态分支 |
| `dsh-patches/runtime-guards` G1/G2 | **须改造** | §3.1 路径契约失效 |
| 38 个 verify 锚点 | **须重锚或作废** | §3.1 + §4 各行 |

**任何一条都必须在 U2 出账本后才允许动手改代码。**

---

## 5. 批次切分与估算

| 批次 | 内容 | 估算 | 产出 | Go 条件 |
| --- | --- | --- | --- | --- |
| **M-0** | 立项与治理：ADR-0006 修订（真实理由）、`UPSTREAM-SNAPSHOT.json` 冻结、批次边界 | S | ADR 修订 + 快照 | M-D4 完成 |
| **M-1** | 隔离轨道：独立 app + 独立 `DSH_HOME` + 独立 userData；复用 rc-eval 三条已知坑 | M | 可跑的官方 2.0.10 | 首启 healthy、0 error |
| **M-2** | **patch rebase ledger**（只出账本，不改代码） | M | §4 全表落定 | 每条都有分类 + postcondition 设计 |
| **M-3** | 依赖闭包：runtime tarball `0.1.2-rc.1 → 0.1.5-rc.2`、lockfile、peer、vendored tarball | L | 断网可重建 | 全等 + 无旧 RC 混用 |
| **M-4** | NM 层 24 补丁重锚 + 四条路径契约改造（assemble / verify / brand / runtime-guards） | L | 新锚点集 | 恒真桩突变会红 |
| **M-5** | 契约测试矩阵（既有 spec U4 全项） | L | 契约证据 | 正负例均跑过 |
| **M-6** | 门禁与 clean 构建 | M | `gate` / `gate:full` 三态 | checked=0 不得 pass |
| **M-7** | live canary（产品面正负例） | L | live 证据 | 不用 API 200 推导业务成功 |
| **M-8** | DMG canary：fresh / N-1 / same-version / rollback / TCC | L | attestation | 绑定 exact final digest |
| **M-9** | Go/No-Go + 客户迁移安装器 | L | 放行或回退决定 | §7 |

顺序依赖：M-0 → M-1 → M-2 → {M-3, M-4} → M-5 → M-6 → M-7 → M-8 → M-9。
**M-2 未完成前不得进入 M-3/M-4。**

---

## 6. 复用既有 spec 的执行骨架（U0–U8）

既有 [UPSTREAM-BASELINE-AND-MIGRATION.md](UPSTREAM-BASELINE-AND-MIGRATION.md) §6 已给出 U0–U8 与 §7 DMG 风险、§8 预判坑，本方案不重写，只补三点实测修正：

- **U2**（patch ledger）：加入 §3.4 的语义断裂条目——内嵌 profile 输入源消失会使 P0-7v2 系列**无法按原设计重锚**，只能判作废或重设计。
- **U5**（门禁）：`apply-nm-patches.py` 存在**静默通过通道**——目标文件不存在时打印 `SKIP` 并继续，`failed=0` 返回成功。上游改包结构时装配会「绿着通过但补丁没打上」。此路径**必须在 M-6 前改掉**（缺失目标应计入 fail 而非 skip），否则整条迁移的证据链不可信。
- **U7**（DMG canary）：§3.1 的路径契约变更使「本地 patch 最终作用于哪一份 bytes」在 no-ASAR 下必须重新回答；既有 spec §7.1 的四个问题在本次迁移中从「预留问题」升级为**必答前置**。

---

## 7. Go / No-Go

**Go 全部满足**：M-0…M-8 证据齐；patch ledger 每条有分类与 postcondition；无 secret / 无网络补依赖 / 不用 live profile 取件；DMG fresh + N-1 + rollback 可重复；客户迁移安装器在干净机器可跑。

**No-Go 任一触发**：

1. no-ASAR 令本地补丁模型失去可证明的 loadpoint（§3.1 未闭合）；
2. 事件 / RPC / profile / loadpoint 出现静默失效；
3. Gatekeeper / TCC / 数据迁移 / rollback 不可重复；
4. 需要放松安全门禁或引入**永久**兼容双栈才能通过；
5. 门禁出现「checked=0 却 pass」或 skip 被当作通过。

---

## 8. 非范围（本方案不含）

- 上游 `0.1.6-alpha.1` 全量采用（另立研究轨，见既有 spec §4.2）；
- official Desktop 与 anywhere-labs shell 的所有权切换（`UP-ARCH-001`）；
- Browser / Computer Use 双实现合并；
- MCP v2 对外产品承诺；
- 任何 commit / push / merge / 发布 / 安装到生产机 / 改远端。

---

## 9. 未验证项与残留风险

1. **2.0.10 运行行为未实测**：本方案所有 2.0.10 结论来自 DMG 静态结构与上游源码，**没有启动过 2.0.10**。M-1 之前不得声称任何运行期兼容性。
2. **0.1.5-rc.2 对我们插件的 API 影响未知**：需 M-5 才有读数。
3. **2.0.6 / 2.0.8 缺号原因未知**；2.0.7→2.0.9→2.0.10 之间是否存在互相 revert 未查。
4. **上游是否存在未在发布说明点名的安全修复未确认**——这直接影响 §1.1 的红线判定；若后续查到，ADR 修订需一并更正。
5. **本机自动更新已禁用**（`electron-runtime-*.js` 中 `Update installation is disabled for security` 实测命中），故**不存在被动升级，无时间压力**；反过来说，迁移必须手动完成，不会「自己变好」。
6. DMG 暂存于 `/tmp/dsh-2010/`，`/tmp` 可能被清理；SHA-256 已记录（§2.1），重取约 65 秒（实测 4.9 MB/s）。

---

## 10. 证据索引（可复现命令）

```bash
# 官方版本事实
curl -sS 'https://api.github.com/repos/anywhere-labs/dsh-desktop/releases?per_page=30'
cd vendor/dsh-desktop && git ls-remote --tags upstream

# 改动规模
curl -sS 'https://api.github.com/repos/anywhere-labs/dsh-desktop/compare/v2.0.5...v2.0.10'

# 打包形态（实测，非推断）
hdiutil attach -nobrowse -readonly -mountpoint /tmp/dsh-2010/mnt '/tmp/dsh-2010/DSH Desktop-2.0.10-universal.dmg'
ls -la '/tmp/dsh-2010/mnt/DSH Desktop.app/Contents/Resources/'

# 依赖位移
git show v2.0.5:dsh-plugin-desktop/package.json   # 与 v2.0.10 的 package.json 比对

# 装机版补丁存活
grep -rlF 'Update installation is disabled for security' \
  '/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/lib'
```

*本文件是执行方案，不是执行结果。截至 2026-09-16，未改 pin、未重放补丁、未启动 2.0.10、未打 DMG、未做 live 或干净机器验证。*
