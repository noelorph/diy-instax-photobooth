# Issue #10 functional implementation breakdown

**Status:** Design approved by the user on 2026-10-24, including capability ownership, dependencies and upload defaults. Detailed implementation/publication plans require their own review. This is planning only.

**Parent:** [#10 — first-release Admin and Booth flows](https://github.com/noelorph/diy-instax-photobooth/issues/10).
**Prerequisite:** [#9 — accounting, access and printer contracts](https://github.com/noelorph/diy-instax-photobooth/issues/9), verified and closed as completed.
**Original planning baseline:** `ca03c59`, including the aligned issue-publication and implementation-status documentation. The accepted #9 candidate is `2f89a96`; see the current gates below.

**Implementation plans:** [Main implementation/publication plan and eight capability plans](../plans/2026-10-24-issue-10-implementation-plan.md), revised for review on 2026-10-25; approval pending. The [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md) assigns requirements and evidence owners now. The monthly clarification below was confirmed by the user; it does not approve implementation.

**Visual guide:** [One Mermaid flowchart per capability, with dependencies](../../diagrams/issue-10-functional-breakdown.md).

## Intent and scope

Divide the approved #10 milestone into eight complete, testable capabilities. Each future GitHub sub-issue owns the related UI, application integration, failure handling, authorization checks, fixtures, tests and removal work needed for its outcome. Screens and technical layers are implementation tasks within a capability, not separate issues.

The user approved this level of functionality and requested native GitHub sub-issues linked to #10. Detailed implementation and issue-publication plans have been written for review. Publish the reviewed issues after the user approves that plan. The #9 prerequisite is satisfied; this design approval does not approve the detailed plans or authorize implementation.

The product baseline remains [PRD.md](../../../PRD.md), [ARCHITECTURE.md](../../../ARCHITECTURE.md), [GLOSSARY.md](../../../GLOSSARY.md), [ADR-0025](../../adr/0025-package-accounting-and-booth-recovery.md), [ADR-0026](../../adr/0026-order-captures-by-shutter-time.md), and the [replacement contract](2026-10-21-package-accounting-booth-recovery-design.md). The capability breakdown changes work ownership, not release gates. The Event Media clarification below is recorded in [ADR-0027](../../adr/0027-draft-only-event-media.md) and synchronized with affected active documents. It is an approved target, not implemented behavior.

## Current implementation and gates

Version-2 database functions, trusted HTTP handlers, package/readiness types, metadata journaling, one-send dispatch and a provisional simulator exist. Reuse them. Current Admin operations, Draft persistence and Booth orchestration still consume legacy behavior; Dashboard remains a placeholder, and private Event Media upload/delivery is not complete. Authentication, Profile, shared UI and Draft validation already have implementations to preserve and complete against the approved requirements.

#9's remaining findings are resolved and independently reviewed. The accepted candidate `2f89a96` passed 901/901 tests across 53 files, the required static/build/SQL checks and all three browser gates (19 + 2 + 1 tests); see the [dated software acceptance evidence](../../implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25). GitHub #9 is closed as completed. Before any child implementation, verify that accepted revision and review record, then reconcile planned file/interface references with it. The evidence record retains earlier failed runs; this documentation update does not rerun those checks.

The #9 software prerequisite is satisfied. All children still await implementation/publication plan approval and their capability prerequisites. #10 finishes when the complete application and coordinated accounting cutover pass nonproduction acceptance. Real-printer enablement remains #17; actual-iPad production release remains #7. Simulator results satisfy neither physical gate. No hardware investigation, production activation, deployment, new product feature or repair of #9 is included in these children.

## Approaches

| Approach                                                       | Assessment                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete functional capabilities with internal task checklists | Selected by the user. Each issue has a user-visible or operational outcome, clear ownership and its own acceptance evidence across affected surfaces. Larger lifecycle/recovery issues need explicit boundaries. |
| Screen-based issues                                            | Rejected by the user's scope preference. The same capability would be spread across phone, Admin and Booth tickets, leaving integration ownership unclear.                                                       |
| Separate UI, API, database and testing issues                  | Considered and not selected. #9 already supplies the contracts, and this split would postpone proof that the integrated function works.                                                                          |

## Event Media clarification

**Confirmed by the user, 2026-10-24:** upload, replacement and removal of the background image or montage are allowed only while the Event is Draft. Once Live, including while its Booth run is Paused or Finished, its media cannot change. Completed/Cancelled media remains retained under Admin access. The trusted mutation boundary must recheck Draft state when committing a media change; starting an upload before the Event goes Live cannot authorize a later replacement. Failed/stale replacement leaves the current media intact. Cleanup of unreferenced failed-upload objects is not removal of retained Event Media.

**Upload defaults approved with this design, 2026-10-24:**

| Asset            | Accepted content               | Maximum file size        | Other rule                                                                      |
| ---------------- | ------------------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| Background image | JPEG, PNG, or still WebP       | 10 MB = 10,000,000 bytes | One optional still image; animated images are rejected                          |
| Welcome montage  | MP4 containing H.264/AVC video | 50 MB = 50,000,000 bytes | One optional video with positive duration up to 30 seconds; always played muted |

These are application limits, not claims that the platform requires those numbers. They allow ordinary prepared artwork and short video while bounding transfer/storage costs. Validate actual file content, supported encoding, size and duration at the trusted boundary; do not trust extension, MIME metadata or browser-reported duration alone. Invalid/unsupported files receive clear feedback and do not replace existing media. The first release does not add automatic format conversion, video trimming or image editing. An audio track need not be stripped; the montage has no audible playback or unmute action under the existing silent-montage rule.

The format recommendation follows [MDN's browser image-format guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types) and its [MP4/H.264 compatibility guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs). [Supabase supports bucket size/type restrictions](https://supabase.com/docs/guides/storage/uploads/file-limits); application validation must additionally distinguish the two asset limits. Its [upload guidance](https://supabase.com/docs/guides/storage/uploads/standard-uploads) recommends resumable uploads above 6 MB, which the later implementation plan must account for without treating a failed transfer as a successful media change. These references informed the approved defaults; they do not establish actual iPad/Bluefy playback qualification.

## Monthly count clarification

**Confirmed by the user, 2026-10-25:** Monthly Events includes nondeleted Draft, Live and Completed, excludes Cancelled, and uses scheduled start in each Event's venue-local current month. Four in-month Events with one Cancelled show **3**; Completed still counts. Total booked continues to exclude Cancelled across all months; Upcoming/Next uses future Draft/Live starts. [ADR-0028](../../adr/0028-define-monthly-event-count.md) records this clarification without changing retention or adding a metric.

## Execution and evidence clarifications

These amendments address the five requested execution/meaning gaps within the existing eight capabilities. The selected approach is to amend the current plans and keep one shared trace; separate capability issues or duplicate acceptance tables would split existing ownership. No capability dependency or product feature is added.

- Populate requirement → owner/task → test → evidence now. Each capability accumulates its own evidence; F8 audits the combined candidate. F5 explicitly owns a **new persisted Guest Session** after exhausted capacity is increased by F3; F6 owns remaining-blocker and pause variants.
- Use the [explicit command/environment table](../plans/2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Default production browser tests exclude both simulator files and the cutover file. The cutover config alone selects its test and owns a disposable application/database, with identity checks before mutation. F8 owns those exclusions/configuration and discovery proof; F2/F4 supply ordinary local fixture/runner changes when first needed.
- F4 names the complete setup → local sign-out → scoped `/booth` access → **fresh camera/printer readiness** acceptance case. Navigation/cleanup may release resources; old setup success never suffices for new admission. F4 wires initial-arrival equipment controls; F6 extends the same actions for later faults. The phone remains signed in.
- F2 proves real resumable transfer/interruption, trusted content validation, Start/Cancel races and deletion with an outstanding upload before polishing the media editor. Existing format, size, duration, Draft-only and retention requirements remain unchanged. A failed proof blocks dependent editor work rather than weakening those requirements.

Only the monthly count required a product interpretation. Environment separation makes an existing isolation requirement executable; the other additions strengthen test ownership and sequencing. Plan approval/publication remains pending. Simulator proof does not satisfy #17/#7.

## Eight capability issues

The IDs below are planning identifiers, not assigned GitHub numbers. All design references are under [docs/design/2026-10-21-package-recovery](../../design/2026-10-21-package-recovery/README.md). Every child must cite its specific sheets, the [screen map](../../design/2026-10-21-package-recovery/screen-map.md) and [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md). Exact copy, behavior and tokens come from the active documents, not raster artifacts.

### F1. Admin access and account management

Complete sign-in, neutral recovery requests, password reset with confirmed global Admin-session revocation, authenticated password change, phone/theme preferences and current-device sign-out. Preserve independent Booth authority and validated exceptional return destinations. Bring the shared authenticated navigation and account forms into line with the approved responsive and accessible presentation while reusing existing components.

This issue owns account/session behavior; F4 consumes local sign-out during Booth handoff and F6 consumes authenticated exceptional recovery. It does not replace the #9 authorization fix. Acceptance covers success, invalid/expired credentials, incomplete revocation, revoked sessions, sign-out failures, saved themes and focus/status feedback.

**Design:** `admin/08-authentication.png`, `admin/10-profile.png`, `admin/11-dialogs-feedback.png`; shared shell in `admin/01-dashboard.png`.

### F2. Event preparation and private media

Complete Draft creation, editing and discovery; Client/venue/schedule fields; venue-local validation; original whole Film Packages with derived capacity; stale-save recovery; converted-Draft booking review; Draft cancellation; and safe never-started Draft deletion with actual private-media cleanup and persistent pending/error feedback. Preserve existing validation and audit boundaries.

Own private Event Media upload/validation, authorized Admin and scoped Booth delivery, Draft-only upload/replacement/removal, cleanup and terminal retention. Enforce the approved upload policy in ADR-0027, including the maximum 30-second montage. Include races between upload/finalization/removal and starting or cancelling the Event. F5 consumes this delivery contract to render welcome/preview media. Failure to load optional media must support a default presentation without blocking Booth readiness. No Guest photo may use this storage path.

Original booking input belongs here; F3 owns Live package additions and operational counts. F4 owns start and Live completion/cancellation. F7 owns retained-history presentation. The implementation plan must use the approved media-policy values rather than silently inventing upload restrictions.

**Design:** `admin/02-events.png`, `admin/03-event-editor.png`, booking/media portions of `admin/04-draft-setup.png`, `admin/11-dialogs-feedback.png`; serving contract used by `booth/01-welcome-capture.png`.

### F3. Booked print capacity and Additional Film Packages

Integrate the #9 package counts into Admin Event operations: original/additional packages, total booked, confirmed, unresolved, remaining and available prints. Complete immutable positive whole-package additions with a Client-request note, stable operation identity, receipt recovery and stale/error handling. Preserve the existing #9 count shape for later Booth consumers. Package purchases change capacity only; physical loading belongs to F6.

Own the complete Admin purchase/counts workflow, including final-print holds, additions during pause or after a run finishes while the Event remains Live, and clear distinctions between remaining and available. Reuse server accounting instead of adding a second ledger. F4 consumes refreshed capacity for lifecycle guards and status; F5 owns Booth capacity presentation and the complete exhaustion → phone package addition → fresh Guest admission journey, including final-unit dispatch. F6 verifies added capacity cannot erase another blocker or pause. F3's acceptance uses real #9 mutations and state, without requiring the not-yet-integrated Booth journey. Remove the related individual-print and shared-stock product consumers through the coordinated retirement process.

**Design:** `admin/05-live-event.png`, `admin/06-phone-management.png`, `admin/11-dialogs-feedback.png`, capacity state in `booth/04-printer-and-capacity.png`.

### F4. Booth setup, access and lifecycle

Complete setup on the booth device, equipment/physical confirmations, the reminder-only test guidance, initial handoff and local Admin sign-out with the phone session preserved. Own the Prepared/Active/Paused/Finishing/Finished presentation, scoped state refresh, explicit phone Pause/Resume/Finish, new-run setup on a still-Live Event, and separate eligible Live Event completion/cancellation.

Own readiness continuity across the real handoff/navigation boundary: establish fresh camera/printer observations under device authority before Guest admission, including released resources, late setup callbacks and denied reacquisition. An Active run alone does not prove the Booth is ready.

Implement the reusable handoff and authenticated same-run replacement flow with the existing #9 endpoints. Replacement activates only scoped access, leaves the run Paused and rejects possible pending output or Finishing/Finished. F6 owns detecting access loss, reconciliation before requesting replacement and the complete failure-to-restoration journey. F1 supplies authentication; authentication alone grants no run transition.

Own lifecycle commands, their guards and truthful pending-work status. Stop before dispatch denies new work; dispatch authorized first may still print. F5 consumes stop state at Guest/dispatch boundaries. F6 restores readiness without clearing a stop. The known-pending lifecycle cases can be tested through real #9 contracts and seeded simulator attempts before F5/F6 integration; their complete cross-device journeys are verified by those later owners and F8.

**Design:** `admin/04-draft-setup.png`, `admin/05-live-event.png`, `admin/06-phone-management.png`, `admin/11-dialogs-feedback.png`, `booth/05-pause-finish-access.png`.

### F5. Guest capture-to-print journey

Complete welcome with private montage/image/default, pause-video and reduced-motion behavior, mirrored camera preview, Take Photo, 3–2–1, matching unmirrored crop/review, Retake, acknowledged Capture selection by shutter time, one authorized send, truthful printing and three-second completion only after ejection plus server acknowledgement.

Own 75/90-second preview/review inactivity, bounded metadata-only Capture reconciliation, image ownership/disposal and the browser integration of #9's journal, dispatch and simulator. Keep photos out of storage, server payloads, history and telemetry. Abandon unsent interactions on stop/fault; preserve independent possibly-delivered attempts. Expose the current attempt and safe stop/reconciliation boundaries needed by F6; do not introduce a second recovery state machine or claim delivery cancellation.

Own normal execution and immediate safe reaction to failure. F6 owns restoring operation after that failure. F5 includes duplicate actions, final-unit dispatch at zero available after reservation, booked-print exhaustion followed by a phone package addition and fresh admission only when ready, journal failure, response-loss protection and no automatic resend; safety cannot be deferred until F6. Use simulator events, not a new in-app Test Print feature.

**Design:** `booth/01-welcome-capture.png`, `booth/02-review-printing-complete.png`, applicable stop/blocked presentation in `booth/04-printer-and-capacity.png` and `booth/05-pause-finish-access.png`.

### F6. Booth recovery across devices

Complete restoration after Bluetooth/camera/connectivity/server faults, page reload or journal loss, lost/expired access, reliable no-film and unknown print outcomes. Reconcile receipts and server attempts before admitting another guest. Provide only the approved local Connect to Instax / Enable Camera actions; use phone Admin for reload requests, physical-load confirmation, exceptional inspection with a reason and safe old-job clearance.

Own combined-blocker presentation and recovery sequencing. Loading film never adds capacity or resolves an unknown print; a Not printed inspection requires assurance that the old job cannot later eject. Reliable feedback may settle an attempt without inspection. Reconnecting, resolving a print or adding packages never clears an explicit pause. Reuse F4's lifecycle/handoff implementation and F5's attempt/journal boundaries. No same-photo retry or automatic resend is allowed.

For a paused Booth that loses Bluetooth, F4 owns the persisted pause and explicit guarded Resume; F6 owns reconnect/reconciliation and tests that the Booth remains Paused afterward. Similar ownership applies to Finishing, camera loss during a print and exceptional replacement into Paused.

**Design:** `admin/07-phone-recovery.png`, `admin/06-phone-management.png`, `admin/11-dialogs-feedback.png`, `booth/03-connection-recovery.png`, `booth/04-printer-and-capacity.png`, `booth/05-pause-finish-access.png`, `journeys/01-ipad-phone-recovery.png`.

### F7. Operational visibility and retained history

Complete month/upcoming/next Event summaries: monthly counts nondeleted Draft/Live/Completed by venue-local scheduled start and excludes Cancelled; total booked also excludes Cancelled; upcoming/next uses future Draft/Live starts. Include newest-first activity with 7/30-day filters and 25 rows per page, and retained Completed/Cancelled Event history and read-only detail. Show package-era totals alongside clearly labeled original legacy accounting without fabricated conversion or reconstituting previously removed data.

Consume the existing operational/audit records from #9 and the owning capabilities; each mutation owner must preserve its required audit entry. Own read projections, filtering, pagination, empty/error states and responsive presentation, including retained private Event Media via F2. Do not add charts, revenue, Guest galleries or redaction/deletion of terminal Events. This issue can validate activity types with #9 operations and fixtures without waiting for every UI producer.

**Design:** `admin/01-dashboard.png`, `admin/09-history.png`, read-only Event-detail and activity patterns in `admin/05-live-event.png`.

### F8. Coordinated cutover, retirement and final acceptance

Own the complete retirement inventory, coordinated application/database switch, nonproduction rehearsal, preservation evidence and final acceptance across all seven capabilities. Use #9's preflight/activation safeguards and forward migrations; do not rewrite applied migrations. Stop new starts, settle legacy work under its original contract, finish old runs and complete/cancel finished-but-Live Events before conversion. Complete pending legacy media cleanup. Verify backup/history, eligible Draft conversion and explicit mismatch review. Never drop unresolved holds or guess a NotPrinted outcome.

Verify denial of every obsolete mutation surface from stale clients, server actions, HTTP endpoints and application-accessible database functions. Each capability supplies its caller/control/test cleanup; F8 owns final coordinated removal, cross-cutting compatibility remnants and whole-application proof. Keep only required historical readers, applied migrations, audit records and explicitly nonproduction qualification tooling. A retained harness must not expose retired product operations or authorize physical release.

Rehearse recovery before and after activation. A verified pre-cutover backup may be restored only when no version-2 writes exist; after version-2 writes, keep the application unavailable and use a reviewed forward fix. Record the final tested revision, commands and actual outcomes. Required unit, integration/database, browser, lint, types, formatting and build checks must pass. No production promotion or physical trial is performed by this child.

**Design:** The complete [17-sheet gallery](../../design/2026-10-21-package-recovery/index.html) and screen map form the acceptance reference, with `journeys/01-ipad-phone-recovery.png` for combined-device scenarios. F8 adds no product screen.

## Dependencies and completion boundaries

Approved dependencies reflect deliverables consumed, not separate UI/backend phases:

| Child | Additional child prerequisites, besides #9 |
| ----- | ------------------------------------------ |
| F1    | None                                       |
| F2    | F1                                         |
| F3    | F2                                         |
| F4    | F1, F2, F3                                 |
| F5    | F2, F4                                     |
| F6    | F3, F4, F5                                 |
| F7    | F2, F3                                     |
| F8    | F1–F7                                      |

The approved dependency graph is not a request to delegate work now. All development uses an isolated nonproduction version-2 fixture environment. Each capability must pass its own tests and integrated function-level acceptance before its issue is done. Dependents must use those implemented interfaces, not permanent mock substitutes. F8 verifies the combined release candidate and cutover; passing an individual capability never authorizes global activation or production use. No intermediate branch or child closure is a release.

The final plan will map precise files, existing interfaces, fixtures and verification commands to each child. Shared components are extended only by the first capability that needs them. F4/F5/F6 share Booth orchestration ownership sequentially; they must extend the same state/transport implementation rather than each introducing wrappers or competing controllers. Exact internal component/file extraction remains the implementer's choice within existing repository structure.

## Retirement coverage

| Required retirement from #10                           | Owning capability; final denial/cutover verification always F8                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Editable Print Allowance                               | F2 replaces Draft input/persistence; F3 replaces operational consumption               |
| Individual Additional Prints                           | F3                                                                                     |
| Shared Film Stock                                      | F3 removes active accounting consumers; F7 preserves labeled historical reading only   |
| Wasted Film and quality refunds                        | F5/F6 remove current output/recovery behavior; F7 preserves original historical totals |
| In-app Test Print and setup gate                       | F4                                                                                     |
| Client Redaction and past-Event deletion               | F2 preserves Draft-only cleanup; F7 makes terminal history read-only                   |
| Superseded recovery and local Admin takeover           | F4/F6; F5 removes Guest exit/pause consumers                                           |
| Temporary adapters, compatibility branches and helpers | Every owning capability; F8 traces and removes remaining cross-cutting paths           |

For every row, trace controls, callers, actions, endpoints, database functions, tests and fixtures. Record removal versus necessary historical retention. Removing a visible button alone is not completion. Coordinate destructive runtime retirement with F8 so legacy settlement remains possible before conversion and obsolete writes are denied after it.

## Shared acceptance and scope limits

Every capability follows the existing authorization/origin/private-response boundaries, stable operation IDs and receipt recovery, stale revision handling, exact copy and accessibility rules. Integrate keyboard/focus/status behavior, light/dark Admin, compact/medium/wide layouts, Booth dark theme, safe areas and reduced motion into each applicable capability. Do not postpone all accessibility or privacy checks to F8.

Use `PrinterAdapterV2`, the existing version-2 simulator, `dispatchReservedAttempt`, the metadata journal and #9's server contracts. Preserve two-second visible state refresh, five-second readiness freshness, grant lifecycle and scoped evidence policy. The detailed plan must cover final capacity, lost responses, overlapping faults, stop/dispatch races, lost access and history/cutover preservation with named owners and acceptance scenarios.

Exclude #9 repairs, new accounting rules, automatic hardware qualification, optional automatic reload research, production deployment, offline operation, booking/payment, multiple Admins/booths/printers, galleries, digital delivery, editing, charts and redesigned mockups. A newly discovered product or durable technical decision is raised for focused approval under AGENTS.md and documented through the existing ADR process; it is not silently added to a child.

## GitHub publication deliverable

After plan approval, create eight native sub-issues of #10, each with a parent link, purpose, complete scope/non-goals, specific mockup references, reused contracts, implementation tasks, dependencies, acceptance tests, retirement ownership and completion criteria. Add native blocking dependencies on #9 and the approved prerequisite children. Keep #10's existing #9 dependency and published milestone scope intact. Do not mark children ready for implementation while their gates remain unmet, close issues, publish #17/#7 drafts or change unrelated issue metadata.

The local plan records the assigned issue numbers/URLs and verifies all parent links/dependencies by read-back. Reuse an already-created matching child after a partial publication; do not duplicate it. The user must approve the complete plan before publication; no extra publication confirmation is needed after that approval because it is already requested.

## Review and approval record

- 2026-10-24: User selected complete major functionality per issue with related smaller tasks, approved the eight boundaries, and requested GitHub sub-issues linked to #10.
- 2026-10-24: Independent builder review completed. Clarified F3/F5 ownership of capacity changes and Guest admission. The review identified Event Media lifecycle and upload limits as the only remaining product inputs.
- 2026-10-24: User confirmed Draft-only media upload/replacement/removal and requested practical upload defaults. The defaults were proposed at that point and subsequently approved with this design, as recorded below.
- 2026-10-24: User explicitly approved this design, including the proposed upload defaults, and requested the writing-plans skill with Ponytail required across implementation plans. ADR-0027 and affected active documents record the approved media policy.
- 2026-10-24: Detailed implementation/publication plans written, including Ponytail full in every plan; user plan approval remains pending.
- 2026-10-25: User requested the five scoped execution/meaning clarifications and explicitly chose Draft/Live/Completed inclusion with Cancelled exclusion for monthly Events. Revised plans, shared trace, environment rules, early media proof and post-handoff readiness coverage are prepared for review; this is not implementation/publication approval.
- GitHub child publication: pending.
- Application implementation: awaits implementation/publication plan approval; not authorized by this planning task. The #9 software prerequisite is satisfied.
