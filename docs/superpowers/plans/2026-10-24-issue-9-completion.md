# Issue #9 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Preserve the approved #9 execution method: **subagent-driven development with TDD**, one implementer at a time, followed by spec-compliance and code-quality/Ponytail review. Use **ponytail:ponytail, full** throughout. The user approved this plan and its recommended execution method on 2026-10-24.

**Goal:** Resolve the remaining #9 authorization finding and verification failure, establish passing checks on the final reviewed revision, and produce an accurate closure-ready #10 handoff.

**Architecture:** Retain the existing private PostgreSQL transactions, RPC dispatch chain, HTTP handlers and version-2 contracts. Add the existing live-Admin check after the Event lock in the two affected private functions through one forward migration. Reuse the deterministic Event-lock test helper and repair only the asynchronous assertion responsible for the recorded Profile test failure.

**Tech Stack:** Installed Next.js 16.4, React 19.3, TypeScript, Supabase PostgreSQL/Auth, Vitest 3.2.7 and Playwright; existing lockfile, fixtures and commands.

**Spec:** [Approved replacement contract](../specs/2026-10-21-package-accounting-booth-recovery-design.md), especially sections 2 and 5–6; [ADR-0025](../../adr/0025-package-accounting-and-booth-recovery.md); [ADR-0026](../../adr/0026-order-captures-by-shutter-time.md); current [GitHub #9](https://github.com/noelorph/diy-instax-photobooth/issues/9).

**Status:** Approved for implementation on 2026-10-24; execution in progress. It continues the [original approved implementation plan](2026-10-21-issue-9-package-contracts-implementation.md) and [review-fixes plan](2026-10-22-issue-9-review-fixes.md). It changes no approved product or technical decision. Earlier plans and dated results remain historical records; this supplement tracks the remaining acceptance work.

**Planning baseline:** `ca03c59d2fc8ac507a6132681a916ecd093a60a0`. The working tree already contains uncommitted approved Event Media documentation, #10 planning files and an unrelated SQL snippet. Preserve them; do not stage them incidentally. Re-read the baseline at execution time if it changes.

## Execution checkpoint — 2026-10-24

Tasks 1–2 and independent whole-code review are complete at `e702b4015d6b1f775d2f9375688bd42df4b59dfb`; final acceptance remains blocked. The [dated verification checkpoint](../../implementation/issue-9-package-contracts-review.md#issue-9-completion-attempt--verification-blocked-2026-10-24) records Task 1 RED/GREEN, commits/reviews and the complete failed full run: exit 1, 874 passed / 20 failed / 7 skipped of 901 tests, 44 passed / 9 failed of 53 files, 5594.87 seconds.

Task 3 is partial: SQL/static checks and post-failure preservation audits passed with disclosed baseline findings/formatting exception; successful full-suite, standalone build, all three browser gates, final audit, completion evidence/status synchronization and final evidence review/commit remain unchecked. The appended blocked-attempt record is not the final completion appendix. The final local-state checkbox remains open for the later acceptance run, despite passing audits of this failed attempt.

The installed Next.js 16.4.0 security blocker requires an explicit dependency-scope exception, which is pending. The no-dependency-upgrade constraint below remains in force until the user answers; no dependency change or subsequent full/build/browser run has been performed. Those checks are deferred pending diagnosis and the dependency-scope decision; existing verification authorization remains in force. #9 remains open and #10 implementation has not started. Planning-baseline findings and earlier dated results below remain historical context.

## Approved security-patch exception — 2026-10-24

After the blocked checkpoint above, the user explicitly approved updating the exact Next.js dependency from `16.4.0` to `16.4.1` with its npm-generated lockfile changes, following the [official October 14 security advisory](https://nextjs.org/blog/nextjs-security-update-october-14-2026). This is the single exception to the no-dependency-upgrade constraint below. All other constraints remain in force; no application, configuration, product-behavior or other top-level dependency change is authorized by this exception.

- [x] **Apply and verify the narrow security patch.** Pin and install Next.js `16.4.1`, audit necessary lockfile changes, and run the scoped package/static/build checks. Retain actual outcomes; this smoke check does not replace Task 3 acceptance.
- [ ] **Independently review the security patch.** Review the dependency/lockfile diff and verification evidence before resuming final acceptance. Keep all final acceptance and closure gates open until their required checks pass.

## Global Constraints

- “Planning may proceed now. Implementation begins after #9’s outstanding findings are resolved and its required verification passes.” This is the #10 implementation gate, not evidence that it has passed.
- “Functions recheck actor scope, current session/grant validity, Event/run state, revision and receipt payload inside the transaction.” Keep current Admin authority for both fresh requests and receipt replay.
- “Lock order: global single-printer/single-Live-Event guard → Event → run → attempt or reload request.” Preserve public signatures, payload normalization, error codes, empty search paths, function privileges and receipt semantics.
- “Every booked Film Package and Additional Film Package provides **10 prints**.” Preserve pending holds, one-send authorization, terminal accounting and independent physical reload confirmation.
- Keep `READINESS_MAX_AGE_MS = 5_000`, `STATE_POLL_MS = 2_000`, version-1 creation until #10 cutover, and the disabled real-printer policy. The simulator stays nonproduction; #17 and #7 remain external physical gates.
- Read `AGENTS.md`, `docs/README.md`, root product/domain documents, the spec, qualification checklist and dated #17 report. Read the repository Supabase skill and installed CLI help before database execution; relevant installed Next.js guides before any application-code change.
- Use only the verified local `diy-instax-package-contracts` Supabase project, API `http://127.0.0.1:56321`, ports 56321–56329. Serialize database and browser suites. No shared/hosted reset, deployment, cutover, physical print or dependency upgrade.
- Never persist Guest photos or print payloads in logs, evidence or fixtures. Preserve fixture isolation, existing user data and all applied migrations. Cleanup must identify exact fixture-owned records.
- Keep product behavior and #10 plans unchanged. Status-only documentation updates below occur only after the actual gate passes. If a new durable decision is necessary, ask the focused questions required by `AGENTS.md` before editing its authoritative documents.

## Review Focus

| Condition                                                                                          | Required result and owning check                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A current Admin expires or is revoked while a fresh purchase/reload request waits on the Event row | `access_required`, with no business, receipt, audit or revision change; Task 1, six deterministic regressions.                                                            |
| An already committed operation is replayed while authority is lost during the Event wait           | Reject replay without exposing its receipt or changing existing records; Task 1, replay controls for all three actions.                                                   |
| The Admin remains authorized through the same wait                                                 | One intended purchase/reload change, one receipt/audit and no accidental pause/attempt/capacity changes; Task 1 success controls and existing accounting/readiness tests. |
| A reload panel is stale or uses a different generation, or a receipt payload changes               | Existing stale-state, generation and conflict denials remain; Task 1 focused accounting/readiness/HTTP gate.                                                              |
| An error alert renders before its focus effect completes under suite load                          | Assert eventual focus while retaining error copy and actionable Sign out; Task 2 and Task 3 full-suite gate.                                                              |

## Findings and Remaining Scope

| Item                         | Current evidence                                                                                                                                                                                                                                               | Remaining action                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package/reload authorization | `package_accounting_admin_operation` and `package_readiness_admin_operation` check Admin authority before locking the Event, then proceed without a second check. The lifecycle correction delegates these operations before reaching its own post-lock check. | Task 1: reproduce through the real public RPC and fix both active private functions. This planning inspection is not a new runtime reproduction. |
| Earlier four review findings | The [review record](../../implementation/issue-9-package-contracts-review.md#issue-9-review-fixes-2026-10-2223) records simulator freshness, contradictory late acceptance, lifecycle authority and shutter ordering fixes, with focused tests and reviews.    | Retain and run their coverage. Do not reimplement those completed fixes.                                                                         |
| Full suite                   | Latest recorded complete run: **885/886 tests, 52/53 files, exit 1**. Sole failure: immediate focus assertion in `admin-shell-profile.test.tsx`.                                                                                                               | Tasks 2–3: correct the assertion and obtain a complete passing run after the authorization fix. An isolated pass is insufficient.                |
| Other verification           | Lint, types, formatting, build and browser checks previously passed; they predate the outstanding fix.                                                                                                                                                         | Task 3: rerun all required gates on the final reviewed candidate.                                                                                |
| Evidence and #10 handoff     | Existing matrices cover the contracts and distinguish legacy UI from version-2 software; they cannot certify the pending fix.                                                                                                                                  | Task 3: append actual revision/results and resolve review findings before declaring #9 ready to close.                                           |

On this planning baseline, `npm test -- tests/components/admin-shell-profile.test.tsx --no-cache` passed **14/14**, exit 0, in **4.93 seconds**. No database, full-suite, build, browser or hardware verification was performed in this planning pass.

### Approach within the approved design

Use the existing post-Event-lock authorization pattern, already applied to lifecycle operations. A new route-only check leaves the wait race intact; a dispatcher redesign broadens the change unnecessarily. The mutation functions are the narrowest correct enforcement points. Keep the approved contract as the design; no replacement spec or new ADR is needed.

For the Profile failure, use the existing `waitFor` pattern from the same test file. Keep the accessibility assertion; do not add sleeps, retries, skipped tests, a larger global timeout or an application behavior change to obtain a green run.

## File and Caller Map

| Responsibility                            | Files                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forward authorization fix                 | Create `supabase/migrations/<CLI-generated timestamp>_package_purchase_reload_postlock_authority.sql`; record its exact generated name in evidence.                                                                                                                                                                                                                               |
| Deterministic authorization regressions   | Modify `tests/integration/package-lifecycle.test.ts`; reuse its existing `withEventHeld` helper in place. These tests cover the shared Admin transaction boundary; no helper extraction or fixture framework is needed.                                                                                                                                                           |
| Asynchronous focus assertion              | Modify `tests/components/admin-shell-profile.test.tsx` only. Read `src/features/admin/profile/profile.tsx` to verify the existing focus effect.                                                                                                                                                                                                                                   |
| Existing fixtures and regression coverage | Reuse `tests/fixtures/package-contract.ts`, `tests/fixtures/local-supabase.ts`, and accounting/readiness/outcome/HTTP/schema-access suites without changing them unless a failing regression requires it.                                                                                                                                                                         |
| Completion evidence                       | Append to `docs/implementation/issue-9-package-contracts-review.md`; track only actual completion in this plan.                                                                                                                                                                                                                                                                   |
| Active status after acceptance            | Minimal status/link updates in `AGENTS.md`, `README.md`, `PRD.md`, `ARCHITECTURE.md`, `GLOSSARY.md`, `DESIGN_SYSTEM.md`, `docs/README.md`, `docs/agents/domain.md`, and `docs/adr/0025-package-accounting-and-booth-recovery.md`. Check the contract, proof checklist and current flow guide for any affected status sentence; preserve all behavior and physical-proof statuses. |

The runtime path is the three Admin routes at `src/app/api/admin/events/[eventId]/{film-packages,reload-requests,reload-confirmations}/route.ts` → `runPackageAdminOperation` in `src/lib/operations/package-route.ts` → public/private `package_admin_operation` dispatchers → the two private mutation functions. `report_setup_readiness` shares the readiness function and must retain its existing coverage. No HTTP route, schema, public RPC signature, generated database type, export, config or dependency change is expected.

## Task 1: Close the Package and Reload Authorization Race

**Files:** Create the forward migration and modify `tests/integration/package-lifecycle.test.ts` from the map. Preserve all applied migrations.

**Interfaces:**

```text
private.package_accounting_admin_operation(
  p_admin_user_id uuid, p_admin_session_id uuid,
  p_operation text, p_operation_id uuid, p_payload jsonb
) returns jsonb
private.package_readiness_admin_operation(
  p_admin_user_id uuid, p_admin_session_id uuid,
  p_operation text, p_operation_id uuid, p_payload jsonb
) returns jsonb
private.package_require_admin(uuid, uuid) returns void
withEventHeld<T>(eventId: string, work: () => Promise<T>, duringHold: () => void): Promise<T>
```

`createPackageFixture().admin(operation, payload, operationId)` consumes the real public RPC and adds `eventId`. It returns the existing `{data, error}` response. Existing HTTP mapping continues to return `401 access_required` for lost authority.

- [x] **Verify the local target and migration baseline.** Inspect CLI help, confirm the container's project label and API port through the existing fixture protections, confirm no other suite is running, and inspect pending migrations without resetting anything. Capture creation version and printer-policy mode before testing. Inspect the active two function definitions/privileges and the dispatcher chain; compare them to the sources below.
- [x] **Add fresh-operation regressions using `withEventHeld`.** Parameterize `add_packages`, `request_reload`, `confirm_reload` across `revoked` and `expired`. Start from `f.seedRun('Paused')`; use `{packages: 1, clientRequestNote: 'Client request'}` for purchase and current run/printer/generation/revision for reload. Create the Open reload request before the confirmation case and obtain its ID from its receipt. Use a new stable operation ID for each request. While the RPC is proven blocked on the Event row, delete only that fixture's Auth session or set its `not_after` to `clock_timestamp() - interval '1 second'`. Do not change Event revision during the wait.

  Take an owner-read snapshot before the blocked call and after its denial: Event revision/package counts; run state and `film_loaded_confirmed`; fixture package entries/reload rows; and receipt/activity IDs and counts. Exclude the deliberately changed Auth session. For confirmation, compare against the existing setup records rather than expecting all counts to be zero. Assert:

  ```ts
  expect(result.error?.message).toBe('access_required');
  expect(result.data).toBeNull();
  expect(after).toEqual(before);
  ```

  Reuse the helper's `pg_blocking_pids` barrier and `finally` cleanup; neither arbitrary sleeps nor merely holding the global guard reproduces this Event-row race.

- [x] **Add success and replay controls.** For each action, keep the session valid through the same wait and assert success, revision `before.revision + 1`, and exactly one new operation receipt and audit. A purchase changes capacity from 10 to 20 and leaves load/run state unchanged; request changes only the reload requirement; confirmation clears only its matching request. Paused remains Paused. For each action's existing committed receipt, repeat the same key/payload behind the Event lock while revoking/expiring authority; assert `access_required`, null data and unchanged business/receipt/audit snapshots. Retain valid replay and changed-payload conflict checks from existing suites; add a missing reload replay/conflict control only if the coverage trace shows it absent.
- [x] **Run the regression file before the fix.** `npm test -- tests/integration/package-lifecycle.test.ts --no-cache`. Expect the six new fresh-request cases to fail because unauthorized operations succeed; valid-session controls and existing replay protections should pass. Record actual results. If they do not reproduce, inspect the installed definitions and barrier rather than assuming this hypothesis was proven.
- [x] **Generate the forward migration.** After checking installed CLI help, run `npx supabase migration new package_purchase_reload_postlock_authority`. Copy the current bodies under their active names and add `perform private.package_require_admin(p_admin_user_id,p_admin_session_id);` immediately after each function acquires its Event row, before receipt handling or mutation. The accounting body originates in `20261021131946_package_accounting_numeric_normalization.sql`, renamed by `20261021132628_package_readiness_operations.sql`; the readiness body originates in `20261021133554_package_readiness_numeric_normalization.sql`, renamed by `20261021135752_package_run_access_operations.sql`. Use `CREATE OR REPLACE` on the active names, preserving signatures, early checks, normalization, lock order, `SECURITY DEFINER`, empty search paths and restricted privileges. Do not rewrite those historical source files or replace the outer dispatcher.
- [x] **Apply only to the verified local stack.** Use the installed CLI's confirmed local migration command, expected `npx supabase migration up --local`. Confirm both new checks are present and execution grants remain unchanged.
- [x] **Run the focused acceptance gate.** Require exit 0 for the following single sequential Vitest run; it retains lifecycle, package limits, reload independence, setup-readiness, outcomes, HTTP authorization/receipt handling and private-function/RLS coverage:

  ```bash
  npm test -- tests/integration/package-lifecycle.test.ts tests/integration/package-accounting.test.ts tests/integration/package-readiness.test.ts tests/integration/package-outcomes.test.ts tests/integration/package-http-access.test.ts tests/integration/package-http-contracts.test.ts tests/integration/package-schema-access.test.ts --no-cache
  ```

- [x] **Review and commit the task.** Independent spec review then code-quality/Ponytail review must trace both fresh calls and replay through the actual dispatcher, inspect RED/GREEN evidence, and confirm no privilege expansion or fixture leakage. Commit only the migration and changed test file with `fix(auth): recheck package and reload authority after event lock`.

## Task 2: Make the Existing Profile Focus Assertion Await Its Effect

**Files:** Modify `tests/components/admin-shell-profile.test.tsx`; read `src/features/admin/profile/profile.tsx`. No application behavior change is planned.

**Interfaces:** Existing test `keeps failed sign-out actionable without claiming the session ended`; existing React Testing Library `waitFor` import; the Profile form's `useEffect` focuses its error feedback after the action state changes.

- [x] **Confirm the recorded failure and timing boundary.** Compare the latest full-suite failure in the review record with the immediate focus assertion and the neighboring test that already uses `waitFor`. Today's 14/14 isolated pass is diagnostic only; do not claim a fresh reproduction or force a failure with artificial sleeps.
- [x] **Replace only the immediate focus assertion.** Keep the existing alert-content and enabled-Sign-out assertions, and use the same assertion inside the existing helper:

  ```ts
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')));
  ```

  The assertion must still fail if focus never reaches the alert. If investigation instead identifies a real product focus defect, correct that specific defect with a failing regression and the required Next.js/design-system reading; do not redesign Profile.

- [x] **Run the affected component suite.** `npm test -- tests/components/admin-shell-profile.test.tsx --no-cache`; require all tests to pass. No retry settings, skipped assertion or timeout increase.
- [x] **Review and commit.** Spec and code-quality/Ponytail review checks that accessibility remains asserted and the repair addresses the observed scheduling boundary. Commit only this test with `test: await sign-out error focus`.

## Task 3: Verify the Final Revision and Record the #9 Gate

**Files:** Append completion evidence and update status-only documentation listed in the file map after acceptance. Preserve dated failures, old plan records, unrelated worktree edits and #10 design content.

**Interfaces:** Consume the reviewed Task 1–2 commit range and existing requirement/route/schema matrices. Produce a dated record identifying the exact code revision, commands, exit statuses, counts, findings and remaining external gates; #10 uses that record to establish its prerequisite.

- [x] **Review the complete completion diff before the long acceptance run.** Use repository `code-review`, independent spec/code-quality review and `ponytail-review`. Check all five Review Focus rows and the existing #9 traceability matrices. Resolve actionable findings in their owning files with focused regressions. Capture the final candidate SHA and any remaining tracked/untracked changes; do not label a dirty code tree as an exact tested commit.
- [ ] **Run the full suite once the candidate is ready.** `npm test -- --no-cache`. Require a complete exit-0 run across all discovered files/tests, including the new regressions. Keep database files serial through existing `fileParallelism: false`; run no overlapping database or browser job. Historical runtime was about 51 minutes, so retain the process and its output through completion. If a failure occurs, preserve the result, fix its cause within this scope, review the change, and rerun the full gate. Neither isolated reruns nor an interrupted run satisfy this step.
- [ ] **Run required static and build checks.** Run `npm run lint`, `npx tsc --noEmit`, `npm run format:check`, `npm run build`, and `git diff --check`; require exit 0. Explicitly check changed TypeScript tests and the new plan with Prettier because the formatting script excludes `tests/` and `docs/`. For the appended historical evidence file, check the new appendix and disclose its documented pre-existing whole-file table-formatting failure; do not silently reformat historical evidence. Inspect CLI help and run local SQL lint/advisors as in the existing database review; distinguish known baseline warnings from newly introduced findings.
- [ ] **Run all three browser gates sequentially.** `npm run test:e2e`; `npx playwright test --config playwright.booth.config.ts`; `npx playwright test --config playwright.admin-booth.config.ts`. Require successful exits and record actual counts. These validate existing regressions, not the unimplemented #10 screens or physical equipment. Obtain sandbox/network permissions only where required by the environment; an unexecuted suite stays open.
- [ ] **Audit final local state and preservation.** Confirm `active_creation_version=1`, restored printer policy (`disabled` on the recorded baseline), the exact new migration version, unchanged private-function privileges and removal of this run's fixture-owned records. Preserve unrelated Events and the SQL snippet. If interrupted tests leave data, inspect ownership and remove only proven fixture records; never reset the database or delete records by a broad name match.
- [ ] **Append dated evidence.** Record the final implementation SHA/range, migration filename, RED/GREEN regressions, every required verification command/result, independent reviewer conclusions, any failed/interrupted attempts and subsequent corrections, and the local-state audit. Reuse the existing requirement/endpoint/schema matrices, adding the authorization-race test mapping. State separately: completed version-2 software contracts; #10 UI/integration/retirement/cutover work; #17 automatic full-ejection/safe-recovery proof; and #7 actual-iPad release proof.
- [ ] **Synchronize active status only after the checks pass.** Update the file-map status sentences to link the new evidence and distinguish satisfied #9 software prerequisites from still-open #10 approval/implementation and #17/#7 gates. Preserve all approved behavior, unproven hardware checkboxes and the #10 F1–F8 plans. The publication record's 2026-10-23 issue text remains dated history; append later tracker status only after a corresponding verified tracker action. No new ADR or behavior rewrite is required.
- [ ] **Complete the evidence review and commit.** Review the final evidence/status diff and confirm it matches the tested code revision. Record which final commit only adds documentation atop that candidate. Any subsequent code, migration or test change invalidates the affected verification and requires reviewed reruns, including a complete full suite for a new candidate. Commit only task-owned documentation/hunks with `docs: record issue 9 completion verification`; avoid staging pre-existing documentation edits wholesale.

## Closure and #10 Handoff

Every item below must be true before #9 is described as complete:

- [ ] The package/reload race reproduced before the migration, is fixed afterward, and passed independent review.
- [ ] Existing contract/integration coverage plus the new regressions pass, including authority, receipts, accounting, grants, recovery, concurrency and one-send safety.
- [ ] Full-suite, lint, type, formatting, build and all required browser checks pass for the final reviewed candidate, with any pre-existing formatting exception explicitly accounted for.
- [ ] The evidence identifies the actual reviewed/tested revision and resolves all actionable findings. Old successful runs are not substituted for the final candidate.
- [ ] Active contract/status documents and the #10 handoff accurately separate implemented software from remaining application integration and physical qualification.

After these gates, prepare the concrete #9 acceptance/closure text locally, citing the evidence and code revision. Re-read GitHub before publishing or closing, and use a body file for any multiline tracker update. This planning pass performs no tracker mutation; do not close #9 merely because a plan or issue description was approved. Do not start #10 implementation as part of executing this supplement; its separate implementation plan remains subject to its existing approval and prerequisite checks. Closing #9 authorizes neither production activation nor real printing.

## Plan Self-Review

- [x] Covers each currently unchecked #9 acceptance requirement without reopening completed fixes or adding #10 work.
- [x] Traces callers, active function names/renames, tests, fixtures, privileges and unchanged external interfaces.
- [x] Reuses the existing deterministic Event-lock helper and focus assertion pattern; no new framework, dependency or product decision.
- [x] Gives new authorization tests an actual RED/GREEN cycle; identifies the isolated Profile pass as insufficient for full-suite acceptance.
- [x] Keeps verification/evidence on the final reviewed candidate and preserves historical failures and external gates.
- [x] User review of this completion supplement before implementation; approved 2026-10-24 with the recommended subagent/TDD method.
