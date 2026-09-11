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
 * Read-only by design (see src/routes.ts): the official roster owns authoring
 * and the default-preset setting.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
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

/** One value line inside the expanded card detail. */
function DetailRow({ label, value, danger }: { label: string; value: string; danger?: boolean }): JSX.Element {
  return (
    <div className={css['detailRow'] ?? ''}>
      <span className={css['detailLabel'] ?? ''}>{label}</span>
      <span className={`${css['detailValue'] ?? ''} ${danger === true ? css['detailGap'] ?? '' : ''}`}>{value}</span>
    </div>
  )
}

/**
 * Render the role matrix panel.
 * @param props - api client plus the close callback.
 * @returns the drawer surface.
 */
export function RoleMatrixPanel({ api, onClose }: RoleMatrixPanelProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    api.list().then(
      (payload) => { if (!cancelled) setState({ status: 'ready', payload }) },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => { cancelled = true }
  }, [api])

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

  return (
    <div className={css['root'] ?? ''} data-dsh-plugin="role-matrix-local" data-dsh-part="panel-root">
      <div
        className={css['panel'] ?? ''}
        role="dialog"
        aria-modal="true"
        aria-label={tt('panel.title')}
      >
        <div className={css['header'] ?? ''}>
          <div className={css['titleRow'] ?? ''}>
            <h2 className={css['title'] ?? ''}>{tt('panel.title')}</h2>
            <p className={css['subtitle'] ?? ''}>{tt('panel.subtitle')}</p>
            <span className={css['spacer'] ?? ''} />
            <button type="button" className={css['close'] ?? ''} onClick={onClose} aria-label={tt('panel.close')}>
              ✕
            </button>
          </div>
          <div className={css['toolbar'] ?? ''}>
            <input
              type="search"
              className={css['search'] ?? ''}
              placeholder={tt('search.placeholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={tt('search.placeholder')}
            />
            {state.status === 'ready' ? (
              <div className={css['totals'] ?? ''}>
                <span className={css['total'] ?? ''}>{tt('totals.roles', { count: state.payload.totals.roles })}</span>
                <span className={css['total'] ?? ''}>{tt('totals.planes', { count: state.payload.totals.planes })}</span>
                <span className={css['total'] ?? ''}>{tt('totals.domains', { count: state.payload.totals.domains })}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className={css['body'] ?? ''}>
          {state.status === 'loading' ? (
            <p className={css['state'] ?? ''}>{tt('list.loading')}</p>
          ) : state.status === 'error' ? (
            <p className={`${css['state'] ?? ''} ${css['error'] ?? ''}`} role="alert">
              {tt('list.loadFailed', { error: state.message })}
            </p>
          ) : state.payload.totals.roles === 0 ? (
            <p className={css['state'] ?? ''}>{tt('list.empty', { root: state.payload.root })}</p>
          ) : planes.length === 0 ? (
            <p className={css['state'] ?? ''}>{tt('search.empty')}</p>
          ) : (
            <>
              {state.payload.totals.degraded > 0 ? (
                <p className={`${css['state'] ?? ''} ${css['error'] ?? ''}`}>
                  {tt('list.degraded', { count: state.payload.totals.degraded })}
                </p>
              ) : null}
              {planes.map((plane) => (
                <section key={plane.id} className={css['plane'] ?? ''}>
                  <div className={css['planeHead'] ?? ''}>
                    <span className={css['planeName'] ?? ''}>{plane.name}</span>
                    <span className={css['planeCount'] ?? ''}>{tt('totals.roles', { count: plane.roles })}</span>
                  </div>
                  {plane.domains.map((domain) => (
                    <div key={domain.id} className={css['domain'] ?? ''}>
                      <div className={css['domainHead'] ?? ''}>
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
                          return (
                            <li key={card.id}>
                              <div
                                className={classes}
                                role="button"
                                tabIndex={0}
                                aria-expanded={open}
                                onClick={() => toggle(card.id)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    toggle(card.id)
                                  }
                                }}
                              >
                                <div className={css['cardTop'] ?? ''}>
                                  {card.icon !== '' ? (
                                    <img className={css['cardAvatar'] ?? ''} src={card.icon} alt="" />
                                  ) : null}
                                  <div className={css['cardHeadText'] ?? ''}>
                                    <span className={css['cardAlias'] ?? ''}>{card.alias !== '' ? card.alias : card.name}</span>
                                    <span className={css['cardTitle'] ?? ''}>{card.title}</span>
                                  </div>
                                </div>
                                <div className={css['cardMeta'] ?? ''}>
                                  <span className={css['badge'] ?? ''}>{card.agt}</span>
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
                                  <span>{card.subset.length} {tt('card.skills')}</span>
                                </div>
                                {card.artifact !== '' ? (
                                  <div className={css['cardArtifact'] ?? ''}>
                                    {tt('card.artifact')}：{card.artifact}
                                  </div>
                                ) : null}
                                {open ? (
                                  <div className={css['detail'] ?? ''}>
                                    {card.description !== '' ? (
                                      <DetailRow label={tt('panel.subtitle')} value={card.description} />
                                    ) : null}
                                    {card.metrics !== '' ? <DetailRow label={tt('detail.metrics')} value={card.metrics} /> : null}
                                    <DetailRow
                                      label={tt('detail.materialSkills')}
                                      value={card.materialSkillNames.join(' · ') || tt('detail.none')}
                                    />
                                    <DetailRow
                                      label={tt('detail.subset')}
                                      value={card.subset.join(' · ') || tt('detail.none')}
                                    />
                                    {card.gaps.length > 0 ? (
                                      <DetailRow label={tt('detail.gaps')} value={card.gaps.join(' · ')} danger />
                                    ) : null}
                                    <DetailRow label={tt('detail.flows')} value={card.flows.join(' · ') || tt('detail.none')} />
                                    <DetailRow
                                      label={tt('detail.scenarios')}
                                      value={card.scenarios.join(' · ') || tt('detail.none')}
                                    />
                                    <DetailRow
                                      label={tt('detail.collaborates')}
                                      value={card.collaboratesWith.join(' · ') || tt('detail.none')}
                                    />
                                    <DetailRow
                                      label={tt('detail.playbooks')}
                                      value={card.playbooks.join(' · ') || tt('detail.none')}
                                    />
                                    {card.degraded !== undefined ? (
                                      <DetailRow label={tt('detail.gaps')} value={card.degraded} danger />
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
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
    </div>
  )
}
