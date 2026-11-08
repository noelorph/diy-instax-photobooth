# Issue #10 Implementation and Publication Plan

**Instax development integration — 2026-11-08:** [Current implementation and software gaps](../../implementation/real-instax-booth-integration.md). Tasks 1–4 are implemented and source-reviewed; database-backed verification remains blocked, so this is not software integration acceptance or operational release. Existing dated evidence and physical/iPad/F6/F8/media gates remain unchanged.

**Development integration refinement — 2026-11-08:** [ADR-0035](../../adr/0035-allow-development-instax-integration.md) permits explicitly gated FI033/0102 development evidence with immutable run policies, full attempt/dispatch/printer/generation correlation and pinned nonproduction settlement after mode changes. Physical Finish also waits for old-job safety; Start cannot bypass unsafe earlier physical work by changing Event/run. Unqualified inspection cannot clear a possibly delivered physical job. Operational release, remaining F6/F8/media acceptance and actual-iPad qualification remain open. Physical adapter and request-bound reload integration are separate implementation tasks.

**F7 local software verification — 2026-11-06:** Dashboard, filtered History and immutable terminal detail have [dated evidence](../../implementation/issue-10-retirement-and-acceptance.md#f7-software-verification--2026-11-06) on `55f0afd`, including upstream application retirement and November presentation checks. Local software verification does not close #35 or parent #10. Full #30, F6/F8 and #17/#7 remain open.

**2026-10-27 F2 scope:** [ADR-0032](../../adr/0032-build-full-f2-with-uploads-unavailable.md) restores original full F2/#30 implementation, including the dormant editor and private delivery. Runtime uploads/attachments/replacements remain denied under ADR-0031; preserve sections/designs, retention and prior-authorized cleanup-pending safeguards. Add the visible Admin Event Media reminder about cleanup verification for interrupted/late uploads and leftover files. Supported cleanup and enabled transfer/failure/concurrency/private-delivery/playback proof remain required for full #30 acceptance; disabled-scope evidence is unchanged. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout every implementation plan:** Use **ponytail:ponytail, full**. Read its installed `SKILL.md` at execution time. Reuse existing contracts/components, choose the smallest complete change, trace affected callers/tests/fixtures, and preserve authorization, privacy, accessibility and printer safety. This applies to every child and every task, including verification and cleanup.

**Goal:** Deliver eight complete capabilities as native GitHub sub-issues of #10, then implement complete legacy removal and a fresh package-only installation after plan approval/publication, using the accepted #9 contracts.

**Architecture:** Integrate the existing version-2 database/HTTP contracts into the current Admin features and one shared Booth controller. Keep each capability's UI, integration, data changes, tests and retirement work together. Remove each obsolete application path with its owning capability; F8 removes shared leftovers and replaces the migration chain with a verified package-only baseline. Individual child completion does not release the application.

**Tech Stack:** Installed Next.js 16.4, React 19.3, TypeScript, Zod, Supabase Auth/Postgres/Storage, existing UI components, Vitest and Playwright. Recheck installed versions at execution; do not upgrade the framework as part of this plan.

**Spec:** [Approved functional design](../specs/2026-10-24-issue-10-functional-breakdown-design.md), [replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md), [ADR-0027](../../adr/0027-draft-only-event-media.md).

**Publication-stage status — 2026-10-25 (historical):** The user approved the revised complete-removal plan on 2026-10-25 under [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md); the approved documentation was committed as `0bd7503` after checkpoint `1de2272`. The user then clarified that approval recording and GitHub publication may proceed while implementation remains on hold. #10 and F1–F8 (#29–#36) are published and read-back verified. #9 remains accepted and closed; #10 and all children remain open. No application implementation, database reset, physical test or push is authorized. The user subsequently authorized committing this publication-record update.

## Global Constraints

- **The #9 software prerequisite is satisfied.** Before F1–F8 execution, verify accepted candidate `2f89a96` and the [dated software acceptance](../../implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25), then reconcile source references with the execution revision. Plan approval and publication authorization are recorded; a later implementation instruction and capability prerequisites remain required; #9 repairs are outside these plans.
- All existing data is disposable development/test data; the client has not bought the project. Remove legacy feature specs/plans from the maintained tree and use Git history as the archive. Do not build legacy readers, snapshots, Draft conversion/review or compatibility fallbacks. Keep dated #9/physical evidence clearly separate from work orders.
- One Admin, one booth, one printer, at most one Live Event and one unresolved Print Attempt. Use `PRINTS_PER_PACKAGE = 10`, `MAX_TOTAL_PACKAGES = 214_748_364`, `STATE_POLL_MS = 2_000`, `READINESS_MAX_AGE_MS = 5_000`, five-minute handoff, 24-hour renewable grant idle expiry and two-minute bounded late Capture window from #9; do not create alternate values.
- Use `PrinterAdapterV2`, `SimulatedPrinterV2`, `BrowserBoothMetadataJournal`, `dispatchReservedAttempt` and `recordAndReportObservation`. Simulation stays nonproduction. #17 gates physical automatic completion/recovery; #7 gates actual-iPad release.
- Guest photos exist only in browser memory/direct printer transport. Stable operation IDs, same-payload receipt recovery, no automatic resend, private/no-store responses, current authorization and same-origin protection apply throughout.
- Preserve accepted Event Media limits from ADR-0027: Draft-only mutations; still JPEG/PNG/WebP ≤10,000,000 bytes; MP4 H.264/AVC ≤50,000,000 bytes and `0 < duration ≤ 30` seconds; muted playback; trusted content validation; no conversion/editing.
- Monthly Events counts Draft, Live and Completed by venue-local scheduled start; excludes Cancelled and deleted Drafts. Four in-month Events with one Cancelled yields **3**. See [ADR-0028](../../adr/0028-define-monthly-event-count.md).
- Every child uses the [screen reference and presentation contract](#screen-reference-and-presentation-contract) below. It maps the November PDF and supplementary frames to capability owners while preserving written behavior and accessibility. Visual adoption does not establish implementation or acceptance.
- Before app code, read `AGENTS.md` and relevant installed Next guides: `node_modules/next/dist/docs/01-app/02-guides/{forms,authentication,server-actions}.md` and `01-app/01-getting-started/{05-server-and-client-components,15-route-handlers}.md` under that docs root.
- Apply Ponytail to each task: preserve working implementations and existing meaningful tests. Add a failing regression only for a missing behavior; an existing passing acceptance case warrants reuse, not a rewrite or duplicate test. Commit only changed task files; no empty commits or unrelated SQL snippets.

## Screen reference and presentation contract

**November 2026 reference migration:** This plan is the single entry point for every screen and its capability owner. The supplied [PDF](../../references/2026-11-06-instax-booth/source.pdf) contains **22 Admin pages**, each extracted unchanged to a separate PNG. The [manifest](../../references/2026-11-06-instax-booth/manifest.json) records page numbers, dimensions, SHA-256 values and Figma provenance. It contains no Booth or dialog PDF pages. Supplementary links below come from the [November 5 Figma inventory and drawing sources](../../../artifacts/design-reference-2026-11-05/README.md) and are explicitly identified; they were not freshly inspected during this migration because the connector quota was exhausted.

The PRD, glossary, architecture, ADR-0025–0032 and replacement contract still govern behavior, wording, privacy, accounting, recovery, retention and release gates. [ADR-0034](../../adr/0034-use-november-screen-reference-in-implementation-plan.md) records the presentation/reference change. Examples are synthetic data, not defaults or runtime evidence. A pictured action is rendered only when its existing authorization/state rules permit it. Missing controls or error states in a specimen never waive a written requirement. F7's already-approved Live Event card and History filters remain in scope; this migration adds no other product capability.

### Presentation foundations

Use the November reference's cream background, dark green ink, coral actions, restrained outlined icons and rounded groups. Reuse `src/components/{ui,shared,layout}` and existing semantic CSS roles; map the new appearance there rather than adding a second component system. The reference's UI family is **Manrope**; **Libre Baskerville** is reserved for editorial/decorative headings such as the authentication aside and welcome. Serve fonts locally. These family names and palette values are recorded in the [November drawing helpers](../../../artifacts/design-reference-2026-11-05/figma-helpers.js); the PDF embeds Figma glyph outlines and is the visual reference, not a reliable font-name extractor.

| Reference role      | Value                 | Use                                                            |
| ------------------- | --------------------- | -------------------------------------------------------------- |
| Paper               | `#F7F4EE`             | Light page background                                          |
| Surface             | `#FFFFFF`             | Forms and grouped content                                      |
| Ink                 | `#252A27`             | Primary text, selected/dark surfaces                           |
| Muted               | `#62675F`             | Secondary text and essential light control boundaries          |
| Coral               | `#AD402B`             | Primary action with white text                                 |
| Coral soft          | `#F9E4DC`             | Selection and quiet emphasis                                   |
| Divider             | `#D8DBD2`             | Decorative separators, not the sole essential control boundary |
| Success / soft      | `#28614B` / `#E6F0E8` | Confirmed/ready labels                                         |
| Warning / soft      | `#805519` / `#F5ECD9` | Pending/attention labels                                       |
| Danger / soft       | `#AE3434` / `#F9E7E3` | Errors/destructive actions                                     |
| Booth night / panel | `#202722` / `#303B33` | Supplementary dark camera/operational compositions             |

Match the hierarchy and proportions of the applicable screen. Use `rem`, wrapping and tabular counts rather than raster text or fixed-height clipping. Admin controls are generally 48 px high in the reference; preserve at least 44 px touch targets, Booth main actions at least 64 px, and shutter at least 88 px. Reuse meaningful labels, not generic confirmation text. Empty, unavailable, loading, stale, disabled and success states must reflect actual outcomes. No charts, revenue, Guest galleries, photo editing or false printing percentage.

Admin retains its saved light/dark preference; the PDF shows light examples, not a complete dark specification. Booth appearance is state-specific and independent of that preference. Dark, hover, focus and media-overlay variants must be derived consistently and verified during implementation, not claimed as approved/rendered by this PDF. Preserve the existing safe default until each replacement is implemented and checked; earlier software evidence does not prove November visual adoption.

### Responsive and accessibility requirements

- Preserve WCAG 2.2 AA: normal text contrast at least 4.5:1; large text and essential non-text boundaries at least 3:1; labels and status never depend on color alone. Measure actual implemented pairs, including both Admin themes and overlays.
- Visible keyboard focus, logical headings, skip/navigation access, accessible names, field/error relationships, dialog focus trap/restoration and persistent actionable feedback remain required. Keep errors/unknown outcomes visible; success follows committed state only. Announce print/status changes appropriately without repeated noise.
- Verify compact below 640 CSS px, medium 640–1023 and wide at least 1024, plus short landscape, 200% text/browser zoom, reduced motion and safe-area insets. Reflow columns and controls instead of scaling an entire fixed canvas. Essential labels/actions must remain reachable with no page-level horizontal overflow.
- The PDF includes 390 px phone, 820 × 1180 portrait setup, 960 × 840 authentication and 1440 × 1024 wide Admin examples. These are reference canvas sizes, not fixed browser or supported-device dimensions. Actual iPad A16/Bluefy qualification remains #7.
- Preserve the unmirrored portrait print crop, mirrored preview, image ownership/disposal, generous touch spacing and no Guest-photo persistence. Illustrative figures/artwork in supplementary frames are decoration, never retained Guest photos or print overlays.
- Moving montage remains muted and pausable, with a still/default reduced-motion fallback. Optional unavailable media never blocks readiness; trusted upload denials and the exact cleanup reminder remain in force. No new re-enable control.

### Interaction and state requirements

- Keep semantic CSS roles in the shared components; do not copy palette literals into pages or derive UI colors from Event Media. Use Lucide outline icons with accessible labels, hide decorative icons from assistive technology, and keep one primary action per decision area. Destructive actions require a text label.
- Preserve visible labels, entered form values after validation/stale saves, inline errors and a summary for multiple errors. Show venue-local dates and the venue time zone; explain nonexistent/ambiguous schedule times. Tables need named columns, readable compact summaries and an explicit selected filter/sort state.
- Specify hover, pressed, focus-visible, disabled, loading, invalid and success states where applicable. Use a visible 2 px focus ring with separation where possible. Loading preserves the action label and prevents duplicate submission; disabled controls explain their blocker. Form, readiness and uncertain-print errors persist in context; a toast alone is insufficient.
- Consequential Admin dialogs explain the effect and use the actual action name. Preserve required reasons/confirmations, receipt recovery and focus restoration. Starting Booth Mode uses its readiness checklist rather than an additional confirmation; no confirmation screen may imply success before committed state.
- Keep package purchase, physical loading, pending outcome, equipment blockers and deliberate pause distinct. Show zero pending explicitly after a successful read. An unknown result keeps its hold; recovery does not clear pause or trigger automatic Resume/resend. Apply the [PRD recovery table](../../../PRD.md#recovery) and [contract failure matrix](../specs/2026-10-21-package-accounting-booth-recovery-design.md#4-failure-and-recovery-contract) to every overlapping or missing variant.
- Announce ordinary progress/completion politely and pending prints or required intervention assertively without repeated noise. On an authentication/handoff view change, focus the heading or relevant error. Keep countdown numerals as text, keyboard/assistive access to Guest recovery actions, and phone operations usable without long-press gestures. Event Media overlays need readable opaque/darkened backing and actual contrast checks. No Guest-facing technical diagnostics, photo retry promise or retained photo thumbnail.

### Admin screens from the supplied PDF

Each A-number equals its one-based PDF page. Open the PNG for a self-contained screen; Figma links identify the source frame, not separate authority.

| ID / screen file                                                                                                                      | Size        | Owner                 | Required interpretation                                                                                                                                                    | Source frame                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [A01 — Dashboard](../../references/2026-11-06-instax-booth/admin/a01-dashboard.png)                                                   | 1440 × 1024 | F7                    | Monthly/booked/upcoming/next; Live card; 7/30-day activity, 25 rows/page. Preserve a Dashboard heading and honest absent/error/run states.                                 | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-179)  |
| [A02 — Events](../../references/2026-11-06-instax-booth/admin/a02-events.png)                                                         | 1440 × 1024 | F2                    | Draft/Live discovery, future-start Upcoming annotation and overdue Drafts. The pictured tabs do not expand the approved list scope.                                        | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-307)  |
| [A03 — Draft Event Editor](../../references/2026-11-06-instax-booth/admin/a03-draft-event-editor.png)                                 | 1440 × 1024 | F2                    | Existing booking/contact/schedule fields; whole original packages and derived prints. A separate venue caption does not authorize a new database field.                    | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-416)  |
| [A04 — Draft Setup on iPad](../../references/2026-11-06-instax-booth/admin/a04-draft-setup-on-ipad.png)                               | 1440 × 1024 | F4; F2 booking        | Wide setup composition; real equipment checks and explicit permission/connect actions; test reminder only; handoff signs out this iPad only.                               | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-550)  |
| [A05 — Draft Media — unavailable](../../references/2026-11-06-instax-booth/admin/a05-draft-media-unavailable.png)                     | 1440 × 1024 | F2                    | Unavailable background/montage controls plus persistent cleanup reminder; private retained media and existing cleanup safeguards.                                          | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-689)  |
| [A06 — Live Event — desktop](../../references/2026-11-06-instax-booth/admin/a06-live-event-desktop.png)                               | 1440 × 1024 | F3/F4/F6; F7 activity | Authoritative booked/confirmed/pending/available counts, independent Event/run state, readiness, phone operations and safe activity.                                       | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-803)  |
| [A07 — History](../../references/2026-11-06-instax-booth/admin/a07-history.png)                                                       | 1440 × 1024 | F7                    | All History / Completed / Cancelled filters; retained contacts/package totals; terminal records only.                                                                      | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-938)  |
| [A08 — History detail](../../references/2026-11-06-instax-booth/admin/a08-history-detail.png)                                         | 1440 × 1024 | F7                    | Immutable booking, counts/Captures and all-time activity; History stays selected. Keep media status/reminder; empty attachment metadata does not establish past Booth use. | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1038) |
| [A09 — Profile](../../references/2026-11-06-instax-booth/admin/a09-profile.png)                                                       | 1440 × 1024 | F1                    | Verified email, optional phone, Admin light/dark preference, password change and current-device sign-out.                                                                  | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1143) |
| [A10 — Authentication — Sign in](../../references/2026-11-06-instax-booth/admin/a10-authentication-sign-in.png)                       | 960 × 840   | F1                    | Sign in; standard success goes to Dashboard; no public signup or protected-data disclosure.                                                                                | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1247) |
| [A11 — Authentication — Forgot password](../../references/2026-11-06-instax-booth/admin/a11-authentication-forgot-password.png)       | 960 × 840   | F1                    | Neutral recovery request, persistent failure/retry and return to sign-in.                                                                                                  | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1287) |
| [A12 — Authentication — Email confirmation](../../references/2026-11-06-instax-booth/admin/a12-authentication-email-confirmation.png) | 960 × 840   | F1                    | Account-independent confirmation and resend handling.                                                                                                                      | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1320) |
| [A13 — Authentication — Reset password](../../references/2026-11-06-instax-booth/admin/a13-authentication-reset-password.png)         | 960 × 840   | F1                    | Different password plus confirmation; success requires confirmed global Admin-session revocation.                                                                          | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1351) |
| [A14 — Authentication — Link expired](../../references/2026-11-06-instax-booth/admin/a14-authentication-link-expired.png)             | 960 × 840   | F1                    | Invalid/expired/reused link recovery with no success claim.                                                                                                                | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1385) |
| [A15 — Authentication — Reset complete](../../references/2026-11-06-instax-booth/admin/a15-authentication-reset-complete.png)         | 960 × 840   | F1                    | Completion only after password save and global Admin revocation; independent Booth grant unchanged.                                                                        | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1415) |
| [A16 — Live Event — phone](../../references/2026-11-06-instax-booth/admin/a16-live-event-phone.png)                                   | 390 × 844   | F3/F4/F6              | Phone Live management; labels and actions remain usable at compact widths.                                                                                                 | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1440) |
| [A17 — Phone — pending recovery](../../references/2026-11-06-instax-booth/admin/a17-phone-pending-recovery.png)                       | 390 × 844   | F6                    | Pending outcome and Bluetooth fault remain independent; phone inspection never resends the photo.                                                                          | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1487) |
| [A18 — Phone — film reload needed](../../references/2026-11-06-instax-booth/admin/a18-phone-film-reload-needed.png)                   | 390 × 844   | F6                    | Physical reload confirmation does not add capacity or resolve an unknown print.                                                                                            | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1534) |
| [A19 — Phone — paused and ready](../../references/2026-11-06-instax-booth/admin/a19-phone-paused-and-ready.png)                       | 390 × 844   | F4/F6                 | Explicit phone Resume only after every blocker clears; recovery never clears a deliberate pause.                                                                           | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1575) |
| [A20 — Phone — run finished](../../references/2026-11-06-instax-booth/admin/a20-phone-run-finished.png)                               | 390 × 844   | F4; F3 additions      | Finished run leaves Event Live; eligible Complete Event is separate; new run still requires iPad setup.                                                                    | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=4-1609) |
| [A21 — Draft Setup — iPad portrait](../../references/2026-11-06-instax-booth/admin/a21-draft-setup-ipad-portrait.png)                 | 820 × 1180  | F4                    | Portrait iPad setup with live camera, real readiness/confirmations and safe handoff.                                                                                       | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=12-249) |
| [A22 — Draft Event Editor — phone](../../references/2026-11-06-instax-booth/admin/a22-draft-event-editor-phone.png)                   | 390 × 1400  | F2                    | Compact Draft editor; preserve validation, time-zone labels, stale/lost-save recovery and all required fields.                                                             | [Figma](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=12-324) |

### Supplementary Booth references

These 30 frames are **not in the supplied PDF and have no extracted local screen file**. The links are retained from the November 5 inventory. Use the PRD failure/recovery table and contract for exact controls/copy and all missing/error combinations; re-inspect the frame when implementing it. A future Booth PDF export can be attached without restoring the retired design collection.

| Frame                                                                                                     | Canvas     | Owner |
| --------------------------------------------------------------------------------------------------------- | ---------- | ----- |
| [B01 · Welcome / default](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-249)              | 820 × 1180 | F5    |
| [B02 · Camera preview](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-280)                 | 820 × 1180 | F5    |
| [B03 · Countdown](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-314)                      | 820 × 1180 | F5    |
| [B04 · Photo review](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-344)                   | 820 × 1180 | F5    |
| [B05 · Inactivity warning](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-386)             | 820 × 1180 | F5    |
| [B06 · Preparing your print](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-409)           | 820 × 1180 | F5    |
| [B07 · Sending to Instax](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-439)              | 820 × 1180 | F5    |
| [B08 · Waiting for ejection](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-469)           | 820 × 1180 | F5    |
| [B09 · Print complete](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-499)                 | 820 × 1180 | F5    |
| [B10 · Bluetooth disconnected](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-517)         | 820 × 1180 | F6    |
| [B11 · Camera disconnected](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-538)            | 820 × 1180 | F6    |
| [B12 · Camera permission denied](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-560)       | 820 × 1180 | F6    |
| [B13 · Wi-Fi disconnected](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-584)             | 820 × 1180 | F6    |
| [B14 · Connection unavailable](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-605)         | 820 × 1180 | F6    |
| [B15 · Printer out of film](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-622)            | 820 × 1180 | F6    |
| [B16 · Temporarily unavailable](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-642)        | 820 × 1180 | F6    |
| [B17 · Last print unresolved](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-657)          | 820 × 1180 | F6    |
| [B18 · Pending print + Bluetooth lost](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-673) | 820 × 1180 | F6    |
| [B19 · Booked prints exhausted](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-696)        | 820 × 1180 | F5/F6 |
| [B20 · Booth paused](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-714)                   | 820 × 1180 | F4/F6 |
| [B21 · Paused + Bluetooth lost](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-728)        | 820 × 1180 | F4/F6 |
| [B22 · Finishing Booth Mode](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-750)           | 820 × 1180 | F4/F6 |
| [B23 · Booth Mode finished](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-764)            | 820 × 1180 | F4/F6 |
| [B24 · Booth access ended](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-784)             | 820 × 1180 | F4/F6 |
| [B25 · Finishing + reconnect required](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-805) | 820 × 1180 | F4/F6 |
| [B30 · Paused + unresolved print](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-827)      | 820 × 1180 | F4/F6 |
| [B26 · Welcome / landscape](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-843)            | 1180 × 820 | F5    |
| [B27 · Camera preview / landscape](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-875)     | 1180 × 820 | F5    |
| [B28 · Photo review / landscape](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-912)       | 1180 × 820 | F5    |
| [B29 · Bluetooth recovery / landscape](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-955) | 1180 × 820 | F6    |

### Supplementary dialogs and foundation references

These 19 dialogs and three reference boards are also **absent from the supplied PDF**. They guide presentation only. Existing mutation validation, receipt recovery, focus behavior and required reasons/confirmations govern the real interaction; a background specimen is not a second screen or new route.

| Frame / board                                                                                                               | Canvas      | Owner                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------- |
| [00 / Instax Booth — new design reference](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-979)               | 1200 × 1100 | Reference provenance; no runtime feature |
| [01 / Foundations — type, color and interaction](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1004)        | 1200 × 1100 | Reference provenance; no runtime feature |
| [02 / Research, device assumptions and authority](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1075)       | 1200 × 1100 | Reference provenance; no runtime feature |
| [D01 / Add Film Packages](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1120)                               | 1200 × 1100 | F3                                       |
| [D02 / Confirm physical reload](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1201)                         | 1200 × 1100 | F6                                       |
| [D03 / Resolve pending — Printed](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1277)                       | 1200 × 1100 | F6                                       |
| [D04 / Resolve pending — Not printed blocked](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1366)           | 1200 × 1100 | F6                                       |
| [D05 / Pause Booth](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1449)                                     | 1200 × 1100 | F4/F6                                    |
| [D06 / Resume blocked](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1509)                                  | 1200 × 1100 | F4/F6                                    |
| [D07 / Resume ready](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1573)                                    | 1200 × 1100 | F4/F6                                    |
| [D08 / Finish Booth Mode](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1646)                               | 1200 × 1100 | F4/F6                                    |
| [D09 / Complete Event](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1709)                                  | 1200 × 1100 | F4                                       |
| [D10 / Complete Event blocked](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1781)                          | 1200 × 1100 | F4                                       |
| [D11 / Cancel Draft](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1834)                                    | 1200 × 1100 | F2                                       |
| [D12 / Delete Draft](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1902)                                    | 1200 × 1100 | F2                                       |
| [D13 / Draft deletion — cleanup pending](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-1964)                | 1200 × 1100 | F2                                       |
| [D14 / Stale Draft conflict](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-2025)                            | 1200 × 1100 | F2                                       |
| [D15 / Password reset — incomplete, active session](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-2093)     | 1200 × 1100 | F1                                       |
| [D16 / Password reset — new link required](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-2159)              | 1200 × 1100 | F1                                       |
| [D17 / Feedback — progress, success, error and offline](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=9-2213) | 1200 × 1100 | All applicable owners                    |
| [D18 / Add Film Packages — phone 390 × 844](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=13-561)             | 390 × 844   | F3                                       |
| [D19 / Not printed — phone 390 × 844](https://www.figma.com/design/LhIiTbBL18iOkDTfrx88Jj?node-id=13-615)                   | 390 × 844   | F6                                       |

### Capability screen mapping

| Capability | Primary reference IDs                                                                         | Acceptance boundary                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| F1         | A09–A15; shared shell in A01; D15–D17                                                         | Preserve accepted Auth/Profile behavior; November presentation requires new evidence when changed.                                  |
| F2 / #30   | A02–A05, A22; booking portions of A04/A21; D11–D14/D17; B01/B02/B26/B27 as delivery consumers | Draft/media unavailable now; dormant editor and enabled cleanup/delivery/playback proof remain separate.                            |
| F3         | A06/A16/A20, D01/D18; B19 capacity                                                            | Authoritative packages/counts and immutable additions; no physical-stock inference.                                                 |
| F4         | A04/A06/A16/A19–A21; B20–B25/B30; D05–D10                                                     | Setup/handoff, explicit lifecycle and eligible Event termination.                                                                   |
| F5         | B01–B09/B19/B26–B28; A16/D01/D18 purchase consumer                                            | Existing Guest sequence, crop/privacy, one-send and new admission after capacity.                                                   |
| F6 / #34   | A17–A20; A06/A16/A21 support; B10–B25/B29/B30; D02–D08/D19                                    | Each failure and overlapping blockers; phone/iPad recovery without automatic Resume/resend.                                         |
| F7 / #35   | A01/A07/A08; A06 counts/activity; A05 unavailable-media pattern                               | F7-01–F7-06 in the shared acceptance trace, including Live card and History filters.                                                |
| F8 / #36   | All applicable A/B/D rows and written states above                                            | Combined upload-disabled presentation/behavior verification on the fresh baseline; no new product screen or full #30/hardware pass. |

The [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) remains the single requirement/test/evidence record. This catalog maps screens to that record; it does not duplicate pass status or reopen completed issues. Closed capability evidence remains dated; later styling/shared-component changes require affected regression and browser checks. Every missing PDF variant remains an explicit implementation/verification obligation rather than an inferred pass. Keep F8's audit scoped to the existing first-release flows.

## Review Focus

1. A lost mutation response must not create a duplicate Draft/audit, purchase, handoff or send: F2 task 1, F3 task 2, F4 task 1, F5 task 2.
2. Full dormant F2 editor/private delivery can proceed with runtime denials intact. Keep a visible interrupted/late-upload and leftover-file cleanup reminder. Full interrupted/invalid-transfer, lifecycle/concurrency, supported cleanup, private delivery and playback proof remains required for #30 completion and later re-enablement. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.
3. Setup readiness cannot be reused blindly after local sign-out/navigation; explicit camera actions can request permission, passive checks cannot prompt, and independent blockers/stops survive: F4 tasks 1–2 and F6 tasks 1–3.
4. A delayed newer Capture or journal loss must not select another photo or imply no physical send: F5 tasks 1–2 and F6 task 1.
5. A fresh install must reproduce every current #9 security/accounting safeguard while omitting all legacy objects; resets are restricted to named disposable local projects and never settle a runtime uncertain print: F8 tasks 1–3.

## Capability plans and dependencies

Each row is **one GitHub sub-issue**, not a separate UI/API/database/testing phase. F1–F8 are stable capability identifiers mapped to published GitHub issues #29–#36 in the publication table below. Human review diagrams are separate from agent execution instructions.

| ID / approved issue title                                            | Plan                                                    | Prerequisites besides #9         | Independently demonstrable outcome                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| F1: Complete Admin access and account management                     | [F1](2026-10-24-issue-10-f1-admin-access.md)            | None                             | Sign in/recover/manage account with correct session boundaries                        |
| F2: Complete Event preparation and private media                     | [F2](2026-10-24-issue-10-f2-event-preparation-media.md) | F1                               | Valid Draft, dormant full media workflow, runtime denials, safe cancellation/deletion |
| F3: Complete booked capacity and Additional Film Packages            | [F3](2026-10-24-issue-10-f3-package-capacity.md)        | F2 disabled milestone            | Real Admin purchase/count workflow, exactly once                                      |
| F4: Complete Booth setup, access and lifecycle                       | [F4](2026-10-24-issue-10-f4-booth-lifecycle.md)         | F1, F2 disabled milestone, F3    | Setup/handoff, phone pause/resume/finish and Event termination                        |
| F5: Complete the Guest capture-to-print journey                      | [F5](2026-10-24-issue-10-f5-guest-printing.md)          | F2 disabled milestone, F4        | One reviewed Capture, at most one send, truthful completion                           |
| F6: Complete Booth recovery across devices                           | [F6](2026-10-24-issue-10-f6-booth-recovery.md)          | F3, F4, F5                       | Resolve outcome and equipment/access blockers safely                                  |
| F7: Complete operational visibility and retained history             | [F7](2026-10-24-issue-10-f7-visibility-history.md)      | F2 disabled milestone, F3        | Accurate summaries/activity and immutable historical detail                           |
| F8: Complete legacy removal, fresh installation and final acceptance | [F8](2026-10-24-issue-10-f8-cutover-acceptance.md)      | F1, F2 disabled milestone, F3–F7 | Package-only schema and combined app pass nonproduction acceptance                    |

The F2 disabled milestone is the [verified local scope](../../implementation/issue-30-disabled-media-acceptance.md), not full #30 closure. F3–F8 may consume it; #30 stays under #10 and is finished last. F8 may complete fresh-schema, retirement and integrated acceptance for uploads unavailable while full-media evidence remains open under #30. Later F2 changes require affected current #9/integration/fresh-schema checks before parent closure. F7 may follow F3 while F4–F6 proceed in dependency order. F4/F5/F6 sequentially extend `src/features/booth/flow.ts` and `booth-client.tsx`; they must not introduce competing orchestration state machines. The dependency graph does not request delegation now. Implementation method is selected later, after the gate and explicit authorization to implement.

## Acceptance ownership before implementation

The [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) is populated now with requirements, accountable capability/task, named test scenarios and pending evidence. Each owner records revision, exact command/config/environment, result and evidence location before its issue closes. Refer to that single table from child issues instead of maintaining divergent copies. F8 audits and reruns the upload-disabled candidate evidence, leaving full #30 media proof explicitly open. It does not first assign missing requirements at the end or record final #10 acceptance before #30 completes.

In particular, F3 owns the exactly-once purchase; **F5 owns exhaustion → phone purchase → a newly admitted Guest**, and F6 owns the variants where pause or another blocker still prevents admission. F4 owns fresh camera/printer readiness after setup handoff. Every required test not yet written or run remains explicitly pending.

## File and interface ownership

| Owner | Existing home to extend                                                                                  | New files allowed by this plan                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1    | `src/features/admin/auth/`, `profile/`, `src/components/{ui,shared,layout}/`                             | No new feature layer                                                                                                                                                      |
| F2    | `src/features/admin/events/`, `src/lib/events/drafts.ts`, existing receipt/RPC and media-cleanup helpers | Development Draft-creation receipt and media migrations, consolidated into the F8 baseline, focused media module/routes/UI and shared browser fixtures; exact paths in F2 |
| F3    | `src/features/admin/operations/{read.ts,types.ts,panel.tsx}`                                             | Focused purchase browser regression only; no new ledger                                                                                                                   |
| F4–F6 | `src/features/booth/`, Admin operations, existing #9 HTTP routes                                         | Focused setup/recovery UI modules only where identified; tests reuse existing fixtures                                                                                    |
| F7    | Dashboard/History pages, `src/lib/events/history.ts`, Admin operations read model                        | Dashboard projection/view, dedicated immutable terminal-detail view and read tests                                                                                        |
| F8    | Remaining old routes/version switches, migration chain, fixtures and acceptance trace                    | Complete package baseline, absence/security tests and fresh-install fixture/config                                                                                        |

Existing wire contracts stay in `src/lib/operations/{package-contract,package-validation,package-state,package-route,package-rpc}.ts`. Client inputs use `operationId` and the exact schemas there, never legacy `operationKey`. `requireAdmin()` supplies `{userId, sessionId}`; read helpers must retain its live-session/RLS checks. Each plan distinguishes existing signatures from proposed application interfaces.

F2 task 1 corrects the direct Draft creation path to use a stable creation ID, existing receipt machinery and one atomic creation/audit commit, and introduces the shared local browser fixture when first needed. F4 consumes it and owns the camera helper's explicit `existing` / `request` permission intent, all initial callers/tests and post-navigation equipment readiness; F5 preserves that boundary and F6 wires Enable Camera to it. These corrections implement approved retry and permission behavior without changing capability dependencies or release gates.

## Verification and environment rules

F7 used the existing isolated selector: prefix fixture commands with `INSTAX_TEST_WORKDIR=.worktrees/verification-stack env -u NO_COLOR` for `diy-instax-retirement-verification`, API/DB `58321/58322`, with production app `1437`. The ordinary stack contained Live work and was not used. Serial identity/empty/port guards, exact-ID cleanup and restored grants/defaults/policy remain mandatory; this selector performs no reset.

Use `tests/fixtures/local-supabase.ts` and `package-contract.ts` for local fixtures; refuse hosted URLs. Run database and browser commands **serially across processes**, because they share local Auth/data and build output. Normal tests clean exact fixture IDs and restore only fixture-owned policy; they never reset a stack. Abort on unexpected identity, occupied app ports or unverified cleanup.

Before F8, F2 may temporarily change only the local `events.accounting_version` creation default to 2 for serial creation tests and restore it in `finally`; leave `active_creation_version` unchanged. F2 owns the shared `package-browser.ts` fixture. This is temporary test setup for the existing schema, not a compatibility feature. F8 removes both old creation/activation machinery and the fixture toggles. Its final baseline creates package Events by default and contains no conversion path.

F8 first proves an empty install on its separately owned `57321/57322` stack without touching the ordinary stack. Only after that proof, F8 rebuilds the identified disposable `diy-instax-package-contracts` stack at `56321/56322` from the new baseline, then runs the full suite there. Stop apps/workers and disconnect/quiesce physical printers before rebuilding. This one setup rebuild is the explicit exception to normal exact-ID cleanup. No shared/hosted/unidentified project may be reset; revisit ADR-0029 if data is no longer disposable.

The table describes the **required implemented configuration**, not environments changed by this documentation review. Commands run from the repository root after dependencies/local migrations are prepared. A focused browser command always names its config.

| Command / config                                                                 | Application and evidence mode                                                                                                           | Database / fixture and allowed changes                                                                                                                                       |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --reporter=verbose` / `vitest.config.mts`                           | Unit/component tests plus real local integration; no browser server                                                                     | `diy-instax-package-contracts`, API `127.0.0.1:56321`, DB `56322`; exact-ID fixtures, restored defaults/policy; current contracts; pre-F8 conversion tests are retired by F8 |
| `npm run test:e2e` or `npx playwright test --config playwright.config.ts <file>` | Production build/start at `127.0.0.1:1437`, `tests/fixtures/browser-server.mjs`; simulation denied, including when its flag is supplied | Same `56321/56322` stack; F2/F3/F7 real data/Storage workflows, F1 Auth and production denial tests; no conversion or reset during normal tests                              |
| `npx playwright test --config playwright.booth.config.ts`                        | Development app at `127.0.0.1:1438`; only `booth-simulator.spec.ts`; simulator enabled                                                  | Same local stack, explicit credentials from CLI status via the shared runner; F5/F6 real operations, not inherited request-mocked success                                    |
| `npx playwright test --config playwright.admin-booth.config.ts`                  | Development app at `127.0.0.1:1439`; only `admin-booth-simulator.spec.ts`; simulator enabled                                            | Same local stack/runner; F4–F6 two-context journeys, fixture-owned policy restored                                                                                           |
| `npx playwright test --config playwright.baseline.config.ts`                     | Fixture-owned candidate app at `127.0.0.1:1440`; production build for fresh installation/package History/denials, simulation denied     | **Disposable** `diy-instax-package-baseline`, API `127.0.0.1:57321`, DB `57322`; empty install and synthetic Auth/data/private Storage; fixture-owned setup/teardown         |

**Discovery and startup ownership:** F8 adds `package-baseline.spec.ts` to default `playwright.config.ts.testIgnore` in the same change that creates it; retain the two simulator exclusions. `playwright.baseline.config.ts` matches only that file, uses one worker, and has no competing `webServer`: its `withPackageBaselineFixture` starts/stops its own app around fresh-install checks and awaits health. The two simulator configs retain exact single-file `testMatch`. F4 extends the existing `admin-booth-server.mjs` to accept only `1438` or `1439` as its port and makes both simulator configs use it, setting local credentials and matching `ADMIN_AUTH_ORIGIN` explicitly; no inherited `.env.local` database selection. F2 extends the ordinary fixture for its v2 creation tests. F8 owns default exclusion and disposable configuration; no ninth capability is introduced.

Before any browser run after changing discovery, run all four `npx playwright test --config <config> --list` commands. The default list must omit all three specialized files; each specialized list must contain only its intended file. Discovery must not provision/reset a stack, change defaults or start an app. The baseline test checks its config/base URL before fixture setup and the fixture checks project/container/ports before mutation, so an explicitly misrouted run fails before touching a database. Keep screenshots, traces and video off for every Guest journey. Independent baseline evidence must also show that the `56321` stack was unchanged.

Each child runs its focused commands and changed-file lint/type/format checks. Exact candidate commands at F8:

```bash
npm test -- --reporter=verbose
npm run test:e2e
npx playwright test --config playwright.booth.config.ts
npx playwright test --config playwright.admin-booth.config.ts
npx playwright test --config playwright.baseline.config.ts
npm run lint
npx tsc --noEmit
npm run format:check
npm run build
npx supabase db lint --local --schema public,private --level warning --fail-on error
git diff --check
```

Every command must exit 0; report any failure and its subsequent fix/rerun accurately. Validate Markdown separately with Prettier because `format:check` omits docs. Keep production-build tests that deny simulation, alongside development simulation journeys. F8 must not report inherited legacy browser tests as proof of new flows. No actual printer/iPad test is authorized by these plans.

Every applicable capability verifies persistent errors, loading/empty/disabled states, keyboard and focus behavior, light/dark Admin, state-specific Booth presentation independent of the Admin preference, compact/medium/wide layouts, portrait/landscape, 200% zoom, reduced motion and safe areas. Use the screen reference and presentation contract above under ADR-0034. Tests must assert outcomes against real #9 operations where available; component mocks alone do not close a capability.

## Retirement ownership

| Retired behavior                        | First owner               | F8 must prove                                                                             |
| --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| Editable Print Allowance                | F2 Draft; F3 operations   | No allowance input, read, payload, independent column or write function                   |
| Individual Additional Prints            | F3                        | Old UI/actions/routes/RPCs/tables removed; stale calls fail                               |
| Shared Film Stock                       | F3; F7 reader deletion    | No stock ledger/table/function or historical reader                                       |
| Wasted Film / quality refunds           | F5/F6; F7 reader deletion | Full ejection stays counted; correction code/schema absent                                |
| In-app Test Print/setup gate            | F4                        | Reminder only; Test kind, routes, functions and setup gate absent                         |
| Client Redaction / past-Event deletion  | F2/F7                     | Redaction routes/functions absent; package History and safe Draft cleanup remain          |
| Old recovery/local takeover             | F4/F5/F6                  | No ordinary pause/fault sign-in or same-photo retry                                       |
| Compatibility adapters/branches/helpers | Every owner               | Remove all v1 branches/conversion objects; retain current v2 contracts and dated evidence |

Each child records controls, callers, actions, routes, SQL objects, fixtures and tests affected. Delete obsolete application paths in their owning task; remove shared database remnants and the old migration chain in F8 with the complete baseline. No old-record settlement/conversion, historical reader or legacy migration remains. Preserve required current security and calibration behavior; dated evidence can name removed features without becoming executable work.

## Publication record — completed 2026-10-25

### P1: Record approval and prepare the parent amendment plus eight issue bodies

- [x] User approved the revised implementation/publication plan on 2026-10-25; documentation commit `0bd7503` records it. The user subsequently clarified that approval recording, #10/F1–F8 publication, dependency verification and local issue-link updates may proceed. Application implementation remains on hold.
- [x] Read #10's native sub-issues and existing blockers with `gh api repos/noelorph/diy-instax-photobooth/issues/10/sub_issues --paginate` and `gh api repos/noelorph/diy-instax-photobooth/issues/10/dependencies/blocked_by --paginate`. Reuse a matching child after partial publication.
- [x] Prepare eight UTF-8 body files from the child plans, including purpose, complete scope, non-goals, task checklist, exact design references, contract reuse, dependencies, owned acceptance-trace rows, test commands/environments, retirement ownership and Ponytail full requirement. Include `Part of #10` and the satisfied #9 prerequisite with its evidence. Include plan/trace content in the body when local links are not yet available on GitHub; never publish broken branch links as the only instructions.
- [x] Prepare the exact #10 parent amendment from [the published parent body](../../github-issue-update-drafts.md#issue-10-published-body). Preserve all unchanged Admin/Guest/media/recovery scope, accepted #9 prerequisite and #17/#7 limits; replace legacy preservation/conversion with complete removal and fresh installation. Keep #9 closed and its original acceptance/evidence intact.
- [x] Check the parent amendment and all eight bodies against the approved dependency and retirement tables. Leave triage labels unset while blocked; do not apply `ready-for-agent`, assign owners, close issues or publish #17/#7 drafts.

### P2: Publish the parent amendment and native child dependencies

- [x] Following the explicit publication authorization, update #10 with the exact reviewed parent body using `gh issue edit 10 --body-file <prepared-file>` and read it back. Do not edit #9 or publish #17/#7 drafts. Implementation remains on hold.
- [x] For each missing child, use `gh issue create --repo noelorph/diy-instax-photobooth --parent 10 --title '<approved title>' --body-file '<prepared file>'`. Record the returned URL and numeric database ID before proceeding to the next child.
- [x] For each child, add #9 and every prerequisite in the table as native blockers using `gh api --method POST repos/noelorph/diy-instax-photobooth/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. Fetch existing edges first to avoid duplicate work. Keep #10's own #9 blocker.
- [x] Update child bodies with the assigned prerequisite numbers using `gh issue edit --body-file`. Preserve the revised parent scope and unrelated metadata. A failed operation is resumed from recorded IDs, not by creating another set of issues.

### P3: Verify publication and complete the planning handoff

- [x] Read back every child's body, native parent and blockers; verify all eight are attached to #10 and match the dependency table. A body link alone is not native linkage.
- [x] Replace the pending values below with real issue numbers/URLs, link the plans from the approved design, and record publication status without claiming implementation completion.
- [x] Verified the publication-record changes: local links/anchors and published plan snapshots match; all 27 changed Markdown files pass Prettier and `git diff --check`. The initial approved documentation commit is `0bd7503`. The user subsequently authorized committing these publication records after verifying their relation to the published issues. No push or application execution occurred.

| Local ID | GitHub sub-issue                                                   | Publication and current execution status                             |
| -------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| F1       | [#29](https://github.com/noelorph/diy-instax-photobooth/issues/29) | Implemented; dated acceptance recorded                               |
| F2       | [#30](https://github.com/noelorph/diy-instax-photobooth/issues/30) | Full dormant implementation authorized; full acceptance open         |
| F3       | [#31](https://github.com/noelorph/diy-instax-photobooth/issues/31) | Publication verified; may use disabled F2 milestone; #30 closes last |
| F4       | [#32](https://github.com/noelorph/diy-instax-photobooth/issues/32) | Publication verified; may use disabled F2 milestone; #30 closes last |
| F5       | [#33](https://github.com/noelorph/diy-instax-photobooth/issues/33) | Publication verified; may use disabled F2 milestone; #30 closes last |
| F6       | [#34](https://github.com/noelorph/diy-instax-photobooth/issues/34) | Publication verified; may use disabled F2 milestone; #30 closes last |
| F7       | [#35](https://github.com/noelorph/diy-instax-photobooth/issues/35) | Publication verified; may use disabled F2 milestone; #30 closes last |
| F8       | [#36](https://github.com/noelorph/diy-instax-photobooth/issues/36) | Publication verified; may use disabled F2 milestone; #30 closes last |

## Completion and self-review

This revision is ready only after the full spec/plan reread, builder design check, local link/anchor/reference checks, formatting and documentation scope checks pass. Record actual results in the [review record](../../implementation/issue-10-retirement-and-acceptance.md#documentation-review-2026-10-25). No old review count is evidence for this revision.

Review each capability against the current PRD, architecture, glossary, ADR-0025/26/27/28/29, replacement contract and live #9/#10. Preserve the accepted #9 runtime requirements; explicitly account for its obsolete conversion work. Verify every removal has an owner, every shared interface/test environment agrees, and every acceptance row remains pending until implementation proves it. No legacy History/conversion task or “retain old migrations” instruction may survive as active guidance.

Read-back on 2026-10-25 verified the complete #10 body, all eight child bodies/native parents and 27 child blocker edges against the approved scope, dependency table, 23 tasks and 27 pending acceptance rows. #10 retains its own #9 dependency. #9's body, completed state, metadata and update timestamp are unchanged; its old preservation clauses remain dated evidence superseded for #10 by ADR-0029. The [publication record](../../github-issue-update-drafts.md#publication-verification-2026-10-25) records the result.

**Historical publication handoff — 2026-10-25:** The user had authorized publication and its documentation commit; application implementation remained on hold at that stage. Current implementation authorization is governed by ADR-0032 above. P1–P3 and their documentation checks are complete; F1–F8 and all 27 implementation-evidence rows remain pending. Wait for a later explicit implementation instruction and the capability prerequisites. No code changes, database reset, physical test, issue closure or push occurred; the user authorized committing the related publication-record changes.
