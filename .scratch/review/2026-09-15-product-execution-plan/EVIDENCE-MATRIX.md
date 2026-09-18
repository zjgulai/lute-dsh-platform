# 证据与验收矩阵

## 1. 证据层级

| 层级 | 证明什么 | 不能证明什么 | 最低证据 |
| --- | --- | --- | --- |
| E0 静态审查 | 代码/配置存在明确缺陷或设计 | 实际运行一定触发 | 文件、行号、触发条件、反例 |
| E1 Unit/Contract | 纯函数和局部契约可重复 | 包已经构建、装载或运行 | Red/Green、mutation、测试数与退出码 |
| E2 Package Build | 目标包能 typecheck/test/build | profile 副本和 DSH 已使用新字节 | build manifest、deterministic diff |
| E3 Repository Gate | 当前工作树的仓库契约通过 | 改动已提交、CI 或 live 正常 | `gate`/`gate:full`、skip 明细、git 状态 |
| E4 Profile/Loadpoint | vendor 与 node_modules 真实装载点一致 | DSH 已重启并执行到该代码 | expected/checked/failed 分母、字节 hash |
| E5 Live Runtime | 运行中 DSH/Team Hub 路径真实生效 | 干净客户机、公开 Release 或生产接受 | 正负控、仪器自检、运行版本、截图/日志 |
| E6 Clean-machine | 全新环境可安装、首启、升级、回滚 | 公开附件是同一字节 | OS/arch、DMG hash、步骤和结果 |
| E7 CI/Remote Control | 独立 runner 和远端规则不可绕过 | 客户运行效果 | workflow run、required checks、ruleset API |
| E8 Release Byte Chain | 客户下载字节与 tag/manifest/attestation 一致 | 灰度或业务效果 | 远端 digest、tag commit、Latest、下载重哈希 |
| E9 Canary | 小范围真实客户行为满足阈值 | 全量生产长期稳定 | cohort、版本、窗口、失败与回滚记录 |
| E10 Production Acceptance | 获得明确业务/组织接受 | 永久没有风险 | owner、时间、范围、SLO/指标和已知限制 |

任何汇报必须使用上述层级名称。较高层证据不能用较低层推断代替；例如 E3 green 不能写成 E5 live accepted。

Qodo、静态 analyzer 或 AI reviewer 的 finding 默认属于 E0 线索，不因工具标记 `action_required` 自动升级为已确认缺陷。进入实施计划前必须至少补齐文件/行号、触发条件和本地独立裁决；工具覆盖不完整、跳过 reviewer 或超出 patch 上限时必须原样记录。

### 1.1 `L1` / `L2` / `L3` 与 E 层不是同义别名

工作流卡片（`workstreams/*.md`）另用 `L1` / `L2` / `L3` 标注**本卡自己的**三层本地仪器。它是卡内局部命名，不是全局枚举：`QG-002` 的 L 层是「fixture 证明 row 分类 / 临时 preset 树 mutation 证明判别力 / 当前仓库只读全量清单证明分母」，而 `QG-007` 的 L 层是「workflow 静态校验 / fork 受控 run / main required run」——同一个 `L2` 在两卡指代的东西不同，且后者已经把射程伸到远端。

因此：

- 任何 `local L1/L2 complete` 形式的状态行，必须与该卡自己的 L 层定义一起读，**不得跨卡搬运含义**；
- L 层不替代 E 层。卡内 L 层标注完成，仍需按本矩阵给出对应 E 级证据；
- 引用 L 层状态时必须写明卡 ID，禁止只写 `L2 完成`。

## 2. 每个任务卡的通用证据包

未来执行每个 task ID 至少保存以下内容：

```text
task_id
scope
baseline_commit
working_tree_boundary
changed_files
red_command_and_exit
red_observation
green_command_and_exit
green_observation
negative_control
mutation_or_failure_injection
skipped_checks_and_reasons
profile_or_runtime_version
external_state_changes
remaining_limitations
rollback_or_disable_path
```

推荐在获批任务自己的正式 Note 中保存结论与命令；临时大输出放任务专属 scratch/evidence，不把凭证、会话正文或客户隐私写入仓库。

## 3. Gate 输出契约

所有门禁至少提供：

- `expected`：按契约应检查多少对象。
- `discovered`：实际发现多少对象。
- `checked`：实际执行多少校验。
- `skipped`：未执行多少及逐类原因。
- `failed`：失败多少及修复定位。

判定规则：

1. 必备治理文件不存在：`fail`。
2. 可选外部环境整体不存在：`skip`。
3. 环境已存在但应有对象为 0：`fail`。
4. expected 与 checked + typed skipped 不相等：`fail`。
5. `--require-no-skip` 下任何 skip：非零退出。
6. skip 不计入 pass 数量。

## 4. 安全任务验收矩阵

| 契约 | 正控 | 负控/变异 | 需要层级 |
| --- | --- | --- | --- |
| Shopify hostname | 合法测试店铺可连接 | evil suffix、IP、port、userinfo、path 下 fetch=0 | E1 + E5 |
| MCP 固定产物 | 断网/空 npm cache 仍启动 | artifact 改 1 byte 即拒绝 | E2 + E4 + E5 |
| 子进程 env | 必需 PATH/PYTHON/LOOPX 可见 | `SENTINEL_SECRET` 不可见 | E1 + E5 |
| Team Hub route | admin 正常、已授权 member 正常 | 未登记 GET/POST/upgrade 为 403 | E1 + E5 |
| Body limit | 边界值正常 | +1 byte、chunked、slow body 返回 413/408 | E1 + E5 |
| Atomic persistence | 正常写入重启可读 | kill-before-rename 后旧文件完整 | E1 + E5 |
| OAuth lifecycle | 正常授权成功 | 重复、拒绝、超时、dispose 无残留 handle | E1 + E5 |
| Team Hub TLS | TLS 登录、Secure cookie | 明文正式模式拒绝、伪造 forwarded header 无效 | E1 + E5/E6 |
| 第三方 skill provenance | 固定 commit 的全部文件可复算 blob OID/SHA-256/license | mutable HEAD、同长度改 1 byte、cache substitution、缺 license 全部拒绝 | E1 + E2 + E7 |
| 第三方 skill promotion | approved digest 可进入指定 profile/preset | quarantined、digest 漂移、未声明 scripts/network/credential 权限不能装载或自动调用 | E1 + E4 + E5 |
| 破坏性路径 containment | 合法单层 ID/安装名可归档或替换 | `..`、绝对路径、separator、Unicode 混淆、源/目标 symlink 在首次写操作前拒绝 | E1 |
| 批量安装事务 | 完整批次一次提交并生成 manifest | 任意条目校验失败、ENOSPC、copy 失败、INT/TERM 后目标树 hash 与开始前一致 | E1 + E4 |
| LoopX runtime | 离线、锁定 wheel/hash 可初始化 | 浮动版本、未锁传递依赖、子进程读取 `SENTINEL_SECRET` 均失败 | E2 + E4 + E5 |

## 5. CI 与发布验收矩阵

| 场景 | 必须结果 | 证据层级 |
| --- | --- | --- |
| PR 故意破坏一个契约 | required check 红，无法合并 | E7 |
| main 直接 push 尝试 | ruleset 拒绝或仅受控 break-glass | E7 |
| dirty 正式装配 | 在 release 目录写入前失败 | E3 |
| `SKIP_SMOKE=1` 进入签名 | 签名脚本拒绝 | E3 |
| 同版本二次构建 | 本地 tag/manifest/远端 Release 任一存在即拒绝 | E3 + E7 |
| GitHub 附件缺失/重复 | release verification 失败 | E8 |
| 远端 DMG digest 不符 | published 状态不可达 | E8 |
| tag commit 不含清单 | published 状态不可达 | E8 |
| upload 中断 | 保留 draft/candidate，可幂等恢复 | E7 + E8 |
| 已公开错误字节 | 标记 revoked，发布新 patch，不覆盖旧附件 | E8 |
| 全栈目录完整性 | 138/138 进入安装、frontmatter、资源、flags 与脚本校验 | 任意 extra-only skill 缺失或改坏时 gate 非零 | E1 + E3 |
| agent-fullstack 白名单 | 与 tracked 89 项产品意图清单逐项全等 | 只剩 14 条“一节点一条”、多一条、少一条、乱序或 digest 漂移均拒绝 | E1 + E3 |
| intake 对账 | upstream = fetch + disjoint skip + already-installed，且清单可复算 | 对账代码移到成功出口之后、重复计数、差额非零时必须失败 | E1 + E3 |
| clean artifact build | 空 HOME 的 clean checkout 可构建并解析 manifest entry | 缺 `lib`、ignored 旧 artifact、profile 偶然残留不能让构建/发布变绿 | E2 + E7 |
| 冻结 release snapshot | profile、packages、skills 全部进入同一 digest manifest | 取件与打包之间 live profile/skill 改 1 byte 时发布拒绝 | E3 + E8 |

## 6. 产品与 UX 验收矩阵

| 旅程 | 自动验收 | 人工验收 | 指标 |
| --- | --- | --- | --- |
| Settings | 18/18 可达、导航独立滚动、其他 modal 尺寸不变 | 明暗主题、不同缩放、全键盘、VoiceOver | 入口不可达=0 |
| 首启 | 健康步骤状态机和失败分支测试 | 干净 Mac 不开终端完成参考任务 | TTFV、首任务成功率 |
| 能力发现 | 状态/筛选/深链契约 | 用户能按目标找到能力并开始工作 | 错误入口率、返回切换次数 |
| 任务执行 | golden cases、恢复和质量门禁 | 三条核心业务任务 | 成功率、人工接管率、产物得分 |
| 可访问性 | axe、keyboard suite、reduced-motion | VoiceOver 核心路径 | blocker=0 |
| 更新提示 | feed schema、签名/hash/channel | 离线、旧版、篡改、可用新版提示 | 版本覆盖率 |
| Fullstack 发现 | 138 项清单、89 项推荐子集、搜索/折叠状态测试 | 320/768/桌面、空/错/慢路径、14 节点可理解性 | 首个可操作时间、DOM/内存预算、找到目标步骤数 |
| New App 刷新 | 同一 refresh generation 同时重试 Products/Systems | fail→retry→success 且旧错误清除 | 恢复成功率、关闭重开次数 |
| Team Hub Admin | async reject 进入统一 error+retry；危险动作有确认 | 键盘、读屏、窄屏、错误与取消路径 | 错误恢复率、误操作=0 |

Settings 的历史 live Note 只作为历史 E5 证据；任何后续 CSS/DOM 变更都会使该证据失效，必须重跑。

## 7. 隐私与观测验收矩阵

| 数据类 | 必须回答 |
| --- | --- |
| 会话正文 | 是否扫描、过滤、保存全文、保存多久、谁可读取 |
| 本地派生索引 | 路径、用途、重建、删除、权限、损坏处理 |
| LLM 传输 | 哪个动作触发、发送多少、发给哪个 provider、是否可取消 |
| telemetry | 字段、随机 ID、目的、endpoint、默认状态、opt-out、保留、删除 |
| 日志/support bundle | 默认脱敏字段、正文/凭证禁入规则、用户预览与导出 |
| 产品指标 | 本地还是远端、聚合方式、最小样本、内容数据是否禁止 |

最低负控：在禁用 telemetry、未点击 AI 精分、未显式导出 support bundle 的条件下，网络录制不得出现对应外发请求。

My Quotes 还必须覆盖三种独立状态：从未同意、已同意本地索引、已单独同意某次 LLM 传输。任一状态不能隐式推出另一状态；既有索引迁移前后都要记录文件数、bytes、权限和删除结果，但证据中不得保存会话正文。

## 8. 公开发行验收矩阵

每个 stable macOS Release 至少覆盖：

- Apple Silicon、最低支持 macOS、当前 macOS。
- 公网下载而非本地 payload。
- DMG hash、Developer ID、hardened runtime、notary ticket、staple、`spctl`。
- fresh install。
- N-1 upgrade。
- 同版本重装。
- 安装中途失败与自动回滚。
- 用户会话、配置、技能、凭证引用的保留。
- TCC designated requirement 与授权持续性。
- 离线启动及关键本地能力。
- stable/canary channel 隔离。
- 旧版本降级。

未覆盖的组合必须写“未验证”，不能通过同架构、同版本或历史成功推断。

## 9. 当前计划文件自身验收

- [x] 所有 master task ID 在某个 workstream 中有详细任务卡。
- [x] 所有任务依赖引用存在。
- [x] 所有 P0 有至少一个负向验收。
- [x] Qodo 16 条原始 finding 均映射到 11 个已裁决根因；每个根因都有 task、显式接受风险或不实施理由。
- [x] 所有外部状态变更标注需要额外授权。
- [x] 所有顶层 workstream 任务区分自动与人工验收。
- [x] 本轮计划工具的写入目标仅在本目录；本目录外仍有另一任务的并发改动，未将其归因于或纳入本计划。
- [x] 本目录逐文件 whitespace、相对链接、task ID/依赖引用和 Markdown 结构检查通过。
- [x] 全仓 `git diff --check` 已单独记录为本目录外 `packages/capabilities/dsh-overseas-skills/test/host-routes.spec.mjs:279` 的 EOF 新空行；本计划未修改该文件，且未用全仓红灯替代本目录范围校验。
