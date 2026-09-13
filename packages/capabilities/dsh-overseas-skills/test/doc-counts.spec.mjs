/**
 * R1：README 的计数**不再手写**（2026-09-13 建立）。
 *
 * ## 为什么需要这个文件
 *
 * README 里有一张「页面报什么数」表。它是**页面读数的上游**：任何人引用
 * 「出海技能 222 条」都来自它。而它是手写的，于是实测漂移成
 * `223 / 14 / 30 / 253 / 32 tests` 却**连续若干次提交无人发现** ——
 * 每一次引用都在一个错的基线上做决策。
 *
 * 「把数字改对」不是修复；**「让数字不能再漂」才是**。故本文件把表里的每个数字
 * 与产出它们的代码逐项对照。
 *
 * ## 判据为什么必须写成「找不到就红」
 *
 * 本仓库反复出现的假绿灯形态是「**没东西可查 ≠ 查过了没问题**」。一个正则
 * 抽不到数字就 `return` 的检查，会在有人改写 README 措辞的那天**静默变成空转**，
 * 而它仍然报绿。故下面每条抽取都断言「必须恰好抽到 N 处」，
 * 措辞改了、行删了、表格重排了 —— 一律红，逼人来看一眼。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

const README = read("README.md");
const MANIFEST = JSON.parse(read("manifest/role-assignments.json"));
const { SKILLS, SKILLS_FS, CATEGORIES } = await import("../lib/catalog.js");

/** 在 README 里按正则抽一个数字，并**断言恰好抽到 `exactly` 处**。 */
function grab(label, re, exactly = 1) {
  // ⚠️ `String.matchAll` 要求带 `g` 的正则；在**这里**补，而不是指望每个调用点都记得 ——
  //    第一版就是漏了，7 条用例全部以 TypeError 失败（不是断言失败，是根本没跑起来）。
  const g = re.flags.includes("g") ? re : new RegExp(re.source, re.flags + "g");
  const all = [...README.matchAll(g)];
  assert.equal(
    all.length,
    exactly,
    `README 里「${label}」应恰好命中 ${exactly} 处，实得 ${all.length} 处。` +
      `\n  ⇒ 抽不到不代表「没问题」，只代表**这个检查已经空转**：` +
      `要么措辞改了，要么那段被删了。请同步本文件与 README。`
  );
  return Number(all[0][1]);
}

// --- 目录侧：lib/catalog.js 是数字的产出地 ---------------------------------

test("R1 目录：README 写的技能卡数 == lib/catalog.js 的 SKILLS 条数", () => {
  const doc = grab("技能卡 N", /\| 技能卡 \| (\d+) \|/);
  assert.equal(doc, SKILLS.length);
});

test("R1 目录：README 的 AI全栈条数 == SKILLS_FS 条数（出现 2 处，两处都要对）", () => {
  // 「那 30 条没有场景轴」与结构表里的「+ AI全栈 30 项」
  const a = grab("AI全栈条数（分组视图那句）", /保持原有分组视图——那 (\d+) 条没有场景轴/);
  const b = grab("AI全栈条数（结构表）", /\+\s*AI全栈 (\d+) 项/);
  assert.equal(a, SKILLS_FS.length);
  assert.equal(b, SKILLS_FS.length);
  // 两处若被改成不一致的值，上面两条各自仍可能对；故显式再断言一次
  assert.equal(a, b, "README 里两处 AI全栈条数不一致");
});

test("R1 目录：README 开头的「N 项」== SKILLS 条数", () => {
  const doc = grab("开头的总项数", /导入的跨境电商技能目录（\d+ 大场景 \/ \d+ 细分 \/\s*\n(\d+) 项）/);
  assert.equal(doc, SKILLS.length);
});

test("R1 目录：README 的「N 大场景 / M 细分」== CATEGORIES 实测", () => {
  const [scen, subs] = [...README.matchAll(/（(\d+) 大场景 \/ (\d+) 细分 \//g)][0].slice(1).map(Number);
  assert.equal(scen, CATEGORIES.length);
  assert.equal(
    subs,
    CATEGORIES.reduce((n, c) => n + (c.subs || []).length, 0)
  );
});

// --- 归位侧：manifest 是数字的产出地 ---------------------------------------

test("R1 归位：README 的归位表条数 == manifest 的 skills 条数", () => {
  const doc = grab("归位判定事实源的条数", /归位判定的唯一事实源\*\*：(\d+) 条技能/);
  assert.equal(doc, Object.keys(MANIFEST.skills).length);
  assert.equal(doc, MANIFEST.coverage.skills, "README、manifest.skills、coverage.skills 三者不一致");
});

test("R1 归位：README 的「未归岗 M」== coverage.without_roles", () => {
  const m = [...README.matchAll(/\| 归位 \/ 未归岗 \| (\d+) \/ (\d+) \|/g)];
  assert.equal(m.length, 1, `README 的归位/未归岗行应恰好 1 处，实得 ${m.length} 处`);
  const [, assigned, unassigned] = m[0].map(Number);
  // 页面口径（buildOrgTree 的 cardsAssigned / cardsUnassigned）只在**出海目录**上算，
  // 即 SKILLS 而非全 253 条。故分母用 SKILLS，避免把两个口径混起来。
  assert.equal(
    assigned + unassigned,
    SKILLS.length,
    "归位 + 未归岗必须等于技能卡数 —— 否则这一步用的不是同一批卡"
  );
  assert.equal(unassigned, SKILLS.length - assigned);
});

test("R1 归位：manifest.coverage 自身自洽（分子分母同口径）", () => {
  const c = MANIFEST.coverage;
  assert.equal(c.with_roles + c.without_roles, c.skills, "有岗 + 无岗 != 总数");
  assert.ok(c.role_ids_with_supply > 0 && c.role_ids_with_supply <= 50);
});

// --- 测试条数：README 自己声明了一个会腐烂的数字 ---------------------------

test("R1 测试条数：README 写的 N 项 == test/*.spec.mjs 里 test(...) 的实际条数", () => {
  const doc = grab("测试条数", /node --test（(\d+) 项）/);

  const files = readdirSync(path.join(ROOT, "test")).filter((f) => f.endsWith(".spec.mjs"));
  assert.ok(files.length > 0, "test/ 下没有找到 .spec.mjs —— 检查已空转");
  let n = 0;
  for (const f of files) {
    // ⚠️ 只数**顶层** `test("` 调用（行首无缩进）。本仓库的用例都是扁平的；
    //    若将来有人用循环批量生成用例，这个计数会偏小并**报红** ——
    //    那正是想要的：届时请改成从 runner 输出取，而不是把断言删掉。
    n += read(path.join("test", f)).split("\n").filter((l) => /^test\(/.test(l)).length;
  }
  assert.equal(
    doc,
    n,
    `README 写 ${doc} 项，实测 ${n} 项。` +
      `\n  ⚠️ 本用例数的是「行首的 test( 调用」，不含本文件以外动态生成的用例。` +
      `\n  请以 \`npm test\` 输出的 \`ℹ tests N\` 为准核对后同步 README。`
  );
});
