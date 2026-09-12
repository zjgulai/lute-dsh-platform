/**
 * Page copy resolution.
 *
 * Deliberately does NOT read a translator off injected props. A slot component
 * registered as `() => createElement(Page, { t })` receives no props at all, so
 * a prop-based translator silently degrades to echoing dictionary KEYS — the
 * page renders "title" / "stat.skills" and no error is raised anywhere. Reading
 * the active dictionary from `document.documentElement.lang` at call time, the
 * way `dsh-role-matrix-local` does, has no such failure mode: the worst case is
 * the zh string.
 *
 * The locale service is still used for the sidebar label, where the runtime
 * genuinely needs a bound translator.
 * @module dsh-algo-skills-local/client/i18n
 */

import { en, zh, type AlgoSkillKey } from './locales.ts'

/** Template values accepted by the interpolator. */
export type TranslateValues = Record<string, string | number>

/** Active dictionary, picked by the document language at call time. */
export function dictionary(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh'
  return lang.toLowerCase().startsWith('en') ? { ...en } : { ...zh }
}

/**
 * Translate one key with optional `{name}` params.
 * @param key - dictionary key.
 * @param values - interpolation values.
 * @returns the localized string; the key itself when the dictionary has no entry.
 */
export function tt(key: AlgoSkillKey, values?: TranslateValues): string {
  return fill(dictionary()[key] ?? key, values)
}

/**
 * Interpolate `{name}` placeholders.
 * @param template - raw template text.
 * @param values - interpolation values.
 * @returns the filled text.
 */
export function fill(template: string, values?: TranslateValues): string {
  if (values === undefined) return template
  let text = template
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value))
  return text
}
