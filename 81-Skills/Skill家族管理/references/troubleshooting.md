# 常见问题排查指南

本指南列出 Skill家族管理 常见问题的排查步骤。

## 1. 配置文件缺失或格式错误

**现象**：运行 `skills-mgr` 时报 `config.json not found` 或 JSON 解析错误。

**排查**：
1. 检查 `~/.skills-mgr/config.json` 是否存在
2. 使用 `python -m json.tool config.json` 校验 JSON 格式
3. 若缺失，运行 `skills-mgr init` 重新初始化

## 2. Skill 名称不存在

**现象**：`skills-mgr add [项目] [Skill名称]` 报 Skill 不存在。

**排查**：
1. 确认 Skill 已安装在当前工作区的 `.agents/skills/` 或 `~/.agents/skills/`
2. 检查名称大小写是否一致
3. 先安装 Skill 再执行 add

## 3. 项目切换后上下文未隔离

**现象**：切换项目后，无关 Skill 仍被触发。

**排查**：
1. 确认切换成功（`skills-mgr current` 查看当前项目）
2. 检查该项目配置的 `skills` 列表是否正确
3. 检查 `global_excludes` 是否遗漏需要禁用的 Skill
4. 重启会话使 Skill 编排生效

## 4. 脚本网络错误

**现象**：`run.py` 报 `Network error` 或 `HTTP 401/429`。

**排查**：
1. 检查 `OPENAI_API_KEY` 是否已设置
2. 检查网络是否能访问 `api.openai.com`
3. HTTP 429 表示触发限流，稍后重试
