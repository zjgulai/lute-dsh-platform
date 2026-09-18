import * as React from "react";

export interface SizeStepperProps {
  decreaseLabel: string;
  increaseLabel: string;
  label: string;
  onChange: (value: number) => void;
  value: number;
  values: readonly number[];
}

/**
 * Steps only through the curated size list, so the control can never commit a
 * value the token layer does not model. Typed input commits on Enter or blur
 * and snaps to the nearest allowed size.
 */
export function SizeStepper({
  decreaseLabel,
  increaseLabel,
  label,
  onChange,
  value,
  values,
}: SizeStepperProps) {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => setDraft(String(value)), [value]);

  const index = values.indexOf(value);
  const first = values[0];
  const last = values[values.length - 1];

  const step = (delta: number) => {
    if (index < 0) return;
    const next = values[index + delta];
    if (next !== undefined) onChange(next);
  };

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const nearest = values.reduce(
      (best, candidate) =>
        Math.abs(candidate - parsed) < Math.abs(best - parsed) ? candidate : best,
      value,
    );
    setDraft(String(nearest));
    if (nearest !== value) onChange(nearest);
  };

  return (
    <div data-appearance-stepper>
      <span data-appearance-chip-label>{label}</span>
      <div data-appearance-stepper-control>
        <button
          aria-label={`${decreaseLabel} ${label}`}
          data-appearance-stepper-button
          disabled={first !== undefined && value <= first}
          type="button"
          onClick={() => step(-1)}
        >
          −
        </button>
        <input
          aria-label={label}
          autoComplete="off"
          data-appearance-stepper-value
          inputMode="numeric"
          value={draft}
          onBlur={(event) => commit(event.currentTarget.value)}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(event.currentTarget.value);
              event.currentTarget.blur();
            }
          }}
        />
        <button
          aria-label={`${increaseLabel} ${label}`}
          data-appearance-stepper-button
          disabled={last !== undefined && value >= last}
          type="button"
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
