import { defineConfig } from 'vitest/config'

/** Tests import ../lib (the built artifact) and per-file jsdom for client specs. */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    // deepresearch.spec.ts boots full Cordis Contexts; forks isolation keeps
    // one file's host state from leaking into another (skill-center precedent).
    pool: 'forks',
  },
})
