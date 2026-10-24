# Screen map and interaction notes

**Approved visual reference, 21 October 2026; implementation pending.** Read with the [gallery](index.html), [design system](../../../DESIGN_SYSTEM.md), [routes](../../booth-user-flow.md) and [contract](../../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md). This guide maps the approved mockups to the agreed behavior; it does not replace the contract.

## Route coverage

| Sheet                                                          | Route or surface                                | What to review                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Dashboard](admin/01-dashboard.png)                            | `/dashboard`                                    | Month and upcoming summaries, next Event and recent activity.                       |
| [Events](admin/02-events.png)                                  | `/events`                                       | Draft and Live Events with whole Film Package counts.                               |
| [Event editor](admin/03-event-editor.png)                      | `/events/new · /events/[eventId]`               | Client, schedule, Event Media and packages; print total is derived.                 |
| [Draft and booth setup](admin/04-draft-setup.png)              | `/events/[eventId]`                             | Readiness, physical checks and the test reminder before the local iPad handoff.     |
| [Live Event](admin/05-live-event.png)                          | `/events/[eventId]`                             | Package accounting, equipment, activity and separate booth/Event lifecycle actions. |
| [Phone management](admin/06-phone-management.png)              | `/events/[eventId]`                             | Running, explicitly Paused and Booth finished while the Event remains Live.         |
| [Phone recovery](admin/07-phone-recovery.png)                  | `/events/[eventId]`                             | Physical reload and exceptional unknown-outcome inspection are independent.         |
| [Authentication](admin/08-authentication.png)                  | `/sign-in · /forgot-password · /reset-password` | Shared form styling for sign-in, recovery and password reset.                       |
| [History](admin/09-history.png)                                | `/history · /events/[eventId]`                  | Retained Completed and Cancelled Events with read-only detail.                      |
| [Profile](admin/10-profile.png)                                | `/profile`                                      | Account details, appearance, password and current-device sign-out.                  |
| [Dialogs and feedback](admin/11-dialogs-feedback.png)          | `Admin state specimens`                         | Consequential choices and persistent error feedback.                                |
| [Welcome and capture](booth/01-welcome-capture.png)            | `/booth`                                        | Montage, Start, camera preview, Take Photo and countdown.                           |
| [Review and printing](booth/02-review-printing-complete.png)   | `/booth`                                        | Retake or Print, truthful printing status and a photo-free completion screen.       |
| [Connection recovery](booth/03-connection-recovery.png)        | `/booth`                                        | Bluetooth, camera, detected offline and service-unavailable states.                 |
| [Printer and capacity](booth/04-printer-and-capacity.png)      | `/booth`                                        | No film, unknown outcome and booked-print exhaustion.                               |
| [Pause, finish and access](booth/05-pause-finish-access.png)   | `/booth`                                        | Pause, Finishing, Finished and exceptional access loss.                             |
| [iPad and phone recovery](journeys/01-ipad-phone-recovery.png) | `/booth ↔ /events/[eventId]`                    | Guest-facing unavailability paired with the Admin's phone actions.                  |

`/` redirects and `/auth/callback` exchanges the recovery code; neither needs a new navigable screen. The supervised qualification harness is historical tooling and is intentionally outside the product mockups.

## Shared Admin presentation

Use one sidebar on wide screens and a compact navigation menu on phones. Dashboard, Events, History and Profile retain the same labels and order. Cards, counters, input labels, status badges and action placement share the same visual vocabulary. Phone layouts prioritize the Event, current blockers, accounting and next action.

The wide table layout is a comparison view; on compact screens rows become labeled summaries. Form fields stack in one column. The phone management and recovery sheets demonstrate the compact treatment rather than requiring a new route.

The mockups primarily show light Admin mode. The saved Profile preference also supports dark Admin mode using the exact dark tokens; Booth always uses dark mode. Theme preference is an account setting, not a new per-device product rule.

## Sample accounting

Studio evening uses five original packages and one additional package: **6 × 10 = 60 booked prints**. These are capacity counts, never measured physical inventory.

| Illustrated state                           | Confirmed Prints | Pending | Available |
| ------------------------------------------- | ---------------: | ------: | --------: |
| Healthy live management                     |               38 |       0 |        22 |
| Definitely no output after a later attempt  |               39 |       0 |        21 |
| One later attempt has an unknown outcome    |               39 |       1 |        20 |
| Film reloaded while that outcome is unknown |               39 |       1 |        20 |
| Unknown later resolved Printed              |               40 |       0 |        20 |
| Unknown later resolved Not printed          |               39 |       0 |        21 |
| Finished run example                        |               40 |       0 |        20 |

Available = booked prints − confirmed − unresolved holds. The short UI label **Printed** means Confirmed Prints, including an unusable image after full physical ejection. A pending attempt is never success. Illustrations are snapshots, not an assertion that every sheet is one continuous attempt sequence.

Adding one Film Package to the six-package example gives seven packages and 70 booked prints. Confirming physical loading adds zero booked prints. A protected cover ejection is not a Guest print.

## Booking and setup

- Drafts have a whole-number Film Package field and derived total of ten prints per package. There is no separate print-count field.
- Zero packages may be saved in Draft, but cannot pass start readiness. Negative, fractional or invalid values receive inline validation. Show validation on the field being edited, not alongside a conflicting successful value.
- Keep Client, schedule and Event Media fields grouped. Media upload/replace/remove is Draft-only. Show the format, size and duration limits from [ADR-0027](../../adr/0027-draft-only-event-media.md); failed/stale replacement preserves existing media, and Live/terminal media is read-only. A stale save preserves entered values and offers Reload latest details.
- On the booth iPad, start from `/events/[eventId]`. Check camera/live feed, server, correct printer, physical loaded-film/power/Guided Access confirmations and available capacity.
- Show only: **Always test the printer before starting Booth Mode.** There is no Test Print button, test result or output-inspection prerequisite.
- Start Booth Mode performs the local sign-out and device handoff. Display Preparing Booth Mode until it succeeds. The phone Admin session remains available.
- Initial handoff failure or genuine access loss uses the contract's exceptional same-run recovery; successful access restoration leaves the run Paused until explicit phone Resume. It never bypasses an old unresolved attempt.

## Phone recovery

Keep independently visible blockers separate. Loading film, reconnecting, adding capacity and resolving a print each address their own condition.

1. **Known no output:** show Film reload needed when justified by printer evidence. The Admin physically reloads, then chooses Confirm film loaded for the current Event request. Do not ask Printed / Not printed for a known terminal outcome.
2. **Unknown output:** reliable feedback can settle it. Otherwise the Admin inspects and chooses Printed or Not printed with a required reason. Before Not printed can settle the attempt, the old job must be safely prevented from ejecting later. If this cannot be established, keep it pending and unavailable.
3. **Reloaded but unknown:** show Film loaded and Print outcome still unknown together. The count stays pending; loading alone does not settle it.
4. **All booked prints used:** the Admin records a client-requested whole Additional Film Package. Positive capacity alone does not clear another readiness blocker or an explicit pause.
5. **Admin pause:** remain Paused through every recovery. Only explicit Resume, after all guards pass, permits new guest work.

Confirm film loaded refers to the current reload request and printer, not a promise that a sensor counted ten usable sheets. The Event page refreshes while visible; no out-of-app push notification is promised.

## Guest flow and recovery

Welcome montage → Start → mirrored live preview → Take Photo → 3–2–1 → unmirrored print crop → Retake or Print.

Retake returns to preview. Print shows honest sending/waiting stages. Show Print complete only after full physical ejection and acknowledged accounting. Discard the photo; show completion for three seconds, then a fresh welcome only when ready. The complete screen has no previous-photo thumbnail.

| Condition               | Exact main copy                                                                     | Available Booth action             |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| Bluetooth               | Bluetooth disconnected. Please inform the Admin.                                    | Connect to Instax                  |
| Camera                  | Camera disconnected. Please inform the Admin.                                       | Enable Camera                      |
| Detected offline        | Wi-Fi disconnected. Please inform the Admin.                                        | None                               |
| Service unavailable     | Connection unavailable. Please inform the Admin.                                    | None                               |
| Reliable no-film result | Printer is out of film. Please inform the Admin.                                    | None; phone reload confirmation    |
| Unknown/unclassified    | Booth is temporarily unavailable. Please inform the Admin.                          | None; feedback or phone inspection |
| Capacity exhausted      | All booked prints have been used. Please ask the Admin to add another Film Package. | None; phone package entry          |
| Explicit pause          | Booth paused                                                                        | None; phone Resume                 |
| Finishing               | Finishing Booth Mode                                                                | None; current work must settle     |
| Finished                | Booth Mode finished                                                                 | Sign in                            |
| Genuine access loss     | Booth access ended. Please inform the Admin.                                        | Sign in for exceptional setup      |

The two-part headings/support in the images form the exact main messages above. Guest screens do not expose Admin accounting controls, Event contacts or an exit gesture.

Before possible printer involvement, discard the photo and end the session on interruption; reconcile any unsent reservation. After possible involvement, end the interaction but retain the independent pending attempt. A physically dispatched command may still complete; do not claim it can always be cancelled. No reconnect or page reload resends it.

Camera loss during printing lets the attempt settle while blocking another session; then present camera recovery. After a page reload, discard the photo and reconcile old work before a fresh welcome. If reliable feedback resolves an unknown, no inspection is needed. If it cannot, the phone inspection remains required.

Overlapping conditions retain every blocker. Pause/Finishing retains lifecycle priority with truthful current-print/recovery information. Show a needed Bluetooth/camera recovery action when applicable. Fixing one condition never clears another or an explicit pause.

Welcome has a pause-video control and uses an Event still/default for reduced motion or unavailable media. Preview/review inactivity warns at 75 seconds with Continue and discards at 90 seconds. No inactivity timer interrupts countdown or printing. These timed variants reuse the shown layout; they are not additional routes.

## Lifecycle, history and account states

Pause is immediate for new work; an already-dispatched print still settles. Finish Booth Mode waits in Finishing until attempts are terminal, then revokes guest access and displays Finished. Complete Event is separate and requires finished runs. A Finished run cannot Resume; another run on a still-Live Event needs a new explicit local setup without resetting totals.

Draft deletion is the only deletion action. Draft cancellation and eligible Live cancellation retain the Event in History. Completed/Cancelled details are read-only; no redaction, reopen or deletion control. History shows aggregate capture/print metadata and Event Media, never saved Guest photos.

Authentication sheets contain separate form/feedback specimens. An expired reset link replaces the usable reset form in the actual flow. Password reset success requires confirmed password save and Admin-session revocation; unknown revocation stays visibly incomplete. Profile sign-out errors remain visible and do not imply success.

## Implementation review targets

Use [tokens.json](tokens.json) as a convenient copy of current visual values, and recheck against the root design system when implementing. Raster glyphs, anti-aliasing and numerical spacing are not pixel-exact specifications.

Check keyboard focus, screen-reader status, non-color labels, 200% zoom, reduced motion, safe areas, readable Event Media overlays and large touch targets in the eventual implementation. Mockup inspection is not an accessibility, runtime, print-adapter or hardware qualification result.
