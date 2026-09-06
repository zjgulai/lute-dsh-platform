import {
  decodeThemeStudioSettings,
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";

export const THEME_STUDIO_STORAGE_KEY = "dsh-theme/settings/v1";

export interface ThemeStudioStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

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
