import { describe, expect, it } from "vitest";

import {
  CONTRAST_DEFAULT,
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";
import { getThemePreset } from "./presets.js";
import {
  loadThemeStudioPrefs,
  loadThemeStudioSettings,
  saveThemeStudioPrefs,
  saveThemeStudioSettings,
  THEME_PREFS_STORAGE_KEY,
  THEME_STUDIO_STORAGE_KEY,
  type ThemeStudioStorage,
} from "./persistence.js";

function memoryStorage(initial?: string): ThemeStudioStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(THEME_STUDIO_STORAGE_KEY, initial);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("theme persistence", () => {
  it("round-trips a complete theme", () => {
    const storage = memoryStorage();
    const settings: ThemeStudioSettings = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      lightAccent: "#123456",
      uiFontSize: 16,
    };

    expect(saveThemeStudioSettings(storage, settings)).toBe(true);
    expect(loadThemeStudioSettings(storage)).toEqual(settings);
  });

  it("uses defaults for missing, malformed, or unavailable storage", () => {
    expect(loadThemeStudioSettings(undefined)).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
    expect(loadThemeStudioSettings(memoryStorage("not-json"))).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
    expect(loadThemeStudioSettings(memoryStorage("{}"))).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
  });

  it("adds inline-code colors to themes saved before the field existed", () => {
    const proof = getThemePreset("proof").palette;
    const {
      lightInlineCode: _lightInlineCode,
      darkInlineCode: _darkInlineCode,
      ...legacySettings
    } = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      ...proof,
    };

    expect(
      loadThemeStudioSettings(memoryStorage(JSON.stringify(legacySettings))),
    ).toEqual({
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      ...proof,
    });
  });

  it("migrates the reddish legacy editorial foreground", () => {
    const legacyEditorial = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      ...getThemePreset("editorial").palette,
      lightForeground: "#1F0909",
      lightSidebar: "#F3F2EE",
      darkSidebar: "#211C1A",
      uiFont: "system",
      codeFont: "sf-mono",
      uiFontSize: 14,
      codeFontSize: 14,
    };
    const storage = memoryStorage(JSON.stringify(legacyEditorial));

    expect(loadThemeStudioSettings(storage)).toEqual({
      ...legacyEditorial,
      lightForeground: "#2F2C29",
    });
    expect(
      JSON.parse(storage.values.get(THEME_STUDIO_STORAGE_KEY)!),
    ).toMatchObject({ lightForeground: "#2F2C29" });
  });

  it("reports a rejected write without changing the preview source", () => {
    const storage: ThemeStudioStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(
      saveThemeStudioSettings(storage, DEFAULT_THEME_STUDIO_SETTINGS),
    ).toBe(false);
  });

  it("round-trips contrast values", () => {
    const storage = memoryStorage();
    const settings: ThemeStudioSettings = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      lightContrast: 100,
      darkContrast: 0,
    };

    expect(saveThemeStudioSettings(storage, settings)).toBe(true);
    expect(loadThemeStudioSettings(storage)).toEqual(settings);
  });

  it("defaults contrast for themes saved before the field existed and migrates storage", () => {
    const {
      lightContrast: _lightContrast,
      darkContrast: _darkContrast,
      ...legacySettings
    } = DEFAULT_THEME_STUDIO_SETTINGS;
    const storage = memoryStorage(JSON.stringify(legacySettings));

    expect(loadThemeStudioSettings(storage)).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
    expect(
      JSON.parse(storage.values.get(THEME_STUDIO_STORAGE_KEY)!),
    ).toMatchObject({
      lightContrast: CONTRAST_DEFAULT,
      darkContrast: CONTRAST_DEFAULT,
    });
  });

  it("falls back to the default contrast for out-of-range or malformed values", () => {
    // Contrast is a preference, not identity: a bad value mirrors the
    // typography fallback (single-field default) instead of the color
    // hard-failure that rejects the whole record.
    for (const bad of [-1, 101, 50.5, "60", null, {}]) {
      const raw = JSON.stringify({
        ...DEFAULT_THEME_STUDIO_SETTINGS,
        lightContrast: bad,
        darkContrast: bad,
      });

      expect(loadThemeStudioSettings(memoryStorage(raw))).toEqual(
        DEFAULT_THEME_STUDIO_SETTINGS,
      );
    }
  });
});

describe("theme prefs", () => {
  it("defaults to system motion and zero-intervention smoothing", () => {
    expect(loadThemeStudioPrefs(undefined)).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
    expect(loadThemeStudioPrefs(memoryStorage())).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
    expect(loadThemeStudioPrefs(memoryStorage("not-json"))).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
  });

  it("round-trips prefs independently of the theme settings key", () => {
    const storage = memoryStorage();
    saveThemeStudioSettings(storage, DEFAULT_THEME_STUDIO_SETTINGS);

    // Reading prefs never materializes the key; theme settings never read
    // or write prefs.
    loadThemeStudioPrefs(storage);
    expect(storage.values.has(THEME_PREFS_STORAGE_KEY)).toBe(false);

    const prefs = { reduceMotion: "on" as const, fontSmoothing: true };
    expect(saveThemeStudioPrefs(storage, prefs)).toBe(true);
    expect(loadThemeStudioPrefs(storage)).toEqual(prefs);
    expect(
      loadThemeStudioSettings(storage).lightContrast,
    ).toBe(CONTRAST_DEFAULT);
  });

  it("falls back to defaults per field for malformed prefs", () => {
    const storage = memoryStorage();
    storage.setItem(
      THEME_PREFS_STORAGE_KEY,
      JSON.stringify({ reduceMotion: "sometimes", fontSmoothing: "yes" }),
    );
    expect(loadThemeStudioPrefs(storage)).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
  });
});
