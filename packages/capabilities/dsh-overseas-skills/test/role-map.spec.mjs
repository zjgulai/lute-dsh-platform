import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_ASSIGNMENTS, ROLE_ASSIGNMENT_META } from "../lib/role-map.js";

/**
 * 归位表的「产物 vs 事实源」契约。
 *
 * `manifest/role-assignments.json` 是事实源（人可读、可 diff、带证据），
 * `lib/role-map.js` 是宿主 import 的构建产物。两者一旦不同步，页面会安静地
 * 按旧判定渲染——没有任何红灯，只有数字悄悄变了。所以这里锁三件事：
 *
 *  1. 每个技能都有记录，且 `roles` 里的岗位 id 形状合法（AGT-NNN）；
 *  2. `source` 只能是 skill-map / assigned，`role` 为空时必须给 noRoleKind；
 *  3. 跑生成器的 --check：它自己会断言 lib 是 manifest 的精确投影。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const BUILD = join(PKG, "scripts", "build_role_map.py");
const MANIFEST = join(PKG, "manifest", "role-assignments.json");

test("归位表：形状合法（岗位 id / source / 无岗必须给分型）", () => {
  const names = Object.keys(ROLE_ASSIGNMENTS);
  assert.ok(names.length >= 250, `技能条数异常：${names.length}`);
  const sources = new Set(["skill-map", "assigned"]);
  const kinds = new Set(["GENERIC_METHOD", "TOOL_ONLY", "OUT_OF_SCOPE", "OTHER"]);
  for (const [name, rec] of Object.entries(ROLE_ASSIGNMENTS)) {
    for (const r of rec.roles) {
      assert.match(r.id, /^AGT-\d{3}$/, `${name}: 岗位 id 形状不对 ${r.id}`);
      assert.ok(sources.has(r.source), `${name}/${r.id}: source 非法 ${r.source}`);
    }
    const ids = rec.roles.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `${name}: 同一岗位重复挂载`);
    if (rec.roles.length === 0) {
      const kind = rec.noRoleKind;
      assert.ok(kind !== null && kinds.has(kind), `${name}: 无岗却没给合法分型（${kind}）`);
    }
  }
});

test("归位表：meta 计数与 manifest 的 coverage 一致", () => {
  assert.ok(Number.isInteger(ROLE_ASSIGNMENT_META.skills), "缺 skills 计数");
  assert.equal(
    ROLE_ASSIGNMENT_META.withRoles + ROLE_ASSIGNMENT_META.withoutRoles,
    ROLE_ASSIGNMENT_META.skills,
    "有岗 + 无岗必须等于总数"
  );
  assert.equal(Object.keys(ROLE_ASSIGNMENTS).length, ROLE_ASSIGNMENT_META.skills);
});

test("归位表：lib/role-map.js 是 manifest 的精确投影（跑生成器的 --check）", { skip: !existsSync(MANIFEST) ? "manifest 缺失" : false }, () => {
  const out = execFileSync("python3", [BUILD, "--check"], { cwd: PKG, encoding: "utf8" });
  assert.match(out, /与 manifest 一致/, `生成器 --check 的输出不合预期：${out}`);
});
