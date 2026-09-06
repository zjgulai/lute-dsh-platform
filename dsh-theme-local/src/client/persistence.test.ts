import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";
import { getThemePreset } from "./presets.js";
import {
  loadThemeStudioSettings,
  saveThemeStudioSettings,
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
});
