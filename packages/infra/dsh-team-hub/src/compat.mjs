import { upstreamRpc } from "./upstream.mjs";

// Desktop（alpha.1）兼容性自检：验证 cookie 桥 + 斜杠 RPC + args 信封。
/**
 * 从 catch/未知值中取出可读消息。
 * @param {unknown} reason 捕获到的值
 * @returns {string} 消息文本
 */
function errorText(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function compatibilityReport(config) {
  const startedAt = Date.now();
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok, detail });
  try {
    const sessions = await upstreamRpc(config, "session/list", { args: { _request: {} } });
    add("session/list", Array.isArray(sessions?.items), `${sessions?.items?.length ?? 0} sessions`);
  } catch (error) { add("session/list", false, errorText(error)); }
  try {
    const models = await upstreamRpc(config, "llm/discoverModels", { args: {} });
    add("llm/discoverModels", models !== undefined, "ok");
  } catch (error) { add("llm/discoverModels", false, errorText(error)); }
  try {
    const skills = await upstreamRpc(config, "skills/list", { args: { request: { sessionId: "" } } });
    add("skills/list (readiness)", skills !== undefined, "ok");
  } catch (error) {
    // 空 sessionId 可能返回会话错误——只要能到达网关解析层就算契约可达
    add("skills/list (readiness)", String(errorText(error)).includes("session") || String(errorText(error)).includes("args"), errorText(error));
  }
  const ok = checks.every(check => check.ok);
  return { ok, durationMs: Date.now() - startedAt, checks };
}
