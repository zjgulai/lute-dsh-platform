#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分配 LUTE 头像到出海技能：分类 25 枚 + 81 系技能 81 枚。
数据源：lute-brand-icons 技能资产 manifest.json（id → data URI）。
产出：manifest/category-icons.json（分类头像）+ manifest/skill-icons.json（技能头像）。
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LUTE = os.path.expanduser("~/.dsh/skills/lute-brand-icons/assets/manifest.json")

# 分类 → LUTE 头像 id（复用现成角色，品牌为新增 brand-officer）
CAT_ASSIGN = {
    "a-market": "sc-a-market",
    "b-product": "sc-b-product",
    "c-content-brand": "sc-c-content-brand",
    "d-traffic": "sc-d-traffic",
    "e-sales": "sc-e-sales",
    "f-fulfillment": "sc-f-fulfillment",
    "g-insight": "sc-g-insight",
    "h-enable": "sc-h-enable",

    "sourcing": "procurement",
    "research-selection": "search",
    "design": "ux-designer",
    "content-gtm": "content-ops",
    "brand": "brand-officer",
    "pr": "sales-director",
    "social-ops": "live-host",
    "seo-ads": "launch",
    "store-ops": "store-manager",
    "shipping-tariff": "supply-chain",
    "analytics-finance": "finance-analyst",
    "crm-retention": "praise",
    "productivity": "document",
    "agent-tools": "fullstack-dev",
    "other": "inspiration",
    "knowledge-engineering": "mom-teacher",
    "skill-engineering": "settings",
    "ecommerce-analytics": "data-scientist",
    "preset-ai-content-image-studio": "camera",
    "preset-ai-product-developer": "product-manager",
    "preset-ai-report-analyst": "research-analyst",
    "preset-dsh-motion-deck-studio": "motion-designer",
    "preset-feishu-digital-employee": "admin-feishu",
    "preset-llm-wiki-fullstack": "knowledge-architect",
    "preset-product-video-director": "video-editor",
}

# 81 技能 → sk-<name>（生成器已按此 id 产出）
mapping = json.load(open(os.path.join(ROOT, "scripts", "81-mapping.json"), encoding="utf-8"))
SKILL_ASSIGN = {s["name"]: f"sk-{s['name']}" for s in mapping["skills"]}


def main():
    lute = json.load(open(LUTE, encoding="utf-8"))
    by_id = {m["id"]: m["icon"] for m in lute}
    cat_icons = {}
    for key, icon_id in CAT_ASSIGN.items():
        if icon_id not in by_id:
            raise SystemExit(f"缺失头像：{icon_id}")
        cat_icons[key] = by_id[icon_id]
    skill_icons = {}
    # 保留既有自定义图标（非 81 系，如 self-improvement/agent-browser），避免重跑管线时抹掉手工头像
    prev_path = os.path.join(ROOT, "manifest", "skill-icons.json")
    if os.path.isfile(prev_path):
        try:
            prev = json.load(open(prev_path, encoding="utf-8"))
            for name, uri in prev.items():
                if name not in SKILL_ASSIGN:
                    skill_icons[name] = uri
        except Exception:
            pass
    for name, icon_id in SKILL_ASSIGN.items():
        if icon_id not in by_id:
            raise SystemExit(f"缺失头像：{icon_id}")
        skill_icons[name] = by_id[icon_id]
    json.dump(cat_icons, open(os.path.join(ROOT, "manifest", "category-icons.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(skill_icons, open(os.path.join(ROOT, "manifest", "skill-icons.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    # AI全栈（fs-*）：8 分类 + 29 技能
    fs_mapping = json.load(open(os.path.join(ROOT, "scripts", "fullstack-mapping.json"), encoding="utf-8"))
    fs_cat_icons = {}
    for c in fs_mapping["categories"]:
        icon_id = f"fs-cat-{c['key']}"
        if icon_id not in by_id: raise SystemExit(f"缺失头像：{icon_id}")
        fs_cat_icons[c["key"]] = by_id[icon_id]
    fs_skill_icons = {}
    for s in fs_mapping["skills"]:
        icon_id = f"sk-fs-{s['name']}"
        if icon_id not in by_id: raise SystemExit(f"缺失头像：{icon_id}")
        fs_skill_icons[s["name"]] = by_id[icon_id]
    json.dump(fs_cat_icons, open(os.path.join(ROOT, "manifest", "category-icons-fs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(fs_skill_icons, open(os.path.join(ROOT, "manifest", "skill-icons-fs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"分配完成：出海 {len(cat_icons)} 分类/{len(skill_icons)} 技能 | AI全栈 {len(fs_cat_icons)} 分类/{len(fs_skill_icons)} 技能")


if __name__ == "__main__":
    main()
