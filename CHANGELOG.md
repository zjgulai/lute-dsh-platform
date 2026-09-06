# Changelog

本项目遵循语义化版本（单平台版本 + git tag），各插件 package.json 版本对齐。

## [v0.1.0] - 2026-09-06（基线发布）

首个基线版本：把 DSH 二次开发工作台整理为 monorepo 并首次发布。

### 出海技能体系
- 81-Skills 全量 81 技能接入（含 4 个加密技能明文补齐）；25 组 230 行卡片墙；LUTE 品牌图标；中文斜杠命令（6 处补丁）
- 技能卡片结构化引导：L1 人工 30 模板 + L2 自动解析 + L3 兜底（卡片墙 + 斜杠双入口）
- AI全栈技能 29 个（mattpocock 汉化稳定集）；AnySearch 接入；业务验收 Run 02 通过
- momcozy Product Schema（M9 真实数据采集 + 校验）

### 万物互联（dsh-wanzh-hulian）
- 设置页四板块（MCP/API/企业应用/知识库）；得到大脑连接 19 工具（含分类整理 12 个 + 真移动语义）
- 分类整理执行：第一阶段 132 条归档 + 第三阶段存量优化（0 失败）
- 知识库选择器（左栏入口 + 右停靠面板 v4；选库不选笔记契约）
- P2 OAuth/CLI 登录态通道；P3 MCP 板块基建（宿主直挂内置 dsh-mcp-client）
- P4 Shopify 连接（配置化 connections.json + 通用连接卡渲染器；安全审查通过，待凭证冒烟）

### 工程
- 指令审计 F1-F10；管线 8 阶段；preset 15 个 respectFileFlags
