#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DEPRECATED：已被 assign_lute_icons.py 取代（文字徽章 → LUTE 头像）。保留作历史参考。
生成分类徽章图标（与 preset 卡片 icon 同一套 LUTE 风格）→ manifest/category-icons.json
模板与 brand-marketing-growth 预设 icon 同一视觉语言：
  圆角方徽章 + 绿系渐变（#DCF1D6→#8FD48A→#58B848）+ 主绿描边 + 高光 + 白色粗体短标签 + 深绿底饰。
产物为 base64 data URI，供 catalog 与 client 渲染使用。
"""
import base64
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "manifest", "category-icons.json")

LABELS = {
    "sourcing": "货源",
    "research-selection": "调研",
    "design": "设计",
    "content-gtm": "内容",
    "brand": "品牌",
    "pr": "公关",
    "social-ops": "社媒",
    "seo-ads": "流量",
    "store-ops": "店铺",
    "shipping-tariff": "物流",
    "analytics-finance": "财务",
    "crm-retention": "留存",
    "productivity": "办公",
    "agent-tools": "Agent",
    "other": "其他",
    "knowledge-engineering": "知识",
    "skill-engineering": "技能",
    "ecommerce-analytics": "电商",
    "preset-ai-content-image-studio": "视觉",
    "preset-ai-product-developer": "开发",
    "preset-ai-report-analyst": "报表",
    "preset-dsh-motion-deck-studio": "演示",
    "preset-feishu-digital-employee": "飞书",
    "preset-llm-wiki-fullstack": "Wiki",
    "preset-product-video-director": "视频",
}


def badge(label):
    font_size = 22 if label.isascii() else 28
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#DCF1D6"/>
      <stop offset="55%" stop-color="#8FD48A"/>
      <stop offset="100%" stop-color="#58B848"/>
    </linearGradient>
    <radialGradient id="h" cx="0.3" cy="0.2" r="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.62)"/>
      <stop offset="55%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <clipPath id="c"><rect x="6" y="6" width="88" height="88" rx="16"/></clipPath>
  </defs>
  <rect x="4.5" y="7" width="91" height="89" rx="18" fill="rgba(0,0,0,0.12)"/>
  <rect x="4.5" y="4.5" width="91" height="91" rx="18" fill="url(#g)" stroke="#58B848" stroke-width="2.2"/>
  <path d="M10.5 26 Q10.5 10.5 26 10.5 L58 10.5" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M89.5 74 Q89.5 89.5 74 89.5 L42 89.5" fill="none" stroke="rgba(46,125,60,0.32)" stroke-width="1.4" stroke-linecap="round"/>
  <rect x="6" y="6" width="88" height="88" rx="16" fill="url(#h)"/>
  <g clip-path="url(#c)">
    <text x="50" y="57" text-anchor="middle" font-family="-apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif" font-size="{font_size}" font-weight="700" fill="#FFFFFF" letter-spacing="1">{label}</text>
    <rect x="35" y="66" width="30" height="4.5" rx="2.25" fill="#2E7D3C" opacity="0.8"/>
  </g>
</svg>'''


def main():
    icons = {}
    for key, label in LABELS.items():
        svg = badge(label)
        uri = "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode()
        icons[key] = uri
    json.dump(icons, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"category-icons.json 已写入：{len(icons)} 枚徽章")


if __name__ == "__main__":
    main()
