#!/usr/bin/env node
/**
 * import-marketing-skills.mjs — 把 /Users/lute/project/skills 的营销技能导入出海技能体系。
 *
 * 决策记录（2026-09-03 用户拍板）：
 *  - 跳过 3 个重名：copywriting / marketing-psychology / content-strategy（保留现有海外版本）
 *  - 跳过 3 个二进制：brand-monitoring / ecommerce-marketing-strategy-builder / tiktok-influencer-marketing
 *  - 社媒 8 个（social + social-media×3 + social-media-marketing×4）合并为 2 个：
 *      social-content（社媒内容创作与发布）← social 内容部分 + creative-iteration-playbook
 *      social-operations（社媒运营与洞察）← 日历/路线图/社区/趋势/舆情 6 个
 *  - O1 默认：disable-model-invocation: true + user-invocable: true（设置页开关开启）
 *  - O2 边界：描述尾部追加「边界：…」中文声明
 *  - 分类：新增 brand（品牌战略与管理）/ pr（公关与传播）/ social-ops（社媒运营），
 *    其余归 analytics-finance / research-selection / content-gtm
 *  - overseas-allround 不纳入（110 不变）
 *
 * 产物：
 *  1) ~/.dsh/skills/<name>/SKILL.md（+ references/ 一并拷贝；evals/ 跳过）
 *  2) manifest/marketing-skills.json（单源真源，供 catalog 生成器合并）
 * 幂等：重跑覆盖。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SOURCE = "/Users/lute/project/skills";
const SKILLS_DIR = join(homedir(), ".dsh", "skills");
const MANIFEST_OUT = join(ROOT, "manifest", "marketing-skills.json");

// ---------- 元数据 ----------
const TITLES = {
  // analytics-finance
  analytics: "数据分析与追踪",
  attribution: "归因与转化分析",
  // research-selection
  "competitor-profiling": "竞品画像与研究",
  "battlecard-library": "竞品战卡库",
  "executive-briefing-kit": "竞品高管简报套件",
  "market-signal-tracker": "市场信号追踪",
  "win-loss-dataset": "赢单输单数据集",
  "insights-repository-kit": "洞察库治理",
  "market-scenario-modeler": "市场情景建模（TAM/SAM/SOM）",
  "participant-operations-hub": "调研参与者运营",
  "research-brief-blueprint": "调研简报蓝图",
  // content-gtm
  "co-marketing": "联合营销伙伴合作",
  "influencer-marketing": "网红营销全链路",
  "campaign-planning": "营销活动策划",
  "channel-integration": "跨渠道整合",
  "performance-tracking": "活动效果追踪",
  "case-studies": "客户案例创作",
  "editorial-ops": "编辑运营",
  "seo-writing": "SEO 内容写作",
  storytelling: "故事化叙事",
  "thought-leadership": "思想领导力内容",
  webinars: "网络研讨会",
  whitepapers: "白皮书",
  "co-marketing-governance": "联合营销治理",
  "joint-solution-blueprint": "联合方案蓝图",
  "partner-ecosystem-map": "伙伴生态地图",
  "partner-revenue-desk": "伙伴营收台",
  // brand
  "brand-governance-os": "品牌治理系统",
  "brand-measurement-dashboard": "品牌健康度量仪表盘",
  "brand-narrative-playbook": "品牌叙事手册",
  "brand-voice-glossary": "品牌语调语汇表",
  "experience-system-blueprint": "品牌体验系统蓝图",
  // pr
  "public-relations": "公关与媒体关系",
  "crisis-playbooks": "危机公关手册",
  "media-database": "媒体资料库",
  "messaging-frameworks": "公关信息框架",
  // social-ops（合并后）
  "social-content": "社媒内容创作与发布",
  "social-operations": "社媒运营与洞察",
};

const SUMMARIES = {
  analytics: "GA4/GTM 埋点、事件追踪与转化测量搭建和审计",
  attribution: "归因模型、MMM 与增量实验，厘清哪个渠道真在驱动营收",
  "competitor-profiling": "按竞品 URL 清单生成结构化竞品档案与市场格局",
  "battlecard-library": "竞品战卡模板体系：标签、分发与销售赋能",
  "executive-briefing-kit": "把竞品情报打包成高管级简报的框架",
  "market-signal-tracker": "市场与竞品信号的登记、评分与行动派发机制",
  "win-loss-dataset": "结构化沉淀赢单/输单定性与定量数据",
  "insights-repository-kit": "调研产物的治理、检索与复用工具模式",
  "market-scenario-modeler": "TAM/SAM/SOM 建模、敏感性分析与情景推演",
  "participant-operations-hub": "调研招募、排期、同意与激励的运营与护栏",
  "research-brief-blueprint": "市场调研项目立项的标准模板与检查清单",
  "co-marketing": "联名营销伙伴筛选、联合活动策划与交叉推广",
  "influencer-marketing": "网红/创作者合作的找、签、brief、合规与 ROI 衡量",
  "campaign-planning": "营销活动策略、brief、KPI 与工作计划制定",
  "channel-integration": "跨渠道同步信息、节奏与统一度量",
  "performance-tracking": "活动度量框架、仪表盘与优化循环",
  "case-studies": "证明 ROI 的客户成功故事创作",
  "editorial-ops": "多渠道编辑日历、审核与产能管理",
  "seo-writing": "面向搜索的内容规划与写作",
  storytelling: "把产品价值讲成有张力的故事",
  "thought-leadership": "高管 POV、前瞻文章与主题演讲内容",
  webinars: "网络研讨会的策划、制作与再利用",
  whitepapers: "研究型白皮书与技术深度内容生产",
  "co-marketing-governance": "联合营销项目、MDF 与合作伙伴合规治理",
  "joint-solution-blueprint": "共同构建的方案、集成与市场进入文档",
  "partner-ecosystem-map": "伙伴版图、覆盖与协同的可视化工具",
  "partner-revenue-desk": "伙伴营收的追踪、归因与加速运营模型",
  "brand-governance-os": "品牌审批、QA 与培训的治理操作系统",
  "brand-measurement-dashboard": "品牌健康 KPI 框架与报告系统",
  "brand-narrative-playbook": "保持各受众信息一致的品牌叙事模板",
  "brand-voice-glossary": "语调、措辞与惯用语体系，保证文风统一",
  "experience-system-blueprint": "把品牌平台翻译成多触点体验的文档模式",
  "public-relations": "媒体关系、记者拓展、新闻劫持与播客预热",
  "crisis-playbooks": "危机预批工作流、审批与响应手册",
  "media-database": "记者研究、分层与维护的资料库",
  "messaging-frameworks": "信息屋、关键声明与证明点体系",
  "social-content": "多平台社媒内容创作、改写与创意变体测试",
  "social-operations": "社媒日历、渠道路线图、社区互动、趋势与舆情洞察",
};

const BOUNDARIES = {
  analytics: "埋点/GTM/GA4 与事件追踪走本技能；归因模型与 MMM 走 attribution；投放 ROI 归因走 marketing-roas-analyzer",
  attribution: "归因模型/MMM/增量实验走本技能；事件埋点与 UTM 走 analytics",
  "competitor-profiling": "按 URL 清单生成结构化竞品档案走本技能；多层情报与评论挖掘走 competitor-deep-analysis；格局框架分析走 competitive-landscape",
  "battlecard-library": "战卡模板与分发体系走本技能；竞品深挖走 competitor-profiling/competitor-deep-analysis",
  "influencer-marketing": "网红合作的找、签、brief、合规与 ROI 全链路走本技能；活动级投放管理走 influencer-campaign-manager",
  "seo-writing": "搜索优化内容的规划与写作走本技能；关键词研究与主题簇走 seo-keyword-research；页面级 SEO 体检走 seo-page-audit",
  "co-marketing": "联名活动策划与伙伴筛选走本技能；联合营销治理与预算走 co-marketing-governance",
  "social-content": "多平台内容创作与创意变体走本技能；小红书种草内容走 xiaohongshu-content-creator；平台原生复用走 social-media-content-creator；日历/运营/舆情走 social-operations",
  "social-operations": "日历/路线图/社区/趋势/舆情走本技能；内容创作与创意迭代走 social-content；小红书种草走 xiaohongshu-content-creator",
  "public-relations": "媒体关系与记者拓展走本技能；危机应对走 crisis-playbooks；社媒互动走 social-operations",
  "crisis-playbooks": "危机预批工作流走本技能；日常媒体关系走 public-relations",
  "market-scenario-modeler": "TAM/SAM/SOM 建模走本技能；财务建模与 DCF 走 creating-financial-models",
  analytics: "埋点/GTM/GA4 与事件追踪走本技能；归因模型与 MMM 走 attribution；投放 ROI 归因走 marketing-roas-analyzer",
  "campaign-planning": "活动策略与 KPI 制定走本技能；新品上市分阶段策略走 launch-strategy",
  "thought-leadership": "高管 POV 与前瞻内容走本技能；常规博客与社媒内容走 content-marketing 各子技能",
  "media-database": "记者资料库走本技能；公司调研走 company-research；人物背景调研走 people-research",
};

const CATEGORY_MAP = {
  analytics: "analytics-finance",
  attribution: "analytics-finance",
  "competitor-profiling": "research-selection",
  "battlecard-library": "research-selection",
  "executive-briefing-kit": "research-selection",
  "market-signal-tracker": "research-selection",
  "win-loss-dataset": "research-selection",
  "insights-repository-kit": "research-selection",
  "market-scenario-modeler": "research-selection",
  "participant-operations-hub": "research-selection",
  "research-brief-blueprint": "research-selection",
  "co-marketing": "content-gtm",
  "influencer-marketing": "content-gtm",
  "campaign-planning": "content-gtm",
  "channel-integration": "content-gtm",
  "performance-tracking": "content-gtm",
  "case-studies": "content-gtm",
  "editorial-ops": "content-gtm",
  "seo-writing": "content-gtm",
  storytelling: "content-gtm",
  "thought-leadership": "content-gtm",
  webinars: "content-gtm",
  whitepapers: "content-gtm",
  "co-marketing-governance": "content-gtm",
  "joint-solution-blueprint": "content-gtm",
  "partner-ecosystem-map": "content-gtm",
  "partner-revenue-desk": "content-gtm",
  "brand-governance-os": "brand",
  "brand-measurement-dashboard": "brand",
  "brand-narrative-playbook": "brand",
  "brand-voice-glossary": "brand",
  "experience-system-blueprint": "brand",
  "public-relations": "pr",
  "crisis-playbooks": "pr",
  "media-database": "pr",
  "messaging-frameworks": "pr",
  "social-content": "social-ops",
  "social-operations": "social-ops",
};

const SKIP_NAMES = new Set([
  "copywriting", "marketing-psychology", "content-strategy", // 重名保留现有
  "brand-monitoring", "ecommerce-marketing-strategy-builder", "tiktok-influencer-marketing", // 二进制
]);

// ---------- 合并技能正文 ----------
const MERGED_SOCIAL_CONTENT = `---
name: social-content
title: "社媒内容创作与发布"
description: "When the user wants to create, repurpose, or optimize social media content across LinkedIn, X/Twitter, Instagram, TikTok, Facebook or other platforms, or wants to test creative variations (hooks, CTAs, formats) to fight creative fatigue. Also use for 'LinkedIn post,' 'Twitter thread,' 'carousel,' 'Reels,' 'Shorts,' 'video script,' 'video hook,' 'repurpose this content,' 'creative testing,' or 'what should I post.' 边界：多平台内容创作与创意变体走本技能；小红书种草内容走 xiaohongshu-content-creator；平台原生复用走 social-media-content-creator；日历/运营/舆情走 social-operations"
user-invocable: true
disable-model-invocation: true
---

# 社媒内容创作与发布

## 创作前置
1. 先读产品营销上下文（如工作区存在 product-marketing.md），只补充缺失信息。
2. 依次确认：目标（品牌认知/线索/流量/社区）、受众与活跃平台、品牌语气、发布频率与资源。

## 内容配方
- 每平台使用对应钩子公式：LinkedIn 以洞察开场+文档轮播；X 钩子 <50 字+线索串联；TikTok/Reels 前 2 秒钩子+字幕+原生文字+热门音频；Instagram 轮播叙事+Reels 触达。
- 改写复用：长文 → 帖子/线程/短视频脚本逐段拆解，保持核心主张不变。
- 短视频脚本：钩子 → 铺垫 → 转折 → CTA 四段式，逐镜列出画面/口播/字幕。

## 创意变体测试
1. 单页创意简报：钩子、CTA、证明点、剪辑准则、合规必填。
2. 测试矩阵：概念/格式/CTA/时长/钩子五维交叉，按渠道铺排变体。
3. 生产流程：收口 → 概念 → 脚本/文案 → 剪辑 → QA → 发布。
4. 度量：UTM/标签体系 + 表现记分板 + 洞察日志；跑量阈值与暂停护栏写进 Guardrail 表。
5. 沉淀：常青素材库 + 复用标签 + 迭代结论。

## 输出模板
- 平台化帖子成品（含钩子、正文、话题标签、配图说明）
- 单页创意简报 / 变体测试矩阵 / 常青素材库结构
`;

const MERGED_SOCIAL_OPERATIONS = `---
name: social-operations
title: "社媒运营与洞察"
description: "When the user wants to run the operational side of social media: content calendars and approval workflows, quarterly channel roadmaps and KPIs, community engagement programs (Slack/Discord/ambassadors), trend and culture listening, or sentiment dashboards and social listening readouts. Also use for 'content calendar,' 'social scheduling,' 'channel roadmap,' 'community engagement,' 'social listening,' 'trend research,' 'sentiment dashboard,' or 'brand mentions.' 边界：日历/路线图/社区/趋势/舆情走本技能；内容创作与创意迭代走 social-content；小红书种草走 xiaohongshu-content-creator"
user-invocable: true
disable-model-invocation: true
---

# 社媒运营与洞察

## 日历与发布工作流
1. 规划网格：日期/渠道/活动/钩子/CTA/创意需求/负责人。
2. 流程阶段：概念 → 文案 → 创意 → 合规 → 排期 → 发布 → 复盘。
3. 审批矩阵：干系人、SLA、替补审批人与升级条件。
4. 发布工具箱：UTM、标签、素材规格、无障碍清单（字幕/alt/对比度）。

## 渠道路线图（季度）
1. 渠道使命：每平台的角色、受众、KPI 与健康指标。
2. 目标栈：业务目标 → 触达/互动/需求指标。
3. 内容与实验支柱：主题、tentpole、常青项目与测试清单。
4. 预算与人力：投放、创作者、工具与运营支持。
5. 治理：审批流、合规要求与风险清单。

## 社区互动
- 仪式：定期 AMA、demo day、office hours、wins 帖。
- 展示：成员亮点、案例展、创作者 takeover。
- 挑战：主题模板 + 奖品 + 推荐激励。
- 反馈环：投票、问卷、beta 与路线图 Q&A。
- 响应框架：倾听 → 确认 → 公开回应或转 DM → 升级。

## 趋势与舆情
1. 平台信号（TikTok Creative Center / Reels Trends / X 趋势 / Reddit）、行业信号、受众信号、创作者生态四路监听。
2. 每日 15 分钟扫描，记录钩子/音频/模板与保质期。
3. 趋势评分：品牌契合、人群兴趣、风险等级。
4. 舆情看板：声量、情感占比、话题、达人层级、升级状态；风险/机会板 + 倡导者名单 + 行动登记。

## 模板
- 日历表（筛选+状态列）/ 审批流表单 / 发布清单
- 渠道单页 / 季度路线图热力图 / 预算资源表
- 舆情仪表盘 / 升级追踪 / 倡导者清单
`;

// ---------- 工具 ----------
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseSkillFile(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const fm = m[1];
  const nameLine = /^name:\s*(.+)\s*$/m.exec(fm);
  const descLine = /^description:\s*(.+)\s*$/m.exec(fm);
  const unquote = (v) => {
    let s = String(v).trim();
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
    return s;
  };
  return {
    name: unquote(nameLine ? nameLine[1] : ""),
    description: unquote(descLine ? descLine[1] : ""),
    body: m[2].trimStart(),
  };
}

/** 描述规范化：去 see 尾句 → 句子边界截断 ≤450 → 追加边界声明 */
function normalizeDescription(name, raw) {
  let desc = String(raw).replace(/\s+/g, " ").trim();
  desc = desc.replace(/For [^,.;]+,\s*see [a-z0-9-]+\.\s*/g, "");
  desc = desc.replace(/For [^,.;]+,\s*see [a-z0-9-]+\.\s*$/g, "");
  desc = desc.trim();
  if (desc.length > 360) {
    const cut = desc.slice(0, 360);
    const lastDot = cut.lastIndexOf(".");
    desc = lastDot > 160 ? cut.slice(0, lastDot + 1) : cut;
  }
  const boundary = BOUNDARIES[name];
  if (boundary) desc += ` 边界：${boundary}`;
  return desc;
}

function writeSkill(name, title, description, body, sourceDir) {
  if (!NAME_PATTERN.test(name)) throw new Error(`非法技能名: ${name}`);
  const dst = join(SKILLS_DIR, name);
  mkdirSync(dst, { recursive: true });
  const fm = [
    "---",
    `name: ${name}`,
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    "user-invocable: true",
    "disable-model-invocation: true",
    "---",
  ].join("\n");
  writeFileSync(join(dst, "SKILL.md"), fm + "\n" + body + "\n");
  // 拷贝 references/（正文相对引用依赖），跳过 evals/
  if (sourceDir) {
    const refs = join(sourceDir, "references");
    if (existsSync(refs)) {
      const dstRefs = join(dst, "references");
      mkdirSync(dstRefs, { recursive: true });
      for (const f of readdirSync(refs)) {
        const s = join(refs, f);
        if (statSync(s).isFile()) copyFileSync(s, join(dstRefs, f));
      }
    }
  }
  console.log(`+ ${name}（${title}）`);
}

function main() {
  const manifest = {
    categories: [
      { key: "brand", title: "品牌战略与管理" },
      { key: "pr", title: "公关与传播" },
      { key: "social-ops", title: "社媒运营" },
    ],
    skills: [],
  };
  const seen = new Set();

  const emit = (name, title, category, summaryZh, description, body, sourceDir) => {
    if (seen.has(name)) throw new Error(`重名: ${name}`);
    seen.add(name);
    writeSkill(name, title, description, body, sourceDir);
    manifest.skills.push({
      name, title, category, categoryTitle: "",
      toolBacked: false, importable: true,
      summaryZh, toolGap: "",
    });
  };

  // 直接导入：顶层 + 子技能
  const collect = [];
  for (const entry of readdirSync(SOURCE)) {
    const dir = join(SOURCE, entry);
    if (!statSync(dir).isDirectory()) continue;
    const top = join(dir, "SKILL.md");
    if (existsSync(top)) {
      collect.push({ sourceDir: dir, file: top, parent: entry });
      continue;
    }
    const sub = join(dir, "skills");
    if (existsSync(sub)) {
      for (const s of readdirSync(sub)) {
        const sp = join(sub, s, "SKILL.md");
        if (existsSync(sp)) collect.push({ sourceDir: join(sub, s), file: sp, parent: entry });
      }
    }
  }
  let imported = 0, skipped = 0;
  for (const c of collect) {
    let parsed;
    try {
      parsed = parseSkillFile(readFileSync(c.file, "utf8"));
    } catch {
      skipped += 1;
      console.log(`! 跳过（不可读）: ${c.parent}`);
      continue;
    }
    if (!parsed || !parsed.name) { skipped += 1; console.log(`! 跳过（无 frontmatter）: ${c.parent}`); continue; }
    if (SKIP_NAMES.has(parsed.name) || SKIP_NAMES.has(c.parent)) {
      skipped += 1;
      console.log(`! 跳过（决策排除）: ${parsed.name}`);
      continue;
    }
    if (["social", "social-media", "social-media-marketing"].includes(c.parent)) {
      skipped += 1;
      console.log(`! 跳过（并入合并技能）: ${parsed.name}`);
      continue;
    }
    const title = TITLES[parsed.name] ?? parsed.name;
    const category = CATEGORY_MAP[parsed.name];
    if (!category) { console.log(`! 跳过（无分类映射）: ${parsed.name}`); skipped += 1; continue; }
    emit(parsed.name, title, category, SUMMARIES[parsed.name] ?? "", normalizeDescription(parsed.name, parsed.description), parsed.body, c.sourceDir);
    imported += 1;
  }

  // 合并技能
  const cap460 = (s) => (s.length > 460 ? s.slice(0, s.lastIndexOf(".", 460) + 1) : s);
  emit("social-content", TITLES["social-content"], "social-ops", SUMMARIES["social-content"],
    cap460(parseSkillFile(MERGED_SOCIAL_CONTENT).description), parseSkillFile(MERGED_SOCIAL_CONTENT).body, null);
  emit("social-operations", TITLES["social-operations"], "social-ops", SUMMARIES["social-operations"],
    cap460(parseSkillFile(MERGED_SOCIAL_OPERATIONS).description), parseSkillFile(MERGED_SOCIAL_OPERATIONS).body, null);
  imported += 2;

  writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`完成：导入 ${imported} 个（跳过 ${skipped}）→ manifest/marketing-skills.json`);
}

main();
