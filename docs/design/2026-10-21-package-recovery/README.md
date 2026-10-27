# Package accounting and Booth recovery — design mockups

**Current F2 scope — 2026-10-27:** [ADR-0032](../../adr/0032-build-full-f2-with-uploads-unavailable.md) restores full F2/#30 implementation, including the dormant media editor and private delivery, while runtime uploads remain unavailable. Preserve media sections/designs, disabled controls, trusted mutation denials, private access/retention and prior-authorized cleanup-pending safeguards. The Admin Event Media page must visibly state that interrupted/late uploads and leftover files need cleanup verification before re-enabling. Supported cleanup and enabled transfer/failure/concurrency/private-delivery/playback qualification remain required for full #30 acceptance; existing disabled-scope evidence is unchanged. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

**Approved by the user · 21 October 2026 · implementation pending.**

Open the [visual gallery](index.html). This set covers the full Admin navigation, phone management/recovery, portrait iPad Booth Mode, and paired phone/iPad recovery examples.

## Visual direction

Use the current [design system](../../../DESIGN_SYSTEM.md): Geist Sans, warm ivory, ink and restrained teal, with the existing sidebar, cards and spacious page structure. Booth Mode uses the same typography and semantic roles on dark surfaces.

The [contract](../../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) and [PRD](../../../PRD.md) govern behavior. [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md) removes legacy History and conversion-review requirements. The earlier source mockups are archived only in Git checkpoint `1de2272`; they are not alternate instructions. Exact tokens and behavior come from current text, not raster artifacts.

## Review order

1. Dashboard → Events → Event editor → Draft/setup.
2. Live Event → phone management → phone recovery.
3. History → Profile → authentication → dialogs.
4. Booth welcome/capture → review/printing → recovery → lifecycle.
5. Paired iPad/phone recovery.

Each image opens at full resolution from the gallery. Multi-screen sheets show separate states; their outside headings and captions are review annotations, not product UI.

## Files

- [Dashboard](admin/01-dashboard.png) — Month and upcoming summaries, next Event and recent activity.
- [Events](admin/02-events.png) — Draft and Live Events with whole Film Package counts.
- [Event editor](admin/03-event-editor.png) — Client, schedule, Event Media and packages; print total is derived.
- [Draft and booth setup](admin/04-draft-setup.png) — Readiness, physical checks and the test reminder before the local iPad handoff.
- [Live Event](admin/05-live-event.png) — Package accounting, equipment, activity and separate booth/Event lifecycle actions.
- [Phone management](admin/06-phone-management.png) — Running, explicitly Paused and Booth finished while the Event remains Live.
- [Phone recovery](admin/07-phone-recovery.png) — Physical reload and exceptional unknown-outcome inspection are independent.
- [Authentication](admin/08-authentication.png) — Shared form styling for sign-in, recovery and password reset.
- [History](admin/09-history.png) — Retained Completed and Cancelled Events with read-only detail.
- [Profile](admin/10-profile.png) — Account details, appearance, password and current-device sign-out.
- [Dialogs and feedback](admin/11-dialogs-feedback.png) — Consequential choices and persistent error feedback.
- [Welcome and capture](booth/01-welcome-capture.png) — Montage, Start, camera preview, Take Photo and countdown.
- [Review and printing](booth/02-review-printing-complete.png) — Retake or Print, truthful printing status and a photo-free completion screen.
- [Connection recovery](booth/03-connection-recovery.png) — Bluetooth, camera, detected offline and service-unavailable states.
- [Printer and capacity](booth/04-printer-and-capacity.png) — No film, unknown outcome and booked-print exhaustion.
- [Pause, finish and access](booth/05-pause-finish-access.png) — Pause, Finishing, Finished and exceptional access loss.
- [iPad and phone recovery](journeys/01-ipad-phone-recovery.png) — Guest-facing unavailability paired with the Admin's phone actions.

Supporting files:

- [Screen map and interaction notes](screen-map.md): routes, transitions, exact recovery rules and sample accounting.
- [Exact design tokens](tokens.json): extracted from the current design system; raster colors/font glyphs are approximate.
- [Generation prompts](generation-prompts.json) and [targeted corrections](generation-corrections.json): built-in Image Generation provenance.
- [Review record](review-notes.md): checks and limitations for this set.

## Boundaries

These PNGs are approved visual reference artifacts, not editable Figma components or a working prototype. Buttons inside them do not operate the application. All names and contact details are fictional. The guest silhouette is a capture placeholder; it is not a stored photo or a proposed default camera image.

A generated raster is not an authority for exact type, character limits, control semantics or hardware behavior. Use the design system, contract and screen notes for implementation. The gallery's outer browser page is only a documentation viewer.

Automatic normal full-ejection completion, recovery evidence and the actual-iPad release trial remain subject to the [proof checklist](../../qualification/booth-recovery-proof-checklist.md). No application or hardware test result is claimed by these visuals.

Application code, configuration, migrations and tests are unchanged. No commit or publication is part of this mockup task.
