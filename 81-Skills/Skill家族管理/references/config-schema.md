# 项目配置 JSON Schema

Skill家族管理 的项目配置文件（默认 `~/.skills-mgr/config.json`）结构定义。

## 顶层结构

```json
{
  "projects": { ... },
  "global_excludes": [ ... ],
  "active_project": "string (optional)"
}
```

## projects

按项目名称分组的 Skill 集合。键为项目名，值为对象：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `skills` | string[] | 是 | 该项目启用的 Skill 名称列表 |
| `description` | string | 否 | 项目用途说明 |

## global_excludes

全局排除的 Skill 名称列表，任何项目切换时这些 Skill 均不加载。

## active_project

当前激活的项目名。缺省时表示未切换项目，加载全部 Skill。

## 示例

```json
{
  "projects": {
    "amazon-listing": {
      "skills": ["claude-seo", "marketingskills", "nexu"],
      "description": "亚马逊Listing优化项目"
    },
    "data-analysis": {
      "skills": ["claude-ecom", "ecommerce-price-monitor"],
      "description": "电商数据分析项目"
    }
  },
  "global_excludes": ["unused-skill-1", "unused-skill-2"],
  "active_project": "amazon-listing"
}
```
