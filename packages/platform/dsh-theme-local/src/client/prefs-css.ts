import type { ReduceMotionPref, ThemeStudioPrefs } from "./persistence.js";

export const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * "system" mirrors the platform; "on"/"off" are explicit overrides that win
 * over the media query in both directions — that is the whole reason the
 * three-way choice exists instead of a single toggle.
 */
export function shouldReduceMotion(
  pref: ReduceMotionPref,
  prefersReduce: boolean,
): boolean {
  if (pref === "on") return true;
  if (pref === "off") return false;
  return prefersReduce;
}

/**
 * Presentation prefs ride on body attributes so the sheet stays inert until a
 * reader opts in: with no attribute set, not a single rule below matches and
 * the official app renders exactly as shipped. The app's own stylesheet never
 * consults prefers-reduced-motion, so "system" mirrors the media query here
 * instead of pretending the platform already did it.
 */
export const PREFS_CSS = `
body[data-lute-reduce-motion="reduce"] *,
body[data-lute-reduce-motion="reduce"] *::before,
body[data-lute-reduce-motion="reduce"] *::after {
  animation-delay: 0s !important;
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
}
body[data-lute-font-smoothing="on"] {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;

export interface PrefsAttributes {
  fontSmoothing: boolean;
  reduceMotion: boolean;
}

/** The single decision the client uses to set or clear both body attributes. */
export function prefsAttributes(
  prefs: ThemeStudioPrefs,
  prefersReduce: boolean,
): PrefsAttributes {
  return {
    fontSmoothing: prefs.fontSmoothing,
    reduceMotion: shouldReduceMotion(prefs.reduceMotion, prefersReduce),
  };
}
