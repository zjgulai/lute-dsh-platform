// 网关响应层 in-flight 转换：把 DSH settings 客户端强制为 host 模式。
// 背景：DSH 客户端用 `connection.isLoopback ? "host" : "memory"` 决定设置持久化模式，
// 经局域网 IP/域名访问时必然为 false → memory 模式 → 设置页报
// 「加载提供方目录失败: settings are unavailable in this browser」。
// 上游的解法是磁盘补丁，但 Desktop 的 combo 服务带 rev=sha1 内容哈希，
// 改磁盘字节 → rev 不匹配 → 整个 50+ 包大 combo 加载失败 → 白屏（实测）。
// 本模块只在网关上转换发往浏览器的字节：Desktop 磁盘零修改、rev 匹配不受影响、
// 浏览器不校验内容哈希，照常执行转换后的 bundle。
import { gunzipSync, gzipSync, brotliDecompressSync, brotliCompressSync } from "node:zlib";

export const SETTINGS_MODE_TARGET = 'connection.isLoopback ? "host" : "memory"';
export const SETTINGS_MODE_REPLACEMENT = '"host"';
/**
 * 网关转换行为版本：注入到 combo URL 作为缓存破坏参数。
 * 上游 combo 的 cache-control 是 max-age=31536000, immutable（一年强缓存），
 * 转换行为变更时必须 +1，否则浏览器继续用旧的缓存字节。
 */
export const TRANSFORM_VERSION = "1";
/** 注入到 SPA HTML 中 combo URL 的缓存破坏参数名（转发上游前剥掉）。 */
export const CACHE_BUST_PARAM = "thub";

/**
 * 转换 JS 响应体：含目标三元串则全量替换为 host 模式。
 * 返回 { body, keepEncoding } | null（null = 无需/无法转换，原样转发）。
 */
export function transformSettingsHostMode(buf, encoding) {
  if (!buf || buf.length === 0) return null;
  let plain = buf;
  let keepEncoding = false;
  if (encoding) {
    try {
      if (encoding.includes("gzip")) plain = gunzipSync(buf);
      else if (encoding.includes("br")) plain = brotliDecompressSync(buf);
      else return null; // 不认识的编码：不转换
      keepEncoding = true;
    } catch {
      return null; // 解压失败：原样转发
    }
  }
  if (!plain.includes(SETTINGS_MODE_TARGET)) return null;
  const replaced = Buffer.from(plain.toString("utf8").split(SETTINGS_MODE_TARGET).join(SETTINGS_MODE_REPLACEMENT), "utf8");
  if (!keepEncoding) return { body: replaced, keepEncoding: false };
  try {
    if (encoding.includes("gzip")) return { body: gzipSync(replaced), keepEncoding: true };
    return { body: brotliCompressSync(replaced), keepEncoding: true };
  } catch {
    // 压回失败：退回明文（调用方会剥掉 content-encoding）
    return { body: replaced, keepEncoding: false };
  }
}
