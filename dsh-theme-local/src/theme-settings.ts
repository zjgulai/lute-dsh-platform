export const THEME_COLOR_FIELDS = [
  "lightAccent",
  "lightBackground",
  "lightForeground",
  "lightSurface",
  "lightInlineCode",
  "lightSidebar",
  "darkAccent",
  "darkBackground",
  "darkForeground",
  "darkSurface",
  "darkInlineCode",
  "darkSidebar",
] as const;

const LEGACY_THEME_COLOR_FIELDS = [
  "lightAccent",
  "lightBackground",
  "lightForeground",
  "lightSurface",
  "lightSidebar",
  "darkAccent",
  "darkBackground",
  "darkForeground",
  "darkSurface",
  "darkSidebar",
] as const;

export const UI_FONT_IDS = [
  "system",
  "inter",
  "avenir",
  "rounded",
  "serif",
] as const;

export const CODE_FONT_IDS = [
  "sf-mono",
  "jetbrains",
  "fira-code",
  "menlo",
  "cascadia",
] as const;

export const UI_FONT_SIZES = [12, 13, 14, 15, 16] as const;
export const CODE_FONT_SIZES = [11, 12, 13, 14, 15] as const;

export const THEME_TYPOGRAPHY_FIELDS = [
  "uiFont",
  "codeFont",
  "uiFontSize",
  "codeFontSize",
] as const;

export const THEME_STUDIO_FIELDS = [
  ...THEME_COLOR_FIELDS,
  ...THEME_TYPOGRAPHY_FIELDS,
] as const;

export type ThemeColorField = (typeof THEME_COLOR_FIELDS)[number];
export type ThemeTypographyField = (typeof THEME_TYPOGRAPHY_FIELDS)[number];
export type ThemeStudioField = (typeof THEME_STUDIO_FIELDS)[number];
export type UiFontId = (typeof UI_FONT_IDS)[number];
export type CodeFontId = (typeof CODE_FONT_IDS)[number];
export type UiFontSize = (typeof UI_FONT_SIZES)[number];
export type CodeFontSize = (typeof CODE_FONT_SIZES)[number];

export interface ThemeStudioSettings {
  lightAccent: string;
  lightBackground: string;
  lightForeground: string;
  lightSurface: string;
  lightInlineCode: string;
  lightSidebar: string;
  darkAccent: string;
  darkBackground: string;
  darkForeground: string;
  darkSurface: string;
  darkInlineCode: string;
  darkSidebar: string;
  uiFont: UiFontId;
  codeFont: CodeFontId;
  uiFontSize: UiFontSize;
  codeFontSize: CodeFontSize;
}

export const DEFAULT_THEME_STUDIO_SETTINGS: ThemeStudioSettings = {
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
  uiFont: "system",
  codeFont: "sf-mono",
  uiFontSize: 14,
  codeFontSize: 12,
};

const HEX_COLOR = /^#[\dA-F]{6}$/i;

const LEGACY_EDITORIAL_SIGNATURE = {
  lightAccent: "#065588",
  lightBackground: "#F3F2EE",
  lightForeground: "#1F0909",
  lightSurface: "#E8E7DF",
} as const;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

function isOneOf<const Value>(
  value: unknown,
  candidates: readonly Value[],
): value is Value {
  return candidates.includes(value as Value);
}

function mixHex(
  foreground: string,
  foregroundWeight: number,
  background: string,
): string {
  const channels = (value: string) =>
    [1, 3, 5].map((start) =>
      Number.parseInt(value.slice(start, start + 2), 16),
    );
  const foregroundChannels = channels(foreground);
  const backgroundChannels = channels(background);

  return `#${foregroundChannels
    .map((channel, index) =>
      Math.round(
        channel * foregroundWeight +
          backgroundChannels[index]! * (1 - foregroundWeight),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

export function decodeThemeStudioSettings(
  section: unknown,
): ThemeStudioSettings | undefined {
  if (section === null || typeof section !== "object") return undefined;

  const sourceRecord = section as Record<string, unknown>;
  const isLegacyEditorial = Object.entries(LEGACY_EDITORIAL_SIGNATURE).every(
    ([field, value]) =>
      typeof sourceRecord[field] === "string" &&
      sourceRecord[field].toUpperCase() === value,
  );
  const record = isLegacyEditorial
    ? { ...sourceRecord, lightForeground: "#2F2C29" }
    : sourceRecord;
  for (const field of LEGACY_THEME_COLOR_FIELDS) {
    if (!isHexColor(record[field])) return undefined;
  }

  for (const field of THEME_COLOR_FIELDS) {
    if (record[field] !== undefined && !isHexColor(record[field])) {
      return undefined;
    }
  }

  const legacyInlineCode = {
    lightInlineCode: mixHex(
      record.lightForeground as string,
      0.06,
      record.lightBackground as string,
    ),
    darkInlineCode: mixHex(
      record.darkForeground as string,
      0.1,
      record.darkBackground as string,
    ),
  };
  const colors = Object.fromEntries(
    THEME_COLOR_FIELDS.map((field) => {
      const fallback =
        field === "lightInlineCode" || field === "darkInlineCode"
          ? legacyInlineCode[field]
          : DEFAULT_THEME_STUDIO_SETTINGS[field];
      return [field, isHexColor(record[field]) ? record[field] : fallback];
    }),
  ) as Pick<ThemeStudioSettings, ThemeColorField>;

  return {
    ...colors,
    uiFont: isOneOf(record.uiFont, UI_FONT_IDS)
      ? record.uiFont
      : DEFAULT_THEME_STUDIO_SETTINGS.uiFont,
    codeFont: isOneOf(record.codeFont, CODE_FONT_IDS)
      ? record.codeFont
      : DEFAULT_THEME_STUDIO_SETTINGS.codeFont,
    uiFontSize: isOneOf(record.uiFontSize, UI_FONT_SIZES)
      ? record.uiFontSize
      : DEFAULT_THEME_STUDIO_SETTINGS.uiFontSize,
    codeFontSize: isOneOf(record.codeFontSize, CODE_FONT_SIZES)
      ? record.codeFontSize
      : DEFAULT_THEME_STUDIO_SETTINGS.codeFontSize,
  };
}
