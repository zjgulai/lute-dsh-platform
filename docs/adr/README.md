# 架构决策记录（ADR）

## 索引

| 编号 | 标题 | 状态 |
| --- | --- | --- |
| ADR-0001 | GitHub monorepo 管理：单仓库发布 DSH 二开平台 | accepted（2026-09-06） |
| ADR-0002 | DMG 发布：GitHub Releases 附件 + release/ 哈希清单 | accepted（2026-09-06） |
| ADR-0003 | 版本策略：单平台版本 vX.Y.Z + 插件 package.json 对齐 | accepted（2026-09-06） |
| ADR-0004 | 仓库收录范围：全平台 monorepo（含 81-Skills 公开） | accepted（2026-09-06） |
| ADR-0005 | rc.1 基座迁移立项（LUTE 2.0.0，DSH 基线 2.0.4→2.0.5） | accepted（2026-09-10） |
| ADR-0006 | 上游版本跟进策略（月度观察窗 + 红线触发制） | accepted（2026-09-10） |

> 各插件历史决策（如 AI全栈 ADR-0001~0007、万物互联 D1-D5）保留在各插件 docs/ 内，后续新决策统一走本目录编号。

## 模板（ADR-NNNN）

```markdown
# ADR-NNNN · 标题

- 状态：proposed | accepted | rejected | superseded by ADR-XXXX
- 日期：YYYY-MM-DD
- 决策者：<人/角色>

## 背景
<为什么需要决策>

## 决策
<我们决定做什么>

## 备选方案
<考虑过的其他方案与取舍>

## 后果
<正面/负面/后续动作>
```
