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
import { join } from "node:path";
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

function lintRow(row, path, errors, warnings, seenIds, inIsolate = false) {
  const line = `#${row.__line ?? "?"}`;
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    errors.push(`${path}${line}: 行不是对象`);
    return;
  }
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
    for (const child of row.config) lintRow(child, `${path}[${id}]`, errors, warnings, seenIds, inIsolate || ownRealm);
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
    return { errors: [`YAML 解析失败: ${error.message}`], warnings: [] };
  }
  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  rows.forEach((row, index) => {
    row.__line = index + 1;
    lintRow(row, target, errors, warnings, seenIds);
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
