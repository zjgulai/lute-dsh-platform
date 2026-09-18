import * as React from "react";

import { isHexColor, type ThemeColorField } from "../theme-settings.js";

export interface ColorChipProps {
  field: ThemeColorField;
  invalidMessage: string;
  label: string;
  onChange: (field: ThemeColorField, value: string) => void;
  value: string;
}

/**
 * Compact color control: a swatch that opens the platform picker plus an
 * inline hex field for keyboard and paste workflows. The picker itself is the
 * native one on purpose — it already owns focus handling, keyboard support and
 * a screen-reader contract, so P1 spends no risk budget on a custom popover.
 */
export function ColorChip({
  field,
  invalidMessage,
  label,
  onChange,
  value,
}: ColorChipProps) {
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
    <div data-appearance-chip>
      <label data-appearance-chip-label htmlFor={inputId}>
        {label}
      </label>
      <div data-appearance-chip-control>
        <input
          aria-label={label}
          data-appearance-chip-swatch
          type="color"
          value={value}
          onChange={(event) => commit(event.currentTarget.value)}
        />
        <input
          id={inputId}
          aria-describedby={valid ? undefined : `${inputId}-error`}
          aria-invalid={!valid}
          autoComplete="off"
          data-appearance-chip-hex
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
        <span id={`${inputId}-error`} data-appearance-chip-error>
          {invalidMessage}
        </span>
      )}
    </div>
  );
}
