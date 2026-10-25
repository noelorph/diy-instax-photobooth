# DIY Instax Photo Booth — Design System

- **Status:** Agreed presentation for the 2026-10-21 target. Version-2 contracts and handlers exist; Admin/Booth UI integration remains #10 work. [Dated #9 software acceptance evidence](docs/implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25) records passing software checks and independent evidence review; GitHub #9 is closed as completed. #10 plan approval/publication remains pending. Archived image proposals do not override these tokens.
- **Date:** 2026-10-11; typography revised 2026-10-15; behavior aligned 2026-10-21
- **Source:** Design prompt (Git checkpoint `1de2272`, `docs/prompts/design-system-prompt.md`), [product requirements](PRD.md), and the design interview.
- **Decision:** [One visual system for Admin and Booth Mode](docs/adr/0010-one-design-system-for-admin-and-booth.md).

## 1. Authority and scope

This is the source of truth for the product's visual language, interaction presentation, responsive layouts, component use, and accessibility. [PRD.md](PRD.md) owns product behavior and release scope; [ARCHITECTURE.md](ARCHITECTURE.md) owns system boundaries and technology. If guidance conflicts, reconcile the documents before implementation instead of silently choosing one. Use [GLOSSARY.md](GLOSSARY.md) for product terms.

The first-release surfaces are Admin sign-in, password recovery request and reset, Dashboard, Events, History, Profile, Event setup/detail, the handoff into and out of Booth Mode, and Guest-facing Booth Mode. Booth Mode targets an iPad A16 running Bluefy with an Instax Mini Link 3, subject to the PRD's iPad launch trial. The owner's iPhone 15 Plus may run a compact Booth Mode flow for its qualification trial and subsequent development testing; it is not a supported first-release booth. Other phone and laptop layouts remain responsive previews. Do not imply launch printing support before the iPad trial passes. Later-release charts, a grid toggle, galleries, editing, filters, stickers, and digital delivery are outside this system's first-release component set.

Integrated Admin and Booth interfaces may use a simulated printer. The [replacement contract](docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) requires qualified automatic normal full-ejection completion and the actual iPad trial before real Booth release. The qualification harness remains supervised historical tooling, not the product UI.

## 2. Design philosophy

1. **Let the occasion supply the energy.** The interface is calm and composed. Guest photos, Event Media, and the 3–2–1 countdown carry the celebratory moment.
2. **Make operational truth visible.** Booked packages, available prints, readiness, and Print Attempt outcomes must be legible and correctly labeled. Never decorate an uncertain result as success.
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
| `warning`       | `#805300` | `#FFD27D`    | Attention, pending, attention needed         |
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

Authenticated Admin pages render the saved Profile light/dark preference. Ordinary Admin sign-in uses the light Admin tokens before that preference is available. Finished Booth and exceptional access-loss sign-in use the dark tokens and shared form rules. A normal pause stays on the Booth surface without sign-in. Booth Mode does not inherit the Admin preference. On the camera and review screens, dark surfaces frame the photo and keep controls predictable under different Event Media.

### Typography

Use **Geist Sans Variable** for all Admin and Booth UI text, with a system sans-serif fallback. Load it from locally served assets in the root layout; add italic styles only if needed and avoid a second display or monospace family. The compact Admin rhythm follows the [CodeRabbit app typography reference](docs/adr/0019-use-geist-typography-across-admin-and-booth.md), while Booth instructions and countdown retain their larger, accessible roles. Use tabular numerals for counts, times, and table columns. Keep labels in sentence case, not all caps except very short metadata eyebrows.

| Role         | Size / line height          | Weight  | Typical use                                            |
| ------------ | --------------------------- | ------- | ------------------------------------------------------ |
| `caption`    | 12 / 16 px                  | 500     | Secondary metadata; never essential Booth instructions |
| `body-sm`    | 14 / 18 px                  | 400–500 | Dense Admin rows and helper text                       |
| `body`       | 16 / 22 px                  | 400–500 | Forms, descriptions, default controls                  |
| `body-lg`    | 20 / 28 px                  | 400–600 | Booth instructions and prominent summaries             |
| `heading-sm` | 20 / 28 px                  | 600     | Section titles                                         |
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

| Surface     | Compact                                                                  | Medium                                                       | Wide                                                                  |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Admin shell | Menu opens navigation; one content column; 16 px page inset              | Collapsible navigation rail; one or two columns; 24 px inset | 240 px sidebar; max 1280 px content; 32 px inset                      |
| Admin data  | Rows become labeled summaries; preserve key state and next action        | Tables may scroll within their region if labels remain clear | Tables for Events, History, and activity; align numeric columns right |
| Admin forms | One column, full-width actions                                           | Group related fields in two columns where helpful            | Two-column form groups, never a wall of fields                        |
| Booth Mode  | Development trial on the owner's iPhone 15 Plus; no launch support claim | Canonical portrait iPad layout                               | Adaptive preview or landscape layout, not a supported printing claim  |

The canonical Booth layout is portrait on the iPad A16. Put the preview at the center, preserve the portrait Instax Mini printable crop, and keep main controls in a reachable lower region without covering the crop. The Start, Take Photo, Retake, and Print actions remain visible without horizontal scrolling. In landscape, use side space for instructions and actions while retaining the portrait preview. Never stretch or distort the camera image or Event background. The exact crop and browser chrome behavior must be validated on the target hardware.

### Motion

Use 120 ms for quick hover/press feedback, 180 ms for control and dialog transitions, and at most 240 ms for page-level entrance. Use opacity or small position changes rather than zooming cards or bouncing controls. The 3–2–1 countdown is the intentional high-energy exception. Keep it legible and deterministic; do not rely on animation to communicate the numbers. When reduced motion is requested, remove decorative transitions and use a static Event image in place of an autoplay montage. Printing and recovery states must stay understandable without motion.

## 4. Component system

### Architecture and variants

Implement with Tailwind CSS 4 and customized shadcn/ui primitives where they fit; use Lucide for interface icons. The design system's semantic tokens and behavior override library defaults. Keep shared primitives separate from Admin composites and Booth composites. Do not install or expose an entire library of unused components.

Project-wide reusable components live at `src/components/`: `ui/` holds customized shadcn/ui primitives, `shared/` holds product-neutral compositions, and `layout/` holds reusable page shells. Feature state and page-specific composites remain with their feature. Add only primitives used by an implemented flow; see [ADR-0020](docs/adr/0020-place-shared-ui-components-under-src.md) and the Admin UI refresh spec (Git checkpoint `1de2272`, `docs/superpowers/specs/2026-10-15-admin-ui-refresh-design.md`).

| Layer             | Components needed for first release                                                                                                                                                                                         | Variants and states                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Shared primitives | Button, IconButton, TextField, Textarea, Select, DateTimeField, Checkbox, Badge, Alert, Dialog, Menu, ProgressStatus, Spinner, Skeleton                                                                                     | Default, hover, active, focus-visible, disabled, loading, invalid where relevant |
| Admin composites  | Sign-in form, recovery request and reset forms, AppShell, navigation, page header, summary card, data table, filter control, empty state, form section, media upload/preview, readiness checklist, operational status panel | Light/dark; compact/medium/wide; pending/ready/problem                           |
| Booth composites  | Entry, paused and finished states, Welcome, media backdrop, camera preview/crop guide, shutter, countdown, review actions, printing phase, timeout warning, help state                                                      | Portrait/landscape; idle/capturing/reviewing/printing/paused                     |

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

Use an explicit 2 px focus ring with a 2 px separation where possible; focus must remain visible in light, dark, and media-backed contexts. Disabled and loading controls keep a readable label and explain the blocker nearby when the reason is not obvious. Never use a toast as the sole way to report a failed print, printer readiness problem, or form error.

Forms use visible labels, concise helper text, inline validation, and an error summary when several fields fail. Preserve entered values after validation. Date and time fields show the venue time zone; table dates use venue-local time with an explicit zone where ambiguity matters. Tables have named columns, a clear sort/filter state, keyboard-reachable controls, and a compact labeled-summary pattern rather than clipped cells on phones. The 7-day/30-day activity filter is a simple two-option control; do not introduce the later-release charts.

For Draft Event schedule errors, identify the field and explain when a local time does not exist or occurs twice in the chosen venue time zone; ask for an unambiguous time. If another device saved the Draft first, keep the Admin's entered values visible while offering a clear path to reload the latest record. A Draft with zero Film Packages remains a Draft and must not show a ready-to-start state. Derive ten prints per package; there is no independent count field. See [ADR-0025](docs/adr/0025-package-accounting-and-booth-recovery.md).

Dialogs are reserved for consequential Admin choices. Show the exact effect before Finish Booth Mode, Complete Event, Draft deletion, package addition or exceptional Printed / Not printed resolution. Use action labels that name the result, not a generic “Confirm.” Starting Booth Mode uses its readiness checklist instead of a redundant confirmation. Success feedback appears in context after the state has actually committed.

### Admin operational panel

Show original Film Packages, Additional Film Packages, total booked prints, Confirmed Prints, pending count and prints available. Label counts clearly and retain the labels on compact phone layouts. Total is ten times all booked packages; available subtracts confirmed plus unresolved attempts. A hold is not a successful print. Show **0 pending** explicitly; update only after committed state.

Show independent readiness blockers below these numbers. Use distinct rows for printer connection, camera, connectivity, film reload needed, pending outcome and explicit pause. Clearing one must not visually clear the others. Loading film and buying packages must have separate labeled actions. Do not show a physical inventory balance or infer ten loaded sheets from the printer count.

| Phone Admin action    | Presentation                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Add Film Packages     | Positive whole package count, derived +10 each, Client-request note; preserve original operation key/payload after ambiguous response |
| Confirm film loaded   | Shown for the current Event reload request; explain physical loading changes readiness, not booked prints                             |
| Printed / Not printed | Only for an unknown outcome; required inspection reason and explanation that the old job must not later eject; no resend action       |
| Pause Booth           | Show durable Paused status immediately; an in-flight print still needs its outcome                                                    |
| Resume Booth          | Explain blockers; only enabled when all readiness passes and no pending attempt                                                       |
| Finish Booth Mode     | Show Finishing until old work settles, then Finished; separate from Complete Event                                                    |
| Complete Event        | Only after Booth run finished; explain retention in History                                                                           |

Setup includes the sentence **“Always test the printer before starting Booth Mode.”** There is no test action, output-inspection prerequisite or test result. Physical readiness checks still apply.

### Sign-in and Booth handoff

Ordinary `/sign-in` is a compact shared form, maximum 480 px wide, with email/password, Sign in, Forgot password, persistent field/form errors, no signup and no authenticated navigation. Use light Admin tokens. Preserve entered email after error; incorrect-credential copy does not disclose account existence. Ordinary success opens Dashboard.

Initial Booth setup shows Preparing Booth Mode while the local Admin signs out and the device handoff activates. Welcome is visible only with usable access and readiness. Failed handoff or genuinely lost/expired access shows neutral setup recovery and Sign in, without Event/contact details. Finished Booth displays **Booth Mode finished** with Sign in. These exceptional/finished screens use dark tokens. Authentication alone never resumes or starts guest work.

A normal Admin pause stays at `/booth` with **Booth paused** and no sign-in action. Resume occurs on the phone. During pending printing retain truthful printing/recovery status beneath the pause/finishing message. Faults keep the iPad on the Booth surface with the limited recovery actions below; Admin diagnostics and accounting controls remain on the authenticated phone.

`/forgot-password` has one email field, Send recovery link, neutral confirmation and retry, and return to sign-in. `/reset-password` has new/confirmation password fields and invalid/expired-link recovery. Show success only after password save and global Admin-session revocation; unresolved revocation stays visibly incomplete. Only a confirmed-active recovery session can retry with another different password; otherwise offer Request another link. Neither page reveals Event details. Profile Sign out reports current-device failure rather than falsely implying it succeeded.

### Booth interaction states

Exact copy and transitions follow the [PRD recovery table](PRD.md#recovery) and the [contract failure matrix](docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md#4-failure-and-recovery-contract).

| State                                | Presentation and controls                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome                              | Montage/image/default, one-print/privacy copy, Start; pause-video control and reduced-motion fallback                                  |
| Preview                              | Mirrored front camera, portrait crop, Take Photo; background outside image                                                             |
| Countdown                            | Visible 3–2–1; lock duplicate shutter actions                                                                                          |
| Review                               | Unmirrored final print crop, Retake / Print; image only in memory                                                                      |
| Printing                             | Honest preparing/sending/waiting phases, no fake percentage or success on acknowledgement                                              |
| Print complete                       | After full ejection and recorded outcome; show 3 seconds, discard photo, then welcome if ready                                         |
| Bluetooth disconnected               | Bluetooth disconnected. Please inform the Admin. / **Connect to Instax** only                                                          |
| Camera disconnected                  | Camera disconnected. Please inform the Admin. / **Enable Camera**; if printing, resolve current attempt before showing camera recovery |
| Detected offline                     | Wi-Fi disconnected. Please inform the Admin. / no print retry action                                                                   |
| Service unavailable                  | Connection unavailable. Please inform the Admin. / no false Wi-Fi diagnosis                                                            |
| Empty printer                        | Printer is out of film. Please inform the Admin. / phone physical reload confirmation                                                  |
| Unknown outcome / unclassified fault | Booth is temporarily unavailable. Please inform the Admin. / no Guest dismiss or resend                                                |
| Booked prints exhausted              | All booked prints have been used. Please ask the Admin to add another Film Package.                                                    |
| Paused                               | Booth paused; phone Resume required                                                                                                    |
| Finishing / Finished                 | Finishing Booth Mode while pending; then Booth Mode finished with Sign in                                                              |
| Access actually lost                 | Booth access ended. Please inform the Admin. / Sign in for exceptional local setup                                                     |
| Inactivity                           | Warning at 75 seconds with Continue; discard at 90 seconds on preview/review; no timer during countdown/print                          |

On fault, end the old guest interaction and discard photo; return to a new welcome only after all guards pass. Never tell the Guest the photo remains for retry. A possibly delivered attempt stays pending independently. Overlapping faults retain all blockers; show one principal status and any necessary connection/camera recovery action. Recovery never overrides an Admin pause. Repeated chooser cancellation/permission denial leaves the same message/action, not a success state. There is no guest-accessible Admin pause/exit gesture.

### Status, empty states, and feedback

Use the current [glossary](GLOSSARY.md): Draft, Live, Completed, Cancelled, Film Package, Additional Film Package, Confirmed Print, pending print, Film reload needed. Ready is calculated, not an Event state. Pair badges with text; distinguish packages, prints and pending attempts rather than mixing units. Avoid “Operator” and vague “extra films.”

Empty Admin states name what is absent and the relevant action: No Events scheduled this month / Create Event; No activity in the last 7 days / filter; No completed Events yet. Operational failures persist with the next useful action; a toast alone is insufficient. Use simple icons for scanning, with no decorative success on mere submission.

The monthly Events card includes Draft, Live and Completed by venue-local scheduled start and excludes Cancelled/deleted Events; it is not limited to future work. Four in-month Events with one Cancelled display 3. Apply the [PRD definition](PRD.md#dashboard--dashboard) and [ADR-0028](docs/adr/0028-define-monthly-event-count.md); no additional card is introduced.

## 5. Iconography and imagery

Use Lucide outline icons at 16 px in dense Admin rows, 20 px in standard controls, and 24–32 px in Booth messages. Keep stroke weight consistent and let the label carry meaning. Icon-only controls need an accessible name and visible tooltip on pointer devices. Never rely on icon shape or color alone for event, printer, or package status.

The default welcome uses a restrained white photo-frame shape on a dark or ivory field. No decorative stickers, scattered mock prints, stock portraits, or generic gradients. The photo-frame motif is interface decoration only; it does not alter the Guest image. Event Media personalizes the welcome and the still background sits around the camera preview. Show upload/replace/remove controls only for Draft Events, with approved format/size/duration guidance and persistent validation/cleanup feedback. A failed change preserves the current preview; Live and terminal media is read-only. The trusted boundary enforces [ADR-0027](docs/adr/0027-draft-only-event-media.md). If both assets exist, the montage has priority on welcome; the still image is the fallback and remains available around the preview. If neither loads, show the default welcome. Keep Start and privacy copy on an opaque or sufficiently darkened surface over media. Provide a pause control for moving montage content; reduced-motion users see the still image or default. Crop background media with `cover` behavior and keep the central safe region clear of critical text. Never put text directly on an untested uploaded image.

## 6. Accessibility contract

Target [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/) across Admin and Booth Mode. Verify at least 4.5:1 for normal text, 3:1 for large text and essential non-text boundaries, visible focus, logical heading order, keyboard operation, screen-reader names, and 200% text scaling. WCAG's [24 px target-size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) is a floor, not the Booth target; follow the larger sizes above. Maintain error and status text independent of color, motion, sound, or a fleeting toast.

The montage is silent by product rule. Users must be able to pause moving content; Start is always available. The countdown shows numerals as text; printing progress and successful ejection are announced as polite status updates, while a pending print or required Admin intervention is announced assertively without repeated announcements. Announce sign-in, recovery, and handoff errors as actionable status without repeating them on every keystroke. Move focus to the new heading or first relevant form error when an authentication or handoff view replaces the current view; preserve keyboard access to form fields and the primary action. Avoid automatic focus jumps except when a dialog opens or a route/state change needs a new focus anchor. Keep Guest and local recovery actions operable by keyboard and assistive input as well as touch. Phone Admin controls must remain accessible; no long-press-only operation is required.

Validate the actual Event image and montage overlays, both themes, high zoom, iPad safe areas, portrait and landscape, keyboard input, screen reader labels, reduced motion, sign-in and password-recovery success/error states, handoff error states, camera permission failure, and printer disconnect. A visual pass alone is insufficient for the hardware feasibility gate in the PRD.

## 7. Page recipes

| Page                       | Hierarchy and primary actions                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication             | Compact title/form/error column; Sign in, recovery request/reset and appropriate link recovery                                             |
| Dashboard                  | Month/upcoming/next Event summaries → paginated activity; no launch charts                                                                 |
| Events                     | Next/Live status → Draft/Live rows → Create Event; overdue Draft remains visible                                                           |
| Draft Event                | Identity/schedule/contact → packages and derived total → media → readiness/test reminder → Start Booth Mode; Delete Draft explains cleanup |
| Live Event on phone        | Booking summary → packages/printed/pending/available → independent blockers → recovery and lifecycle actions                               |
| History                    | Completed/Cancelled summary/rows → read-only details; no redaction/deletion                                                                |
| Profile                    | Identity → phone/theme → password → local Sign out                                                                                         |
| Booth entry                | Preparing handoff → Welcome only after scoped access and readiness                                                                         |
| Booth core                 | Welcome → preview → countdown → review → printing → 3-second completion                                                                    |
| Booth fault/pause          | Clear principal status → only permitted recovery action; phone handles Admin work                                                          |
| Booth finished/access loss | Neutral dark message → Sign in; no protected data                                                                                          |

Do not add revenue panels, galleries, photo editing, inventory widgets or separate print-count editing. Archived mockups illustrate an older proposal; they are not page requirements.

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

## Complete removal scope

[ADR-0029](docs/adr/0029-remove-legacy-features-and-reset-development-schema.md) removes legacy History totals and Draft-conversion review from #10. Retained History uses current package counts only. The current mockups remain the visual reference; deleted legacy specs/mockups are available in Git history, not as alternate interface instructions. This does not remove package-era terminal retention or safe Draft deletion.
