import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * templates.js — 技能卡片的「结构化引导」模板引擎（三层）。
 * L1：人工精选模板（30 个高频技能，必填/可选输入槽）
 * L2：自动解析 SKILL.md 的「## 输入」列表（兜底）
 * L3：通用模板（目标/背景/约束）
 */

const SKILLS_DIR = join(homedir(), ".dsh", "skills");

/** L1：人工精选（key = 技能 name） */
const L1 = {
  "scenario-driven-product-scout": {
    lead: "从生活场景中发现产品机会", required: ["想探索的人群与身份迁移场景", "使用场景/时刻"],
    optional: ["已有供应链能力", "排除的品类"]
  },
  "product-selection": {
    lead: "做循证选品", required: ["目标品类或方向", "目标市场"],
    optional: ["预算/供应链约束", "已有数据"]
  },
  "cross-border-selection": {
    lead: "抽取并校验商品 SKU 数据", required: ["商品详情页链接或 ASIN 列表", "目标平台"],
    optional: ["采集字段清单", "输出格式（JSON/CSV）"]
  },
  "competitor-profiling": {
    lead: "分析竞品与竞争格局", required: ["竞品列表", "自身产品", "分析维度"],
    optional: ["情报来源链接", "目标市场"]
  },
  "market-viability-logic-auditor": {
    lead: "做产品方向的 Go/No-Go 进入裁决", required: ["产品方向/品类", "目标市场与渠道"],
    optional: ["预算与时间窗口", "已有调研数据"]
  },
  "launch-strategy": {
    lead: "制定产品上市策略", required: ["产品是什么", "目标市场", "发布时间窗口", "预算上限"],
    optional: ["当前增长瓶颈", "目标用户画像"]
  },
  "ecommerce-quarterly-strategy": {
    lead: "做季度经营复盘与战略规划", required: ["90 天订单数据", "年度目标"],
    optional: ["上季度/去年同期数据", "活动日历"]
  },
  copywriting: {
    lead: "撰写营销文案", required: ["文案类型（销售/品牌故事/Listing/落地页）", "产品与核心卖点"],
    optional: ["目标受众", "渠道/平台", "语气风格"]
  },
  "product-attribute-analyzer": {
    lead: "分析品类属性组合与机会", required: ["品类", "属性维度", "商品数据"],
    optional: ["目标市场", "价格带"]
  },
  "gtm-strategy-planning": {
    lead: "做新市场进入的 GTM 战略", required: ["产品信息", "目标市场", "竞品分析", "预算范围"],
    optional: ["ICP 画像", "已有渠道"]
  },
  "icp-profiler": {
    lead: "绘制理想客户画像", required: ["产品/服务信息", "现有客户数据"],
    optional: ["市场调研数据", "竞品客户分析"]
  },
  "customer-voice-analyzer": {
    lead: "整合多平台用户反馈做洞察", required: ["评论/反馈数据来源", "目标产品/品牌"],
    optional: ["平台清单（Amazon/Reddit/TikTok…）", "时间范围"]
  },
  "brand-mention-tracking": {
    lead: "追踪品牌舆情", required: ["品牌关键词", "时间范围"],
    optional: ["监听工具导出文件", "平台范围"]
  },
  "amazon-competitor-monitor": {
    lead: "监控亚马逊竞品", required: ["竞品 ASIN 列表", "监控维度（价格/评价/排名/促销）"],
    optional: ["监控频率", "历史数据"]
  },
  "platform-price-monitor": {
    lead: "监控商品价格", required: ["商品/ASIN 列表", "平台与站点"],
    optional: ["监控频率", "价格预警阈值"]
  },
  "ecommerce-monthly-review": {
    lead: "做月度电商复盘", required: ["30 天订单数据", "月度目标"],
    optional: ["上月对比数据", "活动日历"]
  },
  "viral-video-analyzer": {
    lead: "拆解爆款视频", required: ["视频链接或脚本", "目标平台"],
    optional: ["目标受众", "分析维度"]
  },
  "company-research": {
    lead: "调研一家公司", required: ["公司名称", "调研目的（尽调/合作/竞对）"],
    optional: ["关注维度", "已有资料"]
  },
  "single-post-intel-mining": {
    lead: "挖掘单条帖子的情报", required: ["帖子链接或截图", "挖掘目标"],
    optional: ["背景信息", "输出形式"]
  },
  "seo-page-audit": {
    lead: "做页面 SEO 技术审计", required: ["页面 URL 列表", "目标关键词"],
    optional: ["竞品页面", "目标市场"]
  },
  "seo-content-optimizer": {
    lead: "优化内容 SEO", required: ["内容主题或现有文案", "目标关键词"],
    optional: ["目标平台", "竞品内容"]
  },
  "email-automation-flow-builder": {
    lead: "设计邮件自动化序列", required: ["邮件目标（转化/唤醒/促销）", "目标受众"],
    optional: ["产品/优惠信息", "序列步数"]
  },
  "ad-creative": {
    lead: "产出广告创意", required: ["投放平台", "产品与卖点", "目标受众"],
    optional: ["预算", "参考素材"]
  },
  "brand-voice-glossary": {
    lead: "提取品牌声音", required: ["品牌内容样本", "品牌定位描述"],
    optional: ["目标受众", "竞品参考"]
  },
  "optimize-ecommerce-page-conversion": {
    lead: "优化落地页转化率", required: ["页面 URL", "当前转化数据"],
    optional: ["热力图/录屏数据", "竞品页面"]
  },
  "international-shipping-customs": {
    lead: "规划国际物流方案", required: ["目标市场", "商品品类与体积重量"],
    optional: ["现有物流方案", "时效要求"]
  },
  "supply-chain-controller": {
    lead: "梳理供应链环节", required: ["供应链环节（采购/生产/库存）", "当前痛点"],
    optional: ["供应商清单", "预算"]
  },
  "inventory-demand-forecaster": {
    lead: "做库存需求预测", required: ["历史销售数据", "预测周期"],
    optional: ["促销计划", "供应链交期"]
  },
  "ecommerce-promo-analysis": {
    lead: "复盘大促效果", required: ["大促数据（GMV/流量/转化）", "活动方案"],
    optional: ["去年同期数据", "预算"]
  },
  "outreach-automation": {
    lead: "做外联自动化", required: ["目标列表（KOL/企业/媒体）", "合作提案要点"],
    optional: ["邮件模板", "个性化变量"]
  }
};

/** L2：解析 SKILL.md「## 输入」列表 */
function parseInputs(text) {
  const m = /^#{2,3}\s*输入\s*\r?\n([\s\S]*?)(?=^#{2,3}\s|\z)/m.exec(text);
  if (!m) return [];
  const out = [];
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*[-*]\s+\*{0,2}(.+?)\*{0,2}(?:\s*[:：].*)?$/.exec(line);
    if (item) {
      const v = item[1].trim();
      if (v && v.length <= 30) out.push(v);
    }
    if (out.length >= 6) break;
  }
  return out;
}

function render(title, lead, required, optional) {
  const lines = ["/" + title, `请帮我${lead}：`, "【必填】"];
  for (const r of required.slice(0, 6)) lines.push("· " + r + "：");
  if (optional.length > 0) {
    lines.push("【可选】");
    for (const o of optional.slice(0, 4)) lines.push("· " + o + "：");
  }
  let text = lines.join("\n");
  if (text.length > 500) text = text.slice(0, 497) + "…";
  return text;
}

/** L3：通用兜底 */
function generic(title) {
  return render(title, "解决这个问题", ["目标（想达成什么）", "背景与现状", "已有材料/约束"], ["期望输出格式"]);
}

const cache = new Map();

/** 取技能模板（L1 → L2 → L3；缓存按文件 mtime 失效） */
export function getPromptTemplate(name, title) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return "";
  const l1 = L1[name];
  if (l1) {
    const c = cache.get(name);
    if (c && c.kind === "l1") return c.text;
    const text = render(title || name, l1.lead, l1.required, l1.optional);
    cache.set(name, { kind: "l1", text });
    return text;
  }
  const file = join(SKILLS_DIR, name, "SKILL.md");
  if (!existsSync(file)) {
    const text = generic(title || name);
    cache.set(name, { kind: "l3", text });
    return text;
  }
  let mtime = 0;
  try { mtime = statSync(file).mtimeMs; } catch { /* ignore */ }
  const c = cache.get(name);
  if (c && c.mtime === mtime) return c.text;
  let text = "";
  try {
    const inputs = parseInputs(readFileSync(file, "utf8"));
    if (inputs.length > 0) text = render(title || name, "完成这项任务", inputs, []);
  } catch { /* ignore */ }
  if (!text) text = generic(title || name);
  cache.set(name, { mtime, text });
  return text;
}
