# LUTE Agentic System · 架构与基座契约

## 1. DSH 基座事实（2.0.4 壳 + 0.1.2-alpha.1 技能层）

- Skill 契约：`name` 必须英文 kebab（加载与运行时双重校验）；目录一层扫描；`.system` 跳过。
- 插件：`dsh.bundle` + profile `file:` 硬链接安装；bundles 列表注册。
- 设置页：`settings.section` Slot（id/order/label/locale）。
- 输入区：`conversation.input.*` / `sidebar.footer.action` / `shell.overlay`（ownerProps 以实测为准——历史教训：root 级 slot 无 inputActions）。
- 工具：`ctx.tools.register(defineTool(...))`；工具名 DeepSeek 契约（≤64 字符、[A-Za-z0-9_-]）；MCP 宿主直挂 `dsh-mcp-client`（ctx.plugin）。
- 凭证：credentials 服务（resolve/set/describe），页面不回显；文件类配置 0600。
- 生效语义：宿主变更=重启；客户端变更=刷新；技能文件=watcher 热载。

## 2. 红线（改动前必读）

1. 只用内置 alpha SDK（@deepseek-ai/*），不引入 npm 发布线（防双实例）。
2. 不碰壳内 UI 的 shadows-shipped-ui slot（替换风险）。
3. 凭证永不落仓库/日志/模型上下文；子进程环境经凭证擦洗。
4. 编辑工具会打破 file: 硬链接 inode——改后必须 cat 同步 profile。
5. 补丁（patch-cn-slash 等）锚点为精确原文，restore 会回滚全部补丁。

## 3. 模块地图

见 README.md「平台组成」。详细文档：
- 出海：`dsh-overseas-skills/docs/`（delivery-report-81、maintenance-sop、skill-prompt-templates-analysis…）
- 万物互联：`dsh-wanzh-hulian/docs/README.md`（产品形态总览 + 交付历史 + 方案）
