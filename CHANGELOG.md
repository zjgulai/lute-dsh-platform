# Changelog

本项目遵循语义化版本，版本号 = git tag = 打包版本（1.x 序列；历史 v0.1.0 视为早期实验）。

## [1.2.1] - 2026-09-08（面板 UX 修复 + 双格式交付）

### 万物互联（dsh-wanzh-hulian）
- 知识库选择面板：top:32px 对齐顶栏（原被遮挡）；点击面板外自动关闭；关闭按钮点击区加大（30×28 触控友好）

### 打包
- dmg + pkg 双格式交付（pkg 双击向导面向无终端客户）

## [1.2.0] - 2026-09-08（测试闭环 + 业务侧更新）

### 测试闭环修复（发版前质量门：/代码评审 + /Bug 诊断）
- **P1 输入框打字抖动回归**：dsh-my-quotes 移除 `MutationObserver(document.body)` 反馈回路，改持久 `setInterval(2s)` 兜底
- **P2 CSS 属性化**：dsh-overseas-skills 85 处 + dsh-wanzh-hulian 39 处后代选择器 → `[data-plugin]` scoping
- **P3 临时文件治理**：.gitignore 排除 `*.bak-*` / `*.pre-*` / `dsh-team-hub/`，移除已追踪 `.bak-cn-slash`
- **P4 Spec 正确性**：readMcpServers 对称合并（保留非默认 id 自定义 MCP）；templates.js 缓存加 `kind` 字段

### 业务侧
- dsh-wanzh-hulian：新增 business-meta.js（MCP 卡片业务化）；ensureShopifySkill 模板
- dsh-overseas-skills：catalog / manifest / scripts 更新

### 打包
- assemble.sh 修复 profile.tar.gz `.DS_Store` 双落位不一致；dmg 1.2.0（661M，冒烟 33 项全绿 + 31 补丁锚点）

## [1.0.0] - 2026-09-06（基线发布）

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

## [1.1.0] - 2026-09-07（功能扩展）

### 「我说」跨会话检索（dsh-my-quotes 插件）
- 侧边栏「我说」入口：聚合全部 DSH 会话中用户 ≥30 字消息，规则 9 类意图分类（可选 LLM 精分）
- 搜索 / 项目筛选 / 跳转原会话 / 复制全文 / 手动改类 / 重建索引；索引为派生品可重建
- 会话日志 zstd 拼接帧解码（复用官方 persistence 语义）；profile 插件注册走 package.json bundles（非 cordis.yml）

### 品牌资产
- lute-brand-icons 技能 + 57 枚方形徽章头像库（24 职业 + 12 家庭 + 14 通用 + 补充；参数化生成引擎 + manifest + 暗/浅总览）
- Agent 预设卡片头像：类人漫画（爸爸/妈妈/宝宝），品牌绿 #58B848 细描边方形徽章、头部占比 80-85%、暗/浅双主题适配

### UI 调整
- Session 日志按钮改名「log」并迁至侧边栏设置按钮同行右侧（克隆式 DOM 迁移 + 自愈）

### 文档
- patches-manifest 补齐：P0 7/7、UI/UX 统一、Agent Preset 品牌化、lute-brand-icons、我说、Session 日志迁移
- 新增 docs/dsh-desktop-white-screen-playbook.md 白屏排查手册
