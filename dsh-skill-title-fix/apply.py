#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DSH skill `title` (display name) rollout — surgical patch of the built checkout.
Each (old, new) pair must match EXACTLY once per file. No-op reports make drift visible.
"""
import sys

ROOT = "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai"

# relpath -> list of (label, old, new)
EDITS = {
    "dsh-skill/lib/index.js": [
        ("runtimeCandidate passthrough",
         "\t\tname: skill.name,\n\t\tdescription: skill.description,\n\t\t...skill.whenToUse !== void 0 ? { whenToUse: skill.whenToUse } : {},",
         "\t\tname: skill.name,\n\t\tdescription: skill.description,\n\t\t...skill.title !== void 0 ? { title: skill.title } : {},\n\t\t...skill.whenToUse !== void 0 ? { whenToUse: skill.whenToUse } : {},"),
        ("toSummary destructure+emit",
         "\tconst { name, description, whenToUse, invocation, source, provider, resourceBase } = skill;\n\treturn {\n\t\tname,\n\t\tdescription,\n\t\t...whenToUse !== void 0 ? { whenToUse } : {},",
         "\tconst { name, title, description, whenToUse, invocation, source, provider, resourceBase } = skill;\n\treturn {\n\t\tname,\n\t\tdescription,\n\t\t...title !== void 0 ? { title } : {},\n\t\t...whenToUse !== void 0 ? { whenToUse } : {},"),
        ("validateCandidate title check",
         "\tif (candidate.whenToUse !== void 0 && typeof candidate.whenToUse !== \"string\") throw new TypeError(`skill provider \"${providerName}\" returned skill \"${candidate.name}\" with a non-string whenToUse`);",
         "\tif (candidate.title !== void 0 && typeof candidate.title !== \"string\") throw new TypeError(`skill provider \"${providerName}\" returned skill \"${candidate.name}\" with a non-string title`);\n\tif (candidate.whenToUse !== void 0 && typeof candidate.whenToUse !== \"string\") throw new TypeError(`skill provider \"${providerName}\" returned skill \"${candidate.name}\" with a non-string whenToUse`);"),
        ("validateRuntimeSkill title check",
         "\tif (skill.description.length === 0) throw new Error(`skill \"${skill.name}\" requires a description`);\n\tvalidateInvocation(skill.invocation, `runtime skill \"${skill.name}\"`);",
         "\tif (skill.description.length === 0) throw new Error(`skill \"${skill.name}\" requires a description`);\n\tif (skill.title !== void 0 && typeof skill.title !== \"string\") throw new TypeError(`runtime skill \"${skill.name}\" title must be a string`);\n\tvalidateInvocation(skill.invocation, `runtime skill \"${skill.name}\"`);"),
        ("validateDefinition destructure title",
         "\tconst name = skill.name;\n\tconst description = skill.description;\n\tconst whenToUse = skill.whenToUse;",
         "\tconst name = skill.name;\n\tconst description = skill.description;\n\tconst title = skill.title;\n\tconst whenToUse = skill.whenToUse;"),
        ("validateDefinition title check",
         "\tif (description.length === 0) throw new Error(`loaded skill \"${name}\" requires a description`);\n\tvalidateInvocation(invocation, `loaded skill \"${name}\"`);",
         "\tif (description.length === 0) throw new Error(`loaded skill \"${name}\" requires a description`);\n\tif (title !== void 0 && typeof title !== \"string\") throw new TypeError(`loaded skill \"${name}\" title must be a string`);\n\tvalidateInvocation(invocation, `loaded skill \"${name}\"`);"),
    ],
    "dsh-skill-filesystem/lib/index.js": [
        ("parseSkillFile title",
         "\t\tname,\n\t\tdescription,\n\t\t...optionalString(parsed.data, \"whenToUse\"),",
         "\t\tname,\n\t\tdescription,\n\t\t...optionalString(parsed.data, \"title\"),\n\t\t...optionalString(parsed.data, \"whenToUse\"),"),
        ("discoverRoot title",
         "\t\t\tname: parsed.name,\n\t\t\tdescription: parsed.description,\n\t\t\t...parsed.whenToUse !== void 0 ? { whenToUse: parsed.whenToUse } : {},\n\t\t\tinvocation: parsed.invocation,\n\t\t\tprovider,",
         "\t\t\tname: parsed.name,\n\t\t\tdescription: parsed.description,\n\t\t\t...parsed.title !== void 0 ? { title: parsed.title } : {},\n\t\t\t...parsed.whenToUse !== void 0 ? { whenToUse: parsed.whenToUse } : {},\n\t\t\tinvocation: parsed.invocation,\n\t\t\tprovider,"),
        ("get title",
         "\t\t\tname: parsed.name,\n\t\t\tdescription: parsed.description,\n\t\t\t...parsed.whenToUse !== void 0 ? { whenToUse: parsed.whenToUse } : {},\n\t\t\tinvocation: parsed.invocation,\n\t\t\tsource: candidate.source,",
         "\t\t\tname: parsed.name,\n\t\t\tdescription: parsed.description,\n\t\t\t...parsed.title !== void 0 ? { title: parsed.title } : {},\n\t\t\t...parsed.whenToUse !== void 0 ? { whenToUse: parsed.whenToUse } : {},\n\t\t\tinvocation: parsed.invocation,\n\t\t\tsource: candidate.source,"),
    ],
    "dsh-tool-skill/lib/index.js": [
        ("catalogSourceEntries title",
         "\t\tname: skill.name,\n\t\tdescription: catalogDescription(skill.description, descriptionMaxLength)\n\t}));",
         "\t\tname: skill.name,\n\t\tdescription: catalogDescription(skill.description, descriptionMaxLength),\n\t\t...skill.title !== void 0 ? { title: skill.title } : {}\n\t}));"),
        ("renderCatalogEntries title",
         ": ${escapeText(entry.description)}",
         "${entry.title !== void 0 ? `（${escapeText(entry.title)}）` : \"\"}: ${escapeText(entry.description)}"),
        ("digestCatalogEntries title",
         "\tconst canonical = entries.map((entry) => JSON.stringify([entry.name, entry.description])).join(\"\\n\");",
         "\tconst canonical = entries.map((entry) => JSON.stringify([entry.name, entry.title ?? null, entry.description])).join(\"\\n\");"),
        ("readCatalogEntries title",
         "\t\tconst { name, description } = entry;\n\t\tif (typeof name !== \"string\" || name === \"\" || typeof description !== \"string\") return void 0;\n\t\treadable.push({\n\t\t\tname,\n\t\t\tdescription\n\t\t});",
         "\t\tconst { name, description, title } = entry;\n\t\tif (typeof name !== \"string\" || name === \"\" || typeof description !== \"string\") return void 0;\n\t\tif (title !== void 0 && typeof title !== \"string\") return void 0;\n\t\treadable.push({\n\t\t\tname,\n\t\t\tdescription,\n\t\t\t...title !== void 0 ? { title } : {}\n\t\t});"),
    ],
    "dsh-api-session-controller/lib/index.js": [
        ("list() map title",
         "\t\t\t\t\tname: skill.name,\n\t\t\t\t\tdescription: skill.description,\n\t\t\t\t\t...skill.whenToUse === void 0 ? {} : { whenToUse: skill.whenToUse },\n\t\t\t\t\tmodelInvocable: skill.invocation.modelInvocable",
         "\t\t\t\t\tname: skill.name,\n\t\t\t\t\tdescription: skill.description,\n\t\t\t\t\t...skill.title === void 0 ? {} : { title: skill.title },\n\t\t\t\t\t...skill.whenToUse === void 0 ? {} : { whenToUse: skill.whenToUse },\n\t\t\t\t\tmodelInvocable: skill.invocation.modelInvocable"),
    ],
    "dsh-api-session-controller/lib/types/skill-catalog.js": [
        ("list() map title (source copy)",
         "                        name: skill.name,\n                        description: skill.description,\n                        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },\n                        modelInvocable: skill.invocation.modelInvocable,",
         "                        name: skill.name,\n                        description: skill.description,\n                        ...skill.title === undefined ? {} : { title: skill.title },\n                        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },\n                        modelInvocable: skill.invocation.modelInvocable,"),
    ],
    "dsh-api-session-controller/lib/typert.host.js": [
        ("zod schema title",
         "  'name': z.string().readonly(),\n  'description': z.string().readonly(),\n  'whenToUse': z.string().readonly().optional(),\n  'modelInvocable': z.boolean().readonly(),",
         "  'name': z.string().readonly(),\n  'description': z.string().readonly(),\n  'title': z.string().readonly().optional(),\n  'whenToUse': z.string().readonly().optional(),\n  'modelInvocable': z.boolean().readonly(),"),
        ("SkillEntry declaration title",
         "            \"declaration\": \"export interface SkillEntry {\\n    readonly name: string;\\n    readonly description: string;\\n    readonly whenToUse?: string;\\n    readonly modelInvocable: boolean;\\n}\"",
         "            \"declaration\": \"export interface SkillEntry {\\n    readonly name: string;\\n    readonly description: string;\\n    readonly title?: string;\\n    readonly whenToUse?: string;\\n    readonly modelInvocable: boolean;\\n}\""),
    ],
    "dsh-api-session-controller/lib/typert.remote-client.js": [
        ("zod schema title",
         "  'name': z.string().readonly(),\n  'description': z.string().readonly(),\n  'whenToUse': z.string().readonly().optional(),\n  'modelInvocable': z.boolean().readonly(),",
         "  'name': z.string().readonly(),\n  'description': z.string().readonly(),\n  'title': z.string().readonly().optional(),\n  'whenToUse': z.string().readonly().optional(),\n  'modelInvocable': z.boolean().readonly(),"),
    ],
    "dsh-api-remotes/lib/client.js": [
        ("zod schema title",
         "\t\t\t\"name\": string().readonly(),\n\t\t\t\"description\": string().readonly(),\n\t\t\t\"whenToUse\": string().readonly().optional(),\n\t\t\t\"modelInvocable\": boolean().readonly()",
         "\t\t\t\"name\": string().readonly(),\n\t\t\t\"description\": string().readonly(),\n\t\t\t\"title\": string().readonly().optional(),\n\t\t\t\"whenToUse\": string().readonly().optional(),\n\t\t\t\"modelInvocable\": boolean().readonly()"),
    ],
    "dsh-client-ui-skill/lib/client.js": [
        ("candidates filter+display",
         "\t\t\t\t\treturn skills.filter((skill) => skill.name.startsWith(query)).map((skill) => ({\n\t\t\t\t\t\tname: skill.name,\n\t\t\t\t\t\tdescription: skill.modelInvocable ? skill.description : `${t(\"menu.userOnly\")} · ${skill.description}`\n\t\t\t\t\t}));",
         "\t\t\t\t\tconst needle = query.toLowerCase();\n\t\t\t\t\treturn skills.filter((skill) => {\n\t\t\t\t\t\tif (needle.length === 0) return true;\n\t\t\t\t\t\tconst hay = [(skill.title ?? \"\"), skill.name, skill.description];\n\t\t\t\t\t\treturn hay.some((text) => text.toLowerCase().includes(needle));\n\t\t\t\t\t}).map((skill) => ({\n\t\t\t\t\t\tname: skill.title ?? skill.name,\n\t\t\t\t\t\tdescription: skill.modelInvocable ? skill.description : `${t(\"menu.userOnly\")} · ${skill.description}`,\n\t\t\t\t\t\tskillName: skill.name\n\t\t\t\t\t}));"),
        ("onPick identifier",
         "\t\t\t\tonPick({ candidate }) {\n\t\t\t\t\treturn { text: `/${candidate.name} ` };\n\t\t\t\t}",
         "\t\t\t\tonPick({ candidate }) {\n\t\t\t\t\treturn { text: `/${candidate.skillName ?? candidate.name} ` };\n\t\t\t\t}"),
    ],
}

def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    ok_all = True
    for rel, edits in EDITS.items():
        if only is not None and only not in rel:
            continue
        path = f"{ROOT}/{rel}"
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        file_ok = True
        for label, old, new in edits:
            c = text.count(old)
            if c == 0:
                print(f"[NOT FOUND] {rel} :: {label}")
                file_ok = False
                ok_all = False
            elif c > 1:
                print(f"[AMBIGUOUS x{c}] {rel} :: {label}")
                file_ok = False
                ok_all = False
            else:
                text = text.replace(old, new, 1)
                print(f"[OK] {rel} :: {label}")
        if file_ok:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
        else:
            print(f"[SKIP WRITE] {rel} (fix anchors first)")
    print("\nRESULT:", "ALL OK" if ok_all else "HAS FAILURES — nothing was written for failed files")

if __name__ == "__main__":
    main()
