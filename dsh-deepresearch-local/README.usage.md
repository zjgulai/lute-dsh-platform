# dsh-deepresearch · 本地安装说明（0.2.2 原版）

> 本文件是本机安装说明。上游：https://github.com/havingautism/dsh-deepresearch（@deepseek-ai/dsh-deepresearch 0.2.2）。上游 README.md / README.en.md 保留不动。

## 一、这是什么

证据优先的深度研究工作区：持久项目状态（SQLite `deepresearch` 域）、私有规划/调查 Agent（Scout/Evaluator/Writer 编排）、`deepResearch` Remote 命名空间、左侧栏底部「深度研究」入口 + Web 工作台。普通聊天不继承研究工具，不开启通用 fetch。

## 二、使用方法

- 入口：左侧栏底部「深度研究」按钮 → 研究资料库 → 「发起研究」→ 填写研究问题 → 「创建研究计划」
- 规划 Agent 生成可审查计划 → 「待确认」状态可编辑 → 「确认并开始」派出 Scout/Evaluator 并行调查 → 写作包撰写最终报告
- 项目管理：资料库支持搜索/筛选/排序/恢复/中止/删除
- 数据位置：`~/.dsh/storages/dsh.sqlite`（domain `deepresearch`）

## 三、相关说明

- **本机兼容性**：插件基线 rc.6，本机 0.1.2-alpha.1。静态面全部通过（client require 集为基线模块；host 8 个注入服务全存在；storage-sqlite/web-fetch-http 来自 npm rc.2；cheerio/zod/schemastery 来自 npm；node:sqlite 由 Electron 43 提供）。**L4 全链路实测通过**：UI 创建项目 → 规划 Agent 生成计划 → `awaiting_plan_confirm` → 计划渲染 → 删除成功
- **安装方式**：`file:/Users/lute/project/Magpie-Horch/dsh-deepresearch-local` 依赖 + profile bundles 列表（bundle patch 自带 config：runnerEnabled、项目/问题/证据上限）
- **安全**：网页抓取有 SSRF 类风险（README 明示）；本机宿主已有 fetch provider，插件跳过自挂，风险面降低
- **回滚**：移除 bundles 条目与依赖 → profile pnpm install → 重启 Desktop
- **更新**：上游发布新版时重新下载 tarball 覆盖本目录 → profile pnpm install → 重启

## 四、迭代优化方向

1. **上游版本追踪**：上游若发布 0.1.2-alpha.1 适配版，替换本地副本（当前为 0.2.2 原版，未改动源码）
2. **完整调查链路长测**：本次烟雾测试止于「待确认」阶段；「确认并开始」后的 Scout/Evaluator 并行调查与写作包全流程未实测（成本更高，可择期用 quick 深度跑完整链路）
3. **重启续跑**：已知限制——运行中的私有 Agent 随宿主进程停止，重启后不自动续跑（上游文档明示，非本机问题）
4. **证据编辑**：证据只追加不编辑，错误论点需重建项目（上游设计）
