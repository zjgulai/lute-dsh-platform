#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""O1/O2/O3 数据层优化（幂等）：
  O1 默认仅用户侧：无显式 disable-model-invocation 的导入技能写入 true（保留手动例外）
  O2 互斥边界：4 簇 18 技能 description 尾部加「边界」+ frontmatter 写 whenToUse
  O3 环境声明：24 个工具缺口技能正文加环境说明块 + description 尾部加【需X】 + manifest toolGap
  另：4 个超长描述压缩到 500 内
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "manifest", "skills.json")
SKILLS_DIR = os.path.expanduser("~/.dsh/skills")

# ---------- O3 工具缺口（skill -> (toolLabel, envNote)） ----------
TOOL_GAP = {
    "amazon-prelaunch-ad-budget": ("Jungle Scout MCP", "本机未接入 Jungle Scout MCP（js_*）工具。请基于用户提供的数据或公开检索完成分析，明确标注估算项；勿调用不存在的 js_* 工具。"),
    "amazon-prelaunch-competitor-teardown": ("Jungle Scout MCP", "本机未接入 Jungle Scout MCP（js_*）工具。请基于用户提供的数据或公开检索完成分析，明确标注估算项；勿调用不存在的 js_* 工具。"),
    "amazon-prelaunch-demand-check": ("Jungle Scout MCP", "本机未接入 Jungle Scout MCP（js_*）工具。请基于用户提供的数据或公开检索完成分析，明确标注估算项；勿调用不存在的 js_* 工具。"),
    "amazon-prelaunch-demand-mirror": ("Jungle Scout MCP", "本机未接入 Jungle Scout MCP（js_*）工具。请基于用户提供的数据或公开检索完成分析，明确标注估算项；勿调用不存在的 js_* 工具。"),
    "amazon-prelaunch-listing-builder": ("Jungle Scout MCP", "本机未接入 Jungle Scout MCP（js_*）工具。搜索量数据请让用户提供或改用公开趋势检索，标注估算性质；勿调用不存在的 js_* 工具。"),
    "amazon-prelaunch-margin-check": ("Jungle Scout MCP", "本机未接入 Jungle Scout MCP（js_*）工具。价格与费用数据请让用户提供或公开检索，标注估算项；勿调用不存在的 js_* 工具。"),
    "amazon-prelaunch-trend-scout": ("Jungle Scout MCP", "本机未接入 Jungle Scout MCP（js_*）工具。趋势判断改用公开榜单/谷歌趋势检索，标注估算性质；勿调用不存在的 js_* 工具。"),
    "product-supplier-sourcing": ("供应商搜索工具", "本机无 product_supplier_search 工具。产品/供应商搜索请用通用 web 检索（阿里国际站、1688 等平台公开页面），并标注检索来源。"),
    "product-selection": ("供应商搜索工具", "本机无 product_supplier_search 工具。供应商匹配环节请用通用 web 检索完成，并标注检索来源。"),
    "market-insight-product-selection": ("供应商搜索工具", "本机无 product_supplier_search 工具。需要供应商信息时请用通用 web 检索补充，并标注检索来源。"),
    "gmail-assistant": ("Gmail MCP", "本机未接入 Gmail MCP。请改为输出可直接复制的邮件草稿与操作步骤，由用户在 Gmail 中执行；勿调用 send_gmail_message 等工具。"),
    "accio-mcp-cli": ("accio-mcp-cli 二进制", "本机未安装 accio-mcp-cli 二进制。请用通用工具（web 检索/浏览器）完成等价操作并说明差异；勿执行不存在的命令。"),
    "etsy-pod-automation": ("Printify API", "本机未接入 Printify API。请产出设计、文案与上架清单，由用户在 Printify 后台执行；API 直连需用户提供凭据后再做。"),
    "etsy-seo-optimizer": ("eRank", "本机未接入 eRank。关键词与标签建议改用公开趋势与竞品页面反推，并标注估算性质。"),
    "tariff-search": ("TurtleClassify API", "本机未配置 TurtleClassify API。请用公开关税资料与 HS 编码数据库检索，并建议用户以官方口岸查询结果为准。"),
    "sycm-analysis-skill": ("生意参谋登录态", "本机无已登录淘宝生意参谋的浏览器会话。请指导用户在生意参谋导出所需报表，再基于导出数据做分析。"),
    "email-automation-flow-builder": ("Klaviyo", "本机未接入 Klaviyo。请产出完整的邮件流程文案与触发规则清单，由用户在 Klaviyo 后台搭建；勿调用 API。"),
    "customer-retention-automator": ("Klaviyo", "本机未接入 Klaviyo。请产出留存活动策略、分段规则与文案，由用户在邮件平台执行；勿调用 API。"),
    "lifecycle-marketing-automator": ("Klaviyo", "本机未接入 Klaviyo。请产出生命周期触达规划与文案，由用户在邮件平台执行；勿调用 API。"),
    "social-commerce-sync": ("Meta/TikTok 商务 API", "本机未接入 Meta/TikTok 商务 API。请产出商品目录同步方案与操作步骤，由用户在各平台后台执行。"),
    "tiktok-shop-setup": ("TikTok Shop API", "本机未接入 TikTok Shop API。请产出开店与目录配置清单，由用户在 TikTok Shop 后台执行。"),
}

# ---------- O2 互斥边界（簇 -> skill -> 边界文案） ----------
BOUNDARIES = {
    "product-selection": "全流程循证选品（行业→消费者→选品→供应商）；单一品类趋势判断走 market-insight-product-selection",
    "market-insight-product-selection": "趋势/单一品类的 go-no-go 判断；需要完整供应链流程走 product-selection",
    "cross-border-selection": "聚焦抓取亚马逊等平台数据辅助选品；跨平台全流程走 product-selection",
    "scenario-driven-product-scout": "节日/场景的创意发散；需要数据验证的选品走 product-selection 或 market-insight-product-selection",
    "seo-keyword-research": "找词与搜索意图分类；对标竞品走 seo-competitor-analysis",
    "seo-competitor-analysis": "竞品关键词/外链/内容对标；发现新词走 seo-keyword-research",
    "seo-page-audit": "单个页面的 0-100 体检；找词与选题走 seo-keyword-research",
    "serp-ranking-analyzer": "单一查询的 SERP 解剖；页面自身问题走 seo-page-audit",
    "ecommerce-seo-optimizer": "店铺/商品页级技术 SEO；单页体检走 seo-page-audit",
    "programmatic-seo-strategist": "模板页规模化获取长尾流量；手工选题找词走 seo-keyword-research",
    "customer-retention-automator": "现有客户的防流失日常自动化；召回已流失客户走 customer-winback-automator",
    "customer-winback-automator": "召回已流失客户；现有客户留存走 customer-retention-automator",
    "lifecycle-marketing-automator": "按生命周期阶段的整体触达规划；单点执行走 retention/winback",
    "customer-ltv-calculator": "LTV 计算与客户分层依据；具体活动设计走 retention/winback",
    "discount-promotion-engine": "规则化促销配置（数量折扣/买赠/购物车级）；折扣码发放走 coupon-discount-manager",
    "coupon-discount-manager": "折扣码批量生成与管理；规则化促销走 discount-promotion-engine",
    "loyalty-points-designer": "积分/会员体系设计；单次促销走 discount-promotion-engine",
    "referral-program-builder": "推荐裂变计划；会员积分体系走 loyalty-points-designer",
}

# ---------- 4 个超长描述压缩 ----------
COMPRESS = {
    "ai-product-designer": "Product development workflow with design image generation. Use ONLY when the user explicitly asks for design images (设计图/产品设计/visualize product): create 3 distinct design proposals with generated images, compare them, then optionally match suppliers. SKIP for trend analysis, product recommendations, or attribute research.",
    "etsy-pod-automation": "Full Print-on-Demand lifecycle for Etsy via Printify: trend research, AI design, product creation, SEO-optimized listing with 13 tags, publishing, social promotion, and performance monitoring. Use when the user runs or wants to start an Etsy POD store.",
    "market-insight-product-selection": "Single-category / single-product trend and market analysis: validate demand, momentum, competitive intensity, and customer pain from reviews and comments (TikTok/Amazon, US/UK markets) to produce a confident shortlist or go/no-go. Use for 'what's trending' or 'is this worth selling'. Not for full sourcing workflows.",
    "image-prompt-guide": "Prompt engineering and tool routing for AI image generation and editing: creative generation, product photo editing, e-commerce image sets, and specialized scenes (white background, watermark cleanup, HD upscale, resize, scene swap, logo, flowchart). Do NOT use for full product design workflows.",
}

def read_skill(name):
    p = os.path.join(SKILLS_DIR, name, "SKILL.md")
    if not os.path.exists(p):
        return None
    return open(p, encoding="utf-8").read()

def write_skill(name, text):
    p = os.path.join(SKILLS_DIR, name, "SKILL.md")
    open(p, "w", encoding="utf-8").write(text)

def split_frontmatter(text):
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", text)
    if not m:
        return None, text
    return m.group(1), text[m.end():]

def parse_rows(fm):
    rows = []
    for line in fm.split("\n"):
        km = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if km:
            rows.append((km.group(1), km.group(2)))
        else:
            rows.append(("RAW", line))
    return rows

def render_rows(rows):
    return "\n".join((k + ": " + v) if k != "RAW" else v for k, v in rows)

def get_row(rows, key):
    for k, v in rows:
        if k == key:
            return v
    return None

def set_row(rows, key, value):
    for i, (k, v) in enumerate(rows):
        if k == key:
            rows[i] = (key, value)
            return
    rows.append((key, value))

def main():
    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    by_name = {s["name"]: s for s in manifest["skills"] if s["importable"]}

    o1_applied = 0
    o1_kept = 0
    o2_applied = 0
    o3_applied = 0
    compressed = 0

    for name in sorted(by_name):
        text = read_skill(name)
        if text is None:
            continue
        fm, body = split_frontmatter(text)
        if fm is None:
            print("SKIP(no fm):", name)
            continue
        rows = parse_rows(fm)
        changed = False

        # O1：默认仅用户侧（无显式字段才写 true；有则保留手动状态）
        if get_row(rows, "disable-model-invocation") is None:
            set_row(rows, "disable-model-invocation", "true")
            o1_applied += 1
            changed = True
        else:
            o1_kept += 1

        # O2：互斥边界 → description 尾部 + whenToUse
        boundary = BOUNDARIES.get(name)
        if boundary:
            desc = get_row(rows, "description")
            if desc is not None:
                inner = desc
                if len(inner) >= 2 and inner.startswith('"') and inner.endswith('"'):
                    inner = inner[1:-1]
                tail = f" 边界：{boundary}"
                if "边界：" not in inner:
                    inner = inner + tail
                set_row(rows, "description", json.dumps(inner, ensure_ascii=False))
                set_row(rows, "whenToUse", json.dumps(boundary, ensure_ascii=False))
                o2_applied += 1
                changed = True

        # 超长描述压缩
        if name in COMPRESS:
            set_row(rows, "description", json.dumps(COMPRESS[name], ensure_ascii=False))
            compressed += 1
            changed = True

        # O3：工具缺口 → 描述尾部【需X】+ 正文环境说明块 + manifest toolGap
        gap = TOOL_GAP.get(name)
        if gap:
            label, note = gap
            desc = get_row(rows, "description")
            if desc is not None:
                inner = desc
                if len(inner) >= 2 and inner.startswith('"') and inner.endswith('"'):
                    inner = inner[1:-1]
                marker = f" 【需{label}】"
                if marker not in inner:
                    inner = inner + marker
                set_row(rows, "description", json.dumps(inner, ensure_ascii=False))
            by_name[name]["toolGap"] = label
            o3_applied += 1
            changed = True

        # 正文环境说明块（O3）：插入到正文首个标题后（幂等）
        if gap and f"⚠️ 环境说明" not in body:
            label, note = gap
            block = f"\n\n> ⚠️ **环境说明（DSH）**：{note}\n"
            m = re.search(r"\n(#{1,3}\s+[^\n]+\n)", body)
            if m:
                body = body[:m.end()] + block + body[m.end():]
            else:
                body = body + block
            changed = True

        if changed:
            write_skill(name, "---\n" + render_rows(rows) + "\n---\n" + body)

    json.dump(manifest, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"O1 默认关闭写入: {o1_applied} | 保留手动例外: {o1_kept}")
    print(f"O2 边界声明: {o2_applied} | O3 环境声明: {o3_applied} | 描述压缩: {compressed}")
    print("manifest 已更新（toolGap 字段）")

if __name__ == "__main__":
    main()
