import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_STUDIO_SETTINGS } from "../theme-settings.js";
import {
  ACCENT_SWATCHES,
  ACCENT_SWATCH_IDS,
  activeAccentSwatchId,
} from "./accent-swatches.js";

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

describe("accent swatches", () => {
  it("keeps every pair readable on the default canvas", () => {
    for (const swatch of ACCENT_SWATCHES) {
      expect(
        contrast(swatch.light, DEFAULT_THEME_STUDIO_SETTINGS.lightBackground),
        `${swatch.id} light accent`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(swatch.dark, DEFAULT_THEME_STUDIO_SETTINGS.darkBackground),
        `${swatch.id} dark accent`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the public id list aligned with the swatch pairs", () => {
    const ids = ACCENT_SWATCHES.map((swatch) => swatch.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ACCENT_SWATCH_IDS]);
  });

  it("ships the LUTE brand green as the default pair", () => {
    const [first] = ACCENT_SWATCHES;

    expect(first).toEqual({
      id: "lute",
      light: DEFAULT_THEME_STUDIO_SETTINGS.lightAccent,
      dark: DEFAULT_THEME_STUDIO_SETTINGS.darkAccent,
    });
    expect(activeAccentSwatchId(DEFAULT_THEME_STUDIO_SETTINGS)).toBe("lute");
  });

  it("recognizes a pair regardless of hex casing", () => {
    expect(
      activeAccentSwatchId({
        ...DEFAULT_THEME_STUDIO_SETTINGS,
        lightAccent: "#347a2f",
        darkAccent: "#58b848",
      }),
    ).toBe("lute");
  });

  it("treats a half-applied or off-palette accent as custom", () => {
    expect(
      activeAccentSwatchId({
        ...DEFAULT_THEME_STUDIO_SETTINGS,
        lightAccent: "#6046B0",
      }),
    ).toBeUndefined();
    expect(
      activeAccentSwatchId({
        ...DEFAULT_THEME_STUDIO_SETTINGS,
        lightAccent: "#123456",
        darkAccent: "#654321",
      }),
    ).toBeUndefined();
  });
});
