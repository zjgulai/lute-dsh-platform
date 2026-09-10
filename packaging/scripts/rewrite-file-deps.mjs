#!/usr/bin/env node
// LUTE 打包：profile 的 file: 依赖路径重写（包内自洽，决策 D4）
//
// 开发机布局：file:../../../project/Magpie-Horch/<name>（相对 profile 目录指向 fork 源）
// 目标机布局：fork 源随包落位 profile/vendor/<name> → 重写为 file:./vendor/<name>
//
// 用法：
//   node rewrite-file-deps.mjs <profile-dir>          # apply：改写 package.json + pnpm-lock.yaml（幂等）
//   node rewrite-file-deps.mjs --check <profile-dir>  # 校验：仍有旧路径则退出 1（用于安装器自检）
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const check = args[0] === '--check';
const profileDir = path.resolve(args[check ? 1 : 0] ?? '.');
const pkgPath = path.join(profileDir, 'package.json');
const lockPath = path.join(profileDir, 'pnpm-lock.yaml');

const OLD_PREFIXES = ['file:../../../project/Magpie-Horch/', 'file:/Users/lute/project/Magpie-Horch/'];
const NEW_PREFIX = 'file:./vendor/';

let changed = 0;

// ---- package.json ----
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
    const oldPrefix = OLD_PREFIXES.find((prefix) => typeof spec === 'string' && spec.startsWith(prefix));
    if (oldPrefix !== void 0) {
      const vendorName = spec.slice(oldPrefix.length).replace(/\/+$/, '');
      if (!vendorName) {
        console.error(`[rewrite] 无法解析 file: 依赖 ${name}: ${spec}`);
        process.exit(2);
      }
      const next = `${NEW_PREFIX}${vendorName}`;
      if (spec !== next) {
        changed += 1;
        if (!check) {
          pkg.dependencies[name] = next;
          console.log(`[rewrite] ${name}: ${spec} → ${next}`);
        } else {
          console.error(`[check] 需要重写: ${name}: ${spec} → ${next}`);
        }
      }
    }
  }
  if (!check && changed > 0) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
} else if (check) {
  console.error(`[check] 缺少 ${pkgPath}`);
  process.exit(2);
}

// ---- pnpm-lock.yaml ----
if (fs.existsSync(lockPath)) {
  let lock = fs.readFileSync(lockPath, 'utf8');
  let count = 0;
  for (const prefix of OLD_PREFIXES) count += lock.split(prefix).length - 1;
  if (count > 0) {
    changed += count;
    if (!check) {
      for (const prefix of OLD_PREFIXES) lock = lock.split(prefix).join(NEW_PREFIX);
      fs.writeFileSync(lockPath, lock);
      console.log(`[rewrite] pnpm-lock.yaml: ${count} 处 file: 绝对/相对路径 → ${NEW_PREFIX}`);
    } else {
      console.error(`[check] pnpm-lock.yaml 仍有 ${count} 处旧 file: 路径`);
    }
  }
} else if (check) {
  console.error(`[check] 缺少 ${lockPath}`);
  process.exit(2);
}

// ---- vendor 目录存在性 ----
for (const [name, spec] of Object.entries(
  JSON.parse(fs.readFileSync(pkgPath, 'utf8')).dependencies ?? {}
)) {
  if (typeof spec === 'string' && spec.startsWith(NEW_PREFIX)) {
    const vendorName = spec.slice(NEW_PREFIX.length);
    const dir = path.join(profileDir, 'vendor', vendorName);
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
      console.error(`[check] vendor 缺失: ${name} → ${dir}`);
      process.exit(2);
    }
  }
}

if (check && changed > 0) process.exit(1);
console.log(`[rewrite] ${check ? '校验通过' : '完成'}（${changed} 处改动）`);
