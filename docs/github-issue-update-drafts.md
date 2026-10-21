# GitHub issue updates — local drafts for review

**Status:** Not published. Prepared 2026-10-21 from the approved [contract](superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md), [ADR-0025](adr/0025-package-accounting-and-booth-recovery.md) and [proof checklist](qualification/booth-recovery-proof-checklist.md). No issue closure, comment, label, dependency, PR or remote branch change is included in this documentation task.

When publication is separately authorized, use the reviewed repository-relative paths below in issue bodies, preserving old comments as dated history. Update conflicting current-body requirements; a new comment alone must not leave the active checklist instructing removed features. Re-read live issue state before writing and keep unrelated content. Do not claim code completion from approval of this design. Use `gh` with a body file, not inline multiline shell interpolation.

## Issue #9 — accounting, access and printer contracts

### Proposed replacement scope

Define the approved package-accounting and Booth-recovery contract in `docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md`, under ADR-0025. Each original/Additional Film Package provides ten prints. Confirmed full ejection counts once, including unusable output; unresolved attempts hold capacity and the printer slot. Remove separate allowance editing, shared inventory, individual additional-print units, quality refunds, in-app Test Print and Client Redaction. Retain Draft deletion and terminal Event history.

Specify Event/run/session/attempt transitions, private transactional database functions, Admin RLS, scoped grants retained through pause/fault, stable operation receipts, one-send dispatch, provisional adapter observations, exceptional phone inspection/reload confirmation, and separate Finish Booth / Complete Event. Define old-model data preservation and conversion requirements. The existing implementation/PR reflects the previous model and needs a later gap review; do not label it compliant with this replacement yet.

### Proposed acceptance checklist

- [ ] Review replacement transitions/formulas/access/database/endpoint/adapter contract together.
- [ ] Confirm pending outcomes cannot be erased by reload, session abandonment, grant loss or phone confirmation.
- [ ] Confirm exactly-once accounting, no auto resend, stop/dispatch races and independent readiness blockers.
- [ ] Link current PRD, glossary, architecture, routes, proof checklist and supersession history.
- [ ] Record implementation gaps separately from documentation approval and #17 physical evidence.

## Issue #10 — integrated product implementation

### Proposed replacement scope

Implement the replacement contract after its documentation review. Deliver the Guest welcome → preview → countdown → Retake/Print review → printing → completion → welcome flow. Keep the iPad in `/booth` for recovery and pause, with Connect to Instax / Enable Camera as the limited local actions. Phone Admin adds whole packages, confirms physical reload, inspects only unknown outcomes, pauses/resumes/finishes runs and completes Events separately.

Use a nonproduction simulator while hardware qualification remains open. Remove old product controls and write paths in a reviewed migration; preserve legacy history, require reviewed Draft capacity conversion and settle old runs before switching accounting versions. No Guest image persistence. Terminal Events have no redaction/deletion actions. Setup has a test reminder only, no optional Test Print button.

### Proposed acceptance checklist

- [ ] Software tests for package caps/holds, duplicate/lost responses, RLS and grant lifecycle, stop/dispatch concurrency, journal/reload recovery and terminal retention.
- [ ] All Guest/phone flows and simultaneous faults match the replacement contract; no repeated iPad sign-in for routine failures.
- [ ] Current source/schema/UI and old mutation paths are reconciled; historical records preserved.
- [ ] Simulated success stays separate from physical confirmation and production enablement.
- [ ] #17 automatic completion and recovery qualification precede real-printer enablement; #7 actual-iPad release gate remains open until passed.

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

Replace stale scope references to ADR-0014 when the intended evidence checkpoint is ADR-0021, now narrowed by ADR-0025. Do not reintroduce closed issue #8 as a new pre-build blocker; current contracts supersede its old recovery policy. Preserve traceability to original decisions. Reconcile actual dependency metadata only after inspecting the current issues and with publication authorization; this draft changes none.
