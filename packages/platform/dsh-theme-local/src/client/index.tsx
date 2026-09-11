import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type { BoundActions } from "@deepseek-ai/dsh-client-ui-slots";
import type {
  ThemePreference,
  ThemeSnapshot,
  ThemeTokenOverrides,
} from "@deepseek-ai/dsh-client-ui-theme/client";
import type {} from "@deepseek-ai/dsh-client-ui-theme/client";

/**
 * Minimal local context contract. LOCAL ADAPTATION: the upstream
 * `ClientContext` type lived in `@deepseek-ai/dsh-client-runtime`, which
 * does not exist in this Desktop's vendored 0.1.2-alpha.1 client graph.
 * The runtime services below were verified against the live client
 * Service directory (`slots` / `locale` / `theme`).
 */
interface ClientContext {
  theme: {
    overrideTokens(source: string, tokens: ThemeTokenOverrides): () => void;
    getTheme(): ThemeSnapshot;
    setTheme(preference: ThemePreference): void;
  };
  slots: {
    inject(key: string, callback: () => unknown): void;
    register(options: Record<string, unknown>, component: unknown): unknown;
  };
  locale: {
    register(ns: string, dicts: unknown): () => void;
    bind(ns: string): (key: string) => string;
  };
  on(
    event: string,
    listener: (snapshot: ThemeSnapshot) => void,
  ): () => void;
  effect(
    callback: () => (() => void) | void,
    label?: string,
  ): void;
}

import "./studio.css";
import {
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeColorField,
  type ThemeStudioField,
  type ThemeStudioSettings,
  type ThemeTypographyField,
} from "../theme-settings.js";
import { en, NS, type ThemeStudioKey, zh } from "./locales.js";
import {
  browserThemeStudioStorage,
  loadThemeStudioSettings,
  saveThemeStudioSettings,
} from "./persistence.js";
import { themePresetSettings, type ThemePresetId } from "./presets.js";
import { createThemeStudioStore } from "./store.js";
import { ThemeStudio, type ThemeStudioInjected } from "./ThemeStudio.js";
import { buildThemeTokenOverrides } from "./theme-tokens.js";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "dsh.theme": ThemeStudioKey;
  }
}

const THEME_SOURCE = "dsh-theme";

/**
 * LOCAL ADAPTATION: tokens inside the Desktop's `overrideTokens` contract
 * (verified against the live Theme Inspect token directory) keep using the
 * official stacking API. Every other token the plugin models is applied as
 * a plain CSS custom property through one injected stylesheet, because the
 * 0.1.2-alpha.1 runtime defines the full `--dsw-*` variable surface on
 * `:root` and `body[data-ds-dark-theme]` and the components consume the
 * variables directly.
 */
const CONTRACT_TOKEN_NAMES = new Set([
  "--dsw-alias-bg-base",
  "--dsw-alias-bg-layer-1",
  "--dsw-alias-bg-layer-2",
  "--dsw-alias-bg-overlay",
  "--dsw-alias-border-l1",
  "--dsw-alias-border-l2",
  "--dsw-alias-brand-primary",
  "--dsw-alias-label-primary",
  "--dsw-alias-label-secondary",
  "--dsw-alias-state-error-primary",
  "--dsw-alias-state-success-primary",
  "--dsw-alias-state-warn-primary",
  "--dsw-specific-sidebar-fill",
]);

type TokenPair = { light: string; dark: string };

type ThemeStudioActions = BoundActions<
  ReturnType<typeof createThemeStudioStore>
>;

export const inject = [
  "slots",
  "locale",
  "theme",
];

export function apply(ctx: ClientContext): void {
  const storage = browserThemeStudioStorage();
  let currentSettings = loadThemeStudioSettings(storage);
  const store = createThemeStudioStore(currentSettings);
  let actions: ThemeStudioActions | undefined;
  let releaseOverride: () => void = () => {};
  let cssTag: HTMLStyleElement | undefined;

  const applyCssVars = (tokens: Record<string, TokenPair>): void => {
    if (cssTag !== undefined) {
      cssTag.remove();
      cssTag = undefined;
    }
    const names = Object.keys(tokens);
    if (names.length === 0) return;
    const light: string[] = [];
    const dark: string[] = [];
    for (const name of names) {
      const pair = tokens[name];
      if (pair === undefined) continue;
      light.push(`${name}: ${pair.light};`);
      dark.push(`${name}: ${pair.dark};`);
    }
    const css =
      `:root { ${light.join(" ")} }` +
      `body[data-ds-dark-theme] { ${dark.join(" ")} }`;
    cssTag = document.createElement("style");
    cssTag.dataset.plugin = THEME_SOURCE;
    cssTag.dataset.pluginCss = `${THEME_SOURCE}/token-vars`;
    cssTag.textContent = css;
    document.head.appendChild(cssTag);
  };

  const syncStore = () => {
    actions?.syncSettings(currentSettings);
  };

  const applyPreview = () => {
    const overrides = buildThemeTokenOverrides(currentSettings);
    const contract: ThemeTokenOverrides = {};
    const cssVars: Record<string, TokenPair> = {};
    for (const [token, pair] of Object.entries(overrides)) {
      if (CONTRACT_TOKEN_NAMES.has(token)) {
        contract[token] = pair;
      } else {
        cssVars[token] = pair;
      }
    }
    const nextRelease = ctx.theme.overrideTokens(THEME_SOURCE, contract);
    releaseOverride();
    releaseOverride = nextRelease;
    applyCssVars(cssVars);
  };

  const persist = () => {
    actions?.setSaveStatus("saving");
    actions?.setSaveStatus(
      saveThemeStudioSettings(storage, currentSettings) ? "idle" : "error",
    );
  };

  const setSetting = <Field extends ThemeStudioField>(
    field: Field,
    value: ThemeStudioSettings[Field],
  ) => {
    currentSettings = { ...currentSettings, [field]: value };
    syncStore();
    applyPreview();
    persist();
  };

  const setColor = (field: ThemeColorField, value: string) => {
    setSetting(field, value);
  };

  const setTypography = <Field extends ThemeTypographyField>(
    field: Field,
    value: ThemeStudioSettings[Field],
  ) => {
    setSetting(field, value);
  };

  const applySettings = (settings: ThemeStudioSettings) => {
    currentSettings = { ...settings };
    syncStore();
    applyPreview();
    persist();
  };

  const applyPreset = (id: ThemePresetId) => {
    applySettings(themePresetSettings(id));
  };

  const resetTheme = () => {
    applySettings(DEFAULT_THEME_STUDIO_SETTINGS);
  };

  const syncTheme = (snapshot: ThemeSnapshot) => {
    // LOCAL ADAPTATION: defensive fallback for the stripped 0.1.2-alpha.1
    // snapshot typings; the UI only needs a valid scheme label.
    const scheme = snapshot.active?.colorScheme ?? "light";
    actions?.syncTheme(snapshot.preference, scheme);
  };

  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    "dsh-theme: dictionaries",
  );

  ctx.on("theme/change", syncTheme);
  ctx.effect(() => {
    applyPreview();
    return () => {
      releaseOverride();
      if (cssTag !== undefined) cssTag.remove();
      cssTag = undefined;
    };
  }, "dsh-theme: live theme override");

  const injectProps = (bound: ThemeStudioActions): ThemeStudioInjected => {
    actions = bound;
    syncStore();
    const snapshot = ctx.theme.getTheme();
    syncTheme(snapshot);

    return {
      applyPreset,
      resetTheme,
      setColor,
      setTypography,
      setTheme: (preference: ThemePreference) => ctx.theme.setTheme(preference),
    };
  };

  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "dsh-theme",
        order: 5,
        label: () => ctx.locale.bind(NS)("nav"),
        store,
        locale: NS,
        inject: injectProps,
      },
      ThemeStudio,
    ),
  );
}
