# Issue #9 Review Fixes Implementation Plan

> **Historical evidence, not a current work order (scope updated 2026-10-25):** This record describes its original revision. #9 remains accepted/closed on `2f89a96`. [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md) supersedes old preservation/conversion/migration-retention instructions for #10. Keep the current #9 package/access/recovery contracts; remove obsolete conversion machinery and reverify the final baseline. Prior failures, counts and evidence below are unchanged historical statements.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the four findings from the review of issue #9 implementation since the approved plan, while preserving package accounting, access and one-send safety contracts.

**Architecture:** Keep the existing TypeScript interfaces and private PostgreSQL operation functions. Sample current simulator state directly, and deliver database fixes through forward migrations without changing public RPC signatures. Use the existing shutter timestamp to determine Capture eligibility at both reservation and dispatch.

**Tech Stack:** Existing Next.js 16.4 / React 19.3 / TypeScript application; Supabase PostgreSQL and Auth; Vitest and existing Playwright fixtures. Reuse the installed dependencies and lockfile.

**Spec:** [Approved replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md), [ADR-0025](../../adr/0025-package-accounting-and-booth-recovery.md), root [PRD](../../../PRD.md), [ARCHITECTURE](../../../ARCHITECTURE.md) and [GLOSSARY](../../../GLOSSARY.md), plus the user-approved shutter-time clarification below.

**Status:** All four fixes, reviews and evidence handoff are complete. The final full Vitest gate remains open because one unchanged Admin Profile focus assertion failed.

**Review baseline:** `4c583a4..9435680`, following the [original approved implementation plan](2026-10-21-issue-9-package-contracts-implementation.md). Preserve that historical plan and the earlier dated evidence in the [implementation review record](../../implementation/issue-9-package-contracts-review.md).

**Approved Capture decision:** Keep the newest-photo rule using shutter time (`captured_at`). An acknowledged selected Capture is eligible only if no Capture in the same session has a strictly later shutter timestamp. When timestamps tie, the explicitly selected Capture remains eligible; arrival order and UUID order do not decide between ties.

## Global Constraints

- **Use Ponytail throughout implementation.** Activate `ponytail:ponytail` in **full** mode and use `ponytail:ponytail-review` at each review gate. Read the currently installed skills before execution. Reuse existing helpers and patterns; make the smallest complete change; add no speculative options, dependencies, wrappers or unrelated refactors. Never trim validation, authorization, concurrency protection, privacy or required tests to save lines.
- Preserve the previously approved **Superpowers subagent-driven-development with TDD** execution method. Use one implementer at a time for shared migrations, followed by spec-compliance and code-quality review at each task boundary. Reviewers inspect the actual diff and test evidence. Finish with a whole-change review using the repository `code-review` skill and Ponytail.
- Read `AGENTS.md`, `docs/README.md`, the root product/domain documents, ADR-0025, the replacement contract, `docs/qualification/booth-recovery-proof-checklist.md` and `docs/qualification/issue-17-trial-report.md`. Historical documents are evidence, not competing work orders. Read relevant installed Next.js guides before any Next.js code change; use the repository Supabase skill and installed CLI help before database work.
- Keep `READINESS_MAX_AGE_MS = 5_000`, `STATE_POLL_MS = 2_000` and `PRINTS_PER_PACKAGE = 10`. Preserve `Printed + unresolved <= total_booked_prints`, at most one unresolved attempt system-wide and one-send authorization. Dispatch of the last reserved unit remains valid at `printsAvailable = 0`.
- Preserve authority checks, lock order, operation receipts, terminal outcome immutability, Capture timestamp validation and the existing bounded late-Capture exception. A readiness read must not clear an old job, reconnect a printer or change a connection generation.
- Guest photo bytes remain in browser memory/direct printer transport. Server requests, journals and audits carry only the existing allowed metadata; use synthetic image bytes in tests.
- Use new forward migrations generated with `npx supabase migration new <name>` after inspecting CLI help. Preserve applied migrations, private-function privileges and fixed empty search paths. The only variable file paths below are CLI-generated migration timestamps; record their actual filenames in the implementation evidence.
- Work in the approved worktree. Before database tests, verify ownership of the isolated local Supabase project `diy-instax-package-contracts` on ports **56321–56329**, with API `http://127.0.0.1:56321`. Start that stack if necessary; do not reset a shared or hosted database. Serialize database suites, restore fixture policy and remove only fixture-owned records. Keep `active_creation_version = 1` after testing.
- This work covers the four review fixes and their documentation/tests. New screens and coordinated cutover remain #10; physical printer qualification remains #17; actual-iPad release qualification remains #7. Do not enable real printing, activate production, publish issue updates or close issues.

## Review Focus

| Failure class                                                                   | Required behavior and test                                                                                                                  | Owning task |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Time passes while connected, disconnected or holding an old job                 | Polling samples current state after 6,000 ms; it never manufactures readiness, and an external snapshot aged 5,001 ms still blocks dispatch | 1           |
| Contradictory evidence arrives in either order or is replayed                   | Both orderings block further work; terminal results remain immutable and replay adds no duplicate discrepancy or accounting effect          | 2           |
| A legitimate no-output result receives late acceptance                          | No-film rejection and inspected NotPrinted remain valid when there is no contradictory non-send evidence                                    | 2           |
| Admin authority changes while an operation waits on the Event row               | Revocation and expiry reject new cancel/delete operations after the wait, without state, receipt or audit changes                           | 3           |
| Capture reports arrive out of order, tie or cross the reserve/dispatch boundary | Shutter time governs eligibility; ties preserve the selected Capture; a genuinely newer Capture blocks dispatch of the older one            | 4           |

## Recommended Approaches

| Finding                                                          | Approved solution                                                  | Alternative considered                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| F1: Simulator becomes stale despite polling                      | Sample current simulated state on every readiness read             | Increasing the freshness timeout only postpones failure                                  |
| F2: Late acceptance contradicts proven non-send without blocking | Recognize the contradiction from the terminal outcome's evidence   | Blocking every acceptance after NotPrinted would incorrectly flag valid no-film outcomes |
| F3: Admin authority can expire while waiting for the Event lock  | Recheck authority after that lock in the shared lifecycle function | Another route-level check leaves the database race                                       |
| F4: Delayed metadata invalidates the newer Retake                | Compare existing shutter timestamps at reservation and dispatch    | A new Capture sequence adds unnecessary schema and client changes                        |

## File and Interface Map

| Responsibility             | Create or modify                                                                                                                                                                                        | Existing consumers and fixtures to retain                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| F1: Simulator sampling     | `src/features/booth/printer/simulator-v2.ts`; `tests/unit/package-printer.test.ts`; `tests/unit/package-print-dispatch.test.ts`                                                                         | `src/features/booth/printer/contract-v2.ts`; `src/features/booth/print-dispatch.ts`; existing test `rig()`                     |
| F2: Outcome contradiction  | `supabase/migrations/<timestamp>_package_late_acceptance_discrepancy.sql`; `tests/integration/package-outcomes.test.ts`                                                                                 | Existing `attempt()`, `observation()` and `ready()` test helpers; `tests/fixtures/package-contract.ts`                         |
| F3: Lifecycle authority    | `supabase/migrations/<timestamp>_package_lifecycle_postlock_authority.sql`; `tests/integration/package-lifecycle.test.ts`                                                                               | Existing Admin RPC dispatcher chain; `package_require_admin`; SQL child-process pattern and `tests/fixtures/local-supabase.ts` |
| F4: Capture eligibility    | `supabase/migrations/<timestamp>_package_capture_shutter_order.sql`; `tests/integration/package-dispatch.test.ts`                                                                                       | Existing `captureTime()` helper, Capture reporting API and journal; `tests/integration/package-late-capture.test.ts`           |
| F4: Decision documentation | `docs/adr/0026-order-captures-by-shutter-time.md`; `docs/adr/README.md`; ADR-0025; replacement spec; `PRD.md`; `GLOSSARY.md`; `ARCHITECTURE.md`; `docs/booth-user-flow.md`; README links where affected | Preserve the original approved plan and historical records; confirm ADR number is still available before creating it           |
| Verification evidence      | `docs/implementation/issue-9-package-contracts-review.md`                                                                                                                                               | Append dated results and limitations without replacing earlier evidence                                                        |

Public APIs, exported TypeScript types, database columns and dependency/configuration changes are not required. Trace callers before editing each function; change a consumer only if the regression demonstrates that it is necessary.

## Task 1: Make Simulator Readiness Reads Fresh

**Files:** Modify the F1 files in the map.

**Interfaces:** Preserve `SimulatedPrinterV2.readReadiness(): Promise<PrinterReadinessSnapshot>` from `contract-v2.ts`. Its existing consumer is `dispatchReservedAttempt(input: DispatchInput, deps: DispatchDependencies): Promise<void>` in `print-dispatch.ts`.

- [x] **Write the regression tests.** Add `samples current readiness after repeated polling`: connect at fake time zero, sample at 2,000, 4,000 and 6,000 ms, then dispatch through the existing rig. Assert fresh observations, unchanged generation and exactly one send:

  ```ts
  expect(snapshot.observedAgeMs).toBe(0);
  expect(snapshot.connectionGeneration).toBe(originalGeneration);
  expect(printer.commandCount).toBe(1);
  ```

  Also test disconnected and outstanding-job states after advancing time and polling; neither becomes ready. Keep explicit `ready_for_new_job` as the existing transition that clears an old job. Add a stale adapter stub aged **5,001 ms** and assert dispatch rejects before reservation. Restore the fake clock after each test.

- [x] **Run the tests against the current implementation.** Expect the fresh-polling regression to fail on observation age or the later dispatch:

  ```bash
  npm test -- tests/unit/package-printer.test.ts tests/unit/package-print-dispatch.test.ts --no-cache
  ```

- [x] **Implement fresh sampling in `simulator-v2.ts`.** Return `observedAgeMs: 0` with the current in-memory state. Remove the unused `observedAt` field and assignments. Preserve connection state, generations, old-job handling and send-once behavior; retain the consumer's 5,000 ms guard.
- [x] **Rerun the same command.** Require all tests to pass, including existing reconnect, ambiguous-write and duplicate-send cases.
- [x] **Run the task review gate.** Check spec compliance, then apply `ponytail:ponytail-review` to the diff and its callers.
- [x] **Commit only the task files.** Suggested message: `fix(booth): sample current simulator readiness`.

## Task 2: Block Late Acceptance That Contradicts Proven Non-Send

**Files:** Create the F2 migration and extend `tests/integration/package-outcomes.test.ts`. Read the current function body in `supabase/migrations/20261021164210_package_unsent_reservation_safety.sql`; do not edit that applied migration.

**Interfaces:** Preserve `private.package_observe(p_grant_hash text, p_operation_id uuid, p_payload jsonb) returns jsonb`. Reuse the existing observation payload, discrepancy event, run blocker and receipt interfaces.

- [x] **Prepare the isolated database baseline.** Confirm the stack identity and fixture ownership, inspect installed migration CLI help, and apply existing pending local migrations if necessary. Record any unavailable Docker/database prerequisite; do not substitute a shared database.
- [x] **Write the regression tests.** Add `blocks late acceptance after proven non-send`: settle an attempt using `definitely_not_sent`, then report `command_accepted`. Assert:

  ```ts
  expect(attemptState).toBe('NotPrinted');
  expect(result.data.receipt.result.discrepancy).toBe(true);
  expect(discrepancyCount).toBe(1);
  expect(blockers).toContain('evidence_discrepancy');
  expect(counts).toMatchObject({ printed: 0, unresolved: 0 });
  ```

  Cover a server-cancelled reservation with no dispatch authorization as well. Replay the same observation ID and assert no additional event, blocker or accounting change. Preserve the existing acceptance-first test: that unresolved contradiction stays Pending with its hold and blocker. Fresh readiness, reload confirmation and attempted Resume must not clear the discrepancy or permit new printer work.

  Add controls for `no_film_rejected` and inspected NotPrinted followed by acceptance: these remain diagnostic when no contradictory non-send evidence exists. Preserve rejection of wrong-generation observations and expired/revoked authority.

- [x] **Run the regression tests before the fix.** Expect the late-acceptance case to fail because the discrepancy/blocker is missing:

  ```bash
  npm test -- tests/integration/package-outcomes.test.ts --no-cache
  ```

- [x] **Create the forward migration.** Run `npx supabase migration new package_late_acceptance_discrepancy`; replace the current `private.package_observe` body in the generated file. Extend the terminal contradiction predicate so `command_accepted` contradicts NotPrinted when `dispatch_id IS NULL`, or a prior event for this attempt records `state = 'NotPrinted'` with `evidence_kind = 'definitely_not_sent'`. Preserve the existing terminal-to-terminal contradiction predicate.

  Reuse the existing audit and blocker path. Keep the terminal NotPrinted state and accounting immutable; do not throw away the incoming evidence or reopen the hold. Acceptance-first retains its existing Pending behavior. Preserve all access, generation, qualification, replay and readiness checks.

- [x] **Apply the new migration locally.** Use the installed CLI's local migration command, expected `npx supabase migration up --local`; verify the generated filename and local target.
- [x] **Rerun the same test command.** Require all tests to pass, including valid no-output outcomes and repeat delivery.
- [x] **Run the task review gate.** Check spec compliance and use `ponytail:ponytail-review`, especially whether the contradiction predicate is narrow enough.
- [x] **Commit only the task files.** Suggested message: `fix(accounting): block contradictory late acceptance`.

## Task 3: Recheck Admin Authority After the Event Lock

**Files:** Create the F3 migration and extend `tests/integration/package-lifecycle.test.ts`. The original lifecycle body is in `20261021135752_package_run_access_operations.sql`; `20261021140248_package_run_access_guards.sql` renames it. Preserve both applied files.

**Interfaces:** Replace the active renamed function, not an obsolete dispatcher definition:

```text
private.package_lifecycle_admin_operation(
  p_admin_user_id uuid,
  p_admin_session_id uuid,
  p_operation text,
  p_operation_id uuid,
  p_payload jsonb
) returns jsonb
```

Reuse `private.package_require_admin(uuid, uuid) returns void`. Keep the outer dispatcher chain intact. A test-local helper may use `withEventHeld<T>(eventId: string, work: () => Promise<T>, duringHold: () => void): Promise<T>`.

- [x] **Add a deterministic Event-row lock helper.** Reuse the existing SQL child-process pattern. Hold only the fixture Event row in a transaction, obtain the holder's backend PID, start the operation and use `pg_blocking_pids` to confirm it is waiting on that holder before invoking `duringHold`. Use bounded polling; release/roll back and close the child in `finally` before fixture cleanup. The existing global-guard helper tests a different wait and is insufficient for this regression.
- [x] **Write `rejects lost authority while waiting for the Event lock`.** Parameterize `cancel` and `begin_delete_draft` across session revocation and expiry. Keep the Event revision unchanged while held so stale-revision rejection cannot mask the authorization race. Assert:

  ```ts
  expect(result.error?.message).toBe('access_required');
  expect(event).toMatchObject({ state: 'Draft', revision: originalRevision, deleted_at: null });
  expect(receiptCount).toBe(0);
  expect(auditCount).toBe(0);
  ```

  Also assert contact data remains unchanged. Include a still-authorized control that succeeds after the same Event-lock wait, and retain existing replay-authority coverage.

- [x] **Run the tests before the fix.** Expect the new unauthorized operations to reproduce:

  ```bash
  npm test -- tests/integration/package-lifecycle.test.ts --no-cache
  ```

- [x] **Create the forward migration.** Run `npx supabase migration new package_lifecycle_postlock_authority`. In `private.package_lifecycle_admin_operation`, call `package_require_admin(p_admin_user_id, p_admin_session_id)` immediately after acquiring the Event row lock, before receipt handling or mutation. Preserve early validation, lock order, function privileges, empty search path and existing behavior.
- [x] **Apply the migration locally.** Use the verified local migration command from Task 2.
- [x] **Rerun the same tests.** Require all regression and control cases to pass, with no leaked locks or fixture sessions.
- [x] **Run the task review gate.** Check spec compliance and use `ponytail:ponytail-review` to trace fresh operations and receipt replay through the actual wrapper chain.
- [x] **Commit only the task files.** Suggested message: `fix(auth): recheck lifecycle authority after event lock`.

## Task 4: Enforce Newest Capture by Shutter Time

**Files:** Create the F4 migration, extend `tests/integration/package-dispatch.test.ts`, and update the decision documents listed in the file map. Preserve `tests/integration/package-late-capture.test.ts` coverage. Read the current reserve body in `20261021233012_package_final_review_guards.sql` and dispatch body in `20261021150926_package_dispatch_operation.sql` without editing those migrations.

**Interfaces:** Preserve both functions and existing request payloads:

```text
private.package_reserve(p_grant_hash text, p_operation_id uuid, p_payload jsonb) returns jsonb
private.package_dispatch(p_grant_hash text, p_operation_id uuid, p_payload jsonb) returns jsonb
```

The authoritative chronology is the acknowledged Capture's existing `captured_at`. The dispatch check uses the attempt's bound `capture_id`; it does not select a replacement photo.

- [x] **Write `reserves the newest shutter despite reversed metadata arrival`.** Give B a strictly later valid shutter timestamp than A, report B before A, and use the latest expected revision. Assert reservation of A fails with `invalid_transition`, reservation of B succeeds, the attempt binds B and both Captures count once. Use the existing database-clock helper to stay within Capture timestamp bounds.
- [x] **Write `dispatches the selected capture after older metadata arrives`.** Reserve B, report older A, refresh the expected revision and dispatch B. Assert:

  ```ts
  expect(dispatched.error).toBeNull();
  expect(dispatched.data.sendAllowed).toBe(true);
  expect(replayed.data.sendAllowed).toBe(false);
  expect(boundCaptureId).toBe(captureB);
  ```

- [x] **Write tie and newer-shutter controls.** Equal timestamps permit either explicitly selected acknowledged Capture, independent of arrival/UUID order, at reservation and dispatch. A genuinely newer C arriving after B's reservation rejects B's dispatch; existing reconciliation settles the unsent reservation as NotPrinted without a send. Use the latest expected revision in each case to isolate Capture eligibility. Preserve wrong-session/run rejection and last-held-unit dispatch at zero availability.
- [x] **Run the tests before the fix.** Expect the out-of-order cases to fail under the current arrival-time ordering:

  ```bash
  npm test -- tests/integration/package-dispatch.test.ts tests/integration/package-late-capture.test.ts --no-cache
  ```

- [x] **Create the forward migration.** Run `npx supabase migration new package_capture_shutter_order`. At reservation and dispatch, require the selected/bound Capture to exist in the correct session/run and accounting version, and reject it if another version-2 Capture in the same session has `captured_at > selected.captured_at`. Use a strictly-newer existence check; do not introduce a UUID/arrival tie-breaker, sequence field or selection endpoint. Preserve terminal-session, receipt, revision, identity, timestamp and readiness rules.
- [x] **Apply the migration locally.** Use the verified local migration command from Task 2.
- [x] **Rerun the same tests.** Require all to pass, including the bounded late-Capture and idempotency cases.
- [x] **Document the approved ordering decision.** Create `docs/adr/0026-order-captures-by-shutter-time.md` after confirming the number is available. Treat it as a refinement of ADR-0025, not wholesale supersession. Link it from ADR-0025 and the ADR index; align the replacement spec's reservation/dispatch and Retake wording, PRD review behavior, Capture/Retake glossary entries, architecture and current flow guide. Update `README.md` and `docs/README.md` links where affected. The user has approved shutter ordering and tie handling; ask only if a new decision is discovered beyond this scope.
- [x] **Run the task review gate.** Check both SQL predicates against the approved decision and use `ponytail:ponytail-review`. Confirm no photo substitution, new schema field or weakened timestamp/access boundary.
- [x] **Commit only the task files.** Suggested message: `fix(booth): order capture eligibility by shutter time`.

## Final Verification and Handoff

Run these checks after the four focused test cycles pass. Database and browser suites must run sequentially against the isolated stack; do not repeat a passing broad suite without a new change or unresolved failure that justifies it.

- [ ] **Run the full Vitest suite:** `npm test -- --no-cache`. Require a passing exit status, covering accounting, grants, schema access, lifecycle, Draft deletion, HTTP contracts and legacy boundaries as well as the new regressions.
- [x] **Run lint:** `npm run lint`. Require exit 0.
- [x] **Run type checking:** `npx tsc --noEmit`. Require exit 0.
- [x] **Run formatting checks:** `npm run format:check`, plus an explicit Prettier check on changed Markdown and TypeScript tests not included by that script. Require exit 0 for changed files; report unrelated baseline failures separately without opportunistic cleanup.
- [x] **Run the production build:** `npm run build`. Require exit 0; distinguish environment failures from code failures.
- [x] **Run the main browser suite:** `npm run test:e2e`. Record actual passed/failed counts.
- [x] **Run the Booth browser suite:** `npx playwright test --config playwright.booth.config.ts`. Record actual results.
- [x] **Run the Admin/Booth browser suite:** `npx playwright test --config playwright.admin-booth.config.ts`. Record actual results, including any flakes and reruns.
- [x] **Verify cleanup and boundaries.** Confirm fixture-owned records are removed, printer policy is restored, creation version remains 1, migration privileges are unchanged and no shared/hosted system was modified. Preserve unrelated worktree files, including the pre-existing untracked SQL snippet.
- [x] **Append dated evidence** to `docs/implementation/issue-9-package-contracts-review.md`: actual migration filenames, commands, outcomes, limitations and the four resolved findings. Preserve earlier dated evidence and the #10/#17/#7 handoff boundaries.
- [x] **Run the whole-change review.** Use the repository `code-review` skill and `ponytail:ponytail-review` against this plan, the approved contract and actual verification evidence. Do not claim a finding resolved solely because its implementation exists.
- [x] **Commit the final evidence update.** Suggested message: `docs: record issue 9 review fix verification`.

## Completion Criteria

All four findings have a regression that failed before its fix and passes afterward. The recommended approaches, including shutter-time ordering and selected-Capture ties, are implemented without changing public interfaces. Required checks and reviews pass, or any unresolved limitation is explicitly reported rather than represented as completion. Hardware and actual-iPad qualification remain open regardless of software test results.
