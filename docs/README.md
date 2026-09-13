# docs 索引

本目录沉淀 LUTE Agentic System（DSH Desktop 二次开发平台）的决策与知识资产。

本页是**人工入口**，不是事实源：分层规则见根 [AGENTS.md](../AGENTS.md)，门禁契约见 [architecture.md](architecture.md) 第 0 节。

## 文档脊柱（改代码前先读）

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 常驻规则 | [../AGENTS.md](../AGENTS.md) | 每会话必读的结论与归属地，每条链接其详细文档 |
| 有序地图 | [architecture.md](architecture.md) | 仓库构成、门禁契约、基座事实、红线、模块地图 |
| 决策时间线 | [adr/](adr/) | ADR-NNNN 编号时间线（决定**是什么**），索引见目录内 README |
| 决策理由 | [notes/](notes/) | `{lifecycle}/{class}/yyyy-mm-dd-topic.md`（为什么改、放弃了什么），非机械改动必须附一篇 |

## 故障排查（优先看）

| 文档 | 说明 |
| --- | --- |
| [dsh-desktop-white-screen-playbook.md](dsh-desktop-white-screen-playbook.md) | **DSH Desktop 白屏排查手册**：速查卡（主区白屏 / 整窗白屏二分）+ 三类白屏实战案例（root 槽竞态 ×2、HMR 热更 ×1）+ 二次开发红线清单 + 修复工具箱（RootOutlet 兜底 / runtime-guards G1/G2）。二次开发遇到白屏先查这里（唯一 home，`_doc-notes/` 下的旧副本已移除）。 |

## 架构与流程

| 文档 | 说明 |
| --- | --- |
| [architecture.md](architecture.md) | 平台架构与维护/生效语义（含万物互联与出海技能当前产品形态，2026-09-09 对齐） |
| [upgrade-2.0.5-window-plan.md](upgrade-2.0.5-window-plan.md) | **升级窗口执行方案**（基座升级时整窗执行；含品牌/主题/导航的锚点处置现状与窗口复验清单） |
| [release-process.md](release-process.md) | 版本发布 SOP |
| [../packaging/INSTALL-GUIDE.md](../packaging/INSTALL-GUIDE.md) | **客户安装手册（用户版）**：逐步操作 / 授权三项 / 失败对照表 / 卸载回退；随 DMG 分发，是客户侧安装事实的唯一 home（速查卡：[../packaging/INSTALL-CARD.md](../packaging/INSTALL-CARD.md)） |
| [adr/](adr/) | 架构决策记录（ADR-NNNN，模板与索引见目录内 README） |

## 子产品文档入口

| 文档 | 说明 |
| --- | --- |
| [../packages/capabilities/dsh-wanzh-hulian/docs/README.md](../packages/capabilities/dsh-wanzh-hulian/docs/README.md) | 万物互联产品形态总览（四板块/4 MCP/认证机制/技能同步） |
| [../packages/capabilities/dsh-wanzh-hulian/docs/mcp-connections-2026-09-08.md](../packages/capabilities/dsh-wanzh-hulian/docs/mcp-connections-2026-09-08.md) | **最新**：业务化清单 / Shopify 客户端凭据 / Apify 接入（决策+验收+待办） |
| [../packages/capabilities/dsh-overseas-skills/docs/maintenance-sop.md](../packages/capabilities/dsh-overseas-skills/docs/maintenance-sop.md) | 出海技能维护 SOP（脱手手册） |
| [../packages/capabilities/dsh-overseas-skills/docs/recent-changes-2026-09-08.md](../packages/capabilities/dsh-overseas-skills/docs/recent-changes-2026-09-08.md) | 出海近期变更与坑位（分类 v3/硬链接/图标防抹） |
| [../packages/capabilities/dsh-overseas-skills/docs/skill-taxonomy-v2.md](../packages/capabilities/dsh-overseas-skills/docs/skill-taxonomy-v2.md) | 技能分类总表（v3 终审稿：8 大场景/28 细分/222 条） |

## 计划与报告

| 文档 | 说明 |
| --- | --- |
| [skillopt-optimization-plan.md](skillopt-optimization-plan.md) | SkillOpt 优化计划 |
| [skillopt-optimization-report.md](skillopt-optimization-report.md) | SkillOpt 优化报告 |
| [skillopt-skill-optimizer-merge-plan.md](skillopt-skill-optimizer-merge-plan.md) | SkillOpt 合并计划 |
| [skill-contract-plan.md](skill-contract-plan.md) | 技能契约计划 |
