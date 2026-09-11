/**
 * Skill center panel (browser half): a right-side drawer with a
 * business-domain browsing view (search + domain chips + human-readable
 * cards) and a collapsed developer mode holding the original source-grouped
 * management list plus the create form.
 *
 * Talks to the host route family through SkillApi.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SkillApi, type ListPayload, type SkillEntry } from './api.ts'
import { DOMAIN_OTHER, DOMAINS, domainOf } from './business-domains.ts'
import { zh } from './locales.ts'
import { tt } from './panel-helpers.ts'
import css from './skill-panel.module.css'

/** Panel props: the API client and the close callback. */
export interface SkillPanelProps {
  api: SkillApi
  onClose: () => void
}

type Tab = 'list' | 'create'

/** Human-readable summary: user_summary first, description excerpt fallback. */
function cardSummary(skill: SkillEntry): string {
  if (skill.userSummary !== undefined && skill.userSummary.trim() !== '') return skill.userSummary
  const excerpt = skill.description.replace(/\s+/g, ' ').trim()
  return excerpt.length > 60 ? `${excerpt.slice(0, 60)}…` : excerpt
}

/** Source level -> localized label. */
function sourceLabel(level: string): string {
  const key = `source.${level}` as keyof typeof zh
  return key in zh ? tt(key) : level
}

/** Marks shown next to a skill (model/user invocable). */
function invokableMarks(skill: SkillEntry): string {
  const marks: string[] = []
  if (skill.modelInvocable) marks.push(tt('list.mark.model'))
  if (skill.userInvocable) marks.push(tt('list.mark.user'))
  return marks.join(' / ')
}

/** Toggle/delete actions shared by both card variants. */
function useCardActions(skill: SkillEntry, api: SkillApi, onChanged: () => void): {
  busy: boolean
  error: string | undefined
  toggle(): void
  remove(): void
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const busyRef = useRef(false)

  const toggle = async (): Promise<void> => {
    if (busyRef.current) return
    const path = skill.path
    if (path === undefined) return
    busyRef.current = true
    setBusy(true)
    setError(undefined)
    try {
      await api.setEnabled(skill.name, path, !skill.modelInvocable)
      onChanged()
    } catch (err) {
      setError(tt('list.toggleFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    const path = skill.path
    if (path === undefined) return
    if (!window.confirm(tt('list.deleteConfirm', { name: skill.name }))) return
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(undefined)
    try {
      await api.remove(skill.name, path)
      onChanged()
    } catch (err) {
      setError(tt('list.deleteFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return { busy, error, toggle: () => { void toggle() }, remove: () => { void remove() } }
}

/** One business-view skill card: Chinese title first, human summary, guided try line. */
function BusinessCard({ skill, api, onChanged }: { skill: SkillEntry; api: SkillApi; onChanged: () => void }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const actions = useCardActions(skill, api, onChanged)
  const displayName = skill.title !== undefined && skill.title.trim() !== '' ? skill.title : skill.name
  const summary = cardSummary(skill)
  const showNameSub = skill.title !== undefined && skill.title.trim() !== '' && skill.title !== skill.name

  return (
    <article
      className={css.skill}
      data-dsh-part="skill-row"
      onClick={() => {
        // Touch fallback (no hover): tapping the card toggles the actions row.
        if (window.matchMedia('(hover: none)').matches) setExpanded((value) => !value)
      }}
    >
      <header className={css.skillHeader}>
        <span className={css.skillName}>{displayName}</span>
        {!skill.modelInvocable && <span className={`${css.badge} ${css.badgeDisabled}`}>{tt('list.disabledShort')}</span>}
        {skill.linked === true && <span className={css.badge}>{tt('list.linked')}</span>}
        <span className={css.cardActions} data-expanded={expanded || undefined} onClick={(event) => { event.stopPropagation() }}>
          {skill.path !== undefined && (
            <button
              type="button"
              className={css.switch}
              role="switch"
              aria-checked={skill.modelInvocable}
              title={skill.modelInvocable ? tt('list.enabled') : tt('list.disabled')}
              disabled={actions.busy}
              onClick={actions.toggle}
            >
              <span className={css.switchTrack}><span className={css.switchThumb} /></span>
            </button>
          )}
          {skill.path !== undefined && skill.linked !== true && (
            <button type="button" className={css.deleteButton} disabled={actions.busy} onClick={actions.remove}>
              {tt('list.delete')}
            </button>
          )}
        </span>
      </header>
      {showNameSub && <div className={css.skillNameSub}>{skill.name}</div>}
      <p className={css.skillDesc}>{summary}</p>
      {skill.userTry !== undefined && skill.userTry.trim() !== '' && (
        <p className={css.skillTry}><span className={css.tryLabel}>{tt('list.try')}</span>「{skill.userTry}」</p>
      )}
      <div className={css.skillMeta}>
        <span>{tt('list.sourceLabel')}：{sourceLabel(skill.level)}</span>
        {(skill.modelInvocable || skill.userInvocable) && (
          <span className={css.metaMarks}>{tt('list.invokable', { marks: invokableMarks(skill) })}</span>
        )}
      </div>
      {actions.error !== undefined && <p className={css.feedback}>{actions.error}</p>}
    </article>
  )
}

/** One developer-view card: original name-first layout with always-visible controls. */
function DevCard({ skill, api, onChanged }: { skill: SkillEntry; api: SkillApi; onChanged: () => void }): React.JSX.Element {
  const actions = useCardActions(skill, api, onChanged)
  return (
    <article className={css.skill} data-dsh-part="skill-row">
      <header className={css.skillHeader}>
        <span className={css.skillName}>{skill.name}</span>
        {skill.provider !== undefined && <span className={css.badge}>{skill.provider}</span>}
        {skill.linked === true && <span className={css.badge}>{tt('list.linked')}</span>}
        {(skill.modelInvocable || skill.userInvocable) && (
          <span className={`${css.badge} ${css.badgeInvokable}`}>{tt('list.invokable', { marks: invokableMarks(skill) })}</span>
        )}
        {skill.path !== undefined && (
          <button
            type="button"
            className={css.switch}
            role="switch"
            aria-checked={skill.modelInvocable}
            title={skill.modelInvocable ? tt('list.enabled') : tt('list.disabled')}
            disabled={actions.busy}
            onClick={actions.toggle}
          >
            <span className={css.switchTrack}><span className={css.switchThumb} /></span>
          </button>
        )}
        {skill.path !== undefined && skill.linked !== true && (
          <button type="button" className={css.deleteButton} disabled={actions.busy} onClick={actions.remove}>
            {tt('list.delete')}
          </button>
        )}
      </header>
      <p className={css.skillDesc}>{skill.description}</p>
      {skill.whenToUse !== undefined && skill.whenToUse !== '' && (
        <p className={css.skillWhen}>{tt('list.when', { when: skill.whenToUse })}</p>
      )}
      {skill.path !== undefined && <div className={css.skillPath}>{skill.path}</div>}
      {actions.error !== undefined && <p className={css.feedback}>{actions.error}</p>}
    </article>
  )
}

/** Flat list of all skills from the grouped payload. */
function flattenSkills(payload: ListPayload): SkillEntry[] {
  const out: SkillEntry[] = []
  for (const group of payload.groups) out.push(...group.skills)
  return out
}

/** The business browsing view (default). */
function BrowseTab({ api, refreshTick }: { api: SkillApi; refreshTick: number }): React.JSX.Element {
  const [payload, setPayload] = useState<ListPayload | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState<string>('all')
  const loadSeq = useRef(0)

  const load = async (): Promise<void> => {
    const seq = ++loadSeq.current
    try {
      const next = await api.list()
      if (seq !== loadSeq.current) return
      setPayload(next)
      setError(undefined)
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(tt('list.loadFailed', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  useEffect(() => { void load() }, [api, refreshTick])

  const skills = useMemo(() => flattenSkills(payload ?? { cwd: '', projectRoots: [], complete: true, groups: [] }), [payload])

  // Collapsed-by-default "other" group (2026-09-10): ~184/265 installed skills
  // are unmapped-to-business-domain helpers; collapsing their group keeps the
  // browse view honest about what the business skills actually are. The
  // user's expand choice persists across panel opens.
  const [otherExpanded, setOtherExpanded] = useState<boolean>(() => {
    try { return window.localStorage.getItem('dsh-skill-center:other-expanded') === '1' } catch { return false }
  })
  const toggleOther = (): void => {
    setOtherExpanded((value) => {
      try { window.localStorage.setItem('dsh-skill-center:other-expanded', value ? '0' : '1') } catch { /* storage unavailable: session-only */ }
      return !value
    })
  }
  const total = skills.length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return skills.filter((skill) => {
      if (domain !== 'all' && domainOf(skill.name) !== domain) return false
      if (q === '') return true
      const haystack = `${skill.name} ${skill.title ?? ''} ${skill.description} ${skill.userSummary ?? ''} ${skill.whenToUse ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [skills, query, domain])

  const grouped = useMemo(() => {
    const byDomain = new Map<string, SkillEntry[]>()
    for (const skill of filtered) {
      const key = domainOf(skill.name)
      const list = byDomain.get(key) ?? []
      list.push(skill)
      byDomain.set(key, list)
    }
    const order = [...DOMAINS.map((item) => item.key), DOMAIN_OTHER]
    return order
      .map((key) => ({ key, skills: byDomain.get(key) ?? [] }))
      .filter((group) => group.skills.length > 0)
  }, [filtered])

  if (error !== undefined && payload === undefined) return <div className={css.status}>{error}</div>
  if (payload === undefined) return <div className={css.status}>{tt('list.loading')}</div>
  if (total === 0) return <div className={css.status}>{tt('list.empty')}</div>

  return (
    <div className={css.browse}>
      <div className={css.searchRow}>
        <input
          type="search"
          className={css.searchInput}
          placeholder={tt('search.placeholder')}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          aria-label={tt('search.placeholder')}
        />
        <span className={css.totalCount}>{tt('list.count', { count: String(total) })}</span>
      </div>
      <div className={css.chips} role="tablist" aria-label={tt('panel.title')}>
        <button type="button" className={`${css.chip} ${domain === 'all' ? css.chipActive : ''}`} onClick={() => { setDomain('all') }}>
          {tt('domain.all')}
        </button>
        {DOMAINS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${css.chip} ${domain === item.key ? css.chipActive : ''}`}
            onClick={() => { setDomain(domain === item.key ? 'all' : item.key) }}
          >
            <span aria-hidden="true">{item.icon}</span>
            {tt(`domain.${item.key}` as keyof typeof zh)}
          </button>
        ))}
      </div>
      {error !== undefined && <p className={css.feedback}>{error}</p>}
      {filtered.length === 0 ? (
        <div className={css.status}>{tt('search.empty')}</div>
      ) : (
        grouped.map((group) => {
          const domainItem = DOMAINS.find((item) => item.key === group.key)
          const title = group.key === DOMAIN_OTHER ? tt('domain.other') : tt(`domain.${group.key}` as keyof typeof zh)
          const collapsed = group.key === DOMAIN_OTHER && !otherExpanded
          return (
            <section key={group.key} className={css.group}>
              <h3 className={css.groupTitle}>
                {domainItem !== undefined && <span className={css.domainIcon} aria-hidden="true">{domainItem.icon}</span>}
                {title}
                <span className={css.count}>{tt('list.count', { count: String(group.skills.length) })}</span>
                {group.key === DOMAIN_OTHER && (
                  <button type="button" className={css.collapseToggle} onClick={toggleOther} aria-expanded={otherExpanded}>
                    {otherExpanded ? tt('domain.otherCollapse') : tt('domain.otherExpand')}
                  </button>
                )}
              </h3>
              {!collapsed && (
                <div className={css.grid}>
                  {group.skills.map((skill) => (
                    <BusinessCard key={skill.name} skill={skill} api={api} onChanged={() => { void load() }} />
                  ))}
                </div>
              )}
              {collapsed && <p className={css.groupHint}>{tt('domain.otherHint')}</p>}
            </section>
          )
        })
      )}
    </div>
  )
}

/** The developer management view (source-grouped list + create form). */
function DevTab({ api, refreshTick, onCwd }: { api: SkillApi; refreshTick: number; onCwd: (cwd: string) => void }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('list')
  const [payload, setPayload] = useState<ListPayload | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const loadSeq = useRef(0)

  const load = async (): Promise<void> => {
    const seq = ++loadSeq.current
    try {
      const next = await api.list()
      if (seq !== loadSeq.current) return
      setPayload(next)
      onCwd(next.cwd)
      setCwd(next.cwd)
      setError(undefined)
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(tt('list.loadFailed', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  useEffect(() => { void load() }, [api, refreshTick])

  const [cwd, setCwd] = useState<string | undefined>(undefined)

  if (tab === 'create') {
    return (
      <div>
        <div className={css.tabs} data-dsh-part="tab-bar" role="tablist">
          <button type="button" role="tab" className={css.tab} aria-selected={false} onClick={() => { setTab('list') }}>
            {tt('tab.list')}
          </button>
          <button type="button" role="tab" className={`${css.tab} ${css.tabActive}`} aria-selected onClick={() => { setTab('create') }}>
            {tt('tab.create')}
          </button>
        </div>
        <CreateTab api={api} cwd={cwd} />
      </div>
    )
  }
  if (error !== undefined && payload === undefined) return <div className={css.status}>{error}</div>
  if (payload === undefined) return <div className={css.status}>{tt('list.loading')}</div>
  if (payload.groups.length === 0) return <div className={css.status}>{tt('list.empty')}</div>

  return (
    <div>
      <div className={css.tabs} data-dsh-part="tab-bar" role="tablist">
        <button type="button" role="tab" className={`${css.tab} ${css.tabActive}`} aria-selected onClick={() => { setTab('list') }}>
          {tt('tab.list')}
        </button>
        <button type="button" role="tab" className={css.tab} aria-selected={false} onClick={() => { setTab('create') }}>
          {tt('tab.create')}
        </button>
      </div>
      {error !== undefined && <p className={css.feedback}>{error}</p>}
      {payload.groups.map((group) => {
        const groupKey = `group.${group.key}` as keyof typeof zh
        const hintKey = `groupHint.${group.key}` as keyof typeof zh
        const title = groupKey in zh ? tt(groupKey) : group.title
        const hint = hintKey in zh ? tt(hintKey) : group.hint
        return (
          <section key={group.key} className={css.group}>
            <h3 className={css.groupTitle}>
              {title}
              <span className={css.count}>{tt('list.count', { count: String(group.skills.length) })}</span>
            </h3>
            {hint !== '' && <p className={css.groupHint}>{hint}</p>}
            {group.skills.map((skill) => (
              <DevCard key={skill.name} skill={skill} api={api} onChanged={() => { void load() }} />
            ))}
          </section>
        )
      })}
    </div>
  )
}

/** The create form (developer mode). */
function CreateTab({ api, cwd }: { api: SkillApi; cwd: string | undefined }): React.JSX.Element {
  const [root, setRoot] = useState<'user' | 'project'>('user')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | undefined>(undefined)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (name.trim() === '' || description.trim() === '' || content.trim() === '') {
      setFeedback({ text: tt('create.empty'), ok: false })
      return
    }
    setBusy(true)
    try {
      const result = await api.create({ root, name: name.trim(), description: description.trim(), whenToUse: whenToUse.trim() || undefined, content, cwd: cwd ?? '' })
      setFeedback({ text: tt('create.created', { path: result.path }), ok: true })
      setName('')
      setDescription('')
      setWhenToUse('')
      setContent('')
    } catch (err) {
      setFeedback({ text: tt('create.failed', { error: err instanceof Error ? err.message : String(err) }), ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={css.form} onSubmit={(event) => { void submit(event) }}>
      <label className={css.formLabel}>
        {tt('create.root')}
        <select className={css.formInput} value={root} onChange={(event) => { setRoot(event.target.value as 'user' | 'project') }}>
          <option value="user">{tt('create.root.user')}</option>
          <option value="project">{tt('create.root.project')}</option>
        </select>
      </label>
      <label className={css.formLabel}>
        {tt('create.name')}
        <input className={css.formInput} value={name} placeholder={tt('create.namePlaceholder')} onChange={(event) => { setName(event.target.value) }} />
      </label>
      <label className={css.formLabel}>
        {tt('create.description')}
        <input className={css.formInput} value={description} onChange={(event) => { setDescription(event.target.value) }} />
      </label>
      <label className={css.formLabel}>
        {tt('create.whenToUse')}
        <input className={css.formInput} value={whenToUse} onChange={(event) => { setWhenToUse(event.target.value) }} />
      </label>
      <label className={css.formLabel}>
        {tt('create.content')}
        <textarea className={`${css.formInput} ${css.formTextarea}`} value={content} onChange={(event) => { setContent(event.target.value) }} />
      </label>
      <button type="submit" className={css.formButton} disabled={busy}>{tt('create.submit')}</button>
      {feedback !== undefined && (
        <p className={feedback.ok ? `${css.feedback} ${css.feedbackOk}` : css.feedback}>{feedback.text}</p>
      )}
      <p className={css.note}>{tt('create.note')}</p>
    </form>
  )
}

/** The skill center drawer panel. */
export function SkillPanel({ api, onClose }: SkillPanelProps): React.JSX.Element {
  const [devMode, setDevMode] = useState(false)
  const [cwd, setCwd] = useState<string | undefined>(undefined)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Typing in the create form must not close the panel: Escape there is
      // an editing gesture, not a dismiss gesture.
      const target = event.target as HTMLElement | null
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={css.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside className={css.drawer} data-dsh-part="drawer" role="dialog" aria-modal="true" aria-label={tt('panel.title')}>
        <header className={css.head} data-dsh-part="head">
          <div className={css.headText}>
            <h2 className={css.headTitle}>{tt('panel.title')}</h2>
            <p className={css.headSubtitle}>{tt('panel.subtitle')}</p>
          </div>
          <button
            type="button"
            className={`${css.headButton} ${devMode ? css.headButtonActive : ''}`}
            title={tt('devMode.hint')}
            onClick={() => { setDevMode((value) => !value) }}
          >
            {tt('devMode.label')}
          </button>
          <button type="button" className={css.headButton} onClick={() => { setRefreshTick((tick) => tick + 1) }}>
            {tt('refresh')}
          </button>
          <button type="button" className={css.headButton} onClick={onClose}>{tt('close')}</button>
        </header>
        {devMode && <p className={css.devHint}>{tt('devMode.hint')}</p>}
        <div className={css.body}>
          {devMode
            ? <DevTab api={api} refreshTick={refreshTick} onCwd={setCwd} />
            : <BrowseTab api={api} refreshTick={refreshTick} />}
        </div>
        {typeof cwd === 'string' && cwd !== '' && devMode && (
          <footer className={css.foot}>{tt('cwd', { cwd })}</footer>
        )}
      </aside>
    </div>
  )
}
