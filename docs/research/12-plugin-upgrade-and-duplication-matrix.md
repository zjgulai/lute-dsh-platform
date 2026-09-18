# 插件升级候选与重复能力矩阵（基座 2.0.10 迁移决策输入）

> 日期：2026-09-17 · 状态：**调研定稿（只读）**
> 数据源：`~/.dsh/profiles/desktop/package.json`（40 bundles 实读）、`npm view`（latest/peer，registry 元数据）、上游 release notes（11 号文档）
> 纪律声明：**semver 序号与 registry 存在不等于实测稳定**；所有「升级候选」在 D 轨道 5 项矩阵（安装/RPC/slot/读写/旧数据）跑绿之前一律是候选态。

## 1. 生态插件（npm 来源，当前 profile 14 个）

| 包 | 现钉 | latest | peer 关键约束（registry 实读） | 上限闸门 | 处置建议 |
|---|---|---|---|---|---|
| dsh-pocket | 2.10.3 | 2.10.6 | cordis ^4.0.1 | 现基座可升 | 升级候选（低风险批次） |
| @xmanrui/dsh-im | 4.18.0 | 4.21.2 | 无 peer | 现基座可升 | 升级候选（低风险批次） |
| @liustack/modlens | 3.26.1 | 3.26.1 | — | 已最新 | 不动 |
| @liustack/modsearch | 5.10.2 | 5.10.3 | — | 现基座可升 | 升级候选（低风险批次） |
| @linxin666/dsh-client-ui-git-graph | 0.3.19 | 0.3.23 | react ^18.2.0 | 现基座可升 | 升级候选（低风险批次） |
| @dhicoc/dsh-reverse-skill | 1.0.5 | 1.0.5 | — | 已最新 | 不动 |
| @tt-a1i/archify-dsh | 0.1.0 | 1.0.0 版本号字段=0.1.0 | — | 已最新 | 不动 |
| dshmarket | 1.45.1 | 1.47.0 | dsh-settings ^0.1.0-rc.7‖^0.1.1-rc.2‖^0.1.2-alpha.2（旧式范围） | 需实测 | 暂缓：peer 范围不含 0.1.5 系，随基座 D 轨道验证后定 |
| dsh-context | 0.47.0 | 0.53.1 | dsh-session/s dsh-settings **>=0.1.2-rc.1**、cordis ^4.0.2 | 边缘满足（现基座=下界） | 暂缓，随基座一起升（0.53.x 跨度大） |
| @linxin666/dsh-client-ui-skill-explorer | 0.3.6 | 0.3.23 | react ^18.2.0 | 现基座可升 | **先做去重对比再定**（与 skill-center-local 重复，见 §3） |
| dsh-better-sidebar | 0.18.1 | 0.19.1 | dsh-llm/skill/tools/agent **^0.1.5-rc.1** | **锁死在新基座** | 基座升级后与原生 Sidebar 对比，**大概率弃插件保原生**（§3） |
| @changfenhuang/dsh-genui | 0.9.9 | 0.11.0 | dsh-llm/skill/tools 0.1.2-rc.1‖0.1.5-alpha.1 | 双界兼容 | 基座升级后在 0.1.5-rc.2 上实测（声明范围未含 rc.2，需验） |
| @zseven-w/dsh-noema | 0.1.0-rc.3 | 0.1.0-rc.4 | dsh-tools ^0.1.5-rc.1、schemastery ^3.18.2 | **锁死在新基座** | 随基座升 rc.4（D 轨道验证） |
| @aiwayds/dsh-dcp | **0.11.0** | 0.11.0 | dsh-llm/agent/brand/skill/session **>=0.1.5-rc.2** | **当前已违规** | ⚠️ 见 §4-Hazard-1 |
| dsh-univer-office | ^0.2.14 | 0.3.0 | dsh-attachment/host-webserver/llm **^0.1.5-rc.1‖^0.1.6-alpha.1** | 锁死在新基座 | 随基座升 0.3.0；与原生预览做能力对比（§3） |

## 2. 本地 file: 包（16 个）与仓库内包（26 个）

- profile 里 16 个 `file:./vendor/packages/...` 由 `sync-profile.mjs` 从仓库 26 包中镜像；peer 声明抽查（dsh-browser-local 等）为 `>=0.1.1-rc.1 <0.2.0-0` 形态——**0.1.5-rc.2 在该范围内（解析层不翻车）**。
- 但解析层满足 ≠ 行为兼容：0.1.2→0.1.5 的 API 面（子代理持续对话、系统提示词动态化、client UI 拆分、`agent/session-start` 等事件面是 0.1.6 才动）对 LUTE 插件的影响**全部是 Unknown**，逐包过 5 项矩阵后才能放行——这是 D 轨道矩阵的主体工作量。
- 快改面预判：`dsh-settings-shell-local`（上游设置页 2.0.7 起大改：数据目录管理/恢复入口/更新安装可见性修复）、`dsh-root-brand`/`dsh-theme-local`/`dsh-ui-polish`（client 样式锚 2.0.9 隔离 chrome 架构后变动）、`dsh-newapp-local` 新应用抽屉（设置页结构变动）。

## 3. 重复能力对比（「遇到重复，留好的稳的」的判定材料）

| 重复对 | 上游原生（0.1.5-rc.2 起） | LUTE/三方现役 | 初步判定（最终以 D 轨道并排实测为准） |
|---|---|---|---|
| 文件上传 | `dsh-client-file-upload`（任意类型、进度/取消/断续） | `dsh-file-upload-local`（本地包） | **倾向弃本地包**：上游是核心团队维护、与 Sidebar 预览打通；除非本地包有 LUTE 特有行为（需 diff 功能清单） |
| 侧栏多标签预览 | `dsh-client-ui-sidebar`（多标签/分栏/全屏/md/pdf/img） | `dsh-better-sidebar` 0.18.1 | **倾向弃插件**：插件 0.19.1 需新基座且是薄壳；若 LUTE 依赖其特有行为（未验证）再保留 |
| Office 预览 | 原生预览不含 office 格式 | `dsh-univer-office` | **保留插件**（专精 office，原生未覆盖），升 0.3.0 随基座 |
| 技能浏览 | 官方技能列表（市场发现页） | `skill-explorer 0.3.6` vs `dsh-skill-center-local` | **三选一或二**：本地 skill-center 有 LUTE 全栈技能线集成（overseas-skills 契约），倾向保本地 + 升级/弃 skill-explorer；skill-explorer 0.3.23 跨版本未验 |
| 会话归档/恢复 | 设置内归档列表 + 恢复 | `dsh-rename-conversations` | **并存**（重命名≠归档恢复，能力互补） |
| 远程控制 | Agents-Anywhere（手机连接，2.0.7+） | 无 LUTE 对应 | **安全评估项**：新增网络攻击面，见 §4-Hazard-3 |
| modlens vs modsearch | 同作者相邻能力（透镜 vs 搜索） | 两者皆 LUTE 生态工具 | 非重复，保持 |
| 上下文压缩 | compaction 改进（图片计入等） | `dsh-auto-compact-local` | 并存，行为验证 |

## 4. 已存在的隐患（与升级无关，升级前就要面对）

- **Hazard-1（Fact）**：`@aiwayds/dsh-dcp` 现装 **0.11.0**，其 peer 要 `>=0.1.5-rc.2`，当前基座 0.1.2-rc.1 **不满足**——`autoInstallPeers:false` 让它装上了，运行期靠旧 API 碰运气。回退点：**dcp 0.10.0**（peer `>=0.1.2-rc.1`，实读确认）。两个选择：a) 立即在现基座降回 0.10.0（小改、低风险）；b) 接受现状、随基座升级一并解决（若基座确定 09-27 前后切换）。**倾向 b，但若基座推迟则必须做 a**。
- **Hazard-2（Fact）**：`dshmarket` peer 旧式范围 + 上游 app 内还捆绑 `dshmarket@1.38.1`（v2.0.10 package.json 实读）——profile 市场与 app 内市场双真源，升级后需确认加载面归属。
- **Hazard-3（安全，Fact+评估）**：Agents-Anywhere 远程控制桥随基座进入 LUTE 出货面。LUTE 的 P0-6v2（外链白名单+权限门）与 P0-6v2 的本地窗口策略（原 P0-6，2.0.4 时代 local-window-policy.ts 回移）需要对新桥做**显式 deny/allow 决策**，并写进出货默认值——不是「能用就行」的新功能，是新增外联面。默认建议：LUTE 出货预置关闭。
- **Hazard-4（Fact）**：`settings.yaml` 遗留 `agent-presets: default: code` 在 0.1.5 系上触发 #997（无法建会话）。LUTE 客户机全部要过一遍 preset 引用核对（见 13 号文档 T-05）。

## 5. 升级批次划分（供 13 号文档引用）

- **批次 A（现基座即可，低风险）**：pocket 2.10.6、im 4.21.2、modsearch 5.10.3、git-graph 0.3.23 —— 前提仍是 D 轨道快验 + `.bak` 回滚纪律。
- **批次 B（锁死新基座，随 2.0.10 一起）**：better-sidebar 0.19.1（或弃用）、noema rc.4、univer-office 0.3.0、dcp 0.11.0（解决 Hazard-1）、genui 0.11.0、context 0.53.1、dshmarket 1.47.0（视 peer 实测）。
- **批次 C（去重决策项，D 轨道并排对比后二留一）**：file-upload-local vs 原生；better-sidebar vs 原生；skill-explorer vs skill-center-local。
- **批次 D（不动）**：modlens、reverse-skill、archify-dsh 及已最新项。

> 未验证（Unknown 集合）：所有 latest 版本号的实测稳定性；genui 0.11.0 在 rc.2 运行时上的真实兼容（其 peer 只写到 0.1.5-alpha.1）；skill-explorer 0.3.6→0.3.23 的行为变化；去掉 file-upload-local/better-sidebar 后 LUTE 工作台的完整回归。这些全部由 13 号文档的 D 轨道任务承接，不在本文档臆断。
