import { defineConfig } from 'vitest/config'

/** Tests import ../lib (the built artifact) and per-file jsdom for client specs. */
export default defineConfig({
  // SDK 客户端包从 .dsh-types 加载，该目录不带 react；把 react 家族钉到本包自带实例，
  // 避免「Failed to resolve import "react/jsx-runtime"」与 React 双实例。
  resolve: {
    alias: {
      'react/jsx-runtime': new URL('./node_modules/react/jsx-runtime.js', import.meta.url).pathname,
      'react/jsx-dev-runtime': new URL('./node_modules/react/jsx-dev-runtime.js', import.meta.url).pathname,
      react: new URL('./node_modules/react/index.js', import.meta.url).pathname,
      'react-dom/client': new URL('./node_modules/react-dom/client.js', import.meta.url).pathname,
      'react-dom': new URL('./node_modules/react-dom/index.js', import.meta.url).pathname,
    },
  },
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    // deepresearch.spec.ts boots full Cordis Contexts; forks isolation keeps
    // one file's host state from leaking into another (skill-center precedent).
    pool: 'forks',
  },
})
