# 锚点文本分割器 - 变更日志

## v1.1.0 (2026-09-03)

### 新增
- description 首句改为触发句式「当用户需要基于锚点标记精确分割文本时使用」
- 触发词新增：锚点定位分割、标记点切分、模糊匹配分割
- 何时不用扩充：排除语义文档分块器/语义分桶器/语义密度分析器/知识相似度分析器/网页采集方案设计
- 安全边界章节：四类拒绝规则（提示注入/敏感信息泄露/危险操作/路径越界）
- 独立错误处理章节：8场景展开（含用户提示）
- 竞争壁垒矩阵：5个相邻skill职责边界
- 维护版本章节：版本策略/停用条件/Gotcha记录/维护闭环
- license: MIT + last_updated 字段
- LICENSE 文件
- references/dfm-rules.md
- references/CHANGELOG.md（本文件）
- examples/workflow-example.md

### 修复
- 移除 vendor/ 目录
- 移除 使用前必读.txt
- 移除 安装中文调用名.command
- scripts/core.py 内联 Levenshtein 距离实现，移除 skills._shared 依赖
- scripts/run.py chmod +x

### 评测
- root-skills-eval v3.17.3 双轨评测
- 源版 v1.0.0：轨道A=80.8，轨道B F1=0.941，轨道C=74.4(C级)<85
- 修复版 v1.1.0：轨道C=87.0(B级)，B卷门禁F1=1.000通过