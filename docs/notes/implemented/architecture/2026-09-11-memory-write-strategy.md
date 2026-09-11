# 三记忆系统的写入策略与来源域（Loop 4.1）

> 本文件是「谁写哪个记忆库」的**唯一事实源**（ADR-0009）。
> 实测时间：2026-09-11。证据为配置文件与数据库文件本身，逐条标注来源。

## 0. 结论先说：不存在三库并写

任务板把本 Loop 描述为「三记忆库」，实测**实为两个存储 + 一个桥接**：

| 名字 | 实际是什么 | 存储 | 实测状态 |
| --- | --- | --- | --- |
| **Noema** | 独立的持久记忆系统 | `~/.dsh/profiles/desktop/...`（tenant `personal`） | 活跃，写入策略 `review` |
| **LingShu（灵枢）** | 知识图谱 + 组合联想召回 | `~/.dsh/profiles/desktop/data/lingshu.db`（212 KB） | 活跃，最近写入 **2026-09-11** |
| `dsh-memory` | **灵枢的桥接插件，不是第三个库** | 同上（它自己不存数据） | 暴露 `lingshu_*` 工具 |

`dsh-memory` 的定位有代码级证据：它的默认 dbPath 哨兵落在 lingshu.db
（`src/index.ts:30-34`），且它向模型暴露的工具名前缀是 `lingshu_`
（如 `lingshu_remember`）——**包装的是灵枢，不是另有其库**。

## 1. 写入策略：已在配置里收敛，并写明理由

`~/.dsh/profiles/desktop/cordis.patch.yml:13-20` 原文：

```yaml
- id: dsh-memory
  config:
    python: /Users/lute/.dsh/aeis-venv/bin/python
    dbPath: /Users/lute/.dsh/profiles/desktop/data/lingshu.db
    # P2 记忆收敛：Noema 为主持久记忆；LingShu 降载（brain→core 12 工具）
    # 并关闭自动记忆（消除双写与上下文税），显式 lingshu_* 调用仍可用。
    tools: core
    memory:
      userMessage: false
```

即**双写问题已被处置**：

- **Noema = 主持久记忆**。状态端点实测 `write_policy: "review"` —— 写入先进复核队列，
  不直接落库。
- **LingShu 自动记忆已关闭**（`memory.userMessage: false`），并降载到 `core` 工具面
  （原 `brain` 12 工具）。**消除双写与上下文税**是配置里写明的动机。
- 显式 `lingshu_*` 调用**仍然可用**——降载不等于废弃。

## 2. 来源域标注：靠写入路径区分，靠 namespace 隔离

| 维度 | Noema | LingShu |
| --- | --- | --- |
| 租户/命名空间 | `tenant: personal`（状态端点） | 单一 SQLite，按 `tags` 分域 |
| 写入触发 | 显式 `noema_remember`（`review` 策略） | 自动写入已关；仅显式 `lingshu_*` |
| 典型标签 | 由调用方给（如 `lute` / `架构事实`） | `session` / `dsh` / `user` 等 |

**两者不共享命名空间，也不互相同步。** 因此「同一事实被两处写入」在当前配置下
**不会自动发生**——它的唯一来源是人或模型显式调用了两边的写入工具。

## 3. 已处置：陈旧残留（2026-09-11 删除）

| 路径 | 大小 | 最近修改 | 判定 |
| --- | --- | --- | --- |
| `~/.dsh/profiles/desktop/data/lingshu.db` | 212 KB | **2026-09-11** | ✅ 活跃库（配置指向它） |
| ~~`~/data/lingshu.db`~~ | 630 KB | 2026-08-31 | 🗑 **已删除** |

**删除前的三项确认**（避免误删）：
1. 无进程持有该文件（`lsof` 无输出）；
2. 无配置或环境变量指向它（`cordis.patch.yml` 指向 profiles 下的活跃库，
   `AEIS_DB` 未设置）；
3. 活跃库仍可读（13 张表）。

**一个容易漏掉的细节**：该残留**不止一个文件**，还有
`lingshu.db-shm`（32 KB）与 `lingshu.db-wal`（**4.1 MB 未检查点的 WAL**）。
WAL 里可能含尚未并回主库的写入，因此三件必须一起处理——只删 `.db`
会留下一个孤儿 WAL，既不完整也不再可用。备份因此打包了全部三个文件。

**处置方式**：先打包备份到 `_attic/lingshu-db-stale-20260831/lingshu-db-20260831.tar.gz`
（738 KB），再删除原件。恢复方式：`tar -xzf <备份> -C ~/data`。

`_attic/` 是仓库既有的归档位（既有 17 个退休条目），且**未被 git 跟踪**——
备份因此不入版本管理，符合该目录惯例（归档物留在本机，不进仓库）。

**为什么值得删**：一份体量更大（含 WAL 共约 4.9 MB）、名字更「正统」的旧库
留在 `~/data/` 下，任何按默认路径、或按「找最大的那个」选库的工具/人都可能
读到**过期数据**——而它看起来才像主库。

## 4. 未竟项（明确记录）

- **V2→V3 迁移结论**：依赖上游 0.1.5 发布，按 ADR-0006 红线制触发。本轮不涉及。
- **投影缓存治理**：未勘查（本轮预算用于确认写入策略与来源域）。
- 本文件只覆盖「谁写哪个库」。跨库检索时**优先级**（例如同一实体两边都有记录时信谁）
  未定义——若将来出现冲突，应在此处补一节并写 ADR。
