/**
 * 出海技能页 · 端到端实测（真宿主 handler → 真 socket → 真 client bundle → 真 DOM）。
 *
 * 为什么还要有这一层：另外三条证据各自都留了一道缝。
 *
 *   - `probe-client-render.mjs` 喂给组件的 org 负载是它自己手工拼的，注释里写着
 *     「与宿主 handleList 同形」——同形只是声称。宿主哪天改了字段名、改了过滤条件、
 *     少算一类卡，那个探针照样 19/19。
 *   - `test/host-routes.spec.mjs` 调的是真 handler，但 res 是假的（对象字面量），
 *     没有 JSON 序列化、没有 HTTP、没有浏览器那一侧的解析。
 *   - `live-state-probe.mjs` 看的是**跑着的旧进程**，只能告诉你"要重启"。
 *
 * 这一条把缝焊上：`apply()` 真装一遍插件 → 把 `webServer.register` 的 handler 接到
 * 一个真的 `node:http` 服务上 → jsdom 里的真 client bundle 通过**真 socket** 取
 * 真 JSON → 断言 DOM。链路里没有一处手工拼装的负载。
 *
 * 于是它可以回答那个最要紧的问题：**重启之后页面会不会真的长出来**——
 * 不用重启就能回答。
 *
 * 只读：不写仓库、不碰 ~/.dsh（`loadRoleSkeleton` 只读 preset 目录）。
 * 用法：node .scratch/overseas-skills-refactor/probe-endtoend.mjs
 */
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BUNDLE, PKG, act, mountClient } from "./jsdom-harness.mjs";

const nodeFetch = globalThis.fetch; // 必须在 mountClient 覆盖 globalThis.fetch 之前抓住

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

/**
 * 真网络是异步的：服务端一个来回之后组件才 setState，`await act(async () => {})`
 * 只冲刷微任务、等不到 socket。这里显式轮询到条件成立或超时——超时就让它红，
 * 而不是写一句 `sleep(500)` 把时序问题盖过去（盖住的那个在慢机器上就是假绿）。
 */
async function waitFor(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return true;
    if (Date.now() >= deadline) return false;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  }
}

// ── 1. 真装一遍宿主插件，截下真路由表 ───────────────────────────────────────
const { apply } = await import(pathToFileURL(path.join(PKG, "lib/index.js")).href);
const table = new Map();
apply({
  credentials: undefined,
  get: () => undefined,
  effect(fn) {
    const dispose = fn();
    return typeof dispose === "function" ? dispose : () => {};
  },
  webServer: {
    register(spec) {
      table.set(spec.path, spec.handler);
      return () => {};
    },
  },
});

// ── 2. 把真 handler 接到真服务上（回环、随机端口） ──────────────────────────
/** 把一张 {path → handler} 表接到真服务上；返回 server / port / base。 */
async function startServer(routes) {
  const srv = createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const handler = routes.get(pathname);
    if (handler === undefined) {
      res.writeHead(404, { "content-type": "application/json" });
      return res.end('{"error":"no route"}');
    }
    // handler 内部自己 try/catch 并回 500；这里只兜住 promise 拒绝，避免进程崩掉
    Promise.resolve(handler(req, res)).catch((error) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(error && error.message) }));
    });
  });
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const p = srv.address().port;
  return { server: srv, port: p, base: `http://127.0.0.1:${p}` };
}

const { server, port, base } = await startServer(table);

/** 原始 HTTP 请求（走 node:http，不受 fetch 的 forbidden-header 限制，能伪装 Host）。 */
function raw(pathname, { method = "GET", host } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: pathname, method, headers: host === undefined ? {} : { host } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body, type: res.headers["content-type"] }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ── 3. 传输层：真 socket 上的路由与围栏 ────────────────────────────────────
console.log(`── 传输层（真 socket ${base}）──`);

// client bundle 里写死的每条路由，宿主都注册了吗——从 bundle 源码里抠出来比，
// 不抄一份清单（抄的那份会跟着一起漂移，这正是这次要防的错）。
const API_BASE = /var API = "([^"]+)"/.exec(BUNDLE)?.[1] ?? "";
const clientRoutes = [
  ...new Set([
    ...[...BUNDLE.matchAll(/API \+ "(\/[^"?]*)/g)].map((m) => m[1]),
    ...[...BUNDLE.matchAll(/endpoint:\s*"(\/[^"?]*)/g)].map((m) => m[1]),
  ]),
].sort();
const missing = clientRoutes.filter((route) => !table.has(API_BASE + route));
check(
  "client bundle 用到的每条路由宿主都注册了",
  API_BASE === "/api/dsh-overseas-skills" && clientRoutes.length >= 5 && missing.length === 0,
  `bundle 提到 ${clientRoutes.length} 条（${clientRoutes.join(" ")}）${missing.length ? ` · 缺 ${missing.join(" ")}` : ""}`,
);
check("路由表条数与真源一致（6 条）", table.size === 6, `注册 ${table.size} 条：${[...table.keys()].map((k) => k.replace("/api/dsh-overseas-skills", "")).join(" ")}`);

const orgRes = await raw("/api/dsh-overseas-skills/org");
const org = (() => { try { return JSON.parse(orgRes.body); } catch { return null; } })();
check("GET /org 真 socket 上答 200", orgRes.status === 200, `HTTP ${orgRes.status} · ${orgRes.type}`);
check("GET /org 的 body 是完整 JSON（没有截断）", org !== null && org.ok === true, org === null ? `${orgRes.body.length} 字节无法解析` : `${(orgRes.body.length / 1024).toFixed(0)} KiB`);

const listRes = await raw("/api/dsh-overseas-skills/list");
check("GET /list 真 socket 上答 200", listRes.status === 200, `${(listRes.body.length / 1024 / 1024).toFixed(2)} MiB`);

const spoof = await raw("/api/dsh-overseas-skills/org", { host: "evil.example" });
check("伪装 Host 的请求在真 socket 上被挡（401）", spoof.status === 401, `HTTP ${spoof.status} · ${spoof.body.slice(0, 40)}`);

const wrongMethod = await raw("/api/dsh-overseas-skills/org", { method: "POST" });
check("错方法在真 socket 上答 405", wrongMethod.status === 405, `HTTP ${wrongMethod.status}`);

// ── 4. 负载：真 handler 交出来的数字 vs 我们对外声称的数字 ──────────────────
console.log("\n── 负载（真 handler 的响应体）──");
const tree = org.tree ?? {};
const stats = tree.stats ?? {};
const CLAIM = {
  scenarios: 8,
  cards: 222,
  cardsAssigned: 209,
  cardsUnassigned: 13,
  rows: 319,
  rolesWithCards: 47,
  zeroCardRoles: 3,
  presetRoles: 50,
};
check(
  "场景数、卡片数、归位/未归岗、行数、有卡岗位与 README 声称一致",
  tree.scenarios?.length === CLAIM.scenarios &&
    stats.cards === CLAIM.cards &&
    stats.cardsAssigned === CLAIM.cardsAssigned &&
    stats.cardsUnassigned === CLAIM.cardsUnassigned &&
    stats.rows === CLAIM.rows &&
    stats.rolesWithCards === CLAIM.rolesWithCards &&
    (tree.zeroCardRoles ?? []).length === CLAIM.zeroCardRoles,
  `场景 ${tree.scenarios?.length} / 卡片 ${stats.cards} / 归位 ${stats.cardsAssigned} / 未归岗 ${stats.cardsUnassigned} / 行 ${stats.rows} / 有卡岗位 ${stats.rolesWithCards} / 零卡 ${(tree.zeroCardRoles ?? []).length}`,
);
check("岗位骨架取自真机 preset 目录（50 个）", org.presets?.count === CLAIM.presetRoles, `count=${org.presets?.count} · ${org.presets?.dir}`);
check("preset 读取无告警（problems 为空）", Array.isArray(org.presets?.problems) && org.presets.problems.length === 0, `problems=${JSON.stringify(org.presets?.problems ?? null)}`);

// 卡片名必须都能在 catalog 里找到：页面靠「卡名 → catalog 标题」渲染标题，
// 幽灵卡会渲染成没有标题的空卡，而这在任何纯数字断言里都看不出来。
const catalog = await import(pathToFileURL(path.join(PKG, "lib/catalog.js")).href);
const known = new Set(catalog.SKILLS.map((s) => s.name));
const names = [];
for (const sc of tree.scenarios ?? []) {
  for (const plane of sc.planes ?? []) {
    for (const domain of plane.domains ?? []) {
      for (const role of domain.roles ?? []) names.push(...(role.cards ?? []));
    }
  }
  names.push(...(sc.unassigned?.cards ?? []));
}
const phantom = [...new Set(names.filter((n) => !known.has(n)))];
check("树里的每张卡都能在 catalog 里对上（无幽灵卡）", phantom.length === 0, `${new Set(names).size} 个卡名${phantom.length ? ` · 幽灵：${phantom.slice(0, 3).join("、")}` : ""}`);

const roleIds = new Set((org.roles ?? []).map((r) => r.id));
const strayIcons = Object.keys(org.roleIcons ?? {}).filter((id) => !roleIds.has(id));
check(
  "岗位头像 map 覆盖真岗位且没有野键",
  Object.keys(org.roleIcons ?? {}).length > 0 && strayIcons.length === 0,
  `${Object.keys(org.roleIcons ?? {}).length} 个头像 / ${roleIds.size} 个岗位${strayIcons.length ? ` · 野键 ${strayIcons.slice(0, 3).join("、")}` : ""}`,
);
// 页面索引层头像用的是**树里那个 plane id**（client.js `layerIcons[pl.id]`），
// 不是岗位上的 planeName——所以这里按树里的 id 查，跟页面走同一条路。
const treePlanes = new Map();
for (const s of tree.scenarios ?? []) for (const p of s.planes ?? []) treePlanes.set(p.id, p.name);
const missingPlaneIcon = [...treePlanes.keys()].filter((id) => (org.layerIcons ?? {})[id] === undefined);
check(
  "4 个面都有层头像（按页面实际索引的 plane id）",
  treePlanes.size === 4 && missingPlaneIcon.length === 0,
  `${[...treePlanes.values()].join(" ")}${missingPlaneIcon.length ? ` · 缺图标 ${missingPlaneIcon.join("、")}` : ""}`,
);

// ── 5. 渲染：真 bundle 读真 body，把人会点的路径走一遍 ──────────────────────
console.log("\n── 渲染（真 client bundle 经真 socket 读上面的 body）──");
const baseFetch = (url, init) => nodeFetch(new URL(String(url), base).href, init);
// React 的 "not wrapped in act" 警告在探针 1 里不会出现，因为那里的 fetch 是微任务。
// 这一条走真 socket，I/O 必然落在 act 之外——这是真网络的固有形状，不是缺陷。
const realConsoleError = console.error;
console.error = (...args) => {
  if (String(args[0]).includes("not wrapped in act")) return;
  realConsoleError(...args);
};
const { container, text, buttonsByText, click } = await mountClient({ fetchImpl: baseFetch });
const settled = await waitFor(() => text().includes("一致性诊断"));

check("真 socket 取回 /org 之后页面不再停在加载中", settled, settled ? "" : "8 秒内没等到诊断条");
check("页面根节点已挂载", !!container.querySelector('[data-plugin="dsh-overseas-skills"]'));
check("诊断条用的是真负载的数字", text().includes("一致性诊断") && text().includes(`未归岗 ${stats.cardsUnassigned}`), `未归岗 ${stats.cardsUnassigned}`);
check("8 个场景头都是折叠的", buttonsByText("项").length === CLAIM.scenarios, `场景头 ${buttonsByText("项").length} 个`);

const sc = (tree.scenarios ?? []).find((s) => (s.planes ?? []).length > 0);
await click(buttonsByText(sc.title)[0]);
const plane = sc.planes[0];
check(`展开场景「${sc.title}」露出面「${plane.name}」`, buttonsByText(plane.name).length > 0);

await click(buttonsByText(plane.name)[0]);
const domain = plane.domains[0];
check(`展开面露出责任域「${domain.name}」`, buttonsByText(domain.name).length > 0);

const role = domain.roles.find((r) => (r.cards ?? []).length > 0);
await click(buttonsByText(domain.name)[0]);
check(`展开责任域露出岗位「${role.alias} · ${role.title}」`, buttonsByText(role.title).length > 0, `本岗 ${role.cards.length} 张卡`);

await click(buttonsByText(role.title)[0]);
const titles = role.cards.map((n) => (catalog.SKILLS.find((s) => s.name === n) || {}).title).filter(Boolean);
// 卡片标题不是 /org 给的：页面拿卡名去 /list 的 items 里查（`itemByName[n]`），
// 那是**第二条并发请求**。真 socket 下它比 /org 晚落地，所以这里必须等它——
// 这不是"等自己要断言的东西"：等不到就是红，而红测（第 6 节）证明这条绿不是空转。
const cardsArrived = await waitFor(() => titles.every((t) => text().includes(t)));
check("岗位展开后技能卡按真负载出现", titles.length > 0 && cardsArrived, `渲染 ${titles.filter((t) => text().includes(t)).length}/${titles.length}：${titles.slice(0, 3).join("、")}`);

const looseSc = (tree.scenarios ?? []).find((s) => (s.unassigned?.cards ?? []).length > 0);
check(
  `未归岗分组可见（${looseSc.title}：${looseSc.unassigned.cards.length} 张）`,
  buttonsByText(`未归岗 ${looseSc.unassigned.cards.length} 张`).length > 0,
);
check("未归岗合计与 stats 一致", (tree.scenarios ?? []).reduce((n, s) => n + (s.unassigned?.cards ?? []).length, 0) === stats.cardsUnassigned, `${stats.cardsUnassigned} 张`);

// ── 6. 红测 A：往真负载里塞一张幽灵卡，负载侧的断言必须变红 ────────────────
// 光有绿不算数：如果这些断言根本不咬人，它们只是在打印一行好看的字。
// 这里把真 handler 的响应体改一个字节（多一张 catalog 里没有的卡），看探针认不认。
console.log("\n── 红测 A：真负载里注入一张幽灵卡 ──");
{
  const realOrgHandler = table.get(`${API_BASE}/org`);
  const poisoned = new Map([
    [
      `${API_BASE}/org`,
      (req, res) => {
        const proxy = {
          writeHead: (status, headers) => res.writeHead(status, headers),
          end: (body) => {
            let out = body;
            try {
              const payload = JSON.parse(body);
              const sc = (payload.tree?.scenarios ?? []).find((s) => (s.planes ?? []).length > 0);
              sc.planes[0].domains[0].roles[0].cards.push("幽灵卡-不在目录里");
              out = JSON.stringify(payload);
            } catch { /* 改不动就原样回，下面的断言会红 */ }
            res.end(out);
          },
        };
        return realOrgHandler(req, proxy);
      },
    ],
  ]);
  const inj = await startServer(poisoned);
  const res = await nodeFetch(`${inj.base}${API_BASE}/org`);
  const body = await res.json();
  const names2 = [];
  for (const sc of body.tree?.scenarios ?? []) {
    for (const plane of sc.planes ?? []) {
      for (const domain of plane.domains ?? []) for (const role of domain.roles ?? []) names2.push(...(role.cards ?? []));
    }
    names2.push(...(sc.unassigned?.cards ?? []));
  }
  const phantom2 = [...new Set(names2.filter((n) => !known.has(n)))];
  check(
    "注入的幽灵卡被认出来（「无幽灵卡」这条断言不是空转）",
    phantom2.length === 1 && phantom2[0] === "幽灵卡-不在目录里",
    `认出 ${phantom2.length} 张：${phantom2.join("、") || "（没有——断言失效）"}`,
  );
  await new Promise((resolve) => inj.server.close(resolve));
}

// ── 7. 红测 B：这条绿必须依赖真 socket，否则等于空转 ────────────────────────
console.log("\n── 红测 B：把真服务关掉，同一套断言必须变红 ──");
await new Promise((resolve) => server.close(resolve));
{
  const { container: dead, text: deadText } = await mountClient({
    fetchImpl: async () => { throw new Error("ECONNREFUSED（红测：服务已关）"); },
  });
  await waitFor(() => deadText().includes("四层视图暂不可用"));
  check("服务关掉后页面退化为「四层视图暂不可用」而不是白屏", deadText().includes("四层视图暂不可用"));
  check("服务关掉后页面根节点仍在", !!dead.querySelector('[data-plugin="dsh-overseas-skills"]'));
  check("红测反证：刚才的绿不是空转（真 socket 一断，四层就没了）", !deadText().includes("一致性诊断"));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 条通过`);
if (failed.length > 0) {
  console.log("失败项：\n  " + failed.map((f) => f.name).join("\n  "));
  process.exit(1);
}
process.exit(0);
