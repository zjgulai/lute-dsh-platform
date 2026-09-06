# 得到大脑 · 笔记分类整理能力扩展方案（v1 讨论稿）

> 目标：补齐「移入/移出知识库、加/删标签、修改笔记内容、创建/删除知识库与文件夹」能力，支撑重新整理笔记分类。
> 状态：讨论稿，未改代码。依据：官方 @getnote/mcp 源码（client.ts）逐端点核实 + 现有 dsh-wanzh-hulian 插件架构。

## 1. API 事实（官方源码核实）

| 能力 | 端点 | 关键参数/响应 | 备注 |
| --- | --- | --- | --- |
| 修改笔记 | POST /resource/note/update | {note_id, title?, content?, tags?} | **仅 plain_text 类型可改内容**（链接/图片笔记改内容会被拒） |
| 加标签 | POST /resource/note/tags/add | {note_id, tags[]} → tags 列表 | |
| 删标签 | POST /resource/note/tags/delete | {note_id, **tag_id**} | 需先读笔记拿 tag_id（按名称匹配） |
| 移入知识库 | POST /resource/knowledge/note/batch-add | {topic_id, note_ids[], directory_id?} → {success_count, failed_note_ids[]} | 批量；失败清单必须回传 |
| 移出知识库 | POST /resource/knowledge/note/remove | {topic_id, note_ids[]} → {removed_count, failed_note_ids[]} | 批量 |
| 创建知识库 | POST /resource/knowledge/create | {name, description?, cover?} → {id,...} | **每日上限 50**（429 quota_daily_exceeded） |
| **删除知识库** | **无此接口** | — | 官方全量客户端无 deleteTopic；替代 = 清空库内笔记 + App 端删除该库 |
| 库内笔记列表 | GET /resource/knowledge/notes | {topic_id, page} → 分页 | 盘点必需 |
| 文件夹列表 | GET /resource/knowledge/directories | {topic_id, directory_id?} | |
| 建/改/删文件夹 | POST /resource/knowledge/directory/{create,update,delete} | delete 仅**空目录** | |
| 删除笔记 | POST /resource/note/delete | {note_id} | 移入**回收站**（可恢复） |

## 2. 新增工具集（12 个，总工具数 7→19）

| 工具 | 参数 | 说明 |
| --- | --- | --- |
| `getnote_update_note` | note_id, title?, content?, tags? | tags 传列表 = **整体替换**；plain_text 限定写进描述 |
| `getnote_add_tags` | note_id, tags[] | 追加标签 |
| `getnote_delete_tag` | note_id, tag_id | 描述注明「先 getnote_get 取 tag_id」 |
| `getnote_topic_notes` | topic_id, page? | 库内笔记分页列表（盘点） |
| `getnote_move_to_topic` | topic_id, note_ids[], directory_id? | 批量移入；单次建议 ≤50 条；失败清单回传 |
| `getnote_remove_from_topic` | topic_id, note_ids[] | 批量移出；失败清单回传 |
| `getnote_create_topic` | name, description? | 建知识库（每日 50 上限提示） |
| `getnote_topic_directories` | topic_id | 浏览文件夹树 |
| `getnote_create_directory` | topic_id, name, parent_id? | |
| `getnote_update_directory` | topic_id, directory_id, name?, parent_id? | 改名/移动文件夹 |
| `getnote_delete_directory` | topic_id, directory_id | 仅空目录；描述注明 |
| `getnote_delete_note` | note_id | 移入回收站（**可选**，见决策） |

**不做**：删除知识库（API 不存在）——方案中明确替代路径（库内移空 → App 删除）。

## 3. 安全与流程设计（批量写操作红线）

1. **两阶段制**（写进引导技能）：任何「整理分类」任务必须
   - **阶段一 盘点（只读）**：getnote_topics + getnote_topic_notes + getnote_get 拉清单与标签现状 → 产出「分类映射方案」给用户；
   - **阶段二 执行（写）**：用户确认方案后才逐库执行 move/remove/tags/update；**禁止未经确认的全库自动重分类**。
2. **失败可见**：批量接口的 failed_note_ids 原样回传；单条失败不静默跳过，列入整理报告。
3. **删除语义**：删笔记 = 回收站（可恢复）；删文件夹 = 仅空目录；删知识库 = 明确告知不可行并给替代。
4. **既有防线复用**：连接总开关热闸门、凭证不可见、loopback、大整数保真、30s 超时全部继承。

## 4. 改动范围（实施时）

| 层 | 改动 |
| --- | --- |
| lib/index.js | toolDefs 增 12 个（同一 getnoteRequest 客户端，纯增量） |
| lib/catalog.js | capabilities/tools 数组更新（19 工具） |
| skills/getnote-brain/SKILL.md（模板） | 增「整理分类」章节：两阶段制 + 失败回传 + 删除边界 |
| ~/.dsh/skills/getnote-brain/SKILL.md | 宿主 ensureSkill 首次安装时已是新模板；已安装用户由宿主同步（仅当内容缺失时更新一次） |
| 兼容性 | 零新依赖、零壳内改动；重启 + 刷新生效 |

## 5. 验收方案

1. 静态：语法 + verify（无专门脚本，人工核对 toolDefs 注册数与 catalog 一致）。
2. 只读冒烟（真实账号）：getnote_topic_notes 拉一个库的笔记清单、getnote_topic_directories 读文件夹树。
3. 写试点（最小面）：① 建临时文件夹 → 移入 1 条笔记 → 移出 → 删空文件夹；② 给 1 条笔记加标签 → 删标签；③ 改 1 条 plain_text 笔记标题（改回）。
4. 试点通过 → 与你确认「全库整理映射方案」→ 批量执行 + 整理报告。

## 6. 待决策问题

1. `getnote_delete_note`（移入回收站）要不要一起装？（整理时清冗余常用，推荐装）
2. 文件夹工具保持 3 个独立（create/update/delete）还是合成 1 个 `getnote_directory {action}`？（推荐 3 个独立，模型调用更明确）
3. 删除知识库：接受「API 无此能力 → 库内清空 + App 端删除」替代路径？（如实告知，推荐接受）
4. 两阶段制（盘点方案 → 你确认 → 执行）作为整理任务的强制流程，认可吗？（推荐认可）

## 7. 决策记录（2026-09-06）

| 决策 | 结论 |
| --- | --- |
| 删笔记工具 | **装** `getnote_delete_note`（回收站，可恢复） |
| 文件夹工具 | **3 个独立**：getnote_create_directory / getnote_update_directory / getnote_delete_directory |
| 删除知识库 | **接受替代路径**：库内清空 + App 端删除（API 无删库接口，如实告知） |
| 整理流程 | **强制两阶段制**：盘点（只读）→ 映射方案经用户确认 → 才执行写操作；禁止未经确认的全库自动重分类 |

最终工具集 = 现有 7 + 新增 12 = **19 个**：
update_note / add_tags / delete_tag / topic_notes / move_to_topic / remove_from_topic / create_topic / topic_directories / create_directory / update_directory / delete_directory / delete_note / + 现有 7（topics/recall/recall_kb/save/list/get/quota）。

实施清单（待「开始」）：
1. lib/index.js 增 13 个 toolDefs（同一 getnoteRequest 客户端；批量工具单次 ≤50 条并回传 failed 清单；update 注明 plain_text 限定；delete_tag 注明先取 tag_id；delete_directory 注明仅空目录）。
2. lib/catalog.js：capabilities/tools 更新（20 工具）。
3. 引导技能模板 + 已装技能：新增「整理分类」章节（两阶段制 + 失败回传 + 删除边界），宿主 ensureSkill 对已装技能做一次增量更新。
4. 重启 → 只读冒烟 → 写试点 → 全库整理映射方案。
