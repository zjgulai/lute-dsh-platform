# 09 · 架构层债务审计 — LUTE Agentic System（DSH Desktop 2.0.5 定制平台）

> 架构审计子代理产出 · 2026-09-10 · 全程只读（仅写本报告）
> 叠加基线：`docs/panorama-code-diagnosis-report.md`（包级 + 四大横切模式）与 `docs/upgrade-2.0.5-window-plan.md`（段⑤）；本文不重复其发现，只做架构层视角的叠加与展开。
> 主要输入：`docs/research/01/02/05/07/08`、`docs/architecture.md`、`dsh-patches/*`、`packaging/*`、`~/.dsh` 与 `~/.agent-memory` 实测（证据快照见 §7）。
> 标记约定：🟰=已识别（panorama/01-08 已知，此处仅归位）；🆕=新增（本审计首次提出的架构层债务）。

---

## 1. 平台实际分层架构

### 1.1 分层图（现行形态，自下而上 = 官方 → 定制）

```mermaid
flowchart TD
    subgraph L1["L1 官方壳直补层 · app.asar.unpacked（267M，官方 asarUnpack 载体）"]
        direction TB
        A1["lib/main.js、client.js、electron-runtime-DS52LbUW（2.0.5→DLNj0vyk）等编译产物直补<br/>35 文件 / 25 个 @deepseek-ai 包 + 宿主 lib 本体"]
        A2["品牌面：web-frontend 哈希资产、native-ui、Info.plist、Helper 重命名（brand-replay 11+N 锚）"]
        A3["`.orig`/`.bak`/`branding-backup`/heal 基线 备份面"]
        A4["staging-src/2.0.0（手工解包 + 重锚现场，gitignored）"]
    end
    subgraph L2["L2 profile 插件层 · ~/.dsh/profiles/desktop"]
        B1["package.json：30 deps（16 file: + 14 npm）+ dsh.profile.bundles 30 项<br/>（cordis.yml 会被重置为 []，注册真相在 package.json）"]
        B2["apply-patches.mjs：postinstall 幂等补丁<br/>现存 8 条活跃（第三方包 post-hoc 守卫）+ 2 条退役台账"]
        B3["node_modules（nodeLinker: hoisted）= workspace lib 的部署副本（现存拷贝而非硬链接）"]
        B4["data/lingshu.db（灵枢 252 天数据）· bak 文件堆（6 个 package.json.bak-*）"]
    end
    subgraph L3["L3 vendor fork 层 · /Users/lute/project/Magpie-Horch"]
        C1["双形态 ×4：memory / team-gui / browser / deepresearch（src + lib + tests）"]
        C2["skill-center fork（0.3.6→0.4.0，同步官方 2.0 线）"]
        C3["薄包 ×8 + wanzh-hulian / my-quotes / loopx / overseas 两包"]
    end
    subgraph L4["L4 preset 层 · ~/.dsh/.agent-presets（15 个）"]
        D1["preset.yml + manifest + 头像资产<br/>icon 通道依赖 L1 补丁（PR-1）"]
    end
    subgraph L5["L5 skill 层"]
        E1["~/.dsh/skills 252 + ~/.agents/skills 12（+6 disabled）"]
        E2["81-Skills 数据链（85 项；user_summary 81/81 · user_try 15/15 链）"]
    end
    subgraph L6["L6 patch/apply 工具层 · dsh-patches/（git disabled）"]
        F1["patches-manifest v1/v2（唯一权威登记簿）"]
        F2["verify-patches.sh（2.0.4 · 31 锚）/ verify-patches-v2.sh（2.0.5 · 35 锚）"]
        F3["brand-replay.sh / profile-apply-patches.mjs / assemble-bundle.sh / lint-preset.mjs"]
    end

    C1 -- "file: 安装（tmp+mv 保硬链接纪律）" --> B3
    C1 -. "构建产物漂移风险（模式①）" .-> B3
    B2 -- "postinstall 静默改第三方包 node_modules" --> B3
    D1 -. "PR-1 icon 透传落在 L1 补丁（profile override 失效）" .-> A1
    L5 -. "skills-presets.tar.gz 随发行" .-> PACK["packaging 流水线"]
    A4 -- "DSH_APP 环境变量输入（默认 /Applications 生产态）" --> PACK
    L6 -- "锚点校验/重放 gate" --> PACK
    PACK --> REL["release/1.0.0…2.0.0 → GitHub Releases + 灰度"]
```

事实要点：**六个层都真实存在且互相垂叠**；其中 L4（preset）的功能面被压到 L1（shell 直补）实现，是最强的跨层耦合（见 1.2 表 L4 行）；L6 工具层是唯一跨全部层的一致性防线。

### 1.2 逐层债务表（耦合点 · 变更半径 · 单点脆弱）

| 层 | 债务项 | 标记 | 上游升级（2.0.6/2.0.7）变更半径 | 单点脆弱 |
|---|---|---|---|---|
| L1 官方壳直补层 | 直补深度超出节点层（lib 本体 + 25 平台包，35 文件）；`.orig`/`.bak` 备份面、heal 基线、branding-backup 与 UI-UX-audit 多套并存 | 🟰（01 §3/§8.1；panorama 模式②） | 逐锚重推（07 §1 A/B/C/D 处置表 + §1 checklist 10 步），预期 35 锚全红起步 | 内容/字符面锚定 minified 产物——上游换压缩器/minify 参数即群体漂移 |
| L1 | **直补层没有 VCS**：dsh-patches 是 `.git.disabled`+登记簿制；「带补丁的 app」唯一存在于机器状态（/Applications 或 staging-src） | 🆕 | 升级必须先跑 snapshot 对比两处机器态；回滚依赖手工备份堆 | 登记簿-现场一致性靠 verify 脚本反向校验；任何绕过 manifest 的直接编辑成为「影子补丁」（已知案例：heal 目录即为绕过产物） |
| L1 | **双基座漂移**：生产 /Applications=2.0.4（alpha.1）+ 35 直补；发行线 staging-src/2.0.0=2.0.5（rc.1）+ 重锚 35 补；同一语义（如 P0-3）在两条基线上各有变体 | 🆕 | 2.0.4 退役前每次窗口都要维护两套锚（verify v1/v2 双轨即其 symptom） | 生产回滚目标（2.0.4）与发行目标（2.0.5）语义分叉；补丁语义在两基座间不同步即「回滚=丢修复」 |
| L1 | 哈希类/哈希文件名结构性锚：~~`_37cUPa_*`（hero）、`q2FAPq_root`（StatsLine）~~ **已于 2026-09-11 迁移为运行时解析（ADR-0019）**、`bC90nG_*`（卡片头像 CSS 前缀）；`electron-runtime-DS52LbUW`→`DLNj0vyk`、`update-checker-Mw2EmLOX`→`DaaZGYGQ`、`web-frontend` `index-D-eoFxDP` 等哈希产物名 | 🟰（panorama root-brand/theme 行；07 §6 🐛） | 每个 release 重新探测哈希映射（brand-replay 已参数化 +2 bug） | bundler 哈希每次构建必变；当前靠「选择器 miss 即自然降级」把失败降级为退化，不会崩溃但**静默退化本身不可观测**（无 miss 告警） |
| L1 | root-brand slot 选举依赖未文档化规则：三席（sidebar.brand.mark/name、conversation.hero.brand.mark）以 priority −100 注册，依赖「registry 选取最低优先级」这条私有语义 | 🆕 | 上游若改选举方向/引入同席竞争即三席全灭 | 单行私有契约承载整个品牌身份面；无 type/test 约束，静默失效 |
| L2 profile 插件层 | file: 安装的三形态漂移（workspace src → lib → profile 副本）；「改了即生效」直觉失效 | 🟰（panorama 模式①；architecture.md 红线 4） | 升级窗口内所有 vendor 包重建+三验（段⑤ §0） | profile 副本与 workspace lib 目前**内容一致但 inode 独立**（本审计实测：等拷贝态）——同步纪律一旦跳过即静默回旧版（case#8 教训已编码但无 preflight 强制） |
| L2 | postinstall 自动改写第三方包（apply-patches 8 条活跃：noema ×2、better-sidebar、dshmarket、modlens、dsh-context…）；profile 层存在 6 个 `package.json.bak-*` 与 apply-patches.orig 残堆 | 🟰（01 §3.6；panorama ④）+ 🆕（残堆治理） | 每次 `dsh plugin add`/重装即重放；npm 版第三方包升级（noema rc 更新线）需逐条重验 | 对第三方包的 patch 无上游登记处（非本工作区管理），是**唯一没有 fork 出口的补丁面**——退役条件不存在，只能靠包作者上游修复（B 类语义重推永远开放） |
| L2 | 配置状态不在 VCS：deps/bundles/cordis.patch.yml 的真身是机器文件 + bak 堆；「域外事件」（如 agent-team-gui 被移出 deps）只靠文档留痕 | 🆕 | 升级/重装时 profile 状态重建依赖安装器 manifest，人工改动漂移无告警 | profile 层是「隐式数据库」，audit 只能靠 snapshot 工具 |
| L3 vendor fork 层 | 双形态 ×4 + skill-center fork；deepresearch type 矩阵阻塞 lib 重建（唯一现存镜像补丁）；team-gui clean-build 曾破坏 hardlink | 🟰（panorama 包表 + 段⑤ §3） | 2.0.5 窗口内 deepresearch 退役镜像层、team-gui 改 in-place 构建并 preflight 断言 | 构建纪律靠人（三验 SOP），无机器 gate |
| L3 | 文案驱动导航（openTeamSettings：`role=dialog` 内按钮文本匹配 `["小队","Teams"]` + `/ 设置\|settings/i` aria 正则 + 12×50ms 轮询重试） | 🟰（panorama §5 预告） | 宿主改 aria 结构/本地化文案即退化为「重试 12 次失败」（UI 不动，静默） | 失败不可观测；多语言场景（en 只有 "Teams"）已暴露对 locale 的双索引假设 |
| L4 preset 层 | preset 功能 = L1 直补（PR-1 icon 透传、PR-2/5 卡片 CSS）；profile override 通道对平面包（agent-presets 类）失效 → 必须直补新 app checkout | 🆕（01 §5.1 已列出 15 presets；07 §0.2 已述事实，此处升格为架构债务） | 每次基座升级 preset 面整体重锚（12–15 目录×yml+icon），且**没有 verify 锚覆盖 preset 面**（verify v2 的 PR-1 仅锚宿主侧透传代码，不锚 preset.yml 内容） | 跨层耦合使「改个头像」也进入 shell 重锚成本；preset 面出现回归时无探测工具 |
| L5 skill 层 | skills-presets 单 tar 随包（252 skills 3.9M）；数据链 API parity（user_summary 81/81、title 251/265）是唯一回归面 | 🆕（panorama 明示不动 skills 数据链，此处只登记载体结构） | 发行时全量同步用户基线；客户机上自装技能与包内技能同名冲突策略未定义 | parity 检查是事后统计而非 gate；title 差 14 项即漂移例证 |
| L6 patch/apply 层 | 锚点数演化无冻结机制（32→34→35）；verify v1/v2 双轨；brand-replay 哈希名参数化刚做完 | 🟰（08 §6 接受债务 B5/B6；07 §6） | 每窗口人工比对新旧锚差集 | 锚=登记簿=重放脚本三者一致性无机器校验（新增项只改 verify 不改 manifest 即漏） |

---

## 2. 打补丁架构的可持续性（35 补丁 / 35 锚 → n+3 重锚成本模型）

### 2.1 锚点三级分类（对 verify-patches-v2.sh 35 锚逐条归类）

| 级别 | 定义 | 锚点（节选/计数） | 2.0.4→2.0.5 实测表现 | 稳定性 |
|---|---|---|---|---|
| **内容锚（稳）** | 语义代码片段（源码级字符串），grep 可在任意 minify 产物中命中 | P0-3 `imageRequestPricing?.(provider, model)`（含 types 副本）、P0-4 `Promise.resolve(fiber.dispose())`（3 处）、cordis clamp、loader B-4、clipboard fall-through、skill-title ×6、LB ×2、chatui ×3、P0-1/2/6/8、RECOVERY_DOCUMENT，约 **28/35** | 「锚点与 alpha.1 逐字一致」「rc.1 逐字全命中」（07 §6）| 高：受上游语义重构才失效（P0-8 pi-ai 在 rc.1 被上游重构即实例） |
| **语义重推锚（中）** | 上游同段代码结构变化，需按新结构重新设计等价补丁 | P0-8（rc.1 已重构 lazy → 需冒烟判复发后重推）、UI-1 ErrorBoundary（B 表）、chatui loadOlder（rc.1 catch 别名漂移，已适配） | 每次上游重构触发；成本 O(读源码) | 中：跟上游迭代节奏，不可预算 |
| **结构锚（脆）** | 文件名/结构位置/DOM 槽位级 | ① `electron-runtime-DLNj0vyk.js`、`update-checker-DaaZGYGQ.js`、`index-D-eoFxDP.js` 等哈希产物名（brand-replay 脚本内）；② main.js 结构块（P0-7v2 依赖 createFreshDesktopProfile + profile-manager 双锚点，2.0.5 时原单锚静默失效——**盲区实验 2.1 才揪出**）；③ CSS-module 哈希类（bC90nG 仍钉 2.0.4；~~_37cUPa/q2FAPq~~ 品牌侧已由运行时解析取代，见 ADR-0019）；④ native-ui `desktop-dialog-C6qDR3Sk.js`（UI-3 在 2.0.5 已不存在） | 每次构建必变或每次升级需重探测；07 §6 已为 ① 参数化 | 低：**每次上游 release 自动全红** |

### 2.2 n+3（2.0.6/2.0.7）重锚成本模型

```
单窗口总成本 ≈ Σ(锚点级成本) + 固定流程成本 + 不可预算项
  内容锚 28 项 × ~10–20 分钟（verify 全红→重放→node --check→单锚验证）≈ 1 人日
  语义重推 2–4 项 × 0.5–1 人日（含 staging 冒烟判定）              ≈ 1–2 人日
  结构锚 ①②③④: ①已参数化 ~0；② main.js 重读 ~2h；③CSS 哈希组重探测 ~2h；
               ④按上游新结构重做（0.5–1 人日，且 UI-3 类可能直接淘汰）
  固定流程：P1 checklist 10 步（staging 骨架→verify 全红→A 表重推→B 冒烟→C 回移
            →cordis diff→preset 直补→brand 重录→verify 全绿→manifest 转正）≈ 1 人日
  验证链：verify 35 锚 + brand + smoke 37 断言 + 真实启动 healthy + 灰度观察窗（1–2 周老客户）
  不可预算项：上游结构性重设计（P0-7 型，2.0.5 实测 0.5 人日 + 用户拍板 1 轮）+ 上游回摆期风险（02 §5.3 master revert 波动）
→ 基线估算：每个升级窗口 3–5 人日 + 1 轮用户拍板 + 1–2 周灰度；随锚点数线性增长
```

模型含义：**当前成本主导项不是数量而是三种结构锚 + 上游重设计**；内容锚已近零边际成本。因此可持续性的杠杆点是压缩第③④类（转官方面，见 2.3）与把「锚-登记簿-重放」三者绑定机器校验（防漏锚）。
盲区风险须计入：2.0.5 的 P0-7 原锚点**静默失效**靠盲区实验才发现——verify 脚本（grep 产物）无法发现「补丁已不再被任何执行路径触达」这类**语义性失效**；建议每窗口强制跑兜底/首启触发实验（08 §2.1 已形成纪律）。

### 2.3 补丁退役转换表（→ 官方 config/slot/token 面；对标窗口方案 §4）

| 补丁 | 转换方向 | 2.0.5 官方面现状 | 退役判定式（建议） |
|---|---|---|---|
| theme #4（no-op 已删） | 已退役 | — | 已完成（段④） |
| memory roleplay / deepresearch http 守卫 | src 原生 + 文件级补丁层 | 待 2.0.5 窗口 lib 重建 | `tsc+tests 全绿 且 lib 重建在位` → 同窗口删对应 apply-patches 条目（段⑤ §1.3 已排程） |
| ~~brand 哈希类 `_37cUPa/q2FAPq`~~ **已退役（2026-09-11，ADR-0019）** | 运行时按 `data-plugin-css` 解析类名 + 失败自报 | 已落地：两代前缀同一实现覆盖，缺锚时报 `degraded` | 剩余路径：官方席出 token 化 slot（可注册组件而非 hide-DOM）→ 再退役整套 DOM 改写；若上游重命名 `HeroShell/StatsLine.module.css` 则需重锚模块 id |
| theme `:root` 注入 | 官方主题 token（`--dsw-*`）全面化 | inject 列表已对齐（源包原生） | 官方 overrideTokens 覆盖 `:root` 全量重定义语义 → 降级为纯 user 侧配置 |
| team-gui 文案导航 | 申请宿主 imperative settings API/slot 属性 | 无公开 API（代码注释自认） | 官方 `settings.open(section)` 类 API 出现 → 删 openTeamSettings 文本锚 |
| PR-1 icon 透传 | 向上游提 PR（字段已在 schema，仅缺透传） | 2.0.5 仍缺（verify v2 PR-1 两锚为准） | 上游版本含 `record.icon` 透传 → 删 L1 两锚 + preset 面脱离 L1 |
| skill-title ×8 包 | 上游 PR（title 字段 schema 已有，缺 UI 透传） | 同上 | 上游透传 `skill.title ?? skill.name` → 删 6 锚 |
| chatui ×3 | 上游 issue（loadOlder 已部分自愈） | 追踪合并状态 | 上游合并+发布 → 同步删除 |
| P0-2/P0-6 安全类 | 上游 master `local-window-policy.ts` 回移 | C 表已完成 2.0.0 窗口 | 持续观察上游节奏，每次 follow-up diff 决策 |
| 永不可退役类 | noema status/ledger、better-sidebar 文案、modlens 门、dsh-context 归类（L2 第三方包） | 无出口（见 1.2 L2 行） | 上游/包作者修复或包纳入本工作区 fork——这是**apply-patches 的永久补丁池**，应在 manifest 中单列「无退役路径」类，防止误期待其消亡 |

---

## 3. src/lib 双形态治理架构（建议方向，不写代码）

现状快照（本审计实测）：4 包 workspace lib ≡ profile 副本（内容逐一 identical），但 **inode 独立（拷贝态）**；deepresearch 是唯一残余「镜像补丁层」（P0 阻塞 type 矩阵）；team-gui 曾以「原子替换式重建」破坏 hardlink（case#8）。

建议的统一治理形态（按优先级）：

1. **以「in-place 写入 + hardlink 保持」为默认形态**；「镜像补丁层」仅作为 type-blocked 包（deepresearch 现状）的过渡机制，且**必须内建自动退役条件**——退役判定式与 §2.3 行 2 相同（sdk 线对齐日 = 镜像层删除日，写进段⑤窗口 checklist 而非备忘）。
2. **把「三验」从 SOP 升格为机器 gate（pnpm preflight）**：内容哈希比对（workspace lib vs profile 副本）+ inode 漂移检查 + `relink` 自动修复；失败的含义是「构建纪律被跳过」，应当场拒绝发布——这是模式①（源/产物断裂）的架构级关闭动作。
3. 每个 vendor 包声明**形态登记**（三态之一：src-native 构建 / 纯 lib 无源 / 镜像过渡），写进包内 README 或 manifest，使「是否需要构建纪律」可被工具枚举，而不再依赖团队记忆（当前 17 个 file: 包里只有 4 个需要，靠记忆区分）。
4. **不再新增任何「改 lib 不改 src」的补丁**：apply-patches 台账已改为 retired/active 二段式（好范式），新条目一律要求给出「退役条件」，无退役条件的新补丁默认拒绝（架构红线级约定）。
5. 构建前提统一：devDeps 全线对齐单一 rc 线（2.0.5 窗口 §1.1 已排程）；tsconfig 参考系统一 published 包，减少 deepresearch 型阻塞再现。

---

## 4. 构建/发布流水线架构

### 4.1 当前链形态

```
官方 2.0.5 DMG
  →（人工解包 + 07 §1 SOP D 轨重锚）→ staging-src/2.0.0/{app,profile}   ← 手工目录，gitignored
  → assemble.sh（DSH_APP 环境覆盖；默认仍指向 /Applications 生产态）
      ├ §1 app 拷贝 + app-update.yml 禁用 + CFBundleVersion 2.0.5-lute.$V + P0-8 内联 + 图标
      ├ §2/2b profile + vendor + overrides + 离线 node_modules + 内嵌 dsh-profile 双落位 + adhoc 深签名
      ├ §3 skills-presets / §4 aeis-portable / §5 安装器+tools / §6 元数据
  → smoke-test.sh（隔离安装 + 37 断言 + verify v2 35 锚 + brand + R2b 一致性 + 真实启动 healthy）
  → sign-and-dmg.sh / build-pkg.sh（release 目录锁）→ release/<v>/{dmg,pkg,SHA256SUMS,VERSION,manifest.json}
  → GitHub Releases 附件 → 灰度名单（1–2 老客户 1–2 周）→ 全量
```

### 4.2 结构性脆弱清单

| # | 项 | 标记 | 说明 |
|---|---|---|---|
| 1 | 构建源真相 = 机器状态：assemble 的 DSH_APP 默认 /Applications（现为 2.0.4 生产机态），实际 2.0.0 版靠人工传 env 指向 staging-src；staging-src 为手工目录 | 🆕 | 无人保证两台构建机产出同 payload；「staging-src 的补丁状态」无内容寻址记录 |
| 2 | verify v1/v2 双轨 + brand-replay 两 bug 刚修；锚=登记簿一致性无机器绑定 | 🟰（B5/B6 已接受）+ 🆕（绑定缺失） | 见 §2.2/§2.3 |
| 3 | 并发锁：release 目录 mkdir .build.lock 抢占式（08 §1.5 已根治）；staging 全清重建 `rm -rf "$STAGE"` 未加锁 | 🟰 + 🆕（staging 侧） | dmg/pkg 同 release 目录已串行；assemble 并行未见保护 |
| 4 | 路径参数化程度：中等偏上（DSH_APP/DSH_HOME/DSH_VENDOR/PROFILE/OUT/VERSION/LUTE_USERDATA 全可覆盖），但默认值含构建者绝对路径（verify-v2 默认 `/Users/lute/...`、DSH_VENDOR 同） | 🆕 | 换机/换人即踩坑；CI 化前必须清零硬编码默认 |
| 5 | **构建可复现性缺口**：BUILD=`date +%Y%m%d-%H%M%S`（时间语义，非内容语义）——同输入两次构建产出不同 BUILD 与不同 tar mtime；未记录上游官方 DMG 的 SHA（基线无内容锚）；无 SLSA 类 provenance（基线哈希→补丁集→构建输入→产物 的可审计链缺失）；签名面：adhoc 未公证、pkg productsign 不可 adhoc → 完整性完全由同通道分发的 SHA256SUMS 承担 | 🆕 | 对私域客户分发可接受，但不可扩展到任何需要供应链审计的场景；BUILD 时间语义也使「重现某个历史 payload」不可判定 |
| 6 | 产物未分层分通道：DMG 685M 单体（app 489M+profile 151M）；Vendor 21 包全量随包 | 🟰（01 §8.7） | 客户升级即全量重下；与「月度观察窗」节奏叠加时带宽成本被放大 |
| 7 | staging（6 版本+日志）与 release 目录、staging-src、`assemble.sh.200.bak` 等历史残堆共存于 packaging/ | 🟰（01 §5.3）+ 🆕（.bak 脚本） | 目录治理靠 .gitignore，人读不可辨「哪个是权威」 |

### 4.3 建议方向（无代码）

- 定义**基线入口单点**：新窗口以「官方 DMG SHA256 + 重锚后 staging-src 快照哈希」入 manifest（VERSION 文件扩两项），使构建输入可审计、可复现判等。
- BUILD 换内容语义（输入哈希的短摘要 + 时间戳仅作展示字段），并把 verify 锚清单/brand 清单/completeness.json 一并写入产物 provenance 段。
- verify v1 与 2.0.4 基座同时退役（结束双基座即结束双轨），退役动作并入 LUTE 全量切换 2.0.5 的同窗口，避免「删了 2.0.4 锚却发现要回滚」的死锁。
- 脚本默认值全部改为「必填或从 env」；把流水线中「人工 SOP」（staging-src 重锚 10 步）脚本化成 checklist 门（每步一个 exit code），使 assemble 只接受通过 gate 的 staging-src。

---

## 5. 数据/存储架构（归属、边界、格式演进风险）

### 5.1 存储全景与归属边界

| 存储 | 位置（实测） | 归属（写入方） | 边界与生命周期 | 标记 |
|---|---|---|---|---|
| 会话源`session.jsonl.zstd` ×259 / 225M | `~/.dsh/sessions/<cwd-slug-->/<id>/` | 官方 `dsh-session-persistence-jsonl` | 按工作区 cwd 分隔（含 team-hub 三个 workspace 独立分桶）；升级保留 | 🟰（01 §4） |
| 投影缓存 ×259 / 144M | `~/.dsh/storages/session_projcache/sessions/*.json`（格式 version 4） | 官方投影服务（rc.1 演示可从 alpha.1 全量重建 248 项） | **与源同数双份**（259=259，见 §5.3 风险 3） | 🆕 |
| 主 sqlite | `~/.dsh/storages/dsh.sqlite`（units/unit_globals/u_*） | 官方 storage 服务（unit 版本模型；现仅 `deepresearch` v3 一个 unit） | 插件建表 `u_*`；粒度=插件 | 🟰/🆕 |
| 灵枢库 | `~/.dsh/profiles/desktop/data/lingshu.db`（212K + **WAL 4.1M**） + `~/.dsh/aeis-venv`（43M） | dsh-memory-local（fork）+ aeis Python | **profile-scoped**：数据随 profile 名 scoped，profile 重建/改名即数据搬家问题；安装器只保「data/ 不动」 | 🟰（段① D2/D7）+ 🆕（scope 耦合） |
| noema 库 | 记忆 root 默认 `~/.agent-memory`（2.3M；NOEMA_ROOT 为空）+ ledger `~/.dsh/storages/dsh-noema-imports.json` | @zseven-w/dsh-noema（npm 第三方） | **根在 DSH_HOME 之外**——备份/导出 SOP 与安装器「保 data/」均不含它；双配置面（宿主 settings.yaml + 用户 home） | 🆕 |
| my-quotes 索引 | `~/.dsh/my-quotes/{index.jsonl,meta.json,overrides.json}`（288K） | dsh-my-quotes | 可删重建（MQ-4）；消费端为 O(sessions) 全扫+zstd 多帧解码（与官方 persistence 同构的**格式 parity 依赖**） | 🟰（MQ-2）+ 🆕（parity） |
| 杂项 | `storages/agent_team_gui.json`、`workspace.json`、dsh-pocket 37M、attachments 86M | 各插件 | 无统一清单 | 🟰（01） |

### 5.2 三记忆库的边界结论

- 三个库落位三种 ownership：**插件私有 profile 数据（灵枢）/ 宿主外用户数据（noema）/ 派生索引（my-quotes）**——但没有一处文档声明「升级/迁移时谁负责搬谁」；当前 install.sh 只承诺 `data/` 原地保留（升级保留语义），跨机迁移全靠人工（README「需迁移时单独导出」）。
- noema 的 `~/.agent-memory` 出走 DSH_HOME 是最典型的边界破洞：它是唯一*不*被 packaging（skills-presets）、不被 install.sh（data/ 保留）、不被任何 verify 锚覆盖的产品级记忆资产。

### 5.3 rc.1/2.0.5 之后的格式演进风险

| # | 风险 | 事实依据 | 触发窗口 |
|---|---|---|---|
| 1 | **SESSION_FORMAT_VERSION=0 但 seed 形状演进**：常量冻结≠内部 shape 冻结；「本构建不认识的每个事件类型都会拒绝重建」（fail-closed）。升后写新事件类型/seed 形状的会话，旧构建拒绝打开（错误文案明确要求升级 harness） | dsh-session README.zh:173 + 降级兼容实验（08 §2.3：seeded 会话为唯一风险面） | 2.0.5→0.1.5 线（上游 master 已带 V2→V3 JSONL 迁移，PR #898） |
| 2 | 会话持久层将做真格式迁移（V2→V3 JSONL + keyed `main` 槽位 + 编码变更可选独立新根）：**这是 n+1 内最大的数据工程**（不兼容回写、双根并存、旧根只读化决策） | 02 §3.3（master 功能级） | 0.1.5 升级窗 |
| 3 | 投影缓存双份：259 zstd（225M）+259 json（144M）恒等双份；全量重建成本已被 rc.1 演示（248 项）；但**重建触发条件与缓存失效语义未成文**——升级 SOP 未声明「换 runtime 即整缓存作废重建」，目前靠隐式假设 | 本审计实测 + 05 §基座层⑤ | 每次基座升级 |
| 4 | my-quotes 的 zstd 多帧解码与官方 persistence **同构耦合**：上游改容器参数（编码配置/新根/文本模式）即需同步改 dsh-my-quotes 解码器，否则静默索引停更（索引 stale 无告警通道） | my-quotes lib 源码解析 ZSTD_MAGIC/逐帧头的实现 + 上游 jsonl README（改压缩需全新根） | 同风险 2 窗口 |
| 5 | 灵枢 dbPath：D7 修复后锚 `profiles/desktop/data/`（252 天连续性已保）；但路径属 profile-scoped——profile 改名/多 profile 并存时「同 build 找不同 .db」；另 WAL(4.1M)≫主库(212K)，checkpoint 压力与备份窗口风险 | 段① D2/D7 + 本审计实测 | 多 profile / 云同步启用时 |

---

## 6. 架构级建议方向汇总（无代码）

1. **确立「单一基座」目标态**：2.0.4 生产线与 2.0.5 发行线合并（LUTE 2.0.0 全量灰度转正 + 2.0.4 锚/备份面退出），双基座是双轨 verify、双份重锚成本的根源（§1.2、§4.3）。
2. **给「锚-登记簿-重放」三元组建机器校验**：新增/删除补丁必须三处同改，任何一处缺改在 CI/preflight 被拒；锚清单随产物 provenance 出厂（§2.2、§4.3）。
3. **结构锚清零计划**：按 §2.3 转换表逐项把 L1 直补迁向官方 config/slot/token 面；无法退役的第三方包补丁池单列「永久项」并设上游跟进节奏（每月观察窗 + diff 决策）（§2.3）。
4. **三验升格 preflight gate**（内容哈希 + inode + relink 自动修复），vendor 包做形态登记；镜像补丁层一律带自动退役条件（§3）。
5. **preset 面脱离 L1**：PR-1 上游化后，preset 面进入纯配置层，且为 preset 内容加 verify 面（当前 preset yml/icon 完全无锚）（§1.2 L4 行）。
6. **构建可复现性最小集**：官方 DMG SHA + staging-src 快照哈希 + 内容语义 BUILD + 产物 provenance（含 verify/brand/completeness 清单）（§4.3）。
7. **数据边界文档化**：一张「升级保留 / 迁移导出 / 随包」三列表覆盖 sessions、projcache、dsh.sqlite、lingshu db+venv、`~/.agent-memory`、my-quotes、attachments、credentials；投影缓存重建与 noema 记忆 root 纳入升级 SOP 明文（§5）。
8. **影子补丁观测面**：对 CSS 哈希选择器 miss、team-gui 文本锚重试失败、my-quotes 索引 stale 等一切「自然降级」路径加统一告警通道——panorama 模式④（静默假健康）在架构层的收口（§1.2 各行「静默退化」）。

---

## 7. 证据快照（关键实测，全部只读）

```text
# 分层与复制形态
ls -i dsh-memory-local/lib/index.js (249963235) vs profile 副本 (240801013) → inode 独立、cmp IDENTICAL（4 包同验）
wc -l ~/.dsh/profiles/desktop/apply-patches.mjs = 213（9 节，2/3 退役台账；8 条活跃 [ok]×8）
grep -cE "^ck " packaging/verify-patches-v2.sh = 35（v1=31 锚）
~/.dsh/.agent-presets = 15 目录；~/.dsh/skills = 252；~/.agents/skills = 12
# 双基座
/Applications/.../package.json → dsh-plugin-desktop 2.0.4；packaging/staging-src/2.0.0/app → 2.0.5
packaging/release/2.0.0/VERSION → LUTE_VERSION=2.0.0 BUILD=20260910-155331 DSH_BASELINE=2.0.5
# 锚分类样例
dsh-root-brand-local：哈希钉已于 2026-09-11 退役（改为运行时解析，见 ADR-0019 与其 Note）；仅余 priority:-100 三席选举依赖未文档化规则
dsh-agent-team-gui-local/lib/client.js openTeamSettings（role=dialog + 文本匹配 + 12×50ms seek）
dsh-theme-local/src/client/index.tsx:129（:root 注入）
# 数据
sessions zstd ×259（225M）≡ projcache json ×259（144M，version:4）；dsh.sqlite units 仅 deepresearch v3
~/.agent-memory 2.3M（noema 根，NOEMA_ROOT 空）；lingshu.db 212K + WAL 4.1M；my-quotes 288K
sessionId 容器与 SESSION_FORMAT_VERSION=0：dsh-session/README.zh.md:173；上游 V2→V3：docs/research/02 §3.3
# 流水线
assemble.sh:9 DSH_APP 默认 /Applications；sign-and-dmg.sh / build-pkg.sh .build.lock；BUILD=date 语义（assemble.sh:222）
dsh-patches/.git.disabled；staging-src 手工目录；packaging/staging 六版本并存
```

（完）
