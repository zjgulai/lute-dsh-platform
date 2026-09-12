import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LAYER_ICONS, LAYER_ICON_SOURCES } from "../lib/layer-icons.js";

/**
 * 层头像契约（4 面 + 8 责任域，共 12 枚）。
 *
 * 这份 data URI 在**两个包里各烘一份**（本包与 `dsh-algo-skills-local`），
 * 因为两个页面分属不同插件、各自要能独立渲染。代价是「同一枚图有两份字节」——
 * 唯一能防住漂移的东西就是这里：**跨包逐字节断言**。缺了它，某天只重跑一边的
 * 生成脚本，两个设置页会出现两张不同的「经营管理」头像，而且没有任何红灯。
 *
 * 拿不到隔壁包（单包签出、离线）时**跳过并说明**，不做静默通过。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ALGO_ICONS = join(HERE, "..", "..", "..", "surfaces", "dsh-algo-skills-local", "src", "layer-icons.ts");

/** 从隔壁包的 TS 源里抽出 `"PLN-MGT": "data:..."` 这类键值对（不解析 TS，只取字面量）。 */
function readAlgoIcons(path) {
  const text = readFileSync(path, "utf8");
  const out = {};
  for (const m of text.matchAll(/"((?:PLN|DOM)-[A-Z0-9]+)":\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

test("层头像：12 枚齐全，键就是组织骨架的 4 面 + 8 责任域", () => {
  const keys = Object.keys(LAYER_ICONS).sort();
  assert.deepEqual(keys, [
    "DOM-01", "DOM-02", "DOM-03", "DOM-04", "DOM-05", "DOM-06", "DOM-07", "DOM-08",
    "PLN-CTL", "PLN-MGT", "PLN-OPS", "PLN-PLT",
  ]);
  for (const [key, icon] of Object.entries(LAYER_ICONS)) {
    assert.ok(icon.startsWith("data:image/svg+xml;base64,"), `${key} 不是 base64 SVG data URI`);
    assert.ok(icon.length > 1000, `${key} 的图过短，像是占位符`);
  }
  assert.equal(LAYER_ICON_SOURCES.length, 12, "来源清单必须与图一一对应");
});

test("层头像：与算法技能页逐字节相同（同一份品牌清单，不许只重跑一边）", { skip: !existsSync(ALGO_ICONS) ? "隔壁包不可见（单包签出），本项跳过——不视为通过" : false }, () => {
  const algo = readAlgoIcons(ALGO_ICONS);
  assert.equal(Object.keys(algo).length, 12, "隔壁包应当也有 12 枚层头像");
  const drifted = Object.keys(LAYER_ICONS).filter((k) => algo[k] !== LAYER_ICONS[k]);
  assert.deepEqual(drifted, [], `以下层头像两边不一致（重跑两边的 scripts/gen-layer-icons.mjs）：${drifted.join(", ")}`);
});
