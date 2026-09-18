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
  UI_FONT_IDS,
  UI_FONT_SIZES,
  type CodeFontId,
  type CodeFontSize,
  type ThemeColorField,
  type ThemeContrastField,
  type ThemeStudioSettings,
  type ThemeTypographyField,
  type UiFontId,
  type UiFontSize,
} from "../theme-settings.js";
import { AccentSwatches } from "./AccentSwatches.js";
import { AdvancedDisclosure } from "./AdvancedDisclosure.js";
import { ColorChip } from "./ColorChip.js";
import { ContrastSlider } from "./ContrastSlider.js";
import { ShareString } from "./ShareString.js";
import { SizeStepper } from "./SizeStepper.js";
import {
  ACCENT_SWATCHES,
  activeAccentSwatchId,
  type AccentSwatchId,
} from "./accent-swatches.js";
import type { ThemeStudioPrefs } from "./persistence.js";
import {
  THEME_PRESETS,
  themePresetIdOf,
  type ThemePresetId,
} from "./presets.js";
import type { createThemeStudioStore } from "./store.js";
import { CODE_FONT_STACKS, UI_FONT_STACKS } from "./theme-tokens.js";

export interface ThemeStudioInjected {
  applyPreset: (id: ThemePresetId) => void;
  applySettings: (settings: ThemeStudioSettings) => void;
  resetTheme: () => void;
  setColor: (field: ThemeColorField, value: string) => void;
  setContrast: (field: ThemeContrastField, value: number) => void;
  setPrefs: (patch: Partial<ThemeStudioPrefs>) => void;
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

interface SettingSelectProps {
  label: string;
  onChange: (value: string) => void;
  options: readonly { fontFamily?: string; label: string; value: string }[];
  value: string;
}

const MODE_OPTIONS = ["system", "light", "dark"] as const;
const REDUCE_MOTION_OPTIONS = ["system", "on", "off"] as const;
const VARIANTS = ["light", "dark"] as const;
const ADVANCED_SUFFIXES = ["surface", "inlineCode", "sidebar"] as const;

type VariantMode = (typeof VARIANTS)[number];

function colorFieldOf(mode: VariantMode, suffix: string): ThemeColorField {
  return `${mode}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}` as ThemeColorField;
}

function contrastFieldOf(mode: VariantMode): ThemeContrastField {
  return mode === "light" ? "lightContrast" : "darkContrast";
}

function SettingSelect({ label, onChange, options, value }: SettingSelectProps) {
  return (
    <label data-appearance-setting-row>
      <span>{label}</span>
      <select
        data-appearance-select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option
            key={option.value}
            style={
              option.fontFamily === undefined
                ? undefined
                : { fontFamily: option.fontFamily }
            }
            value={option.value}
          >
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
  applySettings,
  resetTheme,
  setColor,
  setContrast,
  setPrefs,
  setTheme,
  setTypography,
  t,
  useStore,
}: ThemeStudioProps) {
  const activeScheme = useStore((state) => state.activeScheme);
  const preference = useStore((state) => state.preference);
  const prefs = useStore((state) => state.prefs);
  const saveStatus = useStore((state) => state.saveStatus);
  const settings = useStore((state) => state.settings);
  const activePreset = themePresetIdOf(settings);
  const activeAccent = activeAccentSwatchId(settings);

  const uiFontOptions = UI_FONT_IDS.map((value) => ({
    value,
    label: t(`font.${value}`),
    fontFamily: UI_FONT_STACKS[value],
  }));
  const codeFontOptions = CODE_FONT_IDS.map((value) => ({
    value,
    label: t(`font.${value}`),
    fontFamily: CODE_FONT_STACKS[value],
  }));

  const applyAccentSwatch = (id: AccentSwatchId) => {
    const swatch = ACCENT_SWATCHES.find((candidate) => candidate.id === id);
    if (swatch === undefined) return;
    applySettings({
      ...settings,
      lightAccent: swatch.light,
      darkAccent: swatch.dark,
    });
  };

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
        <section data-appearance-card data-card="theme">
          <div data-appearance-card-header>
            <h3>{t("preset.title")}</h3>
            <p>{t("preset.description")}</p>
          </div>
          <ShareString settings={settings} t={t} onImport={applySettings} />

          <div
            aria-label={t("mode.title")}
            data-appearance-mode-grid
            role="radiogroup"
          >
            {MODE_OPTIONS.map((mode) => (
              <label
                key={mode}
                data-appearance-mode
                data-selected={preference === mode ? "true" : "false"}
              >
                <input
                  checked={preference === mode}
                  data-appearance-sr
                  name="appearance-mode"
                  type="radio"
                  value={mode}
                  onChange={() => setTheme(mode)}
                />
                <ModePreview mode={mode} />
                <span>{t(`mode.${mode}`)}</span>
              </label>
            ))}
          </div>

          <div
            aria-label={t("preset.title")}
            data-appearance-preset-grid
            role="radiogroup"
          >
            {THEME_PRESETS.map((preset) => {
              const selected = activePreset === preset.id;
              return (
                <label
                  key={preset.id}
                  data-appearance-preset
                  data-selected={selected ? "true" : "false"}
                >
                  <input
                    checked={selected}
                    data-appearance-sr
                    name="appearance-preset"
                    type="radio"
                    value={preset.id}
                    onChange={() => applyPreset(preset.id)}
                  />
                  <PalettePreview
                    mode={activeScheme}
                    settings={{ ...settings, ...preset.palette }}
                  />
                  <span>{t(`preset.${preset.id}`)}</span>
                </label>
              );
            })}
            {activePreset === undefined && (
              <span
                data-appearance-preset
                data-custom="true"
                data-selected="true"
              >
                <span data-appearance-preset-custom>{t("preset.custom")}</span>
              </span>
            )}
          </div>

          <div data-appearance-accent-group>
            <AccentSwatches
              activeId={activeAccent}
              customLabel={t("accent.custom")}
              label={t("accent.label")}
              labelOf={(id) => t(`accent.${id}`)}
              onSelect={applyAccentSwatch}
            />
          </div>

          {VARIANTS.map((mode) => (
            <section
              key={mode}
              aria-labelledby={`appearance-variant-${mode}`}
              data-appearance-variant
            >
              <h4 id={`appearance-variant-${mode}`}>{t(`variant.${mode}`)}</h4>
              <div data-appearance-fields>
                <ColorChip
                  field={colorFieldOf(mode, "background")}
                  invalidMessage={t("input.invalid")}
                  label={t("color.background")}
                  value={settings[colorFieldOf(mode, "background")]}
                  onChange={setColor}
                />
                <ColorChip
                  field={colorFieldOf(mode, "foreground")}
                  invalidMessage={t("input.invalid")}
                  label={t("color.foreground")}
                  value={settings[colorFieldOf(mode, "foreground")]}
                  onChange={setColor}
                />
                <ContrastSlider
                  description={t("contrast.description")}
                  highLabel={t("contrast.high")}
                  label={t("contrast.label")}
                  lowLabel={t("contrast.low")}
                  standardLabel={t("contrast.standard")}
                  value={settings[contrastFieldOf(mode)]}
                  onChange={(value) => setContrast(contrastFieldOf(mode), value)}
                />
                <AdvancedDisclosure
                  description={t("advanced.description")}
                  title={t("advanced.title")}
                >
                  {ADVANCED_SUFFIXES.map((suffix) => (
                    <ColorChip
                      key={suffix}
                      field={colorFieldOf(mode, suffix)}
                      invalidMessage={t("input.invalid")}
                      label={t(`color.${suffix}`)}
                      value={settings[colorFieldOf(mode, suffix)]}
                      onChange={setColor}
                    />
                  ))}
                </AdvancedDisclosure>
              </div>
            </section>
          ))}
        </section>

        <section data-appearance-card data-card="prefs">
          <div data-appearance-card-header>
            <h3>{t("prefs.title")}</h3>
          </div>
          <div data-appearance-subheading>
            <h4>{t("typography.title")}</h4>
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
            <SizeStepper
              decreaseLabel={t("size.decrease")}
              increaseLabel={t("size.increase")}
              label={t("typography.uiFontSize")}
              value={settings.uiFontSize}
              values={UI_FONT_SIZES}
              onChange={(value) =>
                setTypography("uiFontSize", value as UiFontSize)
              }
            />
            <SizeStepper
              decreaseLabel={t("size.decrease")}
              increaseLabel={t("size.increase")}
              label={t("typography.codeFontSize")}
              value={settings.codeFontSize}
              values={CODE_FONT_SIZES}
              onChange={(value) =>
                setTypography("codeFontSize", value as CodeFontSize)
              }
            />
          </div>

          <div data-appearance-subheading>
            <h4>{t("prefs.render.title")}</h4>
          </div>
          <div data-appearance-setting-list>
            <div data-appearance-setting-row>
              <div data-appearance-setting-copy>
                <span>{t("prefs.reduceMotion")}</span>
                <p>{t("prefs.reduceMotion.description")}</p>
              </div>
              <div
                aria-label={t("prefs.reduceMotion")}
                data-appearance-segment
                role="radiogroup"
              >
                {REDUCE_MOTION_OPTIONS.map((option) => (
                  <label
                    key={option}
                    data-selected={prefs.reduceMotion === option ? "true" : "false"}
                  >
                    <input
                      checked={prefs.reduceMotion === option}
                      data-appearance-sr
                      name="appearance-reduce-motion"
                      type="radio"
                      value={option}
                      onChange={() => setPrefs({ reduceMotion: option })}
                    />
                    <span>{t(`segment.${option}`)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div data-appearance-setting-row>
              <div data-appearance-setting-copy>
                <span>{t("prefs.fontSmoothing")}</span>
                <p>{t("prefs.fontSmoothing.description")}</p>
              </div>
              <button
                aria-checked={prefs.fontSmoothing}
                aria-label={t("prefs.fontSmoothing")}
                data-appearance-switch
                role="switch"
                type="button"
                onClick={() => setPrefs({ fontSmoothing: !prefs.fontSmoothing })}
              >
                <span aria-hidden="true" data-appearance-switch-thumb />
              </button>
            </div>
          </div>
        </section>

        <p aria-live="polite" data-appearance-status data-status={saveStatus}>
          {statusText}
        </p>
      </div>
    </div>
  );
}
