// Vitest setup: jsdom environment already provides DOM globals; nothing
// extra is needed for the skill-explorer test surface.
//
// React 18 act() requires the act-environment flag; without it every act call
// in panel interaction tests warns (and the warning pollutes CI output).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export {}

/**
 * 确定性 localStorage。本环境的 jsdom 不提供 window.localStorage
 * （实测 href 正常但属性为 undefined），而测试需要验证持久化行为。
 * 用内存实现替代：不依赖 jsdom 内部状态，且每个测试文件独立。
 */
if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() { return store.size },
      clear: () => { store.clear() },
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => { store.delete(key) },
      setItem: (key: string, value: string) => { store.set(key, String(value)) },
    },
  })
}
