# Agent Team popover layering and focus contract

## Problem

The Agent Team Composer popover and live Run dock used independent low
`z-index` values and relied on broad DOM scans for Settings and Run Center
handoffs. The live dock also lacked a stable relationship between its trigger
and panel, Escape/outside dismissal, focus restoration, and a clear separation
between the dialog label and live task status. Those details made the surfaces
fragile when the Settings shell or another overlay was present.

## Decision

Keep Composer and the live Run dock non-modal and give them one package-owned
popover layer at `2147482000`, below the Settings shell's validated outer
modal layer at `2147483001`. Add stable IDs and `aria-controls`/
`aria-expanded`/accessible names, scope Settings discovery to the Settings
shell marker and Teams navigation, and target the stable Run Center tab rather
than scanning generic dialogs or visible button text. The Run dock now closes
on Escape and outside pointer interaction, restores focus to its trigger, and
exposes task updates as a polite live status. Existing business actions,
routes, slots, RPCs, and recipe data remain unchanged.

## Alternatives considered

- Raising individual panels independently: rejected because it duplicates
  layer policy and can still lose to a parent stacking context.
- Using a native/top-layer popover: rejected because it could outrank the
  Settings modal mask and change the existing non-modal interaction model.
- Keeping global generic-dialog or button-text scans: rejected because
  unrelated dialogs and localized labels can be selected accidentally.

## Consequences

Settings remains visually above Agent Team's local side surfaces while the
Composer and Run dock retain their intended non-modal behavior. Keyboard and
assistive-technology relationships are now explicit and testable. Package
tests and typechecks cover the contract; desktop live verification and the
unified fixed-screenshot pass remain part of the current B2 acceptance batch.
