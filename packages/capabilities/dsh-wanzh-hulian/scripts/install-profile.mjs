#!/usr/bin/env node
/**
 * install-profile.mjs — 把 dsh-wanzh-hulian 注册进 desktop profile。
 * 步骤：package.json 加 file: 依赖 + dsh.profile.bundles 行 → pnpm install（硬链接）→ 校验。
 * 幂等：已注册则跳过。
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PROFILE = join(homedir(), ".dsh", "profiles", "desktop");
const PKG = join(PROFILE, "package.json");
const NAME = "dsh-wanzh-hulian";
const FILE_DEP = "file:../../../project/Magpie-Horch/dsh-wanzh-hulian";

const pkg = JSON.parse(await readFile(PKG, "utf8"));
let changed = false;

if (pkg.dependencies?.[NAME] !== FILE_DEP) {
  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies[NAME] = FILE_DEP;
  changed = true;
  console.log(`依赖已登记: ${NAME} → ${FILE_DEP}`);
} else {
  console.log("依赖已存在，跳过");
}

const bundles = pkg.dsh?.profile?.bundles;
if (!Array.isArray(bundles)) {
  throw new Error("package.json 缺少 dsh.profile.bundles，请人工检查");
}
if (!bundles.includes(NAME)) {
  bundles.push(NAME);
  changed = true;
  console.log("bundles 已追加:", NAME);
} else {
  console.log("bundles 已存在，跳过");
}

if (changed) await writeFile(PKG, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log("pnpm install（profile）…");
const r = spawnSync("pnpm", ["install", "--no-frozen-lockfile", "--silent"], {
  cwd: PROFILE,
  stdio: "inherit",
  timeout: 5 * 60 * 1000
});
if (r.status !== 0) {
  console.error(`pnpm install 退出码 ${r.status}`);
  process.exit(r.status ?? 1);
}

const linked = join(PROFILE, "node_modules", NAME);
const src = "/Users/lute/project/Magpie-Horch/dsh-wanzh-hulian";
if (!existsSync(linked)) {
  console.error(`未找到安装产物: ${linked}`);
  process.exit(1);
}
const { statSync } = await import("node:fs");
const a = statSync(join(linked, "package.json"));
const b = statSync(join(src, "package.json"));
console.log(a.ino === b.ino ? "✓ 硬链接确认（file: 依赖与源码同 inode）" : "⚠ 未同 inode（可能为拷贝，仍可用但同步语义不同）");
console.log("完成。重启 DSH Desktop 后：设置 → 万物互联 页生效；/api/dsh-wanzh-hulian/list 可由宿主路由提供。");
