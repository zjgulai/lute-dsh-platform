# 知识萃取专家 - 变更记录

## v1.1.0 (2026-09-03)

### 新增
- frontmatter 补 `license: MIT` 和 `last_updated: "2026-09-03"`
- 创建 LICENSE 文件
- body 新增「安全边界」章节：四类拒绝规则（提示注入/敏感信息泄露/危险操作/路径越权）
- body 新增「错误处理」章节：5 类场景（缺书名/缺材料/材料过短/虚构类/超出能力）
- body 新增「竞争壁垒」章节：与知识相似度分析器、语义密度分析器、语义分桶器、语义文档分块器、锚点文本分割器的差异化
- body 新增「维护与版本」章节
- references 新增 `dfm-rules.md`（三阶段执行规则与常见错误对照）
- references 新增 `CHANGELOG.md`（本文件）
- examples 新增 `workflow-example.md`（完整三阶段工作流示例）

### 修复
- description 首句改为触发条件句式：「当用户需要深度消化一本书、将书中知识转化为可执行的行为系统时使用」
- description 何时不用扩展：补充「小说/诗歌等虚构类作品」「与知识管理类 skill 任务重叠时的路由规则」
- 移除「插件安装」段落（vendor/安装脚本/使用前必读已移除）
- run.py 已 chmod +x

### 移除
- vendor/ 目录（含 dsh-chinese-skill-patch 补丁包）
- 安装中文调用名.command
- 使用前必读.txt

## v1.0.0 (2026-04-12)

### 初始版本
- 三阶段知识萃取工作流：结构真相还原 → 思维模型迁移 → 行为转化设计
- 双引擎设计：分析引擎（研究员）与行为引擎（教练）
- 触发词：知识萃取专家、深度阅读一本书、萃取书中知识等
- references/workflow-guide.md 和 action-table-template.md
- examples/example-output-sample.md（《思考，快与慢》示例）