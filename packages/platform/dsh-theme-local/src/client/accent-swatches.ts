import type { ThemeStudioSettings } from "../theme-settings.js";

export const ACCENT_SWATCH_IDS = [
  "lute",
  "blue",
  "teal",
  "violet",
  "amber",
  "rose",
  "slate",
  "red",
] as const;

export type AccentSwatchId = (typeof ACCENT_SWATCH_IDS)[number];

export interface AccentSwatch {
  id: AccentSwatchId;
  light: string;
  dark: string;
}

/**
 * Curated brand-led accent pairs. Each pair is a two-variant decision:
 * the light value carries the accent on the light canvas, the dark value on
 * the charcoal one. accent-swatches.test.ts verifies every pair against the
 * default LUTE canvas (WCAG 1.4.11 wants 3:1 for non-text UI; the shipped
 * set clears it with room to spare, so the chip also reads at a glance).
 */
export const ACCENT_SWATCHES: readonly AccentSwatch[] = [
  { id: "lute", light: "#347A2F", dark: "#58B848" },
  { id: "blue", light: "#2D65A3", dark: "#6FB3E8" },
  { id: "teal", light: "#3D755D", dark: "#83B69D" },
  { id: "violet", light: "#6046B0", dark: "#A99BF0" },
  { id: "amber", light: "#8A5A00", dark: "#D9A441" },
  { id: "rose", light: "#A8415F", dark: "#E58FA6" },
  { id: "slate", light: "#4C5A6B", dark: "#A9B4C4" },
  { id: "red", light: "#A5342F", dark: "#E08A85" },
];

/**
 * Both variants must match one pair, because the swatch sets them together:
 * a half-applied pair would render the chip as active while the canvas
 * carries a mixed accent.
 */
export function activeAccentSwatchId(
  settings: ThemeStudioSettings,
): AccentSwatchId | undefined {
  const light = settings.lightAccent.toUpperCase();
  const dark = settings.darkAccent.toUpperCase();
  return ACCENT_SWATCHES.find(
    (swatch) =>
      swatch.light.toUpperCase() === light && swatch.dark.toUpperCase() === dark,
  )?.id;
}
