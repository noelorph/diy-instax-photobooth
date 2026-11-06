# ADR-0033: Adopt Apricot Studio and a smaller DM Sans type scale

**Status:** Superseded by [ADR-0034](0034-use-november-screen-reference-in-implementation-plan.md), 2026-11-06. Accepted and implemented on 2026-11-04; the [dated implementation evidence](../implementation/2026-11-04-apricot-studio-evidence.md) preserves actual results and limits.
**Current presentation authority:** [Main plan](../superpowers/plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract). The decision below records the previous Apricot target; original references are archived at Git revision `969e27eaa9082992ed58bbacd1b8c32c4393fbf0`.

## Context

The owner found the existing Geist/teal interface too generic and muted. They chose the Instant Studio direction, then rejected its oversized typography and selected the orange Apricot Studio study with smaller DM Sans text. They explicitly approved that study. The redesign applies to both Admin and Booth presentation while preserving functionality.

## Decision

- Use warm cream, dark brown text, burnt-orange actions and pale apricot surfaces. Reserve the brighter peach accent for illustration and decoration. Exact light/dark roles were recorded in the presentation guide and token companion archived at that Git revision.
- Use locally served **DM Sans** throughout, with regular 400 body text, medium 500 labels/buttons and semibold 600 headings. Admin page titles are 28/36 px, section titles 18/26 px, body text 16/24 px and secondary text 14/20 px. Booth headings are 36/44 px and instructions/buttons 20/28 px. Keep the larger countdown and generous touch targets.
- Give the default welcome a light cream surface and an original instant-camera illustration. Camera preview, countdown, review, printing, completion and operational/recovery screens use dark brown neutrals. The existing Admin light/dark preference remains; Booth appearance is determined by its state, independently of that preference. Add no theme selector.
- Use open sections, subtle separators and a pale accounting strip instead of enclosing every group in a card. Preserve labels, controls, route order, field validation and responsive access to every existing action.
- Keep the one-system decision in [ADR-0010](0010-one-design-system-for-admin-and-booth.md). This decision supersedes [ADR-0019](0019-use-geist-typography-across-admin-and-booth.md)'s Geist choice and the previous design system's teal palette, default welcome artwork and always-dark Booth presentation.

## Boundaries and consequences

This records a presentation decision, not a new feature or an implementation acceptance. [ADR-0025](0025-package-accounting-and-booth-recovery.md), the [replacement contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md), privacy, accounting, recovery, media unavailability and hardware release gates remain in force. No filters, galleries, photo retention, new controls or altered print crop follow from the reference image. The default illustration is bundled decoration, not Event Media or a Guest photo.

The approved raster is a visual reference for the welcome and Live Event page. Exact font size, colors, states and accessibility come from the written system; the raster is not a pixel specification. Dark mode, remaining screens and responsive layouts follow the shared tokens and existing behavior, and still require browser/actual-device verification during implementation.

The October 21 mockups, generation records and tokens are archived historical presentation evidence; the current main-plan catalog replaces their active state-coverage role. Their Geist/teal styling and always-dark welcome are superseded. No dated software or physical acceptance result is rewritten by this decision.

## Implementation notes — 2026-11-04

The application now uses these tokens and DM Sans. Two details refine the written system without changing the decision: selected navigation and the Profile theme choice use `surface-muted` with `primary-hover` text in light theme (matching the approved raster's peach active item and the contrast constraint), and accounting values keep their sentence labels at 20/28 px rather than separate 28/36 px numerals so existing labels stay attached on phones. The welcome illustration is an original bundled SVG. No behavior, route, API call, validation or control changed. The Profile appearance note was reworded because the welcome is no longer always dark.
