import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { SlotErrorBoundary } from '../src/client/SlotErrorBoundary.tsx'
import type { AgentTeamController } from '../src/client/controller.ts'
import { AGENT_TEAM_LOCALE_NS, DICTIONARIES } from '../src/client/i18n.ts'

/** 最小 controller 替身：只提供边界渲染所需的三项。 */
function controller(): AgentTeamController {
  const t = ((key: string) => (DICTIONARIES.zh as Record<string, string>)[key] ?? key) as never
  return {
    i18n: { t, locale: 'zh', register: () => () => {}, ns: AGENT_TEAM_LOCALE_NS },
    load: async () => ({ squads: [] }),
  } as unknown as AgentTeamController
}

function Boom(): ReactNode {
  const member: { phase?: string } | undefined = undefined
  // 复现用户报告的错误形态：读取 undefined 的 phase
  return <span>{member!.phase}</span>
}

afterEach(() => { vi.restoreAllMocks() })

describe('SlotErrorBoundary 的可观测性', () => {
  it('捕获子树异常时渲染崩溃文案，并把堆栈输出到控制台日志（便于定位根因）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <SlotErrorBoundary controller={controller()} testId="probe">
        <Boom />
      </SlotErrorBoundary>,
    )

    expect(screen.getByText('小队界面遇到不兼容的数据')).toBeTruthy()
    const logged = spy.mock.calls.flat().map(String).join(' ')
    expect(logged).toContain("reading 'phase'")
  })
})
