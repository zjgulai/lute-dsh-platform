import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths({
    projects: [
      './tsconfig.vitest.json',
    ],
  })],
  // npm SDK packages reference sourcemaps that are not published (files
  // exclude *.map); do not attempt to load them during transform.
  server: {
    sourcemapIgnoreList: () => true,
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    pool: 'forks',
    environment: 'jsdom',
    // jsdom 需要非 opaque 的源才提供 localStorage（默认 about:blank 时
    // window.localStorage 为 undefined，实测报「reading 'clear'」）。
    environmentOptions: { jsdom: { url: 'http://localhost:3080/' } },
    setupFiles: ['./vitest.setup.ts'],
    // @deepseek-ai SDK packages ship browser bundles (CSS imports included);
    // keep them vite-transformed instead of node-externalized.
    server: {
      deps: {
        inline: [/@deepseek-ai\//],
      },
    },
  },
})
