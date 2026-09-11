# 得到大脑 MCP 业务化改造 · 完整方案（待实施）

> 状态：**已实施（2026-09-06）**。决策：38 个全部业务化（实测官方 MCP 实际暴露 38 个）/ 技能路由（原生优先、MCP 补全）/ 6 组业务分组。

## 1. 目标

把 MCP 板块「得到大脑」卡做到与 PixPix 卡同款：6 组业务 chips、可展开 39 项能力（业务名 + 一句业务话术 + 技术名副标）、note 业务化；同时用技能路由解决 19 个原生工具与 39 个官方 MCP 工具的 57 名重叠问题。

## 2. 关键差异与应对

| 差异 | PixPix | 得到大脑 MCP | 应对 |
| --- | --- | --- | --- |
| 传输 | streamable-http | stdio 子进程 | 不 spawn 抓取；用静态业务映射表（官方工具名稳定，未知回退原文） |
| 实时工具清单 | 挂载后 tools/list 实时抓 | 无法低成本实时抓 | 宿主注入合成 toolMeta（source: "static"），ToolZone 复用同一渲染路径 |
| 技能 | pixpix-ecommerce 新建 | getnote-brain 已存在但只绑原生 19 工具 | SKILL.md 增补「官方 MCP 路由」章节（幂等升级，保留 flags） |

## 3. 实施清单（4 块）

### A. 宿主 lib/index.js

1. 新增 `GETNOTE_MCP_BUSINESS_META`：39 个官方工具的业务映射（businessName / businessDesc / scene），见第 4 节草案。
2. 新增 `GETNOTE_SCENE_CHIPS = ["记笔记", "找笔记", "知识库管理", "内容订阅", "上传与配额", "删除与清理"]`。
3. DEFAULT_MCP_SERVERS 的 getnote 条目：capabilities 换成 6 组业务分组；note 改为业务向文案（说明与上方「得到大脑」连接同源，日常直接用对话即可；订阅/直播/分享等能力仅本卡提供）。
4. `/mcp-servers` GET：对 `id === "getnote"` 且 `toolMeta` 为 null 的条目，注入合成 toolMeta：
   `{ tools: [{name, description: "", businessName, businessDesc, scene}...], source: "static" }`——ToolZone 自动获得可展开清单，业务字段优先、原文回退的渲染逻辑已就绪。

### B. 客户端 lib/client.js

**零改动**。ToolZone 已兼容 businessName/businessDesc 回退与静态注入；合成 toolMeta 注入后展开按钮自动出现（count 取自 toolCount 39）。

### C. 技能 getnote-brain（SKILL_TEMPLATE 升级）

1. SKILL_TEMPLATE 增补 `## 官方 MCP 路由（39 工具）` 章节：
   - **日常读写优先原生**：记笔记/搜索/读笔记/知识库移动/标签/删除 → `getnote_*`（语义优化过、带 true-move）。
   - **原生没有 → 官方 MCP**：分享链接（mcp__getnote__share_note）、订阅抖音博主/直播（follow_topic_blogger / follow_topic_live + 列表与详情）、录音时间线/逐字转写/快捷笔记/待办（get_note_timeline / transcript / quick_note / todos）、读笔记原文与附件（get_note_original / get_note_attachments）、官方图片上传路径（upload_image + get_upload_token）。
   - 等价对照表：getnote_save ↔ mcp__getnote__save_note 等，避免模型混用。
2. ensureSkill 升级检测条件：从「缺 ## 整理分类 才重写」改为「缺 ## 官方 MCP 路由 才重写」（新模板同时含两个章节；保留 disable-model-invocation / user-invocable flags）。

### D. 文档

- `docs/getnote-inventory-2026-09-06.md`：增补官方 MCP 39 工具业务化映射与路由规则。
- `docs/p4-mcp-tools-display.md`：第 9 节记录本次实施。

## 4. 39 个工具业务映射草案（实施时以实际挂载清单为准，未知回退原文）

### 记笔记（4）
| 工具 | 业务名 | 业务话术 |
| --- | --- | --- |
| save_note | 记一条笔记 | 把文字、链接或图片存成笔记，可带标题、标签、指定知识库 |
| add_note_tags | 给笔记加标签 | 给已有笔记追加标签 |
| update_note | 修改笔记 | 改笔记的标题、内容或整体替换标签 |
| share_note | 生成分享链接 | 把笔记生成公开分享链接，发给别人 |

### 找笔记（10）
| 工具 | 业务名 | 业务话术 |
| --- | --- | --- |
| recall | 全库语义搜索 | 在所有笔记里按意思搜，返回相关片段 |
| recall_knowledge | 知识库内搜索 | 在指定知识库内按意思搜 |
| list_notes | 最近笔记 | 分页列出最近的笔记 |
| get_note | 读笔记详情 | 读正文、标签、附件与转写 |
| get_note_original | 读原文 | 直接读原文，不拿 AI 摘要冒充 |
| get_note_attachments | 看附件 | 列出图片、音频、文件附件 |
| get_note_timeline | 读时间线 | 读录音/会议笔记的结构化时间线 |
| get_note_transcript | 读转写原文 | 读录音/会议/课堂的逐字转写 |
| get_note_quick_note | 读快捷笔记 | 读录音笔记的快捷笔记 |
| get_note_todos | 提取待办 | 从会议笔记提取待办清单 |

### 知识库管理（10）
| 工具 | 业务名 | 业务话术 |
| --- | --- | --- |
| list_topics | 知识库列表 | 列出全部知识库 |
| create_topic | 建知识库 | 新建知识库（每天限 50 个） |
| list_topic_directories | 浏览文件夹 | 看知识库的文件夹结构 |
| create_topic_directory | 建文件夹 | 在知识库里建文件夹 |
| update_topic_directory | 改文件夹 | 重命名或移动文件夹 |
| list_topic_notes | 库内笔记清单 | 列出知识库里的笔记 |
| batch_add_notes_to_topic | 批量移入知识库 | 把笔记批量加进知识库（每批≤20） |
| remove_note_from_topic | 移出知识库 | 把笔记移出库（笔记本身保留） |
| list_subscribe_topics | 订阅的知识库 | 列出订阅的他人知识库 |
| get_note_task_progress | 查链接笔记进度 | 查链接笔记创建任务的处理进度 |

### 内容订阅（7）
| 工具 | 业务名 | 业务话术 |
| --- | --- | --- |
| follow_topic_blogger | 订阅抖音博主 | 把博主订阅到知识库，自动沉淀内容 |
| list_topic_bloggers | 博主列表 | 看知识库订阅了哪些博主 |
| list_topic_blogger_contents | 博主内容列表 | 看博主发布了哪些内容 |
| get_blogger_content_detail | 读博主内容 | 读博主内容的完整原文 |
| follow_topic_live | 订阅直播 | 订阅一场得到 App 直播 |
| list_topic_lives | 直播列表 | 看知识库沉淀了哪些直播 |
| get_live_detail | 读直播详情 | 读直播的 AI 摘要和完整转写 |

### 上传与配额（4）
| 工具 | 业务名 | 业务话术 |
| --- | --- | --- |
| upload_image | 上传图片 | 把本地图片上传到得到大脑 |
| get_upload_config | 上传限制查询 | 查图片上传的类型和大小限制 |
| get_upload_token | 取上传凭证 | 拿 OSS 上传凭证（内部用） |
| get_quota | 配额查询 | 查调用配额余量 |

### 删除与清理（3）
| 工具 | 业务名 | 业务话术 |
| --- | --- | --- |
| delete_note | 删笔记 | 移入回收站（App 端可恢复） |
| delete_note_tag | 删标签 | 删掉笔记上的某个标签 |
| delete_topic_directory | 删空文件夹 | 删除空文件夹（非空不能删） |

> 计数：4+10+10+7+4+3 = 38；官方口径 39 工具，实施时以实际挂载清单核对，缺漏项补写或回退原文。

## 5. 验收标准（重启后）

1. MCP 板块得到大脑卡：6 组业务 chips；「查看全部 39 项能力」可展开，每行 = 业务名（加粗）+ 一行业务话术 + `mcp__getnote__<name>` 副标。
2. note 业务化（与上方连接同源说明 + 订阅/直播/分享等增量能力提示）。
3. `~/.dsh/skills/getnote-brain/SKILL.md` 含「官方 MCP 路由」章节，flags 保留。
4. 业务实测：说「帮我记个笔记」→ 走 getnote_save；说「订阅这个抖音博主」→ 走 mcp__getnote__follow_topic_blogger。

## 6. 风险与回退

- 静态映射与官方工具名不符 → 未知工具 businessName 为空，ToolZone 自动回退原文显示（已设计）。
- 官方 MCP 升级换工具集 → 映射表随插件包升级更新；升级前未知工具无损降级。
- 技能模板重写 → 幂等检测 + flags 保留机制与现有 getnote-brain 同款。


## 7. 实施记录（2026-09-06）

- 实测 spawn @getnote/mcp（带 CLI 凭证）→ tools/list 实际暴露 **38 个**工具（官方口径 39 含未暴露项），映射表按实测清单核对。
- 宿主：GETNOTE_MCP_BUSINESS_META（38 条）+ GETNOTE_SCENE_CHIPS（6 组）；getnote 默认条目 capabilities/note/toolCount(38) 业务化；/mcp-servers GET 对 getnote 无实时 meta 时注入合成 toolMeta（source: "static"）。
- 客户端：零改动（ToolZone 复用）。
- 技能：SKILL_TEMPLATE 增补「官方 MCP 路由（38 工具）」章节（原生优先 + 8 类增量能力 + 等价对照表）；ensureSkill 升级检测条件改为缺该章节才重写；本地 ~/.dsh/skills/getnote-brain/SKILL.md 已立即升级（flags 保留）。
- 验收：重启后 MCP 板块得到大脑卡应显示 6 组业务 chips + 可展开 38 项能力（业务名+话术+技术名副标）。
