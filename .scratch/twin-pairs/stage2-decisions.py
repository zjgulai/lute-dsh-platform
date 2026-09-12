#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""阶段 2 推广决策表：667 邻接对配额制 —— 每 L3 留 2 张（1 原生底盘 + 1 论文方法卡），
例外：多平台面（平台运营/业务工具实现）、阶段 1 区分保留对、合并 keep 卡。"""
import json

# L3 -> keep slugs（按条目 1..125 逐一判定）
KEEP = {
  # 1 资源情景比较
  "资源情景比较": ["market-scenario-modeler", "p2s-sc-whatif-scenario-analysis-engine"],
  # 2 VOC编码
  "VOC编码": ["customer-voice-analyzer", "p2s-causal-sentiment-attribution"],
  # 3 竞品研究
  "竞品研究": ["competitor-deep-analysis", "p2s-competitor-new-product-detection"],
  # 4 市场机会评估
  "市场机会评估": ["market-insight-product-selection", "p2s-product-category-opportunity-scoring"],
  # 5 平台运营 —— 例外：三平台独立运营面
  "平台运营": ["etsy-pod-automation", "tiktok-shop-setup", "shopify-store-ops", "p2s-cross-platform-transfer-rec"],
  # 6 促销规划
  "促销规划": ["discount-promotion-engine", "p2s-causal-uplift-modeling"],
  # 7 传播规划
  "传播规划": ["public-relations", "p2s-share-of-voice-tracking"],
  # 8 生命周期触达
  "生命周期触达": ["lifecycle-marketing-automator", "p2s-causal-churn-retention-attribution"],
  # 9 业务工具实现 —— 例外：三工具独立面
  "业务工具实现": ["build-deepseek-harness-plugin", "apify-mcp", "accio-mcp-cli", "p2s-agent-production-engineering"],
  # 10 月度经营复盘
  "月度经营复盘": ["ecommerce-monthly-review", "p2s-agentic-pnl-analyst"],
  # 11 依赖协调（纯 p2s）
  "依赖协调": ["p2s-dynamic-dag-orchestration", "p2s-autogen-multi-agent-conversation"],
  # 12 GMV归因分析
  "GMV归因分析": ["attribution", "p2s-automated-causal-discovery"],
  # 13 经营预测
  "经营预测": ["ecommerce-budget-forecaster", "p2s-budget-reforecast-rolling"],
  # 14 情景模拟
  "情景模拟": ["market-scenario-modeler", "p2s-counterfactual-sc-scenario-sim"],
  # 15 抽样审计（纯 p2s）
  "抽样审计": ["p2s-compliance-ml-risk-scoring", "p2s-tag-fairness-bias-audit"],
  # 16 证据复核（纯 p2s）
  "证据复核": ["p2s-explainable-review-adjudication", "p2s-decision-audit-trail-ontology"],
  # 17 需求分群
  "需求分群": ["customer-rfm-analyzer", "p2s-latent-class-demand-segmentation"],
  # 18 趋势监测
  "趋势监测": ["trend-stage-timing-analyzer", "p2s-category-trend-forecasting"],
  # 19 组合取舍
  "组合取舍": ["product-attribute-analyzer", "p2s-contextual-bandits-rec"],
  # 20 产品需求定义
  "产品需求定义": ["ai-product-designer", "p2s-conjoint-analysis-product-design"],
  # 21 供应商评估
  "供应商评估": ["supplier-evaluation", "p2s-otif-on-time-in-full-analytics"],
  # 22 产能调查
  "产能调查": ["supplier-performance-manager", "p2s-multi-factory-capacity-allocation"],
  # 23 采购比价
  "采购比价": ["product-supplier-sourcing", "p2s-procurement-cost-kpi-price-achievement"],
  # 24 订单协调
  "订单协调": ["multi-location-order-router", "p2s-omnichannel-order-orchestration-mas"],
  # 25 履约跟踪
  "履约跟踪": ["shipment-tracking", "p2s-order-cycle-time-otd-analytics"],
  # 26 库存分层
  "库存分层": ["inventory-demand-forecaster", "p2s-dynamic-abc-stratification-adaptive-policy"],
  # 27 生命周期分析
  "生命周期分析": ["product-selection", "p2s-fba-fee-intelligence"],
  # 28 调拨清货建议
  "调拨清货建议": ["multi-location-order-router", "p2s-long-tail-sku-clearance-optimization"],
  # 29 质量分析
  "质量分析": ["review-analyst-agent", "p2s-customer-complaint-supply-root-cause-kpi"],
  # 30 纠正预防措施（纯 p2s）
  "纠正预防措施": ["p2s-return-root-cause-attribution-graph", "p2s-cs-supply-chain-feedback-loop-tag"],
  # 31 关务资料检查
  "关务资料检查": ["tariff-search", "p2s-atlas-hts-tariff-classification"],  # 岗内去重：international-shipping-customs 归物流方案,
  # 32 退货分流
  "退货分流": ["returns-exchange-automator", "p2s-predictive-batch-returns-routing"],
  # 33 仓储协作
  "仓储协作": ["multi-location-order-router", "p2s-order-routing-intelligence-engine"],  # 岗内去重：warehouse 归履约异常,
  # 34 渠道经营分析
  "渠道经营分析": ["ecommerce-analytics-controller", "p2s-contribution-margin-by-channel"],
  # 35 行动组合
  "行动组合": ["amazon-ppc-campaign-manager", "p2s-multi-objective-constrained-action-planning"],
  # 36 商品诊断
  "商品诊断": ["amazon-listing-expert", "p2s-amazon-search-ranking-factor-model"],
  # 37 搜索意图分析
  "搜索意图分析": ["seo-keyword-research", "p2s-hierarchical-search-intent-classification"],
  # 38 Listing优化
  "Listing优化": ["multi-platform-listing-generator", "p2s-amazon-a10-algorithm-ranking"],  # 岗内去重：listing-expert 归商品诊断,
  # 39 漏斗诊断
  "漏斗诊断": ["optimize-ecommerce-page-conversion", "p2s-customer-journey-analytics"],
  # 40 站点运营
  "站点运营": ["shopify-store-ops", "p2s-live-commerce-stream-algorithm"],
  # 41 市场进入
  "市场进入": ["gtm-strategy-planning", "p2s-multimarket-expansion-readiness-scorer"],
  # 42 价格敏感性
  "价格敏感性": ["dynamic-pricing-engine", "p2s-causal-rl-dynamic-pricing"],
  # 43 组合设计 —— 例外：区分保留对（静态/动态捆绑）
  "组合设计": ["product-attribute-analyzer", "p2s-bundle-pricing-strategy", "p2s-dynamic-bundle-pricing"],
  # 44 本地化
  "本地化": ["multilingual-seo", "p2s-cross-market-content-localization"],
  # 45 市场语境审查
  "市场语境审查": ["product-marketing-context", "p2s-ai-cultural-sensitivity-localization"],
  # 46 品牌定位
  "品牌定位": ["brand-governance-os", "p2s-voc-competitive-positioning-map"],
  # 47 品牌反馈
  "品牌反馈": ["brand-mention-tracking", "p2s-video-sentiment-analysis-voc"],
  # 48 内容策划
  "内容策划": ["content-strategy", "p2s-ai-content-marketing-growth"],
  # 49 内容实验
  "内容实验": ["ab-test-setup", "p2s-ab-experimental-design"],
  # 50 视觉简报
  "视觉简报": ["image-prompt-guide", "p2s-diffusion-model-product-image"],
  # 51 视频制作协作（合并 keep：brand-video-generation）
  "视频制作协作": ["video-prompt-guide", "p2s-brand-video-generation"],
  # 52 达人筛选
  "达人筛选": ["influencer-marketing", "p2s-kol-creator-matching"],
  # 53 联盟运营
  "联盟运营": ["referral-program-builder", "p2s-referral-network-value-attribution"],
  # 54 合作复盘
  "合作复盘": ["attribution", "p2s-bayesian-structural-time-series"],
  # 55 分群
  "分群": ["customer-rfm-analyzer", "p2s-dml-cohort-causal-effect"],
  # 56 复购实验
  "复购实验": ["customer-winback-automator", "p2s-case-cadence-aware-repurchase-prediction"],
  # 57 实验设计
  "实验设计": ["ab-test-setup", "p2s-ab-experimental-design"],
  # 58 增量分析
  "增量分析": ["attribution", "p2s-augmented-synthetic-control-ml"],
  # 59 产品问答
  "产品问答": ["product-marketing-context", "p2s-agentic-rag-active-retrieval"],
  # 60 需求识别
  "需求识别": ["customer-voice-analyzer", "p2s-user-profile-long-memory"],  # 岗内去重：jtbd 归选购指导,
  # 61 客诉分诊
  "客诉分诊": ["helpdesk-order-integration", "p2s-mas-customer-service-intelligent-escalation"],
  # 62 售后处理
  "售后处理": ["returns-exchange-automator", "p2s-multilingual-customer-service-translation"],
  # 63 服务补救
  "服务补救": ["chargeback-dispute-manager", "p2s-emotional-ai-customer-care"],
  # 64 客诉聚类
  "客诉聚类": ["voc-sentiment-analyzer", "p2s-bertopic-neural-topic-modeling"],
  # 65 体验分析
  "体验分析": ["customer-voice-analyzer", "p2s-causal-voc-sentiment-attribution"],
  # 66 会员活动
  "会员活动": ["loyalty-points-designer", "p2s-vip-tier-upgrade-action"],
  # 67 用户反馈
  "用户反馈": ["customer-voice-analyzer", "p2s-agrs-aspect-guided-review-summarization"],
  # 68 收入与费用核对
  "收入与费用核对": ["invoice-generator", "p2s-agent-finance-autopilot"],  # 岗内去重：dashboard 归渠道对账,
  # 69 资金预测
  "资金预测": ["creating-financial-models", "p2s-amazon-payment-cycle-forecast"],
  # 70 经济性分析
  "经济性分析": ["profit-margin-analyzer", "p2s-agentic-pnl-analyst"],
  # 71 税务资料
  "税务资料": ["tariff-search", "p2s-cross-border-tax-tariff-modeling"],  # 岗内去重：vat-automator 留在实体口径核对,
  # 72 申报协作
  "申报协作": ["invoice-generator", "p2s-vat-gst-compliance-automation"],  # 岗内去重：vat-automator 留在实体口径核对,
  # 73 产品准入核对
  "产品准入核对": ["cross-border-category-feasibility", "p2s-ai-product-safety-certification"],
  # 74 指标契约
  "指标契约": ["ecommerce-business-insights", "p2s-pvm-attribution-window-harmonization"],
  # 75 账号商品映射 —— 例外：区分保留卡（商品实体消歧）
  "账号商品映射": ["multichannel-inventory-sync", "p2s-entity-resolution-kg-dedup"],
  # 76 数据管道（纯 p2s）
  "数据管道": ["p2s-agentic-etl-data-pipeline", "p2s-amazon-sp-api-data-pipeline"],
  # 77 集成验证
  "集成验证": ["dsh-dev-platform-diagnostics", "p2s-sc-agent-mcp-erp-integration"],
  # 78 知识溯源
  "知识溯源": ["research", "p2s-factscore-claim-verification-pipeline"],
  # 79 技能版本
  "技能版本": ["skill-family-manager", "p2s-autoskill-lifelong-learning"],
  # 80 Playbook评估
  "Playbook评估": ["skill-evaluator", "p2s-agent-capability-evaluation"],
  # 81 运行监测
  "运行监测": ["dsh-dev-platform-diagnostics", "p2s-agent-observability-tracing"],
  # 82 容量管理（纯 p2s）
  "容量管理": ["p2s-agent-cost-optimization-budget-control", "p2s-context-token-compression"],
  # 83 安全事件处理（纯 p2s）
  "安全事件处理": ["p2s-cross-border-payment-fraud-detection", "p2s-ato-spatio-temporal-graph"],
  # 84 能力匹配
  "能力匹配": ["skill-family-manager", "p2s-business-problem-to-skill-retrieval"],
  # 85 异常冻结与恢复（合并 keep：ltv-cac-acquisition-gate）
  "异常冻结与恢复": ["p2s-ltv-cac-acquisition-gate", "p2s-agent-error-budget"],
  # 86 岗位能力分析
  "岗位能力分析": ["org-structure-research", "p2s-agent-workforce-replacement-calculator"],  # 岗内去重：people-research 归培训与招聘支持,
  # 87 实验组合
  "实验组合": ["ab-test-setup", "p2s-llm-experiment-hypothesis"],
  # 88 可用性验证
  "可用性验证": ["optimize-ecommerce-page-conversion", "p2s-cognitive-load-ux-optimizer"],
  # 89 算法评估设计
  "算法评估设计": ["ecommerce-ml-modeling-advisor", "p2s-interleaving-experiment-design"],
  # 90 物流方案
  "物流方案": ["international-shipping-customs", "p2s-3d-bin-packing-optimization"],
  # 91 到货异常追踪
  "到货异常追踪": ["shipment-tracking", "p2s-in-transit-inventory-tracking-visibility"],
  # 92 履约异常
  "履约异常": ["warehouse-fulfillment-workflow", "p2s-multicarrier-parcel-tracking-fusion"],
  # 93 转化优化（合并 keep：abandoned-cart-recovery-ml）
  "转化优化": ["checkout-flow-optimizer", "p2s-abandoned-cart-recovery-ml"],
  # 94 渠道研究
  "渠道研究": ["market-insight-product-selection", "p2s-new-market-entry-readiness-gate"],
  # 95 账号诊断
  "账号诊断": ["amazon-brand-protection", "p2s-account-health-early-warning-system"],
  # 96 规则监测（合并 keep：regulatory-change-monitoring）
  "规则监测": ["platform-price-monitor", "p2s-regulatory-change-monitoring"],  # 岗内去重：brand-protection 归账号诊断,
  # 97 申诉材料准备
  "申诉材料准备": ["doc-coauthoring", "p2s-amazon-account-appeal-strategy"],
  # 98 素材版本管理
  "素材版本管理": ["file-history-manager", "p2s-creative-fatigue-detection"],
  # 99 因果局限审查
  "因果局限审查": ["market-viability-logic-auditor", "p2s-causal-decision-graph-sc-inference"],
  # 100 选购指导（合并 keep：shopping-companion-agent）
  "选购指导": ["jtbd-analyzer", "p2s-shopping-companion-agent"],
  # 101 差异追踪
  "差异追踪": ["profit-margin-analyzer", "p2s-accounts-receivable-intelligence"],
  # 102 经营预算
  "经营预算": ["ecommerce-budget-forecaster", "p2s-budget-reforecast-rolling"],
  # 103 知识产权检索
  "知识产权检索": ["amazon-brand-protection", "p2s-brand-registry-infringement-tracker"],
  # 104 争议证据组织
  "争议证据组织": ["chargeback-dispute-manager", "p2s-ip-trademark-brand-monitoring"],
  # 105 宣称审查
  "宣称审查": ["brand-governance-os", "p2s-amazon-tos-compliance-guardrail"],
  # 106 隐私需求分析 —— 例外：区分保留对（COPPA vs GDPR/CCPA）
  "隐私需求分析": ["ecommerce-gdpr-compliance", "p2s-privacy-coppa-compliance", "p2s-privacy-compliant-data-collection-gdpr-ccpa"],
  # 107 数据质量
  "数据质量": ["ecommerce-csv-processing", "p2s-blockecho-missing-data"],
  # 108 溯源监测
  "溯源监测": ["knowledge-extraction-expert", "p2s-data-provenance-lineage"],
  # 109 接口契约
  "接口契约": ["p2s-mcp-a2a-protocol-stack", "p2s-schema-evolution-data-contract"],  # 岗内去重：plugin 归业务工具实现,
  # 110 失败恢复
  "失败恢复": ["dsh-desktop-diagnostics", "p2s-agent-fault-tolerance"],
  # 111 访问控制
  "访问控制": ["skill-vetter", "p2s-agenttrust-runtime-safety-interception"],
  # 112 授权审查
  "授权审查": ["p2s-human-in-loop-approval-gate-tag", "p2s-decision-confidence-calibration-sc"],  # 岗内去重：skill-vetter 归访问控制,
  # 113 经营目标拆解
  "经营目标拆解": ["ecommerce-quarterly-strategy", "p2s-business-scale-kpi-growth-achievement"],
  # 114 需求分诊
  "需求分诊": ["ecommerce-analytics-controller", "p2s-agentrouter-kg-guided"],
  # 115 培训与招聘支持
  "培训与招聘支持": ["people-research", "p2s-skill-dependency-path-planner"],
  # 116 用户访谈分析
  "用户访谈分析": ["jtbd-analyzer", "p2s-personabot-rag-profiling"],
  # 117 阶段投资建议
  "阶段投资建议": ["product-launch-planner", "p2s-real-options-product-launch-timing"],
  # 118 使用旅程
  "使用旅程": ["experience-system-blueprint", "p2s-peak-end-rule-customer-experience"],
  # 119 OEM协作
  "OEM协作": ["dropshipping-supplier-integrator", "p2s-supplier-development-roadmap-tracking"],
  # 120 经营复盘
  "经营复盘": ["ecommerce-monthly-review", "p2s-postpromo-retrospective-kpi"],
  # 121 创意简报（合并 keep：ai-video-script-generation）
  "创意简报": ["product-marketing-brief", "p2s-ai-video-script-generation"],
  # 122 改进验证
  "改进验证": ["ab-test-setup", "p2s-review-sentiment-growth-trigger"],
  # 123 使用教育
  "使用教育": ["doc-coauthoring", "p2s-digital-wellbeing-screen-time-model"],
  # 124 渠道对账
  "渠道对账": ["ecommerce-financial-dashboard", "p2s-agentic-etl-data-pipeline"],
  # 125 主数据治理（合并 keep：cross-platform-user-identity）
  "主数据治理": ["terminology-standardizer", "p2s-cross-platform-user-identity"],
}

if __name__ == "__main__":
    m = json.load(open('/Users/lute/project/Magpie-Horch/scripts/role-presets/skill-map.json'))
    skills = m['skills']
    errors = []
    covered = 0
    for l3, e in skills.items():
        sup = e.get('supply', [])
        if len(sup) < 3:
            continue
        covered += 1
        keep = KEEP.get(l3)
        if keep is None:
            errors.append(f"缺决策: {l3}")
            continue
        extra = [s for s in keep if s not in sup]
        if extra:
            errors.append(f"{l3} keep 不在 supply: {extra}")
    print("congested entries:", covered)
    print("decisions:", len(KEEP))
    if errors:
        print("ERRORS:")
        for e in errors: print(" ", e)
    else:
        print("全部 keep ⊆ supply ✓")
    json.dump(KEEP, open('/tmp/stage2-keep.json', 'w'), ensure_ascii=False, indent=1)