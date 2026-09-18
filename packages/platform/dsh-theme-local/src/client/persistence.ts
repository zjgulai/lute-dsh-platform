import {
  decodeThemeStudioSettings,
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";

export const THEME_STUDIO_STORAGE_KEY = "dsh-theme/settings/v1";
export const THEME_PREFS_STORAGE_KEY = "dsh-theme/prefs/v1";

export interface ThemeStudioStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export type ReduceMotionPref = "system" | "on" | "off";

/**
 * Presentation preferences that live outside the shareable theme: they
 * describe the reader's setup, not the palette, so they never join the
 * import/export string.
 */
export interface ThemeStudioPrefs {
  /** "system" mirrors prefers-reduced-motion; "on"/"off" are explicit. */
  reduceMotion: ReduceMotionPref;
  /** false leaves font rendering completely untouched. */
  fontSmoothing: boolean;
}

export const DEFAULT_THEME_STUDIO_PREFS: ThemeStudioPrefs = {
  reduceMotion: "system",
  fontSmoothing: false,
};

export function browserThemeStudioStorage(): ThemeStudioStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadThemeStudioSettings(
  storage: ThemeStudioStorage | undefined,
): ThemeStudioSettings {
  if (storage === undefined) return { ...DEFAULT_THEME_STUDIO_SETTINGS };

  try {
    const raw = storage.getItem(THEME_STUDIO_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
    const parsed = JSON.parse(raw);
    const decoded = decodeThemeStudioSettings(parsed);
    if (decoded === undefined) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
    if (JSON.stringify(decoded) !== JSON.stringify(parsed)) {
      saveThemeStudioSettings(storage, decoded);
    }
    return decoded;
  } catch {
    return { ...DEFAULT_THEME_STUDIO_SETTINGS };
  }
}

export function saveThemeStudioSettings(
  storage: ThemeStudioStorage | undefined,
  settings: ThemeStudioSettings,
): boolean {
  if (storage === undefined) return false;

  try {
    storage.setItem(THEME_STUDIO_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function loadThemeStudioPrefs(
  storage: ThemeStudioStorage | undefined,
): ThemeStudioPrefs {
  const fallback: ThemeStudioPrefs = { ...DEFAULT_THEME_STUDIO_PREFS };
  if (storage === undefined) return fallback;

  try {
    const raw = storage.getItem(THEME_PREFS_STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return fallback;
    const record = parsed as Record<string, unknown>;
    return {
      reduceMotion:
        record.reduceMotion === "on" || record.reduceMotion === "off"
          ? record.reduceMotion
          : DEFAULT_THEME_STUDIO_PREFS.reduceMotion,
      fontSmoothing:
        record.fontSmoothing === true
          ? true
          : DEFAULT_THEME_STUDIO_PREFS.fontSmoothing,
    };
  } catch {
    return fallback;
  }
}

export function saveThemeStudioPrefs(
  storage: ThemeStudioStorage | undefined,
  prefs: ThemeStudioPrefs,
): boolean {
  if (storage === undefined) return false;

  try {
    storage.setItem(THEME_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
