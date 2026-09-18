# Settings overlay stacking contract

## Problem

The Settings surface is rendered by the upstream `SettingsRoot` as a
`role="presentation"` overlay from the sidebar slot, not as a direct child of
`body`, with a `z-index` of `1000`. The real Desktop frame can keep a rightbar
visible beside that slot, and fixed/local surfaces could cover the Settings
page instead of remaining behind the modal mask.

## Decision

After the Settings DOM parser validates the modal and adds
`data-dsh-settings-shell-root`, the shell raises the owning presentation
wrapper to `2147483001` and, only while that marker exists, promotes the
transformed app `#root` stacking context to `2147483002`. The wrapper selector
is scoped to any presentation wrapper whose direct child is the validated
Settings panel; this handles the sidebar-slot mount. The root promotion is
below the native chrome's reserved maximum layer and is inactive for unrelated
dialogs or when Settings is closed.

## Alternatives considered

- Raising only the Settings panel or its presentation wrapper: rejected
  because the transformed app `#root` is itself below body-level fixed panel
  hosts.
- Raising every dialog or hiding all sidebars globally: rejected because it
  would change unrelated modal ordering and reduce recoverability.
- Rewriting the upstream Settings component: rejected because vendor/base UI is
  a read-only reference and the fix belongs in the local presentation layer.

## Consequences

Settings remains the active top-level surface while a right sidebar is open;
the sidebar may remain mounted behind the Settings mask but cannot cover or
receive interaction above it. The rule depends only on the parser-owned marker;
the package contract test checks the selector and the live restart must verify
the actual sidebar-slot mount.
