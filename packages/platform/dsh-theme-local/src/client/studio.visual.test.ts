import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const stylesheet = read("studio.css");
const studio = read("ThemeStudio.tsx");
const swatches = read("AccentSwatches.tsx");
const contrastSlider = read("ContrastSlider.tsx");
const client = read("index.tsx");
const prefsCss = read("prefs-css.ts");

/**
 * Source-level contract for the settings section. Rendered behaviour
 * (focus order, picker interaction, live re-theming) is verified in the
 * browser, not here; these assertions only stop the markup contract from
 * drifting silently.
 */
describe("Theme Studio visual contract", () => {
  it("keeps shared semantic layers and control motion", () => {
    expect(stylesheet).toContain("--dsw-alias-bg-layer-1");
    expect(stylesheet).toContain("--dsw-shadow-lv1");
    expect(stylesheet).toContain("border-color 180ms ease");
    expect(stylesheet).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the section a two-card layout", () => {
    expect(studio).toContain('data-card="theme"');
    expect(studio).toContain('data-card="prefs"');
    expect(studio).toContain("data-appearance-variant");
  });

  it("drives every either/or control from radio semantics", () => {
    expect(studio).toContain('role="radiogroup"');
    expect(studio).toContain('name="appearance-mode"');
    expect(studio).toContain('name="appearance-preset"');
    expect(studio).toContain('name="appearance-reduce-motion"');
    expect(swatches).toContain('name="appearance-accent"');
    expect(studio).toContain('role="switch"');
    expect(studio).not.toContain("aria-pressed");
  });

  it("fills the contrast track from the accent token", () => {
    expect(stylesheet).toContain("--appearance-contrast-fill");
    expect(stylesheet).toContain("::-webkit-slider-thumb");
    expect(contrastSlider).toContain("data-appearance-slider");
    expect(contrastSlider).toContain("--appearance-contrast-fill");
  });

  it("gates prefs behind body attributes instead of global CSS", () => {
    expect(prefsCss).toContain('body[data-lute-reduce-motion="reduce"]');
    expect(prefsCss).toContain('body[data-lute-font-smoothing="on"]');
    expect(prefsCss).toContain('"(prefers-reduced-motion: reduce)"');
    expect(client).toContain("prefsAttributes(");
    expect(client).toContain('delete document.body.dataset.luteReduceMotion');
    expect(client).toContain('delete document.body.dataset.luteFontSmoothing');
    expect(client).toContain("motionQuery?.removeEventListener");
  });
});
