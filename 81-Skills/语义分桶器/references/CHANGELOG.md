# 变更日志

## v1.1.0（2026-09-03）

- 补全 frontmatter：license（MIT）、last_updated
- description 首句改为触发条件句式（「当用户需要…时使用」）
- 新增「安全边界」章节（提示注入/敏感信息/危险操作/越权读取四类拒绝）
- 新增「错误处理」章节（空列表/缺失字段/阈值越界/格式错误/超大桶 5 场景）
- 新增「竞争壁垒与相邻 Skill 路由」章节（与知识相似度分析器/语义密度分析器/语义文档分块器/锚点文本分割器的差异化）
- 新增「维护版本」章节（版本/停用条件/变更日志引用）
- references 新增 dfm-rules.md、CHANGELOG.md；examples 新增 workflow-example.md
- scripts 去 skills._shared 依赖，自包含；run.py/core.py chmod +x；移除 vendor/安装脚本/使用前必读

## v1.0.0（初始版本）

- 基于标签重叠度的 SKU 分桶，Union-Find 处理传递关系，大桶递归细分
- 默认配置：threshold 0.5，max_bucket_size 32，refine_large True
- 特征字段：applicable_objects、domain_tags、logic_type
