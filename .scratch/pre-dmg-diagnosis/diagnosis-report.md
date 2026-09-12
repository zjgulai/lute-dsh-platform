# DMG 打包前全维度诊断（MECE）· 2026-09-12

> 范围：把当前「深度解耦（BASE=source）」产品形态打成对外 DMG 之前的只读诊断。
> 纪律：本轮**未修改任何代码**；所有结论附证据路径/命令输出；不确定的写「结论不明」。
> 取数时间：2026-09-12 19:xx。基线：基座 pin `lute-sha 4e23031e`（vendor HEAD 一致 ✓）。

---

## 0. 交付定义（当前事实）

| 项 | 事实 | 证据 |
|---|---|---|
| 唯一产物格式 | DMG（`release/` 下只有 2.0.1 的 dmg 686,153,172B，Sep 11 02:41） | `packaging/release/2.0.1/` |
| 未发布中间态 | `staging/2.1.0/payload`（677M，BUILD=20260911-110627） | `packaging/staging/2.1.0/payload/VERSION` |
| 载荷构成 | app.tar.gz 453,813,165B｜profile.tar.gz 211,761,539B｜aeis 39,768,056B｜skills-presets 3,773,525B｜Setup.app｜install.sh｜tools | 同上 manifest |
| 内嵌兜底 | app 内 `Resources/dsh-profile` 766M（首启物化） | `staging/2.1.0/app/.../Resources/dsh-profile` |
| 本机已装 app | `/Applications/DSH Desktop.app` = `2.0.5-lute.2.0.0`（落后于 staging） | `Info.plist` |
| pkg | 文档称「主交付格式」，**全仓零个 .pkg** | `INSTALL-CARD.md` §方式一 vs `find -name '*.pkg'` |

**结论：当前不存在与「今日代码」对应的可发布产物；最近两次装配（2.0.1 / 2.1.0）都早于基座解耦后的多次改动。**

---

## A. 产品内容与范围（我们到底发什么）

**A1 ·【高】打包源 = 工作树 + 本机 live profile，工作树脏（82 项）**
- 事实：`git status --porcelain` = 82 项；其中 `packages/` 37、`scripts/` 10、`docs/` 8、`packaging/` 2、`shared/` 1、`dsh-patches/` 1。
- 关键未提交内容：C6 输入框下方能力导引（`dsh-role-matrix-local/src/client/hero-entry.tsx`、`prefill.ts`、`capabilities.ts`、`shared/client/hero-entry-core.ts` 均 untracked）、`packaging/assets/app-icon.icns`（改）、`dsh-theme-local/lib/client.js`（改）。
- 风险：assemble 从工作树复制 → 出货内容无法用 tag 回溯；灰度回滚时无法回答「客户那一版是什么」。
- 缓解事实：最新功能**确实已构建进产物**（`lib/client.js` 含 `hero-entry` 74 处 / `dsh-hero-entry__` 57 处，profile 副本字节一致，mtime 18:58 > 源 18:49）。

**A2 ·【高】跨项目依赖 `dsh-kol-hunter-local` 逃过整条打包链**
- 事实：profile `package.json` 中 `dsh-kol-hunter-local = file:/Users/lute/project/KOL-Hunter`，且它在 **bundles 第 32 位**。
- 三处同时失守：① `assemble.sh:148-149` vendor 抽取只认 `Magpie-Horch` 两个前缀 → 不进 vendor；② `rewrite-file-deps.mjs:19` `OLD_PREFIXES` 同前缀 → 不被重写；③ 该脚本的 vendor 存在性校验只看 `file:./vendor/` → 逃过 `--check`；④ `install.sh:150` 的 `--check` 又是 `|| true`。
- 实测（模拟 assemble 的过滤逻辑）：`file:` 依赖 23 条，**22 条覆盖、1 条漏**（即 KOL-Hunter）。
- 附：profile 里那份 KOL-Hunter 副本**已经陈旧**（`lib/client.template.js` 源 19:08 / 副本 11:22），而门禁 `profile-bundle-sync` 明确把「非本仓包」排除在断言面外 → **无人守**。
- 关联：ADR-0036:51 自述「路径是绝对的，换机器要改。未运行：只在本机验过」。

**A3 ·【中】技能交付面过大且有许可瑕疵**
- 事实：`~/.dsh/skills` = **1611** 个技能目录（66M），其中 `p2s-*` **1338** 个；被 preset/映射引用 544 个，**1067 个未被任何引用**（p2s 989 + 其他 78）。
- 许可：`~/.dsh/skills/lieflat-charts/LICENSE` = **PolyForm Noncommercial 1.0.0（禁商用）**，上游 issue #17 未答；该技能会被 `assemble.sh:251` 全量打进 `skills-presets.tar.gz`。
- 其余抽样许可为 MIT/Apache（多）。
- 客户观感：技能中心将出现 1611 张卡（含评估语料）。

**A4 ·【中】内部取证文档随包出厂**
- 事实：`assemble.sh:152` 把 `dsh-patches/` 整体 rsync 进 `profile/vendor/dsh-patches`（7.0M），内含 `loop2-4-anchor-drift-evidence.md`(233行)、`P0-remediation-checklist.md`(280行)、`upstream-issues.md`、`UI-UX-audit-patch.tar.gz`(319K)、`submission-guide.md` 等内部材料。
- 风险：内部工程情报、上游议题清单、补丁清单直接发给客户。

**A5 ·【中】文档承诺与产物不一致（pkg）**
- `INSTALL-CARD.md` §方式一（pkg 主交付）与整节校验命令指向不存在的 `.pkg`/`PKG-SHA256SUMS`。

**A6 ·【低】上游许可声明未随包**
- 上游 `vendor/dsh-desktop/LICENSE` = MIT (c) 2026 Anywhere Labs；但 LUTE 与官方 app bundle 内**均无** LICENSE/NOTICE 文件。建议随包补一条声明（低成本合规）。

---

## B. 构建链与可复现性

**B1 ✓ 基座可复现闭环**：`assemble.sh:32-38` pin 门禁；实测 vendor HEAD `4e23031e` == pin `lute-sha`。

**B2 ✓ 补丁层健康**：实跑 `packaging/verify-patches-v2.sh` 对 `staging/2.1.0` 与 `/Applications/DSH Desktop.app` 各一次 → **35/35 OK，exit 0**；24 个 NM 补丁目标文件在 staging app 中缺失 0。

**B3 ·【高】RootOutlet 白屏守卫不在当前打包路径**
- 事实：该守卫是 2026-09-07 就地打在 `app.asar.unpacked/.../dsh-client-ui-renderer/lib/client.js`（root 未注册时改为占位渲染 + console.error）。
- 现状三重缺失：① `packaging/patches/nm/` 24 个补丁里**没有** `dsh-client-ui-renderer`；② vendor fork 源码里也没有（`grep` 只命中 read-only 的 `deepseek-harness` 参考树）；③ `staging/2.1.0` 的 renderer `client.js` 仍是 `throw new SlotAssemblyError(...)`（实测命中 1 处）。
- 手册自述（`docs/dsh-desktop-white-screen-playbook.md` §6.1 注记）：2.0.5 重锚时很可能丢失，「下次白屏诊断前需先确认是否要重放」。
- 影响：已知的两类间歇白屏（RootOutlet boot 竞态、install 后首启 155s 竞态）在客户机上没有兜底。

**B4 ·【高】`staging/2.1.0` payload 是 11:06 的旧快照，直接制 DMG 会带三类旧件**
- 早于它的修复：`verify-patches-v2.sh`(21:29 参数化)、`assemble.sh`(22:46)、`verify-app-signature.sh`(22:48)、`sign-and-dmg.sh`(22:49)、`install.sh`(23:29)、`smoke-test.sh`(23:31)。
- 具体后果：payload 内 `tools/verify-patches-v2.sh:5` 默认路径仍指向**已删除**的 `staging/2.0.0` → 客户运行校验工具默认必红；`payload/install.sh` 与仓库版不同源（差一行 `LING_SRC`）。

**B5 ·【中】`.app-cache` 指纹不足以判定新鲜**
- 指纹 = 4 个哨兵 mtime 最大值 + 全树文件数（排除 dsh-profile）+ vendor HEAD[:12]（`assemble.sh:72`）。
- 不含 `app.asar.unpacked` 内既有文件的**内容** → 只改内容、不改文件数、不碰哨兵 mtime 即误命中。
- 实测当前 stamp `1789095830-20176-4e23031e926d` 与重算值一致 → 本次是新鲜命中（本轮无忧）。

**B6 ·【中】构建不确定性与机器耦合**
- `BUILD=$(date +%Y%m%d-%H%M%S)`（`:292`）+ `created_at`（`:357`）→ 同源码两次构建字节不同（可复现性声明只能落在「功能等价」层面）。
- 唯一网络点：electron 二进制经 npmmirror 下载（`:43`）；`COREPACK=$HOME/.lute-toolchain/...`（`:20`）→ **CI/干净构建机直接 exit 1**。
- hash 名 bundle 定位依赖 `glob + head -1`（多匹配时不确定）。

**B7 ·【中】6 处静默跳过**：`NM_DIR` 缺失（`:108-112`）、`app-icon.icns` 缺失（`:115-120`）、`brand-replay.sh` 缺失（`:127-131`）、`aeis-venv` 缺失（`:262-270`，README 却承诺灵枢可用）、tools 一串 `|| true` cp（`:279-284`）。

**B8 ·【中】`sign-and-dmg.sh` 互斥锁失效**：`LOCK=$REL/.build.lock` 位于 `$REL` 内，`:33` 的 `rm -rf "$REL"` 会把锁一并删掉 → 互斥只覆盖毫秒级窗口，并发第二实例不被拦。

**B9 ·【低】元数据小错**：`manifest.json` 的 `"LUTE Setup.app": 96`（目录 stat 而非体积，实际 112K）；`assemble.sh:342` README 写「34 锚点」（实际 35）。

**B10 ·【中】陈旧产物/缓存占地**：`staging/` 2.0G（含未发布的 2.1.0 与 1.0.0/1.1.0 日志）、`staging-src/2.0.0` 1.2G（无脚本引用）、`.app-cache` 549M、`release/` 654M。

---

## C. 运行时兼容性

**C1 ·【高｜结论不明】profile 携带的 override 与 rc.1 基座可能不兼容，且会随包安装**
- 事实（本轮实测）：`~/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-file-reference-local` = **0.1.2-alpha.1-override**（孤儿，不在 dependencies）；`overrides/dsh-file-reference-local` 同为该版本；应用侧同名包 = **0.1.2-rc.1**。
- 该 override 的 `lib/index.js:3` `import { FIRST_PARTY_SECTION_ORDER } from "@deepseek-ai/dsh-system-prompt"`；实测 rc.1 的 `dsh-system-prompt` **不导出**该符号（`Object.keys()` 判定 false）；profile 内也没有 `dsh-system-prompt` 副本。
- `install.sh:187-193` 会把 `overrides/<o>` 覆盖到客户机 `node_modules`。
- 已知对照：用 CLI 启 desktop profile 时，正是这条 import 让**整棵插件树装载失败**（board A1_5 取证）。
- **未证明**：Electron 真机装载路径究竟取 profile 副本还是 app 副本（本机 app 运行正常，可能根本没加载这份孤儿）。
- 结论：**必须在干净环境用真实产物做首启验证**，结论前不要动 `node_modules`（board A1_5 的纪律）。

**C2 ·【中】随包的 pnpm 内部状态带构建机路径**
- 事实：`profile.tar.gz` 内含 `node_modules/.pnpm/lock.yaml`、`.modules.yaml`、`.pnpm-workspace-state-v1.json`；其中仍见 `file:../../../project/Magpie-Horch/...` 4 处等构建机路径（父 profile 的 `pnpm-lock.yaml` 被重写，`.pnpm/lock.yaml` **没有**）。
- 影响面：客户机一旦触发 `pnpm install`（插件市场/新增插件），可能复现历史 `ENOENT scandir` 类故障；本轮不触发（安装器不跑 pnpm）。

**C3 ·【中】`apply-patches.mjs` 在客户机跑，且会「假成功」**
- 事实：该脚本 263 行、10 个顶层裸块，只有步骤 1 有存在性守卫（2026-09-12 补）；步骤 2/3 等用 `c.replace(anchor, next)` 后**无条件 write 并打印 `[patched]`** —— 锚点失配时写入原内容、日志照样说打上了。
- 随包的是 **profile 版**（13,553B, Sep 12 02:37），仓库内 `dsh-patches/profile-apply-patches.mjs`（9,649B, Sep 11 23:29）是**过时副本** → 客户实际执行的文件不在仓库里、不进门禁、不可 review（违 ADR-0009「一份事实一个家」）。
- `install.sh:151` 不以 `|| true` 调用 → 抛错会触发回滚（这点是对的）；但「静默漏打」不会被发现。

**C4 ·【中】白屏兜底缺失**（同 B3，从运行时视角：客户机上没有 root 占位渲染）。

**C5 ·【低】首启免向导链路已具备**：fork 源中含 `P0-7v2c` 2 处、`clearDesktopSetupWizardStateSync` 15 处、`materializeDefaultDesktopProfile` 8 处、`__DSH_HOME__` 7 处；`install.sh:154-184` 预写 wizard skip 状态并在 700 权限下写。

**C6 ·【低】39 个 bundles 清单**已由 `completeness.json` 逐一比对（payload 版 33 bundles，live 版 39 → 需以本次新装配为准）；「bundles 只写包名一次」的红线（历史白屏）未发现违反。

---

## D. 安装与分发

**D1 ·【高】签名/公证是零基础设施**
- `security find-identity -v -p codesigning` → **0 valid identities**；产物全部 adhoc（`flags=0x2`、无 TeamIdentifier、**无 hardened runtime**、**无 entitlements**），无 notarytool/altool 脚本与凭证。
- 实测：`spctl -a -vvv` 对 DMG / Setup.app 均 `rejected`；`codesign --verify --deep --strict` 通过（自洽，但 Gatekeeper 不认）。
- 文档只覆盖「打开 app 需右键」，**未覆盖「挂载 DMG 这一步就会被拦」**。

**D2 ·【高】升级会静默丢弃客户后装插件**
- `install.sh:133` `OWNED=(package.json pnpm-lock.yaml pnpm-workspace.yaml cordis.patch.yml apply-patches.mjs node_modules vendor overrides)` 整体备份+替换；只有 3 个定向恢复（`:187-193`）。不在 `completeness.json` 内的后装插件升级后消失，无升级前清单比对门禁。

**D3 ·【中】安装后校验失败只告警**：`install.sh:225/228/233` 三处 `|| say "⚠ …"` → 补丁/品牌校验红了也算装成功。

**D4 ·【中】路径自检 `|| true`**（`:150`）。

**D5 ·【中】无卸载器 + 备份累积**：`packaging/installer/` 无 uninstall；本机残留 `~/.dsh` 2.9G、`~/Library/Application Support/{LUTE Agentic System 24K, DSH Desktop 1.5G}`、4 个 `com.lute.*` launchd plist；`*.pre-lute-<stamp>` 三类备份无清理。

**D6 ·【中】无拖拽安装布局**：`hdiutil create -srcfolder` 直接以 payload 为卷内容，无 `Applications` 符号链接/背景图/.DS_Store 布局；只拖 app 会走内嵌兜底（灵枢降级）。

**D7 ·【低】已被妥善处理的项（无需动作）**：quarantine 五处清零 + 打包侧断言 + 冒烟模拟；路径含空格（含 Swift 侧卷根定位）正确；无 Xcode CLT 依赖（Electron 作 node shim）；sudo 防线完整（拒绝 root + root 属主残留检测）。

**D8 ·【低】交互前提**：写 `/Applications` 必弹管理员密码框（无人值守不可行）；磁盘门槛 ≥3G。

---

## E. 验证、回滚与运维

**E1 ·【高】冒烟不进门禁**：`packaging/scripts/smoke-test.sh`（149 行，隔离式，覆盖 SHA256/quarantine/安装 exit0/签名/落位/completeness/双落位 diff/补丁/品牌）**只写在 README 与 SOLUTION 里当人工步骤**，`assemble.sh`、`sign-and-dmg.sh` 都不调用；无「干净环境首启」「卸载后重装」用例。

**E2 ·【中】门禁现状**：本轮实跑 `pnpm run gate`（quick）= **17/17 通过（exit 0）**；`gate:full`（含 `patch-anchors`/`scripts-runnable`/`theme-tokens`/`worktable-fence`）**未跑**（会写 build 产物，故本轮未动）。

**E3 ·【中】灰度 SOP 未见落地证据**：`docs/release-gray-sop.md` §5 要求把「灰度：通过/中止 + 观察摘要」写进 `packaging/CHANGELOG.md`，但 2.0.0/2.0.1 条目均无该字段 → 历史版本是否真灰度过，无证据。

**E4 ·【中】回滚语义**：客户重装上一版 + 数据目录按安装器备份语义保留；SOP 已书面提示 rc.1 seeded 会话的降级风险（alpha.1 解析器读不全），需人工导出。

**E5 ·【低】`release/2.0.1` 与仓库任何可复现 staging 都不严格对应**（其记录的 `install.sh` 12,320B 与仓库版 12,266B 差一行）。

---

## F. 合规、安全、品牌

**F1 ✓ 无凭证泄漏**：`credentials.yaml`/`sessions`/`storages` 不在打包面；对 `~/.dsh/skills`、`~/.agents/skills`、`~/.dsh/.agent-presets` 做密钥模式扫描（sk-/ghp_/AKIA/PRIVATE KEY/tvly-）→ **0 命中**。

**F2 ·【中】第三方受限许可随包**：lieflat-charts（PolyForm Noncommercial，禁商用）。

**F3 ·【中】内部工程文档随包**（同 A4）。

**F4 ·【低】上游 MIT 声明未随包**（上游也没带；建议补）。

**F5 ·【低】命名体系不统一**：DMG/卷名 `DSH Desktop LUTE <ver>`｜app 显示名与 CFBundleName `LUTE Agentic System`｜可执行文件仍 `DSH Desktop`｜安装卡称「LUTE Agentic System」｜userData `LUTE Agentic System`。功能正常，但客户认知混乱（决策项）。

---

## G. 与历史灰度坑的对照（哪些已闭环、哪些以新形态复发）

**已闭环（有 commit/断言证据）**：恢复模式（overseas-skills files 清单缺 `templates.js`）、品牌 CSS-module 哈希漂移（运行时解析 + 退役 hero.headline）、品牌改名后 Helper 未重命名、brand-replay 两 bug（花括号/哈希名）、icon.icns 锚点、补丁锚点写死内容哈希名、v1/v2 校验脚本并存、校验默认路径指向已删 staging、completeness 生成器漏 `file:./vendor/`、签名后归档前写入失守、adhoc 下 `--verbose` 判别失效、绝对符号链接/断链阻塞 codesign、双落位 `.DS_Store` 不一致、只读卷不可写、提权判定硬编码、`PKG_ROOT` 多退一层、quarantine 传播、sudo 属主污染、首启向导卡死（P0-7v2c）、wizard 状态 700 权限、P0-7 双锚点重锚、profile 静默回滚（P0-2 日志+.bak）、硬链接断裂（新增装载点字节门禁）、依赖层机器绝对路径（ADR-0055 部分修复）、dmg/pkg 竞态（已加锁但锁本身有缺陷，见 B8）。

**以新形态复发 / 仍潜伏**：
1. **RootOutlet 白屏兜底丢失**（补丁未进 2.0.5 打包面）—— 旧坑、新载体（B3/C4）。
2. **机器路径外泄**（KOL-Hunter：旧坑 `file:` 路径错位的**同类新实例**，这次连 vendor 抽取都够不着）（A2）。
3. **override 层与基座错位**（alpha.1-override vs rc.1）—— 与「rc 迁移后 patch override 层未重锚」同源（C1）。
4. **静默成功**（安装后校验仅告警 + `apply-patches.mjs` 假 `[patched]`）—— 与「profile 静默回滚」同一家族（C3/D3）。
5. **陈旧产物**（2.1.0 payload、staging-src、.app-cache 指纹不足）（B4/B5/B10）。
6. **白屏家族的另一支**：`ERR_UNSAFE_PORT`（宿主随机端口命中 Chromium 黑名单）在**本仓语料零命中**，只在技能手册里；结论不明，需在首启冒烟里加「renderer failed to load」日志断言。

---

## H. 优化修复方案（分层，未执行）

### P0 · 阻塞发布（不修不发）
| # | 动作 | 验收 |
|---|---|---|
| P0-1 | **干净环境首启实测**：在隔离 userData/DSH_HOME 下用真实产物安装并启动，判定 override（alpha.1-override）究竟是否被装载、是否触发 `plugin tree failed to load` | `lifecycle-events/startup.jsonl` 终态 `rendererStatus=healthy` + 0 error；结论书面化后再决定是否剔除 override |
| P0-2 | **KOL-Hunter 依赖治理**（三选一，见决策 K4）：纳入仓库并 vendor 化 / 从 profile 与 bundles 移除 / 特批并写 ADR+门禁豁免 | `rewrite-file-deps.mjs --check` 全绿 + 出货 profile 无 `/Users/lute` 绝对路径 |
| P0-3 | **RootOutlet 守卫重放**：新增 NM 补丁（`dsh-client-ui-renderer`）+ 登记 `patches-manifest-v2.md` + 纳入 v2 锚点 | `verify-patches-v2.sh` 锚点数 ≥36 且 ALL VERIFIED；staging renderer 无 `throw SlotAssemblyError` |
| P0-4 | **弃用 11:06 快照，重新装配**：`BASE=source VERSION=<定档> ./assemble.sh` | payload 内 `tools/verify-patches-v2.sh` 与 `install.sh` 与仓库同源（cmp 一致） |
| P0-5 | **交付版本定档 + 文档对齐**（决策 K1）：VERSION/CHANGELOG/tag/INSTALL-CARD 四方一致；2.0.1 与 repo 不对应的处置写清楚 | `grep` CHANGELOG 有本次条目；卡上 SHA 与真实 dmg 一致 |
| P0-6 | **产物首启 healthy 作为出厂门**（不是人工可选项）：装配→冒烟→DMG→挂载安装→首启，全链跑完才算产物 | smoke 全绿 + 首启日志 healthy + 无「renderer failed to load」 |

### P1 · 打包前必修（低成本、直接降低客户风险）
| # | 动作 | 依据 |
|---|---|---|
| P1-1 | 打包前**提交并打 tag**（或走 `.scratch/clean-checkout-protocol`），禁止从脏工作树出货 | A1 |
| P1-2 | `sign-and-dmg.sh` 锁修复：`LOCK` 移出 `$REL`（或先加锁再删目录） | B8 |
| P1-3 | 退役脚本一致性：不再把 `verify-patches.sh` 打进 `tools/`，README 删除「运行 v1」指令，install.sh 去掉 v1 回退分支 | B4/B9 |
| P1-4 | `install.sh` 三个静默点改为**响亮失败**（`rewrite --check`、`verify-patches-v2`、`brand-replay --check`），并明确「失败=非零退出」 | D3/D4 |
| P1-5 | `apply-patches.mjs` 每步 `try/catch` + **后置断言**（replace 命中数必须为 1 才写盘/才打印 `[patched]`），并把它收回仓库由门禁管 | C3 |
| P1-6 | 出货 profile 清掉 `node_modules/.pnpm/lock.yaml` 等构建机路径（或随包剔除 `.pnpm/lock.yaml`/`.pnpm-workspace-state-*.json`） | C2 |
| P1-7 | 升级语义从「整体替换」改为「**合并 + 升级前清单比对**」，并输出「将移除的插件」清单 | D2 |
| P1-8 | 技能交付范围收敛（决策 K5/K6）：至少剔除受限许可与未引用语料，并把 `p2s-*` 是否随包写清楚 | A3/F2 |
| P1-9 | 剔除随包的内部文档：`profile/vendor/dsh-patches` 只保留客户需要的校验/品牌工具 | A4 |
| P1-10 | 打包前跑 `pnpm run gate:full`（含 `patch-anchors`），并记录输出 | E2 |
| P1-11 | `manifest.json` 体积字段修正；README 锚点数改为动态生成 | B9 |

### P2 · 伴随本次发布（建议）
- P2-1 `smoke-test.sh` 接入流水线（assemble 之后自动跑，失败即不出 DMG）。
- P2-2 新增 `uninstall.sh` + 备份保留策略（`.pre-lute-*` 只留最近 N 份）。
- P2-3 DMG 增加 `Applications` 拖拽布局（若决定支持拖拽路径）。
- P2-4 首启健康探针（`open -a` + startup.jsonl 断言 + 「renderer failed to load」扫描）纳入 smoke。
- P2-5 清理 `staging-src/2.0.0`、陈旧 `staging/*`，`.app-cache` 指纹加内容摘要。
- P2-6 客户交付README 补一段「首次打开：DMG 本体被拦怎么办」——当前文档只写了 app 层。

### P3 · 后续窗口（本次不做）
- P3-1 Developer ID 签名 + 公证（若转正式分发，见决策 K2）。
- P3-2 打包流水线去机器耦合（corepack/DSH_VENDOR/electron 镜像），使其可在干净机或 CI 复跑。
- P3-3 灰度 SOP 落地：CHANGELOG 增加「灰度结论」字段 + 观察指标自动采集。
- P3-4 `ERR_UNSAFE_PORT` 类故障的检测前移（首启日志断言）。

---

## I. 关键决策清单（需你拍板）

| 编号 | 决策 | 选项 | 我的推荐与理由 |
|---|---|---|---|
| K1 | **版本号与交付格式** | A 沿用 2.1.0（清掉旧 staging）｜B 升 2.2.0（因基座解耦+R1/R5/C6 属功能级变化）｜C 另起 3.x | **B（2.2.0）**：内容跨度大、旧 2.1.0 payload 从未发布，避免与陈旧快照混淆；同时只出 DMG（pkg 文档承诺删除或补做） |
| K2 | **签名路线** | A 继续 adhoc + 手工绕过｜B Developer ID + 公证｜C adhoc + 交付内置引导（首次打开向导页） | **A 本次 + P2-6 引导补文档，B 排进下一窗口**：B 需要证书与预算，且会改变交付节奏；但要在交付说明里把「DMG 挂载也会被拦」写清楚 |
| K3 | **打包基线** | A 直接从工作树打包｜B 先提交打 tag 再打包 | **B**：灰度/回滚/审计都要求「客户那版 = 某个 commit」 |
| K4 | **KOL-Hunter 处置** | A 纳入 Magpie-Horch 仓库并 vendor 化｜B 从 profile 依赖与 bundles 移除（不进本次交付）｜C 保持现状并特批 | **A 或 B**：C 不可接受（会把 `/Users/lute/...` 绝对路径发给客户） |
| K5 | **技能交付范围** | A 全量 1611｜B 仅被岗位/映射引用 544｜C 定制白名单（含受限许可剔除） | **C（在 B 基础上加产品必需集）**：至少要剔除 PolyForm 受限技能 |
| K6 | **p2s 语料是否随包** | A 全量随包｜B 只随包被 preset 引用的部分｜C 不随包 | **B**：989 个未引用语料会让客户技能中心噪声过大 |
| K7 | **干净机首启策略** | A 必须跑安装器｜B 拖拽即用（依赖内嵌兜底）+ 安装器为推荐 | **B 保持现状但补文档**：R2b 架构已投入，只是文档与 DMG 布局没跟上 |
| K8 | **打包是否纳入门禁** | A 只人工跑 smoke｜B `gate:full` 增加 packaging 项 + smoke 自动 | **B**：这是「不接受口头验收」的落地方式，成本可控 |

---

## J. 附：本轮实跑命令与输出摘要

```
git status --porcelain | wc -l                 → 82
git -C vendor/dsh-desktop rev-parse HEAD       → 4e23031e…  (== pin lute-sha ✓)
pnpm run gate                                  → 17/17 通过，exit 0
bash packaging/verify-patches-v2.sh            → 35/35 OK（staging/2.1.0 与 /Applications 各一次）
node packaging/scripts/rewrite-file-deps.mjs --check <live profile>
                                               → exit 1（22 处 package.json + 88 处 lock 待重写，属 dev 预期）
模拟 assemble vendor 抽取                       → 23 条 file: 依赖，漏 1 条（KOL-Hunter）
profile 符号链接扫描                            → 27 条，全部指向 profile 内；断链 4 条（均在 .bin，无害）
密钥模式扫描（skills/presets）                   → 0 命中
codesign --verify --deep --strict <staging app> → 0；spctl -a -vvv <dmg> → rejected
```

---

## K. 决策回合定案（2026-09-12）与新增更正

### K 段定案（用户拍板）
| 编号 | 决策 | 定案 |
|---|---|---|
| K1 | 版本 | **2.2.0**（弃用旧 2.1.0 快照语义） |
| K2 | 签名 | **继续 adhoc**，但必须补全「DMG 本体被 Gatekeeper 拦」的交付说明 |
| K3 | 打包基线 | **先提交并打 tag，再打包** |
| K4 | KOL-Hunter | **纳入 Magpie-Horch 仓库并 vendor 化** |
| K5 | 技能交付面 | **被引用集 544 + 产品必需白名单，剔除受限许可** |

### 新增发现（本轮补充取证，P1 级）
**K-1 ·【高】冒烟测试的 vendor 断言与归组后的新布局不匹配 → 正确产物必然假红**
- 事实：归组（ADR-0011 五组目录）后，profile 的 `file:` 依赖变为 `<repo>/packages/<group>/<pkg>`；assemble 据此生成 **嵌套** vendor 目录（模拟结果：22 条全部含 `packages/`，扁平 0 条），`rewrite-file-deps.mjs` 也把 specifier 重写为 `file:./vendor/packages/<group>/<pkg>` —— 两者**自洽**（旧 2.1.0 payload 是扁平代，属归组前形态）。
- 但 `packaging/scripts/smoke-test.sh:67` 与 `:127` 仍硬编码扁平路径 `$P/vendor/dsh-theme-local` / `$BUNDLED/vendor/dsh-theme-local` → **对全新的正确 payload 必然失败**。
- 影响：唯一端到端出厂校验会给出假红，重演「假 DRIFT 训练人忽略输出」的旧剧本（见 `loop2-4-anchor-drift-evidence.md`）。
- 附带更正：「`rewrite-file-deps.mjs --check` 对 live profile 退出码 1」是**设计语义**（`if (check && changed > 0) exit 1`；dev profile 必须保留绝对/相对路径），不是缺陷；真正的缺陷是 `install.sh:150` 用 `|| true` 吞掉它（已列 D4）。

**K-2 ·【中】install.sh 的 override「纵深防御」三分之二是空转**
- 事实：`assemble.sh:187` 与 `install.sh:187` 都循环 `dsh-llm / dsh-tool-subagent / dsh-file-reference-local` 三个包，但 profile 的 `node_modules/@deepseek-ai/` 下**只有最后那个存在**（本轮实测前两个 ABSENT）；这两个包实际只靠 app 侧 NM 补丁（`packaging/patches/nm/@deepseek-ai/dsh-llm/lib/index.js.patch` 等）承载。
- 影响：升级路径里 `rm -rf node_modules/@deepseek-ai/<o>` 的两次循环是空操作；若将来 app 侧补丁被上游合并掉，这里会静默失去兜底。

**K-3 ·【中】`-override` 的版本比较方向是错的**
- 事实：`apply-patches.mjs` 用 `version += "-override"`，注释写「Bump so profile copy wins the semver overlay compare」；但 `0.1.2-alpha.1-override < 0.1.2-rc.1`（pre-release 段 `alpha < rc`）→ 该副本在 overlay 比较中**永远赢不了** app 侧的 rc.1。
- 含义：这份 profile 里的 `dsh-file-reference-local@0.1.2-alpha.1-override` 是 alpha.1 时代的化石，既不生效也无收益（且带着 rc.1 不存在的符号引用）。P0-1 的干净环境实测应直接把「移除 or 重锚」作为结论之一。

**K-4 ·【信息】三代 bundle 数不一致（本次重建后自然收敛）**
- 内嵌兜底（本机已装 app）= 30 bundles（含 `@furongjun1999/dsh-memory`、`dsh-vision-router`）；已发货 payload 2.1.0 = 33；当前 dev profile = **39**。
- 归因：本机运行的 app 早于 dev profile，非缺陷；但说明「本机运行时行为不能代表下次构建的兼容性」——P0-1 必须在**本次新产物**上做，不得沿用本机结论。

**K-5 ·【信息】`LingShu/dsh-memory` 相关补丁目标已消失**
- `dsh-memory` 已不在 profile 依赖中（板上 Loop 4 的陈旧库处置）；`verify-patches-v2.sh` 已无 `LING_SRC`/`dsh-memory` 锚点；`install.sh.200.bak` 里的 `LING_SRC="$PROFILE_DIR/vendor/dsh-memory-local"` 属旧代遗留。若 `apply-patches.mjs` 仍有指向它的步骤，应随本次收敛为「跳过并打印原因」，而不是静默。

### K 段增补定案（第二轮）
| 编号 | 决策 | 定案 |
|---|---|---|
| K6 | p2s 语料 | 由 K5 隐含：未被岗位/映射引用的 989 个 p2s 不随包 |
| K7 | 干净机首启 | **拖拽即用 + DMG 做成拖拽布局**（不是「安装器优先」） |
| K7b | 内嵌载荷范围 | **全量内嵌：profile + skills + presets + aeis** |
| K8 | 打包入门禁 | patch-anchors 扩到打包面 + smoke 自动跑 |
| K10 | 随包内部文档 | 剔除内部取证文档，只留校验/品牌/重写工具 |

### K7b 的五个连锁影响（必须在实施前纳入设计）
1. **兜底逻辑要改基座**：现状 `main.js:5317-5319` 只 `cpSync(dsh-profile/profiles/<name>)`。要扩成 profile + skills + presets + aeis 四个面 → 属 P0-7v2 家族补丁面的扩展，需重锚、登记 `patches-manifest-v2.md`、进 v2 锚点（否则重演「补丁静默丢失」）。
2. **codesign 断言面必须同步扩大**：aeis 历史上有过 `/opt/homebrew` 绝对符号链接把整个 bundle 的 `codesign --deep --strict` 拖死（RETROSPECTIVE §2/§3 #1）。现有断言只覆盖 `$BUNDLED`（内嵌 profile）——必须扩到新增的 skills / presets / aeis 三个落点，否则签名会再次被拒。
3. **包体与首启时长**：内嵌从 766M 增至约 880M～950M；app.tar.gz 约 +70～110M，DMG 同步上涨。首启 `cpSync` 近 1G → 客户会感知「长时间无反应」，需要进度提示或至少文档预期管理。
4. **载荷重复**：安装器仍需 `skills-presets.tar.gz` 与 `aeis-portable.tar.gz`，于是这两份会**在 DMG 里出现两次**（app 内嵌一份 + 卷根一份）→ 约 +110M。取舍：保留双份（不动 install.sh，最稳）／让 install.sh 优先从 app bundle 内嵌副本取用（省体积，但要改安装器）。
5. **磁盘与权限前提**：拖拽路径没有 install.sh 的「≥3G 可用空间」门槛，但首启实际要落 ~1G；需要在兜底逻辑或文档里补一个可用空间前提。

