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

> ADR-0007 ~ ADR-0016 是「LUTE 二开平台架构重构」的十项决策，共享同一篇决策记录 Note。
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
