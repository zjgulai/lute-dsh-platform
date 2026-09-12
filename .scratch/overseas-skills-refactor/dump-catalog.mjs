// 只读：把 dsh-overseas-skills 的 lib/catalog.js 导出为 JSON，供映射覆盖度分析使用。
// 用法：node .scratch/overseas-skills-refactor/dump-catalog.mjs > /tmp/overseas-catalog.json
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = "/Users/lute/project/Magpie-Horch";
const mod = await import(
  pathToFileURL(path.join(ROOT, "packages/capabilities/dsh-overseas-skills/lib/catalog.js")).href
);

const out = {
  categories: mod.CATEGORIES.map((c) => ({
    key: c.key,
    title: c.title,
    subs: (c.subs ?? []).map((s) => ({ key: s.key, title: s.title })),
  })),
  skills: mod.SKILLS.map((s) => ({
    name: s.name,
    title: s.title,
    category: s.category,
    categoryTitle: s.categoryTitle,
    subcategory: s.subcategory,
    toolBacked: !!s.toolBacked,
    summaryZh: s.summaryZh ?? "",
    toolGap: s.toolGap ?? "",
  })),
  categoriesFs: mod.CATEGORIES_FS.map((c) => ({ key: c.key, title: c.title })),
  skillsFs: mod.SKILLS_FS.map((s) => ({
    name: s.name,
    title: s.title,
    category: s.category,
    categoryTitle: s.categoryTitle,
  })),
};

process.stdout.write(JSON.stringify(out, null, 1));
