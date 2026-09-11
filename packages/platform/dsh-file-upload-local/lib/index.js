import { mkdir, writeFile, access, readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { homedir } from "node:os";

const name = "dsh-file-upload";
const inject = ["webServer", "agents"];

const MAX_JSON_BYTES = 18 * 1024 * 1024;
const MAX_DIR_ENTRIES = 200;

export function sanitizeFilename(raw) {
  let n = String(raw ?? "").trim();
  n = n.replace(/[\\/]/g, "_");
  // eslint-disable-next-line no-control-regex
  n = n.replace(/[\u0000-\u001f\u007f]/g, "");
  n = n.replace(/^\.+/, "");
  if (n === "" || n === "." || n === "..") n = "upload.bin";
  return n;
}

async function pathExists(p) {
  try { await access(p); return true; } catch { return false; }
}

export async function saveUpload(root, rawName, bytes) {
  if (typeof root !== "string" || root.length === 0) {
    throw new Error("workspace root is unavailable");
  }
  const dir = join(root, "uploads");
  await mkdir(dir, { recursive: true });

  const safe = sanitizeFilename(rawName);
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";

  let finalName = safe;
  let candidate = join(dir, finalName);
  let i = 1;
  while (await pathExists(candidate)) {
    finalName = `${stem}-${i}${ext}`;
    candidate = join(dir, finalName);
    i += 1;
  }

  await writeFile(candidate, bytes);
  return { absolute: candidate, relativePath: `uploads/${finalName}` };
}

function workspaceRoot(ctx) {
  const agents = ctx.agents?.list?.() ?? [];
  for (const agent of agents) {
    const cwd = agent?.session?.header?.cwd;
    if (typeof cwd === "string" && cwd.length > 0) return cwd;
  }
  return process.cwd();
}

/** Validate that `subPath` cannot escape `root` via path traversal. */
function safeJoin(root, subPath) {
  const abs = resolve(root, subPath ?? "");
  if (!abs.startsWith(root)) throw new Error("path traversal denied");
  return abs;
}

function respond(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBodyJson(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) { req.resume(); throw Object.assign(new Error("body too large"), { status: 413 }); }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function apply(ctx) {
  /** POST /__dsh-file-upload — upload a file into workspace/uploads/ */
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/__dsh-file-upload",
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") { respond(res, 405, { ok: false, error: "method not allowed" }); return; }
        const payload = await readBodyJson(req);
        const rawName = payload?.name;
        const bytesB64 = payload?.bytes;
        if (typeof rawName !== "string" || typeof bytesB64 !== "string") {
          respond(res, 400, { ok: false, error: "name and bytes are required" }); return;
        }
        const result = await saveUpload(workspaceRoot(ctx), rawName, Buffer.from(bytesB64, "base64"));
        respond(res, 200, { ok: true, relativePath: result.relativePath });
      } catch (err) {
        if (!res.headersSent) respond(res, err?.status ?? 500, { ok: false, error: err?.message ?? String(err) });
        else res.destroy();
      }
    },
  }), "dsh-file-upload: upload route");

  /** GET /__dsh-attach-list?path=<rel> — list workspace directory entries */
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/__dsh-attach-list",
    handler: async (req, res) => {
      try {
        if (req.method !== "GET") { respond(res, 405, { ok: false, error: "method not allowed" }); return; }
        const url = new URL(req.url, "http://localhost");
        const subPath = url.searchParams.get("path") ?? "";
        const root = workspaceRoot(ctx);
        const absDir = safeJoin(root, subPath);

        const rawEntries = await readdir(absDir, { withFileTypes: true });
        const entries = rawEntries
          .filter(e => !e.name.startsWith(".") || subPath === "")  // hide dotfiles at root level too if desired
          .filter(e => e.name !== "node_modules" && e.name !== ".git")
          .sort((a, b) => {
            // dirs first, then files, then alphabetical
            const aDir = a.isDirectory() ? 0 : 1;
            const bDir = b.isDirectory() ? 0 : 1;
            return aDir - bDir || a.name.localeCompare(b.name);
          })
          .slice(0, MAX_DIR_ENTRIES)
          .map(e => ({
            name: e.name,
            type: e.isDirectory() ? "dir" : "file",
            relativePath: join(subPath, e.name).replace(/\\/g, "/"),
          }));

        const parentPath = subPath && subPath !== "." ? subPath.split("/").slice(0, -1).join("/") : null;
        respond(res, 200, { ok: true, entries, cwd: root, currentPath: subPath, parentPath });
      } catch (err) {
        if (!res.headersSent) respond(res, err?.status ?? 500, { ok: false, error: err?.message ?? String(err) });
        else res.destroy();
      }
    },
  }), "dsh-file-upload: attach-list route");

  /** GET /__dsh-skills-list — list installed DSH skills */
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/__dsh-skills-list",
    handler: async (req, res) => {
      try {
        if (req.method !== "GET") { respond(res, 405, { ok: false, error: "method not allowed" }); return; }
        const skillsDir = join(homedir(), ".dsh", "skills");
        let skills = [];
        try {
          const entries = await readdir(skillsDir, { withFileTypes: true });
          skills = entries
            .filter(e => (e.isDirectory() || e.isFile()) && !e.name.startsWith("."))
            .map(e => e.name.replace(/\.(md|yml|yaml|json)$/i, ""))
            .filter((v, i, arr) => arr.indexOf(v) === i)  // dedupe
            .sort((a, b) => a.localeCompare(b));
        } catch { /* skills dir not found — return empty list */ }
        respond(res, 200, { ok: true, skills });
      } catch (err) {
        if (!res.headersSent) respond(res, 500, { ok: false, error: err?.message ?? String(err) });
        else res.destroy();
      }
    },
  }), "dsh-file-upload: skills-list route");

  /** POST /__dsh-loopx-start — kick off a LoopX goal loop (non-blocking) */
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/__dsh-loopx-start",
    handler: async (req, res) => {
      try {
        if (req.method !== "POST") { respond(res, 405, { ok: false, error: "method not allowed" }); return; }
        const payload = await readBodyJson(req);
        const goalText = payload?.goalText;
        const cwd = payload?.cwd ?? workspaceRoot(ctx);
        if (typeof goalText !== "string" || goalText.trim().length === 0) {
          respond(res, 400, { ok: false, error: "goalText is required" }); return;
        }

        // Fire start-goal non-blocking; return the activation summary if it completes quickly
        const { spawn } = await import("node:child_process");
        const args = [
          "start-goal", "--guided",
          "--project", cwd,
          "--goal-text", goalText.trim(),
          "--host-surface", "deepseek-harness-native",
          "--format", "json",
        ];
        const result = await new Promise((resolve) => {
          const proc = spawn("loopx", args, { cwd, timeout: 8000 });
          let stdout = "";
          proc.stdout?.on("data", d => { stdout += d.toString(); });
          proc.on("close", code => resolve({ code, stdout }));
          proc.on("error", err => resolve({ code: -1, stdout: "", error: err.message }));
        });

        let activation = null;
        try { activation = JSON.parse(result.stdout); } catch { /* not JSON, fine */ }
        respond(res, 200, { ok: true, exitCode: result.code, activation, rawOutput: result.stdout.slice(0, 2000) });
      } catch (err) {
        if (!res.headersSent) respond(res, err?.status ?? 500, { ok: false, error: err?.message ?? String(err) });
        else res.destroy();
      }
    },
  }), "dsh-file-upload: loopx-start route");
}

export { apply, inject, name };
