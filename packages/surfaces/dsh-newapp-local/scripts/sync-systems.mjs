/**
 * Sync the LUTE systems catalog from the live portal.
 *
 * ## What this script owns, and what it does not
 *
 * It owns **one** fact: the *identity* of each system the portal publishes —
 * slug, names, descriptions, tags, kind, call-to-action and address. It does not
 * own the **role mapping** (`catalog/role-map.json`, a human judgement the
 * portal does not carry) and it does not own **reachability**
 * (`catalog/reachability.json`, a measurement of the site *right now*, taken by
 * `probe-systems.mjs`). Three files, three owners, no field written twice
 * (ADR-0009).
 *
 * ## Why the output must be byte-stable
 *
 * Re-running this script on an unchanged site must produce a byte-identical
 * file, so that `git diff` is the whole of "what changed upstream". That is why
 * every list is sorted by slug, every field is normalised (whitespace collapsed,
 * entities decoded, attribute order fixed), and nothing time-stamped is written
 * here. A probe timestamp belongs to the probe's file, not to identity.
 *
 * ## Why the icon is decomposed instead of copied
 *
 * The portal ships each card's glyph as inline `<svg>`. Copying that markup
 * through and rendering it with `dangerouslySetInnerHTML` would turn a data file
 * into a script-injection surface. So the SVG is parsed here into a **closed
 * vocabulary** — `path` / `circle` / `rect` / `line` with a whitelisted attribute
 * set — and the browser half renders it as real React elements. Anything outside
 * that vocabulary is dropped and counted, so a future portal restyle shows up as
 * a non-zero "dropped" number rather than as a silently blank tile.
 *
 * ## Credentials
 *
 * The portal needs a session before it will serve `/systems.html`. Credentials
 * are read from the DSH credential store (`~/.dsh/.credentials.yaml`, mode 0600)
 * or from the environment, never from a file in this repository, and never
 * written anywhere by this script (AGENTS.md red line). Reading order:
 *
 *   1. `LUTE_PORTAL_EMAIL` / `LUTE_PORTAL_PASSWORD` in the environment
 *   2. the same two names under `refs:` in `~/.dsh/.credentials.yaml`
 *
 * ## Usage
 *
 *   node scripts/sync-systems.mjs            # fetch, parse, write
 *   node scripts/sync-systems.mjs --check    # fetch, parse, compare only
 *
 * `--check` exits 3 when the catalog on disk differs from what the portal now
 * serves, and 2 when the run itself failed (unreachable, unauthorised, or a
 * parse that did not yield the expected shape). A failed run never writes.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')
const catalogDir = join(packageRoot, 'src', 'catalog')
const systemsPath = join(catalogDir, 'systems.json')

const PORTAL = 'https://lute-tlz-dddd.top'
const SYSTEMS_PATH = '/systems.html'
const SESSION_PATH = '/portal/session'

/**
 * Every system the portal publishes lived under this domain on 2026-09-13.
 *
 * It is asserted rather than assumed: a card pointing anywhere else is either a
 * portal change this script must be taught about, or a tampered page — and both
 * are things to stop on rather than to write into a catalog the app will later
 * hand to the operating system's browser opener.
 */
const ALLOWED_HOST_SUFFIX = '.lute-tlz-dddd.top'

/** The icon vocabulary. An unknown element or attribute is dropped, and counted. */
const ICON_ELEMENTS = new Set(['path', 'circle', 'rect', 'line'])
const ICON_ATTRS = new Set([
  'd',
  'cx',
  'cy',
  'r',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
])

/** The portal's own category axis. Kept because dropping a published fact is a loss. */
const SOURCE_CATEGORIES = new Set(['creation', 'insight', 'growth', 'ai', 'operations'])

// ── credentials ──────────────────────────────────────────────────────────────

/**
 * Read one ref from the DSH credential store without ever echoing a value.
 * @param name - the ref's name.
 * @returns the value, or undefined when the store or the ref is absent.
 */
function credentialFromStore(name) {
  const path = join(homedir(), '.dsh', '.credentials.yaml')
  if (!existsSync(path)) return undefined
  const text = readFileSync(path, 'utf8')
  const refsAt = text.indexOf('\nrefs:')
  if (refsAt < 0) return undefined
  for (const line of text.slice(refsAt).split('\n')) {
    const match = /^\s{2}([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (match === null) continue
    if (match[1] !== name) continue
    const value = match[2].trim().replace(/^["']|["']$/g, '')
    return value === '' ? undefined : value
  }
  return undefined
}

/**
 * Resolve the portal credentials, environment first.
 * @returns the pair, or a reason the pair is unusable.
 */
function resolveCredentials() {
  const email = process.env['LUTE_PORTAL_EMAIL'] ?? credentialFromStore('LUTE_PORTAL_EMAIL')
  const password = process.env['LUTE_PORTAL_PASSWORD'] ?? credentialFromStore('LUTE_PORTAL_PASSWORD')
  const missing = []
  if (email === undefined) missing.push('LUTE_PORTAL_EMAIL')
  if (password === undefined) missing.push('LUTE_PORTAL_PASSWORD')
  if (missing.length > 0) return { ok: false, reason: `missing credential(s): ${missing.join(', ')}` }
  return { ok: true, email, password }
}

// ── fetching ─────────────────────────────────────────────────────────────────

/**
 * Log in and return the session cookie header value.
 * @param email - portal account.
 * @param password - portal password.
 * @returns the `Cookie` header value, or a reason login failed.
 */
async function login(email, password) {
  let response
  try {
    response = await fetch(`${PORTAL}${SESSION_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      redirect: 'manual',
    })
  } catch (error) {
    return { ok: false, reason: `login request failed: ${describe(error)}` }
  }
  if (response.status === 401) return { ok: false, reason: 'login rejected (401) — credentials are wrong or revoked' }
  if (!response.ok) return { ok: false, reason: `login answered ${String(response.status)}` }

  const raw = response.headers.getSetCookie?.() ?? []
  const cookies = raw.map((one) => one.split(';')[0]).filter((one) => one.includes('='))
  if (cookies.length === 0) return { ok: false, reason: 'login succeeded but set no cookie' }
  return { ok: true, cookie: cookies.join('; ') }
}

/**
 * Fetch the systems page with a session cookie.
 * @param cookie - the `Cookie` header value.
 * @returns the HTML, or a reason the fetch failed.
 */
async function fetchSystems(cookie) {
  let response
  try {
    response = await fetch(`${PORTAL}${SYSTEMS_PATH}`, { headers: { cookie }, redirect: 'manual' })
  } catch (error) {
    return { ok: false, reason: `systems request failed: ${describe(error)}` }
  }
  // A 302 here means the session did not take: the portal bounces to login.
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, reason: `systems request redirected (${String(response.status)}) — session not accepted` }
  }
  if (!response.ok) return { ok: false, reason: `systems request answered ${String(response.status)}` }
  return { ok: true, html: await response.text() }
}

/** One error rendered legibly, since "fetch failed" alone tells nobody anything. */
function describe(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

// ── parsing ──────────────────────────────────────────────────────────────────

/** Collapse whitespace and decode the entities the portal actually emits. */
function text(raw) {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Pull the first element carrying a class, tags stripped.
 * @param body - the card's inner HTML.
 * @param className - the class to look for.
 * @returns the text, or '' when the element is absent.
 */
function field(body, className) {
  const match = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</`).exec(body)
  return match === null ? '' : text(match[1])
}

/**
 * Parse one `<svg>` into the closed icon vocabulary.
 * @param svg - the raw markup, or '' when the card carried no glyph.
 * @returns the primitives plus how many nodes were dropped.
 */
function parseIcon(svg) {
  const shapes = []
  let dropped = 0
  for (const match of svg.matchAll(/<([a-z]+)([^>]*?)\/?>/g)) {
    const tag = match[1]
    if (tag === 'svg') continue
    if (!ICON_ELEMENTS.has(tag)) {
      dropped += 1
      continue
    }
    const attrs = {}
    for (const attr of match[2].matchAll(/([a-z-]+)="([^"]*)"/g)) {
      if (!ICON_ATTRS.has(attr[1])) continue
      attrs[attr[1]] = attr[2]
    }
    if (Object.keys(attrs).length === 0) {
      dropped += 1
      continue
    }
    shapes.push({ tag, attrs })
  }
  return { shapes, dropped }
}

/**
 * Turn one card's hostname into the catalog's stable slug.
 *
 * The slug is derived from the address rather than from the title, because the
 * title is prose that gets reworded and the address is what actually resolves.
 * `platform.shopify` → `platform-shopify`.
 * @param hostname - the card's host.
 * @returns the slug.
 */
function slugFor(hostname) {
  return hostname.replace(ALLOWED_HOST_SUFFIX, '').split('.').join('-')
}

/**
 * Extract every system card from the page.
 * @param html - the fetched page.
 * @returns the parsed entries plus any structural complaints worth stopping on.
 */
function parseCards(html) {
  const problems = []
  const entries = []
  let droppedIconNodes = 0

  const cardPattern = /<a class="card[^"]*"\s+href="([^"]+)"\s+data-category="([^"]*)"([\s\S]*?)<\/a>/g
  for (const match of html.matchAll(cardPattern)) {
    const [, href, category, body] = match
    let url
    try {
      url = new URL(href)
    } catch {
      problems.push(`unparseable href: ${href}`)
      continue
    }
    if (url.protocol !== 'https:') {
      problems.push(`non-https card: ${href}`)
      continue
    }
    if (!url.hostname.endsWith(ALLOWED_HOST_SUFFIX)) {
      problems.push(`card outside ${ALLOWED_HOST_SUFFIX}: ${href}`)
      continue
    }
    if (!SOURCE_CATEGORIES.has(category)) {
      problems.push(`unknown source category "${category}" on ${href}`)
      continue
    }

    const iconMatch = /<div class="card-icon[^"]*">\s*(<svg[\s\S]*?<\/svg>)/.exec(body)
    const icon = parseIcon(iconMatch === null ? '' : iconMatch[1])
    droppedIconNodes += icon.dropped

    const tags = [...body.matchAll(/<span class="chip(?![^"]*status)[^"]*">([\s\S]*?)<\/span>/g)]
      .map((one) => text(one[1]))
      .filter((one) => one !== '')
    const kind = /<span class="chip status[^"]*">([\s\S]*?)<\/span>/.exec(body)

    const entry = {
      slug: slugFor(url.hostname),
      name: field(body, 'card-title'),
      nameEn: field(body, 'card-subtitle'),
      desc: field(body, 'card-desc'),
      descEn: field(body, 'card-desc-en'),
      kind: kind === null ? '' : text(kind[1]),
      tags,
      cta: field(body, 'card-cta'),
      href: `${url.protocol}//${url.hostname}`,
      host: url.hostname,
      sourceCategory: category,
      icon: icon.shapes,
    }
    for (const key of ['name', 'nameEn', 'desc', 'kind', 'cta']) {
      if (entry[key] === '') problems.push(`card ${entry.slug}: empty "${key}"`)
    }
    if (entry.icon.length === 0) problems.push(`card ${entry.slug}: no icon survived the vocabulary`)
    entries.push(entry)
  }

  entries.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))

  const hosts = new Set()
  for (const entry of entries) {
    if (hosts.has(entry.host)) problems.push(`duplicate host in catalog: ${entry.host}`)
    hosts.add(entry.host)
  }
  if (entries.length === 0) problems.push('no cards parsed — the page shape changed')

  return { entries, problems, droppedIconNodes }
}

// ── main ─────────────────────────────────────────────────────────────────────

/** One line, always prefixed, so a wrapper can tell this script's voice apart. */
function say(message) {
  process.stdout.write(`[sync-systems] ${message}\n`)
}

async function main() {
  const check = process.argv.includes('--check')

  const credentials = resolveCredentials()
  if (!credentials.ok) {
    say(`FAILED — ${credentials.reason}`)
    say('set LUTE_PORTAL_EMAIL / LUTE_PORTAL_PASSWORD, or add both refs to ~/.dsh/.credentials.yaml')
    process.exit(2)
  }

  const session = await login(credentials.email, credentials.password)
  if (!session.ok) {
    say(`FAILED — ${session.reason}`)
    process.exit(2)
  }

  const page = await fetchSystems(session.cookie)
  if (!page.ok) {
    say(`FAILED — ${page.reason}`)
    process.exit(2)
  }

  const parsed = parseCards(page.html)
  if (parsed.problems.length > 0) {
    say(`FAILED — the portal served a page this script cannot vouch for (${String(parsed.problems.length)} problem(s)):`)
    for (const problem of parsed.problems) say(`  · ${problem}`)
    say('nothing was written')
    process.exit(2)
  }
  if (parsed.droppedIconNodes > 0) {
    say(`note: ${String(parsed.droppedIconNodes)} icon node(s) fell outside the vocabulary and were dropped`)
  }

  const document = {
    // Where this came from, so a reader can re-derive it without reading this script.
    source: `${PORTAL}${SYSTEMS_PATH}`,
    // The vocabulary is declared in-band: a browser half that meets an unknown
    // tag knows the catalog was produced by a newer parser.
    iconVocabulary: { elements: [...ICON_ELEMENTS].sort(), attributes: [...ICON_ATTRS].sort() },
    systems: parsed.entries,
  }
  const serialised = `${JSON.stringify(document, null, 2)}\n`

  if (check) {
    const previous = existsSync(systemsPath) ? readFileSync(systemsPath, 'utf8') : ''
    if (previous === serialised) {
      say(`OK — ${String(parsed.entries.length)} systems, catalog is current`)
      process.exit(0)
    }
    say(`DRIFT — the portal now serves something other than catalog/systems.json`)
    say(`  on disk: ${String(previous.split('\n').length)} lines`)
    say(`  fetched: ${String(serialised.split('\n').length)} lines`)
    process.exit(3)
  }

  // The catalog directory is a build input, not a hand-made fixture: a fresh
  // clone has none, and a first run that dies on ENOENT would read as "the
  // portal is broken".
  mkdirSync(catalogDir, { recursive: true })
  writeFileSync(systemsPath, serialised)
  say(`wrote ${String(parsed.entries.length)} systems to src/catalog/systems.json`)}

await main()
