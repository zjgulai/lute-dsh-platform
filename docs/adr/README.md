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
