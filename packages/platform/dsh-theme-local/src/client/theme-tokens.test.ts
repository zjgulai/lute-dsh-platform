import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_STUDIO_SETTINGS } from "../theme-settings.js";
import {
  themePresetSettings,
  type ThemePresetId,
} from "./presets.js";
import { buildThemeTokenOverrides } from "./theme-tokens.js";

function settingsFor(id: ThemePresetId) {
  return themePresetSettings(id);
}

describe("theme token overrides", () => {
  it("maps conversation tabs to the configured accent and text colors", () => {
    const settings = settingsFor("proof");
    const tokens = buildThemeTokenOverrides(settings);

    expect(tokens["--dsw-alias-state-business-primary"]).toEqual({
      light: settings.lightAccent,
      dark: settings.darkAccent,
    });
    expect(tokens["--dsw-alias-label-tertiary"]).toEqual({
      light: `color-mix(in oklch, ${settings.lightForeground} 50%, ${settings.lightBackground})`,
      dark: `color-mix(in oklch, ${settings.darkForeground} 50%, ${settings.darkBackground})`,
    });
  });

  it("derives interaction and sidebar states from the same palette", () => {
    const settings = settingsFor("github");
    const tokens = buildThemeTokenOverrides(settings);

    expect(tokens["--dsw-alias-interactive-bg-hover"]).toEqual({
      light: `color-mix(in oklch, #000000 5%, ${settings.lightBackground})`,
      dark: `color-mix(in oklch, #FFFFFF 7%, ${settings.darkBackground})`,
    });
    expect(tokens["--dsw-specific-sidebar-nav-item-active-accent"]).toEqual({
      light: `color-mix(in oklch, ${settings.lightAccent} 12%, ${settings.lightSidebar})`,
      dark: `color-mix(in oklch, ${settings.darkAccent} 12%, ${settings.darkSidebar})`,
    });
  });

  it("keeps raised surfaces neutral instead of tinting them with text color", () => {
    const settings = settingsFor("editorial");
    const tokens = buildThemeTokenOverrides(settings);

    expect(tokens["--dsw-alias-bg-layer-2"]).toEqual({
      light: `color-mix(in oklch, ${settings.lightBackground} 30%, #FFFFFF)`,
      dark: `color-mix(in oklch, #FFFFFF 6%, ${settings.darkSurface})`,
    });
    expect(tokens["--dsw-alias-bg-overlay"]).toEqual({
      light: `color-mix(in oklch, ${settings.lightBackground} 10%, #FFFFFF)`,
      dark: `color-mix(in oklch, #FFFFFF 12%, ${settings.darkSurface})`,
    });

    for (const token of [
      "--dsw-alias-bg-layer-2",
      "--dsw-alias-bg-layer-3",
      "--dsw-alias-bg-module-platform",
      "--dsw-alias-bg-overlay",
      "--dsw-alias-border-l1",
      "--dsw-alias-border-l2",
      "--dsw-alias-border-l3",
      "--dsw-alias-border-l4",
    ] as const) {
      expect(JSON.stringify(tokens[token]), token).not.toContain(
        settings.lightForeground,
      );
    }
  });

  it("themes the running status, composer action, and sent message bubble", () => {
    const settings = settingsFor("proof");
    const tokens = buildThemeTokenOverrides(settings);

    expect(tokens["--dsw-static-deepseek-500"]).toEqual({
      light: settings.lightAccent,
      dark: settings.darkAccent,
    });
    expect(tokens["--dsw-alias-button-info-fill"]).toEqual({
      light: settings.lightAccent,
      dark: settings.darkAccent,
    });
    expect(tokens["--dsw-specific-bubble"]).toEqual({
      light: `color-mix(in oklch, ${settings.lightAccent} 10%, ${settings.lightBackground})`,
      dark: `color-mix(in oklch, ${settings.darkAccent} 10%, ${settings.darkBackground})`,
    });
  });

  it("maps inline markdown code to its configured theme color", () => {
    const settings = settingsFor("proof");
    const tokens = buildThemeTokenOverrides(settings);

    expect(tokens["--dsw-alias-markdown-inline-code"]).toEqual({
      light: settings.lightInlineCode,
      dark: settings.darkInlineCode,
    });
  });

  it("maps interface and code font families through Harness theme tokens", () => {
    const settings = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      uiFont: "serif" as const,
      codeFont: "jetbrains" as const,
    };
    const tokens = buildThemeTokenOverrides(settings);

    expect(tokens["--dsw-font-family"]).toEqual({
      light: expect.stringContaining("Songti SC"),
      dark: expect.stringContaining("Songti SC"),
    });
    expect(tokens["--ds-font-family-code"]).toEqual({
      light: expect.stringContaining("JetBrains Mono"),
      dark: expect.stringContaining("JetBrains Mono"),
    });
    expect(tokens["--dsw-font-mono"]).toEqual(tokens["--ds-font-family-code"]);
  });

  it("scales semantic interface and code type tokens from stable defaults", () => {
    const tokens = buildThemeTokenOverrides({
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      uiFontSize: 16,
      codeFontSize: 14,
    });

    expect(tokens["--dsw-font-s-14"]).toEqual({
      light: "16px/24px var(--dsw-font-family)",
      dark: "16px/24px var(--dsw-font-family)",
    });
    expect(tokens["--dsw-font-markdown-code-block-small"]).toEqual({
      light: "14px/20px var(--ds-font-family-code)",
      dark: "14px/20px var(--ds-font-family-code)",
    });
  });
});

describe("contrast scaling", () => {
  // Golden freeze: at the baseline contrast every neutral blend must stay
  // byte-identical to the implementation before contrast existed. These
  // literals are copied from that implementation, not regenerated.
  it("keeps the baseline palette byte-identical with explicit contrast 50", () => {
    const tokens = buildThemeTokenOverrides({
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      lightContrast: 50,
      darkContrast: 50,
    });
    expect(tokens).toEqual(
      buildThemeTokenOverrides(DEFAULT_THEME_STUDIO_SETTINGS),
    );

    expect(tokens["--dsw-alias-bg-layer-2"]).toEqual({
      light: "color-mix(in oklch, #F6F7F4 30%, #FFFFFF)",
      dark: "color-mix(in oklch, #FFFFFF 6%, #202420)",
    });
    expect(tokens["--dsw-alias-bg-layer-3"]).toEqual({
      light: "color-mix(in oklch, #F6F7F4 15%, #FFFFFF)",
      dark: "color-mix(in oklch, #FFFFFF 10%, #202420)",
    });
    expect(tokens["--dsw-alias-bg-module-platform"]).toEqual({
      light: "color-mix(in oklch, #000000 4%, #FFFFFF)",
      dark: "color-mix(in oklch, #FFFFFF 6%, #202420)",
    });
    expect(tokens["--dsw-alias-bg-overlay"]).toEqual({
      light: "color-mix(in oklch, #F6F7F4 10%, #FFFFFF)",
      dark: "color-mix(in oklch, #FFFFFF 12%, #202420)",
    });
    expect(tokens["--dsw-alias-border-l1"]).toEqual({
      light: "color-mix(in oklch, #000000 8%, #F6F7F4)",
      dark: "color-mix(in oklch, #FFFFFF 10%, #171A17)",
    });
    expect(tokens["--dsw-alias-border-l2"]).toEqual({
      light: "color-mix(in oklch, #000000 12%, #F6F7F4)",
      dark: "color-mix(in oklch, #FFFFFF 16%, #171A17)",
    });
    expect(tokens["--dsw-alias-border-l3"]).toEqual({
      light: "color-mix(in oklch, #000000 18%, #F6F7F4)",
      dark: "color-mix(in oklch, #FFFFFF 22%, #171A17)",
    });
    expect(tokens["--dsw-alias-border-l4"]).toEqual({
      light: "color-mix(in oklch, #000000 26%, #F6F7F4)",
      dark: "color-mix(in oklch, #FFFFFF 30%, #171A17)",
    });
    expect(tokens["--dsw-alias-label-secondary"]).toEqual({
      light: "color-mix(in oklch, #1E221F 62%, #F6F7F4)",
      dark: "color-mix(in oklch, #F1F4F0 62%, #171A17)",
    });
    expect(tokens["--dsw-alias-label-tertiary"]).toEqual({
      light: "color-mix(in oklch, #1E221F 50%, #F6F7F4)",
      dark: "color-mix(in oklch, #F1F4F0 50%, #171A17)",
    });
    expect(tokens["--dsw-alias-label-caption"]).toEqual({
      light: "color-mix(in oklch, #1E221F 40%, #F6F7F4)",
      dark: "color-mix(in oklch, #F1F4F0 40%, #171A17)",
    });
    expect(tokens["--dsw-alias-label-dimmed"]).toEqual({
      light: "color-mix(in oklch, #1E221F 28%, #F6F7F4)",
      dark: "color-mix(in oklch, #F1F4F0 28%, #171A17)",
    });
    expect(tokens["--dsw-alias-interactive-bg-hover"]).toEqual({
      light: "color-mix(in oklch, #000000 5%, #F6F7F4)",
      dark: "color-mix(in oklch, #FFFFFF 7%, #171A17)",
    });
    expect(tokens["--dsw-alias-interactive-bg-hover-solid"]).toEqual({
      light: "color-mix(in oklch, #000000 5%, #FFFFFF)",
      dark: "color-mix(in oklch, #FFFFFF 7%, #202420)",
    });
    expect(tokens["--dsw-alias-interactive-bg-active"]).toEqual({
      light: "color-mix(in oklch, #000000 9%, #F6F7F4)",
      dark: "color-mix(in oklch, #FFFFFF 11%, #171A17)",
    });
    expect(tokens["--dsw-specific-sidebar-nav-item-active"]).toEqual({
      light: "color-mix(in oklch, #000000 9%, #F1F4EF)",
      dark: "color-mix(in oklch, #FFFFFF 11%, #191C1A)",
    });
    expect(tokens["--dsw-specific-sidebar-nav-item-hover"]).toEqual({
      light: "color-mix(in oklch, #000000 5%, #F1F4EF)",
      dark: "color-mix(in oklch, #FFFFFF 7%, #191C1A)",
    });
  });

  it("scales neutral blends per variant while leaving accent derivations and the other variant untouched", () => {
    const tokens = buildThemeTokenOverrides({
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      lightContrast: 100,
    });

    // k(100) = 1.4: 8 * 1.4 = 11.2 -> 11, 62 * 1.4 = 86.8 -> 87
    expect(tokens["--dsw-alias-border-l1"]).toEqual({
      light: "color-mix(in oklch, #000000 11%, #F6F7F4)",
      dark: "color-mix(in oklch, #FFFFFF 10%, #171A17)",
    });
    expect(tokens["--dsw-alias-label-secondary"]).toEqual({
      light: "color-mix(in oklch, #1E221F 87%, #F6F7F4)",
      dark: "color-mix(in oklch, #F1F4F0 62%, #171A17)",
    });
    // Accent-derived blends keep their tuned ratios regardless of contrast.
    expect(tokens["--dsw-specific-bubble"]).toEqual({
      light: "color-mix(in oklch, #347A2F 10%, #F6F7F4)",
      dark: "color-mix(in oklch, #58B848 10%, #171A17)",
    });
    expect(tokens["--dsw-alias-interactive-bg-hover-accent"]).toEqual({
      light: "color-mix(in oklch, #347A2F 10%, #F6F7F4)",
      dark: "color-mix(in oklch, #58B848 10%, #171A17)",
    });
  });

  it("lowers neutral blend strength at the lower bound", () => {
    const tokens = buildThemeTokenOverrides({
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      darkContrast: 0,
    });

    // k(0) = 0.6: 12 * 0.6 = 7.2 -> 7, 6 * 0.6 = 3.6 -> 4
    expect(tokens["--dsw-alias-border-l2"]).toEqual({
      light: "color-mix(in oklch, #000000 12%, #F6F7F4)",
      dark: "color-mix(in oklch, #FFFFFF 10%, #171A17)",
    });
    expect(tokens["--dsw-alias-bg-layer-2"]).toEqual({
      light: "color-mix(in oklch, #F6F7F4 30%, #FFFFFF)",
      dark: "color-mix(in oklch, #FFFFFF 4%, #202420)",
    });
  });
});
