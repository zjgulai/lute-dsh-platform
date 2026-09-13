/**
 * Product cards — the drawer's read of what the launcher's own route reported,
 * plus the one decision the whole surface exists to get right: **what happens
 * when the user clicks**.
 *
 * ## Why this is client-side and total
 *
 * The browser half and the installed host half are two files that can be at
 * different versions — not a hypothetical: while writing this module the running
 * app was serving a host build that had `/api/dsh-newapp/health` but not yet
 * `/api/dsh-newapp/products`, and the route answered 401 exactly as if the
 * plugin were absent. So the client cannot treat the payload as trusted types;
 * it parses `unknown` into a well-formed view or reports why it could not. A
 * parser that threw here would blank the drawer on a version skew the user
 * cannot see.
 *
 * ## Why the open decision is a pure function
 *
 * "点开必能用" is the card's whole contract, and the failure mode is a button
 * that looks live and does nothing. Three levels, each stated:
 *
 *   1. the product's entry service is registered  → hand it the declaration;
 *   2. it is not, but the declaration names a preset the machine actually has
 *      → fall back to the worktable's verified triple (create → select → open);
 *   3. otherwise → the button is **disabled and says why**, in the card.
 *
 * Written as arithmetic over `(declared, service registered, preset installed)`
 * it is testable without a DOM or a running app, which is the only way the
 * third level ever gets tested at all.
 *
 * @module dsh-newapp-local/client/product-cards
 */

/** One feature, reduced to what a card shows. */
export interface FeatureView {
  id: string
  label: string
  kind: string
  /** How many `steps[]` the feature declares (0 when it declares none). */
  steps: number
  /** How many `inputs[]` the entry panel will render (0 when it declares none). */
  inputs: number
}

/** One product, normalized for display. */
export interface ProductView {
  id: string
  name: string
  summary: string
  version: string
  status: 'draft' | 'ready'
  /** Why the product is in that state — a machine-readable field, not prose in a repo. */
  statusReason: string
  /** The preset this product belongs to (ADR-0033: required). */
  preset: string
  /** The client service the entry panel is published under ('' when undeclared). */
  service: string
  /** The method to call on that service ('' means `open`). */
  entryAction: string
  features: FeatureView[]
  /** The declaration verbatim — what the entry panel receives, unchanged. */
  declaration: Record<string, unknown>
}

/** One working directory that declares at least one product. */
export interface CardView {
  /** Absolute working directory — metadata on the card, not its identity. */
  dir: string
  /** Display name: the directory's basename. */
  label: string
  /** The declared products. Never empty: a directory that declares nothing is not a card. */
  products: ProductView[]
}

/**
 * One product card — **the grid cell** (R4: one product, one card).
 *
 * The card is keyed by the product, and the directory it happens to live in is
 * carried as metadata. That inversion is the whole of the change: previously the
 * card was the directory and the products hung off it, which meant a machine
 * with 25 project directories and 1 product rendered 25 cards.
 */
export interface ProductCardView {
  /**
   * Render key: `<dir>::<product id>`.
   *
   * Not the product id alone — ids are authored by whoever owns the product and
   * two directories are free to pick the same one. Not the directory alone
   * either: one directory may declare several products, and the key has to tell
   * those apart.
   */
  key: string
  /** The product this card is about. */
  product: ProductView
  /** Absolute working directory the product is declared in. */
  dir: string
  /** Display name of that directory. */
  dirLabel: string
}

/** The scan, including exactly what was read and what was not. */
export interface ScanView {
  /** Roots the host actually scanned. Empty means it scanned nothing. */
  scannedRoots: string[]
  /** Roots that could not be scanned at all. */
  skipped: Array<{ root: string; reason: string }>
  /** Declarations that exist but were unusable. */
  unreadable: Array<{ dir: string; reason: string }>
  /** Every working directory that declares a product. */
  cards: CardView[]
  /** How many of them declared a product. Equals `cards.length`. */
  declaredCount: number
  /**
   * Directories examined that declared nothing usable.
   *
   * The only trace such a directory leaves on this surface (R3) — the drawer
   * reports the number in one line instead of spending a card on it.
   */
  undeclaredCount: number
  /** Whether the host bounded the list. */
  truncated: boolean
}

/** Result of parsing the route payload. */
export type ScanResult = { ok: true; scan: ScanView } | { ok: false; reason: string }

/**
 * Why a card cannot open anything. Closed set — each has copy in locales.ts.
 *
 * Shorter than it used to be, and that is the point: `undeclared` and
 * `unreadable` named directories that had no product to open, and such
 * directories no longer reach the card list at all. Every remaining reason is
 * about a product that *is* here but cannot be started.
 */
export type BlockReason = 'no-preset' | 'no-preset-installed'

/** What pressing the card's button will do. */
export type OpenPlan =
  | { level: 1; kind: 'panel'; service: string; action: string }
  | { level: 2; kind: 'session'; preset: string }
  | { level: 3; kind: 'disabled'; reason: BlockReason }

/** Read a string-valued property without trusting the payload's shape. */
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Read an object as a plain record. */
function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Read an array, defaulting to empty. */
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Normalize one product object from the scan payload.
 *
 * `declaration` is carried through **by reference**, not rebuilt: whatever the
 * product's author wrote is what the entry panel receives. The typed fields
 * above it are the card's view, and they are derived — never the other way
 * round.
 * @param raw - one entry of `cards[].products[]`.
 * @returns the product view, or `undefined` when it has no usable id.
 */
function toProduct(raw: unknown): ProductView | undefined {
  const p = obj(raw)
  if (p === undefined) return undefined
  const id = str(p['id'])
  if (id === '') return undefined
  // The scan payload carries one of two shapes: the raw declaration, or the
  // host's normalized view whose `.declaration` **is** the raw one. Resolve to
  // the innermost object before reading anything feature-related: every layer
  // above the raw declaration carries only feature summaries. A view wrapped
  // around a view went to production on 2026-09-13 and cost the entry panel
  // its `features[].inputs` (probe `dsh-kolhunter-probe`: inputCount:-1) —
  // the card rendered, its button opened a panel with no fields.
  const declared = obj(p['declaration']) ?? p
  // The host normalizes `entry.service` into the flat `entryService` field
  // (see src/products.ts). We read that first, and keep the nested shape as a
  // fallback so older payloads / manual callers still work. When the flat field
  // is present, the nested `entry` is considered a legacy/normalized shadow and
  // its `action` must not override the default.
  const entry = obj(p['entry'])
  const entryService = str(p['entryService'])
  const nestedService = entry === undefined ? '' : str(entry['service'])
  const nestedAction = entry === undefined ? '' : str(entry['action'])
  const useFlat = entryService !== ''
  return {
    id,
    name: str(p['name']) !== '' ? str(p['name']) : id,
    summary: str(p['summary']),
    version: str(p['version']),
    status: p['status'] === 'ready' ? 'ready' : 'draft',
    statusReason: str(p['statusReason']),
    preset: str(p['preset']),
    service: useFlat ? entryService : nestedService,
    entryAction: useFlat ? '' : nestedAction,
    features: arr(declared['features']).flatMap((f) => {
      const feature = obj(f)
      if (feature === undefined) return []
      const featureId = str(feature['id'])
      if (featureId === '') return []
      return [{
        id: featureId,
        label: str(feature['label']) !== '' ? str(feature['label']) : featureId,
        kind: str(feature['kind']) !== '' ? str(feature['kind']) : 'unknown',
        steps: arr(feature['steps']).length,
        inputs: arr(feature['inputs']).length,
      }]
    }),
    declaration: declared,
  }
}

/**
 * Normalize one card from the scan payload.
 *
 * `undefined` means the entry is not a card: it has no directory to place it by,
 * or it declares no product whose id survived parsing. The host does not send
 * either shape, but the two halves can be at different versions (see the module
 * doc), and on version skew the honest answer is to drop an entry that renders
 * nothing rather than to render an empty card for it.
 * @param raw - one entry of `cards[]`.
 * @returns the directory view, or undefined when there is nothing to show.
 */
function toCard(raw: unknown): CardView | undefined {
  const c = obj(raw)
  if (c === undefined) return undefined
  const dir = str(c['dir'])
  if (dir === '') return undefined
  const products = arr(c['products']).flatMap((p) => {
    const product = toProduct(p)
    return product === undefined ? [] : [product]
  })
  if (products.length === 0) return undefined
  return {
    dir,
    label: str(c['label']) !== '' ? str(c['label']) : (dir.split('/').filter(Boolean).at(-1) ?? dir),
    products,
  }
}

/**
 * Flatten declared directories into **one card per product** (R4).
 *
 * Directories stay the unit the host scans and the unit a product is found in;
 * they are not the unit a person starts something from. A card is.
 * @param cards - the scan's declared directories, in host order.
 * @returns one card per product, directories in host order and products in declaration order.
 */
export function toProductCards(cards: readonly CardView[]): ProductCardView[] {
  return cards.flatMap((card) => card.products.map((product) => ({
    key: `${card.dir}::${product.id}`,
    product,
    dir: card.dir,
    dirLabel: card.label,
  })))
}

/**
 * Parse `/api/dsh-newapp/products` into the drawer's view model.
 *
 * Total: a payload that is not a scan report returns a reason instead of an
 * empty scan, because "the launcher could not be read" and "there are no
 * products" are different answers and the drawer says different things for
 * them.
 * @param payload - the parsed route body.
 * @returns the scan view, or the reason it could not be used.
 */
export function parseScanPayload(payload: unknown): ScanResult {
  const doc = obj(payload)
  if (doc === undefined) return { ok: false, reason: '响应不是一个对象' }
  if (doc['ok'] !== true) {
    return { ok: false, reason: str(doc['error']) !== '' ? str(doc['error']) : '响应没有 ok:true' }
  }
  if (!Array.isArray(doc['cards'])) return { ok: false, reason: '响应里没有 cards[]' }
  const cards = arr(doc['cards']).flatMap((c) => {
    const card = toCard(c)
    return card === undefined ? [] : [card]
  })
  return {
    ok: true,
    scan: {
      scannedRoots: arr(doc['scannedRoots']).filter((r): r is string => typeof r === 'string'),
      skipped: arr(doc['skipped']).flatMap((s) => {
        const row = obj(s)
        if (row === undefined) return []
        const root = str(row['root'])
        if (root === '') return []
        return [{ root, reason: str(row['reason']) }]
      }),
      unreadable: arr(doc['unreadable']).flatMap((u) => {
        const row = obj(u)
        if (row === undefined) return []
        const dir = str(row['dir'])
        if (dir === '') return []
        return [{ dir, reason: str(row['reason']) }]
      }),
      cards,
      declaredCount: typeof doc['declaredCount'] === 'number' ? doc['declaredCount'] : cards.length,
      // Defaulted from what was actually parsed rather than to 0: an old host
      // half that predates this field is not evidence that nothing is
      // unproductized, and `cards.length` is the one number it did send.
      undeclaredCount: typeof doc['undeclaredCount'] === 'number' ? doc['undeclaredCount'] : 0,
      truncated: doc['truncated'] === true,
    },
  }
}

/** Inputs to {@link planOpen} — every one of them an observable fact. */
export interface OpenInputs {
  /** The product the button belongs to. */
  product: ProductView
  /** Whether the product's entry service is registered right now. */
  serviceRegistered: boolean
  /** Whether the declared preset is in this machine's roster. */
  presetInstalled: boolean
}

/**
 * Decide what a card's button does — see the module doc for the three levels.
 * @param inputs - the observable facts above.
 * @returns the plan; the caller renders `disabled` as a disabled button.
 */
export function planOpen(inputs: OpenInputs): OpenPlan {
  const { product } = inputs
  if (product.service !== '' && inputs.serviceRegistered) {
    return { level: 1, kind: 'panel', service: product.service, action: product.entryAction !== '' ? product.entryAction : 'open' }
  }
  if (product.preset === '') return { level: 3, kind: 'disabled', reason: 'no-preset' }
  // Level 2 is a session on the product's preset. It still needs a preset this
  // machine actually has: selecting one that is not installed is the silent
  // no-op this level exists to avoid.
  if (!inputs.presetInstalled) return { level: 3, kind: 'disabled', reason: 'no-preset-installed' }
  return { level: 2, kind: 'session', preset: product.preset }
}

/**
 * Whether a product card matches a search query.
 *
 * Searches the product and the directory it lives in. Both matter: a person may
 * think of the thing by its product name or by the project folder they know it
 * as, and a query that returns nothing for a directory they can see in Finder
 * reads as "this is gone".
 * @param card - the product card.
 * @param query - raw query text; empty matches everything.
 * @returns whether the card should be shown.
 */
export function productCardMatches(card: ProductCardView, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  const { product } = card
  return [card.dir, card.dirLabel, product.id, product.name, product.summary, product.preset, product.statusReason]
    .some((field) => field.toLowerCase().includes(q))
}
