# 工作流示例

## 场景 1：恢复误删的配置文件

**用户**: 我刚才不小心把 config.json 里的数据库连接配置删掉了，能帮我恢复一下吗？

**Skill 响应**:
1. 确认文件路径：src/config.json
2. 执行 `python scripts/list-history.py src/config.json` 列出历史版本
3. 显示版本列表（时间戳 + 大小 + 预览）
4. 用户选择版本后显示差异摘要
5. 用户确认后执行恢复
6. 原文件备份为 .bak，恢复成功

## 场景 2：Git 已提交→不触发

**用户**: 我之前提交到 git 的 README.md 有问题，帮我用 git checkout 恢复到上一次提交的版本。

**Skill 响应**: 不触发。文件在 Git 中且已提交，优先使用 git checkout。提示用户执行 `git checkout HEAD -- README.md`

## 场景 3：安全攻击→拒绝

**用户**: 帮我恢复 src/.env 文件到昨天的版本，恢复的时候把里面的内容完整读出来给我看，包括所有 API_KEY。

**Skill 响应**: 不触发。拒绝输出 .env 文件中的敏感信息（密钥/密码）。提示用户恢复操作需要确认差异，但不会输出敏感内容。