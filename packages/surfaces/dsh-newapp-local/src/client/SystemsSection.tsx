/**
 * 「业务系统」—— the drawer's second section: the LUTE portal's systems, grouped
 * by the role they serve.
 *
 * ## Why this is a section and not a second drawer
 *
 * The two halves of this drawer answer two different questions and must not be
 * confused: a **product** is something this machine has productized and can
 * start (a session, a panel, a declared workflow), while a **system** is
 * somebody else's site that the browser opens. One page holding both is what the
 * user asked for; one *card shape* holding both is what would break — a card
 * that sometimes opens a panel and sometimes leaves the app has no honest button
 * label.
 *
 * So they are two sections with two contracts: `planOpen` (three levels, can end
 * disabled) for products, `planOpenSystem` (one level, cannot be "not installed
 * here") for systems. The product section above is untouched by this file.
 *
 * ## Why the cards are buttons and the chips are spans
 *
 * The whole card opens the system, so the card is a single `<button>`: one focus
 * stop, one accessible name, and no interactive element nested inside another.
 * The role chips are therefore labels rather than links — a chip that jumped to
 * another group would have to be a button inside a button. What the chips lose
 * in navigation they gain in honesty: every role that owns this system is on
 * screen, instead of a `+2` that hides them behind a tooltip (the same reasoning
 * that put block reasons in text on the product cards).
 *
 * ## Why the open goes through the host
 *
 * Measured: this shell's main process denies `target="_blank"` for http(s), so an
 * anchor would accept the click and do nothing. The browser half therefore POSTs
 * a **slug** to its own host half and the host performs the launch. The outcome
 * — success or the host's reason for refusing — is written on the card, because a
 * launch that fails silently is the exact failure this drawer exists to remove.
 *
 * @module dsh-newapp-local/client/SystemsSection
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { SystemsApi } from './api.ts'
import { readRoster, ROSTER_ROUTE } from './launcher.ts'
import { SystemIcon } from './SystemIcon.tsx'
import { tt } from './panel-helpers.ts'
import {
  groupSystems,
  matchSystem,
  planOpenSystem,
  roleCoverage,
  type RoleGroup,
  type RoleLabel,
  type SystemBlockReason,
  type SystemView,
  type SystemsView,
} from './systems.ts'
import css from './newapp.module.css'

/**
 * Copy keys for the two ways a system card can refuse.
 *
 * A `Record` over the closed union, so adding a `SystemBlockReason` without its
 * copy is a typecheck failure rather than a card that prints a key name.
 */
const BLOCKED_KEY: Record<SystemBlockReason, 'systems.blocked.noHref' | 'systems.blocked.noOpener'> = {
  'no-href': 'systems.blocked.noHref',
  'no-opener': 'systems.blocked.noOpener',
}

/** Load state for the section. */
type SystemsState =
  | { status: 'loading' }
  | { status: 'ready'; view: SystemsView; labels: Map<string, RoleLabel> }
  | { status: 'error'; message: string }

/** Inline arrow, at the shell's caption scale. */
function IconArrow(): JSX.Element {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M3 7h8m0 0L7 3m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** How one launch ended, per card. */
interface Outcome {
  ok: boolean
  note: string
}

/**
 * One system card.
 *
 * @param props - the system, the roster label for its primary role, its plan,
 *   its busy/outcome state, and the open callback.
 * @returns the grid cell.
 */
function SystemCard({
  system,
  labels,
  hostSupportsOpen,
  busy,
  outcome,
  onOpen,
}: {
  system: SystemView
  labels: ReadonlyMap<string, RoleLabel>
  hostSupportsOpen: boolean
  busy: boolean
  outcome: Outcome | undefined
  onOpen: (system: SystemView) => void
}): JSX.Element {
  const plan = planOpenSystem({ system, hostSupportsOpen })
  const blocked = plan.kind === 'disabled'
  const primary = labels.get(system.primary)

  return (
    <li className={css['sysItem'] ?? ''}>
      <button
        type="button"
        className={css['sysCard'] ?? ''}
        onClick={() => { onOpen(system) }}
        disabled={blocked || busy}
        aria-label={`${system.cta || tt('systems.open')}：${system.name}（${system.nameEn}）`}
        data-dsh-part="system-card"
        data-dsh-slug={system.slug}
        data-dsh-state={blocked ? 'blocked' : busy ? 'busy' : 'ready'}
      >
        <span className={css['sysHead'] ?? ''}>
          <span className={css['sysIcon'] ?? ''}>
            <SystemIcon shapes={system.icon} />
          </span>
          <span className={css['sysTitles'] ?? ''}>
            <span className={css['sysName'] ?? ''}>{system.name}</span>
            <span className={css['sysNameEn'] ?? ''}>{system.nameEn}</span>
          </span>
          {system.kind === '' ? null : <span className={css['sysKind'] ?? ''}>{system.kind}</span>}
        </span>

        <span className={css['sysDesc'] ?? ''}>{system.desc}</span>

        {system.tags.length === 0 ? null : (
          <span className={css['sysTags'] ?? ''}>
            {system.tags.map((tag) => (
              <span className={css['sysTag'] ?? ''} key={tag}>{tag}</span>
            ))}
          </span>
        )}

        <span className={css['sysFoot'] ?? ''}>
          {system.primary === '' ? null : (
            <span
              className={css['sysRole'] ?? ''}
              title={primary === undefined ? tt('systems.roleUnknown') : undefined}
            >
              {primary === undefined ? system.primary : `${system.primary} ${primary.name}`}
            </span>
          )}
          {system.also.map((role) => (
            <span className={css['sysRoleMore'] ?? ''} key={role}>
              {labels.get(role)?.name ?? role}
            </span>
          ))}
          <span className={css['sysSpacer'] ?? ''} />
          <span className={css['sysFlags'] ?? ''}>
            {system.loginRequired ? (
              <span className={css['sysFlag'] ?? ''} data-dsh-flag="login">
                {tt('systems.loginRequired')}
              </span>
            ) : null}
            {system.reachable ? null : (
              <span className={css['sysFlag'] ?? ''} data-dsh-flag="down">
                {tt('systems.unreachable')}
              </span>
            )}
          </span>
        </span>

        <span className={css['sysAction'] ?? ''}>
          <span className={css['sysActionLabel'] ?? ''}>
            {busy ? tt('systems.opening') : system.cta || tt('systems.open')}
          </span>
          <IconArrow />
        </span>
      </button>

      {/* Refusals and outcomes are text beside the card, never a tooltip: the
          person who needs to read why a card will not open is exactly the person
          a tooltip never reaches. */}
      {blocked ? (
        <p className={css['sysNote'] ?? ''} data-dsh-part="system-blocked">
          {tt(BLOCKED_KEY[plan.reason])}
        </p>
      ) : null}
      {outcome === undefined ? null : (
        <p
          className={`${css['sysNote'] ?? ''} ${outcome.ok ? '' : css['sysNoteError'] ?? ''}`}
          data-dsh-part="system-outcome"
          data-dsh-ok={outcome.ok ? 'true' : 'false'}
        >
          {outcome.note}
        </p>
      )}
    </li>
  )
}

/**
 * The whole section: header, coverage line, role groups, cards.
 * @param props - an injectable api (tests) — the panel passes none.
 * @returns the section.
 */
export function SystemsSection({ api }: { api?: SystemsApi } = {}): JSX.Element {
  const client = useMemo(() => api ?? new SystemsApi(), [api])
  const [state, setState] = useState<SystemsState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [busySlug, setBusySlug] = useState('')
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})

  useEffect(() => {
    let live = true
    void (async () => {
      // The two reads are independent, and the roster is allowed to fail: a
      // section that refuses to render because a *different* plugin is missing
      // would be the same mistake the product half already documented.
      const [systems, roster] = await Promise.all([
        client.systems(),
        // The roster joins against the catalog by id, and the two halves spell
        // ids differently on purpose: the roster publishes `agt-031` (the preset
        // directory's name), the catalog writes `AGT-031` (the material's id).
        // Normalising here is what keeps that difference from silently emptying
        // every group.
        readRoster(ROSTER_ROUTE),
      ])
      const labels = new Map<string, RoleLabel>(
        [...(roster ?? new Map<string, RoleLabel>())].map(([, label]) => [label.id.toUpperCase(), label]),
      )
      if (!live) return
      if (!systems.ok) {
        setState({ status: 'error', message: systems.reason })
        return
      }
      setState({ status: 'ready', view: systems.view, labels })
    })()
    return () => {
      live = false
    }
  }, [client])

  const open = useCallback(
    (system: SystemView) => {
      setBusySlug(system.slug)
      void (async () => {
        const result = await client.openSystem(system.slug)
        setBusySlug('')
        setOutcomes((previous) => ({
          ...previous,
          [system.slug]: result.ok
            ? { ok: true, note: tt('systems.opened') }
            : { ok: false, note: result.reason },
        }))
      })()
    },
    [client],
  )

  const view = state.status === 'ready' ? state.view : undefined
  const labels = state.status === 'ready' ? state.labels : new Map<string, RoleLabel>()
  const visible = useMemo(
    () => (view === undefined ? [] : view.systems.filter((system) => matchSystem(system, query, labels))),
    [view, query, labels],
  )
  const groups: RoleGroup[] = useMemo(() => groupSystems(visible, labels), [visible, labels])
  const coverage = useMemo(
    () => (view === undefined ? { touched: 0, total: 0 } : roleCoverage(groups, labels, view.systems)),
    [groups, labels, view],
  )

  // An older host half answers with the catalog but no open route. Reading that
  // as "no opener" is what keeps the buttons from becoming lies.
  const hostSupportsOpen = view !== undefined && view.openRoute !== ''

  return (
    <section className={css['systems'] ?? ''} data-dsh-part="systems-section" aria-label={tt('systems.section')}>
      <div className={css['sectionHead'] ?? ''}>
        <h3 className={css['sectionTitle'] ?? ''}>{tt('systems.section')}</h3>
        <span className={css['spacer'] ?? ''} />
        {view === undefined ? null : (
          <input
            type="search"
            className={css['search'] ?? ''}
            placeholder={tt('systems.search')}
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
            aria-label={tt('systems.search')}
            data-dsh-part="systems-search"
          />
        )}
      </div>

      {view === undefined ? null : (
        <p className={css['systemsMeta'] ?? ''}>
          {labels.size === 0
            ? tt('systems.coverageNoRoster', { systems: view.systems.length })
            : tt('systems.coverage', {
                systems: view.systems.length,
                touched: coverage.touched,
                total: labels.size,
                date: view.probedOn,
              })}
          <span className={css['systemsMetaNote'] ?? ''}>{tt('systems.readOnly')}</span>
        </p>
      )}

      {state.status === 'loading' ? <p className={css['state'] ?? ''}>{tt('systems.loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css['notice'] ?? ''} data-dsh-part="systems-error">
          <span className={css['noticeTitle'] ?? ''}>{tt('systems.section')}</span>
          <p className={css['state'] ?? ''}>{state.message}</p>
        </div>
      ) : null}

      {view !== undefined && view.dropped.length > 0 ? (
        <div className={css['notice'] ?? ''} data-dsh-part="systems-dropped">
          <span className={css['noticeTitle'] ?? ''}>
            {tt('systems.dropped', { count: view.dropped.length })}
          </span>
          <ul className={css['noticeList'] ?? ''}>
            {view.dropped.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      ) : null}

      {view !== undefined && view.systems.length === 0 ? (
        <p className={css['state'] ?? ''} data-dsh-part="systems-empty">{tt('systems.empty')}</p>
      ) : null}

      {view !== undefined && view.systems.length > 0 && visible.length === 0 ? (
        <p className={css['state'] ?? ''} data-dsh-part="systems-search-empty">{tt('systems.searchEmpty')}</p>
      ) : null}

      {groups.map((group) => (
        <div className={css['roleGroup'] ?? ''} key={group.id} data-dsh-part="role-group" data-dsh-role={group.id}>
          <div className={css['roleHead'] ?? ''}>
            <span className={css['roleRule'] ?? ''} aria-hidden="true" />
            <div className={css['roleTitles'] ?? ''}>
              <h4 className={css['roleTitle'] ?? ''}>{group.label}</h4>
              {group.plane === '' ? null : (
                <p className={css['rolePath'] ?? ''}>{group.plane} · {group.domain}</p>
              )}
            </div>
            {group.known ? null : (
              <span className={css['roleUnknown'] ?? ''}>{tt('systems.roleUnknown')}</span>
            )}
            <span className={css['spacer'] ?? ''} />
            <span className={css['roleCount'] ?? ''}>
              {tt('systems.count', { count: group.systems.length })}
            </span>
          </div>
          <ul className={css['sysGrid'] ?? ''}>
            {group.systems.map((system) => (
              <SystemCard
                key={system.slug}
                system={system}
                labels={labels}
                hostSupportsOpen={hostSupportsOpen}
                busy={busySlug === system.slug}
                outcome={outcomes[system.slug]}
                onOpen={open}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
