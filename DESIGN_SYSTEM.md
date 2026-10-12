# DIY Instax Photo Booth — Design System

- **Status:** Agreed design direction; implementation and target-device validation remain pending.
- **Date:** 2026-10-11
- **Source:** [Design prompt](docs/prompts/design-system-prompt.md), [product requirements](PRD.md), and the design interview.
- **Decision:** [One visual system for Admin and Booth Mode](docs/adr/0010-one-design-system-for-admin-and-booth.md).

## 1. Authority and scope

This is the source of truth for the product's visual language, interaction presentation, responsive layouts, component use, and accessibility. [PRD.md](PRD.md) owns product behavior and release scope; [ARCHITECTURE.md](ARCHITECTURE.md) owns system boundaries and technology. If guidance conflicts, reconcile the documents before implementation instead of silently choosing one. Use [GLOSSARY.md](GLOSSARY.md) for product terms.

The first-release surfaces are Admin sign-in, password recovery request and reset, Dashboard, Events, History, Profile, Event setup/detail, the handoff into and out of Booth Mode, and Guest-facing Booth Mode. Booth Mode targets an iPad A16 running Bluefy with an Instax Mini Link 3, subject to the PRD's hardware trial; laptop and phone layouts are responsive previews until their own end-to-end hardware trials pass. Do not imply printing is supported before a device passes its trial. Later-release charts, a grid toggle, galleries, editing, filters, stickers, and digital delivery are outside this system's first-release component set.

The pre-gate Admin foundation in [PRD section 3](PRD.md#3-launch-feasibility-gate) is an implementation phase, not a different visual system or a completed first-release flow. Apply these tokens and component rules to the foundation without presenting gated Booth or printing features as available.

## 2. Design philosophy

1. **Let the occasion supply the energy.** The interface is calm and composed. Guest photos, Event Media, and the 3–2–1 countdown carry the celebratory moment.
2. **Make operational truth visible.** Print Allowance, Film Stock, readiness, and Print Attempt outcomes must be legible and correctly labeled. Never decorate an uncertain result as success.
3. **Keep one identity across two contexts.** Admin and Booth Mode share type, semantic color roles, icons, and controls. Admin favors comparison and scanning; Booth Mode favors one clear action at a time and generous touch space.
4. **Use the physical print as a quiet cue.** Warm paper, ink, and a restrained frame shape may evoke Instax Mini. Never imitate an official Fujifilm interface or add an effect to a Guest photo.
5. **Protect the photo and the person.** The selected photo is the focal point on review. No design pattern may persist, upload, or later display Guest photos contrary to the PRD.

## 3. Foundations

### Color and themes

All components consume semantic tokens. Map the roles below to theme-scoped CSS custom properties such as `--color-canvas` and Tailwind semantic utilities; do not use raw palette values in page components. Light and dark Admin themes use the same roles; Booth Mode uses the dark role set regardless of the Admin's Profile preference. The palette anchors are warm ivory, ink, and restrained teal. Event Media is never a source of token colors.

| Semantic token  | Light     | Dark / Booth | Use                                          |
| --------------- | --------- | ------------ | -------------------------------------------- |
| `canvas`        | `#F6F5F0` | `#101B1B`    | Page background                              |
| `surface`       | `#FFFFFF` | `#1A2929`    | Content surface                              |
| `surface-muted` | `#ECEFEA` | `#223333`    | Subtle grouping, selected rows               |
| `text`          | `#1D2B2A` | `#EFF5F1`    | Primary text                                 |
| `text-muted`    | `#4D605D` | `#B5C7C2`    | Secondary text                               |
| `border`        | `#728780` | `#708A84`    | Essential control boundaries                 |
| `border-subtle` | `#C8D2CE` | `#3C514D`    | Decorative dividers only                     |
| `primary`       | `#1F6663` | `#6FB7AE`    | Primary action, links, active state          |
| `primary-hover` | `#17514F` | `#8ACAC1`    | Hover on primary actions                     |
| `primary-soft`  | `#DAECE8` | `#24413E`    | Selected navigation, quiet emphasis          |
| `on-primary`    | `#FFFFFF` | `#101B1B`    | Text/icon on primary fill                    |
| `focus`         | `#1F6663` | `#8ACAC1`    | Focus ring, with separation from the control |
| `success`       | `#226A4D` | `#88CBA5`    | Confirmed, ready                             |
| `warning`       | `#805300` | `#FFD27D`    | Attention, limited stock, pending            |
| `danger`        | `#A33137` | `#FF999C`    | Error, destructive action                    |
| `danger-hover`  | `#87282D` | `#FFB3B5`    | Hover on filled destructive actions          |
| `on-danger`     | `#FFFFFF` | `#101B1B`    | Text/icon on destructive fill                |
| `info`          | `#245A78` | `#8CC8E8`    | Neutral operational information              |

Tinted status surfaces use the matching status text color:

| Semantic token | Light     | Dark / Booth |
| -------------- | --------- | ------------ |
| `success-soft` | `#E5F2E9` | `#1E3D30`    |
| `warning-soft` | `#FFF1D6` | `#4A3619`    |
| `danger-soft`  | `#FCE9EA` | `#4A292B`    |
| `info-soft`    | `#E5F1F7` | `#1E3A48`    |

Use status colors as text or icon accents on `surface` or their matching soft surface; pair them with a label and, when useful, an icon. Do not put light teal on ivory for small text or dark teal on dark surfaces. Do not use opacity alone to create muted text or disabled states. Primary text on canvas, primary button text, muted text on surface, status text on surface and matching soft surfaces, and essential control borders have been checked against the stated contrast targets. Check essential borders against every rendered control fill, including hover and selected states. Recheck actual Event Media overlays and any new color pairing.

Authenticated Admin pages render the saved Profile light/dark preference. Ordinary Admin sign-in uses the light Admin tokens before that preference is available. The sign-in handoff from a Booth pause uses the dark tokens so the iPad does not abruptly switch visual context; it still uses the shared form and control rules. Booth Mode does not inherit the Admin preference. On the camera and review screens, dark surfaces frame the photo and keep controls predictable under different Event Media.

### Typography

Use **DM Sans** for all UI text, with a system sans-serif fallback. Load one variable family with normal and italic styles only if needed; avoid a second display font. Use tabular numerals for counts, times, inventory, and table columns. Keep labels in sentence case, not all caps except very short metadata eyebrows.

| Role         | Size / line height          | Weight  | Typical use                                            |
| ------------ | --------------------------- | ------- | ------------------------------------------------------ |
| `caption`    | 12 / 16 px                  | 500     | Secondary metadata; never essential Booth instructions |
| `body-sm`    | 14 / 20 px                  | 400–500 | Dense Admin rows and helper text                       |
| `body`       | 16 / 24 px                  | 400–500 | Forms, descriptions, default controls                  |
| `body-lg`    | 18 / 28 px                  | 400–600 | Booth instructions and prominent summaries             |
| `heading-sm` | 22 / 28 px                  | 600     | Section titles                                         |
| `heading`    | 28 / 36 px                  | 600     | Admin page titles                                      |
| `display`    | 36 / 44 px                  | 600–700 | Booth welcome and major state                          |
| `countdown`  | clamp(5rem, 12vw, 9rem) / 1 | 700     | 3–2–1 only                                             |

Scale text with `rem` in implementation; the pixel values above describe the intended default at a 16 px root. Body text must remain readable at 200% browser zoom. Booth instructions should normally use `body-lg` or larger. Avoid truncating Event names, statuses, or error causes when the full text is needed to act.

### Spacing, shape, borders, and elevation

Use a 4 px spacing base: `1=4`, `2=8`, `3=12`, `4=16`, `5=20`, `6=24`, `8=32`, `10=40`, `12=48`, `16=64`, `20=80` px. Do not introduce arbitrary gaps for individual pages. Admin forms and row content typically use 8–16 px internal spacing and 24–32 px between sections; Booth Mode uses 24–48 px between major actions and content.

| Token            | Value                        | Use                                             |
| ---------------- | ---------------------------- | ----------------------------------------------- |
| `radius-sm`      | 6 px                         | Small controls and badges                       |
| `radius-md`      | 8 px                         | Buttons, fields, media frames                   |
| `radius-lg`      | 12 px                        | Cards, dialogs, grouped surfaces                |
| `radius-pill`    | 999 px                       | Booth primary actions when useful, status pills |
| `radius-round`   | 50%                          | Shutter control only                            |
| `border-default` | 1 px solid `border`          | Inputs, tables, cards, separations              |
| `shadow-overlay` | 0 8px 24px rgb(0 0 0 / 0.16) | Menus and dialogs only                          |

Use borders and spacing before shadows. A Booth control may be rounder and larger than its Admin counterpart; the underlying color, focus, disabled, and text rules remain shared. Borders must stay visible in dark mode. Avoid nested bordered cards unless the grouping is necessary to understand the content.

### Layout and responsive behavior

Breakpoints describe layout behavior, not device support: `compact` below 640 CSS px, `medium` 640–1023 px, and `wide` at 1024 px or above. Also test narrow height, 200% zoom, dynamic viewport changes, and iPad safe-area insets. Do not assume the browser grants a fixed fullscreen height; use the usable viewport and safe areas.

| Surface     | Compact                                                           | Medium                                                       | Wide                                                                  |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Admin shell | Menu opens navigation; one content column; 16 px page inset       | Collapsible navigation rail; one or two columns; 24 px inset | 240 px sidebar; max 1280 px content; 32 px inset                      |
| Admin data  | Rows become labeled summaries; preserve key state and next action | Tables may scroll within their region if labels remain clear | Tables for Events, History, and activity; align numeric columns right |
| Admin forms | One column, full-width actions                                    | Group related fields in two columns where helpful            | Two-column form groups, never a wall of fields                        |
| Booth Mode  | Responsive preview, not validated for printing                    | Canonical portrait iPad layout                               | Adaptive preview or landscape layout, not a supported printing claim  |

The canonical Booth layout is portrait on the iPad A16. Put the preview at the center, preserve the portrait Instax Mini printable crop, and keep main controls in a reachable lower region without covering the crop. The Start, Take Photo, Retake, and Print actions remain visible without horizontal scrolling. In landscape, use side space for instructions and actions while retaining the portrait preview. Never stretch or distort the camera image or Event background. The exact crop and browser chrome behavior must be validated on the target hardware.

### Motion

Use 120 ms for quick hover/press feedback, 180 ms for control and dialog transitions, and at most 240 ms for page-level entrance. Use opacity or small position changes rather than zooming cards or bouncing controls. The 3–2–1 countdown is the intentional high-energy exception. Keep it legible and deterministic; do not rely on animation to communicate the numbers. When reduced motion is requested, remove decorative transitions and use a static Event image in place of an autoplay montage. Printing and recovery states must stay understandable without motion.

## 4. Component system

### Architecture and variants

Implement with Tailwind CSS 4 and customized shadcn/ui primitives where they fit; use Lucide for interface icons. The design system's semantic tokens and behavior override library defaults. Keep shared primitives separate from Admin composites and Booth composites. Do not install or expose an entire library of unused components.

| Layer             | Components needed for first release                                                                                                                                                                                         | Variants and states                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Shared primitives | Button, IconButton, TextField, Textarea, Select, DateTimeField, Checkbox, Badge, Alert, Dialog, Menu, ProgressStatus, Spinner, Skeleton                                                                                     | Default, hover, active, focus-visible, disabled, loading, invalid where relevant |
| Admin composites  | Sign-in form, recovery request and reset forms, AppShell, navigation, page header, summary card, data table, filter control, empty state, form section, media upload/preview, readiness checklist, operational status panel | Light/dark; compact/medium/wide; pending/ready/problem                           |
| Booth composites  | Entry/paused handoff, Welcome, media backdrop, camera preview/crop guide, shutter, countdown, review actions, printing phase, timeout warning, help state                                                                   | Portrait/landscape; idle/capturing/reviewing/printing/paused                     |

Buttons have `primary`, `secondary`, `quiet`, and `destructive` treatments. Use one primary action per decision area. `Print` is primary on review; `Retake` is secondary. Destructive actions are never only an icon. Admin default controls have at least a 40 px visual height and 44 px touch target when used on touch devices; Booth controls have at least 44 × 44 CSS px targets, major actions at least 64 × 64 CSS px, and the shutter at least 88 × 88 CSS px. Provide visible spacing between Booth controls. Do not shrink tap targets to fit a narrow viewport.

| Control state             | Required treatment                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary default / hover   | `primary` fill with `on-primary` text; use `primary-hover` fill on hover and press                                                              |
| Secondary default / hover | `surface` with `text` and `border`; retain `border` when using `surface-muted` on hover and press                                               |
| Quiet default / hover     | No resting fill, `text` label; use `surface-muted` on hover and press                                                                           |
| Destructive               | Use `danger` text on a quiet control in context; use `danger` fill with `on-danger` text in the final review dialog and `danger-hover` on hover |
| Selected                  | `primary-soft` background with `primary` text and a visible selection marker, not color alone                                                   |
| Focus-visible             | `focus` ring, 2 px wide, separated 2 px from the control                                                                                        |
| Disabled                  | `surface-muted` with `text-muted`, no action; explain the blocker nearby when needed                                                            |
| Loading                   | Keep the action label, add a spinner or status text, and block duplicate submission                                                             |
| Invalid input             | `danger` border/icon, visible error text, and `aria-invalid`; retain the entered value                                                          |

Use an explicit 2 px focus ring with a 2 px separation where possible; focus must remain visible in light, dark, and media-backed contexts. Disabled and loading controls keep a readable label and explain the blocker nearby when the reason is not obvious. Never use a toast as the sole way to report a failed print, stock problem, or form error.

Forms use visible labels, concise helper text, inline validation, and an error summary when several fields fail. Preserve entered values after validation. Date and time fields show the venue time zone; table dates use venue-local time with an explicit zone where ambiguity matters. Tables have named columns, a clear sort/filter state, keyboard-reachable controls, and a compact labeled-summary pattern rather than clipped cells on phones. The 7-day/30-day activity filter is a simple two-option control; do not introduce the later-release charts.

Dialogs are reserved for consequential Admin choices. Show the exact effect before ending Booth Mode, Client Redaction, Film Stock reconciliation, or resolution of an Uncertain Print. Use action labels that name the result, not a generic “Confirm.” Starting Booth Mode uses its readiness checklist instead of a redundant confirmation. Success feedback appears in context after the state has actually committed.

### Admin operational panel

Use the same operational panel in Event setup and Live Event management, adapting its readiness and actions to the Event state. Place it before the Booth controls so the Admin sees blockers before starting or resuming. Group the figures by resource, with two labeled values in each group:

| Resource                          | Available                                                                                       | Reserved                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Print Allowance · this Event      | Original Print Allowance + Additional Prints − Confirmed Prints − unresolved Print Reservations | Unresolved Print Reservations                               |
| Film Stock · shared across Events | Current Film Stock balance − unresolved Film Reservations                                       | Unresolved Film Reservations, including Test Print attempts |

Label every number with **prints** or **sheets**, use tabular numerals, and preserve all four labels on compact screens by stacking the groups. Show **0 reserved** explicitly when there are no holds. Keep available and reserved visually distinct; a reservation is a hold, not a Confirmed Print or consumed sheet. Show original allowance and Additional Prints as secondary context, and label Film Stock as shared across Events. Check readiness against the available values, not available plus reserved. Update the figures only when the recorded state changes; a pending command is not success.

Show recovery immediately below the affected figures, with the status, why Booth readiness is blocked, and one next action for each issue:

| Issue                               | Panel presentation and next action                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uncertain Print                     | Show **Uncertain Print — Booth unavailable** and the applicable held print/sheet counts. **Inspect and resolve print** opens the existing Admin review flow for that attempt; the Admin records the observed outcome before Booth Mode can start or resume. Never offer automatic resend or label the hold as consumed.                                                       |
| Printer disconnected or reconnected | Show connection status and **Reconnect printer** guidance for the Admin. Once connected, show **Run Test Print**. After detected film ejection, ask the Admin to confirm that the test sheet is usable; keep readiness blocked until that confirmation. Ejection alone does not mark the booth ready. A short Admin pause with no reconnection does not require another test. |

If both issues exist, show both rows and their actions; do not imply that fixing one clears the other. Resolve an Uncertain Print through the consequential review dialog, and show the updated counts and readiness only after the result commits. Keep the printer's technical diagnostics in the Admin panel and out of Guest messages.

### Sign-in and Booth handoff

Ordinary Admin sign-in at `/sign-in` has a restrained, single-column layout with a clear title, labeled email and password fields, one primary **Sign in** action, and a **Forgot password?** link. Center a form no wider than 480 px in the usable viewport, with 16–32 px side insets and room for errors, iPad safe areas, and 200% zoom. Use the shared Admin typography, inputs, focus ring, and light tokens; do not show the authenticated AppShell or public signup.

The Booth iPad's paused handoff uses a quiet dark surface with **Booth paused**, a brief instruction for the Admin, and a prominent **Sign in** action leading to the same email/password form in the dark tokens. Keep the message and form in the same readable column, without Event Media behind them. The **Forgot password?** path is available without exposing Event details. Before authentication, show no Event name or details, printer diagnostics, reservation outcomes, or Booth recovery controls. The handoff belongs to the protected Admin flow. A failed or expired Booth Access Grant uses this generic paused presentation; do not imply that the Event ended or that Booth Mode can resume without signing in.

Treat each transition as a visible state, with one next action:

| Transition                           | Presentation                                                                                         | Next step                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin starts Booth Mode              | Brief **Preparing Booth Mode** status after the readiness action; block repeated starts              | Reveal Guest welcome only when iPad Admin sign-out and Booth access have completed                                                                     |
| Entry handoff fails                  | Calm paused/error state without Event details or technical diagnostics                               | **Sign in** for Admin recovery; do not show a Guest welcome with unusable access                                                                       |
| Admin requests pause before printing | Finish the pause, discard the unprinted photo as specified by the PRD, then show **Booth paused**    | **Sign in**; retain no Guest photo in the handoff                                                                                                      |
| Admin requests pause during printing | Keep the truthful printing phase visible while the Print Attempt finishes and its result is recorded | Then show **Booth paused** and **Sign in**; if interrupted, give a generic help message before sign-in and show Uncertain Print details only afterward |
| Admin signs in from a pause          | Show the Live Event's management page with its actual pause, readiness, and unresolved-print state   | Admin chooses **Resume Booth Mode** explicitly; sign-in alone never restarts Guest access                                                              |

The sign-in form covers empty or invalid fields, incorrect credentials, submission in progress, connection failure, and expired Admin session. Put a persistent error next to the affected field or in a form-level alert as appropriate; retain the email, let the Admin correct the password, and keep the action available for a retry once submission ends. Use a neutral error for incorrect credentials without revealing whether an email exists. Do not replace these states with a disappearing toast. Ordinary sign-in enters the Admin experience; the pause return opens the Live Event management page after authentication.

The recovery request at `/forgot-password` uses the same compact form width and visible-label rules. Show one email field, **Send recovery link**, and a route back to sign-in. Its confirmation is neutral for known and unknown addresses; a delivery or connection failure offers retry without exposing account existence. The reset page at `/reset-password` uses labeled new-password and confirmation fields. Show an actionable error for invalid or expired links, with **Request another link**; show a clear success state that leads to fresh sign-in. Recovery started from a paused booth keeps the quiet dark presentation and hides Event details throughout. Neither recovery page shows the authenticated AppShell. Sign-out from `/profile` is a clearly labeled action followed by `/sign-in`, with visible failure feedback if the current device remains signed in.

### Booth interaction states

| State                       | What the Guest sees                                                                 | Required interaction rule                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome                     | Event image or montage, one-print/privacy copy, prominent Start                     | Start stays available while montage plays; no Guest account or Admin navigation                                                                                                       |
| Preview                     | Mirrored front-camera view, portrait crop guide, Take Photo                         | Event image may appear around the preview, never inside the captured image                                                                                                            |
| Countdown                   | Large 3, 2, 1 over the preview                                                      | Lock duplicate shutter presses; numeric text remains visible without motion                                                                                                           |
| Review                      | Unmirrored final crop, Retake, primary Print                                        | The review orientation and crop match the physical print; photo stays in browser memory only                                                                                          |
| Printing                    | “Preparing,” “Sending,” then “Waiting for film to eject” as actual steps permit     | Disable duplicate Print; show no invented percentage; do not claim success before film ejection                                                                                       |
| Confirmed                   | Brief clear completion, then welcome                                                | Discard photo; Guest does not wait for film development                                                                                                                               |
| Exhausted supplies          | “Printing is unavailable right now. Please ask the Admin for help.”                 | Stop new Guest Sessions; offer no Start or Print action until the Admin restores availability                                                                                         |
| Connection lost before send | “Connection lost. Your photo is still here. Please wait or ask the Admin for help.” | Disable Print while offline; keep the selected photo in browser memory; return to review with Print available after service and availability checks recover; never send automatically |
| Clear print rejection       | “Your photo could not print. Please ask the Admin for help.”                        | Offer no Guest retry; the Admin may retry the selected photo after recovery                                                                                                           |
| Uncertain print outcome     | “We could not confirm your print. Please ask the Admin for help.”                   | Pause the booth; offer no retry or dismiss action; keep outcome details and resolution behind Admin sign-in                                                                           |
| Device disconnected         | “The booth needs help. Please ask the Admin.”                                       | Pause the booth; keep pairing, permission prompts, and recovery behind Admin sign-in                                                                                                  |
| Timeout warning             | Remaining-time warning and Continue                                                 | Appears near the end of 90 seconds; Continue resets inactivity; no timeout during countdown or print                                                                                  |

The live preview is mirrored for positioning. The review image is unmirrored and is the source for the print, so Guests see the final orientation before printing. Retake makes a new Capture; it does not use Print Allowance. Show the pre-send connection-loss message only while the selected photo is still in browser memory; after a reload, never claim the photo is still there. Suspend the review inactivity timeout during that connection hold, then resume it when review returns. An interrupted or Uncertain Print stays visibly unresolved until Admin inspection; never silently resend it. A discreet Admin pause affordance follows the PRD's long-press flow and must have a keyboard/assistive-input equivalent that still leads to Admin sign-in. Do not expose Admin details to the Guest surface.

### Status, empty states, and feedback

Use the exact domain labels: Draft, Live, Completed, Cancelled, Print Allowance, Film Stock, Confirmed Print, Wasted Film, Uncertain Print, and Test Print. A status badge combines word and color. “Ready” is calculated readiness, not an Event state. Avoid calling the Admin an Operator or labeling Additional Prints as “extra films.”

Admin empty states identify what is absent and one relevant action: “No Events scheduled this month” with “Create Event,” “No activity in the last 7 days” with a filter option, or “No completed Events yet” without a false call to action. Operational failures state what happened, what is held or unavailable, and the Admin's next step. Guest failures use the distinct messages and actions in the Booth state table; never collapse a confirmed pre-send failure into an uncertain outcome. Use simple icons only where they improve scanning; avoid large stock illustrations, confetti, or success graphics for mere command submission.

## 5. Iconography and imagery

Use Lucide outline icons at 16 px in dense Admin rows, 20 px in standard controls, and 24–32 px in Booth messages. Keep stroke weight consistent and let the label carry meaning. Icon-only controls need an accessible name and visible tooltip on pointer devices. Never rely on icon shape or color alone for event, printer, or stock status.

The default welcome uses a restrained white photo-frame shape on a dark or ivory field. No decorative stickers, scattered mock prints, stock portraits, or generic gradients. The photo-frame motif is interface decoration only; it does not alter the Guest image. Event Media personalizes the welcome and the still background sits around the camera preview. If both assets exist, the montage has priority on welcome; the still image is the fallback and remains available around the preview. If neither loads, show the default welcome. Keep Start and privacy copy on an opaque or sufficiently darkened surface over media. Provide a pause control for moving montage content; reduced-motion users see the still image or default. Crop background media with `cover` behavior and keep the central safe region clear of critical text. Never put text directly on an untested uploaded image.

## 6. Accessibility contract

Target [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/) across Admin and Booth Mode. Verify at least 4.5:1 for normal text, 3:1 for large text and essential non-text boundaries, visible focus, logical heading order, keyboard operation, screen-reader names, and 200% text scaling. WCAG's [24 px target-size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) is a floor, not the Booth target; follow the larger sizes above. Maintain error and status text independent of color, motion, sound, or a fleeting toast.

The montage is silent by product rule. Users must be able to pause moving content; Start is always available. The countdown shows numerals as text; printing progress and successful ejection are announced as polite status updates, while an Uncertain Print or required Admin intervention is announced assertively without repeated announcements. Announce sign-in, recovery, and handoff errors as actionable status without repeating them on every keystroke. Move focus to the new heading or first relevant form error when an authentication or handoff view replaces the current view; preserve keyboard access to form fields and the primary action. Avoid automatic focus jumps except when a dialog opens or a route/state change needs a new focus anchor. Keep Guest actions operable without a complex gesture; the Admin long press must have an accessible equivalent without granting Admin access.

Validate the actual Event image and montage overlays, both themes, high zoom, iPad safe areas, portrait and landscape, keyboard input, screen reader labels, reduced motion, sign-in and password-recovery success/error states, handoff error states, camera permission failure, and printer disconnect. A visual pass alone is insufficient for the hardware feasibility gate in the PRD.

## 7. Page recipes

| Page or flow           | Required visual hierarchy                                                                                                | Primary action and important states                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Admin sign-in          | Title and brief purpose → email/password form → persistent error area                                                    | Sign in; invalid fields, incorrect credentials, submitting, connection failure, expired session; no public signup             |
| Recovery request       | Title and brief purpose → email form → neutral check-your-email confirmation                                             | Send recovery link; invalid email, submission, delivery/connection failure, return to sign-in                                 |
| Password reset         | Title → new-password and confirmation fields → persistent error or success state                                         | Set new password; invalid/expired link, field errors, submitting, request another link, fresh sign-in                         |
| Dashboard              | Page title → this-month/upcoming/next-Event summaries → activity table                                                   | Event links; 7/30-day filter, pagination, empty activity                                                                      |
| Events                 | Next Event and Live status → Draft/upcoming list → row details                                                           | Create Event; overdue Draft and zero-results states                                                                           |
| New / specific Event   | Identity and schedule → Client and booking details → media → available/reserved resources and readiness → Booth controls | Save Draft or start only when ready; show shared Film Stock, Uncertain Print resolution, reconnection, and Test Print actions |
| History                | Summary totals → Completed/Cancelled rows → Event details                                                                | Client Redaction review; retained/redacted Client states                                                                      |
| Profile                | Admin identity → phone → theme → password → Sign out                                                                     | Save and authenticated password feedback; current-device sign-out and failure feedback                                        |
| Booth entry handoff    | Preparing Booth Mode status → Guest welcome only after access is active                                                  | Prevent repeat start; failed handoff leads to paused sign-in recovery                                                         |
| Booth pause handoff    | Dark **Booth paused** message → Sign in → shared email/password form                                                     | No Event details before auth; wait for print result before switching; generic help if interrupted                             |
| Signed-in pause return | Live Event title/state → readiness and unresolved outcomes → Booth controls                                              | Explicit Resume Booth Mode; no automatic resume; resolve blockers first                                                       |
| Booth welcome          | Event Media or default frame → one-print/privacy message → Start                                                         | Loading/fallback media, exhausted supplies, internet block                                                                    |
| Booth capture/review   | Camera crop → shutter/countdown → final image → Retake/Print                                                             | Camera failure, timeout warning, pre-send connection loss and return to review                                                |
| Booth print            | Current phase → plain next step → confirmed or distinct recovery message                                                 | Prevent duplicate send; clear rejection and uncertain outcome use separate actions                                            |

Do not create dashboard charts, revenue panels, galleries, or photo-editing controls for first release. The Admin can manage a Live Event on another device, but the Booth iPad shows only the Guest surface while its Booth Access Grant is active.

## 8. Decision rules for agents

1. Read the PRD, glossary, and this document before creating a UI page. Check the relevant ADR when changing an established boundary.
2. Map every visible value to a semantic token. Add a token only if an existing role cannot express the intent across light, dark, and Booth contexts.
3. Reuse a component when behavior and accessibility match. Add a variant only for a real product state or input mode; do not add variants for a one-off visual preference.
4. Start with the canonical portrait Booth layout or wide Admin layout, then verify the compact/medium/wide behavior in the table above. Treat other Booth devices as previews until trialed.
5. For each component, specify default, hover, pressed, focus-visible, disabled, loading, error, and success states where meaningful. Include an empty state for data views and a recovery state for physical-device flows.
6. Keep the Guest photo in ephemeral browser memory. Do not use it as a page background, thumbnail, history record, upload, or telemetry payload.
7. Use the exact domain language. A Confirmed Print requires observed film ejection; command submission alone is not success.
8. Before shipping a page, verify contrast, keyboard and touch operation, media overlays, responsive layout, and the states relevant to that page.

## 9. Anti-patterns and consistency review

Avoid generic gradients, excessive rounded cards, heavy shadows, decorative dashboards, celebration animations on routine Admin actions, unexplained icon-only buttons, color-only status, unreadable text on Event Media, fake print percentages, automatic retries of uncertain prints, and any UI that implies Guest photos are retained. Do not use a full-screen error with technical details for Guests or bury Admin recovery behind a disappearing toast.

Before finalizing a UI change, check: semantic colors in both themes; coherent type hierarchy and tabular counts; 4 px spacing rhythm with deliberate Booth exceptions; justified component variants; portrait/landscape and compact/wide rules; all relevant interaction states; contrast and target sizes; clear empty/error/recovery copy; no conflict with PRD or architecture; and whether a new agent can build the page from this guide plus the PRD without inventing a visual rule. Reconcile any gap in this document and its affected source documents.
