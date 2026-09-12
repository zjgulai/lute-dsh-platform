import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrgTree, wiringStatus } from "../lib/org-tree.js";

/**
 * dsh-overseas-skills — 四层骨架（场景 → 面 → 责任域 → 岗位 → 卡）的契约测试。
 *
 * 这里锁的是**页面要对用户说的话**，每一条都对应一次真实的设计约束：
 *  - 一技多岗：卡片数 ≠ 行数，两个数都得对
 *  - 零卡岗位：不许因为「没有卡」就从世界上消失
 *  - 未归岗技能：不许静默丢掉（它们是语料的欠账，必须被看见）
 *  - 归位 ≠ 接线：挂在本岗下不代表本岗 preset 真挂载了它
 *  - 词表外的岗位 id：忽略，绝不凭空造岗
 */

const scenarios = [
  {
    key: "a-market",
    title: "A 市场与选品",
    icon: "data:icon-a",
    subs: [{ key: "a1-market-trend", title: "市场调研与趋势" }],
  },
  {
    key: "h-enable",
    title: "H 组织与工具",
    icon: "data:icon-h",
    subs: [{ key: "h1-docs", title: "文档" }],
  },
];

const items = [
  { name: "trend-scout", category: "a-market", subcategory: "a1-market-trend" },
  { name: "supplier-sourcing", category: "a-market", subcategory: "a1-market-trend" },
  { name: "docx", category: "h-enable", subcategory: "h1-docs" },
];

const roles = [
  {
    id: "AGT-014",
    alias: "砺器",
    title: "供应与采购",
    plane: { id: "PLN-OPS", name: "业务运营" },
    domain: { id: "DOM-03", name: "供应与履约" },
    order: 2201,
    icon: "data:icon-agt014",
    artifact: "采购行动包",
    wired: ["supplier-sourcing"],
  },
  {
    id: "AGT-025",
    alias: "联商",
    title: "零售渠道与B2B拓展",
    plane: { id: "PLN-OPS", name: "业务运营" },
    domain: { id: "DOM-04", name: "渠道经营" },
    order: 2305,
    icon: "data:icon-agt025",
    artifact: "渠道方案",
    wired: ["docx"], // 接线了「未归本岗」的卡：归位与接线不一致的证据
  },
  {
    id: "AGT-007",
    alias: "观星",
    title: "市场与竞品研究",
    plane: { id: "PLN-OPS", name: "业务运营" },
    domain: { id: "DOM-02", name: "产品与创新" },
    order: 2102,
    icon: "data:icon-agt007",
    artifact: "研究简报",
    wired: ["trend-scout"],
  },
];

const assignments = {
  // 一技多岗：同时归 007 与 025
  "trend-scout": {
    roles: [
      { id: "AGT-007", source: "skill-map" },
      { id: "AGT-025", source: "assigned" },
    ],
  },
  "supplier-sourcing": { roles: [{ id: "AGT-014", source: "skill-map" }] },
  // 未归岗
  docx: { roles: [], no_role_kind: "TOOL_ONLY", no_role_reason: "纯格式工具" },
};

/** 取一个岗位节点；找不到直接断言失败（同时让 tsc 收窄类型）。 */
function roleNodeOf(tree, scenarioKey, roleId) {
  const sc = tree.scenarios.find((s) => s.key === scenarioKey);
  assert.ok(sc, `场景 ${scenarioKey} 必须在树里`);
  const node = sc.planes.flatMap((p) => p.domains.flatMap((d) => d.roles)).find((r) => r.id === roleId);
  assert.ok(node, `岗位 ${roleId} 必须在 ${scenarioKey} 下`);
  return node;
}

const layerIcons = { "PLN-OPS": "data:icon-pln-ops", "DOM-03": "data:icon-dom-03" };

test("buildOrgTree：场景 → 面 → 责任域 → 岗位 四层都带着应有的计数", () => {
  const tree = buildOrgTree({ scenarios, items, assignments, roles, layerIcons });
  const market = tree.scenarios.find((s) => s.key === "a-market");
  assert.ok(market, "A 场景必须在树里");
  assert.equal(market.total, 2, "A 场景共 2 张卡");
  const ops = market.planes.find((p) => p.id === "PLN-OPS");
  assert.ok(ops, "业务运营面必须在 A 场景下");
  assert.equal(ops.roleCount, 3, "A 场景下有卡的岗位：AGT-007 / AGT-014 / AGT-025");
  const domains = ops.domains.map((d) => d.id);
  assert.deepEqual(domains, ["DOM-02", "DOM-03", "DOM-04"], "责任域按 id 排序");
  const dom02 = ops.domains[0];
  assert.equal(dom02.roles[0].id, "AGT-007");
  assert.deepEqual(dom02.roles[0].cards, ["trend-scout"]);
});

test("buildOrgTree：同一张卡挂在两个岗位下 → 行数大于卡片数，且两个数都对", () => {
  const tree = buildOrgTree({ scenarios, items, assignments, roles, layerIcons });
  const market = tree.scenarios.find((s) => s.key === "a-market");
  assert.ok(market, "A 场景必须在树里");
  const roleIds = market.planes.flatMap((p) => p.domains.flatMap((d) => d.roles.map((r) => r.id)));
  assert.deepEqual(roleIds, ["AGT-007", "AGT-014", "AGT-025"], "两个岗位都该有 trend-scout");
  assert.equal(tree.stats.cards, 3);
  assert.equal(tree.stats.cardsAssigned, 2);
  assert.equal(tree.stats.rows, 3, "trend-scout 出现两次（007 与 025），supplier 一次");
});

test("buildOrgTree：零卡岗位进 zeroCardRoles，不从统计里消失", () => {
  const tree = buildOrgTree({ scenarios, items, assignments, roles, layerIcons });
  // 本夹具里 AGT-025 其实有卡（trend-scout）；换一组数据让它真的空
  const empty = buildOrgTree({
    scenarios,
    items,
    assignments: { "trend-scout": { roles: [{ id: "AGT-007" }] }, "supplier-sourcing": { roles: [{ id: "AGT-014" }] } },
    roles,
    layerIcons,
  });
  assert.deepEqual(empty.zeroCardRoles.map((r) => r.id), ["AGT-025"]);
  assert.equal(empty.stats.rolesWithCards, 2);
  assert.equal(tree.zeroCardRoles.length, 0);
  assert.equal(tree.stats.rolesWithCards, 3);
});

test("buildOrgTree：未归岗技能按场景进 unassigned，带类别计数，不许丢", () => {
  const tree = buildOrgTree({ scenarios, items, assignments, roles, layerIcons });
  const enable = tree.scenarios.find((s) => s.key === "h-enable");
  assert.ok(enable, "只有未归岗技能的场景也必须出现（否则那些卡等于不存在）");
  assert.deepEqual(enable.unassigned.cards, ["docx"]);
  assert.deepEqual(enable.unassigned.kinds, { TOOL_ONLY: 1 });
  assert.equal(enable.planes.length, 0);
  assert.equal(tree.stats.cardsUnassigned, 1);
});

test("buildOrgTree：词表外的岗位 id 被忽略，绝不凭空造岗", () => {
  const tree = buildOrgTree({
    scenarios,
    items,
    assignments: { "trend-scout": { roles: [{ id: "AGT-999" }, { id: "AGT-007" }] } },
    roles,
    layerIcons,
  });
  const ids = tree.scenarios.flatMap((s) => s.planes.flatMap((p) => p.domains.flatMap((d) => d.roles.map((r) => r.id))));
  assert.deepEqual(ids, ["AGT-007"]);
});

test("buildOrgTree：归位来源分得清（既有映射 vs 本轮判定）", () => {
  const tree = buildOrgTree({ scenarios, items, assignments, roles, layerIcons });
  const g007 = roleNodeOf(tree, "a-market", "AGT-007");
  const g025 = roleNodeOf(tree, "a-market", "AGT-025");
  assert.deepEqual(g007.newCards, [], "007 的归位来自既有映射，不算本轮新增");
  assert.deepEqual(g025.newCards, ["trend-scout"], "025 的归位是本轮判定新增的");
});

test("wiringStatus：本岗已接线 / 接线到别岗 / 未接线 三态互斥", () => {
  const tree = buildOrgTree({ scenarios, items, assignments, roles, layerIcons });
  assert.deepEqual(wiringStatus("supplier-sourcing", "AGT-014", tree.wiredIndex), { kind: "self", roleIds: [] });
  assert.deepEqual(wiringStatus("trend-scout", "AGT-025", tree.wiredIndex), { kind: "other", roleIds: ["AGT-007"] });
  assert.deepEqual(wiringStatus("nothing-skill", "AGT-014", tree.wiredIndex), { kind: "none", roleIds: [] });
});

test("buildOrgTree：preset 挂了但未归本岗的卡 → wiredOnlyByRole 如实列出，不混进归位名单", () => {
  const tree = buildOrgTree({ scenarios, items, assignments, roles, layerIcons });
  assert.deepEqual(tree.wiredOnlyByRole["AGT-025"], ["docx"], "接线与归位不一致必须在全局账上可见");
  assert.equal(tree.wiredOnlyByRole["AGT-014"], undefined, "014 的接线卡都归它，没有多余项");
  const g025 = roleNodeOf(tree, "a-market", "AGT-025");
  assert.deepEqual(g025.wired, [], "docx 是接线卡但不是归位卡，不能进 wired");
  assert.equal(g025.wiredOnly, undefined, "岗位节点不重复携带全局名单（8 个场景会复制 8 份）");
  const g014 = roleNodeOf(tree, "a-market", "AGT-014");
  assert.deepEqual(g014.wired, ["supplier-sourcing"]);
});

test("buildOrgTree：空输入不炸，计数全零", () => {
  const tree = buildOrgTree({ scenarios: [], items: [], assignments: {}, roles: [], layerIcons: {} });
  assert.deepEqual(tree.scenarios, []);
  assert.equal(tree.stats.cards, 0);
  assert.equal(tree.stats.rows, 0);
  assert.deepEqual(tree.zeroCardRoles, []);
});
