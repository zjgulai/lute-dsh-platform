# dsh-agent-team-gui · 本地安装说明（1.0.1）

> 本文件是本机安装说明。上游：https://github.com/toolclub/dsh-agent-team-gui（MIT，160★）。上游 README.md / README-zh.md 保留不动。

## 一、这是什么

持久化多模型工作流团队：动态 Lead 规划、有界 DAG 工作流、每成员独立模型/工具配置、Run Center（运行中心）与 Token 洞察、食谱（recipes）复用。普通会话通过输入区小队模式开关接入。

## 二、使用方法

- **团队管理**：设置 → Teams（agent-teams 区块）→ 创建小队、配置成员模型/工具、执行模式（serial/parallel）、上下文模式（spawn/fork/chain）
- **小队模式**：输入区右侧小队控件（conversation.input.right）切换当前会话的小队模式；输入区上方运行 dock（conversation.input.dock）显示运行状态
- **运行中心**：conversation.view 中的 Run Center 视图（运行历史、Token 用量、食谱）
- **数据**：SQLite（storageDomain `agent_team_gui` 域，与随手记等共用 dsh.sqlite）

## 三、相关说明

- **本机兼容性**：插件构建基线 0.1.1-rc.2（离本机 0.1.2-alpha.1 仅一步）；peer 区间 `>=0.1.0-rc.5 <0.2.0` 接受 alpha.1；host 7 个注入服务本机全存在；client 值导入仅 react（**零**旧模块 specifier）；4 个 slot 全部存在。**静态评估通过（低风险）**
- **本机构建**：上游不提交 lib/，`prepare` 需安装期构建；本机改为「本地预构建 + file: 依赖」：`pnpm install && pnpm build`（需 npm 网络，devDeps 全部为公开 rc.2 包）后 file: 链接，profile 的 allowBuilds 无需改动
- **测试**：118/119 通过；唯一失败是上游质量脚本自身的 shell 转义测试（本机 Node 26 环境差异，与插件功能无关）
- **安装方式**：`file:/Users/lute/project/Magpie-Horch/dsh-agent-team-gui-local` + bundles 列表（bundle patch 自带 config：defaultProvider spawn / serial / spawn 模式默认值）
- **回滚**：移除 bundles 条目与依赖 → profile pnpm install → 重启 Desktop
- **更新**：上游发布新版 → 覆盖本目录（或重新下载 tarball）→ 重跑 `pnpm install && pnpm build` → profile pnpm install → 重启

## 四、迭代优化方向

1. **上游版本追踪**：上游活跃（160★、5 open issues）；若发布 0.1.2-alpha.1 适配版，直接替换本地副本（本机未改任何源码，替换成本为零）
2. **完整小队运行实测**：重启后计划实测「创建小队 → 派发任务 → 观察 Run Center」全链路（消耗模型 token，已获用户授权）；serial 与 parallel 两种执行模式可分别验证
3. **Token 洞察长测**：官方用量计量（official-usage-meter）依赖 provider 上报，需在真实模型调用中观察数据准确性
4. **食谱（recipes）验证**：examples/full-stack-delivery.recipe.json 可作为导入测试素材
5. **上游质量套件**：上游自带 browser-smoke 脚本（scripts/quality/browser-smoke.mjs），可在 CI 或本机 Playwright 环境复跑
