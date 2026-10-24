# GitHub issue updates — publication record and remaining drafts

**Status:** The user-approved replacement descriptions for [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9) and [#10](https://github.com/noelorph/diy-instax-photobooth/issues/10) were published and read-back verified on 2026-10-23. Both issues were open at that publication. The acceptance update below records #9's subsequent closure; #10's native dependency on #9 is retained. The #17/#7 sections remain unpublished drafts prepared 2026-10-21 from the approved [contract](superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md), [ADR-0025](adr/0025-package-accounting-and-booth-recovery.md) and [proof checklist](qualification/booth-recovery-proof-checklist.md). See the [approved publication plan](superpowers/plans/2026-10-23-issue-9-10-publication.md).

The #9/#10 descriptions below are the approved 2026-10-23 body text, retained as history; local section headings are one level deeper than their GitHub counterparts. Unpublished contract documents are referenced by repository path rather than broken GitHub links. Remaining draft publication requires separate authorization. Preserve old comments as dated history, re-read live issue state before writing, and keep unrelated content. Do not claim code completion from description approval. Use `gh` with a body file, not inline multiline shell interpolation.

## Acceptance update — 2026-10-25

After user approval, #9's description was updated from the prepared acceptance draft, the [verification summary](https://github.com/noelorph/diy-instax-photobooth/issues/9#issuecomment-6386836261) was published, and #9 was closed as completed. #10's description now records the satisfied #9 software prerequisite and keeps its own implementation/publication plan awaiting approval. Read-back verified both bodies, the acceptance comment, all five #9 acceptance checks, and only the #9 prerequisite checked in #10. Titles, labels, assignees and milestones were preserved. The dependency still links #10 to the closed #9; #10 has zero open dependency blockers. No child issues or #17/#7 drafts were published.

The accepted code remains `2f89a96`, with evidence in documentation commit `87e5447`. The tracker update did not rerun tests, implement #10, enable real printing or activate hosted infrastructure.

## Issue #9 — accounting, access and printer contracts

### Goal

Complete and verify the approved version-2 accounting, access, recovery, and provisional printer contracts that the first-release Admin and Booth application will use.

### Current status

Version-2 database contracts, trusted handlers, and provisional simulator code exist for local verification. The remaining work is to resolve outstanding findings and establish passing verification; describing the entire implementation as following the previous model is no longer accurate.

The outstanding work includes:

- Fix the authorization gap in package additions and reload actions, with regression coverage.
- Obtain a passing full-suite verification result on the final reviewed revision.
- Complete review and record evidence confirming that the findings are resolved and required verification passes.

The latest recorded full-suite run passed 885/886 tests and exited unsuccessfully. A passing isolated rerun does not satisfy the full-suite requirement.

### Contract scope

- Package-derived capacity: ten prints per original or Additional Film Package; unresolved attempts hold capacity and the printer slot; confirmed full ejection counts once, including unusable output.
- Event, Booth run, Guest Session, Capture, and Print Attempt transitions, including separate Finish Booth and Event completion.
- Current Admin authorization, private transactional functions, RLS, scoped Booth grants, initial handoff, exceptional access recovery, and grant retention through ordinary faults and pauses.
- Stable operation receipts, duplicate and lost-response handling, concurrency protection, one-send dispatch, and metadata-only recovery.
- Independent readiness blockers, phone reload confirmation, and exceptional inspection of unknown print outcomes.
- A nonproduction simulator that distinguishes command acceptance, confirmed ejection, reliable rejection, and uncertainty.
- Cutover safeguards, historical accounting preservation, and explicit review of legacy Draft capacity conversion.

[#10](https://github.com/noelorph/diy-instax-photobooth/issues/10) owns complete application integration, coordinated accounting cutover, and removal of superseded runtime behavior.

### Done when

- [ ] The outstanding package-addition and reload authorization finding is fixed, covered by regression tests, and reviewed.
- [ ] Required contract and integration coverage verifies authorization, accounting, concurrency, receipts, grants, recovery, and one-send behavior.
- [ ] The full suite and required lint, type, formatting, build, and browser checks pass on the final reviewed revision.
- [ ] Review findings are resolved, and evidence identifies the reviewed revision, commands, results, and remaining external gates.
- [ ] Current contracts and the #10 handoff accurately distinguish implemented software, remaining integration, and physical qualification.

### Dependency and release boundaries

> Planning may proceed now. Implementation begins after #9’s outstanding findings are resolved and its required verification passes.

This statement governs #10. Keep #9 open until its acceptance requirements are satisfied.

[#17](https://github.com/noelorph/diy-instax-photobooth/issues/17) separately gates real-printer enablement through physically qualified automatic normal full-ejection completion and safe recovery. [#7](https://github.com/noelorph/diy-instax-photobooth/issues/7) gates production launch through the actual-iPad release trial. Simulator results satisfy neither gate. #8 is closed and is not a renewed blocker.

### Detailed references

- `docs/adr/0025-package-accounting-and-booth-recovery.md`
- `docs/adr/0026-order-captures-by-shutter-time.md`
- `docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md`
- `docs/implementation/issue-9-package-contracts-review.md`
- `docs/qualification/booth-recovery-proof-checklist.md`

## Issue #10 — integrated product implementation

### Goal

Complete the first-release Admin and Booth application using the approved package-accounting and recovery contracts. Use a nonproduction simulated printer for software development and testing. Remove superseded product behavior and its related UI, application code, and mutation paths through a coordinated accounting cutover.

### Status and implementation gate

Planning only. Implementation remains blocked until [#9](https://github.com/noelorph/diy-instax-photobooth/issues/9)’s outstanding authorization finding is resolved, the fix is reviewed, and required verification passes.

Version-2 contracts and handlers exist. #9 retains responsibility for the authorization gap in package additions and reload actions, a passing full-suite result, and review evidence confirming resolution.

> Planning may proceed now. Implementation begins after #9’s outstanding findings are resolved and its required verification passes.

This issue establishes the whole milestone’s scope. Divide it into smaller implementation issues after that scope is approved.

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

Remove all of the following from active product behavior:

1. Editable Print Allowance.
2. Individual Additional Prints.
3. Shared Film Stock.
4. Wasted Film and quality-refund behavior.
5. In-app Test Print and its setup gate.
6. Client Redaction and past-Event deletion.
7. Superseded Booth recovery and local Admin takeover flows.
8. Temporary legacy adapters, compatibility branches, and helpers that become unnecessary after cutover.

For **each item**, trace its controls, callers, server actions, endpoints, database functions, tests, and fixtures. Record what is removed and what must remain solely for historical reading or evidence.

Remove obsolete runtime behavior and mutation entry points through the coordinated cutover. Hiding controls is insufficient. Retain tests proving retired operations cannot be invoked through stale clients, server actions, HTTP endpoints, or application-accessible database functions.

### Cutover and preservation

- Stop new starts during conversion. Resolve old attempts and finish old runs under their existing contract; never discard unresolved holds or force unknown outcomes to NotPrinted.
- Complete or cancel finished-but-Live legacy Events before conversion. Do not mix accounting versions within resumed operations.
- Convert eligible never-started Drafts using package-derived capacity. Require explicit booking review where the previous independent allowance differs.
- Preserve historical Event records, original accounting totals, audit evidence, applied migrations, and necessary historical readers. Do not fabricate historical package conversions or reconstruct previously removed data.
- Preserve safe never-started Draft deletion and its private-media cleanup.
- Rehearse the coordinated application/database cutover, preservation checks, and recovery procedure in nonproduction. Use reviewed forward migrations and retire obsolete write paths together with the application changes.

### Acceptance

- [ ] #9’s implementation gate was satisfied before implementation began.
- [ ] All first-release Admin, Guest, phone-operation, and recovery flows pass integrated nonproduction acceptance.
- [ ] Accounting and recovery checks cover final-print capacity, pending holds, duplicates, lost responses, stale state, overlapping faults, stop/dispatch races, access loss, and no automatic resend.
- [ ] Every retirement item has a completed trace and removal record, with passing tests that deny obsolete operations.
- [ ] The coordinated accounting cutover passes nonproduction verification, including Draft review, historical preservation, and recovery checks.
- [ ] Privacy, private Event Media, authorization, accessibility, and responsive layouts pass their required checks.
- [ ] Required unit, database/integration, browser, lint, type, formatting, and build checks pass for the final reviewed candidate, with recorded evidence.
- [ ] Simulation remains nonproduction and cannot authorize real-printer operation.

### Completion and external gates

Complete when the full application and coordinated accounting cutover pass nonproduction acceptance verification.

Closing this issue does not authorize real-printer enablement or production launch; those remain gated by [#17](https://github.com/noelorph/diy-instax-photobooth/issues/17) and [#7](https://github.com/noelorph/diy-instax-photobooth/issues/7), respectively.

Real-printer enablement requires physically qualified automatic normal full-ejection completion and safe recovery. Phone inspection is exceptional recovery, not routine confirmation after every print. Printer-reported count is neither physical inventory nor proof of a loaded ten-sheet package.

### Detailed references

- `PRD.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, and `GLOSSARY.md`
- `docs/adr/0025-package-accounting-and-booth-recovery.md`
- `docs/adr/0026-order-captures-by-shutter-time.md`
- `docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md`
- `docs/booth-user-flow.md`
- `docs/qualification/booth-recovery-proof-checklist.md`

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

For the remaining drafts, replace stale scope references to ADR-0014 when the intended evidence checkpoint is ADR-0021, now narrowed by ADR-0025. Do not reintroduce closed issue #8 as a new pre-build blocker; current contracts supersede its old recovery policy. Preserve traceability to original decisions. The #9/#10 publication changed only their descriptions; titles, states, labels, assignees, milestones and dependency metadata were preserved. Future dependency changes require inspection and authorization.
