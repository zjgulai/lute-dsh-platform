/**
 * R4：归位判定的**语义校验器**必须在包内、可复跑、且能自证会打红。
 *
 * ## 这个文件守的是什么
 *
 * 包内原有 `build_role_map.py --check` 只断言「导出物 == 源文件」。
 * 那是**一致性**，不是**正确性**：`evidence.from_skill` 被改写成一句
 * 谁都没说过的话，`--check` 照样绿。本文件把「正确性」那一层钉进 `npm test`。
 *
 * ## ⚠️ 为什么这里不做 skip
 *
 * 本仓库反复出现的假绿灯形态是「**没东西可查 ≠ 查过了没问题**」。
 * 一个在缺 python3 / 缺语料时 `skip` 的测试，会在环境变化那天
 * **静默变成空转**，而它仍然报绿。故这里一律 `assert`，
 * 缺什么就红什么 —— 宁可吵，不可静。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(PKG, "scripts", "validate_assignments.py");

/** 跑校验器，返回 { code, out }；不抛异常（退出码本身是被测对象）。 */
function run(args) {
  try {
    const out = execFileSync("python3", [SCRIPT, ...args], { cwd: PKG, encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    // ⚠️ TS 的 catch 变量是 unknown；这里显式声明形状而不是 `any`，
    //    否则 `npm run typecheck` 会报 TS18046（本文件第一版就是）。
    const err = /** @type {{ status?: number|null, stdout?: string, stderr?: string }} */ (e);
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("R4 校验器：脚本与两份数据快照都在包内（缺一样就等于没有判据）", () => {
  for (const f of ["scripts/validate_assignments.py", "manifest/role-records.json",
                   "manifest/skill-evidence-corpus.json"]) {
    assert.ok(existsSync(join(PKG, f)), `缺 ${f} —— 语义校验无法复跑`);
  }
  // 快照必须自我说明来历，否则下一个人不知道它能不能当事实源
  for (const [f, key] of [["manifest/role-records.json", "roles"],
                          ["manifest/skill-evidence-corpus.json", "skills"]]) {
    const d = JSON.parse(readFileSync(join(PKG, f), "utf8"));
    assert.ok(d._meta && d._meta.source && d._meta.generated,
      `${f} 缺 _meta.source / _meta.generated —— 快照必须能自证来历`);
    assert.ok(Object.keys(d[key]).length > 0, `${f}.${key} 为空`);
  }
});

test("R4 校验器：--selftest 自证六条判据都会打红（且合规样本不误报）", () => {
  const { code, out } = run(["--selftest"]);
  assert.equal(code, 0, `自检未通过：\n${out}`);
  assert.match(out, /SELFTEST PASS/);
  // 反向：自检**不许**在没跑用例的情况下报通过
  const n = (out.match(/^[✅❌]/gm) ?? []).length;
  assert.ok(n >= 15, `自检只跑了 ${n} 条用例 —— 用例被删了却仍报 PASS？`);
  assert.ok(!/^❌/m.test(out), `自检里有红项：\n${out}`);
});

test("R4 校验器：真 manifest 通过六条判据，且复核覆盖率如实报出", () => {
  const { code, out } = run([]);
  assert.equal(code, 0, `真 manifest 未过判据：\n${out}`);
  assert.match(out, /✓ 六条判据全部通过/);
  // 覆盖率是一等输出：低于 100% 时必须显式说「结论只覆盖被复核到的那部分」
  const m = out.match(/复核覆盖 (\d+)\/(\d+)/);
  assert.ok(m, `输出里没有覆盖率 —— 「没东西可查」不许冒充「查过了没问题」：\n${out}`);
  const [, hit, total] = m.map(Number);
  assert.ok(total > 900, `可复核断言只有 ${total} 条，语料疑似丢失`);
  if (hit < total) assert.match(out, /未达 100%/);
});

test("R4 校验器：岗位快照与运行时 preset 无漂移（--check-roles-live）", () => {
  const { code, out } = run(["--check-roles-live"]);
  // 运行时 preset 不存在时退出码 2：那是「无法比对」，不是「比对通过」。
  assert.notEqual(code, 2, `读不到运行时 preset，无法比对：\n${out}`);
  assert.equal(code, 0, `岗位词表已漂移（改 preset 后请重生成 manifest/role-records.json）：\n${out}`);
  assert.match(out, /漂移 0 条/);
});
