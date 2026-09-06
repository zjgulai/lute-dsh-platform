#!/usr/bin/env node
/**
 * One-shot idempotent importer: Accio skill packages -> DSH user skill root.
 *
 *   node scripts/import-accio.mjs
 *
 * - source: /Users/lute/.accio/accounts/1786471462/skills/<name>/
 * - target: ~/.dsh/skills/<name>/
 * - manifest: ../manifest/skills.json (mapping + toolBacked flags)
 *
 * Behavior:
 *  - tool-backed skills (cli.py / scripts/) are SKIPPED entirely (decision C).
 *  - existing target dir is left untouched (idempotent).
 *  - frontmatter is normalized: description folded block scalars (`>-` / `|-` / `>`)
 *    become one single-line string; `title` (official Chinese name) is inserted
 *    after `name`; all other frontmatter keys are preserved verbatim.
 *  - `disable-model-invocation` / `user-invocable` are NOT written: absence means
 *    the DSH default "on" (model + user invocable), matching the Accio page.
 */
import { readFile, writeFile, readdir, mkdir, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MANIFEST = join(ROOT, "manifest", "skills.json");
const ACCIO = "/Users/lute/.accio/accounts/1786471462/skills";
const TARGET = join(homedir(), ".dsh", "skills");

/** Parse one SKILL.md frontmatter block into ordered key/value rows. */
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { rows: [], body: text };
  const lines = m[1].split(/\r?\n/);
  const rows = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const km = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!km) { rows.push({ raw: line }); i += 1; continue; }
    const key = km[1];
    let value = km[2];
    // block scalar (folded/literal) — consume following indented lines
    if (/^[>|-]/.test(value)) {
      const style = value[0];
      const first = value.slice(1).trim();
      const parts = first ? [first] : [];
      i += 1;
      while (i < lines.length && /^\s+/.test(lines[i])) {
        parts.push(lines[i].trim());
        i += 1;
      }
      value = style === "|" ? parts.join("\n") : parts.join(" ");
      rows.push({ key, value });
      continue;
    }
    if (value === "" || value === "''" || value === '""') { rows.push({ key, value: "" }); i += 1; continue; }
    rows.push({ key, value });
    i += 1;
  }
  return { rows, body: text.slice(m[0].length) };
}

function renderFrontmatter(rows) {
  const out = ["---"];
  for (const r of rows) {
    if (r.raw !== undefined) out.push(r.raw);
    else {
      // JSON-quote every scalar value: folded workflow blocks often contain
      // ": " sequences that would otherwise break YAML (nested compact mapping).
      out.push(`${r.key}: ${JSON.stringify(String(r.value ?? ""))}`);
    }
  }
  out.push("---");
  return out.join("\n") + "\n";
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const skills = manifest.skills.filter((s) => s.importable);
  let imported = 0, existing = 0, failed = 0, skippedTool = manifest.skills.length - skills.length;
  for (const skill of skills) {
    const srcDir = join(ACCIO, skill.name);
    const dstDir = join(TARGET, skill.name);
    const srcMd = join(srcDir, "SKILL.md");
    if (!existsSync(srcMd)) { console.error(`[missing-source] ${skill.name}`); failed += 1; continue; }
    if (existsSync(join(dstDir, "SKILL.md"))) { existing += 1; console.log(`[exists] ${skill.name}`); continue; }
    try {
      await mkdir(dstDir, { recursive: true });
      await cp(srcDir, dstDir, { recursive: true, filter: (src) => !src.includes(`${skill.name}/scripts`) && !src.includes(`${skill.name}/cli.py`) });
      const raw = await readFile(join(dstDir, "SKILL.md"), "utf8");
      const { rows, body } = parseFrontmatter(raw);
      const out = [];
      let insertedTitle = false;
      for (const r of rows) {
        out.push(r);
        if (r.key === "name" && !insertedTitle) { out.push({ key: "title", value: skill.title }); insertedTitle = true; }
      }
      if (!insertedTitle) out.unshift({ key: "title", value: skill.title });
      const rebuilt = renderFrontmatter(out) + body;
      await writeFile(join(dstDir, "SKILL.md"), rebuilt, "utf8");
      imported += 1;
      console.log(`[imported] ${skill.name} -> ${skill.title} (${skill.categoryTitle})`);
    } catch (e) {
      console.error(`[failed] ${skill.name}: ${e.message}`);
      failed += 1;
    }
  }
  console.log(`\nDONE imported=${imported} existing=${existing} failed=${failed} skippedToolBacked=${skippedTool}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
