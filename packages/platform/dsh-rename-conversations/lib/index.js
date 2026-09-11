/**
 * dsh-rename-conversations — 会话标题规范化（host-only，常驻工具）。
 *
 * 工具：
 *  - rc_probe          只读盘点：全部会话清单 + 指定会话详情（createdAt 含 Asia/Shanghai 换算、
 *                      当前标题直出、用户消息文本截断瘦身），绝不修改任何东西。
 *  - rc_batch_rename   一键批量重命名：一次调用完成 [{sessionId, title}, ...] 全部重命名，聚合结果。
 *  - rc_rename         单条重命名兜底。
 *
 * 全部走官方 sessionController 契约（list/inspect 冷安全；rename 自动 resume 冷会话后
 * 持久化 session/title 事件，客户端列表即刷新生效）。绝不直改磁盘 jsonl。
 */
const name = "dsh-rename-conversations";
const inject = ["sessionController", "tools"];

const SH_TZ_OFFSET_MS = 8 * 3600 * 1000;

function shanghaiMMDD(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const d = new Date(ms + SH_TZ_OFFSET_MS);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return mm + dd;
}

function clip(text, max) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function extractUserTexts(events, perTextMax, maxTexts) {
  const out = [];
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || e.type !== "user/message") continue;
    const c = e.data && e.data.message && e.data.message.content
      ? e.data.message.content
      : (e.data && e.data.content) || [];
    const text = c.map((b) => (b && b.text) || "").join(" ").trim();
    if (text.length > 0) out.push(clip(text, perTextMax));
    if (out.length >= maxTexts) break;
  }
  return out;
}

function currentTitleOf(events) {
  const titles = (Array.isArray(events) ? events : [])
    .filter((e) => e && e.type === "session/title" && e.data && typeof e.data.title === "string");
  return titles.length > 0 ? titles[titles.length - 1].data.title : null;
}

export function apply(ctx) {
  const controller = ctx.sessionController;

  ctx.tools.register({
    name: "rc_probe",
    description:
      "只读盘点 DSH 会话：不带参数列出全部会话清单（sessionId/当前标题/cwd/updatedAt/blank/running/origin/parentSessionId）；" +
      "传 sessionIds（≤30 个）则额外返回每个会话的 createdAt、Asia/Shanghai 日期（MMDD）、当前标题与截断的用户消息文本（供主题提炼）。绝不修改任何东西。",
    parameters: {
      type: "object",
      properties: {
        sessionIds: {
          type: "array",
          items: { type: "string" },
          description: "要读取详情的会话 id 列表（可选；缺省只列清单）"
        }
      },
      required: []
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (a, v) => [{ type: "text", text: JSON.stringify(v, null, 2) }]
    },
    timeoutMs: 120000,
    execute: async (args) => {
      const out = { rows: [], details: {} };
      try {
        const list = await controller.list({});
        for (const row of list.items ?? []) {
          out.rows.push({
            sessionId: row.sessionId,
            title: row.projections && row.projections.title !== undefined ? row.projections.title : null,
            cwd: row.cwd ?? null,
            updatedAt: row.updatedAt,
            blank: row.blank,
            running: row.running,
            origin: row.origin ?? null,
            parentSessionId: row.parentSessionId ?? null
          });
        }
      } catch (e) {
        out.listError = String(e && e.message ? e.message : e);
      }
      const ids = Array.isArray(args && args.sessionIds) ? args.sessionIds.slice(0, 30) : [];
      for (const id of ids) {
        try {
          const ins = await controller.inspect(id);
          const meta = ins && ins.meta;
          const events = Array.isArray(ins && ins.events) ? ins.events : [];
          out.details[id] = {
            createdAt: meta ? meta.createdAt : null,
            createdShanghai: shanghaiMMDD(meta ? meta.createdAt : null),
            cwd: meta ? meta.cwd : null,
            agentPreset: meta ? meta.agentPreset : null,
            currentTitle: currentTitleOf(events),
            firstUserText: clip(extractUserTexts(events, 120, 1)[0] ?? "", 120),
            userTexts: extractUserTexts(events, 200, 3),
            userMessageCount: (Array.isArray(events) ? events : []).filter((e) => e && e.type === "user/message").length
          };
        } catch (e) {
          out.details[id] = { error: String(e && e.message ? e.message : e) };
        }
      }
      return out;
    }
  });

  ctx.tools.register({
    name: "rc_batch_rename",
    description:
      "一键批量重命名会话标题（官方 session/rename 契约，逐条串行、单条失败不影响其余）。传入 renames: [{sessionId, title}]，返回聚合结果。",
    parameters: {
      type: "object",
      properties: {
        renames: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sessionId: { type: "string" },
              title: { type: "string" }
            },
            required: ["sessionId", "title"]
          },
          description: "待重命名列表，每项 {sessionId, title}"
        }
      },
      required: ["renames"]
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (a, v) => [{ type: "text", text: JSON.stringify(v, null, 2) }]
    },
    timeoutMs: 300000,
    execute: async (args) => {
      const renames = Array.isArray(args && args.renames) ? args.renames : [];
      const results = [];
      let success = 0;
      let failed = 0;
      for (const item of renames) {
        const sessionId = String(item && item.sessionId ? item.sessionId : "");
        const title = String(item && item.title ? item.title : "");
        if (sessionId === "" || title === "") {
          failed += 1;
          results.push({ sessionId, ok: false, error: "sessionId 或 title 为空" });
          continue;
        }
        try {
          const r = await controller.rename({ sessionId, title });
          success += 1;
          results.push({ sessionId, ok: true, title: r.title, seq: r.seq });
        } catch (e) {
          failed += 1;
          results.push({ sessionId, ok: false, error: String(e && e.message ? e.message : e) });
        }
      }
      return { success, failed, results };
    }
  });

  ctx.tools.register({
    name: "rc_rename",
    description: "单条重命名一个会话标题（官方 session/rename 契约，持久化）。批量场景优先用 rc_batch_rename。",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        title: { type: "string" }
      },
      required: ["sessionId", "title"]
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (a, v) => [{ type: "text", text: JSON.stringify(v, null, 2) }]
    },
    timeoutMs: 60000,
    execute: async (args) => {
      try {
        const r = await controller.rename({ sessionId: String(args.sessionId), title: String(args.title) });
        return { ok: true, title: r.title, seq: r.seq };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    }
  });
}

export { name, inject };
