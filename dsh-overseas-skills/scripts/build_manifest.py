#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate manifest/skills.json from the Accio catalog (remote_skills_cache + OCR mapping).

Sources of truth:
  - remote_skills_cache.json  : 130 official catalog entries (English name + description)
  - CATEGORIES below          : Accio UI category keys/zh names (extracted from Accio.app bundle)
  - MAPPING below             : category -> [(english_name, zh_title)] from the 5 paginated screenshots
  - tool-backed detection     : local dir contains cli.py or scripts/ (Accio runtime tools, skipped per decision)
"""
import json, os, sys

ACC = os.path.expanduser("/Users/lute/.accio/accounts/1786471462/skills")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "manifest", "skills.json")

CATEGORIES = [
    ("sourcing", "货源与选品"),
    ("research-selection", "市场调研与分析"),
    ("design", "产品设计与视觉"),
    ("content-gtm", "内容创作与营销"),
    ("seo-ads", "流量获取与广告"),
    ("store-ops", "店铺运营与基建"),
    ("shipping-tariff", "物流与关税"),
    ("analytics-finance", "数据分析与财务"),
    ("crm-retention", "客户生命周期与留存"),
    ("productivity", "文档与办公效率"),
    ("agent-tools", "Agent 管理与基建"),
    ("other", "其他"),
]

MAPPING = {
    "sourcing": [
        ("1688-sourcing", "1688采购"),
        ("product-supplier-sourcing", "产品供应商寻源"),
        ("dropshipping-supplier-integrator", "代发货供应商集成"),
        ("supplier-performance-manager", "供应商绩效管理"),
        ("aliexpress-supplier-evaluator", "速卖通供应商评估器"),
        ("sales-negotiator", "销售谈判专家"),
    ],
    "research-selection": [
        ("product-attribute-analyzer", "产品属性分析器"),
        ("scenario-driven-product-scout", "场景驱动选品"),
        ("bestseller-pattern-decoder", "畅销模式解码器"),
        ("company-research", "公司调研"),
        ("competitor-deep-analysis", "竞品深度分析"),
        ("competitive-landscape", "竞争格局分析"),
        ("customer-voice-analyzer", "客户声音分析"),
        ("cross-border-selection", "跨境选品"),
        ("review-analyst-agent", "评论分析助手"),
        ("review-summarizer", "评论摘要生成器"),
        ("trend-stage-timing-analyzer", "趋势阶段时机分析器"),
        ("people-research", "人物背景调研"),
        ("social-network-mapper", "社交关系图谱分析"),
        ("market-insight-product-selection", "市场洞察与选品"),
        ("market-viability-logic-auditor", "市场可行性审查"),
        ("product-selection", "选品分析"),
        ("alibaba-amazon-market-intel", "亚马逊数据查询"),
        ("org-structure-research", "组织架构调研"),
        ("jungle-scout-deep-dive-analyzer", "Jungle Scout深度分析器"),
    ],
    "design": [
        ("video-prompt-guide", "视频生成指南"),
        ("image-prompt-guide", "图像生成指南"),
        ("ai-product-designer", "AI产品设计师"),
        ("higgsfield-guide", "Higgsfield AI 创作"),
    ],
    "content-gtm": [
        ("content-breakdown", "爆款内容拆解"),
        ("product-launch-planner", "产品发布规划器"),
        ("product-marketing-context", "产品营销背景"),
        ("product-marketing-brief", "产品营销简报"),
        ("ecommerce-marketing", "电商营销调度器"),
        ("vibe-marketing", "氛围营销"),
        ("content-strategy", "内容策略"),
        ("social-media-publisher", "社交媒体发布器"),
        ("social-media-content-creator", "社交媒体内容创作者"),
        ("influencer-campaign-manager", "网红营销管理"),
        ("copywriting", "文案撰写"),
        ("xiaohongshu-content-creator", "小红书内容创作助手"),
        ("launch-strategy", "新品上市策略"),
        ("marketing-ideas", "营销创意"),
        ("marketing-psychology", "营销心理学"),
        ("instagram-marketing", "Instagram营销"),
        ("remotion", "Remotion 最佳实践"),
    ],
    "seo-ads": [
        ("product-description-generator", "产品描述生成器"),
        ("programmatic-seo-strategist", "程序化SEO策略"),
        ("ecommerce-seo-optimizer", "电商SEO优化器"),
        ("serp-ranking-analyzer", "搜索结果排名分析"),
        ("amz-product-optimizer", "亚马逊产品优化"),
        ("amz-hot-keywords", "亚马逊热门关键词"),
        ("amazon-listing-expert", "亚马逊Listing专家"),
        ("amazon-ppc-campaign-manager", "亚马逊PPC广告管理"),
        ("ab-test-setup", "A/B测试设置"),
        ("etsy-seo-optimizer", "Etsy SEO优化器"),
        ("google-shopping-feed-optimizer", "Google 购物信息源优化器"),
        ("seo-keyword-research", "SEO关键词研究"),
        ("seo-competitor-analysis", "SEO竞争对手分析"),
        ("seo-page-audit", "SEO页面审核"),
        ("tiktok-ads-strategy", "TikTok广告策略"),
    ],
    "store-ops": [
        ("warehouse-fulfillment-workflow", "仓库发货工作流"),
        ("ecommerce-gdpr-compliance", "电商 GDPR 合规管理"),
        ("multi-currency-checkout", "多币种结账"),
        ("multi-location-order-router", "多仓库订单路由"),
        ("multichannel-inventory-sync", "多渠道库存同步"),
        ("invoice-generator", "发票生成器"),
        ("chargeback-dispute-manager", "拒付与争议管理"),
        ("social-commerce-sync", "社交电商渠道同步"),
        ("return-policy-designer", "退货政策设计师"),
        ("buy-now-pay-later-setup", "先买后付设置"),
        ("amazon-brand-protection", "亚马逊品牌保护"),
        ("amazon-fba-inventory-optimizer", "亚马逊FBA库存优化器"),
        ("optimize-ecommerce-page-conversion", "优化电商页面转化率"),
        ("payment-fraud-detector", "支付欺诈检测器"),
        ("returns-exchange-automator", "自动兑换处理"),
        ("etsy-pod-automation", "Etsy按需印刷自动化"),
        ("tiktok-shop-setup", "TikTok店铺设置"),
    ],
    "shipping-tariff": [
        ("tariff-search", "关税与HS编码查询"),
        ("international-shipping-customs", "国际货运与清关"),
        ("sales-tax-vat-automator", "销售税与增值税自动化工具"),
    ],
    "analytics-finance": [
        ("creating-financial-models", "创建财务模型"),
        ("ecommerce-financial-dashboard", "电商财务仪表盘"),
        ("ecommerce-sales-dashboard", "电商销售仪表板"),
        ("ecommerce-budget-forecaster", "电商预算预测器"),
        ("dynamic-pricing-engine", "动态定价引擎"),
        ("inventory-demand-forecaster", "库存需求预测器"),
        ("profit-margin-analyzer", "利润率分析器"),
        ("freemium-upgrade-optimizer", "免费转付费转化优化"),
        ("sycm-analysis-skill", "生意参谋分析"),
        ("marketing-roas-analyzer", "营销ROAS分析"),
        ("dcf-valuation", "DCF估值"),
    ],
    "crm-retention": [
        ("product-review-intelligence-collector", "产品评论智能采集"),
        ("email-automation-flow-builder", "电子邮件自动化流程构建器"),
        ("seasonal-campaign-automator", "季节性活动自动化"),
        ("checkout-flow-optimizer", "结账流程优化器"),
        ("helpdesk-order-integration", "客服与订单系统集成"),
        ("customer-retention-automator", "客户留存自动化器"),
        ("customer-ltv-calculator", "客户生命周期价值计算器"),
        ("customer-winback-automator", "客户赢回自动化"),
        ("customer-rfm-analyzer", "客户RFM分析器"),
        ("review-request-automator", "评审请求自动处理"),
        ("cart-abandonment-recovery", "FARE"),
        ("lifecycle-marketing-automator", "全生命周期营销自动化"),
        ("referral-program-builder", "推荐计划搭建"),
        ("coupon-discount-manager", "优惠券折扣管理器"),
        ("discount-promotion-engine", "折扣促销引擎"),
        ("loyalty-points-designer", "忠诚度积分设计"),
        ("b2b-payment-terms-optimizer", "B2B付款账期优化"),
    ],
    "productivity": [
        ("lark-tools", "飞书工具"),
        ("create-website", "快速建站"),
        ("internal-comms", "内部沟通"),
        ("doc-coauthoring", "文档协同编辑"),
        ("docx", "DOCX 文档处理"),
        ("gmail-assistant", "Gmail助手"),
        ("pdf", "PDF 文档处理"),
        ("pptx", "PPTX 演示文稿处理"),
        ("xlsx", "xlsx 表格处理"),
    ],
    "agent-tools": [
        ("skill-vetter", "技能安全审查"),
        ("skill-finder", "技能查找器"),
        ("skill-creator", "技能创建器"),
        ("self-improvement", "智能体自我学习"),
        ("accio-mcp-cli", "MCP命令行网关"),
    ],
    "other": [
        ("amazon-prelaunch-ad-budget", "amazon-prelaunch-ad-budget"),
        ("amazon-prelaunch-competitor-teardown", "amazon-prelaunch-competitor-teardown"),
        ("amazon-prelaunch-demand-check", "amazon-prelaunch-demand-check"),
        ("amazon-prelaunch-demand-mirror", "amazon-prelaunch-demand-mirror"),
        ("amazon-prelaunch-listing-builder", "amazon-prelaunch-listing-builder"),
        ("amazon-prelaunch-margin-check", "amazon-prelaunch-margin-check"),
        ("amazon-prelaunch-trend-scout", "amazon-prelaunch-trend-scout"),
    ],
}

def is_tool_backed(name):
    d = os.path.join(ACC, name)
    return os.path.exists(os.path.join(d, "cli.py")) or os.path.isdir(os.path.join(d, "scripts"))

def main():
    cache = json.load(open(os.path.join(ACC, "remote_skills_cache.json")))
    catalog = {s["name"]: s for s in cache["skills"]}
    local_dirs = set(n for n in os.listdir(ACC) if os.path.isdir(os.path.join(ACC, n)) and not n.startswith("."))

    manifest = {"categories": [], "skills": []}
    total = 0
    seen = set()
    problems = []
    for key, zh in CATEGORIES:
        items = MAPPING.get(key, [])
        group = {"key": key, "title": zh, "skills": []}
        for name, title in items:
            total += 1
            if name in seen:
                problems.append(f"duplicate mapping: {name}")
            seen.add(name)
            if name not in catalog:
                problems.append(f"not in remote catalog: {name}")
                continue
            if name not in local_dirs:
                problems.append(f"no local dir: {name}")
            tool = is_tool_backed(name)
            if not tool and not os.path.exists(os.path.join(ACC, name, "SKILL.md")):
                problems.append(f"no SKILL.md: {name}")
            entry = {
                "name": name,
                "title": title,
                "category": key,
                "categoryTitle": zh,
                "toolBacked": tool,
                "importable": not tool,
            }
            group["skills"].append(entry)
            manifest["skills"].append(entry)
        manifest["categories"].append(group)

    # cross-check: catalog entries not mapped
    unmapped = sorted(set(catalog.keys()) - seen)
    print(f"mapped: {total} | catalog total: {len(catalog)} | unmapped: {unmapped}")
    print(f"importable: {sum(1 for s in manifest['skills'] if s['importable'])}")
    for c in manifest["categories"]:
        print(f"  {c['title']}: {len(c['skills'])} (importable {sum(1 for s in c['skills'] if s['importable'])})")
    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(manifest, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nwrote {OUT}")

if __name__ == "__main__":
    main()
