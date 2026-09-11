import crypto from "node:crypto";
import { withBridge, resetBridge } from "./browser-auth.mjs";

async function parseJson(response) {
  const body = await response.json();
  if (!body.result?.ok) throw new Error(`${body.result?.error?.message || response.status}`);
  return body.result.value;
}

export async function upstreamRpc(config, method, payload) {
  const url = new URL(config.upstream);
  const body = JSON.stringify({ type: "client-request", rpcId: crypto.randomUUID(), method, payload });
  const headers = withBridge({ "content-type": "application/json", host: url.host }, config);
  const response = await fetch(`${config.upstream}/api/${method}`, {
    method: "POST",
    headers,
    body
  });
  if (response.status === 401) {
    // 浏览器会话 cookie 失效（密钥轮换/过期）：重铸后重试一次
    resetBridge();
    const retry = await fetch(`${config.upstream}/api/${method}`, {
      method: "POST",
      headers: withBridge({ "content-type": "application/json", host: url.host }, config),
      body
    });
    return parseJson(retry);
  }
  return parseJson(response);
}
