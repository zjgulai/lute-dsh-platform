import {
  ACCENT_SWATCHES,
  type AccentSwatchId,
} from "./accent-swatches.js";

export interface AccentSwatchesProps {
  activeId: AccentSwatchId | undefined;
  customLabel: string;
  label: string;
  labelOf: (id: AccentSwatchId) => string;
  onSelect: (id: AccentSwatchId) => void;
}

/**
 * Picking a swatch is one decision that writes both variants' accents, so the
 * chip shows the pair as a diagonal split: the light value leads on the light
 * canvas, the dark value takes over on charcoal.
 */
export function AccentSwatches({
  activeId,
  customLabel,
  label,
  labelOf,
  onSelect,
}: AccentSwatchesProps) {
  return (
    <div data-appearance-accent>
      <span data-appearance-chip-label>{label}</span>
      <div aria-label={label} data-appearance-swatches role="radiogroup">
        {ACCENT_SWATCHES.map((swatch) => {
          const name = labelOf(swatch.id);
          const selected = activeId === swatch.id;

          return (
            <label
              key={swatch.id}
              data-appearance-swatch-chip
              data-selected={selected ? "true" : "false"}
              title={name}
            >
              <input
                checked={selected}
                data-appearance-sr
                name="appearance-accent"
                type="radio"
                value={swatch.id}
                onChange={() => onSelect(swatch.id)}
              />
              <span
                aria-hidden="true"
                data-appearance-swatch-dot
                style={{
                  background: `linear-gradient(135deg, ${swatch.light} 0 50%, ${swatch.dark} 50% 100%)`,
                }}
              />
              <span data-appearance-sr>{name}</span>
            </label>
          );
        })}
        {activeId === undefined && (
          <span data-appearance-swatch-chip data-custom="true" data-selected="true">
            {customLabel}
          </span>
        )}
      </div>
    </div>
  );
}
