#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为 manifest 追加简明中文简介（summaryZh，业务易懂），并重建 lib/catalog.js。"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "manifest", "skills.json")
CATALOG = os.path.join(ROOT, "lib", "catalog.js")

# name -> 简明中文简介（简单、业务易懂）
SUMMARIES = {
    "product-supplier-sourcing": "在阿里等 B2B 平台搜索产品、比价并发现供应商与工厂",
    "dropshipping-supplier-integrator": "多供应商代发订单自动路由、库存同步与利润跟踪",
    "supplier-performance-manager": "用加权评分卡按季度跟踪供应商绩效与交期",
    "aliexpress-supplier-evaluator": "用 5 项可信信号评估海外供应商的可靠性",
    "sales-negotiator": "为 B2B 谈判做准备：锚定、让步、BATNA 与合同条款",
    "product-attribute-analyzer": "用 3 维标签分析热销品属性与销量加权市场份额",
    "scenario-driven-product-scout": "按「三大购物场景」+20 种差异化策略产出选品创意",
    "bestseller-pattern-decoder": "解码畅销品的定价、主图、标题与 A+ 内容套路",
    "company-research": "调研公司背景、财务、竞品、新闻与关键人物",
    "competitor-deep-analysis": "多层情报与评论挖掘，找出市场空白与战略优势",
    "competitive-landscape": "用波特五力等框架绘制市场竞品格局",
    "customer-voice-analyzer": "从评论提取人物画像、场景、痛点与购买动机",
    "cross-border-selection": "抓取亚马逊等平台数据辅助跨境选品分析",
    "review-analyst-agent": "大规模分析产品评论，找出共性问题与改进优先级",
    "trend-stage-timing-analyzer": "判断产品处于增长早期、峰值还是饱和期",
    "people-research": "调研个人的职业背景、履历、专业领域与公开信息",
    "social-network-mapper": "基于社交平台互动构建关系图谱与社群聚类",
    "market-insight-product-selection": "多信号+客户声音验证需求与竞争，输出选品短名单",
    "product-selection": "行业→消费者→选品→供应商匹配的循证选品流程",
    "org-structure-research": "调研公司组织架构、汇报关系与员工画像",
    "video-prompt-guide": "视频生成统一路由：产品场景、单/多分镜与重新生成",
    "image-prompt-guide": "AI 生图/修图提示词与工具路由，覆盖电商套图等场景",
    "ai-product-designer": "生成服装、配饰、家居类目的产品设计图（需设计图需求）",
    "higgsfield-guide": "用 Higgsfield 平台文生图、图生视频及进度管理",
    "product-launch-planner": "策划预发布等待名单、分级优先与多渠道发布",
    "product-marketing-context": "沉淀产品定位、卖点与营销背景文档，避免重复交代",
    "product-marketing-brief": "把产品规格与客户洞察合成为营销简报",
    "vibe-marketing": "用「氛围式」方式快速生成、测试并迭代营销内容",
    "content-strategy": "规划受众分析、内容支柱、渠道与选题的内容策略",
    "social-media-content-creator": "为 LinkedIn/X/IG/TikTok 创作平台原生内容与复用",
    "influencer-campaign-manager": "端到端管理网红合作与多渠道 ROI 衡量",
    "copywriting": "用 AIDA 模型撰写首页、落地页与定价页等营销文案",
    "xiaohongshu-content-creator": "面向 CES 算法的小红书种草内容创作",
    "launch-strategy": "分阶段发布策略：Product Hunt、公告、GTM 与持续造势",
    "marketing-ideas": "140+ 已验证的营销打法，按品类提供增长创意",
    "marketing-psychology": "用 70+ 心理模型（稀缺、锚定、互惠）驱动转化",
    "programmatic-seo-strategist": "用模板页+自有数据规模化获取长尾搜索流量",
    "ecommerce-seo-optimizer": "元标签、结构化数据与抓取管理优化产品页搜索排名",
    "serp-ranking-analyzer": "深度分析 SERP 排名因素与意图信号",
    "amazon-listing-expert": "用「4+2」要点、「X+1」图片与 A+ 结构打造高转化 Listing",
    "amazon-ppc-campaign-manager": "规划并优化 SP/SB/SD 广告，诊断 ACoS 与预算",
    "ab-test-setup": "为着陆页、邮件与广告素材设计并实施 A/B 实验",
    "etsy-seo-optimizer": "用 eRank 数据优化 Etsy 关键词、标题与标签",
    "google-shopping-feed-optimizer": "搭建并优化 Google Merchant Center 商品信息源",
    "seo-keyword-research": "挖掘高价值关键词、意图分类与主题簇",
    "seo-competitor-analysis": "分析竞品的关键词、外链与内容策略",
    "seo-page-audit": "单页 SEO 体检，0-100 评分与优先级建议",
    "tiktok-ads-strategy": "创意优先的 TikTok 广告测试、Spark Ads 与竞价优化",
    "warehouse-fulfillment-workflow": "拣货、打包、打单等仓库作业流程标准化",
    "ecommerce-gdpr-compliance": "Cookie 同意、SAR 请求与删除权等合规落地",
    "multi-currency-checkout": "本地货币定价、自动汇率与本地化取整",
    "multi-location-order-router": "多仓路由、拆单与缺货队列的订单引擎",
    "multichannel-inventory-sync": "Shopify/Amazon/eBay 等渠道库存与订单统一",
    "invoice-generator": "生成税务合规的品牌 PDF 发票与顺序编号",
    "chargeback-dispute-manager": "用欺诈评分与证据自动化预防并处理拒付",
    "social-commerce-sync": "同步 Meta/TikTok/Pinterest 商品目录与库存",
    "return-policy-designer": "按类目设计退货窗口、补货费与政策规则",
    "buy-now-pay-later-setup": "接入 Klarna/Afterpay/Affirm 分期支付提升客单价",
    "amazon-brand-protection": "用品牌注册与 IP 工具打击跟卖与假货",
    "amazon-fba-inventory-optimizer": "管理 IPI 分数、补货限额与仓储费",
    "optimize-ecommerce-page-conversion": "按转化基准优化 Shopify 页面（首页/集合/PDP）",
    "payment-fraud-detector": "风险评分、3DS 与人工审核的多层防欺诈",
    "returns-exchange-automator": "自助退换门户、动态路由与自动退款",
    "etsy-pod-automation": "Printify 全流程：设计、建 Listing、发布与推广",
    "tiktok-shop-setup": "TikTok Shop 开店：目录同步、订单与达人计划",
    "tariff-search": "用 TurtleClassify 查 HS 编码与进口关税",
    "international-shipping-customs": "跨境物流：HS 分类、DDP/DDU 与清关文件",
    "sales-tax-vat-automator": "全球销售税/VAT/GST 计算与申报自动化",
    "creating-financial-models": "DCF、敏感性、蒙特卡洛等财务建模套件",
    "ecommerce-financial-dashboard": "集成损益表、资产负债表与现金流仪表盘",
    "ecommerce-sales-dashboard": "跟踪营收、AOV、转化率与渠道表现",
    "ecommerce-budget-forecaster": "滚动 12 个月营收/营销/库存预算",
    "dynamic-pricing-engine": "按需求、竞品价与库存自动调价",
    "inventory-demand-forecaster": "安全库存与补货点计算，防断货",
    "profit-margin-analyzer": "按产品/渠道/细分核算毛利与净利",
    "freemium-upgrade-optimizer": "优化付费墙时机、文案与定价结构",
    "sycm-analysis-skill": "用浏览器会话读取淘宝生意参谋周报数据",
    "marketing-roas-analyzer": "全渠道投放与 ROAS 归因、预算再分配",
    "dcf-valuation": "现金流折现估值，输出内在价值与目标价",
    "product-review-intelligence-collector": "自动采集多平台评论并做多维分析",
    "email-automation-flow-builder": "搭建欢迎/购后/弃购/召回邮件流程",
    "seasonal-campaign-automator": "BFCM、大促等旺季营销编排自动化",
    "checkout-flow-optimizer": "地址自动补全、快捷支付与字段精简",
    "helpdesk-order-integration": "工单系统对接订单数据与 VIP 路由",
    "customer-retention-automator": "行为触发+分层激励的防流失活动",
    "customer-ltv-calculator": "计算历史与预测 LTV，驱动留存与召回",
    "customer-winback-automator": "多阶段召回流失客户并分层折扣",
    "customer-rfm-analyzer": "RFM 分群与队列留存网格驱动复购",
    "review-request-automator": "三步式购后评价请求与激励设计",
    "cart-abandonment-recovery": "邮件+短信序列赢回弃购用户",
    "lifecycle-marketing-automator": "按 7 个生命周期阶段做个性化触达",
    "referral-program-builder": "推荐链接、分级激励与防作弊",
    "coupon-discount-manager": "折扣码批量生成、限额与有效期管理",
    "discount-promotion-engine": "数量折扣、买一送一与购物车级促销",
    "loyalty-points-designer": "积分+VIP 分层提升留存与 LTV",
    "b2b-payment-terms-optimizer": "净账期、信用额度与自动开票",
    "lark-tools": "操作飞书多维表格、文档、日历、任务与邮件",
    "create-website": "从需求直接生成完整 HTML 网站/落地页",
    "internal-comms": "用结构化模板写内部通报、周报与 FAQ",
    "doc-coauthoring": "结构化流程共写文档、提案与技术规格",
    "gmail-assistant": "撰写、整理与管理 Gmail 邮件并验证送达",
    "skill-vetter": "安装前对技能做权限与可疑模式安全审查",
    "accio-mcp-cli": "用 CLI 发现并调用 Twitter/Gmail/Notion 等 MCP 工具",
    "amazon-prelaunch-ad-budget": "上线前亚马逊广告预算测算与 ACoS 场景",
    "amazon-prelaunch-competitor-teardown": "拆解竞品 ASIN：营收、价格史与关键词",
    "amazon-prelaunch-demand-check": "验证亚马逊真实需求与首批订货量",
    "amazon-prelaunch-demand-mirror": "把任意产品映射到亚马逊需求信号",
    "amazon-prelaunch-listing-builder": "用搜索量数据构建关键词优化的 Listing",
    "amazon-prelaunch-margin-check": "测算产品经济性并给出 GO/NO-GO 结论",
    "amazon-prelaunch-trend-scout": "发现快速上升的亚马逊利基与黑马品牌",
}

def main():
    m = json.load(open(MANIFEST, encoding="utf-8"))
    missing = []
    for s in m["skills"]:
        if s["importable"]:
            if s["name"] in SUMMARIES:
                s["summaryZh"] = SUMMARIES[s["name"]]
            else:
                missing.append(s["name"])
    if missing:
        print("缺少简介的技能:", missing)
        raise SystemExit(1)
    json.dump(m, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"manifest 已写入 summaryZh（{len(SUMMARIES)} 条）")
    # 重建 catalog.js（含 summaryZh）
    cats = [{"key": c["key"], "title": c["title"]} for c in m["categories"]]
    skills = [{"name": s["name"], "title": s["title"], "category": s["category"],
               "categoryTitle": s["categoryTitle"], "toolBacked": s["toolBacked"],
               "summaryZh": s.get("summaryZh", "")} for s in m["skills"]]
    out = "// Generated from manifest/skills.json — do not edit by hand.\n"
    out += "export const CATEGORIES = " + json.dumps(cats, ensure_ascii=False) + ";\n"
    out += "export const SKILLS = " + json.dumps(skills, ensure_ascii=False) + ";\n"
    open(CATALOG, "w", encoding="utf-8").write(out)
    print("lib/catalog.js 已重建（含 summaryZh）")

if __name__ == "__main__":
    main()
