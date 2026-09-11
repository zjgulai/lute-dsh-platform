# dsh-file-upload

**Codex 风格「附件」入口** —— DSH Desktop composer 左下角的📎按钮。

点击弹出三 Tab 附件面板，支持插入文件引用、调用技能、启动 LoopX 长周期目标。

## 功能一览

| Tab | 内容 | 插入行为 |
|---|---|---|
| **文件/文件夹** | 工作区目录树，点击目录下钻，支持搜索过滤，底部可上传新文件 | 插入 `@relativePath` 到草稿 |
| **技能** | `~/.dsh/skills/` 全部已安装技能（213+；搜索过滤） | 插入 `/技能名称` 到草稿 |
| **应用** | 预置：LoopX 长周期目标 / Web 搜索 / 代码审查 | LoopX 打开 Goal 子面板；其余插入模板草稿 |

## 结构

| 半 | 文件 | 职责 |
|---|---|---|
| host | `lib/index.js` | 四条 dsh-host-webserver 同源路由（见下表） |
| client | `lib/client.js` | 注册进 `conversation.input.left`：AttachButton + AttachPanel（三 Tab）；通过 `inputActions.setDraft` 插入草稿 |

## Host 路由

| 路由 | 方法 | 功能 |
|---|---|---|
| `/__dsh-file-upload` | POST | 上传文件 → `<cwd>/uploads/`（base64 body，去重，≤18MB） |
| `/__dsh-attach-list` | GET `?path=` | 列举工作区目录条目；path 经 `safeJoin` 防 traversal |
| `/__dsh-skills-list` | GET | 列举 `~/.dsh/skills/` 技能名（过滤点文件） |
| `/__dsh-loopx-start` | POST | 触发 `loopx start-goal --guided`（8s 超时，非阻塞，结果追加到草稿） |

## LoopX Goal Loop 集成

应用 Tab → 「LoopX 长周期目标」→ 填写目标 → 点「启动」→ Host 调用 `loopx start-goal` → 草稿插入 `/loopx + 目标摘要` → Send 后 GoalBar（`conversation.input.dock`，由 `dsh-loopx-plugin` 提供）自动出现。

## 安装

已通过 profile `dependencies` + `dsh.profile.bundles` 接入；`cordis.patch.yml` 由 desktop composition 层自动处理（只写包名一次）。

## 测试

```bash
node test/save.test.mjs   # host save 逻辑单测（8/8 通过：去重/净化/越界拒绝）
```

## 上限

- 单文件 ≤ 12MB（client 拦截）；HTTP body ≤ 18MB（host 拦截）
- 目录条目最多返回 200 条
- `/__dsh-loopx-start` 超时 8s（loopx CLI 首次安装约 30s，超时后前端显示警告但草稿仍插入 `/loopx` 前缀）

## 版本历史

### 0.2.0-local（2026-09-05）

- **修复**：jsx 第三参数 bug（图标传入 `key` 而非 `children`），回形针图标恢复可见
- **重写**：client 升级为 AttachButton + AttachPanel 三 Tab UI
- **新增**：Host 三条新路由（attach-list / skills-list / loopx-start）
- **集成**：Apps Tab 内置 LoopX Goal Loop 快捷入口（配合 `dsh-loopx-plugin`）

### 0.1.0-local（2026-08-30）

初始版本：单一「上传文件」按钮 + `/__dsh-file-upload` 路由。
