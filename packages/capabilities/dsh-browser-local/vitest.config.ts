import { defineConfig } from 'vitest/config'

/** Standalone test runner against the published DeepSeek Harness packages. */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    // rc-legacy: frozen rc-era suites (host alpha.1 removed dsh-host-apiproxy);
    // see tests/rc-legacy/README.md — revisit at the 2.0.5 upgrade window.
    exclude: ['tests/rc-legacy/**', '**/node_modules/**', '**/dist/**'],
    setupFiles: ['tests/setup-invariant.ts'],
  },
})
