# Instax design references

Created October 20, 2026 from the supplied **Modern Event Analytics Dashboard.png** reference.

Open [index.html](index.html) for the visual gallery. This folder contains **16 generated PNG sheets/page mockups**, the original reference, exact proposed tokens, and generation prompts.

These are static raster design proposals, not editable Figma components or app implementations. No Figma edits were made in this task. The image generator can vary small glyphs, sample data, labels, and nominal font rendering. Use [system/tokens.json](system/tokens.json) for exact implementation values; existing product requirements govern behavior. These artifacts do not amend product scope or hardware qualification decisions.

## Visual direction

- Admin: nearly white canvas, white cards, navy headings, slate body text, thin neutral borders, restrained blue accents.
- Everyday Add/Edit actions: neutral outline by default; filled accent for the principal commitment action.
- Headings: page 32/40, section 24/32, card 18/26, Inter semibold.
- Body: 16/24 and 14/20 regular; 14/20 medium labels; 12/18 captions.
- Booth: charcoal/ivory, Libre Baskerville headings, Inter body, large touch targets.
- Status: Draft gray, Live green, Completed blue, Cancelled gray. Upcoming is a scheduling annotation.

## Files

- [Foundations & typography](system/01-foundations.png)
- [Components](system/02-components.png)
- [Layout & feedback](system/03-layout-and-feedback.png)
- [Dashboard](admin/01-dashboard.png)
- [Events](admin/02-events.png)
- [Event editor](admin/03-event-editor.png)
- [Draft event](admin/04-event-detail-draft.png)
- [Live event](admin/05-event-live.png)
- [Booth setup](admin/06-booth-setup.png)
- [History](admin/07-history.png)
- [Profile](admin/08-profile.png)
- [Authentication states](admin/09-authentication-states.png)
- [Confirmations & recovery](admin/10-confirmations-and-recovery.png)
- [Responsive & dark](admin/11-responsive-and-dark.png)
- [Booth core flow](booth/01-core-flow.png)
- [Booth interruptions](booth/02-interruptions-and-handoff.png)

The event editor supplies the shared creation/editing layout; validation and stale-edit states appear on the feedback sheet. Authentication and confirmation flows are grouped into state sheets. Responsive and dark frames are layout studies rather than separate implemented routes.

## Product boundaries

The supplied image informs visual direction. Admin navigation remains Dashboard, Events, History, and Profile. The launch dashboard does not add charts, revenue, user management, or photo galleries. Guest allowance and physical film quantities remain separate. Film Stock is Admin-recorded shared physical inventory, never inferred from printer-reported count.

Booth states illustrate a simulated flow. Confirmed completion still requires the physically validated approach and actual-device qualification in the existing product requirements. Uncertain outcomes require authenticated inspection and resolution, with no automatic resend. Paused sign-in cannot reveal event/client information or resume the booth automatically.

## Provenance

Generated using the built-in Image Generation tool with the supplied image attached as the visual reference. Full prompts and targeted corrections are in [generation-prompts.json](generation-prompts.json) and [generation-corrections.json](generation-corrections.json). The original reference was preserved. Work in this task is limited to docs/design/.

