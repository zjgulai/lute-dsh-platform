# LUTE 债务治理完整解决方案（四维审计 · 七簇整合）

> 2026-09-10 定稿 · 审计输入：docs/research/09-audit-{architecture,functional,capability,docs-tech}.md
> 决策：6 项已拍板（全部采纳推荐项）· 原则：**本方案只做决策与排程，不修改代码**
> 关联：docs/panorama-code-diagnosis-report.md（D1-D10）、docs/upgrade-2.0.5-window-plan.md（段⑤）、docs/release-gray-sop.md（灰度 SOP）

## 1. 七簇债务地图与决策记录

| 簇 | 本质 | 决策 | 决策要点 |
|---|---|---|---|
| C1 凭据与连接治理 | 万物互联承诺兑现率被凭据生命周期拖累 | **修三链+建健康面** | 灰度前修 pixpix/shopify/feishu；新增凭据健康面板（过期前置检测+面板状态+恢复 SOP），静默降级变可观测 |
| C2 能力空转与闭环 | 供应侧建设远超需求侧使用 | **真闭环试运行+标注制** | LoopX 补控制面并真实跑一轮 benchmark/pr-review；跑通升正式、跑不通降 beta；0 调用能力在能力墙标 beta |
| C3 记忆与数据工程 | 数据面工程欠账 + n+1 最大迁移风险 | 随排程（2.0.6 观察窗立项） | 写入策略对齐+来源域标注；V2→V3 迁移按 ADR-0006 红线制触发 |
| C4 补丁层可持续性 | 每窗口 3-5 人日重锚成本，退役机制缺失 | **每窗口强制退役≥3** | 退役转官方 token/slot 或上游 PR；清单与锚点数冻结进 manifest v2；不可退役项入「永不可退役」池 |
| C5 双形态与构建纪律 | 构建可复现性与「改了即生效」直觉缺失 | 并入 2.0.5 窗口清账（段⑤） | in-place 构建保 hardlink 为默认形态；三验升格 preflight 机器 gate；deepresearch tsc-b 阻塞在窗口内消解 |
| C6 观测面与假健康 | 降级路径静默化，故障无信号 | **vision 捆绑灰度窗口** | vision-router 2.0.1→2.1.4 与 2.0.0 灰度捆绑发布（rc-eval 已验证）；降级路径统一加告警 |
| C7 文档与治理 | 文档与真相对不上 | **全量补档** | P0 三件套（根 CHANGELOG 2.0.0 段/architecture.md 基线/README 一致性）+ 22 项 ADR 批量补档 + 05/07 收尾 + skills 目录 INDEX |

## 2. 执行排程（五段）

### 段 A：灰度前修复（P0，立即）
- **C1 三链**：pixpix（过期 token 刷新链路修复）、shopify（子进程 Connection closed 根因+恢复）、feishu（补 `app_slash_command:read` scope）——每链验收 = 工具清单恢复 + 一次真实业务调用
- **C1 健康面**：凭据健康状态入口（过期前置检测：token exp 提前 48h 告警）+ 恢复 SOP 文档
- **C7 P0 三件套**：根 CHANGELOG 补 [2.0.0] 段、architecture.md 基线改 2.0.5、README/PLAN 一致性复查

### 段 B：灰度发布（以段 A 完成 + 灰度名单为门）
- 按 docs/release-gray-sop.md 执行（1-2 老客户一周、六项观察指标）
- **C6 捆绑**：vision-router 2.1.4 随灰度窗口上线 + 降级路径告警
- 灰度期顺带观察：spill #865/867、UI-3 客户反馈、my-quotes rc 侧复验

### 段 C：灰度期并行（窗口机制类，非阻塞）
- **C4 退役机制**：建立「退役候选清单」（对照 09-audit-architecture §2.3 转换表）+ 每窗口配额≥3 冻结进 manifest v2 维护节
- **C5 段⑤清账**（2.0.5 窗口三件）：deepresearch 类型矩阵消解（上游 typed 包就绪后）、team-gui in-place 构建+preflight、brand 哈希锚重探测与 README 补记录
- **C2 LoopX 试运行**：控制面初始化（registry/goals）→ 跑一轮真实 benchmark → 升正式/降 beta 判定

### 段 D：灰度通过后（数据工程立项）
- **C3 数据工程**：三记忆库写入策略对齐（noema/灵枢来源域标注）；投影缓存与 zstd 恒等双份的治理决策（保留/收敛）；2.0.6 观察窗内按 ADR-0006 红线制评估 V2→V3 迁移
- **C7 全量补档**：22 项 ADR 批量补档（12+4+5+D1-D10 映射）、05 矩阵 ⏳ 清理、07 转正更名、skills 目录 INDEX、ADR 索引虚挂条目修正

### 段 E：持续机制（沉淀为流程）
- 每上游窗口固定议程：verify 漂移探测 → 重锚预算（3-5 人日）→ 强制退役≥3 → manifest 冻结
- 凭据健康面纳入月度检查单
- 能力墙标注制（beta/正式/废弃三态）随每次发布更新

## 3. 验收标准总表

| 段 | 验收 |
|---|---|
| A | 三链工具清单恢复+真实调用成功；凭据面板可显示三链状态；根 CHANGELOG/architecture.md 与 2.0.0 一致 |
| B | 灰度 7 天六项指标零超阈；vision 2.1.4 无新告警；spill/UI-3 有结论 |
| C | 退役候选清单≥10 条且配额制入 manifest；deepresearch tsc-b 全绿；LoopX 一轮 benchmark 有可复核结果（升/降判定书面化） |
| D | 记忆写入策略文档化；V2→V3 评估结论入 ADR；22 项 ADR 补齐；05/07 零残留 |
| E | 下一个上游窗口按固定议程执行且重锚耗时≤预算 |

## 4. 风险与依赖

- C1 三链修复依赖第三方（pixpix/shopify/feishu）凭据与账号权限——不可控项先记录阻塞；
- LoopX 试运行依赖 CLI 二进制就位（审计发现全机缺失）——先装 CLI 再试运行；
- C3 的 V2→V3 迁移以上游 0.1.5 发布为外部依赖——红线制触发，不主动抢跑；
- 灰度名单仍是人卡（业务侧指定）。
