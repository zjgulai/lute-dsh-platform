import { describe, expect, it } from "vitest";

import {
  PREFS_CSS,
  REDUCE_MOTION_QUERY,
  prefsAttributes,
  shouldReduceMotion,
} from "./prefs-css.js";

const base = { reduceMotion: "system" as const, fontSmoothing: false };

describe("presentation prefs", () => {
  it("lets an explicit choice override the platform, in both directions", () => {
    expect(shouldReduceMotion("on", false)).toBe(true);
    expect(shouldReduceMotion("on", true)).toBe(true);
    expect(shouldReduceMotion("off", true)).toBe(false);
    expect(shouldReduceMotion("off", false)).toBe(false);
    expect(shouldReduceMotion("system", true)).toBe(true);
    expect(shouldReduceMotion("system", false)).toBe(false);
  });

  it("derives both body attributes from one decision", () => {
    expect(prefsAttributes(base, false)).toEqual({
      fontSmoothing: false,
      reduceMotion: false,
    });
    expect(prefsAttributes({ ...base, reduceMotion: "system" }, true)).toEqual({
      fontSmoothing: false,
      reduceMotion: true,
    });
    expect(prefsAttributes({ ...base, fontSmoothing: true }, false)).toEqual({
      fontSmoothing: true,
      reduceMotion: false,
    });
  });

  it("keeps the query and the sheet gated on the same attribute", () => {
    expect(REDUCE_MOTION_QUERY).toBe("(prefers-reduced-motion: reduce)");
    expect(PREFS_CSS).toContain('body[data-lute-reduce-motion="reduce"]');
    expect(PREFS_CSS).toContain('body[data-lute-font-smoothing="on"]');
    expect(PREFS_CSS).toContain("animation-duration: 0.001ms !important");
    // Nothing may apply without the body attribute: the shipped app stays
    // untouched until a reader opts in.
    expect(PREFS_CSS).not.toMatch(/\n\s*\*\s*\{/);
  });
});
