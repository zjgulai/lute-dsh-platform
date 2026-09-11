import { upstreamRpc } from "./upstream.mjs";

// Desktop（alpha.1）兼容性自检：验证 cookie 桥 + 斜杠 RPC + args 信封。
export async function compatibilityReport(config) {
  const startedAt = Date.now();
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok, detail });
  try {
    const sessions = await upstreamRpc(config, "session/list", { args: { _request: {} } });
    add("session/list", Array.isArray(sessions?.items), `${sessions?.items?.length ?? 0} sessions`);
  } catch (error) { add("session/list", false, error.message); }
  try {
    const models = await upstreamRpc(config, "llm/discoverModels", { args: {} });
    add("llm/discoverModels", models !== undefined, "ok");
  } catch (error) { add("llm/discoverModels", false, error.message); }
  try {
    const skills = await upstreamRpc(config, "skills/list", { args: { request: { sessionId: "" } } });
    add("skills/list (readiness)", skills !== undefined, "ok");
  } catch (error) {
    // 空 sessionId 可能返回会话错误——只要能到达网关解析层就算契约可达
    add("skills/list (readiness)", String(error.message).includes("session") || String(error.message).includes("args"), error.message);
  }
  const ok = checks.every(check => check.ok);
  return { ok, durationMs: Date.now() - startedAt, checks };
}
