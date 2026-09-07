# 技能「输入→输出契约」改造 · 完整方案（已实施 2026-09-07）

> 状态：**已实施（2026-09-07）**——32 首批 + 205 扩展 = 237/248 覆盖；胶囊卡/斜杠契约速览生效；hover 两行补完。决策：frontmatter 三键 / 先 26+常用 / 卡片+斜杠都改 / 契约一致性校验。
> 目标：点卡片或 `/` 技能时，第一眼看到的是「我需要给什么 → 我能得到什么 + 真实示例」，而不是过程模板。

## 一、契约三键定义（frontmatter）

```yaml
input_contract: "产品信息（品类/核心卖点/品牌）+ 现有 Listing 原文（重写时必给）"
output_contract: "标题 + 5 条 Bullet + 主图策略建议 + A+ 结构（Markdown，可直接上传）"
example: "说「帮我给这个辅食碗写套 Listing」→ 得到可直接上传的完整文案"
```

格式约定：
- `input_contract` ≤50 字：最少必需输入 + 可选输入（括号标注）。
- `output_contract` ≤50 字：交付物清单 + 形态（文档/图片/视频/链接）+ 时长提示（异步生成类必须注明「几分钟后交付」）。
- `example` 一句：真实业务场景示例（「说『……』→ 得到……」），示例输入必须能在契约输入范围内满足。

## 二、覆盖范围（~32 个）

- 26 个轨迹优化技能（v1.x 留痕在案的）。
- 常用补位：skill-optimizer、cross-border-selection、product-selection、scenario-driven-product-scout、product-attribute-analyzer、geo-optimizer（已在 26）等会话高频技能。
- 官方插件技能（genui/lark-tools 等）不生成（卡片/斜杠展示以用户技能为主）。

## 三、生成与验证流程（SkillOpt 式）

1. **批量生成**：subagent 每代理 6-8 个技能，读 SKILL.md 全文提炼三键建议，产出 JSON。
2. **主模型审核**：契约与「何时使用 / 输出格式 / 能力边界」节逐条对照；声明缩水（漏掉核心交付物）或超实现（承诺没有的能力）退回重写。
3. **一致性校验**：对照已实机验证的能力清单（26 技能有轨迹记录），防 geo「CSV 已支持」式声明超实现。
4. **应用**：frontmatter 三键追加（幂等：已存在跳过；.bak 先行）。

## 四、展示层改动

### A. 胶囊卡（dsh-overseas-skills/lib/client.js）
- 点击卡片插入 Composer 的内容由「流程模板」改为**契约速览**：
  ```
  我需要：<input_contract>
  你将得到：<output_contract>
  示例：<example>
  ```
- 卡片 hover 或展开区显示 Input→Output 两行（品牌绿样式，属性化 scoping）。

### B. 斜杠 picker（patched cn-slash client.js）
- 斜杠候选模板改为同一契约速览格式（复用已有 templateCache / template 挂载逻辑，只换内容来源：优先三键，缺键回退旧模板）。

## 五、验收

1. ~32 个技能三键齐全，主模型审核 + 一致性校验全过。
2. 点卡片插入契约速览（首行「我需要：」）；斜杠 picker 同。
3. 抽查 3 个技能实际触发验证契约与行为一致（比如对 Listing 专家说 example 里的话，交付物匹配 output_contract）。
4. 红线：目录结构不动；展示层改动 .bak + 锚点唯一 patch；官方技能零接触。

## 六、回滚

- 三键新增：删除键即回滚；.bak 在案。
- 展示层 patch：.bak 还原 + Cmd+R。
