/**
 * The application drawer: **one big card per product**.
 *
 * ## What this page is
 *
 * A launch pad for the products this machine actually has. One card = one
 * product; opening it starts that product. Nothing else belongs on it.
 *
 * ## What changed and why (ADR-0045)
 *
 * Two earlier shapes were both wrong in the same direction — they listed *the
 * machine's inventory* rather than *the things a person can start*:
 *
 *  1. The roster and the worktable's containers, as two separate blocks. The
 *     roster is an organization chart (50 roles from the source material), and
 *     a container is a session grouping; neither is a product.
 *  2. The working directory, with its products hanging off it. Overlapping
 *     wrongness, but wrongness: this machine has 25 project directories and one
 *     product, so the page rendered 25 cards of which 24 said 「尚未产品化」.
 *
 * So the card key is now the **product**. The directory is kept as metadata on
 * the card (it is where a session opens, so it is real information) but it no
 * longer decides how many cards there are.
 *
 * Directories that declare nothing are **not cards** any more (this supersedes
 * ADR-0028's degrade-don't-disappear rule for this surface). They are not
 * erased either: the count is reported in one line of small print, so "I
 * scanned 25 directories and none of them declared a product" still has an
 * answer, without spending 24 cards on it.
 *
 * The roster has not gone away — it is still read, but used for one question
 * instead of being rendered: *does the preset this product declares exist
 * here?* That decides whether the fallback action can work, which is the
 * difference between a card that opens and a button that lies.
 *
 * ## Why a `<dialog>` opened with `showModal()`
 *
 * The dsh web shell already hosts overlays that set z-index values in the 2.1e9
 * range, and any z-index this panel picked would be a guess a future plugin
 * could outbid — taking the close button with it. `showModal()` moves the panel
 * into the browser's top layer, above every stacking context regardless of
 * z-index, which is a guarantee rather than a large number. The failure this
 * avoids is not hypothetical; it was observed once (a drawer whose ✕ could not
 * be clicked because an unrelated overlay painted over it).
 *
 * ## Why degradation is stated instead of summarized
 *
 * Three different things can be missing, and the user's next action differs for
 * each: a scan root that could not be read (fix the config), a declaration that
 * could not be parsed (fix the product), a directory that declares nothing
 * (author a `product.json` — or leave it alone). A single "something failed"
 * would collapse three different fixes into one dead end.
 *
 * @module dsh-newapp-local/client/NewAppPanel
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { NewAppApi } from './api.ts'
import type { AppLauncher, OpenOutcome } from './launcher.ts'
import { tt } from './panel-helpers.ts'
import { planOpen, productCardMatches, toProductCards, type BlockReason, type OpenPlan, type ProductCardView, type ProductView, type ScanView } from './product-cards.ts'
import { SystemsSection } from './SystemsSection.tsx'
import css from './newapp.module.css'

/**
 * Copy keys for the two ways a button can be refused.
 *
 * A `Record` over the closed union, so adding a `BlockReason` without writing
 * its copy is a typecheck failure rather than a card that shows a key name.
 */
const BLOCKED_KEY: Record<BlockReason, 'blocked.noPreset' | 'blocked.noPresetInstalled'> = {
  'no-preset': 'blocked.noPreset',
  'no-preset-installed': 'blocked.noPresetInstalled',
}

/** Panel props. */
export interface NewAppPanelProps {
  /** The read-only source reader. */
  api: NewAppApi
  /** The two actions a card can take. */
  launcher: AppLauncher
  /** Close the drawer. */
  onClose: () => void
}

/** Load state for the drawer body. */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; scan: ScanView | undefined; scanError: string }
  | { status: 'error'; message: string }

/** Inline app-grid glyph, normalized to the shell's mark size. */
function IconApps(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.8" y="1.8" width="5.4" height="5.4" rx="1.4" />
      <rect x="8.8" y="1.8" width="5.4" height="5.4" rx="1.4" />
      <rect x="1.8" y="8.8" width="5.4" height="5.4" rx="1.4" />
      <path d="M11.5 9.1v4.8M9.1 11.5h4.8" />
    </svg>
  )
}

/**
 * The button label per plan level.
 *
 * Level 2 is labelled differently on purpose: it does *not* open the product's
 * panel, and a button that says 「打开」 while starting a chat instead would be
 * the exact class of lie this drawer exists to avoid.
 * @param plan - the resolved plan.
 * @returns the label.
 */
function planLabel(plan: OpenPlan): string {
  if (plan.kind === 'panel') return tt('open.panel')
  if (plan.kind === 'session') return tt('open.session')
  return tt('open.disabled')
}

/**
 * One product card — the grid cell.
 *
 * Carries the six facts the matrix is specified to show (name, summary, status,
 * role, version, feature count) plus the directory, which is metadata rather
 * than identity but is genuinely useful: it is where a session will open.
 */
function ProductCard({ card, plan, busy, onOpen }: {
  card: ProductCardView
  plan: OpenPlan
  busy: boolean
  onOpen: (card: ProductCardView, plan: OpenPlan) => void
}): JSX.Element {
  const { product, dir, dirLabel } = card
  return (
    <li
      className={css['card'] ?? ''}
      data-dsh-part="product-card"
      data-dsh-product={product.id}
      data-dsh-dir={dir}
    >
      <div className={css['cardHead'] ?? ''}>
        <h4 className={css['cardLabel'] ?? ''}>{product.name}</h4>
        <span className={css['cardDir'] ?? ''} title={dir}>{dirLabel}</span>
      </div>
      {product.summary !== '' ? <p className={css['cardSummary'] ?? ''}>{product.summary}</p> : null}
      <div className={css['cardMeta'] ?? ''}>
        <span className={css['chipMuted'] ?? ''}>
          {product.status === 'ready' ? tt('product.statusReady') : tt('product.statusDraft')}
        </span>
        <span className={css['chip'] ?? ''}>{tt('product.preset', { preset: product.preset })}</span>
        <span className={css['chipMuted'] ?? ''}>
          {tt('product.version', { version: product.version === '' ? '—' : product.version })}
        </span>
        <span className={css['chipMuted'] ?? ''}>{tt('product.features', { count: product.features.length })}</span>
      </div>
      {/* The reason the status is what it is. A two-value enum cannot answer
          "why is this a draft", and the answer is what the reader came for. */}
      {product.statusReason !== '' ? <p className={css['cardNote'] ?? ''}>{product.statusReason}</p> : null}
      {product.features.length > 0 ? (
        <ul className={css['productFeatures'] ?? ''}>
          {product.features.map((feature) => (
            <li key={feature.id}>
              {tt('product.featureLine', {
                label: feature.label,
                inputs: feature.inputs,
                steps: feature.steps,
              })}
            </li>
          ))}
        </ul>
      ) : null}
      <div className={css['action'] ?? ''}>
        <button
          type="button"
          className={css['primary'] ?? ''}
          disabled={plan.kind === 'disabled' || busy}
          onClick={() => { onOpen(card, plan) }}
          data-dsh-part="open-product"
          data-dsh-open-level={plan.level}
        >
          {busy ? tt('open.busy') : planLabel(plan)}
        </button>
        {plan.kind === 'session' ? <span className={css['blocked'] ?? ''}>{tt('open.fallbackNote')}</span> : null}
        {plan.kind === 'disabled' ? <span className={css['blocked'] ?? ''}>{tt(BLOCKED_KEY[plan.reason])}</span> : null}
      </div>
    </li>
  )
}

/** Render the application drawer. */
export function NewAppPanel({ api, launcher, onClose }: NewAppPanelProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [outcome, setOutcome] = useState<OpenOutcome | undefined>(undefined)
  const [busyKey, setBusyKey] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Set while the effect cleanup closes the dialog: the resulting `close` event
  // must not bounce back into onClose (the panel is already being torn down).
  const unmountingRef = useRef(false)

  // Enter the browser's top layer (see the module doc for why).
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (!dialog.open) {
      try {
        dialog.showModal()
      } catch (error) {
        // A <dialog> without `open` is display:none, so refusing the top layer
        // would otherwise leave an invisible panel. Fall back to a plainly
        // visible dialog and say so loudly rather than degrade silently.
        dialog.setAttribute('open', '')
        console.error('[newapp-local] showModal() failed; panel is rendered outside the top layer', error)
      }
    }
    return () => {
      unmountingRef.current = true
      // Guarded exactly like `showModal()` above, and for the same reason: an
      // environment that ships a `HTMLDialogElement` without the modal methods
      // (jsdom is one — measured, it has `open` but not `close`) would otherwise
      // throw from a cleanup, which React reports as an uncaught commit-phase
      // error and which can take the surrounding tree down with it. The fallback
      // path already made the dialog plainly visible; removing the element is the
      // actual teardown here.
      if (dialog.open && typeof dialog.close === 'function') dialog.close()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    setOutcome(undefined)
    // `prime()` first: the card's plan depends on whether the declared preset is
    // installed, and planning is synchronous so that a card cannot change its
    // mind between two renders. The roster read is therefore done before the
    // first plan is computed, not during it.
    void launcher.prime().then(() => api.products()).then(
      (scan) => {
        if (cancelled) return
        setState({
          status: 'ready',
          scan: scan.ok ? scan.scan : undefined,
          scanError: scan.ok ? '' : scan.reason,
        })
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => { cancelled = true }
  }, [api, launcher, reloadKey])

  // Fallback close path: with showModal() unavailable the dialog is not modal,
  // so Escape would not cancel it natively.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const reload = useCallback(() => { setReloadKey((key) => key + 1) }, [])

  const ready = state.status === 'ready' ? state : undefined
  const scan = ready?.scan

  /**
   * Plan every visible button.
   *
   * Computed during render from observable facts (`isRegistered` / `hasPreset`
   * read live registries) rather than captured at load: a product's entry panel
   * can be registered after this drawer loaded, and the card must light up then.
   */
  const cards = useMemo(() => {
    const all = toProductCards(scan?.cards ?? [])
    return all
      .filter((card) => productCardMatches(card, query))
      .map((card) => ({
        card,
        plan: planOpen({
          product: card.product,
          serviceRegistered: launcher.isRegistered(card.product.service),
          presetInstalled: launcher.hasPreset(card.product.preset),
        }),
      }))
  }, [scan, query, launcher])

  const openProduct = useCallback((card: ProductCardView, plan: OpenPlan) => {
    setBusyKey(card.key)
    void launcher.run({ plan, dir: card.dir, product: card.product }).then(
      (result) => { setBusyKey(''); setOutcome(result) },
      (error: unknown) => {
        setBusyKey('')
        setOutcome({ ok: false, note: `打开失败：${error instanceof Error ? error.message : String(error)}` })
      },
    )
  }, [launcher])

  const total = cards.length
  const undeclaredCount = scan?.undeclaredCount ?? 0

  return (
    <dialog
      ref={dialogRef}
      className={css['root'] ?? ''}
      aria-label={tt('panel.title')}
      data-dsh-plugin="newapp-local"
      data-dsh-part="panel-root"
      onCancel={() => { onClose() }}
      onClose={() => { if (!unmountingRef.current) onClose() }}
      // The dialog box spans the viewport, so a click whose target is the box
      // itself is a click on the dimmed area beside the panel.
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className={css['panel'] ?? ''}>
        <div className={css['header'] ?? ''}>
          <div className={css['titleRow'] ?? ''}>
            <span className={css['mark'] ?? ''} aria-hidden="true"><IconApps /></span>
            <div className={css['heading'] ?? ''}>
              <h2 className={css['title'] ?? ''}>{tt('panel.title')}</h2>
              <p className={css['subtitle'] ?? ''}>{tt('panel.subtitle')}</p>
            </div>
            <span className={css['spacer'] ?? ''} />
            <button type="button" className={css['ghost'] ?? ''} onClick={reload}>
              {tt('panel.refresh')}
            </button>
            <button type="button" className={css['close'] ?? ''} aria-label={tt('panel.close')} onClick={onClose}>
              ✕
            </button>
          </div>
          {scan === undefined ? null : (
            <div className={css['totals'] ?? ''}>
              <span className={css['total'] ?? ''}>{tt('totals.products', { count: total })}</span>
            </div>
          )}
        </div>

        <div className={css['body'] ?? ''}>
          {state.status === 'loading' ? <p className={css['state'] ?? ''}>{tt('state.loading')}</p> : null}
          {state.status === 'error' ? (
            <p className={css['stateError'] ?? ''}>
              {tt('state.loadFailed', { error: state.message })}
              <button type="button" className={css['ghost'] ?? ''} onClick={reload}>{tt('state.retry')}</button>
            </p>
          ) : null}

          {/* The launcher's own route failing is reported on its own, with its
              own next action — it is not the same fact as "no products". */}
          {ready !== undefined && ready.scanError !== '' ? (
            <div className={css['notice'] ?? ''} data-dsh-part="scan-error">
              <span className={css['noticeTitle'] ?? ''}>{tt('scan.failedTitle')}</span>
              <p className={css['state'] ?? ''}>{ready.scanError}</p>
              <button type="button" className={css['ghost'] ?? ''} onClick={reload}>{tt('state.retry')}</button>
            </div>
          ) : null}

          {scan !== undefined && (scan.scannedRoots.length === 0 || scan.skipped.length > 0 || scan.unreadable.length > 0 || scan.truncated) ? (
            <div className={css['notice'] ?? ''} data-dsh-part="scan-notice">
              <span className={css['noticeTitle'] ?? ''}>{tt('scan.title')}</span>
              <ul className={css['noticeList'] ?? ''}>
                {scan.scannedRoots.length === 0 ? <li>{tt('scan.noRoots')}</li> : null}
                {scan.scannedRoots.length > 0 ? (
                  <li>{tt('scan.roots', { roots: scan.scannedRoots.join('、') })}</li>
                ) : null}
                {scan.skipped.map((row) => <li key={`s${row.root}`}>{tt('scan.skipped', { root: row.root, reason: row.reason })}</li>)}
                {scan.unreadable.map((row) => <li key={`u${row.dir}`}>{tt('scan.unreadable', { dir: row.dir, reason: row.reason })}</li>)}
                {scan.truncated ? <li>{tt('scan.truncated')}</li> : null}
              </ul>
            </div>
          ) : null}

          {outcome !== undefined ? (
            <p
              className={`${css['outcome'] ?? ''} ${outcome.ok ? '' : css['outcomeError'] ?? ''}`}
              data-dsh-part="open-outcome"
              data-dsh-ok={outcome.ok ? 'true' : 'false'}
            >
              {outcome.note}
            </p>
          ) : null}

          {scan !== undefined && cards.length > 0 ? (
            <div className={css['sectionHead'] ?? ''}>
              <h3 className={css['sectionTitle'] ?? ''}>{tt('section.products')}</h3>
              <span className={css['spacer'] ?? ''} />
              <input
                type="search"
                className={css['search'] ?? ''}
                placeholder={tt('search.placeholder')}
                value={query}
                onChange={(event) => { setQuery(event.target.value) }}
                aria-label={tt('search.placeholder')}
                data-dsh-part="product-search"
              />
            </div>
          ) : null}

          {scan !== undefined && cards.length === 0 ? (
            <p className={css['state'] ?? ''} data-dsh-part="empty-state">
              {query.trim() !== ''
                ? tt('search.empty')
                : undeclaredCount > 0
                  // The empty page has to distinguish "I looked at 25 directories
                  // and none of them declared a product" from "I looked at
                  // nothing". The count is the only place that fact survives now
                  // that bare directories are not cards.
                  ? tt('state.emptyUndeclared', { count: undeclaredCount })
                  : tt('state.empty')}
            </p>
          ) : null}

          {cards.length > 0 ? (
            <ul className={css['grid'] ?? ''} data-dsh-part="product-cards">
              {cards.map(({ card, plan }) => (
                <ProductCard
                  key={card.key}
                  card={card}
                  plan={plan}
                  busy={busyKey === card.key}
                  onOpen={openProduct}
                />
              ))}
            </ul>
          ) : null}

          {/* The drawer's second section, with a deliberately different
              contract: a product is something this machine has productized and
              can start, a system is somebody else's site the OS browser opens.
              Two card shapes, one page — see SystemsSection for why folding
              them into one shape would produce a button that lies. */}
          <SystemsSection />
        </div>

        {/* One line of small print, not a section and not a card (R3): the
            directories that declare nothing are still real, and a person who
            just added a project and cannot see it deserves to know why. */}
        <footer className={css['footer'] ?? ''}>
          <span>{tt('footer.hint')}</span>
          {scan !== undefined && cards.length > 0 && undeclaredCount > 0 ? (
            <span className={css['footerNote'] ?? ''} data-dsh-part="undeclared-count">
              {tt('footer.undeclared', { count: undeclaredCount })}
            </span>
          ) : null}
        </footer>
      </div>
    </dialog>
  )
}
