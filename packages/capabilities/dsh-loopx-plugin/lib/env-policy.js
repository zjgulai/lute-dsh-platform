/**
 * @module dsh-env-policy
 * 
 * SEC-RT-003 · 子进程最小环境变量白名单与隔离策略。
 * 
 * 核心目标：
 * 1. 严格禁止子进程继承完整 process.env 或盲目展开 {...process.env}。
 * 2. 剥离云凭据、Git 敏感 token、API 密钥（如 OPENAI_*、ANTHROPIC_* 等）。
 * 3. 剥离危险的解释器注入变量：NODE_OPTIONS, PYTHONPATH, PYTHONSTARTUP, PIP_CONFIG_FILE 等。
 * 4. 仅放行操作系统基础运行所需的确定性安全变量（PATH, HOME, TMPDIR 等），其余按白名单/受控策略注入。
 */

/**
 * 跨平台操作系统运行最小安全基线变量（只读透传，若存在）：
 */
export const BASE_SYSTEM_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "SYSTEMROOT", // Windows
  "SYSTEMDRIVE", // Windows
  "COMSPEC", // Windows
  "PATHEXT", // Windows
  "WINDIR", // Windows
  "APPDATA", // Windows
  "LOCALAPPDATA", // Windows
];

/**
 * 严禁向外部子进程/非受信工具透传的高危变量模式或关键字（反模式拦截兜底）：
 */
export const CRITICAL_DENIED_PREFIXES = [
  "OPENAI_",
  "ANTHROPIC_",
  "DEEPSEEK_",
  "AWS_",
  "AZURE_",
  "GCP_",
  "GOOGLE_",
  "GITHUB_TOKEN",
  "GIT_ASKPASS",
  "SSH_AUTH_SOCK",
  "NODE_OPTIONS",
  "PYTHONPATH",
  "PYTHONSTARTUP",
  "PIP_CONFIG_FILE",
  "PIP_INDEX_URL",
  "NPM_CONFIG_USERCONFIG",
  "SENTINEL_SECRET", // 用于红灯/合规测试的哨兵凭据
];

/**
 * 构建最小受控子进程环境变量字典。
 * 
 * @param {Record<string, string | undefined>} [extraEnv] 业务显式注入的受控安全环境变量
 * @param {Record<string, string | undefined>} [sourceEnv] 源环境变量（缺省为 process.env）
 * @returns {Record<string, string>}
 */
export function buildSanitizedChildEnv(extraEnv = {}, sourceEnv = process.env) {
  /** @type {Record<string, string>} */
  const sanitized = {};

  // 1. 从源环境变量中仅挑选基线白名单项
  for (const key of BASE_SYSTEM_ALLOWLIST) {
    const val = sourceEnv[key];
    if (typeof val === "string" && val !== "") {
      sanitized[key] = val;
    }
  }

  // 2. 注入经显式审核的业务变量（extraEnv）
  for (const [k, v] of Object.entries(extraEnv)) {
    if (v === undefined || v === null) continue;
    // 检查是否落入高危拦截规则（除非特别指定）
    const isDenied = CRITICAL_DENIED_PREFIXES.some(prefix => k.startsWith(prefix));
    if (isDenied) {
      // 记录或拒绝高危注入
      continue;
    }
    sanitized[k] = String(v);
  }

  return sanitized;
}

/**
 * 校验给定的 env 对象是否符合最小隔离白名单规范（供门禁与单测使用）。
 * 若发现包含未授权的敏感环境变量，返回违规清单；若合格返回空数组。
 * 
 * @param {Record<string, any>} env
 * @returns {string[]} 违规键列表
 */
export function auditChildEnvViolations(env) {
  if (!env || typeof env !== "object") return [];
  const violations = [];
  for (const key of Object.keys(env)) {
    for (const prefix of CRITICAL_DENIED_PREFIXES) {
      if (key.startsWith(prefix)) {
        violations.push(key);
        break;
      }
    }
  }
  return violations;
}
