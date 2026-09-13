# 架构决策记录（ADR）

## 索引

| 编号 | 标题 | 状态 | 决策记录 |
| --- | --- | --- | --- |
| ADR-0001 | GitHub monorepo 管理：单仓库发布 DSH 二开平台 | accepted（2026-09-06） | — |
| ADR-0002 | DMG 发布：GitHub Releases 附件 + release/ 哈希清单 | accepted（2026-09-06） | — |
| ADR-0003 | 版本策略：单平台版本 vX.Y.Z + 插件 package.json 对齐 | accepted（2026-09-06） | — |
| ADR-0004 | 仓库收录范围：全平台 monorepo（含 81-Skills 公开） | accepted（2026-09-06） | — |
| ADR-0005 | rc.1 基座迁移立项（LUTE 2.0.0，DSH 基线 2.0.4→2.0.5） | accepted（2026-09-10） | — |
| ADR-0006 | 上游版本跟进策略（月度观察窗 + 红线触发制） | accepted（2026-09-10） | — |
| ADR-0007 | 二开平台重构级别：三期推进（骨架 → 结构收敛 → 契约与清账） | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0008 | harness submodule 初始化但仅作只读参照系 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0009 | 文档消费者与语言策略：主脊柱中文单语 + 客户链独立用户向文档 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0010 | 包平面三分治理：自研层 / npm 外部层 / 处置候选层 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0011 | 能力五组归位 + 生成式目录墙（不引入 pnpm workspace） | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0012 | 包名不改、目录名归一、新增身份三元组门禁 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0013 | 资产分级处置：删除 / 归档出工作树 / 纳入版本管理 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0014 | 门禁全量硬门槛 + 只减不增的临时豁免（N5=A2） | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0015 | 决策记录双轨分职：ADR 时间线 + 本地 Notes（强制留痕） | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0016 | 嵌套仓库治理：受管目录不得含未声明的独立仓库 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0017 | 包的类型检查必须指向内建运行时的类型，而非应用内打包产物 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0018 | 构建产物 lib/types 的入库边界与 build 可执行性 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-lute-refactor-three-phase.md) |
| ADR-0019 | 对官方 UI 的改写锚必须运行时解析，禁止把 CSS-module 哈希写进产品代码 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-root-brand-live-resolver.md) |
| ADR-0020 | 岗位小队 = 单 preset 的人格 + 技能并集，不做多 preset 挂载 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-role-squad-contract.md) |
| ADR-0021 | Preset 承载材料声明时，必须显式披露「声明 vs 供给」的差 | accepted（2026-09-11） | [Note](../notes/implemented/architecture/2026-09-11-preset-supply-disclosure.md) |
| ADR-0022 | 岗位头像走官方 `icon` 字段，图标库是唯一事实之家 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-preset-avatar-contract.md) |
| ADR-0023 | 删除被会话引用的 preset：默认值先迁移、归档先验字节、损失需显式接受 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-preset-cleanup.md) |
| ADR-0024 | 上下文压缩加固：容量表实测 + 摘要路由解耦 + 确定性压缩按需切换 | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-context-compaction-hardening.md) |
| ADR-0025 | `webServer.register` 一次只收一条路由；传数组会静默失效 | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-role-matrix-route-registration.md) |
| ADR-0026 | 对官方 UI 的样式覆盖必须与注入顺序无关（!important + 样式标签居末） | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-root-brand-hero-override-cascade.md) |
| ADR-0027 | 模态浮层进浏览器 top layer（`<dialog>` + `showModal()`），不参与 z-index 竞争 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-role-matrix-top-layer-drawer.md) |
| ADR-0028 | 启动器只拥有「连接」，不拥有事实；侧边栏启动位与官方键各占一半 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-newapp-launcher-join-not-facts.md) |
| ADR-0029 | 主题 Token 的判据要两侧共同证伪：真实 CSS 引擎 + 真实供给函数 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-theme-token-verdicts-two-sided.md) |
| ADR-0030 | 在 `/api` 下注册 exact 路由的插件绕开平台自己的来源栅栏——必须逐个插件打栅栏 | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-worktable-trust-fence.md) |
| ADR-0031 | 技能分类必须与岗位矩阵同构；缺口认领必须与分类落点自洽 | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-paper2skills-preset-skills.md) |
| ADR-0032 | 跨框架注入的共享核心：「未挂载」只有一种表示，且其契约必须在真框架环境证伪 | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-sidebar-entry-null-pane.md) |
| ADR-0033 | Native Agent 产品 = 项目目录里的声明 + 实现包；启动器只发现与开入口 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-native-agent-product-form.md) |
| ADR-0034 | 功能的提示词骨架 = 多技能组合（岗位方法 + 产品契约）；功能内部下沉为 `steps[]` | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-native-agent-product-multiskill-skeleton.md) |
| ADR-0035 | 技能效果的断言必须有实测背书；改动须过 held-out 验证门，未过门一律回滚 | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-paper2skills-effect-eval.md) |
| ADR-0036 | 产品包由岗位 preset 的行挂载，且故意不声明 `dsh.bundle`——把「局部技能」变成结构上不可搞错的事 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-product-package-preset-mount.md) |
| ADR-0037 | 产品包挂两层，靠 `role` 分离；局部技能的机关从「缺声明」换成「显式关断」 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-product-package-two-layer-mount.md) |
| ADR-0038 | 共享来源栅栏的判据必须是「拒绝」而不是「抛异常」；可选服务查询一律尽力而为 | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-shared-fence-deny-not-throw.md) |
| ADR-0039 | 语义 Token 三条法则（只引用官方已声明名 / 兜底=实测浅色值 / 品牌色非主题色）；门禁的「引用」只认 `var()` | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-theme-token-three-laws.md) |
| ADR-0040 | 开发脚本起的子进程必须是真 node（`process.execPath` 在 pnpm 下是宿主 Electron，且「退出码 0 却没有输出」）；判据先剥注释与字符串 | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-node-interpreter-not-execpath.md) |
| ADR-0041 | 已安装的技能本体就是分类的运行时家；归位与接线必须分开显示 | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-algo-skills-surface.md) |
| ADR-0042 | 外部插件注册 `settings.section` 必须走 `slots.inject`；直接 `register` 会静默丢行 | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-settings-slot-must-inject.md) |
| ADR-0043 | 门禁报失败必须给出为它负责的读数：输出按流分流保留，退出码不得折算 | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-script-evidence-by-stream.md) |
| ADR-0044 | 归位判定必须自带逐字证据、落在自己的家（不改接线、不写技能 frontmatter）；四层下钻里归位与接线分开显示 | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-overseas-skills-role-tree.md) |
| ADR-0045 | 产品矩阵只列已产品化的产品、一张大卡一个产品；工作台与控制室的 UI 全部卸载（部分取代 ADR-0028 与 ADR-0033 第 6 条） | accepted（2026-09-12） | [Note](../notes/implemented/simplification/2026-09-12-newapp-product-matrix-ablation.md) |
| ADR-0046 | 可选服务只能用 `ctx.get` 读（裸读会抛，`?? 兜底` 是假兜底）；Remote 三元组必须按位传参并读回 `ok:false` | accepted（2026-09-12） | [Note](../notes/implemented/contract/2026-09-12-newapp-card-open-context.md) |
| ADR-0047 | p2s 语料的三行级缺陷改在流水线里修（不手改 1338 个文件）；出处按六档如实渲染，不做无差别还原 | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-paper2skills-corpus-rebuild.md) |
| ADR-0048 | p2s 卡 ⑦ 段是 60 行上限的预览节选，卡面按实测口径渲染而非转发源站自述；卡页「路径」只作转述（部分取代 ADR-0047 的代价与边界两条） | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-paper2skills-code-availability.md) |
| ADR-0049 | 完整实现从未丢失：读语料 vault 的 git 明文恢复（1,302/1,338），落 `references/implementation.py`；三档分层且无 oracle 的一档必须标注未核对（订正 ADR-0048 的两条全称断言） | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-paper2skills-source-code-recovery.md) |
| ADR-0050 | 代码围栏按「宽松枚举候选 + 语法定终点」抽取，不按 Markdown 配对（确证 1,262→1,277、未恢复 36→21；订正 ADR-0049 的「那 21 张是真实的代际差异」） | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-paper2skills-fence-candidates.md) |
| ADR-0051 | `parses=False` 拆成「源码写坏 5」与「判据未定终点 15」两类，逐卡带 `defect`/`defect_line`/`defect_detail`（订正 ADR-0049 收尾那句「20 张都因全角标点写坏」） | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-paper2skills-parse-defects.md) |
| ADR-0052 | 第三方技能入库**不保留 `.git`**（改由锚定 commit SHA + 上游 tarball 承担可复现与回滚）；入库必须**挂岗或显式归为通用型**，不允许既无岗位也无通用分型的裸条目 | accepted（2026-09-12） | [Note](../notes/implemented/capability/2026-09-12-third-party-skill-intake.md) |
| ADR-0053 | 岗位能力事实读它的家（preset manifest + 技能本体），**不派生第二份清单**；宿主路由现读现投影，挂载锚零哈希 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-composer-role-capabilities.md) |
| ADR-0054 | 改动生效的判据是**装载点的字节**（`profile/node_modules`，不是 `vendor/`）：门禁从「副本有没有这个文件」升到「字节一不一样」，且只钉可执行产物面 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-loadpoint-bytes-drift.md) |
| ADR-0055 | 依赖层可复现的判据：清单与锁文件逐条 specifier 相等、依赖不得指向机器绝对路径、同名不得跨字段重复声明，离线判定（`deps-reproducible`）；产物未入库的包 `build` 先于 `test` | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-dependency-reproducibility.md) |
| ADR-0056 | 出货的 preset **不烘焙任何外部产品行**（`PRODUCT_MOUNTS` 置空，本机产品走本机装配）；机器路径两个前缀都参数化（`__DSH_HOME__` / `__LUTE_PROJECT_ROOT__`）；出货树机器路径**只减不增**（签名前机读守卫） | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-shipping-surface.md) |
| ADR-0057 | 发布产物的发布语义：`release/<版本>/` 要么不存在、要么是**完整且已全部通过终验**的集合；构建在临时区完成、**原子改名就位**；同号重制默认拒绝，`--force` 时旧产物**归档不删除**；构建锁记 pid（无主可回收、活锁仍拦截）；发布语义由沙箱化断言守护 | accepted（2026-09-12） | [Note](../notes/implemented/architecture/2026-09-12-release-atomic-publish.md) |
| ADR-0058 | 发布清单入库：仓库根 `release/<version>.sha256` 是**清单的家**（进 git），由 `sign-and-dmg.sh` 在产物**原子就位之后**生成，不再依赖 SOP 里的人工步骤；清单必须带源凭据（`source_commit` / `source_dirty` / `profile_snapshot`，由 `assemble.sh` 在**装配时刻**记录）；时序固定为**构建 → 提交清单 → 打 tag**，tag 才担保得住字节；失败方向是「产物完好、清单缺失」 | accepted（2026-09-13） | [Note](../notes/implemented/architecture/2026-09-13-release-manifest.md) |
| ADR-0059 | 中转站接入以**逐模型实测工具调用**（`tool_choice: "auto"`）为准入判据——schema 是否声明 `tools` 不可作依据（实测二者无关且方向相反：全部 Claude Opus/Sonnet 系接受 `tools` 却不产出 `tool_calls`）；PoYo 拆 `poyo`（11 个实测稳定）/ `poyo-responses`（3 个）两条路由共用一份凭据；pi-ai 的 `detectCompat` 对未特判站点落默认值，5 处与站方 schema 不一致必须显式纠偏；因上游稳定性未达标不写进任何默认位 | accepted（2026-09-13，同日修订） | [Note](../notes/implemented/capability/2026-09-13-poyo-relay-route-intake.md) |
| ADR-0060 | 模型准入判据补两关：**tool_call 必须回灌验证**（缺 `type:"function"` 只在客户端回传路径上暴露，单轮测不出）+ **多轮重复**（实测 33% 间歇静默失败）；判据由三关升为四关；抽测只作并列决胜、不得据此宣称模型更强；筛选目标是「每族一条当代最好的」而非「不漏掉任何可用项」——硅基流动清单据此 25 → 9 | accepted（2026-09-13） | [Note](../notes/implemented/capability/2026-09-13-siliconflow-model-audit.md) |
| ADR-0061 | 新应用抽屉同时兼容 `ctx.agentPresets` 与 `connection.api.agentPresets` 两种 preset 选择器载体；深链星探 KOL-Hunter 走本机 profile 本地装配，不再烘焙进出货 preset；新增 DMG 打包发布 SOP | accepted（2026-09-13） | [Note](../notes/implemented/surface/2026-09-13-newapp-agentpresets-channel-and-kol-hunter-local.md) |
| ADR-0062 | 新应用抽屉增加「业务系统」第二分区：外链只由宿主打开且只接受 slug；本包从此拥有一份 catalog（部分修订 ADR-0045） | accepted（2026-09-13） | [Note](../notes/implemented/surface/2026-09-13-newapp-systems-section.md) |
| ADR-0063 | 出货 app 改用固定身份的证书签名：adhoc 的指定要求字面上就是 CDHash，TCC 授权因此随字节失效——「重新授权一次」实为**每版一次**；改建自签身份后换签只付一次；签名身份升为「签不出来即失败」的受门禁保护构建输入（修订 PLAN 决策 D2） | accepted（2026-09-13） | [Note](../notes/implemented/architecture/2026-09-13-signing-identity-tcc-stability.md) |
| ADR-0064 | shell 变量名边界纳入门禁：`$VAR` 紧跟多字节字符（如全角括号）会被 bash 并入变量名，`set -u` 下直接中断——实测让 2.3.0 首次装配在 §5 作废，且 4 处现场中有一处恰在**错误报告路径**上；修复统一改 `${VAR}`，新增 `shell-var-multibyte` 硬校验（注释与位置参数不报） | accepted（2026-09-13） | [Note](../notes/implemented/contract/2026-09-13-shell-var-multibyte-guard.md) |

> ADR-0007 ~ ADR-0018 是「LUTE 二开平台架构重构」的十二项决策，共享同一篇决策记录 Note。
> ADR-0019 独立成篇（品牌皮肤锚点治理），决策记录见其 Note。
> ADR-0020 独立成篇（岗位小队编队契约），决策记录见其 Note。
> ADR-0021 独立成篇（preset 供给披露规则），决策记录见其 Note。
> ADR-0022 独立成篇（岗位头像契约），决策记录见其 Note。
> ADR-0023 独立成篇（preset 清理与默认值迁移），决策记录见其 Note。
> ADR-0024 独立成篇（上下文压缩加固），决策记录见其 Note。
> ADR-0025 独立成篇（宿主路由注册契约 + 替身即契约纪律），决策记录见其 Note。
> ADR-0026 独立成篇（官方 UI 覆盖规则的顺序无关性），决策记录见其 Note。
> ADR-0027 独立成篇（模态浮层的 top layer 纪律），决策记录见其 Note。
> ADR-0028 独立成篇（启动器的所有权边界与半宽并排几何），决策记录见其 Note。
> ADR-0029 独立成篇（主题 Token 的证伪必须落在真实引擎与真实供给两侧），决策记录见其 Note。
> ADR-0030 独立成篇（第三方插件在 `/api` 下注册 exact 路由会压过平台的 `/api` 前缀栅栏，来源栅栏须逐插件补），决策记录见其 Note。
> ADR-0031 独立成篇（技能分类与岗位矩阵同构 + 缺口认领自洽），决策记录见其 Note。
> ADR-0032 独立成篇（跨框架注入共享核心的「未挂载」表示唯一化 + 注入契约须在真框架环境证伪），决策记录见其 Note。
> ADR-0033 独立成篇（Native Agent 产品的声明之家与启动器的发现/开入口边界），决策记录见其 Note。
> ADR-0034 独立成篇（产品的功能骨架分层与步骤级分工，M1 试点压出的修订），决策记录见其 Note。
> ADR-0035 独立成篇（效果断言的实测背书要求 + held-out 门与回滚纪律，由 L6/L7 实测压出），决策记录见其 Note。
> ADR-0036 独立成篇（产品包的挂载层契约），决策记录见其 Note；其决策 3 已由 ADR-0037 取代。
> ADR-0037 独立成篇（产品包两层挂载与 `role: entry` 关断机关），决策记录见其 Note。
> ADR-0038 独立成篇（共享栅栏「拒绝而非抛异常」），决策记录见其 Note。
> ADR-0039 独立成篇（语义 Token 三条法则与门禁引用口径），决策记录见其 Note。
> ADR-0040 独立成篇（开发脚本子进程的解释器必须是真 node，判据须先剥注释与字符串），决策记录见其 Note。
> ADR-0041 独立成篇（分类的运行时家是已安装的技能本体；归位与接线分列），决策记录见其 Note。
> ADR-0043 独立成篇（门禁失败证据按流分流、退出码不得折算），决策记录见其 Note。
> ADR-0045 独立成篇（产品矩阵剪枝 + 卸载 dsh-worktable），决策记录见其 Note；它部分取代 ADR-0028 与 ADR-0033 第 6 条。
> ADR-0046 独立成篇（可选服务读取纪律 + Remote 三元组的传参与返回值校验），决策记录见其 Note。
> ADR-0062 **部分修订 ADR-0045**：产品分区的目标函数一字未改，抽屉只是多了一个「业务系统」分区；
> 被改掉的是「这个抽屉只放产品」的收口，以及 M1/M2 的适用范围。理由与实测读数见其 Note。
> ADR-0047 独立成篇（p2s 语料三行级缺陷改在流水线里修 + 出处按档位渲染），决策记录见其 Note。
> ADR-0048 独立成篇（p2s 卡 ⑦ 段是节选不是模板 + 卡页路径只作转述），**部分取代 ADR-0047
> 「影响 · 代价与边界」里的两条**：那句「逐字节相同 1,283/1,283」应改按三类计（1,082 相同 /
> 188 仅末尾纯空白差 / 3 处刻意脱敏）；「787 条悬空路径」量错了基准（换全量树后 838/838 全解析），
> 且路径指向的代码树与本卡节选同名不同物。
> ADR-0049 独立成篇（完整实现从语料 vault 的 git 明文恢复 + 落 references/implementation.py），
> **订正 ADR-0048 的两条全称断言**：那句「卡的 code_path 838/838 全指向无编号树」有 **18 条反例**
> （18 张卡指向带编号的代码代）；那句「预览是这份代码唯一存世的地方」也不成立 ——
> iCloud 工作区的 1,353 个 vault `.md` 已是被改写的二进制容器，但**同一仓库的 git 历史里 1,338/1,338
> 张卡都是明文**，1,277 张的卡面节选可校验为完整代码的开头（偏移恒为第 1 行；此数经 ADR-0050 修正，
> 原记 1,262）。
> ADR-0050 独立成篇（代码围栏按宽松候选枚举 + 语法定终点抽取），**订正 ADR-0049 的
> 「那 21 张是真实的代际差异」**：19 张的实现一直在 vault 的 HEAD 里，是选围栏的正则漏读了
> （不锚行首导致配对错位、只认 python 标注看不到 bash 首块），4 张首块是运行方式，
> **只有 2 张是真正的源站独有**。同时修掉一条同类缺陷：卡里的 Python 会把整张 markdown 卡
> 塞进三引号字符串，围栏边界落在串里，6 张已「确证」的卡其实是被截断的
> （最大一张 66 行 → 443 行）。
> ADR-0051 独立成篇（`parses=False` 拆两类），**订正 ADR-0049 收尾那句「余下 20 张是源码
> 本身写坏（全角标点）」**：那 20 张是 **5 张源码写坏 + 15 张判据没定出终点（吞了卡正文）**。
> 分界尺子是「被选中围栏之后还剩几个边界」，20/20 无例外；5 张的缺陷形态各不相同
> （嵌套三引号 / 控制字符 U+0001 / 括号种类不匹配 / 三引号未收尾 / 模块名带连字符），
> 没有一条来自批量标点替换 —— 全角 `（` 出现在 1,110 张卡的恢复区里，其中 1,091 张正常 parse。
> 各插件历史决策（如 AI全栈 ADR-0001~0007、万物互联 D1-D5）保留在各插件 docs/ 内；历史 6 篇 ADR 的归档在三期进行（ADR-0015）。

## 双轨分职（ADR-0015）

| 体系 | 位置 | 职责 | 强制机制 |
| --- | --- | --- | --- |
| ADR | `docs/adr/ADR-NNNN.md` | 编号时间线 + 稳定链接锚：决定**是什么** | 编号连续、索引与文件一致 |
| Note | `docs/notes/{lifecycle}/{class}/yyyy-mm-dd-topic.md` | 为什么改、放弃了什么 | 非机械改动必须同 PR 附一篇 |

两轨以 ADR 头部的 `决策记录` 行与 Note 正文中的 ADR 引用双向互链，由门禁校验可达。

## 模板（ADR-NNNN）

```markdown
# ADR-NNNN · 标题

- 状态：proposed | accepted | rejected | superseded by ADR-XXXX
- 日期：YYYY-MM-DD
- 决策者：<人/角色>
- 决策记录：[Note](../notes/{lifecycle}/{class}/YYYY-MM-DD-topic.md)

## 背景
<为什么需要决策>

## 决策
<我们决定做什么>

## 备选方案
<考虑过的其他方案与取舍>

## 后果
<正面/负面/后续动作>
```
