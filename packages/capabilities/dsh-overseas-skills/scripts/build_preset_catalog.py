#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成非海外 preset 的技能目录，并把 7 个 preset 组并入 lib/catalog.js。

数据流：
  ~/.dsh/.agent-presets/<id>/skills/<name>/SKILL.md (frontmatter)
    -> presets/preset-skills.json （人工标题映射 TITLES）
    -> lib/catalog.js（CATEGORIES + SKILLS 追加 preset 组，宿主 /list 自动分组）

幂等：重跑覆盖；技能增删自动跟随目录。
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRESETS_DIR = os.path.expanduser("~/.dsh/.agent-presets")
MANIFEST = os.path.join(ROOT, "manifest", "skills.json")
MARKETING = os.path.join(ROOT, "manifest", "marketing-skills.json")
SKILLS81 = os.path.join(ROOT, "manifest", "81-skills.json")
CATEGORY_ICONS_SVG = os.path.join(ROOT, "manifest", "category-icons.json")
SKILL_ICONS = os.path.join(ROOT, "manifest", "skill-icons.json")
CATEGORY_ICONS_FS = os.path.join(ROOT, "manifest", "category-icons-fs.json")
SKILL_ICONS_FS = os.path.join(ROOT, "manifest", "skill-icons-fs.json")
LEGACY_SUMMARIES = os.path.join(ROOT, "scripts", "legacy-summaries.json")
EXTRA_SKILLS = os.path.join(ROOT, "manifest", "extra-skills.json")
FULLSTACK = os.path.join(ROOT, "manifest", "fullstack-skills.json")
OUT = os.path.join(ROOT, "presets", "preset-skills.json")
CATALOG = os.path.join(ROOT, "lib", "catalog.js")
TAXONOMY = os.path.join(ROOT, "manifest", "taxonomy-v3.json")

# 营销技能新分类插入位置：content-gtm 之后
MARKETING_CATEGORY_INSERT_AFTER = "content-gtm"

# 存量分类默认图标（81 系技能行有自己的 emoji，其余行/胶囊用这里）
CATEGORY_ICONS = {
    "sourcing": "🧲",
    "research-selection": "🔭",
    "design": "🎨",
    "content-gtm": "✍️",
    "brand": "💎",
    "pr": "📢",
    "social-ops": "📱",
    "seo-ads": "📈",
    "store-ops": "🏪",
    "shipping-tariff": "🚢",
    "analytics-finance": "💹",
    "crm-retention": "💝",
    "productivity": "🗂️",
    "agent-tools": "🤖",
    "other": "🧩",
}

PRESET_IDS = [
    "ai-content-image-studio",
    "ai-product-developer",
    "ai-report-analyst",
    "dsh-motion-deck-studio",
    "feishu-digital-employee",
    "llm-wiki-fullstack",
    "product-video-director",
]

# 人工中文标题（frontmatter 缺 title 时的兜底 / 占位符修复）
TITLES = {
    "ai-content-images": "AI 图文卡片",
    "grill-me": "需求澄清（决策树）",
    "tdd": "TDD 纵向开发循环",
    "to-spec": "需求规格生成",
    "build-ai-report": "Excel 数据分析与报表",
    "dsh-motion-deck": "HTML 动效演示文稿",
    "feishu-digital-employee": "飞书数字员工",
    "find-plugins": "DSH 插件检索推荐",
    "product-launch-video": "产品发布视频生成",
}

# 英文描述的中文简介覆盖（其余直接用 frontmatter description）
ZH_OVERRIDES = {
    "find-plugins": "按用户描述的能力需求检索并推荐公共 DeepSeek Harness 插件，安装前给出流行备选",
}


def unquote(value):
    v = str(value).strip()
    if len(v) >= 2 and v[0] == '"' and v[-1] == '"':
        v = v[1:-1].replace('\\"', '"')
    return v


def parse_frontmatter(path):
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return None
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---", text)
    if not m:
        return None
    fm = m.group(1)
    name_m = re.search(r"^name:\s*(.+)\s*$", fm, re.M)
    desc_m = re.search(r"^description:\s*(.+)\s*$", fm, re.M)
    return {
        "name": unquote(name_m.group(1)) if name_m else "",
        "description": unquote(desc_m.group(1)) if desc_m else "",
    }


def main():
    presets = []
    problems = []
    for pid in PRESET_IDS:
        pdir = os.path.join(PRESETS_DIR, pid)
        skills_dir = os.path.join(pdir, "skills")
        title = pid
        yml = os.path.join(pdir, "preset.yml")
        if os.path.isfile(yml):
            m = re.search(r"^name:\s*(.+)\s*$", open(yml, encoding="utf-8").read(), re.M)
            if m:
                title = m.group(1).strip()
        skills = []
        if os.path.isdir(skills_dir):
            for entry in sorted(os.listdir(skills_dir)):
                sp = os.path.join(skills_dir, entry, "SKILL.md")
                if not os.path.isfile(sp):
                    continue
                fm = parse_frontmatter(sp)
                if not fm or not fm["name"]:
                    problems.append(f"{pid}/{entry}: 无法解析 frontmatter")
                    continue
                skills.append({
                    "name": fm["name"],
                    "title": TITLES.get(fm["name"], fm["name"]),
                    "descriptionZh": ZH_OVERRIDES.get(fm["name"], fm["description"]),
                })
        if skills:
            presets.append({"id": pid, "title": title, "skills": skills})

    # ⚠️ 防误清空守卫（2026-09-12）：PRESET_IDS 指向 ~/.dsh/.agent-presets/<id>，但该目录
    # 现存 51 个 agt-NNN，PRESET_IDS 里那 7 个已不存在 → presets 恒为空，而本行会无条件
    # 把 OUT 重写成 {"presets": []}，把提交版里的 7 个 preset 静默抹掉并混进提交。
    # v3 起该文件不再并入技能目录（见下方注释），故「已有内容 + 本次为空」时跳过写盘并告警。
    _existing = 0
    if os.path.isfile(OUT):
        try:
            _existing = len(json.load(open(OUT, encoding="utf-8")).get("presets", []))
        except Exception:
            _existing = 0
    _new = len(presets)
    if _new == 0 and _existing > 0 and "--force-empty-presets" not in sys.argv:
        print(f"⚠️ 跳过写入 preset-skills.json：本次解析出 0 个 preset，但文件里已有 {_existing} 个。")
        print("   原因：PRESET_IDS 的目录不在 ~/.dsh/.agent-presets（现存为 agt-NNN 命名）。")
        print("   若确实要清空，请显式传 --force-empty-presets。")
    else:
        json.dump({"presets": presets}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        _note = "（--force-empty-presets 强制清空）" if _new == 0 else ""
        print(f"preset-skills.json 已写入：{_new} 个 preset / {sum(len(p['skills']) for p in presets)} 条技能 {_note}".rstrip())

    # 重建 catalog.js：海外分组 + 营销新分类 + 81-Skills 新分类 + 7 个 preset 组
    cat_svg = {}
    if os.path.isfile(CATEGORY_ICONS_SVG):
        cat_svg = json.load(open(CATEGORY_ICONS_SVG, encoding="utf-8"))
    skill_svg = {}
    if os.path.isfile(SKILL_ICONS):
        skill_svg = json.load(open(SKILL_ICONS, encoding="utf-8"))
    legacy_summaries = {}
    if os.path.isfile(LEGACY_SUMMARIES):
        legacy_summaries = json.load(open(LEGACY_SUMMARIES, encoding="utf-8"))
    extra_skills = {"skills": []}
    if os.path.isfile(EXTRA_SKILLS):
        extra_skills = json.load(open(EXTRA_SKILLS, encoding="utf-8"))
    fullstack = {"categories": [], "skills": []}
    if os.path.isfile(FULLSTACK):
        fullstack = json.load(open(FULLSTACK, encoding="utf-8"))
    tax = {"scenarios": [], "mapping": {}}
    if os.path.isfile(TAXONOMY):
        tax = json.load(open(TAXONOMY, encoding="utf-8"))
    tax_map = tax.get("mapping", {})
    scenario_by_sub = {}
    for sc in tax.get("scenarios", []):
        for sub in sc.get("subs", []):
            scenario_by_sub[sub["key"]] = sc["key"]
    unmapped = []
    def cat_icon(key):
        return cat_svg.get(key, "")
    cat_svg_fs = {}
    if os.path.isfile(CATEGORY_ICONS_FS):
        cat_svg_fs = json.load(open(CATEGORY_ICONS_FS, encoding="utf-8"))
    skill_svg_fs = {}
    if os.path.isfile(SKILL_ICONS_FS):
        skill_svg_fs = json.load(open(SKILL_ICONS_FS, encoding="utf-8"))
    cat_icon_fs = {c["key"]: cat_svg_fs.get(c["key"], cat_svg.get('agent-tools', '')) for c in fullstack.get("categories", [])}
    m = json.load(open(MANIFEST, encoding="utf-8"))
    # v3：8 大场景（含细分场景 subs），不再使用 manifest 旧分组
    cats = [
        {
            "key": sc["key"], "title": sc["title"], "icon": cat_icon(sc["key"]),
            "subs": [{"key": sub["key"], "title": sub["title"]} for sub in sc.get("subs", [])]
        }
        for sc in tax.get("scenarios", [])
    ]
    skills = [{
        "name": s["name"], "title": s["title"], "category": s["category"],
        "categoryTitle": s["categoryTitle"], "toolBacked": s["toolBacked"],
        "summaryZh": s.get("summaryZh", ""), "toolGap": s.get("toolGap", ""),
        "icon": "",
    } for s in m["skills"]]
    marketing = {"categories": [], "skills": []}
    if os.path.isfile(MARKETING):
        marketing = json.load(open(MARKETING, encoding="utf-8"))
    mcats = marketing.get("categories", [])
    mskills = marketing.get("skills", [])
    cat_title = {c["key"]: c["title"] for c in mcats}
    # v3：分类完全由 taxonomy 决定，marketing 旧分类不再插入
    for s in mskills:
        skills.append({
            "name": s["name"], "title": s["title"], "category": s["category"],
            "categoryTitle": cat_title.get(s["category"], s["category"]),
            "toolBacked": False, "summaryZh": s.get("summaryZh", ""), "toolGap": "",
            "icon": "",
        })
    # 81-Skills：3 个新分类 + C 类新行 + A/B 覆盖行
    skills81 = {"categories": [], "skills": [], "overrides": []}
    if os.path.isfile(SKILLS81):
        skills81 = json.load(open(SKILLS81, encoding="utf-8"))
    cats81 = skills81.get("categories", [])
    cat_icon81 = {c["key"]: c.get("icon", "") for c in cats81}
    for s in skills81.get("skills", []):
        skills.append({
            "name": s["name"], "title": s["title"], "category": s["category"],
            "categoryTitle": s.get("categoryTitle", s["category"]),
            "toolBacked": False, "summaryZh": s.get("summaryZh", ""),
            "toolGap": s.get("toolGap", ""), "icon": "",
        })
    overrides = {o["name"]: o for o in skills81.get("overrides", [])}
    for s in extra_skills.get("skills", []):
        if any(x["name"] == s["name"] for x in skills):
            continue
        skills.append({
            "name": s["name"], "title": s["title"], "category": s["category"],
            "categoryTitle": s.get("categoryTitle", s["category"]),
            "toolBacked": s.get("toolBacked", False), "summaryZh": s.get("summaryZh", ""),
            "toolGap": s.get("toolGap", ""), "icon": s.get("icon", ""),
        })
    # v3：preset 组不再并入技能目录（preset-skills.json 仍生成，供其他工具使用）
    # v3：全部技能按 taxonomy 归位到 8 大场景/细分场景
    for s in skills:
        sub = tax_map.get(s["name"])
        if sub is None:
            unmapped.append(s["name"])
            continue
        s["category"] = scenario_by_sub.get(sub, "h-enable")
        s["subcategory"] = sub
        s["categoryTitle"] = next((sc["title"] for sc in tax.get("scenarios", []) if sc["key"] == s["category"]), s["category"])
    # 行级 icon：81 系技能专属头像
    for s in skills:
        uri = skill_svg.get(s["name"])
        if uri:
            s["icon"] = uri
    # 应用 81 A/B 覆盖（title/icon/toolBacked），并给无图标的行补分类默认图标
    cat_icon = {c["key"]: c["icon"] for c in cats}
    for s in skills:
        ov = overrides.get(s["name"])
        if ov:
            if "title" in ov:
                s["title"] = ov["title"]
            if "toolBacked" in ov:
                s["toolBacked"] = ov["toolBacked"]
            if ov.get("summaryZh"):
                s["summaryZh"] = ov["summaryZh"]
        # 存量摘要人工精修（148 条，含 8 个标题中文化）
        legacy = legacy_summaries.get(s["name"])
        if legacy:
            if legacy.get("summaryZh"):
                s["summaryZh"] = legacy["summaryZh"]
            if legacy.get("title"):
                s["title"] = legacy["title"]
    # AI全栈技能双源（ADR-0004）：独立分类与行集，供第二个设置页使用
    fs_cats = [{"key": c["key"], "title": c["title"], "icon": cat_icon_fs.get(c["key"], "")} for c in fullstack.get("categories", [])]
    fs_cat_icon = {c["key"]: c.get("icon", "") for c in fullstack.get("categories", [])}
    fs_skills = []
    for s in fullstack.get("skills", []):
        sub = tax_map.get(s["name"])
        fs_skills.append({
            "name": s["name"], "title": s["title"], "category": s["category"],
            "categoryTitle": s.get("categoryTitle", s["category"]),
            "scenario": scenario_by_sub.get(sub, "h-enable") if sub else None,
            "subcategory": sub,
            "toolBacked": False, "summaryZh": s.get("summaryZh", ""),
            "toolGap": "", "icon": skill_svg_fs.get(s["name"], "") or fs_cat_icon.get(s["category"], "") or cat_icon_fs.get(s["category"], ""),
        })
    out = "// Generated from manifest/skills.json + marketing-skills.json + 81-skills.json + fullstack-skills.json + presets/preset-skills.json — do not edit by hand.\n"
    out += "export const CATEGORIES = " + json.dumps(cats, ensure_ascii=False) + ";\n"
    out += "export const SKILLS = " + json.dumps(skills, ensure_ascii=False) + ";\n"
    out += "export const CATEGORIES_FS = " + json.dumps(fs_cats, ensure_ascii=False) + ";\n"
    out += "export const SKILLS_FS = " + json.dumps(fs_skills, ensure_ascii=False) + ";\n"
    open(CATALOG, "w", encoding="utf-8").write(out)
    print(f"lib/catalog.js 已重建：{len(cats)} 大场景 / {len(skills)} 条 | AI全栈 {len(fs_cats)} 组 / {len(fs_skills)} 条")
    if unmapped:
        print("taxonomy 未覆盖技能:", *sorted(set(unmapped)), sep="\n  ")
        sys.exit(1)
    if problems:
        print("问题:", *problems, sep="\n  ")
        sys.exit(1)


if __name__ == "__main__":
    main()
