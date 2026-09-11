import { defineStore, type EngineStoreHandle } from "@deepseek-ai/dsh-client-store";
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

/** 声明动作面，使工厂的返回类型稳定（PropsStore 的约束依赖它，见上游 ui-theme 同型写法）。 */
type ThemeStudioActions = {
  syncSettings: (draft: ThemeStudioState, settings: ThemeStudioSettings) => void;
  syncTheme: (
    draft: ThemeStudioState,
    preference: ThemePreference,
    activeScheme: "light" | "dark",
  ) => void;
  setSaveStatus: (draft: ThemeStudioState, status: SaveStatus) => void;
};

export function createThemeStudioStore(
  initialSettings = DEFAULT_THEME_STUDIO_SETTINGS,
): EngineStoreHandle<ThemeStudioState, ThemeStudioActions> {
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
