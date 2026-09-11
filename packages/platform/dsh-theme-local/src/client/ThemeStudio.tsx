import type {
  PropsLocale,
  PropsRuntime,
  PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type { ThemePreference } from "@deepseek-ai/dsh-client-ui-theme/client";
import * as React from "react";

import {
  CODE_FONT_IDS,
  CODE_FONT_SIZES,
  isHexColor,
  UI_FONT_IDS,
  UI_FONT_SIZES,
  type CodeFontId,
  type CodeFontSize,
  type ThemeColorField,
  type ThemeStudioSettings,
  type ThemeTypographyField,
  type UiFontId,
  type UiFontSize,
} from "../theme-settings.js";
import {
  THEME_PRESETS,
  themePresetIdOf,
  type ThemePresetId,
} from "./presets.js";
import type { createThemeStudioStore } from "./store.js";

export interface ThemeStudioInjected {
  applyPreset: (id: ThemePresetId) => void;
  resetTheme: () => void;
  setColor: (field: ThemeColorField, value: string) => void;
  setTheme: (preference: ThemePreference) => void;
  setTypography: <Field extends ThemeTypographyField>(
    field: Field,
    value: ThemeStudioSettings[Field],
  ) => void;
}

type ThemeStudioProps = PropsRuntime<"settings.section"> &
  PropsStore<ReturnType<typeof createThemeStudioStore>> &
  PropsLocale<"dsh.theme"> &
  ThemeStudioInjected;

interface ColorFieldProps {
  field: ThemeColorField;
  invalidMessage: string;
  label: string;
  onChange: (field: ThemeColorField, value: string) => void;
  value: string;
}

interface SettingSelectProps {
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
}

const COLOR_ROWS = [
  ["accent", "color.accent"],
  ["background", "color.background"],
  ["foreground", "color.foreground"],
  ["surface", "color.surface"],
  ["inlineCode", "color.inlineCode"],
  ["sidebar", "color.sidebar"],
] as const;

const MODE_OPTIONS = ["system", "light", "dark"] as const;

function ColorField({
  field,
  invalidMessage,
  label,
  onChange,
  value,
}: ColorFieldProps) {
  const [draft, setDraft] = React.useState(value);
  const valid = isHexColor(draft);

  React.useEffect(() => setDraft(value), [value]);

  const commit = (next: string) => {
    const normalized = next.toUpperCase();
    setDraft(normalized);
    if (isHexColor(normalized)) onChange(field, normalized);
  };

  const inputId = `appearance-${field}`;

  return (
    <div data-appearance-color-row>
      <label htmlFor={inputId}>{label}</label>
      <div data-appearance-color-control>
        <input
          aria-label={`${label} color picker`}
          data-appearance-swatch
          type="color"
          value={value}
          onChange={(event) => commit(event.currentTarget.value)}
        />
        <input
          id={inputId}
          aria-describedby={valid ? undefined : `${inputId}-error`}
          aria-invalid={!valid}
          autoComplete="off"
          data-appearance-input
          inputMode="text"
          maxLength={7}
          pattern="#[0-9A-Fa-f]{6}"
          spellCheck={false}
          value={draft}
          onBlur={() => {
            if (!valid) setDraft(value);
          }}
          onChange={(event) => commit(event.currentTarget.value)}
        />
      </div>
      {!valid && (
        <span id={`${inputId}-error`} data-appearance-field-error>
          {invalidMessage}
        </span>
      )}
    </div>
  );
}

function SettingSelect({
  label,
  onChange,
  options,
  value,
}: SettingSelectProps) {
  return (
    <label data-appearance-setting-row>
      <span>{label}</span>
      <select
        data-appearance-select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModePreview({ mode }: { mode: (typeof MODE_OPTIONS)[number] }) {
  return (
    <span aria-hidden="true" data-appearance-preview data-mode={mode}>
      <span data-appearance-preview-sidebar />
      <span data-appearance-preview-surface>
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

function PalettePreview({
  mode,
  settings,
}: {
  mode: "light" | "dark";
  settings: ThemeStudioSettings;
}) {
  const prefix = mode === "light" ? "light" : "dark";
  const colors = [
    settings[`${prefix}Accent`],
    settings[`${prefix}Background`],
    settings[`${prefix}Foreground`],
    settings[`${prefix}Surface`],
    settings[`${prefix}InlineCode`],
    settings[`${prefix}Sidebar`],
  ];

  return (
    <span aria-hidden="true" data-appearance-theme-colors>
      {colors.map((color, index) => (
        <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}

export function ThemeStudio({
  applyPreset,
  resetTheme,
  setColor,
  setTheme,
  setTypography,
  t,
  useStore,
}: ThemeStudioProps) {
  const activeScheme = useStore((state) => state.activeScheme);
  const preference = useStore((state) => state.preference);
  const saveStatus = useStore((state) => state.saveStatus);
  const settings = useStore((state) => state.settings);
  const activePreset = themePresetIdOf(settings);
  const [paletteMode, setPaletteMode] = React.useState<"light" | "dark">(
    activeScheme,
  );

  const uiFontOptions = UI_FONT_IDS.map((value) => ({
    value,
    label: t(`font.${value}`),
  }));
  const codeFontOptions = CODE_FONT_IDS.map((value) => ({
    value,
    label: t(`font.${value}`),
  }));
  const uiSizeOptions = UI_FONT_SIZES.map((value) => ({
    value: String(value),
    label: `${value} px`,
  }));
  const codeSizeOptions = CODE_FONT_SIZES.map((value) => ({
    value: String(value),
    label: `${value} px`,
  }));

  const statusText =
    saveStatus === "saving"
      ? t("status.saving")
      : saveStatus === "error"
        ? t("status.error")
        : t("status.saved");

  return (
    <div data-appearance-studio>
      <header data-appearance-header>
        <div>
          <h2>{t("title")}</h2>
          <p>{t("description")}</p>
        </div>
        <button
          data-appearance-button
          data-variant="secondary"
          type="button"
          onClick={resetTheme}
        >
          {t("action.reset")}
        </button>
      </header>

      <div data-appearance-content>
        <div data-appearance-mode-grid>
          {MODE_OPTIONS.map((mode) => (
            <button
              key={mode}
              aria-pressed={preference === mode}
              data-appearance-mode
              data-selected={preference === mode ? "true" : "false"}
              type="button"
              onClick={() => setTheme(mode)}
            >
              <ModePreview mode={mode} />
              <span>{t(`mode.${mode}`)}</span>
            </button>
          ))}
        </div>

        <section data-appearance-presets>
          <div data-appearance-subheading>
            <h3>{t("preset.title")}</h3>
            <p>{t("preset.description")}</p>
          </div>
          <div data-appearance-theme-picker>
            <select
              aria-label={t("preset.title")}
              data-appearance-select
              value={activePreset ?? ""}
              onChange={(event) => {
                const id = event.currentTarget.value;
                if (id !== "") applyPreset(id as ThemePresetId);
              }}
            >
              {activePreset === undefined && (
                <option value="">{t("preset.custom")}</option>
              )}
              {THEME_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {t(`preset.${preset.id}`)}
                </option>
              ))}
            </select>
            <PalettePreview mode={activeScheme} settings={settings} />
          </div>
        </section>

        <section data-appearance-palette>
          <div
            aria-label={t("preset.title")}
            data-appearance-tabs
            role="tablist"
          >
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                aria-selected={paletteMode === mode}
                data-selected={paletteMode === mode ? "true" : "false"}
                role="tab"
                type="button"
                onClick={() => setPaletteMode(mode)}
              >
                {t(`palette.${mode}`)}
              </button>
            ))}
          </div>
          {(["light", "dark"] as const).map((mode) => (
            <div
              key={mode}
              data-appearance-fields
              hidden={paletteMode !== mode}
              role="tabpanel"
            >
              {COLOR_ROWS.map(([suffix, labelKey]) => {
                const field =
                  `${mode}${suffix[0]?.toUpperCase()}${suffix.slice(1)}` as ThemeColorField;
                return (
                  <ColorField
                    key={field}
                    field={field}
                    invalidMessage={t("input.invalid")}
                    label={t(labelKey)}
                    value={settings[field]}
                    onChange={setColor}
                  />
                );
              })}
            </div>
          ))}
        </section>

        <section data-appearance-typography>
          <div data-appearance-subheading>
            <h3>{t("typography.title")}</h3>
            <p>{t("typography.description")}</p>
          </div>
          <div data-appearance-setting-list>
            <SettingSelect
              label={t("typography.uiFont")}
              options={uiFontOptions}
              value={settings.uiFont}
              onChange={(value) => setTypography("uiFont", value as UiFontId)}
            />
            <SettingSelect
              label={t("typography.codeFont")}
              options={codeFontOptions}
              value={settings.codeFont}
              onChange={(value) =>
                setTypography("codeFont", value as CodeFontId)
              }
            />
            <SettingSelect
              label={t("typography.uiFontSize")}
              options={uiSizeOptions}
              value={String(settings.uiFontSize)}
              onChange={(value) =>
                setTypography("uiFontSize", Number(value) as UiFontSize)
              }
            />
            <SettingSelect
              label={t("typography.codeFontSize")}
              options={codeSizeOptions}
              value={String(settings.codeFontSize)}
              onChange={(value) =>
                setTypography("codeFontSize", Number(value) as CodeFontSize)
              }
            />
          </div>
        </section>

        <p aria-live="polite" data-appearance-status data-status={saveStatus}>
          {statusText}
        </p>
      </div>
    </div>
  );
}
