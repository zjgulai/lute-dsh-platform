import * as React from "react";

import type { ThemeStudioSettings } from "../theme-settings.js";
import type { ThemeStudioKey } from "./locales.js";
import { decodeShareString, encodeThemeStudioSettings } from "./share-string.js";

export interface ShareStringProps {
  onImport: (settings: ThemeStudioSettings) => void;
  settings: ThemeStudioSettings;
  t: (key: ThemeStudioKey) => string;
}

/**
 * Copy and import share one panel: a copy whose clipboard write is refused
 * falls back to the same textarea, so a reader always ends up with the
 * string in hand instead of a silent failure.
 */
export function ShareString({ onImport, settings, t }: ShareStringProps) {
  const [open, setOpen] = React.useState(false);
  const [payload, setPayload] = React.useState("");
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    const text = encodeThemeStudioSettings(settings);
    try {
      if (navigator.clipboard === undefined) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setPayload(text);
      setError(t("share.copyFallback"));
      setOpen(true);
    }
  };

  const submit = () => {
    const decoded = decodeShareString(payload);
    if (decoded === undefined) {
      setError(t("share.invalid"));
      return;
    }
    setError(undefined);
    setPayload("");
    setOpen(false);
    onImport(decoded);
  };

  return (
    <div data-appearance-share>
      <div data-appearance-share-actions>
        <span aria-live="polite" data-appearance-share-status>
          {copied ? t("share.copied") : ""}
        </span>
        <button
          data-appearance-button
          data-variant="secondary"
          type="button"
          onClick={() => void copy()}
        >
          {t("share.copy")}
        </button>
        <button
          aria-expanded={open}
          data-appearance-button
          data-variant="secondary"
          type="button"
          onClick={() => {
            setError(undefined);
            setOpen((current) => !current);
          }}
        >
          {t("share.import")}
        </button>
      </div>
      {open && (
        <div data-appearance-share-panel>
          <textarea
            aria-describedby={error === undefined ? undefined : "appearance-share-error"}
            aria-label={t("share.paste")}
            data-appearance-share-input
            placeholder={t("share.paste")}
            rows={3}
            spellCheck={false}
            value={payload}
            onChange={(event) => setPayload(event.currentTarget.value)}
          />
          {error !== undefined && (
            <p id="appearance-share-error" data-appearance-share-error>
              {error}
            </p>
          )}
          <div data-appearance-share-submit>
            <button
              data-appearance-button
              data-variant="primary"
              type="button"
              onClick={submit}
            >
              {t("share.submit")}
            </button>
            <button
              data-appearance-button
              data-variant="secondary"
              type="button"
              onClick={() => {
                setError(undefined);
                setPayload("");
                setOpen(false);
              }}
            >
              {t("share.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
