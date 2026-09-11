import type {
  ThemeColorField,
  ThemeStudioSettings,
  ThemeTypographyField,
} from "../theme-settings.js";

export const THEME_PRESET_IDS = [
  "codex",
  "proof",
  "everforest",
  "github",
  "gruvbox",
  "linear",
  "notion",
  "raycast",
  "rosePine",
  "graphite",
  "editorial",
  "midnight",
  "folio",
  "porcelain",
  "carbon",
] as const;

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];
export type ThemePaletteSettings = Pick<ThemeStudioSettings, ThemeColorField>;
export type ThemeTypographySettings = Pick<
  ThemeStudioSettings,
  ThemeTypographyField
>;

export interface ThemePreset {
  id: ThemePresetId;
  palette: ThemePaletteSettings;
  typography: ThemeTypographySettings;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: "codex",
    palette: {
      lightAccent: "#0169CC",
      lightBackground: "#FFFFFF",
      lightForeground: "#0D0D0D",
      lightSurface: "#F7F7F7",
      lightInlineCode: "#F0F0F0",
      lightSidebar: "#FFFFFF",
      darkAccent: "#5AA7F2",
      darkBackground: "#111111",
      darkForeground: "#F4F4F4",
      darkSurface: "#1A1A1A",
      darkInlineCode: "#282828",
      darkSidebar: "#111111",
    },
    typography: {
      uiFont: "system",
      codeFont: "sf-mono",
      uiFontSize: 14,
      codeFontSize: 12,
    },
  },
  {
    id: "proof",
    palette: {
      lightAccent: "#3D755D",
      lightBackground: "#FAF9F6",
      lightForeground: "#292D29",
      lightSurface: "#FFFFFF",
      lightInlineCode: "#EDEDEA",
      lightSidebar: "#FAF9F6",
      darkAccent: "#83B69D",
      darkBackground: "#171A17",
      darkForeground: "#E8EBE6",
      darkSurface: "#222622",
      darkInlineCode: "#2C2F2C",
      darkSidebar: "#171A17",
    },
    typography: {
      uiFont: "serif",
      codeFont: "menlo",
      uiFontSize: 15,
      codeFontSize: 13,
    },
  },
  {
    id: "everforest",
    palette: {
      lightAccent: "#4E713F",
      lightBackground: "#F8FAF6",
      lightForeground: "#303A32",
      lightSurface: "#FFFFFF",
      lightInlineCode: "#ECEEEA",
      lightSidebar: "#F8FAF6",
      darkAccent: "#A7C080",
      darkBackground: "#181C1A",
      darkForeground: "#E1E5DC",
      darkSurface: "#222724",
      darkInlineCode: "#2C302D",
      darkSidebar: "#181C1A",
    },
    typography: {
      uiFont: "rounded",
      codeFont: "jetbrains",
      uiFontSize: 14,
      codeFontSize: 13,
    },
  },
  {
    id: "github",
    palette: {
      lightAccent: "#0969DA",
      lightBackground: "#FFFFFF",
      lightForeground: "#1F2328",
      lightSurface: "#F6F8FA",
      lightInlineCode: "#F2F2F2",
      lightSidebar: "#FFFFFF",
      darkAccent: "#58A6FF",
      darkBackground: "#0D1117",
      darkForeground: "#E6EDF3",
      darkSurface: "#161B22",
      darkInlineCode: "#23272D",
      darkSidebar: "#0D1117",
    },
    typography: {
      uiFont: "system",
      codeFont: "sf-mono",
      uiFontSize: 14,
      codeFontSize: 12,
    },
  },
  {
    id: "gruvbox",
    palette: {
      lightAccent: "#8F4F18",
      lightBackground: "#FAF8F1",
      lightForeground: "#352F2B",
      lightSurface: "#FFFFFF",
      lightInlineCode: "#EEECE5",
      lightSidebar: "#FAF8F1",
      darkAccent: "#D7995B",
      darkBackground: "#1F1F1D",
      darkForeground: "#F2E6C9",
      darkSurface: "#2A2926",
      darkInlineCode: "#34332E",
      darkSidebar: "#1F1F1D",
    },
    typography: {
      uiFont: "avenir",
      codeFont: "menlo",
      uiFontSize: 15,
      codeFontSize: 13,
    },
  },
  {
    id: "linear",
    palette: {
      lightAccent: "#5864C7",
      lightBackground: "#FFFFFF",
      lightForeground: "#252A35",
      lightSurface: "#F6F7FA",
      lightInlineCode: "#F2F2F3",
      lightSidebar: "#FFFFFF",
      darkAccent: "#8C97FF",
      darkBackground: "#15161B",
      darkForeground: "#E6E9EF",
      darkSurface: "#202127",
      darkInlineCode: "#2A2B30",
      darkSidebar: "#15161B",
    },
    typography: {
      uiFont: "inter",
      codeFont: "jetbrains",
      uiFontSize: 14,
      codeFontSize: 13,
    },
  },
  {
    id: "notion",
    palette: {
      lightAccent: "#1969AA",
      lightBackground: "#FFFFFF",
      lightForeground: "#37352F",
      lightSurface: "#F7F7F5",
      lightInlineCode: "#F3F3F3",
      lightSidebar: "#FFFFFF",
      darkAccent: "#5A9DDE",
      darkBackground: "#191919",
      darkForeground: "#E5E5E4",
      darkSurface: "#242424",
      darkInlineCode: "#2D2D2D",
      darkSidebar: "#191919",
    },
    typography: {
      uiFont: "system",
      codeFont: "sf-mono",
      uiFontSize: 14,
      codeFontSize: 12,
    },
  },
  {
    id: "raycast",
    palette: {
      lightAccent: "#0A6BC0",
      lightBackground: "#FFFFFF",
      lightForeground: "#181818",
      lightSurface: "#F7F7F7",
      lightInlineCode: "#F1F1F1",
      lightSidebar: "#FFFFFF",
      darkAccent: "#4FA3F8",
      darkBackground: "#141414",
      darkForeground: "#F2F2F2",
      darkSurface: "#1F1F1F",
      darkInlineCode: "#2A2A2A",
      darkSidebar: "#141414",
    },
    typography: {
      uiFont: "system",
      codeFont: "sf-mono",
      uiFontSize: 14,
      codeFontSize: 12,
    },
  },
  {
    id: "rosePine",
    palette: {
      lightAccent: "#A14F5D",
      lightBackground: "#FAF8F7",
      lightForeground: "#433E5D",
      lightSurface: "#FFFFFF",
      lightInlineCode: "#EFEDEE",
      lightSidebar: "#FAF8F7",
      darkAccent: "#EA9A97",
      darkBackground: "#201E2C",
      darkForeground: "#E0DEF4",
      darkSurface: "#2A2738",
      darkInlineCode: "#333140",
      darkSidebar: "#201E2C",
    },
    typography: {
      uiFont: "avenir",
      codeFont: "fira-code",
      uiFontSize: 15,
      codeFontSize: 13,
    },
  },
  {
    id: "graphite",
    palette: {
      lightAccent: "#8A1C1C",
      lightBackground: "#FCFCFC",
      lightForeground: "#111111",
      lightSurface: "#F3F3F3",
      lightInlineCode: "#EDEDED",
      lightSidebar: "#F3F3F3",
      darkAccent: "#E08A8A",
      darkBackground: "#171717",
      darkForeground: "#F1F1F1",
      darkSurface: "#222222",
      darkInlineCode: "#2C2C2C",
      darkSidebar: "#222222",
    },
    typography: {
      uiFont: "avenir",
      codeFont: "menlo",
      uiFontSize: 15,
      codeFontSize: 13,
    },
  },
  {
    id: "editorial",
    palette: {
      lightAccent: "#065588",
      lightBackground: "#F3F2EE",
      lightForeground: "#2F2C29",
      lightSurface: "#E8E7DF",
      lightInlineCode: "#DAD8D0",
      lightSidebar: "#E8E7DF",
      darkAccent: "#7CC4E4",
      darkBackground: "#211C1A",
      darkForeground: "#F1E8DF",
      darkSurface: "#2C2522",
      darkInlineCode: "#352D29",
      darkSidebar: "#2C2522",
    },
    typography: {
      uiFont: "serif",
      codeFont: "menlo",
      uiFontSize: 16,
      codeFontSize: 13,
    },
  },
  {
    id: "midnight",
    palette: {
      lightAccent: "#216A8A",
      lightBackground: "#F7F9FA",
      lightForeground: "#202B33",
      lightSurface: "#EDF1F3",
      lightInlineCode: "#E3E8EB",
      lightSidebar: "#EDF1F3",
      darkAccent: "#6DC1E7",
      darkBackground: "#363B40",
      darkForeground: "#F2F5F7",
      darkSurface: "#474D54",
      darkInlineCode: "#2E3033",
      darkSidebar: "#2E3033",
    },
    typography: {
      uiFont: "system",
      codeFont: "sf-mono",
      uiFontSize: 15,
      codeFontSize: 13,
    },
  },
  {
    id: "folio",
    palette: {
      lightAccent: "#36598A",
      lightBackground: "#FFFFFF",
      lightForeground: "#2E2E33",
      lightSurface: "#F8F8F8",
      lightInlineCode: "#EDEDED",
      lightSidebar: "#F8F8F8",
      darkAccent: "#8CB4E8",
      darkBackground: "#1E2025",
      darkForeground: "#F1F2F4",
      darkSurface: "#292C32",
      darkInlineCode: "#333740",
      darkSidebar: "#292C32",
    },
    typography: {
      uiFont: "serif",
      codeFont: "menlo",
      uiFontSize: 16,
      codeFontSize: 13,
    },
  },
  {
    id: "porcelain",
    palette: {
      lightAccent: "#176895",
      lightBackground: "#FEFEFE",
      lightForeground: "#2F2F2F",
      lightSurface: "#F8F8F8",
      lightInlineCode: "#EEEEEE",
      lightSidebar: "#F8F8F8",
      darkAccent: "#71B7E3",
      darkBackground: "#18191B",
      darkForeground: "#F2F2F2",
      darkSurface: "#242629",
      darkInlineCode: "#2E3033",
      darkSidebar: "#242629",
    },
    typography: {
      uiFont: "serif",
      codeFont: "menlo",
      uiFontSize: 16,
      codeFontSize: 13,
    },
  },
  {
    id: "carbon",
    palette: {
      lightAccent: "#2D65A3",
      lightBackground: "#FAFBFC",
      lightForeground: "#252932",
      lightSurface: "#F0F2F5",
      lightInlineCode: "#E7EAF0",
      lightSidebar: "#ECEFF3",
      darkAccent: "#61AFEF",
      darkBackground: "#282C34",
      darkForeground: "#D7DAE0",
      darkSurface: "#2C313C",
      darkInlineCode: "#1D1F23",
      darkSidebar: "#21252B",
    },
    typography: {
      uiFont: "system",
      codeFont: "fira-code",
      uiFontSize: 14,
      codeFontSize: 13,
    },
  },
];

export function getThemePreset(id: ThemePresetId): ThemePreset {
  const preset = THEME_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`Unknown theme preset: ${id}`);
  return preset;
}

export function themePresetSettings(id: ThemePresetId): ThemeStudioSettings {
  const preset = getThemePreset(id);
  return { ...preset.palette, ...preset.typography };
}

export function themePresetIdOf(
  settings: ThemeStudioSettings,
): ThemePresetId | undefined {
  return THEME_PRESETS.find((preset) => {
    const expected = { ...preset.palette, ...preset.typography };
    return Object.entries(expected).every(([field, value]) => {
      const actual = settings[field as keyof ThemeStudioSettings];
      return typeof value === "string" && value.startsWith("#")
        ? typeof actual === "string" && actual.toUpperCase() === value
        : actual === value;
    });
  })?.id;
}
