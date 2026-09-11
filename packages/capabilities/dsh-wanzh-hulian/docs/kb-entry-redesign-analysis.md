# 知识库入口重设计 · 调研与方案分析（v2）

> 需求：移除输入框「知识库」大按钮；入口收进 📎 附件按钮的目录；在应用右侧提供知识库面板。
> 状态：分析讨论，未改代码。依据：实时 Slot 树 + `dsh-client-ui-conversation` / `dsh-client-ui-attachment` 源码级核查（app.asar.unpacked 内有完整 UI 包源码）。

## 1. 📎 附件按钮的真相（源码核查结论）

| 事实 | 证据 |
| --- | --- |
| 📎 本质是**图片选择器**（hidden input + `addImages`），不是可扩展菜单 | InputBar 中 `addImages` 由文件 input 触发（`files.length` → addImages），菜单不存在 |
| 「/」命令菜单是 extension（`toggleCommandMenu` / `useMenuLauncher`），与附件无关 | 5 处 toggleCommandMenu 全指向命令菜单 |
| 附件区 Slot = `conversation.input.attachments`（**single，shadows-shipped-ui，禁改**），由 dsh-client-ui-attachment 注入（draft 图片轨 + drop target） | 该包仅注入 input.attachments / message.images / trajectory.images 三处 |
| `inputActions` 公开 API 无「菜单项注册」：只有 setDraft / addImages / removeImage / pruneImages / draftImages / resolveSubmitMode / toggleCommandMenu / stop / command | 源码 grep 完整枚举 |

**结论：📎 目录没有公开扩展位。**「把知识库收进 📎 目录」在不动壳内 UI（稳定性红线）的前提下无法原生实现。可行替代见 §3。

## 2. 右侧面板的合规实现路径

| 路径 | 依据 | 判定 |
| --- | --- | --- |
| 右侧细节列（details column） | `ctx.layout.openDetails()` 可开关，但细节列内容 = `conversation.details.tool`（single，shadows-shipped-ui，仅工具详情） | ✗ 无可附加位，不能合用以显示知识库面板 |
| **右侧停靠浮层（shell.overlay）** | root 级 list，replaceRisk: none —— 注册一个**右停靠面板**（fixed right，全高，约 320-360px 宽），卡片墙 + 搜索 + 默认库，视觉即「应用右侧的知识库」 | ✓ 首推 |
| 会话头部 utilities（右上角小图标） | `conversation.session.header.utilities`，list，replaceRisk: none | ✓ 可作面板入口 |
| 侧栏底部 action | `sidebar.footer.action`，list，replaceRisk: none | ✓ 可作面板入口（最不干扰对话） |

**右停靠浮层是唯一既「真·在应用右侧」又不碰壳内 UI 的路径。**

## 3. 三套形态对比

| | A. 📎 相邻+右面板（推荐） | B. 会话右上角入口+右面板 | C. 仅右面板+侧栏底部入口 |
| --- | --- | --- | --- |
| 入口 | 图标级小按钮（16px，无文字，紧邻 📎 左侧） | 右上角「知识库」小图标（与详情/工具按钮并列） | 左栏底部「知识库」按钮 |
| 面板 | 右停靠浮层卡片墙 | 右停靠浮层卡片墙 | 右停靠浮层卡片墙 |
| 对话框内会不会单独出现 | 仅一个 16px 极简图标（不占行、无文字） | 完全不在对话框内 | 完全不在对话框内 |
| 交互闭环 | 点小图标 → 右面板弹出 → 点卡 → 指令写入输入框 | 同左 | 同左 |
| 契合度 | 📎 旁的「低噪入口」最接近用户意图 | 与「应用右侧」字面最贴合 | 最隐蔽 |
| 工作量 | 小（换组件位置 + 面板） | 小 | 小 |

## 4. 处理建议

- 📎 菜单事实如实说明：该菜单不可扩展（图片选择器本质）；若用户坚持「物理上在 📎 里」，只能改壳内 UI（违反稳定性红线，不做）。
- 推荐 **A 或 B**：右停靠浮层面板（卡片墙数据、点卡插入指令逻辑全部复用现有实现，仅把 input.left 大按钮换成 16px 图标入口 + 新增右停靠面板组件）。
- 面板内容：上部「全部笔记」+ 默认库状态；中部卡片墙（cover/名称/笔记数/搜索保存双按钮）；底部「打开得到大脑」链接。开/关：入口点击切换 + ESC。

## 5. 待决策问题

1. 入口放哪：A 输入行 📎 左侧 16px 纯图标（接近"附件目录"心智）/ B 会话右上角图标（字面"应用右侧"）/ C 左栏底部按钮（最不打扰）？
2. 右面板形态：A 右停靠浮层（推荐，360px 面板）/ B 其他诉求？
3. 是否保留「点卡插入指令」行为不变（推荐，模型显式拿库 id）？

## 6. 决策记录（2026-09-06）

| 决策 | 结论 |
| --- | --- |
| 📎 菜单 | 接受合规替代（不碰壳内 UI；📎 为图片选择器、无扩展位，源码级确认） |
| 入口位置 | **C：左栏底部按钮**（`sidebar.footer.action` 加「知识库」按钮，最不干扰对话） |
| 右面板 | **A：shell.overlay 右停靠浮层面板**（约 360px 全高：卡片墙 + 全部笔记 + 默认库状态 + ESC 关闭） |
| 行为保留 | 点卡 → 把「/得到大脑 在「库」知识库（id: xx）搜索/保存」写入输入框（setDraft，模型显式拿库 id）；宿主 /topics、/default-topic、defaultTopicId 逻辑不变 |

实现清单（待用户「开始」）：
1. 移除 client 中 `conversation.input.left`（KbButton）与 `conversation.input.overlay`（KbPicker）注入与相关 CSS。
2. 新增 `sidebar.footer.action`「知识库」按钮（带官方 logo 小图标）。
3. 新增 `shell.overlay` 右停靠面板组件（复用卡片墙逻辑，含全部笔记、默认库状态提示、ESC/关闭按钮、打开开放平台链接）。
4. 状态贯通：按钮开/关与面板用 kbStore；重启 + 刷新生效。

## 7. 实施前兼容性终检结论（2026-09-06）

| 检查项 | 结论 |
| --- | --- |
| `shell.overlay` 占用者 ownerProps | **空**——root 级浮层拿不到 inputActions/sessionId，右面板不能插这里 |
| `conversation.input.overlay` renderSlot props | owner props 为 `{}`（仅标准 props），输入写入不可依赖 |
| `conversation.input.dock` 标准 props | 明确含 **inputActions + sessionId**（契约级保证）→ 右面板实际宿主 = dock + CSS `position:fixed` 右停靠（视觉即右侧面板，DOM 生命随会话） |
| `sidebar.footer.action` | root 附加位，replaceRisk none；ownerProps 仅 `{wide}`（侧栏宽/窄轨适配）；按钮只需打开面板，无需会话上下文 |
| kbStore 跨 Slot 同步 | 已被上一版按钮↔浮层验证 |
| 插入兜底 | 面板内 pick() 双通道：inputActions.setDraft → `sessions.scope(sessionId).get('conversation').input.for(actx).setDraft`（海外 palette 同款回退） |

实施已完成（v0.1.2）：移除 input.left/overlay 旧入口 → sidebar.footer.action「知识库」按钮（wide 时带文字）+ input.dock 右停靠面板（fixed 360px、ESC 关闭、卡片墙/全部笔记/打开开放平台）。重启 + 刷新生效。
