// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/skill-panel.module.css', import.meta.url), 'utf8')

describe('skill center Codex visual contract', () => {
  it('keeps the narrow drawer in the shared responsive family', () => {
    expect(css).toContain('width: min(720px, 92vw)')
    expect(css).toContain('max-width: calc(100vw - 16px)')
    expect(css).toContain('background: var(--dsw-alias-bg-layer-1')
    expect(css).toContain('border-left: 1px solid var(--dsw-alias-border-l2')
  })

  it('uses semantic business accents instead of the former blue visual language', () => {
    expect(css).toContain('var(--dsw-alias-state-business-primary')
    expect(css).toContain('var(--dsw-alias-state-business-tertiary')
    expect(css).not.toContain('#4353a3')
    expect(css).not.toContain('#eef2ff')
    expect(css).not.toContain('#dde3f8')
  })

  it('keeps motion within the shared duration and reduced-motion contract', () => {
    expect(css).toContain('180ms')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toContain('.drawer {\n    animation: none;')
  })

  it('gives the content panel one control and state language', () => {
    expect(css).toContain('height: 32px')
    expect(css).toContain('.drawer button:disabled')
    expect(css).toContain('.formInput:focus')
    expect(css).toContain('.feedbackOk')
    expect(css).toContain('var(--dsw-alias-state-error-secondary')
    expect(css).toContain('var(--dsw-alias-state-success-secondary')
    expect(css).toContain('border-left: 2px solid var(--dsw-alias-state-business-primary')
  })

  it('keeps narrow content single-column and flattens skill entries', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*\.grid\s*\{\s*grid-template-columns:\s*1fr;/)
    expect(css).toContain('transition: border-color 180ms ease, background 180ms ease;')
    expect(css).not.toContain('box-shadow: 0 2px 10px')
  })

  it('uses a semantic overlay layer below the Settings shell', () => {
    expect(css).toContain('--dsh-skill-center-overlay-layer: 2147482000')
    expect(css).toMatch(/z-index:\s*var\(--dsh-skill-center-overlay-layer\)/)
    expect(css).not.toMatch(/z-index:\s*9999\b/)
  })
})
