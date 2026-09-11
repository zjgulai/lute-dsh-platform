// Desktop（alpha.1）版 member 策略层。
// 与 standalone dsh web 的差异（全部实测核对）：
//  - RPC 斜杠命名（session/list 等），信封 payload = { args: <fields> }
//  - session/list args = {_request:{cursor?}}；其余多为 {request:{...}}
//  - 无 workspace.list：所有权从 session/list 的 cwd 与 api-session/added 事件学习
import path from "node:path";

export const MEMBER_DENY = new Set([
  // 凭据与系统设置写面
  "credentials/describe", "credentials/set", "credentials/unset",
  "settings/mutate", "settings/update", "settings/replace",
  "settings/openAgentPresetDirectory", "settings/openSettingsDocument",
  "settings/canOpenAgentPresetDirectory",
  // 工作区管理（成员的唯一工作区由网关创建）
  "workspace/create", "workspace/delete", "workspace/rename",
  "workspace/insertBefore", "workspace/insertSessionBefore", "workspace/archiveSession",
  // 宿主文件系统与插件治理
  "session/openWorkspacePath",
  "directoryPicker/createDirectory", "directoryPicker/list", "directoryPicker/pick",
  "dynamicCordisRunner/invoke", "dynamicCordisRunner/resolveRequestRun",
  // Goal 控制面（MVP 归 admin）
  "goals/create", "goals/edit", "goals/pause", "goals/resume", "goals/complete", "goals/clear",
]);

/** 只读、无归属语义的方法：成员直接放行。 */
export const MEMBER_PLAIN_ALLOW = new Set([
  "settings/describe",
  "session/modelCatalog",
  "session/canOpenWorkspacePath",
  "llm/discoverModels",
  "llm/listConfigurableProviders",
  "llm/listProviders",
  // 胶囊卡片（动态 Cordis 卡）只读数据源 + 检视握手（上游原版放行，移植回归修复）
  "pluginInventory/list",
  "dynamicCordisRunner/inventory",
  "dynamicCordisRunner/syncInspectManifest",
  // 预设页核心清单
  "agentPresets/list",
  // 深度研究只读面（用户决策：成员可见研究项目；写操作 start/resume/complete/
  // fail/delete/updatePlan/updateQuestion/confirmPlan/addEvidence/writeReport 维持拒绝）
  "deepResearch/list", "deepResearch/get",
]);

/** 需要按会话/工作区归属守卫的方法。 */
export const MEMBER_GUARDED = new Set([
  "session/list", "session/search", "session/page",
  "session/prompt", "session/cancel", "session/rename", "session/fork",
  "session/updateQueue", "session/selectModel", "session/attachment",
  "session/create",
  "skills/list",
  "messageFeedback/list", "messageFeedback/put", "messageFeedback/delete",
  "subagents/prompt", "subagents/interruptByParent",
  "commands/list", "commands/execute",
  "agentPresets/select",
]);

export function createOwnership() {
  return { workspaceOwner: new Map(), sessionOwner: new Map() };
}

export function userRoot(config, user) {
  return path.join(config.workspaceRoot, user.name);
}

export function ownerOfPath(config, candidate) {
  if (typeof candidate !== "string" || !candidate) return null;
  const normalized = path.resolve(candidate);
  for (const user of config.users) {
    if (user.role !== "member") continue;
    const root = path.resolve(userRoot(config, user));
    if (normalized === root || normalized.startsWith(root + path.sep)) return user.name;
  }
  return null;
}

/** Desktop workspace/create 返回 {workspace:{workspaceId, path, title, sessionIds}} */
export function learnWorkspace(config, ownership, view) {
  if (!view || typeof view.workspaceId !== "string") return;
  const owner = ownerOfPath(config, view.path) || "admin";
  ownership.workspaceOwner.set(view.workspaceId, owner);
  for (const sessionId of view.sessionIds || []) {
    if (owner !== "admin" || !ownership.sessionOwner.has(sessionId)) ownership.sessionOwner.set(sessionId, owner);
  }
}

/** 子代理会话：parent 已归属时子会话继承归属。 */
export function learnSession(config, ownership, sessionId, cwd, parentSessionId = null) {
  if (typeof sessionId !== "string") return;
  if (ownership.sessionOwner.has(sessionId)) return;
  const byCwd = cwd ? ownerOfPath(config, cwd) : null;
  const byParent = parentSessionId ? ownership.sessionOwner.get(parentSessionId) ?? null : null;
  const owner = byCwd || byParent;
  if (owner) ownership.sessionOwner.set(sessionId, owner);
}

export function forgetSession(ownership, sessionId) {
  ownership.sessionOwner.delete(sessionId);
}

export function ownedBy(ownership, user, kind, id) {
  const map = kind === "session" ? ownership.sessionOwner : ownership.workspaceOwner;
  const owner = map.get(id);
  if (owner === user.name) return true;
  if (owner === undefined) return "unknown";
  return false;
}

/** 从 Desktop args 信封提取候选归属字段（顶层字段 + 嵌套 request/address/args）。 */
function candidateIds(args) {
  const ids = { sessionIds: [], workspaceIds: [], cwd: null };
  const stack = [args];
  for (let depth = 0; depth < 4 && stack.length > 0; depth += 1) {
    const next = [];
    for (const obj of stack) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
      for (const key of ["sessionId", "parentSessionId", "childSessionId", "beforeSessionId", "agentId"]) {
        if (typeof obj[key] === "string") ids.sessionIds.push(obj[key]);
      }
      for (const key of ["workspaceId", "beforeWorkspaceId"]) {
        if (typeof obj[key] === "string") ids.workspaceIds.push(obj[key]);
      }
      if (typeof obj.cwd === "string") ids.cwd = obj.cwd;
      for (const key of ["request", "address", "args"]) {
        const v = obj[key];
        if (v && typeof v === "object" && !Array.isArray(v)) next.push(v);
      }
    }
    stack.splice(0, stack.length, ...next);
  }
  return ids;
}

/**
 * member 请求守卫（Desktop 版）。payload 是 Desktop 信封的 payload（即 {args:{...}}）。
 * 返回 {ok, args?, message?}；ok 时 args 为转发给上游的 args（可能被网关改写）。
 */
export function guardMemberRequest({ config, ownership, user, method, payload }) {
  if (MEMBER_DENY.has(method)) return { ok: false, message: `方法 ${method} 对 Member 禁用` };
  if (MEMBER_PLAIN_ALLOW.has(method)) return { ok: true, args: payload?.args ?? {} };
  if (!MEMBER_GUARDED.has(method)) return { ok: false, message: `方法 ${method} 不在 Member 白名单` };

  const args = payload && typeof payload === "object" ? payload.args : undefined;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, message: `方法 ${method} 缺少 args 信封` };
  }

  if (method === "session/create") {
    const req = args.request ?? {};
    const own = [...ownership.workspaceOwner.entries()].find(([, owner]) => owner === user.name);
    if (!own) return { ok: false, message: "你的工作区尚未就绪，请联系管理员" };
    const out = { ...req };
    // 强制成员会话落到自己的隔离工作区（Desktop 不接受 workspaceId+cwd 同时给）
    out.workspaceId = own[0];
    delete out.cwd;
    return { ok: true, args: { ...args, request: out } };
  }

  if (method === "subagents/prompt") {
    // 子会话 id 可能尚未学习（新创建）：parent 归属本人即视为本人，
    // 并预学习 childSessionId 归属，避免首次 prompt 被 "unknown" 拒绝。
    const req = args.request ?? {};
    const parent = req.parentSessionId;
    if (typeof parent !== "string" || ownedBy(ownership, user, "session", parent) !== true) {
      return { ok: false, message: "无权访问该父会话" };
    }
    if (typeof req.childSessionId === "string") ownership.sessionOwner.set(req.childSessionId, user.name);
    return { ok: true, args };
  }

  if (method === "commands/execute") {
    const line = args.line ?? args.request?.line;
    if (typeof line === "string") {
      const match = line.trim().match(/^\/permission(?:\s+(.*))?$/);
      if (match) {
        const target = (match[1] || "").trim();
        if (target !== "" && target !== "workspace-write") {
          return { ok: false, message: "成员会话的权限模式已锁定为 workspace-write，不能切换到 " + target };
        }
      }
    }
  }

  const ids = candidateIds(args);
  for (const id of ids.sessionIds) {
    const owned = ownedBy(ownership, user, "session", id);
    if (owned === false) return { ok: false, message: "无权访问该会话" };
    if (owned === "unknown") return { ok: false, message: "会话归属未知，已拒绝（请刷新后重试）" };
  }
  for (const id of ids.workspaceIds) {
    if (ownedBy(ownership, user, "workspace", id) !== true) return { ok: false, message: "无权访问该工作区" };
  }
  if (ids.cwd !== null && ownerOfPath(config, ids.cwd) !== user.name) {
    return { ok: false, message: "无权访问该目录" };
  }
  return { ok: true, args };
}

/**
 * member 响应过滤（Desktop 版）：只保留归属本人的会话。
 * session/create、session/fork、subagents/prompt 成功后学习新会话归属。
 */
export function filterMemberResponse({ ownership, user, method, value }) {
  if (value === null || typeof value !== "object") return value;
  if (method === "session/list" || method === "session/search") {
    return { ...value, items: (value.items || []).filter(s => ownership.sessionOwner.get(s.sessionId) === user.name) };
  }
  if (method === "session/create" && typeof value.sessionId === "string") {
    ownership.sessionOwner.set(value.sessionId, user.name);
  }
  if (method === "session/fork" && typeof value.sessionId === "string") {
    ownership.sessionOwner.set(value.sessionId, user.name);
  }
  if (method === "subagents/prompt" && typeof value?.childSessionId === "string") {
    ownership.sessionOwner.set(value.childSessionId, user.name);
  }
  return value;
}
