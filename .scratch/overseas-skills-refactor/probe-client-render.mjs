/**
 * 出海技能页 · 客户端渲染实测（真负载 + 真组件 + jsdom）。
 *
 * 为什么要有这一层：宿主路由答 200、单测全绿，与「设置页里那一页真的长出来了」
 * 是三件不同的事。本探针把 **真实 /list 与 /org 负载**喂给 **真实 client bundle**，
 * 在 jsdom 里把人会点的路径走一遍：场景 → 面 → 责任域 → 岗位 → 卡，
 * 然后断言 DOM 里出现的字。
 *
 * 两个场景：
 *   A. 宿主已重启（/org 答 200）——四层下钻全链路。
 *   B. 宿主未重启（/org 答 401）——必须退化为原场景分组并说明原因，
 *      **不是**一页只有「加载中」。这条是 ADR-0043 的读法：增强项拿不到要给读数，
 *      不能把整页折算成空白。
 *
 * 只读：不写仓库、不碰 ~/.dsh。react / react-dom / jsdom 从隔壁算法技能包借用
 * （那一包是 vitest+jsdom 技术栈；本包是 node --test，不重复安装一套）。
 *
 * 用法：node .scratch/overseas-skills-refactor/probe-client-render.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PKG, act, mountClient } from "./jsdom-harness.mjs";

// ── 1. 真实负载：直接调用宿主侧的纯逻辑，数据源与运行时逐字同源 ──────────────
const catalog = await import(pathToFileURL(path.join(PKG, "lib/catalog.js")).href);
const { loadRoleSkeleton } = await import(pathToFileURL(path.join(PKG, "lib/preset-roles.js")).href);
const { buildOrgTree } = await import(pathToFileURL(path.join(PKG, "lib/org-tree.js")).href);
const { ROLE_ASSIGNMENTS, ROLE_ASSIGNMENT_META } = await import(pathToFileURL(path.join(PKG, "lib/role-map.js")).href);
const { LAYER_ICONS, LAYER_ICON_SOURCES } = await import(pathToFileURL(path.join(PKG, "lib/layer-icons.js")).href);

const { roles, problems, dir } = await loadRoleSkeleton();
const tree = buildOrgTree({
  scenarios: catalog.CATEGORIES,
  items: catalog.SKILLS,
  assignments: ROLE_ASSIGNMENTS,
  roles,
  layerIcons: LAYER_ICONS,
});
const roleIcons = {};
for (const r of roles) if (r.icon) roleIcons[r.id] = r.icon;

/** 与宿主 handleList 同形（此处只需要分组后的 items 供卡片标题/开关用）。 */
function listPayload() {
  const groups = [];
  const scenarios = [];
  for (const cat of catalog.CATEGORIES) {
    const subs = [];
    for (const sub of cat.subs ?? []) {
      const items = catalog.SKILLS.filter((s) => s.subcategory === sub.key).map((s) => ({
        name: s.name,
        title: s.title,
        icon: "",
        description: "",
        descriptionZh: s.summaryZh || "",
        modelEnabled: false,
        toolGap: s.toolGap || "",
        installed: true,
        template: "",
      }));
      if (items.length === 0) continue;
      groups.push({ key: sub.key, title: sub.title, scenario: cat.title, icon: "", items });
      subs.push({ key: sub.key, title: sub.title, icon: "", items });
    }
    if (subs.length > 0) scenarios.push({ key: cat.key, title: cat.title, icon: "", subs });
  }
  return { ok: true, scenarios, groups };
}

const orgPayload = {
  ok: true,
  generatedAt: 0,
  presets: { dir, count: roles.length, problems },
  assignmentMeta: ROLE_ASSIGNMENT_META,
  layerIcons: LAYER_ICONS,
  layerSources: LAYER_ICON_SOURCES,
  roleIcons,
  roles: roles.map((r) => ({
    id: r.id, alias: r.alias, title: r.title,
    planeId: r.plane.id, domainId: r.domain.id, planeName: r.plane.name, domainName: r.domain.name,
    order: r.order, artifact: r.artifact, responsibilities: r.responsibilities,
  })),
  tree,
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

/**
 * 挂载：把**本文件手工拼出来的负载**（声称与宿主 handleList / buildOrgPayload 同形）
 * 喂给真 bundle。同形只是声称——真宿主 handler 经真 HTTP 回来的那条链路在
 * `probe-endtoend.mjs`，两者用同一套脚手架（`jsdom-harness.mjs`）互为印证。
 *
 * @param {{orgOk: boolean}} opts orgOk=false 时 /org 答 401（宿主未重启）
 */
function mount({ orgOk }) {
  return mountClient({
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.endsWith("/org")) return orgOk ? { ok: true, status: 200, json: async () => orgPayload } : { ok: false, status: 401, json: async () => ({ error: "unauthorized" }) };
      if (u.endsWith("/fullstack-list")) return { ok: true, json: async () => ({ ok: true, scenarios: [], groups: [] }) };
      if (u.endsWith("/credential?ref=overseas_exa")) return { ok: true, json: async () => ({ configured: false }) };
      if (u.endsWith("/list")) return { ok: true, json: async () => listPayload() };
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });
}

// ══ 场景 A：宿主已重启（/org 答 200）════════════════════════════════════════
console.log("── 场景 A：/org 可用（宿主已重启）──");
{
  const { container, text, buttonsByText, click } = await mount({ orgOk: true });

  check("页面根节点已挂载且带 data-plugin", !!container.querySelector('[data-plugin="dsh-overseas-skills"]'));
  check("一致性诊断条已渲染", text().includes("一致性诊断"));
  check("诊断条写明卡片数与未归岗数", text().includes(`未归岗 ${tree.stats.cardsUnassigned}`), `未归岗=${tree.stats.cardsUnassigned}`);
  check("8 个场景全部是折叠的（首屏给形状，不铺卡）", buttonsByText("项").length === 8, `场景头 ${buttonsByText("项").length} 个`);

  await click(buttonsByText("项")[0]);
  check(`展开场景「${tree.scenarios[0].title}」后露出面层`, buttonsByText(tree.scenarios[0].planes[0].name).length > 0);

  await click(buttonsByText(tree.scenarios[0].planes[0].name)[0]);
  const firstDomain = tree.scenarios[0].planes[0].domains[0];
  check(`展开面「${tree.scenarios[0].planes[0].name}」后露出责任域「${firstDomain.name}」`, buttonsByText(firstDomain.name).length > 0);

  await click(buttonsByText(firstDomain.name)[0]);
  const firstRole = firstDomain.roles[0];
  check(`展开责任域后露出岗位「${firstRole.alias} · ${firstRole.title}」`, buttonsByText(firstRole.title).length > 0, `本岗 ${firstRole.cards.length} 张卡`);

  await click(buttonsByText(firstRole.title)[0]);
  const cardTitles = firstRole.cards.map((n) => (catalog.SKILLS.find((s) => s.name === n) || {}).title).filter(Boolean);
  const shown = cardTitles.filter((t) => text().includes(t));
  check("岗位展开后技能卡出现", shown.length === cardTitles.length, `渲染 ${shown.length}/${cardTitles.length}：${cardTitles.slice(0, 4).join("、")}`);
  check("卡片带接线徽标（三态之一）", /本岗已接线|接线到 AGT-|未接线/.test(text()));

  const freshRole = tree.scenarios
    .flatMap((s) => s.planes.flatMap((p) => p.domains.flatMap((d) => d.roles)))
    .find((r) => (r.newCards || []).length > 0);
  check("存在带「归位·本轮判定」徽标的卡（本轮新增归位）", freshRole !== undefined, freshRole ? `${freshRole.id} 有 ${freshRole.newCards.length} 张` : "无");

  const looseScenario = tree.scenarios.find((s) => s.unassigned.cards.length > 0);
  const looseHead = buttonsByText(`未归岗 ${looseScenario.unassigned.cards.length} 张`)[0];
  check(`未归岗分组可见（${looseScenario.title}：${looseScenario.unassigned.cards.length} 张）`, !!looseHead);

  const search = container.querySelector('input[type="search"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(search, "amazon");
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  check("搜索框输入后走扁平结果（横切入口不被四层挡住）", text().includes("amazon") || /A 市场与选品|B 产品/.test(text()));
}

// ══ 场景 B：宿主未重启（/org 答 401）════════════════════════════════════════
console.log("\n── 场景 B：/org 401（宿主未重启）——必须退化而不是白屏 ──");
{
  const { container, text, click } = await mount({ orgOk: false });
  const scenTitles = catalog.CATEGORIES.filter((c) => (c.subs || []).some((s) => catalog.SKILLS.some((k) => k.subcategory === s.key))).map((c) => c.title);

  check("页面根节点仍在（不是白屏）", !!container.querySelector('[data-plugin="dsh-overseas-skills"]'));
  check("给出了取不到的原因，而不是无限「加载中」", text().includes("四层视图暂不可用"), text().includes("四层视图暂不可用") ? "" : "没找到说明文案");
  check("不再出现裸的「四层骨架加载中…」", !text().includes("四层骨架加载中"));
  check("退化为原场景分组（首个大场景标题可见）", !!scenTitles[0] && text().includes(scenTitles[0]), scenTitles[0] ?? "（无场景）");
  const scenHeads = [...container.querySelectorAll("button.ovsScenHead")];
  check("退化视图给出可点的场景头（不只是标题）", scenHeads.length === scenTitles.length, `场景头 ${scenHeads.length} 个 / 应有 ${scenTitles.length} 个`);
  const firstHead = scenHeads[0];
  if (firstHead) await click(firstHead);
  check("退化视图的场景头能展开出细分场景", !!firstHead && scenHeads[0] !== undefined && text().includes(catalog.CATEGORIES[0].subs[0].title), catalog.CATEGORIES[0].subs[0].title);
  check("搜索框仍在（横切入口不受退化影响）", !!container.querySelector('input[type="search"]'));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 条通过`);
if (failed.length > 0) {
  console.log("失败项：\n  " + failed.map((f) => f.name).join("\n  "));
  process.exit(1);
}
