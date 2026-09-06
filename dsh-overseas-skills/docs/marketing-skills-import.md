# 营销技能批量导入（/Users/lute/project/skills）· 执行留痕

> 决策（2026-09-03 用户拍板）：跳过 3 重名（copywriting/marketing-psychology/content-strategy，保留现有）；
> 跳过 3 二进制（brand-monitoring/ecommerce-marketing-strategy-builder/tiktok-influencer-marketing，待文本版）；
> 社媒 8 个合并为 social-content + social-operations；O1 默认 model-off；新增 3 类（品牌/公关/社媒运营）；
> overseas-allround 不纳入。

## 产物
- `scripts/import-marketing-skills.mjs`（幂等）：扫描源目录 → 规范化 → `~/.dsh/skills/`（+references/ 拷贝，evals 跳过）
  → `manifest/marketing-skills.json`（单源真源）。
- 导入 **38 个**（36 直录 + 2 合并）；跳过 14 个。
- 新分类 3 个：brand（品牌战略与管理 5）/ pr（公关与传播 4）/ social-ops（社媒运营 2）。
- 归入现有类：analytics-finance 2 / research-selection 9 / content-gtm 16。
- catalog.js：**22 组 / 177 条**（海外 130 + 营销 38 + preset 9）。
- 描述全部 ≤500 字符；悬空 see 引用清理；O2 互斥边界 15 条（analytics↔attribution、social-content↔social-operations、
  influencer-marketing↔influencer-campaign-manager、seo-writing↔seo-keyword-research 等）。

## 路由基准
- 132 条（原 82 + 新 50：38 正向 + 12 边界对）。
- LLM 档：132/132 = 100% 严格命中。
- 词法档：Top-1 79.5% / Top-3 85.6%（营销索引已并入）。

## 排障记录（2026-09-03）
- 回归根因：profile `cordis.patch.yml` 里 9-02 的「技能税」根级 dsh-skill-subset 白名单（25 技能 + hideOthers）
  遮蔽了全部非白名单技能（含本次 38 个营销技能），且与 preset 级隔离职责重叠。
- 用户决策：移除根级 subset 行回 preset 级隔离；`@dhicoc/dsh-reverse-skill` 全局禁用维持（88 安全技能所有会话不可见）。
- 备份：`~/.dsh/profiles/desktop/cordis.patch.yml.bak-*`。

## 验收清单
- [ ] 重启后：设置页出现 3 个新分类（品牌战略与管理 / 公关与传播 / 社媒运营）+ 38 条新技能（默认关，开关可开）
- [ ] 卡片墙：普通会话出现新分组；海外 5 + 其他 7 preset 不受影响（探针回归）
- [ ] `/` 菜单：38 个新技能 user-invocable 可见
- [ ] 回归：海外 5 preset 子集不变（11/24/23/34/110）

## 回滚
- 删除 38 个 `~/.dsh/skills/<name>/` → 删除 marketing-skills.json → 重跑 build_preset_catalog.py 还原 catalog。
