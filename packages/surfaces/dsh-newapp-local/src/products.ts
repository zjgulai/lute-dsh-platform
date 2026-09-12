/**
 * `product.json` discovery — the launcher's **read** of the product declaration.
 *
 * An "Agent product" declares itself: `<产品目录>/product.json` carries its
 * identity, the preset it belongs to, its features and its workflow. This
 * module reads that declaration; it does **not** keep a registry of its own
 * (ADR-0028: the launcher owns the join, never the fact). A product added or
 * removed in its own directory changes this scan with no code change here.
 *
 * ## Why the roots are explicit
 *
 * A scan root is a filesystem read the operator did not ask for unless they
 * said so. `roots` therefore defaults to `[]` and an empty list scans nothing —
 * the safe default, and the same shape the worktable fence work settled on.
 *
 * ## Why a directory without a declaration is counted but not listed
 *
 * The page lists **products**, not working directories (ADR-0045, which
 * supersedes ADR-0028's degrade-don't-disappear rule for this surface). A
 * directory with no `product.json` therefore produces no card — 24 permanent
 * 「尚未产品化」 placeholders is what made the page unreadable.
 *
 * It is not deleted from the *report*, though: `undeclaredCount` carries how
 * many directories produced no usable declaration. Without it, a machine whose
 * roots are misconfigured and a machine that genuinely declares nothing would
 * produce the same empty card list, which is the distinction ADR-0028 was
 * originally written to protect. The count keeps the distinction; it just does
 * not spend a card on it.
 *
 * ## Totality
 *
 * Every parser here is total: a malformed `product.json`, an unreadable
 * directory and a missing root all land in the report as `unreadable` /
 * `skipped` entries with a reason. Nothing throws for bad input, and nothing is
 * silently omitted — a scan that cannot read a root must not look like a scan
 * that found nothing.
 *
 * @module dsh-newapp-local/products
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/** One feature as declared by the product (only what a card needs). */
export interface DeclaredFeature {
  id: string
  label: string
  kind: string
  steps: number
}

/** One product as declared by `<dir>/product.json`. */
export interface DeclaredProduct {
  id: string
  name: string
  summary: string
  version: string
  status: 'draft' | 'ready'
  statusReason: string
  /** The preset this product belongs to (ADR-0033 decision 1: required). */
  preset: string
  entryService: string
  features: DeclaredFeature[]
  /**
   * The declaration **verbatim** — the object exactly as it sits in
   * `product.json`.
   *
   * Why it travels alongside the normalized fields above rather than instead of
   * them: the two have different consumers with different tolerances. A **card**
   * wants a shape it can render without re-validating (id present, status
   * coerced, preset guaranteed — ADR-0033), and that is what the fields above
   * are. The **entry panel** wants the declaration itself: it renders its form
   * from `features[].inputs[]`, resolves `features[].skills[]`, and reads
   * whatever else the product's own author put in the file. That is a schema
   * this plugin does not own and must not reshape — reshaping it here is
   * precisely how `inputs[]` was dropped the first time, leaving a drawer that
   * listed products it could not open (M2 note).
   *
   * So: normalized fields for the card, verbatim bytes for the entry. Both come
   * from one read at one instant and neither is stored, so there is no second
   * home to drift — only a relay.
   */
  declaration: Record<string, unknown>
}

/** One working directory that declares at least one usable product. */
export interface ProductCard {
  /** Working directory — metadata on the card, not its identity. */
  dir: string
  /** Display name: the directory's basename. */
  label: string
  /** The declared products, in declaration order. Never empty. */
  products: DeclaredProduct[]
}

/** The whole scan, including exactly what was read and what was not. */
export interface ScanReport {
  /** The roots actually scanned, after `resolve`. Empty means "scan nothing". */
  scannedRoots: string[]
  /** Roots that could not be scanned at all, with the reason. */
  skipped: Array<{ root: string; reason: string }>
  /** Every working directory that declared a usable product. */
  cards: ProductCard[]
  /** Declaration files that exist but could not be used, with the reason. */
  unreadable: Array<{ dir: string; reason: string }>
  /** Cards carrying at least one declared product. Equals `cards.length`. */
  declaredCount: number
  /**
   * Directories examined that produced **no** usable declaration — no
   * `product.json` at all, or one that could not be parsed.
   *
   * This is the whole of the "not productized" outlet now that such directories
   * are not cards (R3). When the scan was truncated it counts what was examined
   * before the cap, not what exists — pair it with `truncated`.
   */
  undeclaredCount: number
  /** Cap applied to `cards`, when one was configured. */
  truncated: boolean
}

/** Options for {@link scanProducts}. */
export interface ScanOptions {
  /** Upper bound on returned cards; a scan is a read, not an inventory. */
  maxCards?: number
}

const DEFAULT_MAX_CARDS = 200

/** Directory names never treated as candidate working directories. */
function isHidden(name: string): boolean {
  return name.startsWith('.')
}

/**
 * Parse one `product.json` text. Total: returns a reason instead of throwing.
 * @param text - the file's content.
 * @returns the declared products, or a reason the text is unusable.
 */
export function parseProductDeclaration(text: string): { ok: true; products: DeclaredProduct[] } | { ok: false; reason: string } {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch (error) {
    return { ok: false, reason: `product.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}` }
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, reason: 'product.json 顶层不是对象（只有一种形状：{ schemaVersion, products: [...] }）' }
  }
  const root = doc as Record<string, unknown>
  if (root.schemaVersion !== 1) return { ok: false, reason: `product.json schemaVersion=${String(root.schemaVersion)}，只认 1` }
  if (!Array.isArray(root.products) || root.products.length === 0) return { ok: false, reason: 'product.json 的 products[] 为空' }

  const products: DeclaredProduct[] = []
  for (const [index, raw] of root.products.entries()) {
    if (raw === null || typeof raw !== 'object') return { ok: false, reason: `products[${index}] 不是对象` }
    const p = raw as Record<string, unknown>
    const id = typeof p.id === 'string' ? p.id : ''
    if (id === '') return { ok: false, reason: `products[${index}].id 缺失` }
    if (typeof p.preset !== 'string' || p.preset === '') {
      // ADR-0033: preset is required — a product that belongs to no role has not
      // decided who it works for, and the card cannot group it honestly.
      return { ok: false, reason: `products[${index}] (${id}) 缺 preset——产品必须归属 50 个岗位之一` }
    }
    const features = Array.isArray(p.features) ? p.features : []
    products.push({
      id,
      name: typeof p.name === 'string' && p.name !== '' ? p.name : id,
      summary: typeof p.summary === 'string' ? p.summary : '',
      version: typeof p.version === 'string' ? p.version : '',
      status: p.status === 'ready' ? 'ready' : 'draft',
      statusReason: typeof p.statusReason === 'string' ? p.statusReason : '',
      preset: p.preset,
      entryService:
        p.entry !== null && typeof p.entry === 'object' && typeof (p.entry as Record<string, unknown>).service === 'string'
          ? String((p.entry as Record<string, unknown>).service)
          : '',
      features: features.flatMap((f) => {
        if (f === null || typeof f !== 'object') return []
        const feature = f as Record<string, unknown>
        if (typeof feature.id !== 'string') return []
        return [
          {
            id: feature.id,
            label: typeof feature.label === 'string' ? feature.label : feature.id,
            kind: typeof feature.kind === 'string' ? feature.kind : 'unknown',
            steps: Array.isArray(feature.steps) ? feature.steps.length : 0,
          },
        ]
      }),
      // Verbatim: the entry panel needs the declaration, not our summary of it.
      declaration: p,
    })
  }
  return { ok: true, products }
}

/**
 * Read one working directory's declaration.
 *
 * `undefined` means "this directory is not a product" — either it has no
 * `product.json` or the one it has could not be used. The caller counts those
 * rather than listing them (R3); a reason worth showing lands in `unreadable`.
 * @param dir - absolute working directory.
 * @returns the card for that directory, or undefined when it declares nothing usable.
 */
export function readProductCard(dir: string, unreadable: ScanReport['unreadable']): ProductCard | undefined {
  const label = dir.split('/').filter(Boolean).at(-1) ?? dir
  let text: string
  try {
    if (!statSync(join(dir, 'product.json')).isFile()) return undefined
    text = readFileSync(join(dir, 'product.json'), 'utf8')
  } catch (error) {
    // A missing file is the ordinary case (most directories are not products)
    // and gets no `unreadable` entry — only a real read failure does.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    unreadable.push({ dir, reason: `product.json 读取失败：${error instanceof Error ? error.message : String(error)}` })
    return undefined
  }
  const parsed = parseProductDeclaration(text)
  if (!parsed.ok) {
    unreadable.push({ dir, reason: parsed.reason })
    return undefined
  }
  return { dir, label, products: parsed.products }
}

/**
 * Scan the configured roots for working directories and their product declarations.
 *
 * One level deep: a root is the *parent* of the directories that may hold
 * products, not a product directory itself.
 *
 * @param roots - allowed roots; absolute, or relative to `cwd`. Empty scans nothing.
 * @param options - `maxCards` bounds the returned list.
 * @returns the scan report; never throws.
 */
export function scanProducts(roots: readonly string[], options: ScanOptions = {}): ScanReport {
  const maxCards = Number.isFinite(options.maxCards) && (options.maxCards as number) > 0 ? Math.floor(options.maxCards as number) : DEFAULT_MAX_CARDS
  const scannedRoots = roots
    .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
    .map((r) => (isAbsolute(r) ? resolve(r) : resolve(process.cwd(), r)))

  const skipped: ScanReport['skipped'] = []
  const unreadable: ScanReport['unreadable'] = []
  const cards: ProductCard[] = []
  let undeclaredCount = 0
  let truncated = false

  for (const root of scannedRoots) {
    let entries: Dirent[]
    try {
      if (!statSync(root).isDirectory()) {
        skipped.push({ root, reason: '不是一个目录' })
        continue
      }
      entries = readdirSync(root, { withFileTypes: true })
    } catch (error) {
      skipped.push({ root, reason: error instanceof Error ? error.message : String(error) })
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || isHidden(entry.name)) continue
      // The cap is on *cards*, so directories that declare nothing never trip
      // it: a root holding two products and ten thousand bare directories must
      // still list both products.
      if (cards.length >= maxCards) {
        truncated = true
        break
      }
      const card = readProductCard(join(root, entry.name), unreadable)
      if (card === undefined) {
        undeclaredCount += 1
        continue
      }
      cards.push(card)
    }
    if (truncated) break
  }

  cards.sort((a, b) => a.dir.localeCompare(b.dir))
  return {
    scannedRoots,
    skipped,
    cards,
    unreadable,
    declaredCount: cards.length,
    undeclaredCount,
    truncated,
  }
}
