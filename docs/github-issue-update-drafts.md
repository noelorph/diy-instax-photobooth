# GitHub issue publication record and remaining drafts

## F2 temporary media scope publication — 2026-10-27

The user authorized [ADR-0031](adr/0031-temporarily-disable-event-media-uploads.md), synchronized documentation, issue #30 updates and continued F2 implementation. [Issue #30](https://github.com/noelorph/diy-instax-photobooth/issues/30) now contains the current disabled-upload scope and verified local acceptance checklist, while retaining its entire original enabled-media plan in a clearly historical collapsed section. GitHub body read-back matched the submitted text exactly. #9 and prerequisite #29 were confirmed closed; #30 remains open pending the user’s closure/follow-up tracking decision.

Uploads remain temporarily unavailable; full feature/design and re-enablement qualification are preserved. The previous Task4 blanket hold is replaced by current disabled presentation and deferred enabled functionality. Prior media-bearing deletion stays pending without cleanup proof. Publication is not a test pass, release, deployment or issue completion. #30 closure/follow-up tracking awaits the focused user decision; no separate follow-up issue has been created.

**Final F2 update — 2026-10-27:** Candidate `9d6286f` implements the current upload-disabled scope. The [dated acceptance record](implementation/issue-30-disabled-media-acceptance.md) preserves the broader run’s three failures, their passing 13-case correction run, browser results, lint limits and deferred media proofs. The current six acceptance items were updated and a [completion report](https://github.com/noelorph/diy-instax-photobooth/issues/30#issuecomment-6433031240) posted. Both full body and comment matched exact GitHub read-back; issue state remains OPEN. The original enabled-media plan is unchanged in its historical section. No follow-up issue, closure, push, deployment or re-enablement occurred.

**Published and read-back verified, 2026-10-25:** #10 contains the approved complete-removal scope and eight native children, F1–F8 (#29–#36). The user approved the plans, requested documentation commit `0bd7503` first, then explicitly authorized issue publication and this local record. Implementation remains on hold. #9 stays closed as completed; #10 and all children stay open. #17/#7 drafts below remain unpublished. The user subsequently authorized committing these publication records; nothing was pushed.

## Issue #9 accepted prerequisite

[#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) passed on `2f89a96afee2dfdc2a1d540cbcc3c0ee4380bbbb`: 901/901 tests across 53 files, static/build/SQL checks and 19 + 2 + 1 browser checks. Its [dated local evidence](implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25) and [published acceptance](https://github.com/noelorph/diy-instax-photobooth/issues/9#issuecomment-6386836261) remain the acceptance record, including failed earlier attempts and corrections.

Keep its current package accounting, lifecycle, current authorization after locks, scoped grants, receipts, concurrency, one-send dispatch, readiness, reconciliation and simulator evidence policy in #10. Do not reopen #9 or rewrite its historical result. Its legacy conversion/snapshot safeguards were accepted under the former data-preservation decision; [ADR-0029](adr/0029-remove-legacy-features-and-reset-development-schema.md) now schedules those obsolete parts for removal in #10.

## Published wording and current scope

#10 now requires complete legacy removal and a fresh package-only installation under ADR-0029. F1–F7 remove their obsolete application paths; F8 completes shared removal and replaces the migration chain while preserving and reverifying current #9 contracts. No legacy History reader, Draft conversion/review, snapshot/import, activation/preflight machinery or version-1 fallback is a completion requirement.

#9's unchanged body retains the preservation policy under which its work was accepted. That is dated evidence, not current #10 scope; ADR-0029 supersedes those clauses without rewriting #9's result. #10 publication is not implementation acceptance.

## Publication verification 2026-10-25

Read-back at **2026-10-25 13:42 UTC** compared the complete live bodies with the prepared approved text and checked GitHub's native parent/dependency APIs:

- #10 matches the approved complete-removal body and published capability map. Its title, open state, label, assignees and milestone are unchanged; its native prerequisite remains #9.
- F1–F8 (#29–#36) match their full plan/scope/task/verification snapshots and owned acceptance rows. All eight have native parent #10 and exactly the approved **27 child blocker edges**, including the completed #9 on every child.
- All **23 implementation tasks** and **27 acceptance rows** remain pending. No readiness labels or assignees were added; no child was closed.
- #9's body, completed state, metadata and update timestamp are unchanged. Its accepted evidence remains linked in every child.
- The pre-publication reread corrected one F4 instruction that still said to retain converted-booking review guards; it now removes them with F2's retired review workflow, as required by ADR-0029.
- The [main plan's publication table](superpowers/plans/2026-10-24-issue-10-implementation-plan.md#publication-record--completed-2026-10-25) and each child plan record the issue URLs and prerequisites. Current status docs distinguish completed publication from implementation still on hold.

The child bodies reproduce approved plan/trace content because the local documentation commit has not been pushed. Repository references are explicitly paths to read locally; no unavailable branch link is the only instruction. The local acceptance trace remains the source of execution evidence. No code, database, physical test or hosted deployment action accompanied publication.

## Issue #10 published body

The following is the body read back from [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10); heading levels are nested here for this document. The issue links below are the resulting native children, not completed work.

### Goal

Complete the first-release Admin and Booth application using the approved package-accounting and recovery contracts. Use a nonproduction simulated printer for software development and testing. Remove superseded product behavior and its related UI, application code, and mutation paths and finish with a verified fresh package-only database.

### Status and implementation gate

The [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) software prerequisite is satisfied, and #9 is closed as completed. The package-addition/reload authorization finding and Profile focus assertion are resolved and independently reviewed. Reviewed candidate `2f89a96afee2dfdc2a1d540cbcc3c0ee4380bbbb` passed 901/901 tests across 53 files, required static/build/SQL checks, and all three browser gates (19 + 2 + 1 tests). See the [published #9 acceptance evidence](https://github.com/noelorph/diy-instax-photobooth/issues/9#issuecomment-6386836261).

The eight-capability design and complete legacy-removal decision are approved. The revised implementation/publication plan was approved on 2026-10-25; #10 implementation has not started. The eight capability sub-issues (F1–F8) were published on 2026-10-25 following explicit user authorization. Implementation remains on hold until a later explicit user instruction and the capability prerequisites are satisfied. The local plan is `docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md`.

This issue remains open for the complete application integration, complete legacy removal, fresh installation, and acceptance below. #9's software verification does not establish #10's integrated acceptance or the #17/#7 physical gates.

### Complete first-release scope

- **Admin application:** authentication and password recovery; Dashboard; Events listing, creation, editing, setup, and detail; History; and Profile, including local sign-out.
- **Package accounting:** derive capacity from original and Additional Film Packages at ten prints each. Show confirmed, pending, remaining, and available counts appropriately. Keep package purchases separate from physical film loading.
- **Initial Booth handoff:** complete setup on the iPad, sign Admin out locally on that device, activate scoped Booth access, and enter `/booth`. Preserve the phone’s Admin session.
- **Guest journey:** welcome with private Event Media or default presentation; live preview; capture and 3–2–1 countdown; review; Retake; printing; completion; and return to a fresh welcome. Implement approved crop, Capture selection, inactivity, and photo-disposal rules.
- **Phone operations:** Additional Film Packages, reload requests and physical reload confirmation, exceptional inspection with a required reason, Pause, Resume, Finish Booth, and separate Event completion.
- **Recovery:** camera, Bluetooth, network/server, page-reload, and access-loss recovery. Preserve pending attempts and explicit pauses. Routine recovery stays in Booth Mode; exceptional access replacement follows protected setup and returns the run to Paused.
- **Privacy and presentation:** keep Guest photo bytes in memory/direct printer transport only; provide private, validated Event Media; enforce Admin/Booth access separation; meet the design system’s accessibility and responsive-layout requirements.
- **Simulation and verification:** use a nonproduction printer simulator for complete integrated journeys and deterministic failure scenarios. Distinguish acceptance from ejection and uncertainty; never automatically resend an ambiguous attempt.

Setup retains only the reminder: **“Always test the printer before starting Booth Mode.”**

### Required retirement

Delete all of the following from maintained product code, schema, migrations, fixtures and obsolete specifications:

1. Editable Print Allowance.
2. Individual Additional Prints.
3. Shared Film Stock.
4. Wasted Film and quality-refund behavior.
5. In-app Test Print and its setup gate.
6. Client Redaction and past-Event deletion.
7. Superseded Booth recovery and local Admin takeover flows.
8. Legacy adapters, compatibility branches and helpers, including old History and conversion/review machinery.

For **each item**, trace its controls, callers, server actions, endpoints, database functions, tests, and fixtures. Record concrete deletion and surviving current-contract dependencies. Keep dated #9/physical evidence, not legacy readers or executable compatibility.

Remove obsolete application paths with their owning capability, then finish shared/schema removal in F8. Hiding controls or revoking grants alone is insufficient. Prove dedicated old routes and database objects are absent, stale calls fail without mutation, and current contracts still pass.

### Complete removal and fresh installation

- Existing data is disposable development/test data; the client has not bought the project. ADR-0029 supersedes legacy preservation/conversion requirements.
- F1–F7 remove obsolete code with their current flows. Delete features without replacements once shared dependencies are handled.
- Remove legacy History readers, Draft conversion/review, snapshots, version-1 fallback branches, owner activation/preflight machinery and compatibility endpoints. Keep current version-2 protocol identifiers where the approved contract requires them.
- F8 replaces the old migration chain with a complete package-only baseline that installs on an empty database without creating legacy objects. Reproduce final #9/F1–F7 definitions, constraints, RLS, grants, authorization rechecks, receipts and locking; do not keep only the newest migration file.
- Rebuild only identified disposable local test projects, with test apps stopped and physical printers disconnected/quiescent. Do not import legacy records or guess a physical outcome to clear a hold. Runtime uncertain-print safety is unchanged.
- Preserve current package-era Completed/Cancelled History and private media, plus safe never-started Draft deletion. This ongoing retention does not apply to discarded pre-reset test records.
- Preserve accepted #9 evidence and current contracts. Reverify the complete current suite after the baseline changes; historical #9 passes do not certify #10.
- Prove absence/security, independent fresh installation and all integrated journeys on the final baseline. No hosted reset or deployment is part of #10.

### Acceptance

- [x] #9’s software prerequisite is satisfied before #10 implementation; the reviewed revision and [acceptance evidence](https://github.com/noelorph/diy-instax-photobooth/issues/9#issuecomment-6386836261) are recorded.
- [ ] All first-release Admin, Guest, phone-operation, and recovery flows pass integrated nonproduction acceptance.
- [ ] Accounting and recovery checks cover final-print capacity, pending holds, duplicates, lost responses, stale state, overlapping faults, stop/dispatch races, access loss, and no automatic resend.
- [ ] Every retirement item has a completed trace and removal record, with passing absence and stale-request denial tests.
- [ ] The clean package-only baseline passes empty-database installation, schema/RLS/grant checks and all current contract regressions; no old migration, reader or conversion path remains.
- [ ] Privacy, private Event Media, authorization, accessibility, and responsive layouts pass their required checks.
- [ ] Required unit, database/integration, browser, lint, type, formatting, and build checks pass for the final reviewed candidate, with recorded evidence.
- [ ] Simulation remains nonproduction and cannot authorize real-printer operation.

### Completion and external gates

Complete when the full application, complete legacy removal and fresh package-only installation pass nonproduction acceptance on the final reviewed candidate.

Closing this issue does not authorize real-printer enablement or production launch; those remain gated by [#17](https://github.com/noelorph/diy-instax-photobooth/issues/17) and [#7](https://github.com/noelorph/diy-instax-photobooth/issues/7), respectively.

Real-printer enablement requires physically qualified automatic normal full-ejection completion and safe recovery. Phone inspection is exceptional recovery, not routine confirmation after every print. Printer-reported count is neither physical inventory nor proof of a loaded ten-sheet package.

### Detailed references

- `PRD.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, and `GLOSSARY.md`
- `docs/adr/0025-package-accounting-and-booth-recovery.md`
- `docs/adr/0026-order-captures-by-shutter-time.md`
- `docs/adr/0029-remove-legacy-features-and-reset-development-schema.md`
- `docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md`
- `docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md`
- `docs/booth-user-flow.md`
- `docs/qualification/booth-recovery-proof-checklist.md`

### Capability sub-issues and prerequisites

All eight are native sub-issues of #10. Each also records the already-completed #9 as a satisfied native dependency. The table lists additional prerequisites; all implementation and acceptance evidence remains pending. No child is assigned or marked ready for implementation.

| Capability                                                           | Sub-issue                                                          | Prerequisites besides #9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1: Complete Admin access and account management                     | [#29](https://github.com/noelorph/diy-instax-photobooth/issues/29) | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F2: Complete Event preparation and private media                     | [#30](https://github.com/noelorph/diy-instax-photobooth/issues/30) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F3: Complete booked capacity and Additional Film Packages            | [#31](https://github.com/noelorph/diy-instax-photobooth/issues/31) | [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F4: Complete Booth setup, access and lifecycle                       | [#32](https://github.com/noelorph/diy-instax-photobooth/issues/32) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29), [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31)                                                                                                                                                                                                                                                                                             |
| F5: Complete the Guest capture-to-print journey                      | [#33](https://github.com/noelorph/diy-instax-photobooth/issues/33) | [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32)                                                                                                                                                                                                                                                                                                                                                                    |
| F6: Complete Booth recovery across devices                           | [#34](https://github.com/noelorph/diy-instax-photobooth/issues/34) | [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32), [F5 #33](https://github.com/noelorph/diy-instax-photobooth/issues/33)                                                                                                                                                                                                                                                                                             |
| F7: Complete operational visibility and retained history             | [#35](https://github.com/noelorph/diy-instax-photobooth/issues/35) | [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31)                                                                                                                                                                                                                                                                                                                                                                    |
| F8: Complete legacy removal, fresh installation and final acceptance | [#36](https://github.com/noelorph/diy-instax-photobooth/issues/36) | [F1 #29](https://github.com/noelorph/diy-instax-photobooth/issues/29), [F2 #30](https://github.com/noelorph/diy-instax-photobooth/issues/30), [F3 #31](https://github.com/noelorph/diy-instax-photobooth/issues/31), [F4 #32](https://github.com/noelorph/diy-instax-photobooth/issues/32), [F5 #33](https://github.com/noelorph/diy-instax-photobooth/issues/33), [F6 #34](https://github.com/noelorph/diy-instax-photobooth/issues/34), [F7 #35](https://github.com/noelorph/diy-instax-photobooth/issues/35) |

## Issue #17 — physical printer evidence

### Proposed replacement scope

Keep the existing report's observed successes and failures intact. Continue physical investigation under `docs/qualification/booth-recovery-proof-checklist.md`. Seven matching fresh-film prints and the used-sheet diagnostics do not prove reliable automatic full ejection. Printer count is diagnostic only. The original complete fresh-film sequence remains unproven.

Automatic normal completion is mandatory. Remove the old proposal that routine manual production completion could substitute. Phone Printed / Not printed is exceptional unknown-outcome recovery only; its inspection and safe-clearing procedure also needs validation. Automatic reload detection is optional; physically loading and confirming from the phone is the approved fallback after qualification.

### Proposed acceptance checklist

- [ ] P1/P2: reliable full-ejection correlation and complete fresh-film sequence.
- [ ] P3/P4/P10/P11: no-film classification or qualified generic-fault fallback, manual reload/inspection and safe idle/new-job readiness.
- [ ] P6–P9: Bluetooth, internet, camera and reload/crash boundaries with no duplicate physical send.
- [ ] P5: investigate automatic reload only as optional capability; never infer ten loaded usable sheets from counter reset.
- [ ] Record evidence versions, precision, failures and supported hardware limits. Keep real Booth disabled until mandatory completion/recovery requirements pass.

## Issue #7 — actual iPad release trial

### Proposed replacement scope

Validate the implemented target on the actual iPad A16, with recorded model, iPadOS, Bluefy and Mini Link 3 firmware. iPhone evidence is development evidence only. Require automatic normal completion and qualified recovery, then test portrait crop, camera/Bluetooth coexistence, power, Guided Access guest isolation and recovery controls while locked.

### Proposed acceptance checklist

- [ ] P12: actual iPad end-to-end Guest flow and multiple fresh-film sessions including Retake.
- [ ] P13: exhaust booked package prints; add a whole package on phone; physical reload is separate from capacity.
- [ ] P14: phone Pause/Resume/Finish, pending print recovery and separate Complete Event; retain explicit pause and keep iPad in Booth Mode.
- [ ] Bluetooth/internet/camera/page-reload faults recover with safe outcomes and no auto resend; grant loss remains exceptional protected setup.
- [ ] No in-app test gate, inventory/quality corrections or terminal redaction/deletion controls; privacy and history intact.
- [ ] Resolve affected shared or device-specific defects and repeat the relevant trials before release. Do not close based on simulator success.

## Cross-issue cleanup notes

For the remaining drafts, replace stale scope references to ADR-0014 when the intended evidence checkpoint is ADR-0021, now narrowed by ADR-0025. Do not reintroduce closed issue #8 as a new pre-build blocker; current contracts supersede its old recovery policy. Preserve traceability to original decisions. The earlier #9/#10 publication preserved unrelated issue metadata. The revised #10 body above is still local; publish it only under the approved publication plan. Do not change #9's accepted state or publish #17/#7 as part of this revision.
