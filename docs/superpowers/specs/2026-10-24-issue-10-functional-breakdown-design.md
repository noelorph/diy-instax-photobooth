# Issue #10 functional implementation breakdown

**2026-10-27 F2 scope:** [ADR-0032](../../adr/0032-build-full-f2-with-uploads-unavailable.md) restores original full F2/#30 implementation, including the dormant editor and private delivery. Runtime uploads/attachments/replacements remain denied under ADR-0031; preserve sections/designs, retention and prior-authorized cleanup-pending safeguards. Add the visible Admin Event Media reminder about cleanup verification for interrupted/late uploads and leftover files. Supported cleanup and enabled transfer/failure/concurrency/private-delivery/playback proof remain required for full #30 acceptance; disabled-scope evidence is unchanged. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

**Status:** Capability design approved 2026-10-24; complete legacy removal within #10 selected by the user 2026-10-25. [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md) records the revised data/schema scope. The revised implementation/publication plans were approved on 2026-10-25. F1–F8 are published as #29–#36 and read-back verified. Implementation may proceed against the verified upload-disabled F2 milestone under ADR-0032; #30 stays open in #10 and is completed last before #10 closure. This documentation change performs no application changes.

**Parent:** [#10 — first-release Admin and Booth flows](https://github.com/noelorph/diy-instax-photobooth/issues/10).
**Prerequisite:** [#9 — accounting, access and printer contracts](https://github.com/noelorph/diy-instax-photobooth/issues/9), verified and closed as completed.
**Original planning baseline:** `ca03c59`, including the aligned issue-publication and implementation-status documentation. The accepted #9 candidate is `2f89a96`; see the current gates below.

**Implementation plans:** [Main implementation/publication plan and eight capability plans](../plans/2026-10-24-issue-10-implementation-plan.md), revised and approved on 2026-10-25, committed as `0bd7503`, then published as #29–#36 under the user’s explicit authorization. ADR-0032 now permits dormant full F2 work and F3–F8 against the verified upload-disabled milestone; #30 remains open in #10 and finishes last. The [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md) assigns requirements and evidence owners now. The monthly clarification below was confirmed by the user; it does not approve implementation.

## Intent and scope

Divide the approved #10 milestone into eight complete, testable capabilities. Each GitHub sub-issue owns the related UI, application integration, failure handling, authorization checks, fixtures, tests and removal work needed for its outcome. Screens and technical layers are implementation tasks within a capability, not separate issues.

The user approved this level of functionality and requested native GitHub sub-issues linked to #10. The detailed implementation/publication plans are approved. The approved documentation was committed as `0bd7503`. The user then clarified that approval recording, issue publication/dependencies, read-back and local issue-link updates may proceed, while implementation was held at that publication stage. The #9 prerequisite is satisfied; the later ADR-0032 instruction now permits dormant F2 and other #10 work with uploads unavailable, with #30 retained in #10 and completed last.

The product baseline remains [PRD.md](../../../PRD.md), [ARCHITECTURE.md](../../../ARCHITECTURE.md), [GLOSSARY.md](../../../GLOSSARY.md), [ADR-0025](../../adr/0025-package-accounting-and-booth-recovery.md), [ADR-0026](../../adr/0026-order-captures-by-shutter-time.md), and the [replacement contract](2026-10-21-package-accounting-booth-recovery-design.md). The capability breakdown changes work ownership, not release gates. The Event Media clarification below is recorded in [ADR-0027](../../adr/0027-draft-only-event-media.md) and synchronized with affected active documents. It is an approved target, not implemented behavior.

## Current implementation and gates

Version-2 database functions, trusted HTTP handlers, package/readiness types, metadata journaling, one-send dispatch and a provisional simulator exist. Reuse them. F2 has verified upload-disabled Draft/media scope, F3 package operations and F4 Booth setup have implementation evidence, and F5 Guest capture-to-print is implemented locally. F6 recovery, F7 reporting and F8 schema acceptance remain open; enabled Event Media qualification is incomplete. Authentication, Profile, shared UI and Draft validation already have implementations to preserve and complete against the approved requirements.

#9's remaining findings are resolved and independently reviewed. The accepted candidate `2f89a96` passed 901/901 tests across 53 files, the required static/build/SQL checks and all three browser gates (19 + 2 + 1 tests); see the [dated software acceptance evidence](../../implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25). GitHub #9 is closed as completed. Before any child implementation, verify that accepted revision and review record, then reconcile planned file/interface references with it. The evidence record retains earlier failed runs; this documentation update does not rerun those checks.

The #9 software prerequisite is satisfied. All children have approved, published plans. F1, F3 and F4 have implementation evidence; F5 Guest capture-to-print is implemented locally with [dated evidence and open verification limits](../../implementation/issue-10-retirement-and-acceptance.md#f5-guest-capture-to-print-evidence--2026-11-04). F6–F8 remain open; dormant full F2 work and F6–F8 may proceed under ADR-0032 with uploads unavailable, using the verified disabled F2 milestone and other capability prerequisites. F8 may complete fresh-schema/retirement/integrated acceptance for that disabled state while full media transfer/cleanup/private-delivery/playback qualification stays open under #30. #30 remains in #10 and finishes last; parent closure requires its full evidence plus affected combined-candidate rechecks. Real-printer enablement remains #17; actual-iPad production release remains #7. Simulator results satisfy neither physical gate. No hardware investigation, production activation, deployment, new product feature or repair of #9 is included in these children.

## Approaches

| Approach                                                       | Assessment                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete functional capabilities with internal task checklists | Selected by the user. Each issue has a user-visible or operational outcome, clear ownership and its own acceptance evidence across affected surfaces. Larger lifecycle/recovery issues need explicit boundaries. |
| Screen-based issues                                            | Rejected by the user's scope preference. The same capability would be spread across phone, Admin and Booth tickets, leaving integration ownership unclear.                                                       |
| Separate UI, API, database and testing issues                  | Considered and not selected. #9 already supplies the contracts, and this split would postpone proof that the integrated function works.                                                                          |

## Complete removal clarification

The user selected removal within #10 rather than a separate cleanup before it or a follow-up after it. Existing data is disposable development/test data; the client has not bought the project. Delete superseded specs/plans from the current tree and use Git history as the archive. Keep concise ADR history, #9 acceptance evidence and factual printer qualification evidence. The [ADR-0029 decision](../../adr/0029-remove-legacy-features-and-reset-development-schema.md) defines exclusions and the fresh-schema boundary.

The [publication record](../../github-issue-update-drafts.md) records the complete-removal body now published to #10 and the F1–F8 issues/dependencies. #9's unchanged historical description retains the earlier preservation policy; ADR-0029 supersedes that policy for #10. #9 remains accepted: current package/access/recovery contracts stay in scope and are reverified after #10 changes; obsolete conversion machinery is removed by F8.

## Event Media clarification

**Confirmed by the user, 2026-10-24:** upload, replacement and removal of the background image or montage are allowed only while the Event is Draft. Once Live, including while its Booth run is Paused or Finished, its media cannot change. Completed/Cancelled media remains retained under Admin access. The trusted mutation boundary must recheck Draft state when committing a media change; starting an upload before the Event goes Live cannot authorize a later replacement. Failed/stale replacement leaves the current media intact. Cleanup of unreferenced failed-upload objects is not removal of retained Event Media. The user-approved [ADR-0030](../../adr/0030-fence-event-media-commits-and-require-cleanup-proof.md) adds a scoped privileged Storage commit guard and requires actual transfer/backend cleanup proof. The current backend cannot provide that proof, so prior-authorized media-bearing Draft deletion stays pending. ADR-0032 permits full dormant Task 4 implementation while ADR-0031 preserves runtime denials. Full F2-04 cleanup proof, enabled qualifications and later explicit re-enablement remain required; add the visible Admin Event Media cleanup reminder.

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
- Use the [explicit command/environment table](../plans/2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Default production browser tests exclude both simulator files and the fresh-install file. The fresh-install config alone selects its test and owns a disposable application/database, with identity checks before mutation. F8 owns those exclusions/configuration and discovery proof; F2/F4 supply ordinary local fixture/runner changes when first needed.
- F4 names the complete setup → local sign-out → scoped `/booth` access → **fresh camera/printer readiness** acceptance case. Navigation/cleanup may release resources; old setup success never suffices for new admission. F4 wires initial-arrival equipment controls; F6 extends the same actions for later faults. The phone remains signed in.
- F2 builds the original editor/private delivery dormant while retaining unavailable sections, trusted mutation denials, Draft workflows and default behavior. Show the persistent cleanup reminder. Full #30 acceptance and later activation require real resumable transfer/interruption, trusted validation, failure/concurrency/Start/Cancel/revocation, supported transfer/backend cleanup, private delivery and playback proof. F3–F8 may use the verified upload-disabled F2 milestone; #30 stays open in #10 and is completed last before #10 closure; the limits and retention requirements remain.

Only the monthly count required a product interpretation. Environment separation makes an existing isolation requirement executable; the other additions strengthen test ownership and sequencing. The plan is approved and F1–F8 are published as #29–#36; implementation may proceed against the verified upload-disabled F2 milestone under ADR-0032; #30 stays open in #10 and is completed last before #10 closure. Simulator proof does not satisfy #17/#7.

## Eight capability issues

F1–F8 map to GitHub #29–#36. The [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract) is the single per-screen presentation reference: 22 extracted Admin PDF pages, explicitly supplementary Booth/dialog frames, capability ownership, responsive/accessibility requirements and interpretation rules. PRD/ADRs and the replacement contract govern behavior. Example content is not runtime evidence.

### F1. Admin access and account management

Complete sign-in, neutral recovery requests, password reset with confirmed global Admin-session revocation, authenticated password change, phone/theme preferences and current-device sign-out. Preserve independent Booth authority and validated exceptional return destinations. Bring the shared authenticated navigation and account forms into line with the approved responsive and accessible presentation while reusing existing components.

This issue owns account/session behavior; F4 consumes local sign-out during Booth handoff and F6 consumes authenticated exceptional recovery. It does not replace the #9 authorization fix. Acceptance covers success, invalid/expired credentials, incomplete revocation, revoked sessions, sign-out failures, saved themes and focus/status feedback.

**Design:** [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): A09–A15; A01 shared shell; D15–D17 feedback/reset states.

### F2. Event preparation and private media

Complete Draft creation, editing and discovery; Client/venue/schedule fields; venue-local validation; original whole Film Packages with derived capacity; stale-save recovery; Draft cancellation; and safe never-started Draft deletion with actual private-media cleanup and persistent pending/error feedback. Preserve existing validation and audit boundaries.

Retain planned ownership of private Event Media upload/validation, authorized Admin and scoped Booth delivery, Draft-only upload/replacement/removal, cleanup and terminal retention. Enforce the approved upload policy in ADR-0027, including the maximum 30-second montage. Include races between upload/finalization/removal and starting or cancelling the Event. For the disabled release, retain the media sections with clear unavailable feedback and deny new uploads/attachments/replacements. F5 uses default presentation; its future enabled mode consumes this delivery contract to render welcome/preview media. Failure to load optional media must support a default presentation without blocking Booth readiness. No Guest photo may use this storage path.

Original booking input belongs here; F3 owns Live package additions and operational counts. F4 owns start and Live completion/cancellation. F7 owns retained-history presentation. The implementation plan must use the approved media-policy values rather than silently inventing upload restrictions.

**Design:** [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): A02/A03/A05/A22; A04/A21 booking context; D11–D14/D17; B01/B26 as F5 delivery consumers.

### F3. Booked print capacity and Additional Film Packages

Integrate the #9 package counts into Admin Event operations: original/additional packages, total booked, confirmed, unresolved, remaining and available prints. Complete immutable positive whole-package additions with a Client-request note, stable operation identity, receipt recovery and stale/error handling. Preserve the existing #9 count shape for later Booth consumers. Package purchases change capacity only; physical loading belongs to F6.

Own the complete Admin purchase/counts workflow, including final-print holds, additions during pause or after a run finishes while the Event remains Live, and clear distinctions between remaining and available. Reuse server accounting instead of adding a second ledger. F4 consumes refreshed capacity for lifecycle guards and status; F5 owns Booth capacity presentation and the complete exhaustion → phone package addition → fresh Guest admission journey, including final-unit dispatch. F6 verifies added capacity cannot erase another blocker or pause. F3's acceptance uses real #9 mutations and state, without requiring the not-yet-integrated Booth journey. Remove the related individual-print and shared-stock product consumers through the coordinated retirement process.

**Design:** [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): A06/A16/A20; D01/D18; B19 capacity context.

### F4. Booth setup, access and lifecycle

Complete setup on the booth device, equipment/physical confirmations, the reminder-only test guidance, initial handoff and local Admin sign-out with the phone session preserved. Own the Prepared/Active/Paused/Finishing/Finished presentation, scoped state refresh, explicit phone Pause/Resume/Finish, new-run setup on a still-Live Event, and separate eligible Live Event completion/cancellation.

Own readiness continuity across the real handoff/navigation boundary: establish fresh camera/printer observations under device authority before Guest admission, including released resources, late setup callbacks and denied reacquisition. An Active run alone does not prove the Booth is ready.

Implement the reusable handoff and authenticated same-run replacement flow with the existing #9 endpoints. Replacement activates only scoped access, leaves the run Paused and rejects possible pending output or Finishing/Finished. F6 owns detecting access loss, reconciliation before requesting replacement and the complete failure-to-restoration journey. F1 supplies authentication; authentication alone grants no run transition.

Own lifecycle commands, their guards and truthful pending-work status. Stop before dispatch denies new work; dispatch authorized first may still print. F5 consumes stop state at Guest/dispatch boundaries. F6 restores readiness without clearing a stop. The known-pending lifecycle cases can be tested through real #9 contracts and seeded simulator attempts before F5/F6 integration; their complete cross-device journeys are verified by those later owners and F8.

**Design:** [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): A04/A06/A16/A19–A21; B20–B25/B30; D05–D10.

### F5. Guest capture-to-print journey

Complete welcome with private montage/image/default, pause-video and reduced-motion behavior, mirrored camera preview, Take Photo, 3–2–1, matching unmirrored crop/review, Retake, acknowledged Capture selection by shutter time, one authorized send, truthful printing and three-second completion only after ejection plus server acknowledgement.

Own 75/90-second preview/review inactivity, bounded metadata-only Capture reconciliation, image ownership/disposal and the browser integration of #9's journal, dispatch and simulator. Keep photos out of storage, server payloads, history and telemetry. Abandon unsent interactions on stop/fault; preserve independent possibly-delivered attempts. Expose the current attempt and safe stop/reconciliation boundaries needed by F6; do not introduce a second recovery state machine or claim delivery cancellation.

Own normal execution and immediate safe reaction to failure. F6 owns restoring operation after that failure. F5 includes duplicate actions, final-unit dispatch at zero available after reservation, booked-print exhaustion followed by a phone package addition and fresh admission only when ready, journal failure, response-loss protection and no automatic resend; safety cannot be deferred until F6. Use simulator events, not a new in-app Test Print feature.

**Design:** [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): B01–B09/B19/B26–B28 plus required blocked/stop states; A16/D01 phone purchase context.

### F6. Booth recovery across devices

Complete restoration after Bluetooth/camera/connectivity/server faults, page reload or journal loss, lost/expired access, reliable no-film and unknown print outcomes. Reconcile receipts and server attempts before admitting another guest. Provide only the approved local Connect to Instax / Enable Camera actions; use phone Admin for reload requests, physical-load confirmation, exceptional inspection with a reason and safe old-job clearance.

Own combined-blocker presentation and recovery sequencing. Loading film never adds capacity or resolves an unknown print; a Not printed inspection requires assurance that the old job cannot later eject. Reliable feedback may settle an attempt without inspection. Reconnecting, resolving a print or adding packages never clears an explicit pause. Reuse F4's lifecycle/handoff implementation and F5's attempt/journal boundaries. No same-photo retry or automatic resend is allowed.

For a paused Booth that loses Bluetooth, F4 owns the persisted pause and explicit guarded Resume; F6 owns reconnect/reconciliation and tests that the Booth remains Paused afterward. Similar ownership applies to Finishing, camera loss during a print and exceptional replacement into Paused.

**Design:** [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): A17–A19, A06/A16 context; B10–B25/B29/B30; D02–D08/D19.

### F7. Operational visibility and retained history

**Local software verification — 2026-11-06:** The approved read interfaces and A01/A07/A08 presentation are implemented on `55f0afd`; [F7-01–F7-06 evidence](../../implementation/issue-10-retirement-and-acceptance.md#f7-software-verification--2026-11-06) records actual read/browser/static results, private/no-store headers, revoked sessions, native browser zoom and enlarged-text reflow. This introduces no product decision or enabled-media proof. #35 closure, full #30, F6/F8, #17/#7 and parent #10 remain separate.

Complete month/upcoming/next Event summaries: monthly counts nondeleted Draft/Live/Completed by venue-local scheduled start and excludes Cancelled; total booked also excludes Cancelled; upcoming/next uses future Draft/Live starts. Include newest-first activity with 7/30-day filters and 25 rows per page, and retained Completed/Cancelled Event history and read-only detail. Show the current Live Event with authoritative package counts and independent Active/Paused/Finished/no-run state; absent Live and failed read are distinct. History offers All History / Completed / Cancelled filters, retained contacts, separate Capture totals and all-time paginated terminal activity. Keep terminal detail immutable and distinguish unavailable/failed media reads from a successful empty result; preserve its cleanup reminder. Read current package records only. Verify upstream retirement and delete only remaining F7 legacy consumers; shared SQL/generated types and fresh-schema proof remain F8-owned. Existing test records will be discarded during F8.

Consume the existing operational/audit records from #9 and the owning capabilities; each mutation owner must preserve its required audit entry. Own read projections, filtering, pagination, empty/error states and responsive presentation, including retained private Event Media under existing authorized access. Preserve the media section and unavailable status; F2 delivery/renewal implementation may proceed dormant under ADR-0032; runtime activation and enabled qualification remain gated. Do not add charts, revenue, Guest galleries or redaction/deletion of terminal Events. This issue can validate activity types with #9 operations and fixtures without waiting for every UI producer.

**Design:** [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): A01/A07/A08, A06 counts/activity and A05 unavailable-media pattern.

### F8. Fresh package-only installation, complete removal and final acceptance

Own the final removal inventory, remaining compatibility cleanup, clean migration baseline and whole-application verification for uploads unavailable. F8 can complete this scope using the verified disabled F2 milestone without full #30 closure; full media transfer/cleanup/private-delivery/playback qualification remains #30 work and the final blocker to #10 closure. Preserve every current guard and pending-cleanup safeguard in the baseline. F1–F7 delete their obsolete paths with their replacement flows; F8 proves no legacy feature survives in source, schema, routes, generated types, fixtures or maintained instructions. Old route requests fail without mutation and old RPCs do not exist.

Build the complete current schema from the final effective #9 definitions plus F1–F7 additions, preserving authorization, constraints, lock order, receipts and all current safety regressions. Remove the old migration chain in that same change. No legacy tables are created and later dropped; no old Event conversion, historical reader, snapshot or booking-review workflow is retained.

Prove installation on an empty isolated local database, then rebuild the named disposable local test stack and run the full application suite against that baseline. Keep test apps stopped during resets; verify exact local project identity and no connected/in-flight physical printer. Failed installs stay unavailable and are fixed/recreated as disposable tests. Do not build a data-preserving upgrade or rollback system.

**Design:** [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract): all applicable A/B/D references and written states; no new product screen.

## Dependencies and completion boundaries

Current dependencies reflect deliverables consumed, not separate UI/backend phases. Under ADR-0032 the verified upload-disabled F2 milestone replaces full #30 closure as the F3–F8 prerequisite. #30 remains under #10, open for full cleanup/enabled qualification, and is completed last. Other listed prerequisites remain:

| Child                                                                 | Additional child prerequisites, besides #9                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29) | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29)                                                                                                                                                                                                                                                                                                                                                                                                           |
| [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31) | Verified upload-disabled F2 milestone                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29), Verified upload-disabled F2 milestone, [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31)                                                                                                                                                                                                                                                                                             |
| [F5 #33](https://github.com/noelorph/diy-instax-photobooth/issues/33) | Verified upload-disabled F2 milestone, [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32)                                                                                                                                                                                                                                                                                                                                                                    |
| [F6 #34](https://github.com/noelorph/diy-instax-photobooth/issues/34) | [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32), [F5 #33](https://github.com/noelorph/diy-instax-photobooth/issues/33)                                                                                                                                                                                                                                                             |
| [F7 #35](https://github.com/noelorph/diy-instax-photobooth/issues/35) | Verified upload-disabled F2 milestone, [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31)                                                                                                                                                                                                                                                                                                                                                                    |
| [F8 #36](https://github.com/noelorph/diy-instax-photobooth/issues/36) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29), Verified upload-disabled F2 milestone, [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32), [F5 #33](https://github.com/noelorph/diy-instax-photobooth/issues/33), [F6 #34](https://github.com/noelorph/diy-instax-photobooth/issues/34), [F7 #35](https://github.com/noelorph/diy-instax-photobooth/issues/35) |

The approved dependency graph is not a request to delegate work now. All development uses an isolated nonproduction version-2 fixture environment. Each capability must pass its own tests and integrated function-level acceptance before its issue is done. Dependents must use those implemented interfaces, not permanent mock substitutes. F8 verifies the upload-disabled combined candidate and fresh database installation; full-media qualification stays with #30 and final #10 acceptance waits for it. Later F2 changes require affected integration/fresh-schema/current #9 rechecks before parent closure; passing an individual capability never authorizes global activation or production use. No intermediate branch or child closure is a release.

The linked plans map precise files, existing interfaces, fixtures and verification commands to each child. Shared components are extended only by the first capability that needs them. F4/F5/F6 share Booth orchestration ownership sequentially; they must extend the same state/transport implementation rather than each introducing wrappers or competing controllers. Exact internal component/file extraction remains the implementer's choice within existing repository structure.

## Retirement coverage

| Required retirement from #10                           | Owning capability; final absence/denial verification always F8               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Editable Print Allowance                               | F2 replaces Draft input/persistence; F3 replaces operational consumption     |
| Individual Additional Prints                           | F3                                                                           |
| Shared Film Stock                                      | F3 deletes stock consumers; F7 deletes legacy readers                        |
| Wasted Film and quality refunds                        | F5/F6 delete refund behavior; F7 deletes old totals                          |
| In-app Test Print and setup gate                       | F4                                                                           |
| Client Redaction and past-Event deletion               | F2 preserves Draft-only cleanup; F7 makes terminal history read-only         |
| Superseded recovery and local Admin takeover           | F4/F6; F5 removes Guest exit/pause consumers                                 |
| Temporary adapters, compatibility branches and helpers | Every owning capability; F8 traces and removes remaining cross-cutting paths |

For every row, trace controls, callers, actions, endpoints, database functions, tests and fixtures. Record concrete deletion and any shared current-contract dependency. Removing a button or revoking a legacy RPC grant is insufficient. F8 must remove the legacy schema objects and migration chain too. Preserve dated evidence, not executable compatibility.

## Shared acceptance and scope limits

Every capability follows the existing authorization/origin/private-response boundaries, stable operation IDs and receipt recovery, stale revision handling, exact copy and accessibility rules. Integrate keyboard/focus/status behavior, light/dark Admin, compact/medium/wide layouts, state-specific Booth presentation independent of the Admin preference, safe areas and reduced motion into each applicable capability. Use the [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract) under [ADR-0034](../../adr/0034-use-november-screen-reference-in-implementation-plan.md); the written failure/recovery states remain required even when absent from the PDF. Do not postpone all accessibility or privacy checks to F8.

Use `PrinterAdapterV2`, the existing version-2 simulator, `dispatchReservedAttempt`, the metadata journal and #9's server contracts. Preserve two-second visible state refresh, five-second readiness freshness, grant lifecycle and scoped evidence policy. The detailed plan must cover final capacity, lost responses, overlapping faults, stop/dispatch races, lost access and package History and fresh-install absence/security with named owners and acceptance scenarios.

Exclude #9 repairs, new accounting rules, automatic hardware qualification, optional automatic reload research, production deployment, offline operation, booking/payment, multiple Admins/booths/printers, galleries, digital delivery, editing, charts and unapproved visual redesigns. ADR-0034 records the November presentation reference; it changes none of these functional scope limits. A newly discovered product or durable technical decision is raised for focused approval under AGENTS.md and documented through the existing ADR process; it is not silently added to a child.

## GitHub publication record

Following the user's explicit clarification, #10 was updated with complete removal and fresh installation, and F1–F8 were published as native sub-issues #29–#36. Each body includes the complete approved plan, scope/non-goals, design references, reused contracts, task checklist, owned pending acceptance rows, verification environments and retirement ownership. Local paths are identified as repository references; the unpushed commit is not presented as a working remote link.

Read-back verified all eight bodies and native parents, all 27 child blocker edges (#9 plus the approved capability prerequisites), and #10's retained #9 dependency. #9's body, completed status and metadata are unchanged. The [main plan](../plans/2026-10-24-issue-10-implementation-plan.md#publication-record--completed-2026-10-25) and [publication record](../../github-issue-update-drafts.md#publication-verification-2026-10-25) contain the issue links and verification result. Children remain open, unassigned and without readiness labels. #17/#7 drafts remain unpublished.

At that 2026-10-25 publication stage, implementation remained on hold pending a later explicit user instruction and capability prerequisites; ADR-0032 now governs the authorized continuation. No code change, database reset, physical test, issue closure or push occurred in that publication step. The user subsequently authorized committing the related publication-record documentation.

## Review and approval record

Earlier pending statements below describe their dated review stage; the publication follow-up records the current status.

- 2026-10-24: User selected complete major functionality per issue with related smaller tasks, approved the eight boundaries, and requested GitHub sub-issues linked to #10.
- 2026-10-24: Independent builder review completed. Clarified F3/F5 ownership of capacity changes and Guest admission. The review identified Event Media lifecycle and upload limits as the only remaining product inputs.
- 2026-10-24: User confirmed Draft-only media upload/replacement/removal and requested practical upload defaults. The defaults were proposed at that point and subsequently approved with this design, as recorded below.
- 2026-10-24: User explicitly approved this design, including the proposed upload defaults, and requested the writing-plans skill with Ponytail required across implementation plans. ADR-0027 and affected active documents record the approved media policy.
- 2026-10-24: Detailed implementation/publication plans written, including Ponytail full in every plan; user plan approval remains pending.
- 2026-10-25: User requested the five scoped execution/meaning clarifications and explicitly chose Draft/Live/Completed inclusion with Cancelled exclusion for monthly Events. Revised plans, shared trace, environment rules, early media proof and post-handoff readiness coverage are prepared for review; this is not implementation/publication approval.
- GitHub child publication: completed and verified 2026-10-25; F1–F8 are #29–#36.
- Application implementation: plan approved; implementation may proceed against the verified upload-disabled F2 milestone under ADR-0032; #30 stays open in #10 and is completed last before #10 closure. The #9 software prerequisite is satisfied.

- 2026-10-25: User approved complete legacy removal within #10, including obsolete docs and a fresh migration baseline for disposable development/test data; requested this documentation revision and a checkpoint commit. Revised-plan approval, publication, implementation and the post-revision commit remain pending.

- 2026-10-25, approval follow-up: User approved the revised plans and requested committing the complete docs first. Earlier pending/uncommitted entries describe their original review stage. At that point, further work was held under the user's “Do not start yet” instruction; their subsequent clarification below authorizes publication only.

- 2026-10-25, publication follow-up: After documentation commit `0bd7503`, the user explicitly authorized recording approval, updating #10, creating F1–F8 with native dependencies, reading back the published scope and recording local issue links. All publication checks passed. A remaining F4 reference to retaining converted-booking review guards was corrected to removal before publication, matching ADR-0029/F2. Implementation and all 27 implementation-evidence rows remain pending.
