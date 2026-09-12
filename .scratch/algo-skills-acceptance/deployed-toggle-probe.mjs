#!/usr/bin/env node
/**
 * Drive the SHIPPED host artifact — not `src/` — through a real HTTP server.
 *
 * Why this file exists next to `live-toggle-probe.py`:
 *
 *   - `live-toggle-probe.py` talks to the app process that is actually running.
 *     That process imported this plugin at hot-mount time, so a source edit made
 *     afterwards is *not* in it until the app restarts. Good for "is the host
 *     up?", useless for "is today's code correct?".
 *   - `vitest` runs against `src/`, which is the code under review rather than
 *     the code the host loads.
 *
 * So this probe imports `lib/index.js` from the *installed profile* (the exact
 * file `package.json#exports` resolves for the host), mounts it into a
 * three-member context — `effect` / `logger` / `webServer.register`, the whole
 * surface `src/index.ts` touches, all three read off that file — and serves the
 * routes it registers over a real `node:http` server. Nothing else is a stand-in:
 * the corpus is the real 1338 cards, the requests are real HTTP, the writer is
 * the shipped one.
 *
 * Asserted: a toggle round trip leaves the file byte-identical, the trust fence
 * holds, and the tree reflects a write immediately (cache invalidation).
 *
 * Usage:  node deployed-toggle-probe.mjs
 * Exit 0 = every expectation held and the corpus is byte-identical to the start.
 */

import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REPO = new URL('../../packages/surfaces/dsh-algo-skills-local/lib/index.js', import.meta.url).pathname
const DEPLOYED = join(homedir(), '.dsh/profiles/desktop/node_modules/dsh-algo-skills-local/lib/index.js')
const SKILLS = join(homedir(), '.dsh/skills')
const CARD = 'p2s-a-mem-agentic-memory-system'
const FILE = join(SKILLS, CARD, 'SKILL.md')

const results = []
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) console.log(`        got  = ${JSON.stringify(got)}\n        want = ${JSON.stringify(want)}`)
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

// ---- 0. the artifact under test is the one the host loads ------------------
const repoStat = statSync(REPO)
const deployedStat = statSync(DEPLOYED)
check('the deployed artifact IS the repo artifact (same inode)', deployedStat.ino === repoStat.ino, true)
check('  …same size', deployedStat.size === repoStat.size, true)
console.log(`        ${DEPLOYED}\n        inode ${deployedStat.ino} · ${deployedStat.size} bytes`)

// ---- 1. mount it the way the host does ------------------------------------
const registered = []
const ctx = {
  // cordis: run immediately, treat the return value as the disposer.
  effect(effect) { return effect() },
  logger: { warn: (error) => console.error('[plugin warn]', error) },
  webServer: { register(route) { registered.push(route); return () => {} } },
  // no remoteWebUiPairing: the fence must stay loopback-only on its own.
}
const { apply, ROUTES } = await import(DEPLOYED)
apply(ctx, { skillsRoot: SKILLS, cacheTtlMs: 0 })
const byPath = new Map(registered.map((route) => [route.path, route]))
check('the artifact registered exactly the three routes', [...byPath.keys()].sort(), Object.values(ROUTES).sort())

const server = createServer((req, res) => {
  const route = byPath.get(new URL(req.url ?? '/', 'http://x').pathname)
  if (route === undefined) { res.writeHead(404).end(); return }
  void route.handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const BASE = `http://127.0.0.1:${server.address().port}`
console.log(`        serving on ${BASE}\n`)

async function call(path, method = 'GET', body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  try { return [res.status, JSON.parse(text)] } catch { return [res.status, text] }
}

const originalBytes = readFileSync(FILE)
const original = originalBytes.toString('utf8')
const originalSha = sha(FILE)
console.log(`probe card: ${CARD}`)
console.log(`sha256    : ${originalSha}`)
console.log(`on disk   : ${original.split('\n').find((l) => l.startsWith('disable-model-invocation:'))}\n`)

try {
  const [, tree] = await call(ROUTES.tree)
  check('tree totals come from the real corpus',
    [tree.totals.skills, tree.totals.planes, tree.totals.roles], [1338, 4, 50])

  const [onStatus, onBody] = await call(ROUTES.toggle, 'POST', { name: CARD, enabled: true })
  check('POST toggle enabled=true -> 200', [onStatus, onBody.ok, onBody.enabled], [200, true, true])
  const afterOn = readFileSync(FILE, 'utf8')
  check('the flipped key changes value, not spelling',
    afterOn.split('\n').find((l) => l.startsWith('disable-model-invocation:')),
    'disable-model-invocation: "false"')

  const [, treeAfter] = await call(ROUTES.tree)
  const seen = treeAfter.planes.flatMap((p) => p.domains).flatMap((d) => d.roles)
    .flatMap((r) => r.skills).find((c) => c.name === CARD)
  check('the tree shows the write immediately (no restart, no TTL wait)', seen.modelEnabled, true)

  await call(ROUTES.toggle, 'POST', { name: CARD, enabled: false })
  check('a toggle that ends where it started leaves the file byte-identical', sha(FILE), originalSha)

  check('a hand-authored neighbour is refused',
    await call(ROUTES.toggle, 'POST', { name: 'agent-browser', enabled: true }), [400, { ok: false, error: 'invalid name' }])
  check('traversal is refused',
    await call(ROUTES.toggle, 'POST', { name: '../SKILL.md', enabled: true }), [400, { ok: false, error: 'invalid name' }])
  check('an unknown p2s name is 404',
    await call(ROUTES.toggle, 'POST', { name: 'p2s-nope-nope', enabled: true }), [404, { ok: false, error: 'not found' }])
  check('GET on toggle -> 405', (await call(ROUTES.toggle))[0], 405)
  check('POST on tree -> 405', (await call(ROUTES.tree, 'POST', {}))[0], 405)
  check('health agrees with the tree', (await call(ROUTES.health))[1].totals.skills, 1338)
} finally {
  server.close()
  if (sha(FILE) !== originalSha) {
    writeFileSync(FILE, originalBytes)
    console.log('\nRESTORED from the in-memory copy')
  }
  console.log(`corpus unchanged: ${sha(FILE) === originalSha}`)
}

const ok = results.every(Boolean) && sha(FILE) === originalSha
console.log(`\n${ok ? 'PASS' : 'FAIL'} — ${results.filter(Boolean).length}/${results.length} checks`)
process.exit(ok ? 0 : 1)
