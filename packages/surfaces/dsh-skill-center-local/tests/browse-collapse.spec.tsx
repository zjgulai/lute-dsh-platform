/** Browse view: the unmapped "other" group collapses by default (2026-09-10). */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SkillPanel } from '../src/client/SkillPanel.tsx'
import { SkillApi, type ListPayload } from '../src/client/api.ts'

function payload(names: string[]): ListPayload {
  return {
    cwd: '/tmp',
    projectRoots: [],
    complete: true,
    groups: [{
      key: 'user-dsh', title: 'user-dsh', hint: '',
      skills: names.map((name) => ({
        name, description: 'd', level: 'user-dsh',
        modelInvocable: true, userInvocable: true,
      })),
    }],
  }
}

describe('BrowseTab other-group collapse', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    window.localStorage.clear()
  })

  it('renders business cards immediately and collapses the other group behind a toggle', async () => {
    const list = vi.fn(async () => payload([
      'cross-border-selection',       // sourcing ((mapped business domain)
      'scenario-driven-product-scout', // sourcing
      'some-unmapped-helper',          // -> other
    ]))
    const api = { list, setEnabled: vi.fn(), remove: vi.fn(), create: vi.fn() } as unknown as SkillApi
    let root: Root | undefined
    const container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
      root = createRoot(container)
      root.render(<SkillPanel api={api} onClose={() => {}} />)
    })
    // Business domain cards render.
    expect(container.textContent).toContain('选品洞察')
    expect(container.textContent).toContain('cross-border-selection')
    // The unmapped skill is NOT rendered as a card, and the group shows collapsed.
    expect(container.textContent).toContain('其他能力')
    expect(container.textContent).toContain('展开')
    expect(container.querySelector('[data-dsh-part="skill-row"]')?.textContent ?? '').not.toContain('some-unmapped-helper')
    // Expand: cards appear, toggle flips to collapse, choice persists.
    const toggle = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '展开')
    expect(toggle).toBeDefined()
    await act(async () => { toggle!.click() })
    expect(container.textContent).toContain('收起')
    expect(window.localStorage.getItem('dsh-skill-center:other-expanded')).toBe('1')
    expect(container.textContent).toContain('some-unmapped-helper')
    root?.unmount()
  })
})
