/**
 * The role matrix panel: 50 role-profile presets as a two-level card matrix
 * (organization plane → responsibility domain), with search and a per-card
 * detail expansion.
 *
 * Why two levels: the material's first classification view is four organization
 * planes (5 经营管理 / 35 业务运营 / 5 独立控制 / 5 数据与Agent平台) and its
 * second is eight responsibility domains. A single flat grid of 50 cards is
 * unusable, and the 35-role 业务运营 plane alone is too dense without the
 * domain split — so the panel renders planes as sections and domains as
 * sub-sections, exactly matching how the material classifies them.
 *
 * Why the drawer is a `<dialog>` opened with `showModal()`: the surface is
 * modal (it dims the whole app), and the app it dims is assembled from ~20
 * independently authored plugins whose `z-index` values reach 2500, 99999 and
 * 2147483000. A drawer that picks a number in that range is a bet; one that
 * enters the browser's top layer cannot be covered at all. The close button
 * being unclickable under a foreign overlay was exactly that lost bet.
 *
 * Read-only by design (see src/routes.ts): the official roster owns authoring
 * and the default-preset setting.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { MatrixApi, MatrixPayload, PlaneGroup, RoleCard } from './api.ts'
import { tt } from './panel-helpers.ts'
import css from './role-matrix.module.css'

/** Panel props. */
export interface RoleMatrixPanelProps {
  /** Host-backed API client. */
  api: MatrixApi
  /** Close the panel. */
  onClose: () => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: MatrixPayload }
  | { status: 'error'; message: string }

/* ── Icons (16px grid, stroke-built so they inherit currentColor) ─────────── */

/** The sidebar row's own glyph, so the entry and the panel read as one object. */
function IconGrid(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.9" y="1.9" width="5" height="5" rx="1.3" />
      <rect x="9.1" y="1.9" width="5" height="5" rx="1.3" />
      <rect x="1.9" y="9.1" width="5" height="5" rx="1.3" />
      <rect x="9.1" y="9.1" width="5" height="5" rx="1.3" />
    </svg>
  )
}

/** Close affordance: a drawn glyph, not a text "✕", so it never depends on a font. */
function IconClose(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function IconSearch(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.4" />
      <path d="M10.4 10.4L14 14" />
    </svg>
  )
}

function IconChevron(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 6.2L8 9.8l3.5-3.6" />
    </svg>
  )
}

function IconEmpty(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.2" y="2.2" width="5" height="5" rx="1.3" />
      <rect x="8.8" y="2.2" width="5" height="5" rx="1.3" />
      <rect x="2.2" y="8.8" width="5" height="5" rx="1.3" />
      <path d="M9.6 9.6l3.6 3.6M13.2 9.6l-3.6 3.6" />
    </svg>
  )
}

function IconAlert(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2.6l5.6 10.2H2.4z" />
      <path d="M8 6.6v3.1M8 11.6h.01" />
    </svg>
  )
}

/* ── Search ───────────────────────────────────────────────────────────────── */

/** Everything a query is matched against, so search behaves the same on every field users read. */
function searchHaystack(card: RoleCard): string {
  return [
    card.alias,
    card.title,
    card.name,
    card.description,
    card.artifact,
    card.agt,
    card.id,
    card.domainName,
    card.planeName,
    ...card.materialSkillNames,
    ...card.subset,
    ...card.flows,
    ...card.scenarios,
  ].join(' ').toLowerCase()
}

/**
 * Keep only the planes/domains that still hold a match, so a filtered view never
 * renders an empty section header.
 * @param planes - the full grouped payload.
 * @param query - raw query text (already trimmed by the caller).
 * @returns the pruned groups.
 */
function filterPlanes(planes: readonly PlaneGroup[], query: string): PlaneGroup[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...planes]
  const terms = needle.split(/\s+/).filter((term) => term !== '')
  const out: PlaneGroup[] = []
  for (const plane of planes) {
    const domains = plane.domains
      .map((domain) => {
        const roles = domain.roles.filter((card) => {
          const haystack = searchHaystack(card)
          return terms.every((term) => haystack.includes(term))
        })
        return { ...domain, roles }
      })
      .filter((domain) => domain.roles.length > 0)
    if (domains.length > 0) {
      out.push({ ...plane, domains, roles: domains.reduce((sum, domain) => sum + domain.roles.length, 0) })
    }
  }
  return out
}

/* ── Detail primitives ────────────────────────────────────────────────────── */

/** One labelled line inside the expanded card detail. */
function DetailRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className={css['detailRow'] ?? ''}>
      <span className={css['detailLabel'] ?? ''}>{label}</span>
      <div className={css['detailValue'] ?? ''}>{children}</div>
    </div>
  )
}

/**
 * A plain text value, muted when the material declares nothing.
 * @param props - the value plus the muted/danger emphasis flags.
 * @returns the value node.
 */
function DetailText({ value, muted, danger }: { value: string; muted?: boolean; danger?: boolean }): JSX.Element {
  const classes = [
    css['detailValue'] ?? '',
    muted === true ? css['detailMuted'] ?? '' : '',
    danger === true ? css['detailGap'] ?? '' : '',
  ].filter((name) => name !== '').join(' ')
  return <div className={classes}>{value}</div>
}

/**
 * A list value rendered as chips — skill names, flows and ids are scanned, not
 * read as prose, and a joined string makes that impossible at a glance.
 * @param props - the values plus the danger emphasis flag.
 * @returns chip nodes, or the muted "none" placeholder.
 */
function DetailChips({ values, danger }: { values: readonly string[]; danger?: boolean }): JSX.Element {
  if (values.length === 0) return <DetailText value={tt('detail.none')} muted />
  const chipClass = [css['chip'] ?? '', danger === true ? css['chipGap'] ?? '' : '']
    .filter((name) => name !== '').join(' ')
  return (
    <div>
      {values.map((value) => (
        <span key={value} className={chipClass}>{value}</span>
      ))}
    </div>
  )
}

/* ── Panel ────────────────────────────────────────────────────────────────── */

/**
 * Render the role matrix panel.
 * @param props - api client plus the close callback.
 * @returns the modal drawer surface.
 */
export function RoleMatrixPanel({ api, onClose }: RoleMatrixPanelProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | undefined>(undefined)
  const [reloadKey, setReloadKey] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Set while the effect cleanup closes the dialog: the resulting `close` event
  // must not bounce back into onClose (the panel is already being torn down).
  const unmountingRef = useRef(false)

  // Enter the browser's top layer. Nothing in the document can paint above it,
  // whatever z-index another plugin chose — that guarantee is the reason the
  // close button is always clickable.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (!dialog.open) {
      try {
        dialog.showModal()
      } catch (error) {
        // A <dialog> without `open` is display:none, so refusing the top layer
        // would otherwise leave an invisible panel. Fall back to a plain
        // visible dialog and say so loudly rather than degrade silently.
        dialog.setAttribute('open', '')
        console.error('[role-matrix-local] showModal() failed; panel is rendered outside the top layer', error)
      }
    }
    return () => {
      unmountingRef.current = true
      if (dialog.open) dialog.close()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    api.list().then(
      (payload) => { if (!cancelled) setState({ status: 'ready', payload }) },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => { cancelled = true }
  }, [api, reloadKey])

  // Fallback close path: with showModal() unavailable the dialog is not modal,
  // so Escape would not cancel it natively.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const planes = useMemo(
    () => (state.status === 'ready' ? filterPlanes(state.payload.planes, query) : []),
    [state, query],
  )

  const toggle = useCallback((id: string) => {
    setOpenId((current) => (current === id ? undefined : id))
  }, [])

  const totals = state.status === 'ready' ? state.payload.totals : undefined

  return (
    <dialog
      ref={dialogRef}
      className={css['root'] ?? ''}
      aria-label={tt('panel.title')}
      data-dsh-plugin="role-matrix-local"
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
            <span className={css['mark'] ?? ''} aria-hidden="true"><IconGrid /></span>
            <div className={css['heading'] ?? ''}>
              <h2 className={css['title'] ?? ''}>{tt('panel.title')}</h2>
              <p className={css['subtitle'] ?? ''}>{tt('panel.subtitle')}</p>
            </div>
            <span className={css['spacer'] ?? ''} />
            {totals !== undefined ? (
              <div className={css['totals'] ?? ''}>
                <span className={`${css['total'] ?? ''} ${css['totalAccent'] ?? ''}`}>
                  {tt('totals.roles', { count: totals.roles })}
                </span>
                <span className={css['total'] ?? ''}>{tt('totals.planes', { count: totals.planes })}</span>
                <span className={css['total'] ?? ''}>{tt('totals.domains', { count: totals.domains })}</span>
              </div>
            ) : null}
            <button
              type="button"
              className={css['close'] ?? ''}
              onClick={onClose}
              aria-label={tt('panel.close')}
              title={tt('panel.close')}
              data-dsh-part="panel-close"
            >
              <IconClose />
            </button>
          </div>
          <div className={css['toolbar'] ?? ''}>
            <div className={css['searchWrap'] ?? ''}>
              <span className={css['searchIcon'] ?? ''}><IconSearch /></span>
              <input
                type="search"
                className={css['search'] ?? ''}
                placeholder={tt('search.placeholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={tt('search.placeholder')}
              />
              {query !== '' ? (
                <button
                  type="button"
                  className={css['searchClear'] ?? ''}
                  onClick={() => setQuery('')}
                  aria-label={tt('search.clear')}
                  title={tt('search.clear')}
                >
                  <IconClose />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className={css['body'] ?? ''} aria-busy={state.status === 'loading'}>
          {state.status === 'loading' ? (
            <div className={css['state'] ?? ''}>
              <span className={css['stateIcon'] ?? ''}><IconGrid /></span>
              <span>{tt('list.loading')}</span>
            </div>
          ) : state.status === 'error' ? (
            <div className={`${css['state'] ?? ''} ${css['stateError'] ?? ''}`}>
              <span className={css['stateIcon'] ?? ''}><IconAlert /></span>
              <span className={css['error'] ?? ''} role="alert">{tt('list.loadFailed', { error: state.message })}</span>
              <button type="button" className={css['retry'] ?? ''} onClick={() => setReloadKey((key) => key + 1)}>
                {tt('state.retry')}
              </button>
            </div>
          ) : state.payload.totals.roles === 0 ? (
            <div className={css['state'] ?? ''}>
              <span className={css['stateIcon'] ?? ''}><IconEmpty /></span>
              <span>{tt('list.empty', { root: state.payload.root })}</span>
            </div>
          ) : planes.length === 0 ? (
            <div className={css['state'] ?? ''}>
              <span className={css['stateIcon'] ?? ''}><IconEmpty /></span>
              <span>{tt('search.empty')}</span>
            </div>
          ) : (
            <>
              {state.payload.totals.degraded > 0 ? (
                <div className={`${css['state'] ?? ''} ${css['stateError'] ?? ''}`}>
                  <span className={css['error'] ?? ''} role="alert">
                    {tt('list.degraded', { count: state.payload.totals.degraded })}
                  </span>
                </div>
              ) : null}
              {planes.map((plane) => (
                <section key={plane.id} className={css['plane'] ?? ''}>
                  <div className={css['planeHead'] ?? ''}>
                    <span className={css['planeName'] ?? ''}>{plane.name}</span>
                    {plane.purpose !== '' ? (
                      <span className={css['planePurpose'] ?? ''} title={plane.purpose}>{plane.purpose}</span>
                    ) : null}
                    <span className={css['planeCount'] ?? ''}>{tt('totals.roles', { count: plane.roles })}</span>
                  </div>
                  {plane.domains.map((domain) => (
                    <div key={domain.id} className={css['domain'] ?? ''}>
                      <div className={css['domainHead'] ?? ''}>
                        <span className={css['domainDot'] ?? ''} aria-hidden="true" />
                        <span className={css['domainName'] ?? ''}>{domain.name}</span>
                        <span className={css['domainCount'] ?? ''}>{tt('totals.roles', { count: domain.roles.length })}</span>
                      </div>
                      <ul className={css['cards'] ?? ''}>
                        {domain.roles.map((card) => {
                          const open = openId === card.id
                          const classes = [
                            css['card'] ?? '',
                            open ? css['cardOpen'] ?? '' : '',
                            card.degraded !== undefined ? css['cardDegraded'] ?? '' : '',
                          ].filter((name) => name !== '').join(' ')
                          const chevron = [
                            css['chevron'] ?? '',
                            open ? css['chevronOpen'] ?? '' : '',
                          ].filter((name) => name !== '').join(' ')
                          return (
                            <li key={card.id}>
                              <button
                                type="button"
                                className={classes}
                                aria-expanded={open}
                                aria-label={`${card.alias !== '' ? card.alias : card.name} · ${open ? tt('card.collapse') : tt('card.expand')}`}
                                onClick={() => toggle(card.id)}
                              >
                                <span className={css['cardTop'] ?? ''}>
                                  {card.icon !== '' ? (
                                    <img className={css['cardAvatar'] ?? ''} src={card.icon} alt="" />
                                  ) : null}
                                  <span className={css['cardHeadText'] ?? ''}>
                                    <span className={css['cardAlias'] ?? ''}>{card.alias !== '' ? card.alias : card.name}</span>
                                    <span className={css['cardTitle'] ?? ''}>{card.title}</span>
                                  </span>
                                  <span className={chevron}><IconChevron /></span>
                                </span>
                                <span className={css['cardMeta'] ?? ''}>
                                  <span className={`${css['badge'] ?? ''} ${css['badgeAgt'] ?? ''}`}>{card.agt}</span>
                                  {card.lifecycleStatus !== '' ? (
                                    <span
                                      className={`${css['badge'] ?? ''} ${css['badgeDraft'] ?? ''}`}
                                      title={tt('card.draftTip')}
                                    >
                                      {tt('card.draft')}
                                    </span>
                                  ) : null}
                                  {card.gaps.length > 0 ? (
                                    <span className={`${css['badge'] ?? ''} ${css['badgeGap'] ?? ''}`}>
                                      {card.gaps.length} {tt('card.gaps')}
                                    </span>
                                  ) : null}
                                  <span className={`${css['badge'] ?? ''} ${css['badgeSkills'] ?? ''}`}>
                                    {card.subset.length} {tt('card.skills')}
                                  </span>
                                </span>
                                {card.artifact !== '' ? (
                                  <span className={css['cardArtifact'] ?? ''}>
                                    <span className={css['cardArtifactLabel'] ?? ''}>{tt('card.artifact')}</span>
                                    <span className={css['cardArtifactValue'] ?? ''}>{card.artifact}</span>
                                  </span>
                                ) : null}
                                {open ? (
                                  <span className={css['detail'] ?? ''}>
                                    {card.description !== '' ? (
                                      <DetailRow label={tt('panel.subtitle')}>
                                        <DetailText value={card.description} />
                                      </DetailRow>
                                    ) : null}
                                    {card.metrics !== '' ? (
                                      <DetailRow label={tt('detail.metrics')}>
                                        <DetailText value={card.metrics} />
                                      </DetailRow>
                                    ) : null}
                                    <DetailRow label={tt('detail.materialSkills')}>
                                      <DetailChips values={card.materialSkillNames} />
                                    </DetailRow>
                                    <DetailRow label={tt('detail.subset')}>
                                      <DetailChips values={card.subset} />
                                    </DetailRow>
                                    {card.gaps.length > 0 ? (
                                      <DetailRow label={tt('detail.gaps')}>
                                        <DetailChips values={card.gaps} danger />
                                      </DetailRow>
                                    ) : null}
                                    <DetailRow label={tt('detail.flows')}>
                                      <DetailChips values={card.flows} />
                                    </DetailRow>
                                    <DetailRow label={tt('detail.scenarios')}>
                                      <DetailChips values={card.scenarios} />
                                    </DetailRow>
                                    <DetailRow label={tt('detail.collaborates')}>
                                      <DetailChips values={card.collaboratesWith} />
                                    </DetailRow>
                                    <DetailRow label={tt('detail.playbooks')}>
                                      <DetailChips values={card.playbooks} />
                                    </DetailRow>
                                    {card.degraded !== undefined ? (
                                      <DetailRow label={tt('detail.gaps')}>
                                        <DetailText value={card.degraded} danger />
                                      </DetailRow>
                                    ) : null}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </div>

        <div className={css['footer'] ?? ''}>{tt('footer.hint')}</div>
      </div>
    </dialog>
  )
}
