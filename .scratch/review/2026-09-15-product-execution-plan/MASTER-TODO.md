# Master TODO

## 1. 执行原则

- 任务按“可证明的风险关闭”排序，不按界面可见度或实现趣味排序。
- 每次只授权一个批次；完成该批次后必须停下汇报。
- P0 任务不得通过新增 exemption、跳过 smoke、降低校验或隐藏 `skip` 来变绿。
- 安全测试一律使用临时 HOME、假凭证、本地 mock 和随机端口。
- 任何持久化、权限、发布、远端 ruleset、Developer ID 或客户机操作都需要新的明确授权。
- 估算口径：S 约半天以内；M 约 1–2 天；L 约 3–5 天；XL 需拆成多个可验收批次。估算不包含外部账号、证书和客户等待。

## 2. 总依赖图

```text
BASE-001 当前工作树边界确认
  ├─ DEC-003 Team Hub 信任区 ─────→ SEC-RT-004/008/009 ──────┐
  ├─ DEC-009 第三方代码准入 ──────→ SEC-RT-002 ──────────────┤
  │                                      ↑ SEC-RT-003/003A   │
  ├─ DEC-010 artifact 权威源 ─────→ REL-001/QG-003 ──────────┤
  ├─ QG-006A mutation fixture 隔离基础设施 ───────────────────┐
  └─ QG-001 三态契约 ─┬→ QG-002..005 ─┐                     │
                      ├→ QG-010/011/012 ├→ QG-006B → QG-007 → QG-008
                      └─────────────────┘        ↑ QG-006A   │
SEC-RT-001/002/003/003A/004 ─→ SEC-RT-010 ───────────────────┤
REL-001 clean source ─→ REL-002 payload attestation ─────────┤
REL-003 版本不可重制 ─────────────────────────────────────────┤
PROD-UX-001 Settings 候选收口 ────────────────────────────────┤
                                                             ↓
                                            GATE-A2 候选交付基线
                                                             │
DEC-001/002 ─→ PROD-001 ─→ PROD-002 ─┬→ PROD-003/004 ────────┤
                                     ├→ PROD-UX-003/004 ─────┤
SEC-RT-004 + PROD-002 ───────────────→ PROD-UX-005 ───────────┤
DEC-004 ─→ PRIV-001 ─┬→ PRIV-003 ─────────────────────────────┤
DEC-011 ─────────────└→ PRIV-002 ─→ OBS-001 ──────────────────┤
                                                             ↓
                                                GATE-B 产品闭环
                                                             │
DEC-005 + GATE-A2 ─→ DIST-002 ─→ REL-009 最终 DMG 验收 ──────┤
REL-009 + QG-007 ─→ REL-004 ─→ REL-005/006 ─→ DIST-001 ──────┤
DIST-001/002 ─→ DIST-003 ─→ DIST-004 ─→ REL-008 ─────────────┤
PROD-006 ─→ OBS-002；DEC-008 ─→ BUS-001 ─→ BUS-002 ──────────┤
                                                             ↓
                                              GATE-C 公开生产候选
```

## 3. Phase 0：启动前边界与决策

### BASE-001 · 当前工作树边界确认

- [x] 重新记录 branch、HEAD、两个远端 refs、tag、tracked/untracked/staged 状态。
- [ ] 对当前 Settings Shell、ADR-0087/0088、门禁候选逐项确认归属者和状态。
- [x] 选择“只做完全不重叠任务”的执行边界；Settings、Fullstack、gate、ADR 候选均不接管。
- [x] 记录禁止覆盖清单和三个 Shopify 目标文件的 hash 快照。
- [x] 目标文件在两次复核中 hash 一致；每次 patch 前继续复核。
- 验收：实施前后未授权文件的 hash 不变；`git status --porcelain=v2` 的变化只来自获批任务。
- 当前状态：边界快照与写入隔离已完成；Settings 候选的最终归属仍由 `PROD-UX-001` 收口，不把该未决项误写成已验收。

### BASE-002 · 建立任务批次记录

- [x] 为 `BATCH-001` 记录 task IDs、范围、非范围、owner、验收命令、live/远端权限。
- [x] 明确本批不允许 commit、push、修改 GitHub ruleset、签名或发布。
- [x] 明确目标 hash 漂移、官方 host 范围扩大、真实 secret/network 依赖和不可隔离冲突等停止条件。
- 验收：所有变更行都能追溯到一个获批 task ID。
- 当前状态：已完成；见 [BATCH-001](batches/BATCH-001-boundary-and-shopify.md)。

### 决策清单

- [ ] DEC-001：内部可信分发还是公开生产发行。
- [ ] DEC-002：确认主要用户与前三条北极星业务任务。
- [ ] DEC-003：Team Hub 仅 loopback、可信 LAN，还是正式多用户模式。
- [ ] DEC-004：telemetry 禁用、明确 opt-in，还是受控默认开启。
- [ ] DEC-005：Developer ID 的获取时间和签名迁移窗口。
- [ ] DEC-006：能力成熟度账本的状态模型和 owner。
- [ ] DEC-007：GitHub/Codeup 的发布权威关系。
- [ ] DEC-008：内部平台、开源平台、垂直产品或企业产品的主商业形态。
- [ ] DEC-009：第三方技能、npm MCP 与 Python runtime 的分级准入和调用权限。
- [ ] DEC-010：各包 artifact policy 与正式发布的唯一、冻结输入源。
- [ ] DEC-011：My Quotes 全文索引默认状态、保留、清除和既有数据迁移。

具体选项见 [DECISIONS-REQUIRED.md](DECISIONS-REQUIRED.md)。

## 4. Phase 1：P0 安全与门禁真实性

目标：先保证凭证、权限和门禁结论不会撒谎。此阶段完成前暂停扩大技能、岗位、系统和设置入口。

| ID | 任务 | P | 依赖 | 估算 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| SEC-RT-001 | [Shopify host 规范化与凭证外传阻断](tasks/SEC-RT-001-shopify-host-validation.md)（local E1/E2 完成；live deferred） | P0 | BASE-001 | S | 高 |
| SEC-RT-003A | preset/skill 路径 containment 与全批事务（local implementation complete；live/UI deferred；第三方 apply 等 SEC-RT-002 ledger） | P0 | BASE-001 | L | 中 |
| SEC-RT-003 | child-process env allowlist 与 LoopX 启动边界 | P1/P0 依赖 | BASE-001 | M | 高 |
| SEC-RT-002 | MCP、LoopX、第三方技能不可变供应链 | P0 | DEC-009,SEC-RT-003,SEC-RT-003A | L | 中 |
| SEC-RT-004 | Team Hub 插件 HTTP 路由 default-deny | P0 | DEC-003 | M | 高 |
| QG-001 | 所有 gate 统一 pass/fail/skip 三态（local implementation + text/JSON/strict acceptance complete；远端 required check 未开始） | P0 | BASE-001 | M | 中 |
| QG-002 | 修复 live-presets 漏行与空射程（local L1/L2 + read-only live L3 complete；真实 preset mutation 未做） | P0 | QG-001 | M | 高 |
| QG-003 | [plugin-entry 契约闭合](workstreams/02-gates-ci.md)（2026-09-17 **已落地**：入口按清单解析 + 跟随转出口、候选四态全进分母、inject 名单/未防护 ctx 访问/Service 静态字段三项判据；**此前该模块从未接线**，现已接成 `plugin-entry-contract` + selftest。23 候选 23 核对 0 失败；L1/L2/L3 三层 28 条反向自测） | P0 | QG-001 | M | 高 |
| QG-004 | [Profile sync 覆盖率与错误显式化](workstreams/02-gates-ci.md)（2026-09-17 **已落地**：期望集从 profile 声明按完整相对路径推出、坏 JSON 直接判红、期望集里的包在目标缺失判红、只允许「根整体不存在」一种 skip。三个面各 24/24；假 HOME 端到端 Red/Green 已重放；18 条反向自测，关掉缺失判红 7 条转红） | P0 | QG-001 | M | 中 |
| QG-005 | [changedPackages 射程](workstreams/02-gates-ci.md)（2026-09-17 **已落地**：merge-base 基线 + 四类工作树来源并集 + rename 双映射 + 分段边界归属 + 治理规则；基线不可解析判红。20 条反向自测，关掉 untracked 5 条转红。`DSH_GATE_BASE_SHA` 的注入方是 QG-007） | P1 | QG-001 | S | 高 |
| QG-010 | Fullstack 138 全量验证与 tracked 89 whitelist 全等（本地 L1/L2/L3 完成；QG-007 remote required deferred） | P0 | QG-001 | M | 高 |
| QG-011 | Third-party intake 分类守恒与错误非零退出（local implementation + E1/E2/E3 acceptance complete；QG-007 remote required check deferred） | P0 | QG-001 | M | 高 |
| QG-012 | Settings AX 独立校准锚与仪器负控（local L1/L2 complete；L3 live 两种 zoom deferred） | P0 验收 | QG-001 | M | 高 |
| QG-013 | [交付白名单（files）相对运行时判据面的完整性](workstreams/02-gates-ci.md)（2026-09-16 补立卡并**已落地**：新门禁 + Red 重放 + 真实 npm 全等校准 + 变异自测；从交付清单侧量，与 QG-004 的 profile 侧互补） | P0 | QG-001,QG-006A | S/M | 高 |
| QG-006A | mutation fixture 隔离基础设施（local infrastructure + 现存 suite migration complete；future adoption 由各 ticket 强制） | P0 基础设施 | BASE-001 | M | 低 |
| QG-006B | 聚合并发、失败/SIGTERM 与零副作用证明 | P0 收口 | QG-006A | M | 低 |
| REL-001 | 正式产物强制 clean source | P0 | DEC-010,QG-003,QG-005 | S/M | 中 |
| REL-002 | smoke attestation 绑定 payload 字节 | P0 | REL-001 | M | 中 |
| REL-003 | 已发布版本永久不可重制 | P0 | REL-001 | S | 高 |
| PROD-UX-001 | Settings Shell CSS 收窄与候选收口（local scope contract complete；live/a11y/clean-install deferred） | P0 UX | BASE-001 | M | 低 |

### GATE-A1 · 安全/门禁真实性退出条件

- [ ] 运行时出货配置中不存在未固定版本的 `npx -y`/等价网络执行。
- [x] 非法 Shopify hostname 下网络调用次数为 0，日志无凭证。
- [ ] member 的未知插件 route 在 GET/POST/upgrade 三类请求中均默认拒绝。
- [ ] 每个 gate 都报告 expected/checked/skipped/failed 或等价可审计分母。
- [ ] 无射程不会显示 `ok`。
- [ ] live-presets 每一条真实 `name:` 行都进入 checked、disabled、failed 三者之一。
- [ ] plugin-entry 每个候选都有 checked 或类型化 skip，缺入口不能静默消失。
- [x] Fullstack 138 条全部逐项验证，tracked 89 项白名单与批准产品意图双向全等。
- [x] third-party intake 分类互斥且守恒，任何后置 accounting error 均非零退出且零写入。
- [x] Settings AX 校准锚与目标控件独立，目标尺寸 mutation 能稳定打红。
- [ ] 门禁测试成功、失败、SIGTERM 和并发执行前后工作树一致。
- [x] preset/skill 的路径逃逸、symlink、批末失败和中断恢复负例均保持允许根外字节不变。
- [ ] 外部运行时和技能只有 immutable source、逐文件 digest、许可证与批准状态闭合后才可调用。
- [x] Settings CSS 不再改变非设置页 dialog。

## 5. Phase 2：交付控制面与运行时纵深

| ID | 任务 | P | 依赖 | 估算 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| SEC-RT-005 | [HTTP body 上限、读取 deadline、解析边界](workstreams/01-security-runtime.md)（wanzh + team-hub 两侧实现 + Red/Green + **变异自测 3/3 判红**完成；同批修掉 team-hub 三处 `try` 内 `return` 不 `await` 吞错、一处 P-24 复发；「受控并发下 RSS 不随传输总量线性增长」**未实测**） | P1 | BASE-001 | S | 高 |
| SEC-RT-006 | [Wanzh 原子持久化与损坏 fail-closed](workstreams/01-security-runtime.md)（local implementation + Red/Green + 变异自测完成；设置页渲染与重启验收 deferred） | P1 | BASE-001 | M | 高 |
| SEC-RT-007 | [OAuth flow 生命周期与 disposer 闭合](workstreams/01-security-runtime.md)（local implementation + Red/Green + 真实端口用例完成；真实授权人工项 deferred） | P1 | SEC-RT-006 | M | 中 |
| SEC-RT-008 | Team Hub session 原子存储与清理 | P1 | BASE-001 | M | 高 |
| SEC-RT-009 | Team Hub TLS/cookie/登录防护 | P1/P0 | SEC-RT-004,008,DEC-003 | L | 低 |
| SEC-RT-010 | 安全契约总门禁和端到端验收 | P0 收口 | SEC-RT-001..009,SEC-RT-003A | M | 低 |
| QG-007 | GitHub CI workflow 与证据分层 | P0 | QG-001..005,QG-006A,QG-006B,QG-010..012 | M/L | 中 |
| QG-008 | branch protection/ruleset/required checks | P0 | QG-007 | S | 低 |
| QG-009 | gate/packaging/runtime owner 与故障接管人 | P2 | QG-007 | S | 高 |
| REL-007 | AEIS 可选能力的 manifest truthfulness | P1 | REL-002 | S | 高 |

### GATE-A2 · 信任与交付基线退出条件

- [ ] `main` 不能绕过 required checks 直接进入发布状态。
- [ ] CI 的静态、集成和 skip 输出与本地同一契约。
- [ ] 候选构建拒绝 dirty/unknown source，payload attestation 与 exact payload digest、source commit 和冻结 profile/skills snapshot 闭合。
- [ ] stable 版本占用检查在首次写入前同时覆盖本地与 required remote；当前阶段只证明发布机制，不把 draft/fixture 提升为已发布。
- [ ] Team Hub 正式多用户模式具备 TLS、Secure cookie、限速和 CSRF/Origin 边界；否则产品明确限制为 loopback/可信 LAN。
- [ ] 配置截断、OAuth 放弃、超限请求、session 并发、子进程 secret mutation 和第三方 artifact 漂移均会触发预期防线。
- [ ] QG-007 的独立 runner 和 QG-008 的远端 ruleset 已分别取得 E7 证据；未获远端授权时保持 blocked，不以本地 green 代替。

## 6. Phase 3：产品闭环、隐私与自助支持

| ID | 任务 | P | 依赖 | 估算 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| PROD-001 | 确认产品楔子、主要用户和三条核心任务 | P0 产品 | DEC-001,002 | M | 低 |
| PROD-002 | 机器可读能力成熟度账本 | P0 产品 | DEC-006,PROD-001 | M | 中 |
| PROD-003 | 首启 onboarding 与健康中心 | P1 | PROD-001,002,GATE-A2 | L/XL | 低 |
| PROD-004 | 按用户任务重构信息架构 | P1 | PROD-001,002 | L | 中 |
| PROD-UX-002 | 跨包可访问性基线与公共交互模式 | P1 | PROD-004 | M/L | 中 |
| PROD-UX-003 | Fullstack 138/89 能力发现与性能预算 | P1 UX | PROD-002,004,QG-010 | M/L | 中 |
| PROD-UX-004 | New App Products/Systems 同步刷新恢复 | P1 UX | PROD-002 | S/M | 高 |
| PROD-UX-005 | Team Hub Admin async error 与危险确认 | P0 管理 UX | SEC-RT-004,PROD-002 | M | 中 |
| PRIV-001 | 数据流与处理目的清单 | P0 隐私 | DEC-004 | M | 高 |
| PRIV-002 | “我说”opt-in、删除、保留与模型传输边界 | P0 隐私 | PRIV-001,DEC-004,DEC-011 | M | 中 |
| PRIV-003 | Skill Center telemetry 决策与实现一致 | P0 隐私 | PRIV-001,DEC-004 | S/M | 高 |
| OBS-001 | 隐私友好的本地 support bundle | P1 | PRIV-001,GATE-A2 | M | 高 |

### GATE-B · 产品闭环退出条件

- [ ] 一位新用户在不打开终端的情况下完成版本/TCC/Provider/Profile/连接检查。
- [ ] 用户从推荐岗位或小队启动并完成一条参考业务任务。
- [ ] UI 和文档统一显示能力的 Installed/Loaded/Configured/Connected/Outcome-verified 状态。
- [ ] 设置不再承担全部能力发现；Skill Center/统一能力面可按业务目标检索。
- [ ] Fullstack 视图能解释 catalog/selected/installed/ready，138/89 与 300 条扩容 fixture 满足已定义性能预算。
- [ ] New App 一次 Reload 同时重试 Products/Systems，部分失败、过期响应和重试均不要求关闭重开。
- [ ] Team Hub Admin 的异步失败可恢复，reset/disable 在明确确认前请求数为 0。
- [ ] 核心 dialog、tabs、搜索、异步状态通过自动 a11y、键盘与 VoiceOver 人工验收。
- [ ] “我说”的索引位置、删除、保留和外部模型传输有清晰披露。
- [ ] telemetry 的文档、代码、网络行为和用户选择一致。
- [ ] support bundle 默认脱敏，不收集会话正文和凭证。

## 7. Phase 4：效果、公开发行与商业路线

| ID | 任务 | P | 依赖 | 估算 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| PROD-005 | 核心任务基线、golden cases 与评分规范 | P1 | PROD-001 | M | 高 |
| PROD-006 | 有/无能力的 matched outcome evaluation | P1 | PROD-002,005 | L | 中 |
| OBS-002 | TTFV、任务成功、恢复、升级指标 | P1 | PROD-003,PRIV-001 | M | 中 |
| DIST-002 | Developer ID、hardened runtime、公证与 stapling | P0 公开发行 | DEC-005,GATE-A2 | L+外部等待 | 低 |
| REL-009 | exact final DMG 的 fresh/N-1/rollback attestation | P0 公开发行 | REL-001..003,DIST-002,QG-012 | L | 低 |
| REL-004 | GitHub Release 五方字节闭环与 published 转换 | P0 | REL-001..003,REL-009,QG-007 | M | 低 |
| REL-005 | release 状态机与双远端闭合 | P1 | DEC-007,REL-004 | M | 中 |
| REL-006 | 版本、包数、SOP 单一事实源 | P1 | REL-004,005 | M | 高 |
| DIST-001 | 签名 release feed 与只读更新提示 | P1 | REL-004..006,DEC-004 | M | 高 |
| DIST-003 | 下载、校验、同一 install.sh、stable/canary、回滚 | P1 | DIST-001,002,REL-009 | L | 低 |
| DIST-004 | 公网字节的干净机器安装、升级、回滚与 TCC 矩阵 | P0 公开发行 | REL-004,REL-009,DIST-002,003 | L | 低 |
| REL-008 | 灰度状态、指标与停止/回滚自动判定 | P1 | OBS-002,DIST-004 | M | 中 |
| GOV-001 | 客户文档与维护者文档分层 | P1 | REL-006,PROD-001 | M | 高 |
| GOV-002 | ADR/Note 综合索引与现行/历史标记 | P2 | REL-006 | M | 高 |
| BUS-001 | 选择商业产品形态 | P1 商业 | PROD-001,006 | M | 低 |
| BUS-002 | SKU、授权、更新权益、SLA、许可证和数据责任 | P1 商业 | BUS-001,DIST-002 | L | 中 |

### GATE-C · 公开生产候选退出条件

- [ ] Developer ID、notary ticket、staple、`spctl`、签名身份均通过自动核验。
- [ ] exact final DMG 已取得绑定 digest、无 skip 的 fresh install、N-1 upgrade 和 failure rollback attestation。
- [ ] GitHub Release 的 DMG、`SHA256SUMS`、manifest、tag commit、REL-009 attestation 五方全等；Latest 指向最高 published semver。
- [ ] 更新提示可验证版本、hash 和 channel；自动安装只消费可信 feed、签名、公证与 rollback-ready 证据。
- [ ] 公网下载的 DMG 从零开始完成安装、首启、N-1 升级、同版重装、失败回滚、用户数据保留和 TCC 验证。
- [ ] stable/canary feed 被篡改时拒绝安装；旧版本仍可降级。
- [ ] 三条核心任务的 matched evaluation 不低于无增强基线，并有明确适用边界。
- [ ] 灰度指标不再只依赖 1–2 人的口头反馈；失败能触发停止或回滚。
- [ ] 产品宣传、能力账本、客户文档和实际状态一致。
- [ ] 若进入商业化，授权、更新期限、支持 SLA、第三方许可证与数据责任已明确。

13. `QG-006B`（2026-09-17 第六轮，用户指定「直接进 QG-006B」）：**已落地**。
    - 新增 `scripts/lib/repo-snapshot.mjs`（纯函数快照：git tracked/untracked 内容哈希 + 声明根深度 1 名录 +
      未声明 ignored 区域全量 + HEAD/refs/index 字节；空射程、目录折叠、枚举与磁盘不一致一律判红）、
      `scripts/lib/repo-attest.mjs`（真子进程 + 独立进程组 + before/after 见证）、
      `scripts/lib/attest-scope.mjs`（`DSH_ATTEST_REPO` 与安静度探测）。
    - 六条结束路径（正常 / 断言失败 / 非零退出 / fixture setup 失败 / cleanup 失败 / SIGTERM）逐条见证；
      聚合并发 10 轮 × 2 条完整 gate **在本仓库上直接跑通**（exit 0）。
    - 实测两个 Red：`kill -TERM` 一个运行中的门禁留下 8 个临时根并把子进程交给 init 收养；真实 `TMPDIR` 上
      累积 **2,066** 个残留根 / 35 MB（三个「从不清理」或「只在正常路径清理」的来源）。三条泄漏源已按
      `mutationRoot()` 窄接口迁移，迁移后重跑残留计数 **0 新增**。另修 `skill-lines.test.mjs` S4–S7 读真实
      `homedir()`、以及 `mutation-fixture.mjs` 三处 `checkJs` 类型错（后者此前从未被任何包级 `tsc` 看到）。
    - 新增门禁：`repo-snapshot-selftest`、`repo-attest-selftest`（quick）、`gate-concurrency-selftest`
      （full-only，30 分钟超时）+ `--attest` CLI 入口（供 `QG-007` 复算同一份快照契约）。
    - 最终读数：`quick` **78 项 / 76 pass / 2 skip / 0 fail，exit 0**；`full` **86 项 / 84 pass / 2 skip / 0 fail，exit 0**。
    - 决策见 ADR-0103 与 `docs/notes/implemented/contract/2026-09-17-self-attestation-and-process-reaping.md`；
      复发总账新增 P-34 并更新 P-31。改动仍在本地工作树、**未 commit/push**；L3 独立 runner 由 `QG-007` 收口。

14. `QG-007`（2026-09-17 第七轮，用户「同意继续下一批」）：**workflow 与离线判据已落地；L2/L3 未取得**。
    - `.github/workflows/gate.yml`：`quick`（PR+push）与 `full`（push-only）；只读 permissions、并发取消、
      钉住的 Node/pnpm、每 job 的 timeout + `--attest` 见证 + `if: always()` artifact 上传。
    - `scripts/gates/ci-workflow.mjs` + `ci-workflow.test.mjs`（**27/27**，21 条具体事故变异）：
      workflow 契约的离线判据，返回值固定带 `authority: 'L1-static'`，读数里禁止出现 `CI-verified`/`L3`/`required check`。
      实测结论：**不需要 macOS host job**——门禁只依赖 node + git + POSIX 工具，故按模式而非平台拆。
    - 干净 HOME 干跑把「干净 runner 上哪些项没有射程」变成读数：`total 80 / pass 71 / skip 9 / fail 0`，
      9 项 skip 全带类型化理由。该干跑当场抓出 `skill-lines.test.mjs` S2/S3 读真实 `homedir()`
      （S2–S7 现全部注入合成 HOME），并顺带修掉聚合层「混用 canonical/legacy 只报 schema invalid」的报错。
    - 负例（在副本 `/tmp/qg007-neg` 上做，未动真实工作树）：catalog 138→137 → `fullstack-catalog` 判红点名 `manifest 缺 retro`；
      插件入口删除 → `plugin-entry-contract` `checked=22 failed=1`；intake 守恒式破坏 → `third-party-intake` `failed=2` 点名无终态的 source ID。
    - **未取得 L2/L3**：本机 GitHub 不可达（443 超时 75s）、容器 daemon 未运行；未 push、未建远端 required check。
      卡面 Red 条款据此执行：所有 CI 结论标注为 **L1-static**，不宣称 CI 已建立。决策见 ADR-0105。
15. `QG-008`（2026-09-17 第七轮后续，用户「授权并继续下一批 QG-008」）：**已完成并生效**。
    - 授权范围由用户明确选择「两步都授权」：允许用 GitHub API 推送 workflow 到 main，并随后创建 ruleset。
    - **远端变更**：workflow 经 API 提交 `623404375e95`（只加一个文件）；ruleset `main-protection`（id **23564403**）
      与 `release-tag-protection`（id **23564404**）已创建并生效。变更前快照 = `rulesets: []` + main protection 404。
    - **服务端执行证据**（不是「配置看起来对」）：`PATCH /git/refs/heads/main`（force）→ 422
      `Cannot force-push to this branch / Changes must be made through a pull request / 2 of 2 required status checks are expected`；
      `DELETE /git/refs/tags/v2.4.1` → 422 `Cannot delete this tag`；移动 tag → 422 `Cannot update this protected ref`。
    - **落地物**：`scripts/gates/ruleset-declaration.json`（唯一事实之家）、`ruleset-audit.mjs`（纯比对）、
      `audit-rulesets.mjs`（只读 CLI，退出码 0/1/2 = 全等/不符/**拿不到读数**）、`apply-rulesets.mjs`（由声明推导 payload，默认 dry-run）、
      `ruleset-audit.test.mjs` + `fixtures/rulesets-live.json`（**15/15**，基线取自真实 API 读数）。
      门禁新增 `ruleset-declaration-selftest`（quick）与 `ruleset-audit`（L2 只读，无读数时类型化 skip）。
    - **首跑暴露的最重要一件事**：`gate (quick)` 在 GitHub 上显示 success，而 artifact 里 `gate-quick.json` 写着
      `"status": "fail", "failed": 6` —— `node … | tee out.json` 把退出码换成了 `tee` 的 0，六个真失败被一根管道挡住。
      已加 `set -o pipefail` 并新增判据（变异 22 + 基线反向断言），总账新增 **P-35**。
    - 同轮修掉：判据误读列表端点（缺 `conditions`/`rules`，会把「保护在」判成「保护不在」）→ 总账新增 **P-36**；
      更正 `docs/adr/ADR-0001.md` 与 `docs/release-process.md` 两处**声称存在但实际不存在**的保护。
    - **已知边界**：任何 PR 在 CI 变绿前都无法合并（required check 含 `gate (full)`，而它在干净检出上因
      `pin-consistency` 等项判红）；`ruleset-audit` 在 CI 上是 `api-unavailable` 类型化 skip；break-glass 留痕机制上做不到。
    - 决策见 ADR-0106。
16. **（未立项，等决策）** 见证射程的成本上限 + `packaging/backup/` 的归属。
    - 事实：另一会话放入 `packaging/backup/pre-2.0.10-migration/`（**7.9 GB**，含 DSH Desktop.app 副本），
      `.gitignore` 的 `!packaging/**` 让它不被 ignore，于是进了见证射程：
      快照条目 2,278 tracked + **1,361 untracked**，单次 `snapshotRepo` **130 秒**（改动前基线 1.1 秒）。
    - 后果：`gate-concurrency-selftest` 每轮需 4 次快照 ≈ 520 秒 > 单轮上限 300 秒 → **必然失败**。
    - 两个可选处置（需用户定）：① `.gitignore` 加 `packaging/backup/`（它是本机迁移备份，
      与已 ignore 的 `packaging/.app-cache/`「可重建的工作副本」同类）；
      ② 给快照加**字节预算**——载荷超限时报 `SNAPSHOT_SCOPE_TOO_EXPENSIVE` 并给类型化 skip，
      而不是让见证在 13 分钟后超时（现在正是后者）。
    - 附带修好的：悬空软链让 `git hash-object` 整批失败（总账 **P-37**，已修 + 回归用例）。
## 8. 建议的未来实施顺序

用户后续已授权从完整方案进入阶段执行；每一轮权限以最新用户消息和对应任务卡共同圈定，不从历史 batch 推导额外授权。本轮完成 `PROD-UX-001 + QG-012` 的本地实现与离线判别力收口后停止；未运行 live GUI/profile/clean-install，也不构成 commit、push、`QG-006B`、删除、安装、Codeup、发布或其他任务授权。按下列批次逐个执行并在每批后停止：

1. `BASE-001` + `BASE-002`：已完成；冻结文件归属、hash 与验收边界。
2. `SEC-RT-001`：已完成本地修复并进入既有 checkpoint；真实店铺/live/clean-machine/DMG 验收仍 deferred。
3. `SEC-RT-003A`：已按单独授权完成本地实现与临时根 fault/concurrency/recovery 验收；真实 `~/.dsh` 未做 mutation，UI/live 人工验收 deferred，第三方 promotion 继续等 SEC-RT-002 ledger。
4. `QG-001` + `QG-002` + `QG-010` + `QG-011`：均已完成本地实现与分层验收；`QG-010/QG-011` 已由 GitHub checkpoint `cc6f1ac` 固化。QG-007 远端 required check 与聚合并发/SIGTERM/零副作用仍分别由后续 `QG-007`、`QG-006B` 收口。
5. 用户先完成 `DEC-009`，再独立实施 `SEC-RT-003` + `SEC-RT-002`；MCP、LoopX、第三方技能分别给 Red/Green 和 clean-machine 证据。
6. 用户先完成 `DEC-010`，再实施 `QG-003` + `QG-005` + `REL-001`，证明 clean checkout 可重建 Settings artifact 与冻结发布输入。
7. `QG-006A` 已完成隔离基础设施与现存 mutation suite 迁移；改动仍在本地工作树、未提交。未来 QG-005 等新 mutation 必须消费该契约，完整并发/SIGTERM/worktree snapshot 仍由独立 `QG-006B` 完成。
8. `PROD-UX-001` + `QG-012` 已完成本地 scope contract 与 L1/L2 instrument/mutation 验收；改动仍在工作树、未提交。真实 Chrome/DSH、键盘/VoiceOver、两种 zoom、clean-install 继续 deferred，状态为 `instrument verified, live unverified`。
9. `SEC-RT-006` + `SEC-RT-007`（2026-09-16 第二轮）：已按用户指定顺序完成本地实现、Red/Green 重放与变异自测；损坏配置由 fail-open 改为 fail-closed、13 处直写最终路径收成单一原子写入器、OAuth flow 收进单一所有者并补齐 3 条缺失的 route disposer。装载点已同步并逐字节复核。剩余项：设置页客户端渲染、重启后状态/token 保留、真实 PixPix 授权四条人工验收（均需重启应用或真实账号，本轮未做）。改动仍在工作树、未提交。

10. `SEC-RT-006` + `SEC-RT-007` 重启后验收（2026-09-16 第三轮，用户重启应用后）：
    - **生产 Green**：装载点 `~/.dsh/profiles/desktop/node_modules/dsh-wanzh-hulian` 的 `index.js` / `atomic-store.js` / `oauth-flow.js` 与仓库源**逐字节一致**；22:01:29 发生一次真实落盘，产物 JSON 可解析、权限 0600、无 `.tmp` 残留、无损坏归档；`connections.json` / `mcp-servers.json` mtime 停在 09-10，无多余回写。**「重启后状态保留」由 unverified 转为 verified。**
    - **仍未验证**：设置页渲染 `health`/`flow`（需 GUI 目视）、真实 PixPix 授权四条人工项。
    - **新发现（活的运行时缺陷，非本轮回归）**：`~/.dsh/integrations/wanzh-hulian/oauth-pixpix.json` 中 `expires_at = 2026-09-06 23:59:21`（已过期约 10 天），`_refresh_failed_at = 2026-09-16 22:01:29`，`_refresh_error = "token 交换失败 HTTP 400: resource is invalid"`。即重启后刷新被服务端拒绝，**当前该集成不可用，唯一出路是重新授权**——而重新授权路径正是上一轮审证 I-1 指出的薄弱点。归入 `SEC-RT-007` 剩余项，需真实账号复核。

11. `SEC-RT-005`（2026-09-16 第四轮）：wanzh 与 team-hub 两侧 HTTP 面无界读 body 收口（新增 `bounded-body` 模块、13 个调用点、25 条真 socket 用例），同批修掉 team-hub 三处 `try` 内 `return promise` 不 `await` 导致「请求进了处理器却永远没有响应」，并发现 P-24 复发（`files` 漏 `lib/atomic-store.js`、`lib/oauth-flow.js`）。
12. `QG-013`（2026-09-16 第五轮，用户指定「先把 files 完整性门禁立卡补上，再来 QG-006B」）：**已补立卡并落地**。
    - 新门禁 `package-files-coverage` + `package-files-coverage-selftest`（判据实现与 23 条用例见 [02 工作流](workstreams/02-gates-ci.md)）；
    - **立论基础实测**：`pnpm` 对 `file:` 依赖按 `files` 白名单物化（隔离临时根，`files:["lib/a.js"]` 的包安装后只有 `a.js`），缺件命中的是**全新安装**而非仅发布面；
    - **Red 重放**：把 `dsh-wanzh-hulian` 的 `files` 回退到复发版本后判 `fail`（`checked=122 / failed=2`，点名 `lib/atomic-store.js`、`lib/oauth-flow.js`），恢复后与备份逐字节相同；
    - **Green**：`--mode quick` → **72 项：71 pass / 1 skip / 0 fail**，exit 0；`--mode full` → **79 项：78 pass / 1 skip / 0 fail**，exit 0；本项 `expected=124 / checked=124 / skipped=0 / failed=0`；
    - **顺带修掉上一批的 `gate:full` 红灯**：`scripts-runnable` 判红——wanzh `typecheck` 16 条 TS 错误（`readBoundedJson` 的 `@returns` 收紧成 `unknown` 打断 10 处字段读取；测试 6 处未收窄）。上一批只跑 quick，而该项是 `modes: ['full']`。已修并复读 `tsc` exit 0、wanzh 86/86、装载点同步后逐字节一致；
    - **校准**：23 个有 `files` 白名单的受管包与真实 `npm pack`（npm 11.14.1）**逐文件全等**；
    - 决策见 [ADR-0101](../../../docs/adr/ADR-0101.md) 与[决策记录](../../../docs/notes/implemented/contract/2026-09-16-package-delivery-allowlist-coverage.md)；
      P-24 里「仍然未落地的机制」已被替换为真实门禁名；
    - **未做**：未 commit/push、未读改 profile 装载点、未触发任何真实安装；`QG-004` 仍未完成，本卡不替代它。

13. `QG-003` + `QG-004` + `QG-005`（2026-09-17 第六轮，用户指定「先做 QG-003/004/005」）：**三张卡均已落地**。
    - **共同根因**：射程变小与「没有问题」在读数上同形。三处各有各的收缩路径（自比较的 diff 表达式、
      读不到就 `continue`、解析失败吞成 `{}`），但结果一样：少看的那部分不会让任何东西变红。
      统一契约见 [ADR-0102](../../../docs/adr/ADR-0102.md) 与[决策记录](../../../docs/notes/implemented/contract/2026-09-17-gate-scope-is-the-denominator.md)：
      **分母 = 被检查对象的完整集合**，每个对象落在且只落在一个桶里（`expected = checked + skipped + failed`），
      空射程只能报 `skip` 不能报 `pass`。
    - **`QG-005`**：新模块 `scripts/gates/changed-packages.mjs`。Red 是 L1 临时 Git 仓库里实测的
      「本地超前 `origin/main` 两个提交、两个包被改 → 旧射程为空集」；真实仓库里 31 个 untracked 文件
      一个都不在旧射程内（含 `packages/infra/dsh-team-hub/src/bounded-body.mjs`）。20 条反向自测，
      关掉 untracked 来源后 5 条转红。新门禁 + `changed-packages-selftest`。
    - **`QG-003`**：`scripts/gates/plugin-entry-contract.mjs` 重写并**首次接线**（此前该模块从未被任何
      东西 import——P-04 的形态叠在 P-02 上）。Red 是「23 候选里 2 个从分母消失、门禁仍退出 0」；
      那 2 个本来就是插件（默认导出是 Cordis `Service` 子类）。28 条反向自测，L1/L2/L3 三层。
    - **`QG-004`**：新模块 `scripts/gates/profile-coverage.mjs`。Red 在**假 HOME 上端到端重放**：
      把 profile 的 `package.json` 写成截断 JSON，三个 profile 门禁**一起静默变绿**
      （`bundle-sync` 的读数还写着「对比 0/0 个 file: 依赖」）；Green 是同一命令下三面全判红。
      18 条反向自测，关掉目标缺失判红后 7 条转红。
    - **Green 读数**：`--mode quick` → **76 项：75 pass / 1 skip / 0 fail**，exit 0；`--mode full` → **83 项：82 pass / 1 skip / 0 fail**，exit 0；
      `plugin-entry-contract` 23/23、三个 `profile-*` 各 24/24、`changed-packages` 12/12。
    - **未做**：未 commit/push；未读改真实 profile（QG-004 的 Red/Green 全在假 HOME 与临时 fixture 上跑）；
      未触发任何真实安装；`DSH_GATE_BASE_SHA` 的注入方是 QG-007；`QG-006B` 仍待做。
    - **本批额外发现（不属于本批范围）**：`pnpm-lock.yaml` 被 `.gitignore` 忽略（白名单式忽略，
      第 14 行 `*` 起手），因此**永远不出现在 `git diff` / `git status` 里**。治理规则表里因此没有为它
      登记条目——登记一条永远匹配不到的规则就是造一条死规则；本批新加的自测「每条登记的规则在真实仓库里
      都活着」会把这类死规则抓出来。


## 9. 基座迁移立项（2026-09-16 用户拍板）

用户已就 `DSH Desktop v2.0.5 → v2.0.10` 做出三项决策：路径取 **A·整体迁移**、授权**下载官方 DMG 与建立隔离轨道**、执行顺序为 **review 剩余 TODO 先做**。

- 完整方案：[BASE-MIGRATION-2.0.10-PLAN.md](BASE-MIGRATION-2.0.10-PLAN.md)
- **治理前提（未完成不得进入 M-1）**：必须出 `ADR-0006` 修订记录，且写明真实放行理由为「用户决定越过观察窗」。截至本记录**未发现** 2.0.6–2.0.10 的点名安全修复，**红线未触发**；任何后续文档不得改写成「因红线必须跟进」。
- 迁移批次编号沿用 `M-0…M-9`，与既有 `UPSTREAM-BASELINE-AND-MIGRATION.md` 的 U0–U8 骨架对应，不占用本表的 `SEC-RT` / `QG` / `REL` / `PROD` 编号空间。
- 本立项**不含**任何 commit、push、发布、生产机安装或远端操作。

Team Hub、远端 CI/ruleset、Developer ID、公证、真实安装/删除、Release 和客户机操作均在上述批次之外，仍需各自的明确授权。
