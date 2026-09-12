/**
 * 岗位骨架的运行时读取（**有 IO**，与 org-tree.js 的纯函数分开）。
 *
 * 事实的家是**已安装的 preset**：`~/.dsh/.agent-presets/agt-NNN/manifest.json`。
 * 面 / 责任域来自 `x_lute.plane`、`x_lute.domain`；岗位名的来源是材料
 * `material.role_catalog.record`；接线名单是 `x_lute.skills.subset`（preset 的
 * skill-subset 实际挂载的英文技能 id）。本模块**不复制**任何组织骨架，
 * 也就不会与材料或生成器产生第二份事实。
 */
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_DIR = join(homedir(), ".dsh", ".agent-presets");

/**
 * @param {{dir?:string}} [options]
 * @returns {Promise<{roles:Array<object>, problems:string[], dir:string}>}
 */
export async function loadRoleSkeleton(options = {}) {
  const dir = options.dir ?? DEFAULT_DIR;
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { roles: [], problems: [`读不到 preset 目录 ${dir}：${detail}`], dir };
  }

  const roles = [];
  const problems = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("agt-")) continue;
    let manifest;
    try {
      manifest = JSON.parse(await readFile(join(dir, entry.name, "manifest.json"), "utf8"));
    } catch {
      problems.push(`${entry.name}：manifest.json 读不到或不是 JSON（跳过）`);
      continue;
    }
    const x = manifest.x_lute ?? {};
    const record = manifest.material?.role_catalog?.record ?? {};
    // manifest.id 是小写目录名（agt-021）；组织骨架里的岗位 id 一律大写（AGT-021）。
    const id = String(manifest.id ?? entry.name).toUpperCase();
    if (!x.plane?.id || !x.domain?.id) {
      problems.push(`${id}：manifest.x_lute 缺 plane/domain（跳过）`);
      continue;
    }
    roles.push({
      id,
      alias: record.alias ?? "",
      title: record.title ?? manifest.name ?? "",
      plane: { id: x.plane.id, name: x.plane.name ?? "" },
      domain: { id: x.domain.id, name: x.domain.name ?? "" },
      order: typeof x.order === "number" ? x.order : 9999,
      icon: typeof manifest.icon === "string" ? manifest.icon : "",
      artifact: record.artifact ?? "",
      responsibilities: Array.isArray(record.skills) ? record.skills.slice() : [],
      wired: Array.isArray(x.skills?.subset) ? x.skills.subset.slice() : [],
    });
  }
  return { roles, problems, dir };
}
