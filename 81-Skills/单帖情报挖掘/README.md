# Single Post Intelligence Mining

单帖情报挖掘 - 将单个帖子及其评论串转化为结构化、可行动的业务洞察。

## 快速开始

### 适用场景

- Reddit 帖子分析
- Amazon Review 页面
- 独立站商品评论页
- 社媒评论串
- 社区问答帖

### 核心能力

1. **帖子类型识别** - complaint / consultation / comparison / recommendation / troubleshooting / post-purchase review
2. **证据分层** - 主张层、证据层、传播层、修正层
3. **结构化存储** - 设计数据库表结构和数据字典
4. **反直觉洞察** - 挖掘深层商业机制
5. **业务动作** - 输出给产品、客服、市场、VOC、内容/用户教育团队的建议

### 使用方法

1. 提供单个帖子链接
2. 等待完成11步标准分析流程
3. 获取完整分析报告

### 示例

**输入**：
```
Reddit 帖子链接：https://reddit.com/r/.../dont-buy-momcozy-m5
```

**输出**：
- 页面概况与采集范围
- 帖子类型：complaint post + troubleshooting post
- 证据分层结果
- 结构化存储方案（posts/comments/topic_tags/brand_mentions表）
- 数据字典
- 存储结果示例
- 核心发现（3+条）
- 反直觉洞察（3+条）
- 业务动作建议（产品/客服/市场/VOC/内容与用户教育团队）

### 辅助文件

| 文件 | 用途 |
|------|------|
| `references/decision-rules.md` | 决策规则参考 |
| `references/failure-modes.md` | 故障模式识别 |
| `references/output-template.md` | 输出格式模板 |
| `references/reference.md` | 参考资料 |
| `examples/examples.md` | 4个完整示例 |

### 版本

v2.1.2 - 增加 no-network CLI contract tests 与本地输入/输出边界验证

## 评估状态

- 当前评分：**88/100** ✅
- 目标评分：85/100
- 状态：**ready_for_publish**

### 已完成的优化项

- [x] 添加 manifest.yaml
- [x] 更新 frontmatter (version/complexity/compatibility)
- [x] 添加相关Skills链接
- [x] 创建 README.md
- [x] 创建标准目录结构 (references/, examples/, scripts/, tests/)
- [x] 整理辅助文件到正确位置
