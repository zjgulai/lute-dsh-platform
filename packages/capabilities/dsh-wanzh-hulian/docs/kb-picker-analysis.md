# 知识库选择交互 · 深度调研与方案分析（v1）

> 需求：用户不知道自己的 Get笔记 知识库有哪些；希望把知识库做成**可选卡片**，在对话输入区（附件附近）完成「定项选择」。
> 依据：得到大脑官方 API/CLI/App 的产品形态 + DSH 2.0.4 实时 Slot 树（cordis_inspect 实测）+ 已打通的 7 工具调用权限。

## 1. 得到大脑自身的「知识库选择」做法（调研结论）

| 层 | 做法 | 关键事实 |
| --- | --- | --- |
| App/Web | 知识库 tab = **卡片墙**：封面图 + 库名 + 笔记数，点卡进库；搜索/保存时在「当前库」内操作 | KnowledgeTopic 接口自带 `cover`（封面图）、`name`、`stats`（笔记数等）——卡片所需字段 API 全给 |
| CLI | `getnote kbs` 列库 → `getnote search "xx" --kb <topic_id>` | **选择一律按 topic_id**，没有按名字解析的接口 |
| OpenAPI | `GET /resource/knowledge/list`（scope=DEFAULT）→ `POST /resource/recall/knowledge`（topic_id）→ `save_note`（topic_id） | 同一事实：库 id 是唯一选择键 |
| 我们已实测 | getnote_topics 返回 11 个库（VOA/super_ip/产品经理/business_analysis/AI_Ability/Skills Graph/digital_of_me/lute_career/side_work/smoore_career…） | 库清单与 id 已可用，卡片数据源现成 |

**结论**：官方产品形态就是「卡片可选」；我们要做的是把这一步从 App 搬到 DSH 输入区，并在「选库」与「模型调用」之间架一座稳桥。

## 2. DSH 输入区可挂载位（实时 Slot 树实测）

| Slot | 形态 | 风险 | 用途 |
| --- | --- | --- | --- |
| `conversation.input.left` | list · session | 无替换风险 | **工具行左侧**（附件/模型所在行的左边）——「知识库」胶囊按钮的最佳入口 |
| `conversation.input.overlay` | list · session | 无替换风险 | composer 卡内浮层——卡片选择器弹层的理想位置 |
| `conversation.input.dock` | list · session | 无替换风险 | 输入框上方全宽条（出海技能 palette 在此）——常驻胶囊条备选 |
| `conversation.input.attachments` | single | **shadows-shipped-ui（禁改）** | 附件轨本体，不可动——只能用其旁边的 input.left |
| `conversation.composer.dock` | list · session | 无替换风险 | 输入框下方，备选 |

## 3. 四个方案对比

| | ① 工具行按钮 + 浮层卡片墙（推荐） | ② 输入框上方常驻胶囊条 | ③ 设置页默认库 | ④ 纯自然语言（现状） |
| --- | --- | --- | --- | --- |
| 位置 | input.left 按钮 → input.overlay 卡片墙 | input.dock 平铺胶囊 | 万物互联卡片加下拉 | 无 UI |
| 用户认知 | 像附件一样点开选库，符合「附件处加知识库」直觉 | 库多占行（11 库需横向滚动） | 选一次全局生效 | 用户不知道库名（痛点原点） |
| 选择后行为 | 点击卡片 → 插入「在 XX 库（id）搜/存」指令文本 → 模型显式拿到 topic_id | 同左（插入文本） | 未指定 topic_id 时工具用默认库 | 模型每次先 getnote_topics 再匹配 |
| 稳定性 | 高：全部走已验证的 Slot 契约 + 斜杠同款文本插入（onPick→text），零宿主上下文管道 | 同左 | 中：默认库语义需写进引导技能，模型遵守度依赖技能指引 | 高（无新代码）但体验差 |
| 兼容性 | 无版本漂移、无替换风险、数据源复用 getnote_topics（加一个 /topics 路由） | 同左 | 同左 | — |
| 工作量 | 小-中（一个按钮 + 一个浮层 + 一个路由） | 小 | 小 | 零 |

## 4. 推荐组合（供决策）

**主：方案 ① —— 工具行「知识库」胶囊按钮 + composer 浮层卡片墙**
- 按钮显示官方 logo + 「知识库」+ 当前选中库名 chip（未选则「全部笔记」）
- 点开浮层：卡片墙（cover 图 / 名称 / 笔记数）+ 顶部过滤框 + 首卡「全部笔记（全局搜索）」
- 点击卡片 = **插入指令文本**（斜杠同款路径）：「/得到大脑 在 super_ip 知识库（id QJmRL4Gn）搜：」或「保存到 super_ip 知识库：」——模型据引导技能自然带 topic_id 调 getnote_recall_kb / getnote_save，**零会话上下文注入、零新机制**，这是 DSH 里最稳的「定项」方式
- 卡片数据 = 宿主新增 `/topics` 路由（复用 getnoteTopics 调用，带 cover/name/stats），凭证缺失时浮层显示「未配置」指引

**辅：方案 ③ —— 设置页「默认知识库」下拉**
- save_note 未显式给 topic_id 时落入默认库（config.json 加 defaultTopicId），recall 不设默认（避免误搜）
- 引导技能正文补一句默认库说明，模型按需读取

**兜底：方案 ④ 自然语言**永远可用（现有能力，不删）。

## 5. 待决策问题

1. 选择器形态：A 工具行按钮+浮层卡片墙（推荐）/ B 输入框上方常驻胶囊条 / C 两者
2. 点击卡片的行为：A 插入指令文本（推荐，模型显式拿到库 id）/ B 设为会话级默认库 chip（需会话上下文注入，工作量大）/ C 两者
3. 是否加「设置页默认知识库」（save_note 缺省入库）：A 要（推荐）/ B 不要

## 6. 决策记录与落地（2026-09-06）

| 决策 | 选择 |
| --- | --- |
| 选择器形态 | A：工具行按钮（conversation.input.left）+ composer 浮层卡片墙（conversation.input.overlay），跨 Slot 共享开关用模块级 store |
| 点卡行为 | A：插入指令文本（inputActions.setDraft，斜杠同款）：「/得到大脑 在「库名」知识库（id: xx）搜索：」/「保存到「库名」知识库：」，模型显式拿到 topic_id |
| 默认库 | A：设置页「默认知识库」下拉（宿主 /topics + /default-topic，getnote_save 缺省落入，recall 不设默认） |
| 卡片内容 | cover 图（无则官方 logo 占位）+ 名称 + 笔记数 + id；首卡「全部笔记（全局搜索）」；每卡「搜索/保存」两小按钮 |

实现：宿主新增 GET `/topics`、POST `/default-topic`、state 增加 defaultTopicId、getnote_save 默认库回退；客户端设置卡加下拉、输入区加按钮+浮层（CSS 同套 dsw token）。已同步 profile（cat 覆盖），重启 + 刷新生效。
