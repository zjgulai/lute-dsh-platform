#!/usr/bin/env node
// One-command re-apply of the 4 local patches applied to this DSH Desktop profile.
// Idempotent: each step detects whether it is already applied and skips if so.
// Run after any reinstall / `dsh plugin add` that regenerates node_modules.
//
// Usage: node apply-patches.mjs
import fs from 'node:fs';
import path from 'node:path';

const NM = path.join(process.env.DSH_HOME ?? path.join(require('node:os').homedir(), '.dsh'), 'profiles', 'desktop', 'node_modules');

function read(rel) {
  return fs.readFileSync(path.join(NM, rel), 'utf8');
}
function write(rel, content) {
  fs.writeFileSync(path.join(NM, rel), content);
}

// ---------------------------------------------------------------------------
// 1. @furongjun1999/dsh-memory — remove the roleplay web surface
// ---------------------------------------------------------------------------
{
  const file = '@furongjun1999/dsh-memory/lib/index.js';
  const c = read(file);
  if (!c.includes('installRoleplayWeb')) {
    console.log('[ok] dsh-memory roleplay removal: already applied');
  } else {
    const next = c
      .replace("import { installRoleplayWeb } from './roleplay_web.js';\n", '')
      .replace(/\t*\/\/ 角色扮演网页[^\n]*\n\t*await installRoleplayWeb\(ctx, bridge, config, disposers\);\n/, '')
      .replace(/ *\/\/ 角色扮演网页[^\n]*\n *await installRoleplayWeb\(ctx, bridge, config, disposers\);\n/, '');
    write(file, next);
    console.log('[patched] dsh-memory roleplay removal');
  }
}

// ---------------------------------------------------------------------------
// 2. @deepseek-ai/dsh-deepresearch — skip http provider when already mounted
// ---------------------------------------------------------------------------
{
  const file = '@deepseek-ai/dsh-deepresearch/lib/index.js';
  const c = read(file);
  if (c.includes('web.fetchProviders.has("http")')) {
    console.log('[ok] deepresearch http provider fix: already applied');
  } else {
    const next = c.replace(
      'return web !== void 0 && typeof web.registerFetchProvider === "function";',
      'if (web === void 0 || typeof web.registerFetchProvider !== "function") return false;\n\treturn !web.fetchProviders.has("http");',
    );
    write(file, next);
    console.log('[patched] deepresearch http provider fix');
  }
}

// ---------------------------------------------------------------------------
// 3. dsh-agent-team-gui — tolerate missing hostDescription (use generation)
// ---------------------------------------------------------------------------
{
  const file = 'dsh-agent-team-gui/lib/client.js';
  const c = read(file);
  const hasGuard = c.includes('if (source == null || typeof source.subscribe !== "function") return () => {};');
  const hasCall = c.includes('connection.generation ?? connection.hostDescription');
  if (hasGuard && hasCall) {
    console.log('[ok] agent-team-gui hostDescription->generation: already applied');
  } else {
    let next = c;
    if (!hasGuard) {
      next = next.replace(
        'function refreshAgentTeamsOnReconnect(controller, source) {\n\t\t\tconst retryDelays = [',
        'function refreshAgentTeamsOnReconnect(controller, source) {\n\t\t\tif (source == null || typeof source.subscribe !== "function") return () => {};\n\t\t\tconst retryDelays = [',
      );
    }
    if (!hasCall) {
      next = next.replace(
        'ctx.effect(() => refreshAgentTeamsOnReconnect(controller, connection.hostDescription), "agent-team-gui: refresh durable teams after reconnect");',
        'const reconnectSource = connection.generation ?? connection.hostDescription;\n\t\t\tctx.effect(() => refreshAgentTeamsOnReconnect(controller, reconnectSource), "agent-team-gui: refresh durable teams after reconnect");',
      );
    }
    write(file, next);
    console.log('[patched] agent-team-gui hostDescription->generation');
  }
}

// ---------------------------------------------------------------------------
// 4. dsh-theme — align client inject to what the code actually uses
// ---------------------------------------------------------------------------
{
  const file = 'dsh-theme/package.json';
  const pkg = JSON.parse(read(file));
  const inject = pkg.dsh?.client?.inject;
  const want = ['@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-theme'];
  const aligned = Array.isArray(inject) && inject.length === want.length && inject.every((x, i) => x === want[i]);
  if (aligned) {
    console.log('[ok] dsh-theme inject alignment: already applied');
  } else {
    pkg.dsh.client.inject = want;
    write(file, JSON.stringify(pkg, null, 2) + '\n');
    console.log('[patched] dsh-theme inject alignment');
  }
}

// ---------------------------------------------------------------------------
// 5. @deepseek-ai/dsh-file-reference-local — core package override.
//    Fixes "agent/disposed listener threw: Cannot read properties of undefined
//    (reading 'catch')" caused by `fiber.dispose().catch(...)` where dispose()
//    returns undefined. We ship a patched copy into the profile node_modules
//    with a higher version so the profile overlay resolution picks it.
// ---------------------------------------------------------------------------
{
  const pkg = '@deepseek-ai/dsh-file-reference-local';
  const targetDir = path.join(NM, pkg);
  const targetLib = path.join(targetDir, 'lib/index.js');
  const already = fs.existsSync(targetLib) && fs.readFileSync(targetLib, 'utf8').includes('Promise.resolve(fiber.dispose())');
  if (already) {
    console.log('[ok] file-reference-local override: already applied');
  } else {
    const src = `/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/${pkg}`;
    if (!fs.existsSync(path.join(src, 'lib/index.js'))) {
      console.log('[skip] file-reference-local override: app source not found (app updated? re-check version bump)');
    } else {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.cpSync(src, targetDir, { recursive: true });
      const pj = path.join(targetDir, 'package.json');
      const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
      // Bump so profile copy wins the semver overlay compare against the app copy.
      j.version = `${j.version}-override`;
      fs.writeFileSync(pj, JSON.stringify(j, null, 2) + '\n');
      let c = fs.readFileSync(targetLib, 'utf8');
      c = c.replace('fiber.dispose().catch((error) => {', 'Promise.resolve(fiber.dispose()).catch((error) => {');
      fs.writeFileSync(targetLib, c);
      console.log('[patched] file-reference-local override');
    }
  }
}


// ---------------------------------------------------------------------------
// 5. dsh-better-sidebar — 任务管理/子代理空态文案人话化（P1.5c）
// ---------------------------------------------------------------------------
{
  const file = 'dsh-better-sidebar/lib/client.js';
  const c0 = fs.readFileSync(path.join(NM, file), 'utf8');
  const swaps = [
    ['subagentEmpty: "暂无子代理"', 'subagentEmpty: "还没有子代理"'],
    ['subagentEmptyDesc: "当前主代理派生的子代理将显示在这里"', 'subagentEmptyDesc: "你让主代理派出子代理后，它们会出现在这里。"'],
    ['subagentEmpty: "No subagents"', 'subagentEmpty: "No subagents yet"'],
    ['subagentEmptyDesc: "Subagents spawned under the main agent will appear here"', 'subagentEmptyDesc: "Subagents you spawn from the main agent will appear here."'],
  ];
  let c = c0;
  for (const [oldS, newS] of swaps) if (c.includes(oldS)) c = c.replace(oldS, newS);
  if (c === c0) {
    console.log('[ok] dsh-better-sidebar empty-state copy: already applied');
  } else {
    fs.writeFileSync(path.join(NM, file), c);
    console.log('[patched] dsh-better-sidebar empty-state copy');
  }
}

// ---------------------------------------------------------------------------
// 6. @zseven-w/dsh-noema — 状态路由恢复真实 ok（不再硬编码 ok:true 掩蔽故障）
// ---------------------------------------------------------------------------
{
  const file = '@zseven-w/dsh-noema/lib/status-route.js';
  const c = read(file);
  if (c.includes('const { ok, ...status }')) {
    console.log('[ok] noema status real ok: already applied');
  } else {
    const next = c.replace(
      'const { ok: _ok, ...status } = await manager.status();\n        return {\n            ok: true,',
      'const { ok, ...status } = await manager.status();\n        return {\n            ok,'
    );
    write(file, next);
    console.log('[patched] noema status real ok');
  }
}

// ---------------------------------------------------------------------------
// 7. @zseven-w/dsh-noema — import ledger 原子写（tmp + rename）
// ---------------------------------------------------------------------------
{
  const file = '@zseven-w/dsh-noema/lib/import-service.js';
  const c = read(file);
  if (c.includes('rename(tmpPath, path)')) {
    console.log('[ok] noema ledger atomic: already applied');
  } else {
    const next = c
      .replace(
        "import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';",
        "import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';"
      )
      .replace(
        "    await mkdir(dirname(path), { recursive: true });\n    await writeFile(path, JSON.stringify(ledger, null, 2) + '\\n', { mode: 0o600 });",
        "    await mkdir(dirname(path), { recursive: true });\n    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;\n    await writeFile(tmpPath, JSON.stringify(ledger, null, 2) + '\\n', { mode: 0o600 });\n    await rename(tmpPath, path);"
      );
    write(file, next);
    console.log('[patched] noema ledger atomic');
  }
}

// ---------------------------------------------------------------------------
// 8. dshmarket — restoreProfileBackup 加日志（静默回滚显性化）
// ---------------------------------------------------------------------------
{
  const file = 'dshmarket/lib/backup.js';
  const c = read(file);
  if (c.includes('restoreProfileBackup: restoring')) {
    console.log('[ok] dshmarket restore log: already applied');
  } else {
    const next = c.replace(
      '    mkdirSync(root, { recursive: true });\n',
      '    mkdirSync(root, { recursive: true });\n    console.error(`[dshmarket] restoreProfileBackup: restoring ${backup.files.length} file(s) into ${root}`);\n'
    );
    write(file, next);
    console.log('[patched] dshmarket restore log');
  }
}

console.log('Done.');

