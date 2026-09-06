import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CATEGORIES, SKILLS, CATEGORIES_FS, SKILLS_FS } from "./catalog.js";
import { getPromptTemplate } from "./templates.js";

/**
 * dsh-overseas-skills — Host half.
 * Loopback-only HTTP API listing the Accio "出海" skill catalog imported into
 * ~/.dsh/skills, plus a frontmatter toggle writing `disable-model-invocation`
 * and `user-invocable` (model catalog + "/" picker visibility, live via the
 * filesystem provider watcher).
 */
const name = "dsh-overseas-skills";
const inject = ["webServer", "credentials"];

const SKILLS_DIR = join(homedir(), ".dsh", "skills");
const BASE = "/api/dsh-overseas-skills";
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** 允许写入的凭据 ref 白名单（外部工具接入位；值经 credentials 服务落库，绝不回显） */
const CREDENTIAL_REFS = ["overseas_exa", "overseas_jungle_scout", "overseas_klaviyo"];

function isIPv4Loopback(v4) {
  const parts = v4.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function isLoopbackAddress(address) {
  if (address === undefined) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("::ffff:")) return isIPv4Loopback(normalized.slice(7));
  return isIPv4Loopback(normalized);
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  return isIPv4Loopback(hostname);
}
/** Request-level trust fence: loopback socket AND loopback Host header; X-Forwarded-For is never trusted. */
function isLoopbackRequest(request) {
  if (!isLoopbackAddress(request.socket?.remoteAddress)) return false;
  const host = request.headers?.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return false;
  }
  return isLoopbackHostname(hostUrl.hostname);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function frontmatterBlock(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match ? match[1] : "";
}

/** Read the live description + enabled state of one imported skill. */
async function readSkillMeta(dirName) {
  const file = join(SKILLS_DIR, dirName, "SKILL.md");
  if (!existsSync(file)) return null;
  const text = await readFile(file, "utf8");
  const fm = frontmatterBlock(text);
  const descLine = /^description:\s*(.+)\s*$/m.exec(fm);
  const dis = /^disable-model-invocation:\s*(true|false)\s*$/m.exec(fm);
  const usr = /^user-invocable:\s*(true|false)\s*$/m.exec(fm);
  const disableModel = dis ? dis[1] === "true" : false;
  const userInvocable = usr ? usr[1] === "false" ? false : true : true;
  let description = descLine ? descLine[1] : "";
  // frontmatter 值统一引号化过：去掉 JSON 引号包裹并还原转义引号
  if (description.length >= 2 && description.startsWith('"') && description.endsWith('"')) description = description.slice(1, -1);
  description = description.replace(/\\"/g, '"');
  if (description.length > 160) description = description.slice(0, 160) + "…";
  return { description, modelEnabled: !disableModel };
}

async function buildGroups(cats, skills) {
  const groups = [];
  for (const cat of cats) {
    const items = [];
    for (const skill of skills) {
      if (skill.category !== cat.key) continue;
      const meta = await readSkillMeta(skill.name);
      items.push({
        name: skill.name,
        title: skill.title,
        icon: skill.icon || cat.icon || "",
        description: meta ? meta.description : "",
        descriptionZh: skill.summaryZh || (meta === null && skill.toolBacked ? "工具型技能 · 未接入外部工具（安装后启用）" : ""),
        modelEnabled: meta ? meta.modelEnabled : false,
        toolGap: skill.toolGap || "",
        installed: meta !== null,
        template: getPromptTemplate(skill.name, skill.title)
      });
    }
    groups.push({ key: cat.key, title: cat.title, icon: cat.icon || "", items });
  }
  return { status: 200, body: { ok: true, groups } };
}

async function handleList() {
  return buildGroups(CATEGORIES, SKILLS);
}

async function handleFullstackList() {
  return buildGroups(CATEGORIES_FS, SKILLS_FS);
}

async function handleToggle(body) {
  const skillName = typeof body?.name === "string" ? body.name : "";
  const enabled = body?.enabled === true;
  if (!NAME_PATTERN.test(skillName)) return { status: 400, body: { ok: false, error: "invalid name" } };
  const file = join(SKILLS_DIR, skillName, "SKILL.md");
  if (!existsSync(file)) return { status: 404, body: { ok: false, error: "not found" } };
  const text = await readFile(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return { status: 400, body: { ok: false, error: "no frontmatter" } };
  const kept = match[1]
    .split(/\r?\n/)
    .filter((line) => !/^(disable-model-invocation|user-invocable):/.test(line));
  // A1 语义：开关只控「模型调用」；user-invocable 恒 true（"/" 菜单始终可见）
  const nextFm = [
    ...kept,
    `disable-model-invocation: ${String(!enabled)}`,
    `user-invocable: true`
  ].join("\n");
  const rebuilt = text.slice(0, match.index) + "---\n" + nextFm + "\n---" + text.slice(match.index + match[0].length);
  await writeFile(file, rebuilt, "utf8");
  return { status: 200, body: { ok: true, name: skillName, enabled } };
}

async function handleCredentialDescribe(credentials, ref) {
  if (credentials === undefined) return { status: 501, body: { ok: false, error: "credentials 服务不可用" } };
  if (!CREDENTIAL_REFS.includes(ref)) return { status: 400, body: { ok: false, error: "未知凭据 ref" } };
  try {
    const info = await credentials.describe(ref);
    return { status: 200, body: { ok: true, ref, configured: info?.configured === true, writable: info?.writable !== false } };
  } catch (error) {
    return { status: 500, body: { ok: false, error: String(error?.message ?? error) } };
  }
}

async function handleCredentialSet(credentials, ref, value) {
  if (credentials === undefined) return { status: 501, body: { ok: false, error: "credentials 服务不可用" } };
  if (!CREDENTIAL_REFS.includes(ref)) return { status: 400, body: { ok: false, error: "未知凭据 ref" } };
  if (typeof value !== "string" || value.trim() === "") return { status: 400, body: { ok: false, error: "值不能为空" } };
  try {
    await credentials.set(ref, value.trim());
    const info = await credentials.describe(ref);
    return { status: 200, body: { ok: true, ref, configured: info?.configured === true } };
  } catch (error) {
    return { status: 500, body: { ok: false, error: String(error?.message ?? error) } };
  }
}

export function apply(ctx) {
  const credentials = ctx.credentials ?? ctx.get("credentials");
  ctx.effect(() => {
    const disposeList = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/list",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const result = await handleList();
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      }
    });
    const disposeFullstackList = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/fullstack-list",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const result = await handleFullstackList();
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      }
    });
    const disposeToggle = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/toggle",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const result = await handleToggle(await readBody(req));
          sendJson(res, result.status, result.body);
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      }
    });
    const disposePromptTemplate = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/prompt-template",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" });
        try {
          const url = new URL(req.url, "http://localhost");
          const name = url.searchParams.get("name") ?? "";
          const title = url.searchParams.get("title") ?? "";
          if (!NAME_PATTERN.test(name)) return sendJson(res, 400, { ok: false, error: "invalid name" });
          const template = getPromptTemplate(name, title);
          return sendJson(res, 200, { ok: true, template });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      }
    });
    const disposeCredential = ctx.webServer.register({
      kind: "exact",
      path: BASE + "/credential",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 401, { error: "unauthorized" });
        try {
          if (req.method === "GET") {
            const url = new URL(req.url, "http://localhost");
            const result = await handleCredentialDescribe(credentials, url.searchParams.get("ref") ?? "");
            return sendJson(res, result.status, result.body);
          }
          if (req.method === "POST") {
            const body = await readBody(req);
            const result = await handleCredentialSet(credentials, typeof body?.ref === "string" ? body.ref : "", body?.value);
            return sendJson(res, result.status, result.body);
          }
          return sendJson(res, 405, { error: "method not allowed" });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      }
    });
    return () => {
      disposeList();
      disposeFullstackList();
      disposeToggle();
      disposeCredential();
      disposePromptTemplate();
    };
  }, "dsh-overseas-skills: routes");
}

export { name, inject };
