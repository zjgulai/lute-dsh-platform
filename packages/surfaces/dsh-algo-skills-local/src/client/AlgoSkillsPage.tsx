/**
 * The algorithm-skills settings page.
 *
 * Four levels, one screen: 4 面 → 责任域 → 50 岗位 → the cards. The page opens
 * with every level collapsed, because the useful first impression is the shape
 * of the organization — 4 planes carrying 1338 cards — not 1338 cards.
 *
 * Two facts this page states that no other surface does, and both exist to stop
 * it from over-claiming:
 *
 *  - 「已归位 1327 / 未归类 11」. The corpus classified 1327 cards; 11 belong to
 *    no responsibility. A page that silently dropped them would report 1338
 *    placed and be wrong in the direction that hides work.
 *  - The per-card wiring tag. A card is placed by how it was *classified*; a
 *    preset wires it by an independent decision. 326 cards are wired into their
 *    own role, 23 are classified into one role but wired into another, and 978
 *    are wired nowhere. Showing placement alone would imply a route to the model
 *    that 978 of these cards do not have.
 *
 * Failure policy: a failed fetch renders an error line and nothing else. `apply`
 * never throws (an external plugin must not be able to take the shell's boot
 * down with it), and a failed toggle reverts its own switch rather than leaving
 * the UI claiming a state the file does not have.
 * @module dsh-algo-skills-local/client/AlgoSkillsPage
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RoleNode, SkillRow, TreePayload } from '../wire.ts'
import { expansionFor, narrowTree } from './filter.ts'
import { fill, tt } from './i18n.ts'
import { ROUTES } from './routes.ts'
import css from './algo-skills.module.css'

/** Props the settings slot supplies; the page needs none today. */
export type AlgoSkillsPageProps = Record<string, never>

/** Minimal fetch wrapper: JSON in, thrown Error out. */
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return (await response.json()) as T
}

/** Total cards under a role list. */
function roleCards(roles: RoleNode[]): number {
  return roles.reduce((sum, role) => sum + role.skills.length, 0)
}

/** One card. */
function SkillCard({
  card,
  busy,
  onToggle,
}: {
  card: SkillRow
  busy: boolean
  onToggle: (name: string, enabled: boolean) => void
}): JSX.Element {
  return (
    <div className={css['card'] ?? ''} data-dsh-part="algo-skill-card" data-skill={card.name}>
      <div className={css['cardHead'] ?? ''}>
        <span className={css['cardTitle'] ?? ''} title={card.name}>
          {card.title}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={card.modelEnabled ? 'true' : 'false'}
          aria-label={card.title}
          title={card.modelEnabled ? tt('switch.on') : tt('switch.off')}
          className={`${css['switch'] ?? ''}${card.modelEnabled ? ` ${css['switchOn'] ?? ''}` : ''}`}
          disabled={busy}
          onClick={() => { onToggle(card.name, !card.modelEnabled) }}
        >
          <span className={css['knob'] ?? ''} />
        </button>
      </div>
      {card.summary !== '' ? <p className={css['cardSummary'] ?? ''}>{card.summary}</p> : null}
      <div className={css['cardFoot'] ?? ''}>
        {card.srcDomain !== '' ? <span className={css['chip'] ?? ''}>{card.srcDomain}</span> : null}
        {card.wired ? <span className={`${css['chip'] ?? ''} ${css['chipWired'] ?? ''}`}>{tt('chip.wired')}</span> : null}
        {!card.wired && card.wiredElsewhere.length > 0 ? (
          <span className={`${css['chip'] ?? ''} ${css['chipDrift'] ?? ''}`} title={card.wiredElsewhere.join(', ')}>
            {fill(tt('chip.drift'), { role: card.wiredElsewhere.join(',').toUpperCase() })}
          </span>
        ) : null}
        {!card.wired && card.wiredElsewhere.length === 0 ? (
          <span className={`${css['chip'] ?? ''} ${css['chipOff'] ?? ''}`}>{tt('chip.unwired')}</span>
        ) : null}
        {/* Two facts that used to be one word: this role's preset DOES carry the
            card (green chip above), while the file flag keeps it out of every
            session that is not this role's. Before 2026-09-13 the preset's
            registration was itself vetoed by that flag, so 275 of 439
            whitelisted slots were dead and the page never said so. Now the
            grant holds inside the role and the switch explains itself for the
            outside — so this chip states the scope rather than an alarm. */}
        {card.wired && !card.modelEnabled ? (
          <span
            className={`${css['chip'] ?? ''} ${css['chipModelOff'] ?? ''}`}
            data-dsh-part="algo-chip-model-off"
            title={tt('chip.off.fix')}
          >
            {tt('chip.off')}
          </span>
        ) : null}
        {card.alsoServes.slice(0, 2).map((name) => (
          <span key={name} className={css['chip'] ?? ''}>{fill(tt('chip.also'), { name })}</span>
        ))}
      </div>
    </div>
  )
}

/**
 * The settings section body.
 * @param props - bound translator from the slot runtime.
 * @returns the page.
 */
export function AlgoSkillsPage(): JSX.Element {
  const [tree, setTree] = useState<TreePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [showIssues, setShowIssues] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    getJson<TreePayload>(ROUTES.tree, controller.signal)
      .then((payload) => { setTree(payload) })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => { controller.abort() }
  }, [nonce])

  const narrowed = useMemo(
    () => (tree === null ? null : narrowTree(tree, query)),
    [tree, query],
  )
  const forced = useMemo(() => (narrowed === null ? new Set<string>() : expansionFor(narrowed)), [narrowed])

  const isOpen = useCallback((key: string): boolean => {
    if (forced.size > 0 && forced.has(key)) return true
    return open[key] === true
  }, [forced, open])

  const flip = useCallback((key: string) => {
    setOpen((prev) => {
      const next = { ...prev }
      if (next[key] === true) delete next[key]
      else next[key] = true
      return next
    })
  }, [])

  /** Expand or collapse every level at once. */
  const setAll = useCallback((expanded: boolean) => {
    if (tree === null) return
    if (!expanded) { setOpen({}); return }
    const next: Record<string, boolean> = {}
    for (const plane of tree.planes) {
      next[plane.id] = true
      for (const domain of plane.domains) {
        next[`${plane.id}/${domain.id}`] = true
        for (const role of domain.roles) next[role.id] = true
      }
    }
    next['__unplaced'] = true
    setOpen(next)
  }, [tree])

  const toggle = useCallback((name: string, enabled: boolean) => {
    setBusy((prev) => ({ ...prev, [name]: true }))
    // Optimistic, then reverted on failure: a switch that stays flipped after a
    // rejected write is the UI asserting a state the file does not have.
    setTree((prev) => (prev === null ? prev : patchCard(prev, name, enabled)))
    fetch(ROUTES.toggle, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, enabled }),
    })
      .then(async (response) => {
        if (response.ok) return
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `HTTP ${String(response.status)}`)
      })
      .then(() => {
        // Drop the stale server-side tree so the next open re-reads the files.
        setTree((prev) => (prev === null ? prev : { ...prev }))
      })
      .catch((reason: unknown) => {
        setTree((prev) => (prev === null ? prev : patchCard(prev, name, !enabled)))
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        setBusy((prev) => {
          const next = { ...prev }
          delete next[name]
          return next
        })
      })
  }, [])

  if (error !== null && tree === null) {
    return <div className={css['root'] ?? ''} data-plugin="dsh-algo-skills-local"><div className={css['error'] ?? ''}>{error}</div></div>
  }
  if (tree === null) {
    return <div className={css['root'] ?? ''} data-plugin="dsh-algo-skills-local"><div className={css['hint'] ?? ''}>{tt('loading')}</div></div>
  }

  const view = narrowed ?? narrowTree(tree, '')
  const totals = tree.totals

  return (
    <div className={css['root'] ?? ''} data-plugin="dsh-algo-skills-local">
      <header className={css['head'] ?? ''}>
        <div className={css['headRow'] ?? ''}>
          <h2 className={css['title'] ?? ''}>{tt('title')}</h2>
          <span className={css['count'] ?? ''}>{totals.planes} 面 · {totals.distinctDomains} 责任域 · {totals.roles} 岗位</span>
        </div>
        <p className={css['subtitle'] ?? ''}>{tt('subtitle')}</p>
        <span className={css['path'] ?? ''}>{tree.root}</span>
      </header>

      <div className={css['stats'] ?? ''}>
        <Stat value={totals.skills} label={tt('stat.skills')} hint={tt('stat.skills.hint')} />
        <Stat value={totals.placed} label={tt('stat.placed')} hint={tt('stat.placed.hint')} />
        {totals.unplaced > 0 ? <Stat value={totals.unplaced} label={tt('stat.unplaced')} hint={tt('stat.unplaced.hint')} warn /> : null}
        <Stat value={totals.wired} label={tt('stat.wired')} hint={tt('stat.wired.hint')} />
        {totals.emptyRoles > 0 ? <Stat value={totals.emptyRoles} label={tt('stat.emptyRoles')} hint={tt('stat.emptyRoles.hint')} warn /> : null}
      </div>

      {/* The labels above are the organization's own words, and a first-time
          reader does not have them. Spelling the model out once here is the
          difference between 「已设为岗位自带 127」 reading as a fact and reading
          as jargon — a tooltip alone is not enough, because nobody hovers a
          number they have not decided to care about yet. */}
      <div className={css['legend'] ?? ''} data-dsh-part="algo-legend">
        <span className={css['legendTitle'] ?? ''}>{tt('legend.title')}</span>
        <span className={css['legendBody'] ?? ''}>{tt('legend.body')}</span>
      </div>

      <div className={css['toolbar'] ?? ''}>
        <input
          className={css['search'] ?? ''}
          type="search"
          placeholder={tt('searchPlaceholder')}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
        />
        {view.searching ? <span className={css['hitCount'] ?? ''}>{tt('stat.hits')} {view.cards}</span> : null}
        <button type="button" className={css['tool'] ?? ''} onClick={() => { setAll(true) }}>{tt('expandAll')}</button>
        <button type="button" className={css['tool'] ?? ''} onClick={() => { setAll(false) }}>{tt('collapseAll')}</button>
        <button type="button" className={css['tool'] ?? ''} onClick={() => { setNonce((n) => n + 1) }}>{tt('refresh')}</button>
      </div>

      {error !== null ? <div className={css['error'] ?? ''}>{error}</div> : null}

      {tree.issues.length > 0 ? (
        <div className={css['issues'] ?? ''}>
          <button type="button" className={css['issuesHead'] ?? ''} onClick={() => { setShowIssues((v) => !v) }}>
            <span className={css['caret'] ?? ''}>{showIssues ? '\u25BE' : '\u25B8'}</span>
            {tt('issues.title')} · {fill(tt('issues.count'), { count: tree.issues.length })}
          </button>
          {showIssues ? (
            <div className={css['issuesBody'] ?? ''}>
              {tree.issues.map((issue) => <div key={issue} className={css['issueLine'] ?? ''}>{issue}</div>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {view.cards === 0 ? <div className={css['empty'] ?? ''}>{view.searching ? tt('empty') : tt('emptyTree')}</div> : null}

      {view.planes.map((plane) => {
        const planeOpen = isOpen(plane.id)
        const planeCards = roleCards(plane.domains.flatMap((domain) => domain.roles))
        const roleTotal = plane.domains.reduce((sum, domain) => sum + domain.roles.length, 0)
        return (
          <section key={plane.id} className={css['plane'] ?? ''} data-dsh-part="algo-plane" data-plane={plane.id}>
            <button
              type="button"
              className={css['planeHead'] ?? ''}
              aria-expanded={planeOpen ? 'true' : 'false'}
              onClick={() => { flip(plane.id) }}
            >
              <span className={css['caret'] ?? ''}>{planeOpen ? '\u25BE' : '\u25B8'}</span>
              {plane.icon !== '' ? <img className={css['avatar'] ?? ''} src={plane.icon} alt="" /> : null}
              <span className={css['planeText'] ?? ''}>
                <span className={css['planeName'] ?? ''}>{plane.name}</span>
                {plane.purpose !== '' ? <span className={css['planePurpose'] ?? ''} title={plane.purpose}>{plane.purpose}</span> : null}
              </span>
              <span className={css['count'] ?? ''}>{roleTotal} 岗 · {planeCards} 张</span>
            </button>
            {planeOpen ? (
              <div className={css['planeBody'] ?? ''}>
                {plane.domains.map((domain) => {
                  const key = `${plane.id}/${domain.id}`
                  const domainOpen = isOpen(key)
                  const cards = roleCards(domain.roles)
                  return (
                    <div key={key} className={css['domain'] ?? ''} data-dsh-part="algo-domain" data-domain={domain.id}>
                      <button
                        type="button"
                        className={css['domainHead'] ?? ''}
                        aria-expanded={domainOpen ? 'true' : 'false'}
                        onClick={() => { flip(key) }}
                      >
                        <span className={css['caret'] ?? ''}>{domainOpen ? '\u25BE' : '\u25B8'}</span>
                        {domain.icon !== '' ? <img className={css['avatarSm'] ?? ''} src={domain.icon} alt="" /> : null}
                        <span className={css['domainName'] ?? ''}>{domain.name}</span>
                        <span className={css['count'] ?? ''}>{domain.roles.length} 岗 · {cards} 张</span>
                      </button>
                      {domainOpen ? (
                        <div className={css['domainBody'] ?? ''}>
                          {domain.roles.map((role) => {
                            const roleOpen = isOpen(role.id)
                            return (
                              <div key={role.id} className={css['role'] ?? ''} data-dsh-part="algo-role" data-role={role.agt}>
                                <button
                                  type="button"
                                  className={css['roleHead'] ?? ''}
                                  aria-expanded={roleOpen ? 'true' : 'false'}
                                  onClick={() => { flip(role.id) }}
                                >
                                  <span className={css['caret'] ?? ''}>{roleOpen ? '\u25BE' : '\u25B8'}</span>
                                  {role.icon !== '' ? <img className={css['avatarSm'] ?? ''} src={role.icon} alt="" /> : null}
                                  <span className={css['roleText'] ?? ''}>
                                    <span className={css['roleName'] ?? ''}>{role.name}</span>
                                    <span className={css['roleAgt'] ?? ''} title={role.description}>
                                      {role.agt}
                                      {role.artifact !== '' ? ` · ${tt('role.artifact')}：${role.artifact}` : ''}
                                    </span>
                                  </span>
                                  {role.skills.length === 0
                                    ? <span className={css['roleEmpty'] ?? ''}>{tt('role.empty')}</span>
                                    : <span className={css['count'] ?? ''}>{fill(tt('role.skills'), { count: role.skills.length })}{role.wired > 0 ? ` · 接线 ${role.wired}` : ''}</span>}
                                </button>
                                {roleOpen && role.skills.length > 0 ? (
                                  <div className={css['roleBody'] ?? ''}>
                                    <div className={css['grid'] ?? ''}>
                                      {role.skills.map((card) => (
                                        <SkillCard
                                          key={card.name}
                                          card={card}
                                          busy={busy[card.name] === true}
                                          onToggle={toggle}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </section>
        )
      })}

      {view.unplaced.length > 0 ? (
        <section className={css['unplaced'] ?? ''} data-dsh-part="algo-unplaced">
          <button
            type="button"
            className={css['unplacedHead'] ?? ''}
            aria-expanded={isOpen('__unplaced') ? 'true' : 'false'}
            onClick={() => { flip('__unplaced') }}
          >
            <span className={css['caret'] ?? ''}>{isOpen('__unplaced') ? '\u25BE' : '\u25B8'}</span>
            <span className={css['unplacedName'] ?? ''}>{tt('unplaced.title')}</span>
            <span className={css['count'] ?? ''}>{view.unplaced.length} 张</span>
          </button>
          {isOpen('__unplaced') ? (
            <div className={css['unplacedBody'] ?? ''}>
              <p className={css['unplacedNote'] ?? ''}>{tt('unplaced.note')}</p>
              <div className={css['grid'] ?? ''}>
                {view.unplaced.map((card) => (
                  <SkillCard key={card.name} card={card} busy={busy[card.name] === true} onToggle={toggle} />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

/** One stat tile. The hint is the tile's tooltip; the same wording is spelled out in the legend. */
function Stat({ value, label, hint, warn }: { value: number; label: string; hint?: string; warn?: boolean }): JSX.Element {
  return (
    <div
      className={`${css['stat'] ?? ''}${warn === true ? ` ${css['statWarn'] ?? ''}` : ''}`}
      data-dsh-part="algo-stat"
      title={hint}
    >
      <span className={css['statValue'] ?? ''}>{value}</span>
      <span className={css['statLabel'] ?? ''}>{label}</span>
    </div>
  )
}

/** Immutably flip one card's `modelEnabled` across the whole tree. */
function patchCard(tree: TreePayload, name: string, enabled: boolean): TreePayload {
  const patch = (card: SkillRow): SkillRow => (card.name === name ? { ...card, modelEnabled: enabled } : card)
  return {
    ...tree,
    planes: tree.planes.map((plane) => ({
      ...plane,
      domains: plane.domains.map((domain) => ({
        ...domain,
        roles: domain.roles.map((role) => ({ ...role, skills: role.skills.map(patch) })),
      })),
    })),
    unplaced: tree.unplaced.map(patch),
  }
}
