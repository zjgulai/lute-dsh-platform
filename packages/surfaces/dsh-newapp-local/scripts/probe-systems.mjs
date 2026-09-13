/**
 * Probe the reachability of every system in the catalog.
 *
 * ## Why this is a separate file and not a field in `systems.json`
 *
 * Reachability is a **measurement**, identity is a **fact**. `systems.json` is
 * regenerated from the portal and must stay byte-stable; a probe result carries
 * a date and changes when the site's mood changes. Writing the reading into the
 * identity file would make every re-sync look like a portal change. Two files,
 * two lifetimes (ADR-0009).
 *
 * ## Where the reading is allowed to travel
 *
 * The browser half **must not** call this: a network probe on the render path
 * makes the drawer slow when the portal is slow and empty when it is offline.
 * What the drawer reads is the last recorded reading, and the card states it as
 * of a date. That is a weaker claim than "it works right now", and it is the
 * honest one — see the card's status line.
 *
 * ## Why `probedOn` is a date, not a timestamp
 *
 * So that re-running the probe twice in one day is a no-op in `git diff`. The
 * interesting signal is "this system changed availability", not "this script ran
 * again".
 *
 * ## Usage
 *
 *   node scripts/probe-systems.mjs
 *
 * No credentials: every address in the catalog is reachable without a session,
 * and the probe records the cases where that stops being true. Exit code is 2
 * only when the catalog itself could not be read; an unreachable system is a
 * **result**, not a failure of the probe.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const systemsPath = join(packageRoot, 'src', 'catalog', 'systems.json')
const reachabilityPath = join(packageRoot, 'src', 'catalog', 'reachability.json')

/** Parallelism. Ten sockets is well inside anything the portal notices. */
const CONCURRENCY = 10
/** Per-request budget. One system measured 4.3s on 2026-09-13; 20s is slack, not patience. */
const TIMEOUT_MS = 20_000

/** The portal's own login page title — the signal that a card bounced to auth. */
const LOGIN_TITLE = '登录 LUTE AI Native Builder Lab'

/**
 * Fetch one system and describe what came back.
 *
 * Two independent signals, because they mean different things to a user:
 *  - `loginRequired` — the address itself bounces to the portal login. The card
 *    cannot be opened without a session, so it says so before you click.
 *  - `passwordField` — the page carries its own sign-in form. The entry opens,
 *    but the work is behind a second account; that is a different warning.
 * @param href - the system's address.
 * @returns the reading.
 */
async function probe(href) {
  const startedAt = Date.now()
  try {
    const response = await fetch(href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'dsh-newapp-catalog-probe/1.0' },
    })
    const html = await response.text()
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
    return {
      status: response.status,
      ok: response.ok,
      // Literally the portal's login page, not "a page that mentions 登录" —
      // several systems carry 登录 in their own navigation, and counting those
      // would put a false warning on an entry that opens perfectly well.
      loginRequired: title === LOGIN_TITLE,
      passwordField: /<input[^>]+type=["']password["']/i.test(html),
      title: title.slice(0, 80),
      ms: Date.now() - startedAt,
      error: '',
    }
  } catch (error) {
    return {
      status: 0,
      ok: false,
      loginRequired: false,
      passwordField: false,
      title: '',
      ms: Date.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

/**
 * Run tasks with a fixed number of workers, preserving input order.
 * @param items - the work list.
 * @param worker - the async body.
 * @returns results in input order.
 */
async function pooled(items, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

/** One line, always prefixed, so a wrapper can tell this script's voice apart. */
function say(message) {
  process.stdout.write(`[probe-systems] ${message}\n`)
}

async function main() {
  if (!existsSync(systemsPath)) {
    say('FAILED — src/catalog/systems.json is missing; run scripts/sync-systems.mjs first')
    process.exit(2)
  }
  const catalog = JSON.parse(readFileSync(systemsPath, 'utf8'))
  const systems = catalog.systems
  say(`probing ${String(systems.length)} systems…`)

  const readings = await pooled(systems, (system) => probe(system.href))

  const results = {}
  let reachable = 0
  let gated = 0
  systems.forEach((system, index) => {
    const reading = readings[index]
    results[system.slug] = reading
    if (reading.ok) reachable += 1
    if (reading.loginRequired) gated += 1
  })

  const document = {
    source: catalog.source,
    // A date, not a timestamp: two runs in one day must not differ.
    probedOn: new Date().toISOString().slice(0, 10),
    summary: { total: systems.length, reachable, loginRequired: gated },
    results,
  }
  writeFileSync(reachabilityPath, `${JSON.stringify(document, null, 2)}\n`)

  say(`wrote src/catalog/reachability.json — ${String(reachable)}/${String(systems.length)} reachable, ${String(gated)} behind login`)
  for (const system of systems) {
    const reading = results[system.slug]
    if (reading.ok && !reading.loginRequired) continue
    say(`  · ${system.slug}: ${reading.ok ? 'reachable' : `UNREACHABLE (${reading.error || String(reading.status)})`}${reading.loginRequired ? ' — entry is the login page' : ''}`)
  }
}

await main()
