import * as React from "react";

export interface ContrastSliderProps {
  description: string;
  highLabel: string;
  label: string;
  lowLabel: string;
  onChange: (value: number) => void;
  standardLabel: string;
  value: number;
}

/**
 * The slider drives the neutral blend strength behind borders, raised
 * surfaces and secondary labels. The numeric readout is the source of truth;
 * the qualitative aria-valuetext keeps the ramp meaningful without inventing
 * a second scale.
 */
export function ContrastSlider({
  description,
  highLabel,
  label,
  lowLabel,
  onChange,
  standardLabel,
  value,
}: ContrastSliderProps) {
  const valueText =
    value <= 35 ? lowLabel : value >= 65 ? highLabel : standardLabel;

  return (
    <div data-appearance-contrast>
      <div data-appearance-contrast-copy>
        <span data-appearance-chip-label>{label}</span>
        <p>{description}</p>
      </div>
      <div
        data-appearance-contrast-control
        style={
          { "--appearance-contrast-fill": `${value}%` } as React.CSSProperties
        }
      >
        <input
          aria-label={label}
          aria-valuetext={valueText}
          data-appearance-slider
          max={100}
          min={0}
          step={1}
          type="range"
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
        <output data-appearance-slider-value>{value}</output>
      </div>
    </div>
  );
}
