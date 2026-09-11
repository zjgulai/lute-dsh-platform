#!/usr/bin/env node
/**
 * 组合词汇静态校验器（agent.cordis.yml linter）
 *
 * 权威校验仍是运行时 mount 校验（agentPresets.standingKeyFor / 真实 mount）；
 * 本工具把能在静态层抓到的错误前置到写盘之前：
 *   1) YAML 无法解析；
 *   2) 行形状缺失（id / name / cordis:group）；
 *   3) 重复 entry id（含 insert 生成）；
 *   4) isolate 只出现在 group 行上（true=entry-local realm，label=join realms 非池化）；
 *   5) 已知会发布服务的包裸置在 preset 根（必须裹 isolate realm 或归 host 平面）——启发式清单；
 *   6) disabled 行提示。
 *
 * 用法: node lint-preset.mjs <agent.cordis.yml|preset目录>
 * 退出码: 0=通过, 1=发现错误, 2=用法错误
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/yaml");

// 已知会向 root realm 发布服务的包（取自 standard preset 的 realm 语义注释）
const SERVICE_PUBLISHING_PACKAGES = [
  "@deepseek-ai/dsh-terminal",              // terminals（PTY registry）
  "@deepseek-ai/dsh-workflow-worker-thread", // workflowEngine
  "@deepseek-ai/dsh-plan-mode",             // planMode
  "@deepseek-ai/dsh-compaction-basic",      // compaction / toolResultPruner
  "@deepseek-ai/dsh-compaction-tool-result-pruner",
  "@deepseek-ai/dsh-fs-local",              // fs（bare 本地文件系统）
  "@deepseek-ai/dsh-tool-str-replace-editor",
];

function resolveTarget(argv) {
  const target = argv[2];
  if (target === undefined) return null;
  if (statSync(target).isDirectory()) return join(target, "agent.cordis.yml");
  return target;
}

/**
 * dsh-skill-subset 行的能力前置校验（2026-09-11 实测事故后补）。
 *
 * 两次真实事故的静态成因都在这里：
 *   - skills 写了磁盘上不存在的技能名 → 会话里 `skill(x)` 报 unknown，
 *     而 preset 侧只有一行无声的「目录里没有这个技能」；
 *   - positiveSource: 'dir' 而 skillsDir 不存在 → 插件仍会 register 一条
 *     缺 source/provider 的运行时技能，点开即抛
 *     `loaded skill "x" source must be a string`，整轮运行失败。
 * 权威校验仍是运行时 mount；本规则只把这些错误前置到写盘时。
 */
function lintSkillSubset(row, path, line, errors, presetDir) {
  const config = row.config;
  if (config === null || typeof config !== "object" || Array.isArray(config)) return;
  const skillsDir = typeof config.skillsDir === "string" && config.skillsDir !== ""
    ? config.skillsDir
    : join(homedir(), ".dsh", "skills");
  if (config.positiveSource === "dir" && !existsSync(skillsDir)) {
    errors.push(`${path}${line}: positiveSource: 'dir' 但 skillsDir 不存在（${skillsDir}）`);
  }
  if (!Array.isArray(config.skills)) return;
  // 技能有两个合法来源：显式 skillsDir（默认 ~/.dsh/skills），以及 preset 自带的
  // <preset>/skills/（preset 的 skill-filesystem 行经 customSkillDirs 读它）。
  // 实测：6 个 preset 的技能只在自带目录里，漏掉后者会把正确配置误报成错误。
  const ownDir = presetDir === undefined ? undefined : join(presetDir, "skills");
  for (const skill of config.skills) {
    if (typeof skill !== "string" || skill === "") continue;
    const candidates = [join(skillsDir, skill, "SKILL.md")];
    if (ownDir !== undefined) candidates.push(join(ownDir, skill, "SKILL.md"));
    if (!candidates.some((candidate) => existsSync(candidate))) {
      errors.push(`${path}${line}: skills 里的 "${skill}" 既不在 ${skillsDir} 也不在 preset 自带的 skills/ 下（会话里会被遮蔽或报 unknown）`);
    }
  }
}

/**
 * 校验一行 preset 条目。
 * @param {any} row 条目对象
 * @param {string} path 展示用路径
 * @param {string[]} errors 错误收集器
 * @param {string[]} warnings 警告收集器
 * @param {Set<string>} seenIds 已见 id 集合（查重）
 * @param {boolean} [inIsolate] 是否已处于 isolate realm 内
 * @param {string | undefined} [presetDir] preset 目录（用于解析自带的 skills/ 目录）
 */
function lintRow(row, path, errors, warnings, seenIds, inIsolate = false, presetDir = undefined) {
  const line = `#${row.__line ?? "?"}`;
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    errors.push(`${path}${line}: 行不是对象`);
    return;
  }
  if (row.name === "dsh-skill-subset") lintSkillSubset(row, path, line, errors, presetDir);
  const id = row.id;
  const isGroup = row.group === true;
  const name = row.name;
  const ownRealm = isGroup && row.isolate !== undefined;
  if (id === undefined) { errors.push(`${path}${line}: 缺 id`); return; }
  if (seenIds.has(id)) errors.push(`${path}${line}: 重复 entry id "${id}"（含 insert 生成与嵌套树）`);
  seenIds.add(id);
  if (name === undefined && !isGroup) {
    errors.push(`${path}${line}: 行 "${id}" 缺 name 且非 cordis:group`);
  }
  if (row.isolate !== undefined && !isGroup) {
    errors.push(`${path}${line}: isolate 出现在非 group 行 "${id}"（realm 只属于 group）`);
  }
  if (ownRealm) {
    for (const [sym, kind] of Object.entries(row.isolate)) {
      if (kind === true) {
        // entry-local realm：正确
      } else if (typeof kind === "string") {
        warnings.push(`${path}${line}: group "${id}" 的 isolate.${sym} 用了共享 label "${kind}" —— label 是 join realms 而非池化实例，第二个 preset 挂载同名 label 会 provide() 抛错`);
      } else {
        errors.push(`${path}${line}: group "${id}" 的 isolate.${sym} 值非法（应为 true 或 label 字符串）`);
      }
    }
  }
  if (!isGroup && !inIsolate && name !== undefined && SERVICE_PUBLISHING_PACKAGES.includes(name)) {
    errors.push(`${path}${line}: 行 "${id}" 是 "${name}"（发布服务），裸置在 preset 根会进 root realm —— 必须裹进带 isolate 的 group，或移到宿主组合`);
  }
  if (row.disabled === true) warnings.push(`${path}${line}: 行 "${id}" 已 disabled（如需启用删除 disabled 字段）`);
  if (isGroup && Array.isArray(row.config)) {
    for (const child of row.config) lintRow(child, `${path}[${id}]`, errors, warnings, seenIds, inIsolate || ownRealm, presetDir);
  } else if (isGroup) {
    warnings.push(`${path}${line}: group "${id}" 无 config 子行数组`);
  }
}

/** 对一个 preset 目录或 agent.cordis.yml 文件做静态校验。 */
export function lintFile(target) {
  if (!existsSync(target)) return { errors: [`文件不存在: ${target}`], warnings: [] };
  let rows;
  try {
    const text = readFileSync(target, "utf8");
    const doc = parse(text);
    if (!Array.isArray(doc)) throw new Error("顶层必须是数组");
    rows = doc;
  } catch (error) {
    return { errors: [`YAML 解析失败: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
  }
  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const presetDir = dirname(target);
  rows.forEach((row, index) => {
    row.__line = index + 1;
    lintRow(row, target, errors, warnings, seenIds, false, presetDir);
  });
  return { errors, warnings };
}

// CLI 入口（仅直接执行时运行；被 import 时跳过）
import { pathToFileURL } from "node:url";
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const target = resolveTarget(process.argv);
  if (target === null) {
    console.error("用法: node lint-preset.mjs <agent.cordis.yml|preset目录>");
    process.exit(2);
  }
  const { errors, warnings } = lintFile(target);
  for (const w of warnings) console.log(`[warn] ${w}`);
  for (const e of errors) console.log(`[error] ${e}`);
  console.log(errors.length === 0
    ? `[ok] ${target}: 静态校验通过（权威校验请用运行时 mount：standingKeyFor）`
    : `[fail] ${target}: ${errors.length} 个静态错误（${warnings.length} 个警告）`);
  process.exit(errors.length === 0 ? 0 : 1);
}
