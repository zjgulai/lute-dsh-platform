// Desktop（alpha.1）remote.mux 流过滤层。
// 协议实测（dsh-api-gateway 源码核对）：
//  客户端开流: {type:"open", streamId, endpoint, payload} / {type:"cancel", streamId}
//  上游回帧:   {type:"item", streamId, value} / {type:"end", streamId} / {type:"error", streamId, error}
//  三类流:
//   - "$events"        全局转发事件: value = ready | emit{event,args} | waterfall{event,eventId,agentId,request} | cancel{eventId}
//   - "session/control" 全局控制帧: value = baseline{queues,jobs,projections} | queue{sessionId,items} | jobs{sessionId,jobs} | projection{sessionId,...}
//   - "session/follow"  单会话事件流: payload.args.request.address{sessionId|parentSessionId+childSessionId}
import { learnSession, forgetSession, ownedBy, learnWorkspace } from "./policy.mjs";

/** 判定 member 的开流请求；返回 null 表示拒绝，否则返回流元数据。 */
export function classifyMemberStreamOpen({ ownership, user, endpoint, payload }) {
  if (endpoint === "$events") return { kind: "events" };
  if (endpoint === "session/control") return { kind: "control" };
  if (endpoint === "workspace/follow") return { kind: "workspace-follow" };
  if (endpoint === "session/follow") {
    const address = payload?.args?.request?.address;
    if (!address || typeof address !== "object") return null;
    const id = address.kind === "session" ? address.sessionId : address.parentSessionId;
    if (typeof id !== "string") return null;
    const owned = ownedBy(ownership, user, "session", id);
    // follow 是纯读流：归属未知时放行风险小（上游帧还会逐条过滤），
    // 但为一致性这里与 RPC 同样拒绝未知归属。
    if (owned !== true) return null;
    return { kind: "follow", sessionId: id };
  }
  return null;
}

/** 过滤上游 item 帧；返回 {pass, frame?} —— baseline 会被裁剪成成员自己的视图。 */
export function filterMemberStreamItem({ config, ownership, user, stream, frame, onUnknown = () => {} }) {
  if (stream.kind === "follow") return { pass: true, frame };
  if (stream.kind === "control") return filterControlFrame({ ownership, user, frame, onUnknown });
  if (stream.kind === "workspace-follow") return filterWorkspaceFollowFrame({ config, ownership, user, frame, onUnknown });
  if (stream.kind === "events") return filterEventsFrame({ config, ownership, user, frame, onUnknown });
  return { pass: false };
}

function filterWorkspaceFollowFrame({ config, ownership, user, frame, onUnknown }) {
  const value = frame.value;
  if (!value || typeof value !== "object") return { pass: false };
  switch (value.type) {
    case "baseline": {
      const items = (value.value?.items || []).filter((w) => {
        learnWorkspace(config, ownership, w);
        return ownership.workspaceOwner.get(w?.workspaceId) === user.name;
      });
      const archivedSessionIds = (value.value?.archivedSessionIds || []).filter((id) => ownership.sessionOwner.get(id) === user.name);
      return {
        pass: true,
        frame: { ...frame, value: { type: "baseline", value: { items, archivedSessionIds } } }
      };
    }
    case "upsert": {
      learnWorkspace(config, ownership, value.workspace);
      return ownership.workspaceOwner.get(value.workspace?.workspaceId) === user.name ? { pass: true, frame } : { pass: false };
    }
    case "remove":
      return ownership.workspaceOwner.get(value.workspaceId) === user.name ? { pass: true, frame } : { pass: false };
    case "order":
      return {
        pass: true,
        frame: {
          ...frame,
          value: { type: "order", workspaceIds: (value.workspaceIds || []).filter((id) => ownership.workspaceOwner.get(id) === user.name) }
        }
      };
    case "archived":
      return {
        pass: true,
        frame: {
          ...frame,
          value: { type: "archived", archivedSessionIds: (value.archivedSessionIds || []).filter((id) => ownership.sessionOwner.get(id) === user.name) }
        }
      };
    default:
      onUnknown(`workspace-follow:${value.type}`);
      return { pass: false };
  }
}

function filterControlFrame({ ownership, user, frame, onUnknown }) {
  const value = frame.value;
  if (!value || typeof value !== "object") return { pass: false };
  switch (value.type) {
    case "baseline": {
      const pick = map => {
        if (!map || typeof map !== "object") return {};
        const out = {};
        for (const [id, v] of Object.entries(map)) {
          if (ownership.sessionOwner.get(id) === user.name) out[id] = v;
        }
        return out;
      };
      return {
        pass: true,
        frame: {
          ...frame,
          value: {
            type: "baseline",
            value: { queues: pick(value.value?.queues), jobs: pick(value.value?.jobs), projections: pick(value.value?.projections) }
          }
        }
      };
    }
    case "queue":
    case "jobs":
    case "projection":
      return ownership.sessionOwner.get(value.sessionId) === user.name ? { pass: true, frame } : { pass: false };
    default:
      onUnknown(`control:${value.type}`);
      return { pass: false };
  }
}

function sessionIdFromWaterfall(request) {
  if (!request || typeof request !== "object") return undefined;
  // approval/request 与 user-questions/request 的请求体可能带 sessionId/agent 上下文；
  // 逐层探测常见字段，拿不到就拒绝（默认拒绝）。
  for (const key of ["sessionId", "agentId", "parentSessionId"]) {
    if (typeof request[key] === "string") return request[key];
  }
  for (const key of ["args", "request", "context", "payload"]) {
    const nested = request[key];
    if (nested && typeof nested === "object") {
      const found = sessionIdFromWaterfall(nested);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function filterEventsFrame({ config, ownership, user, frame, onUnknown }) {
  const value = frame.value;
  if (!value || typeof value !== "object") return { pass: false };
  switch (value.type) {
    case "ready":
      return { pass: true, frame };
    case "emit": {
      const event = value.event;
      const args = Array.isArray(value.args) ? value.args : [];
      switch (event) {
        case "api-session/activity":
        case "api-session/status":
        case "api-session/error":
        case "api-session/removed": {
          const sessionId = args[0];
          if (typeof sessionId !== "string") return { pass: false };
          if (event === "api-session/removed") forgetSession(ownership, sessionId);
          return ownership.sessionOwner.get(sessionId) === user.name ? { pass: true, frame } : { pass: false };
        }
        case "api-session/added": {
          const summary = args[0];
          if (!summary || typeof summary.sessionId !== "string") return { pass: false };
          learnSession(config, ownership, summary.sessionId, summary.cwd, summary.parentSessionId);
          return ownership.sessionOwner.get(summary.sessionId) === user.name ? { pass: true, frame } : { pass: false };
        }
        case "commands/change":
          // 斜杠命令清单变更：全局 UI 通知，无参数、无会话数据
          return { pass: true, frame };
        case "agent-preset/selected": {
          // args: [sessionId, agentPreset] —— 按会话归属放行
          const sessionId = args[0];
          if (typeof sessionId !== "string") return { pass: false };
          return ownership.sessionOwner.get(sessionId) === user.name ? { pass: true, frame } : { pass: false };
        }
        default:
          // 其余转发事件（agent-preset/selected、commands/change、credentials/*、cordis/*、
          // llm/adapters-updated、settings/document-updated）均为宿主级信息，成员默认丢弃。
          return { pass: false };
      }
    }
    case "waterfall": {
      // approval/request 与 user-questions/request：仅转发归属本人的请求。
      const sessionId = sessionIdFromWaterfall(value.request);
      if (sessionId !== undefined && ownership.sessionOwner.get(sessionId) === user.name) {
        return { pass: true, frame };
      }
      onUnknown(`waterfall:${value.event}`);
      return { pass: false };
    }
    case "cancel":
      return { pass: true, frame };
    default:
      onUnknown(`events:${value.type}`);
      return { pass: false };
  }
}
