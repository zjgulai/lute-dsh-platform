#!/usr/bin/env node
/**
 * patch-cn-slash.mjs — 「斜杠命令全中文 + 结构化引导模板」补丁（幂等，锚点匹配，首次打补丁自动备份）
 * 补丁点：
 *   A. dsh-client-ui-skill/lib/client.js onPick：选中后填入中文标题（/GEO优化器）而非英文名
 *   B. dsh-client-ui-skill/lib/client.js lexicon：加入中文标题（精确匹配/词法高亮）
 *   C. dsh-overseas-skills/lib/client.js 卡片墙：点击填入 /中文标题
 *   D. dsh-client-ui-skill candidates：候选挂结构化模板（fetch /prompt-template，模板缓存）
 *   E. dsh-client-ui-skill onPick：候选带 template 时填入结构化引导（L1/L2/L3 模板）
 *   F. dsh-client-ui-skill：模板缓存声明
 * 用法：node scripts/patch-cn-slash.mjs [--restore]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHECKOUT = "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai";
const RESTORE = process.argv.includes("--restore");

const PATCHES = [
  {
    file: path.join(CHECKOUT, "dsh-client-ui-skill", "lib", "client.js"),
    name: "onPick 填入中文标题",
    anchor:
      "onPick({ candidate }) {\n\t\t\t\t\treturn { text: `/${candidate.skillName ?? candidate.name} ` };\n\t\t\t\t}",
    replacement:
      "onPick({ candidate }) {\n\t\t\t\t\treturn { text: `/${candidate.name ?? candidate.skillName} ` };\n\t\t\t\t}",
  },
  {
    file: path.join(CHECKOUT, "dsh-client-ui-skill", "lib", "client.js"),
    name: "lexicon 加入中文标题",
    anchor: "fetches.get(session.sessionId)?.settled?.map((skill) => skill.name)",
    replacement:
      "fetches.get(session.sessionId)?.settled?.flatMap((skill) => skill.title !== void 0 && skill.title.length > 0 ? [skill.name, skill.title] : [skill.name])",
  },
  {
    file: path.join(ROOT, "lib", "client.js"),
    name: "卡片墙点击填入中文标题",
    anchor: 'var text = "/" + it.name + " 请使用「" + it.title + "」帮我：";',
    replacement: 'var text = "/" + (it.title || it.name) + " 请使用「" + it.title + "」帮我：";',
  },
  {
    file: path.join(CHECKOUT, "dsh-client-ui-skill", "lib", "client.js"),
    name: "斜杠选择：候选挂结构化模板（L1/L2/L3）",
    anchor:
      'return skills.filter((skill) => {\n\t\t\t\t\t\tif (needle.length === 0) return true;\n\t\t\t\t\t\tconst hay = [(skill.title ?? ""), skill.name, skill.description];\n\t\t\t\t\t\treturn hay.some((text) => text.toLowerCase().includes(needle));\n\t\t\t\t\t}).map((skill) => ({\n\t\t\t\t\t\tname: skill.title ?? skill.name,\n\t\t\t\t\t\tdescription: skill.modelInvocable ? skill.description : `${t("menu.userOnly")} \u00b7 ${skill.description}`,\n\t\t\t\t\t\tskillName: skill.name\n\t\t\t\t\t}));',
    replacement:
      'const list = skills.filter((skill) => {\n\t\t\t\t\t\tif (needle.length === 0) return true;\n\t\t\t\t\t\tconst hay = [(skill.title ?? ""), skill.name, skill.description];\n\t\t\t\t\t\treturn hay.some((text) => text.toLowerCase().includes(needle));\n\t\t\t\t\t}).map((skill) => ({\n\t\t\t\t\t\tname: skill.title ?? skill.name,\n\t\t\t\t\t\tdescription: skill.modelInvocable ? skill.description : `${t("menu.userOnly")} \u00b7 ${skill.description}`,\n\t\t\t\t\t\tskillName: skill.name\n\t\t\t\t\t}));\n\t\t\t\t\tawait Promise.all(list.map(async (item) => {\n\t\t\t\t\t\tif (!templateCache.has(item.skillName)) {\n\t\t\t\t\t\t\tconst p = fetch(`/api/dsh-overseas-skills/prompt-template?name=${encodeURIComponent(item.skillName)}&title=${encodeURIComponent(item.name)}`)\n\t\t\t\t\t\t\t\t.then((r) => r.json())\n\t\t\t\t\t\t\t\t.then((d) => (d && d.ok && typeof d.template === "string" ? d.template : ""))\n\t\t\t\t\t\t\t\t.catch(() => "");\n\t\t\t\t\t\t\ttemplateCache.set(item.skillName, p);\n\t\t\t\t\t\t}\n\t\t\t\t\t\ttry { item.template = await templateCache.get(item.skillName); } catch { item.template = ""; }\n\t\t\t\t\t}));\n\t\t\t\t\treturn list;',
  },
  {
    file: path.join(CHECKOUT, "dsh-client-ui-skill", "lib", "client.js"),
    name: "斜杠选择：onPick 用结构化模板",
    anchor:
      "onPick({ candidate }) {\n\t\t\t\t\treturn { text: `/${candidate.name ?? candidate.skillName} ` };\n\t\t\t\t}",
    replacement:
      'onPick({ candidate }) {\n\t\t\t\t\tif (typeof candidate.template === "string" && candidate.template.length > 0) return { text: candidate.template };\n\t\t\t\t\treturn { text: `/${candidate.name ?? candidate.skillName} ` };\n\t\t\t\t}',
  },
  {
    file: path.join(CHECKOUT, "dsh-client-ui-skill", "lib", "client.js"),
    name: "斜杠选择：模板缓存声明",
    anchor: "const fetches = /* @__PURE__ */ new Map();",
    replacement: "const fetches = /* @__PURE__ */ new Map();\n\tconst templateCache = /* @__PURE__ */ new Map();",
  },
];

function backup(file) {
  const bak = file + ".bak-cn-slash";
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  return bak;
}

let applied = 0;
for (const p of PATCHES) {
  if (!fs.existsSync(p.file)) {
    console.log(`✗ 缺失目标：${p.file}`);
    continue;
  }
  const text = fs.readFileSync(p.file, "utf8");
  if (RESTORE) {
    const bak = p.file + ".bak-cn-slash";
    if (!fs.existsSync(bak)) { console.log(`跳过（无备份）：${p.name}`); continue; }
    const original = fs.readFileSync(bak, "utf8");
    if (text.includes(p.replacement)) {
      fs.writeFileSync(p.file, original);
      console.log(`↩ 已还原：${p.name}`);
      applied++;
    } else console.log(`跳过（未打补丁）：${p.name}`);
    continue;
  }
  if (text.includes(p.replacement)) {
    console.log(`= 已打补丁（幂等跳过）：${p.name}`);
    continue;
  }
  if (!text.includes(p.anchor)) {
    console.log(`✗ 锚点未命中：${p.name}`);
    continue;
  }
  backup(p.file);
  fs.writeFileSync(p.file, text.replace(p.anchor, p.replacement));
  console.log(`✓ 已打补丁：${p.name}`);
  applied++;
}
console.log(RESTORE ? `还原完成：${applied}` : `补丁完成：${applied}/${PATCHES.length}。刷新浏览器页面（或重启 DSH）后生效。`);
