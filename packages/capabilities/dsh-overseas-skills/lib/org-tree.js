/**
 * 出海技能页 · 四层骨架的构建（**纯函数，无 IO**）。
 *
 * 树形：L1 场景 → L2 面 → L3 责任域 → L4 岗位 → 技能卡（只出名字，卡本体在 /list 的 items 里）。
 *
 * 三条设计约束（都来自真实的坑）：
 *  1. **归位 ≠ 接线**。卡挂在本岗下是「归位」（本模块的输入 assignment）；
 *     preset 是否真的挂载了它是「接线」（roles[].wired）。两者分开算、分开显示。
 *  2. **一技多岗**。同一个技能可以在多个岗位下都出现（岗位视图 = 工具箱），
 *     因此**卡片数 ≠ 行数**，两个计数都要如实给出。
 *  3. **零卡岗位与未归岗技能不许消失**。前者进 `stats.zeroCardRoles`，
 *     后者进 `scenarios[].unassigned`（按场景分桶）——它们没有「位置」，
 *     不给位置就等于不存在。
 */

/** 面的固定顺序（与 organization-graph 的 planes 一致）。 */
const PLANE_ORDER = ["PLN-MGT", "PLN-OPS", "PLN-CTL", "PLN-PLT"];

function byPlaneThenDomainThenOrder(a, b) {
  const pa = PLANE_ORDER.indexOf(a.plane.id);
  const pb = PLANE_ORDER.indexOf(b.plane.id);
  if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  if (a.domain.id !== b.domain.id) return a.domain.id < b.domain.id ? -1 : 1;
  return a.order - b.order;
}

/**
 * @param {object} input
 * @param {Array<{key:string,title:string,icon?:string,subs?:Array<{key:string,title:string}>}>} input.scenarios 场景目录（catalog 的 CATEGORIES）
 * @param {Array<{name:string,category:string,subcategory?:string}>} input.items 技能（catalog 的 SKILLS，扁平）
 * @param {Record<string,{roles?:Array<{id:string,source?:string}>,no_role_kind?:string|null}>} input.assignments 归位表
 * @param {Array<{id:string,alias:string,title:string,plane:{id:string,name:string},domain:{id:string,name:string},order:number,icon?:string,artifact?:string,wired?:string[],responsibilities?:string[],contractGate?:string|null,contractBound?:string[],contractPending?:string[]}>} input.roles 岗位骨架（来自 preset 清单；后三项 = S12 消费口闸门的记账）
 * @param {Record<string,string>} [input.layerIcons] 面/责任域头像（键为 PLN-xxx 与 DOM-xxx）。
 *   头像**不放进树节点**：一枚 data URI 约 4KB，8 个场景 × 12 个层节点会让负载翻十倍；
 *   页面按 id 从 `/org` 的顶层 `layerIcons` 平面 map 里查（同一条理由见 roleIcons）。
 */
export function buildOrgTree(input) {
  const scenarios = input.scenarios ?? [];
  const items = input.items ?? [];
  const assignments = input.assignments ?? {};
  const roles = (input.roles ?? []).slice().sort(byPlaneThenDomainThenOrder);
  const layerIcons = input.layerIcons ?? {};

  const roleById = new Map(roles.map((r) => [r.id, r]));
  const itemByName = new Map(items.map((it) => [it.name, it]));

  // 接线索引：技能 → 挂载它的岗位 id（来自各 preset 的 skill-subset）
  const wiredIndex = new Map();
  for (const role of roles) {
    for (const name of role.wired ?? []) {
      if (!wiredIndex.has(name)) wiredIndex.set(name, []);
      wiredIndex.get(name).push(role.id);
    }
  }

  // S12 契约闸门索引（Q5）：技能 → 哪个岗位的**白名单里有它、却没有契约引用它**。
  //
  // 这是「归位态」的第 3 个值。为什么不与接线三态（self/other/none）合并成一个枚举：
  // 两者是**正交**的 —— 一张卡可以「本岗已接线 且 待挂契约」（过渡期 114 张里的绝大多数）。
  // 合并会把两种信息压成一维，页面就没法回答「挂了，但挂它算不算数」。
  //
  // `contractGateMode` 为 null = 该 preset 的 manifest 没有这一段（老版生成器），
  // 页面必须显示「未记账」而不是「零待挂契约」——「没记」不等于「记了是零」。
  const contractPendingIndex = new Map();
  const gateModes = new Set();
  for (const role of roles) {
    if (role.contractGate) gateModes.add(role.contractGate);
    for (const name of role.contractPending ?? []) {
      if (!contractPendingIndex.has(name)) contractPendingIndex.set(name, []);
      contractPendingIndex.get(name).push(role.id);
    }
  }

  // 归位索引：技能 → 岗位 id 列表；并记录「本轮判定新增」的那部分
  const assignedBySkill = new Map();
  for (const [name, rec] of Object.entries(assignments)) {
    const ids = [];
    const fresh = [];
    for (const r of rec?.roles ?? []) {
      if (!roleById.has(r.id)) continue; // 词表外的 id 一律忽略，绝不凭空造岗
      ids.push(r.id);
      if (r.source === "assigned") fresh.push(r.id);
    }
    assignedBySkill.set(name, { ids, fresh });
  }

  const cardsPerRole = new Map(); // roleId → Set(skill name)
  const freshPerRole = new Map(); // roleId → Set(本轮判定新增的 skill name)
  const looseByScenario = new Map(); // scenario key → [skill name]
  const looseKinds = new Map(); // scenario key → {kind: count}

  let assignedCount = 0;
  let unassignedCount = 0;

  for (const item of items) {
    const rec = assignedBySkill.get(item.name);
    const ids = rec?.ids ?? [];
    if (ids.length === 0) {
      unassignedCount += 1;
      if (!looseByScenario.has(item.category)) looseByScenario.set(item.category, []);
      looseByScenario.get(item.category).push(item.name);
      const kind = assignments?.[item.name]?.no_role_kind ?? "OTHER";
      if (!looseKinds.has(item.category)) looseKinds.set(item.category, {});
      const bucket = looseKinds.get(item.category);
      bucket[kind] = (bucket[kind] ?? 0) + 1;
      continue;
    }
    assignedCount += 1;
    for (const id of ids) {
      if (!cardsPerRole.has(id)) cardsPerRole.set(id, new Set());
      cardsPerRole.get(id).add(item.name);
      if ((rec?.fresh ?? []).includes(id)) {
        if (!freshPerRole.has(id)) freshPerRole.set(id, new Set());
        freshPerRole.get(id).add(item.name);
      }
    }
  }

  const roleNode = (role) => {
    const cards = [...(cardsPerRole.get(role.id) ?? [])].sort();
    const fresh = freshPerRole.get(role.id) ?? new Set();
    return {
      id: role.id,
      alias: role.alias,
      title: role.title,
      artifact: role.artifact ?? "",
      plane: role.plane,
      domain: role.domain,
      order: role.order,
      cards,
      newCards: cards.filter((n) => fresh.has(n)),
      wired: cards.filter((n) => (wiredIndex.get(n) ?? []).includes(role.id)),
      /** 本岗挂了、但没有任何契约引用它的卡（S12 消费口闸门 / Q5）。 */
      pendingContract: cards.filter((n) => (contractPendingIndex.get(n) ?? []).includes(role.id)),
    };
  };

  // preset 挂了、但**不归本岗**的卡：接线与归位不一致的证据（不是错误，是事实）。
  // 不进每个岗位节点——岗位节点按场景重复 8 次，放进去会把同一份名单复制 8 份。
  const wiredOnlyByRole = {};
  for (const role of roles) {
    const cardSet = cardsPerRole.get(role.id) ?? new Set();
    const extra = (role.wired ?? []).filter((n) => !cardSet.has(n)).sort();
    if (extra.length > 0) wiredOnlyByRole[role.id] = extra;
  }

  const scenarioNodes = [];
  for (const sc of scenarios) {
    const inScenario = new Set(items.filter((it) => it.category === sc.key).map((it) => it.name));
    const planes = [];
    for (const planeId of PLANE_ORDER) {
      const planeRoles = roles.filter((r) => r.plane.id === planeId);
      if (planeRoles.length === 0) continue;
      const domains = [];
      for (const domainId of [...new Set(planeRoles.map((r) => r.domain.id))].sort()) {
        const domainRoles = planeRoles.filter((r) => r.domain.id === domainId);
        const nodes = [];
        for (const role of domainRoles) {
          const node = roleNode(role);
          node.cards = node.cards.filter((n) => inScenario.has(n));
          node.newCards = node.newCards.filter((n) => inScenario.has(n));
          node.wired = node.wired.filter((n) => inScenario.has(n));
          node.pendingContract = node.pendingContract.filter((n) => inScenario.has(n));
          if (node.cards.length > 0) nodes.push(node);
        }
        if (nodes.length === 0) continue;
        domains.push({
          id: domainId,
          name: domainRoles[0].domain.name,
          total: nodes.reduce((n, r) => n + r.cards.length, 0),
          roles: nodes,
        });
      }
      if (domains.length === 0) continue;
      planes.push({
        id: planeId,
        name: planeRoles[0].plane.name,
        total: domains.reduce((n, d) => n + d.total, 0),
        roleCount: domains.reduce((n, d) => n + d.roles.length, 0),
        domains,
      });
    }
    const loose = (looseByScenario.get(sc.key) ?? []).slice().sort();
    if (planes.length === 0 && loose.length === 0) continue;
    scenarioNodes.push({
      key: sc.key,
      title: sc.title,
      icon: sc.icon ?? "",
      total: inScenario.size,
      planes,
      unassigned: { cards: loose, kinds: looseKinds.get(sc.key) ?? {} },
    });
  }

  const zeroCardRoles = roles
    .filter((r) => (cardsPerRole.get(r.id)?.size ?? 0) === 0)
    .map((r) => ({ id: r.id, alias: r.alias, title: r.title, plane: r.plane.name, domain: r.domain.name }));

  const rowsPerRole = roles.reduce((n, r) => n + (cardsPerRole.get(r.id)?.size ?? 0), 0);

  return {
    scenarios: scenarioNodes,
    wiredIndex: Object.fromEntries([...wiredIndex.entries()].map(([k, v]) => [k, v.slice().sort()])),
    wiredOnlyByRole,
    /**
     * S12 契约闸门（Q5）。`mode` 取值：
     *   `count` / `enforce` = 生成器记过账（count = 过渡期只计数；enforce = 硬拦）
     *   `null`              = **没有岗位报过账**（老版 manifest）⇒ 页面须显示「未记账」
     *   `mixed`             = 同一批 preset 混着两个版本 ⇒ 本身就是一条要报的缺陷
     */
    contractGate: {
      mode: gateModes.size === 0 ? null : (gateModes.size === 1 ? [...gateModes][0] : "mixed"),
      /** 技能 → 白名单里有它、却没有契约引用它的岗位 id（跨岗位）。 */
      pendingIndex: Object.fromEntries([...contractPendingIndex.entries()].map(([k, v]) => [k, v.slice().sort()])),
      pendingSkills: [...contractPendingIndex.keys()].sort(),
      boundSkills: [...new Set(roles.flatMap((r) => r.contractBound ?? []))].sort(),
      rowsPending: roles.reduce((n, r) => n + (r.contractPending ?? []).length, 0),
      rowsBound: roles.reduce((n, r) => n + (r.contractBound ?? []).length, 0),
      rolesReporting: roles.filter((r) => r.contractGate).length,
    },
    stats: {
      cards: items.length,
      cardsAssigned: assignedCount,
      cardsUnassigned: unassignedCount,
      roles: roles.length,
      rolesWithCards: roles.length - zeroCardRoles.length,
      /** 行数：同一张卡在 N 个岗位下出现即 N 行——与「卡片数」必须在页面上分开写 */
      rows: rowsPerRole,
      wiring: {
        toThisRole: rowsPerRole,
        wired: roles.reduce((n, r) => n + (r.wired ?? []).length, 0),
        toOtherRole: 0,
        none: 0,
      },
    },
    zeroCardRoles,
  };
}

/**
 * 一张卡的接线状态（页面徽标）：本岗已接线 / 接线到别岗 / 未接线。
 * 与 buildOrgTree 分开，因为它是**每张卡在每个岗位下**都要算一次的东西。
 *
 * @param {string} skill 技能名
 * @param {string} roleId 当前岗位
 * @param {Record<string,string[]>} wiredIndex buildOrgTree 的产出
 * @returns {{kind:"self"|"other"|"none", roleIds:string[]}}
 */
export function wiringStatus(skill, roleId, wiredIndex) {
  const ids = wiredIndex?.[skill] ?? [];
  if (ids.includes(roleId)) return { kind: "self", roleIds: [] };
  if (ids.length > 0) return { kind: "other", roleIds: ids };
  return { kind: "none", roleIds: [] };
}

/**
 * 一张卡的**契约挂载状态**（S12 / Q5 的第 4 枚徽标）：已挂契约 / 待挂契约 / 未记账。
 *
 * 与 `wiringStatus` 刻意分开：接线回答「挂上了吗」，这一支回答「挂它算不算数」。
 * 合并成一句话就丢掉了过渡期最要紧的那条信息 —— 一张卡可以「本岗已接线，但待挂契约」，
 * 而 Q5 的过渡期口径正是为这种卡设的（不硬拦，但要看得见）。
 *
 * @param {string} skill 技能名
 * @param {string} roleId 当前岗位
 * @param {{pendingIndex?:Record<string,string[]>, mode?:string|null}|null|undefined} gate buildOrgTree 的 `contractGate`（null = 未记账）
 * @returns {{kind:"bound"|"pending"|"unrecorded", roleIds:string[]}}
 */
export function contractStatus(skill, roleId, gate) {
  if (!gate || !gate.mode) return { kind: "unrecorded", roleIds: [] };
  const ids = gate.pendingIndex?.[skill] ?? [];
  if (ids.includes(roleId)) return { kind: "pending", roleIds: [] };
  return { kind: "bound", roleIds: ids };
}
