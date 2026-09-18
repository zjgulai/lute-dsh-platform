import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";
import { themePresetSettings } from "./presets.js";
import { decodeShareString, encodeThemeStudioSettings } from "./share-string.js";

describe("theme share string", () => {
  it("round-trips a complete theme, contrast included", () => {
    const settings = {
      ...themePresetSettings("editorial"),
      lightContrast: 72,
      darkContrast: 18,
    };

    expect(decodeShareString(encodeThemeStudioSettings(settings))).toEqual(
      settings,
    );
  });

  it("tolerates surrounding whitespace from a paste", () => {
    const raw = `\n  ${encodeThemeStudioSettings(DEFAULT_THEME_STUDIO_SETTINGS)}  \n`;

    expect(decodeShareString(raw)).toEqual(DEFAULT_THEME_STUDIO_SETTINGS);
  });

  it("reports unreadable input instead of resetting the theme", () => {
    for (const raw of ["", "   ", "not json", "{}", "[]", "null", "42"]) {
      expect(decodeShareString(raw), JSON.stringify(raw)).toBeUndefined();
    }
  });

  it("rejects a truncated paste that lost half the palette", () => {
    const partial: Record<string, unknown> = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
    };
    delete partial.lightAccent;
    delete partial.lightSidebar;

    expect(decodeShareString(JSON.stringify(partial))).toBeUndefined();
  });

  it("drops presentation prefs even when a caller passes a merged object", () => {
    const merged = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      reduceMotion: "off",
      fontSmoothing: true,
    } as ThemeStudioSettings;

    const raw = encodeThemeStudioSettings(merged);

    expect(raw).not.toContain("reduceMotion");
    expect(raw).not.toContain("fontSmoothing");
    expect(decodeShareString(raw)).toEqual(DEFAULT_THEME_STUDIO_SETTINGS);
  });
});
