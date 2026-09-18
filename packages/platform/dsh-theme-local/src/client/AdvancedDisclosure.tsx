import * as React from "react";

export interface AdvancedDisclosureProps {
  children: React.ReactNode;
  description: string;
  title: string;
}

/**
 * Secondary colors live behind one disclosure so the default view shows the
 * three decisions most readers make (accent, background, text) without
 * hiding the rest. Collapsed by default keeps the settings section short in
 * the 720px column.
 */
export function AdvancedDisclosure({
  children,
  description,
  title,
}: AdvancedDisclosureProps) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  return (
    <div data-appearance-advanced>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        data-appearance-advanced-toggle
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" data-appearance-chevron data-open={open ? "true" : "false"} />
        <span data-appearance-advanced-copy>
          <span>{title}</span>
          <p>{description}</p>
        </span>
      </button>
      <div data-appearance-advanced-panel hidden={!open} id={panelId}>
        {children}
      </div>
    </div>
  );
}
