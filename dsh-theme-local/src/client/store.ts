import { defineStore } from "@deepseek-ai/dsh-client-store";
import type { ThemePreference } from "@deepseek-ai/dsh-client-ui-theme/client";

import {
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";

export type SaveStatus = "idle" | "saving" | "error";
export interface ThemeStudioState {
  activeScheme: "light" | "dark";
  preference: ThemePreference;
  saveStatus: SaveStatus;
  settings: ThemeStudioSettings;
}

export function createThemeStudioStore(
  initialSettings = DEFAULT_THEME_STUDIO_SETTINGS,
) {
  return defineStore({
    init: (): ThemeStudioState => ({
      activeScheme: "light",
      preference: "system",
      saveStatus: "idle",
      settings: { ...initialSettings },
    }),
    actions: {
      syncSettings: (
        draft,
        settings: ThemeStudioSettings,
      ) => {
        draft.settings = { ...settings };
      },
      syncTheme: (
        draft,
        preference: ThemePreference,
        activeScheme: "light" | "dark",
      ) => {
        draft.preference = preference;
        draft.activeScheme = activeScheme;
      },
      setSaveStatus: (draft, status: SaveStatus) => {
        draft.saveStatus = status;
      },
    },
  });
}
