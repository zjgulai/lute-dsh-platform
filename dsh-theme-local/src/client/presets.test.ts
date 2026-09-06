import { describe, expect, it } from "vitest";

import { en, zh } from "./locales.js";
import {
  THEME_PRESET_IDS,
  THEME_PRESETS,
  getThemePreset,
  themePresetIdOf,
  themePresetSettings,
} from "./presets.js";

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe("theme presets", () => {
  it("keeps the public preset id list aligned with the palettes", () => {
    const presetIds = THEME_PRESETS.map((preset) => preset.id);

    expect(new Set(presetIds).size).toBe(presetIds.length);
    expect(presetIds).toEqual([...THEME_PRESET_IDS]);
  });

  it("recognizes a preset from its complete color and typography settings", () => {
    expect(themePresetIdOf(themePresetSettings("proof"))).toBe("proof");
  });

  it("treats an edited preset as a custom palette", () => {
    expect(
      themePresetIdOf({
        ...themePresetSettings("proof"),
        lightAccent: "#775533",
      }),
    ).toBeUndefined();
  });

  it("treats typography edits as customization instead of mislabeling a preset", () => {
    expect(
      themePresetIdOf({
        ...themePresetSettings("editorial"),
        uiFont: "system",
      }),
    ).toBeUndefined();
  });

  it("keeps text and primary accents readable in both color schemes", () => {
    for (const { id, palette } of THEME_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        const prefix = mode === "light" ? "light" : "dark";
        const background = palette[`${prefix}Background`];
        const foreground = palette[`${prefix}Foreground`];
        const surface = palette[`${prefix}Surface`];
        const inlineCode = palette[`${prefix}InlineCode`];
        const sidebar = palette[`${prefix}Sidebar`];
        const accent = palette[`${prefix}Accent`];

        expect(
          contrast(foreground, background),
          `${id} ${mode} text`,
        ).toBeGreaterThanOrEqual(7);
        expect(
          contrast(foreground, surface),
          `${id} ${mode} surface text`,
        ).toBeGreaterThanOrEqual(7);
        expect(
          contrast(foreground, inlineCode),
          `${id} ${mode} inline code text`,
        ).toBeGreaterThanOrEqual(7);
        expect(
          contrast(foreground, sidebar),
          `${id} ${mode} sidebar text`,
        ).toBeGreaterThanOrEqual(7);
        expect(
          contrast(accent, background),
          `${id} ${mode} accent`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("preserves deliberate surface hierarchy in reading and code themes", () => {
    for (const id of [
      "graphite",
      "editorial",
      "midnight",
      "folio",
      "porcelain",
      "carbon",
    ] as const) {
      const { palette } = getThemePreset(id);
      expect(palette.lightSidebar, `${id} light sidebar`).not.toBe(
        palette.lightBackground,
      );
      expect(palette.darkSidebar, `${id} dark sidebar`).not.toBe(
        palette.darkBackground,
      );
    }
  });

  it("binds reading presets to intentional typography", () => {
    for (const id of ["editorial", "folio", "porcelain"] as const) {
      const { typography } = getThemePreset(id);
      expect(typography.uiFont, `${id} reading font`).toBe("serif");
      expect(typography.uiFontSize, `${id} reading size`).toBe(16);
    }

    expect(getThemePreset("carbon").typography).toEqual({
      uiFont: "system",
      codeFont: "fira-code",
      uiFontSize: 14,
      codeFontSize: 13,
    });
  });

  it("publishes adapted reading palettes under independent names", () => {
    const sourceThemeNames = [
      "gothic",
      "newsprint",
      "night",
      "pixyll",
      "whitey",
    ];
    const adaptedPresetIds = [
      "graphite",
      "editorial",
      "midnight",
      "folio",
      "porcelain",
    ] as const;

    expect(adaptedPresetIds).toHaveLength(sourceThemeNames.length);
    for (const id of adaptedPresetIds) {
      expect(THEME_PRESETS.some((preset) => preset.id === id)).toBe(true);
      expect(sourceThemeNames).not.toContain(id);
      expect(sourceThemeNames).not.toContain(
        en[`preset.${id}`].toLowerCase(),
      );
      expect(zh[`preset.${id}`]).not.toBe("");
    }
  });
});
