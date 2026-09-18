# Content surface visual contract

## Problem

Task Board and Theme Studio still exposed the previous surface language after
the first drawer batch: the board used a decorative grid, gradients and heavy
card shadows, while the theme editor used shorter transitions and did not
explicitly declare reduced-motion behavior. These differences made content
surfaces feel like separate products even though they already consumed the
shared theme tokens.

## Decision

Keep each surface's existing DOM, data flow, route and task/theme behavior, but
move their styling onto the existing `--dsw-*` semantic tokens. Task Board now
uses a neutral canvas, flatter panels/cards, semantic status tinting, a shared
focus ring and an explicit 180ms/reduced-motion contract. Theme Studio keeps its
three theme choices and palette previews, while using the same panel hierarchy,
selected-state treatment, 180ms control transitions and reduced-motion fallback.

## Alternatives considered

- Rebuilding either surface with a new shared component runtime: rejected
  because `dsh-theme-local` is the token owner and this batch must not add a
  second design-system runtime.
- Removing the Task Board canvas and parent-child panel layout: rejected
  because that would change the existing business information architecture and
  task navigation behavior.
- Leaving each surface's animation and elevation values untouched: rejected
  because the visual contract would continue to drift between pages.

## Consequences

The content surfaces now share the same visual vocabulary as the drawer family
without changing their business semantics. Task Board retains its movable
parent/child panels and confirmation dialogs; Theme Studio retains light/dark/
system controls and live preview behavior. Static package tests cover the
Task Board visual guardrails; package typecheck/build and live screenshot review
remain part of the next unified desktop acceptance batch.
