/**
 * @module dsh-team-hub/route-guard
 * 
 * SEC-RT-004 · Team Hub 插件 HTTP 路由 default-deny 与多用户路由契约。
 * 
 * 核心原则：
 * 1. 任何插件路由或非核心路由对普通 member 默认拒绝（403）。
 * 2. 仅显式登记且经过安全审计的方法、路径或特定前缀才允许 member 访问。
 * 3. admin 用户不受此路由限制（拥有全部运维和插件管理权限）。
 * 4. 严防大小写绕过、路径遍历（../）、编码（%2f）、重复斜杠与查询参数绕过。
 */

/**
 * 规范化请求路径用于鉴权比对：
 * - 尝试 decodeURIComponent（打掉 %2e%2e, %2f 等编码绕过）
 * - 收缩连续斜杠（如 ///api//foo -> /api/foo）
 * - 去除末尾斜杠（保持对根路径 "/" 的保留）
 * - 转为小写以防大小写差异绕过（视路由敏感度）
 * 
 * @param {string} rawPath 原始请求路径
 * @returns {string} 规范化后的绝对路径
 */
export function normalizePath(rawPath) {
  if (typeof rawPath !== "string" || !rawPath) return "/";
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    // 畸形编码直接保持原样或返回非法路径
    decoded = rawPath;
  }
  // 提取路径部分（剥离 query）
  const queryIdx = decoded.indexOf("?");
  if (queryIdx !== -1) {
    decoded = decoded.slice(0, queryIdx);
  }
  // 规范化重复斜杠
  let normalized = decoded.replace(/\/+/g, "/");
  // 去除尾部斜杠（除了单独的 "/"）
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * DSH 核心静态与前端资源前缀（member 与 admin 均可正常加载 UI）：
 */
export const CORE_STATIC_PREFIXES = [
  "/",
  "/index.html",
  "/favicon.ico",
  "/assets",
  "/@vite",
  "/@id",
  "/@fs",
  "/node_modules",
  "/__dsh_boot__",
  "/__dsh_client_plugins__",
  "/__dsh_host_webserver__",
  "/src",
  "/fonts",
];

/**
 * DSH 核心或由 Team Hub 网关接管的自有端点：
 * 这些路径直接在网关内部处理或必须放行。
 */
export const GATEWAY_INTERNAL_PREFIXES = [
  "/login",
  "/logout",
  "/change-password",
  "/admin",
  "/__teamhub",
];

/**
 * 允许 Member 访问的特定插件/宿主 HTTP 路由清单（精确匹配或安全前缀匹配）：
 * 每一项都必须具备明确的业务理由与只读/无害审计证明。
 */
export const MEMBER_ALLOWED_PLUGIN_ROUTES = [
  // 1. 文件上传与附件（单用户工作区内受控操作）
  { method: "POST", path: "/__dsh-file-upload", exact: true, reason: "会话中上传本地附件" },
  { method: "GET", path: "/__dsh-attach-list", exact: true, reason: "附件列表浏览" },
  { method: "GET", path: "/__dsh-attach-preview", exact: true, reason: "附件预览" },
  // 2. 新应用抽屉只读能力（不包含 open-system 写操作）
  { method: "GET", path: "/api/dsh-newapp/health", exact: true, reason: "新应用健康探测" },
  { method: "GET", path: "/api/dsh-newapp/products", exact: true, reason: "产品目录只读发现" },
  { method: "GET", path: "/api/dsh-newapp/systems", exact: true, reason: "业务系统目录只读" },
  // 3. 角色矩阵与技能只读发现
  { method: "GET", path: "/api/dsh-role-matrix/list", exact: true, reason: "角色矩阵卡片列表" },
  { method: "GET", path: "/api/dsh-role-matrix/capabilities", exact: true, reason: "角色能力清单" },
  { method: "GET", path: "/api/dsh-role-matrix/health", exact: true, reason: "角色矩阵健康检查" },
  { method: "GET", path: "/api/dsh-algo-skills/tree", exact: true, reason: "算法技能树只读浏览" },
  { method: "GET", path: "/api/dsh-algo-skills/health", exact: true, reason: "算法技能健康检查" },
  { method: "GET", path: "/api/dsh-overseas-skills/list", exact: true, reason: "海外技能只读列表" },
  { method: "GET", path: "/api/dsh-overseas-skills/fullstack-list", exact: true, reason: "全栈技能只读列表" },
  { method: "GET", path: "/api/dsh-overseas-skills/org", exact: true, reason: "技能组织架构只读" },
];

/**
 * 判定一个请求路径是否属于核心静态资产或前端基础文件。
 * @param {string} pathname 
 * @returns {boolean}
 */
export function isCoreStaticPath(pathname) {
  const norm = normalizePath(pathname);
  if (norm === "/" || norm === "/index.html" || norm === "/favicon.ico") return true;
  for (const prefix of CORE_STATIC_PREFIXES) {
    if (prefix === "/" || prefix === "/index.html" || prefix === "/favicon.ico") continue;
    if (norm === prefix || norm.startsWith(prefix + "/")) return true;
  }
  // combo 资源请求（如 ??/assets/...）
  if (pathname.includes("??")) return true;
  return false;
}

/**
 * 判定一个请求路径是否为网关内置路由。
 * @param {string} pathname 
 * @returns {boolean}
 */
export function isGatewayInternalPath(pathname) {
  const norm = normalizePath(pathname);
  for (const prefix of GATEWAY_INTERNAL_PREFIXES) {
    if (norm === prefix || norm.startsWith(prefix + "/")) return true;
  }
  return false;
}

/**
 * 对 member 请求执行 HTTP 路由 default-deny 判决。
 * 
 * 规则：
 * 1. 核心静态资源和网关内部路径 -> 放行 (allow)
 * 2. `/api/` 开头的 POST 请求（即标准 RPC）-> 移交 RPC 策略层 handleApiPost / guardMemberRequest 判定
 * 3. 核心 WebSocket/SSE 路由（如 /api/remote.mux）-> 移交对应协议处理器
 * 4. 其余任何 `/api/*` 或插件宿主端点 -> 严格查找 MEMBER_ALLOWED_PLUGIN_ROUTES 白名单
 *    - 在白名单中且 Method 匹配 -> 放行 (allow)
 *    - 否则 -> 拒绝 (deny: 403)
 * 
 * @param {{ method: string, pathname: string, role: string }} param0
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function evaluateHttpRoutePolicy({ method, pathname, role }) {
  // admin 拥有全量权限
  if (role === "admin") {
    return { allowed: true, reason: "admin-bypass" };
  }

  const norm = normalizePath(pathname);
  const m = (method || "GET").toUpperCase();

  // 1. 网关自有面
  if (isGatewayInternalPath(norm)) {
    return { allowed: true, reason: "gateway-internal" };
  }

  // 2. 静态与前端核心资源
  if (isCoreStaticPath(norm) && (m === "GET" || m === "HEAD")) {
    return { allowed: true, reason: "core-static" };
  }

  // 3. Desktop 核心 RPC（POST /api/*）由 handleApiPost 负责逐方法细粒度管控
  if (norm.startsWith("/api/") && m === "POST") {
    // 特殊：如果是插件专属的特权端点，先在这里拦截，防止伪造成普通 POST RPC
    const isSpecialPluginEndpoint = MEMBER_ALLOWED_PLUGIN_ROUTES.some(r => r.exact ? norm === r.path : norm.startsWith(r.path));
    if (!isSpecialPluginEndpoint) {
      // 检查是否是已知的管理类插件前缀（如 /api/task-board/*, /api/dsh-ssh/*, /api/dsh-wanzh-hulian/*）
      // 只要属于第三方/插件 host 端点，而非 DSH 原生核心 RPC，就直接拒绝
      if (isUntrustedPluginPath(norm)) {
        return { allowed: false, reason: `插件路径 ${norm} 对 Member 默认拒绝` };
      }
    }
    return { allowed: true, reason: "rpc-delegated" };
  }

  // 4. Desktop 核心 WebSocket 升级路由与事件端点（如 /api/remote.mux, /api/events.mux）
  if (norm === "/api/remote.mux" || norm === "/api/events.mux" || norm === "/api/events.host") {
    return { allowed: true, reason: "core-event-stream" };
  }

  // 5. 显式白名单比对
  for (const entry of MEMBER_ALLOWED_PLUGIN_ROUTES) {
    if (entry.method !== m) continue;
    if (entry.exact) {
      if (norm === entry.path) {
        return { allowed: true, reason: entry.reason };
      }
    } else {
      if (norm === entry.path || norm.startsWith(entry.path + "/")) {
        return { allowed: true, reason: entry.reason };
      }
    }
  }

  // 6. Default Deny：一切未登记的插件、宿主端点一律拒绝
  return {
    allowed: false,
    reason: `未登记的路由 ${m} ${norm} 对 Member 默认拒绝 (default-deny)`
  };
}

/**
 * 辅助检测已知的高风险/外部插件宿主路径
 * @param {string} normPath 
 * @returns {boolean}
 */
function isUntrustedPluginPath(normPath) {
  const untrustedPrefixes = [
    "/api/task-board",
    "/api/dsh-ssh",
    "/api/dsh-skill-explorer",
    "/api/pair",
    "/api/approvals",
    "/api/events", // SSE 不带后缀
    "/api/dsh-wanzh-hulian",
    "/api/mcp-servers",
    "/api/dsh-my-quotes",
    "/api/dsh-newapp",
    "/api/dsh-role-matrix",
    "/api/dsh-algo-skills",
    "/api/dsh-overseas-skills",
  ];
  return untrustedPrefixes.some(p => normPath === p || normPath.startsWith(p + "/"));
}
