import {
  THEME_STUDIO_FIELDS,
  decodeThemeStudioSettings,
  type ThemeStudioSettings,
} from "../theme-settings.js";

/**
 * The share string is the complete theme — colors, contrast, typography —
 * as compact JSON. The payload is projected through THEME_STUDIO_FIELDS, so
 * presentation preferences (reduce motion, font smoothing) can never leak
 * into it: they describe the reader's machine, not the palette, and
 * importing a shared theme must not flip them.
 */
export function encodeThemeStudioSettings(settings: ThemeStudioSettings): string {
  const payload = Object.fromEntries(
    THEME_STUDIO_FIELDS.map((field) => [field, settings[field]]),
  );

  return JSON.stringify(payload);
}

/**
 * Accepts any text a reader might paste. Field-level validation and legacy
 * migration are delegated to decodeThemeStudioSettings, which rejects records
 * that do not carry a full color set — so `{}` or a truncated paste reports
 * as unreadable instead of silently resetting the theme to defaults.
 */
export function decodeShareString(raw: string): ThemeStudioSettings | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  try {
    return decodeThemeStudioSettings(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
}
