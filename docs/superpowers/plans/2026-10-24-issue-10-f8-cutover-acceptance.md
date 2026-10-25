# F8 — Coordinated Cutover and Final Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full**. Reuse #9's owner-only cutover/preflight, preserve historical records and remove obsolete paths completely. Do not add a deployment framework or weaken preservation/verification to shorten the work.

**Goal:** Prove the complete application and coordinated version-2 cutover in nonproduction, including historical preservation and denial of obsolete writes.

**Architecture:** Combine F1–F7 on one reviewed candidate, settle legacy work with the pre-cutover application, then activate the existing database safeguards together with the new application. Rehearse on a disposable local copy, preserving the ordinary development stack. Retain historical readers/migrations while removing runtime compatibility branches and old product operations.

**Tech Stack:** Existing Next.js/Supabase migrations and owner tooling, Vitest, Playwright, local Docker/Supabase only.

**Spec:** [Approved design, F8](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f8-coordinated-cutover-retirement-and-final-acceptance), replacement contract section 8, current #10 retirement list. Parent #10; #9 prerequisite satisfied; additionally requires **all F1–F7**. [Index/shared rules](2026-10-24-issue-10-implementation-plan.md).

## Global Constraints

- Verify accepted #9 candidate `2f89a96` and its passing evidence before implementation; #9 is closed; require F1–F7 acceptance before cutover. Plan approval is not physical/production release permission.
- Nonproduction rehearsal only. No hosted activation, production deployment, issue closure or real printer/iPad trial in this child.
- Never alter applied migrations, discard unresolved legacy holds, force unknown outcomes to NotPrinted or fabricate historical package conversions. Finish all old runs and complete/cancel finished-but-Live legacy Events; complete pending legacy media cleanup.
- Pre-cutover backup restore is allowed only before new version-2 writes. Once they exist, keep unavailable and use a reviewed forward fix; no downgrade/data loss.
- All eight retirements cover controls, callers, server actions, HTTP endpoints, application-accessible database functions, tests and fixtures. Hiding buttons is insufficient.
- UI acceptance uses [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), [screen map](../../design/2026-10-21-package-recovery/screen-map.md), the full [17-sheet gallery](../../design/2026-10-21-package-recovery/index.html) and [paired-device journey](../../design/2026-10-21-package-recovery/journeys/01-ipad-phone-recovery.png). F8 creates no product screen.

Follow the [shared command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Update this capability’s rows in the [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) with actual revision/command/result before closure; pending rows are not passing evidence.

## Review Focus

1. A retired write may survive through a stale HTTP client or granted RPC after its UI disappears — task 1.
2. Legacy Finishing-equivalent work, finished-but-Live Events or failed media cleanup must block conversion — task 2.
3. Old terminal totals, erased contact and mismatched Draft allowances must survive cutover truthfully — task 2.
4. A failure after the first v2 write must not trigger backup restore or accounting downgrade — task 2.
5. Mocked browser success, isolated reruns or a simulator configuration leak cannot count as final application acceptance — task 3.

## File map and cutover interfaces

Extend the existing `docs/implementation/issue-10-retirement-and-acceptance.md` and its acceptance trace. Create `tests/integration/package-retirement.test.ts`, `tests/fixtures/package-cutover.ts`, `tests/e2e/package-cutover.spec.ts`, `playwright.cutover.config.ts` and a forward `supabase/migrations/<new-timestamp>_package_runtime_retirement.sql` only if remaining SQL denial changes are needed. Timestamp it after the final predecessor at execution. Modify `playwright.config.ts` to exclude the cutover file, plus only traced runtime/config/test callers, `tests/integration/package-migration.test.ts`, relevant browser fixtures, active documentation status and generated types when SQL changes. Keep historical migrations/evidence unchanged.

Existing owner interfaces: `private.package_cutover_preflight() returns jsonb`, `private.activate_package_accounting() returns jsonb`. They are not application RPCs and remain unavailable to anon/authenticated/service-role callers. The current activation sets `active_creation_version = 2`, changes the Event default, snapshots legacy terminal accounting, converts eligible Drafts and revokes legacy public mutation grants. Extend only proven gaps using forward migrations.

`tests/fixtures/package-cutover.ts` exports `withPackageCutoverFixture(run: (fixture: PackageCutoverFixture) => Promise<void>): Promise<void>`. The fixture owns a temporary Supabase work directory/project named `diy-instax-package-cutover`, API `http://127.0.0.1:57321`, database port `57322` and matching unused `5732x` service ports. Derive a config copy from this repo, verify project/container/URL before owner commands, and refuse a populated non-fixture project. Start the candidate test app on `127.0.0.1:1440` with only that stack's credentials; tear down only that created stack in `finally`. Do not relax the existing `local-supabase.ts` host/project checks. `PackageCutoverFixture` supplies `ownerSql(sql: string): unknown[]`, `backup(): Promise<string>`, `restoreBeforeV2Writes(path: string): Promise<void>` and `assertNoApplicationV2Writes(): Promise<void>`; the restore helper fails closed if it cannot prove the precondition. Capture an immediate post-activation baseline and compare all application-mutable v2 rows, revisions, receipts/audit and Storage objects while writes are stopped; converted Drafts alone are not new application writes, and absence of print receipts alone is not proof that nothing changed. Use static test SQL and synthetic data, not user input or real bookings.

The [command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules) is binding. `playwright.cutover.config.ts` matches **only** `package-cutover.spec.ts`, uses one worker, `baseURL: 'http://127.0.0.1:1440'`, and no `webServer`; the fixture owns app lifetime during switch/restore. Disable screenshot/trace/video. Use an isolated app directory/build output and explicit local API, publishable/service credentials and `ADMIN_AUTH_ORIGIN` for both old/candidate apps. The candidate runs production build/start with simulation denied; full Guest simulation runs separately under the two simulator configs. Never inherit `.env.local`, reuse `1437` or `56321`, import the fixed-stack owner helper, or stop an existing stack/app on a port collision.

Use the accepted pre-cutover application and compatible migrations for legacy settlement; stage any runtime-retirement migration until the activation boundary. Do not start by applying a migration that removes the old application's settlement operations. Record the exact old revision, additive schema predecessor, candidate revision and applied retirement migration. Run only one old/candidate app at a time on `1440`, stop it during backup/activation/restore, and await health after each start. Derive all enabled service ports into `5732x` (including shadow DB/Studio/mail); disable unused services rather than retaining conflicting `5632x` ports. Cleanup stops only resources created by this invocation, even after failure.

## Task 1: Complete the retirement inventory and final runtime removal

**Files:** Existing retirement record and new denial test; affected files below and their callers/fixtures discovered by `rg`. In a candidate branch, remove obsolete code now; deploy/switch it only with task 2 activation. Keep the pre-cutover revision available for settlement.

| Retirement                   | Starting trace (expand to every caller)                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editable Print Allowance     | `src/features/admin/events/`, `src/lib/events/drafts.ts`, operational types/read/panel, DB column grants/guards                                                                                                                                        |
| Individual Additional Prints | `src/app/api/admin/events/[eventId]/additional-prints/route.ts`, legacy add-event-prints RPC and input schemas                                                                                                                                         |
| Shared Film Stock            | `src/app/api/admin/film-stock/{additions,reconciliations}/route.ts`, live stock reads, stock helpers and SQL grants                                                                                                                                    |
| Wasted Film/quality refunds  | `src/app/api/admin/print-attempts/[attemptId]/wasted-film/route.ts`, legacy observation/inspection branches; F7 historical reader remains                                                                                                              |
| In-app Test Print            | `src/app/api/admin/events/[eventId]/test-attempts/route.ts`, `src/app/api/admin/print-attempts/[attemptId]/test-output/route.ts`, old setup/simulator controls                                                                                         |
| Redaction/past deletion      | `src/app/api/admin/events/[eventId]/redact-client/route.ts`, `src/lib/operations/event-redaction.ts`, pending-removal callers; retain safe Draft deletion                                                                                              |
| Old recovery/takeover        | Legacy `booth-handoffs`, `pause`, `/api/booth/{bootstrap,guest-sessions,connection-changes,pauses,handoffs/confirm}` consumers and their child routes; shared observations/resolve/recover must retain v2 only                                         |
| Compatibility leftovers      | `package-version.ts`, unused branches in `package-route.ts`, `admin-route.ts`, `booth-route.ts`, `admin-lifecycle.ts`, legacy printer contract/simulator and schemas; preserve anything still demonstrably required by active v2 or historical reading |

- [ ] Build the inventory with one row per concrete runtime entry point, caller, action, SQL function, fixture/test and historical exception. Search imports plus `originalPrintAllowance|original_print_allowance|additional_print|film_stock|wasted|test_output|redact|operationKey|isPackage` in active source/tests and relevant SQL. Read each match; historical terminology alone is not a bug.
- [ ] Add denial tests for every retired operation with real active Admin, Booth grant, anonymous and service-role credentials as applicable. After cutover, an authenticated old URL must return non-success with unchanged rows/counters/audit; a removed route is 404/405, a deliberately retained denial route uses the documented error. Test direct legacy SQL execution and write grants, plus old payloads on shared v2 endpoints:

  ```ts
  expect(response.ok).toBe(false);
  expect(afterRelevantRows).toEqual(beforeRelevantRows);
  expect(canExecuteLegacyRpc).toBe(false);
  ```

- [ ] Run `npm test -- tests/integration/package-retirement.test.ts tests/integration/package-migration.test.ts`; direct SQL activation/denial assertions on the ordinary stack use rollback-only transactions, as in the existing migration tests. New cases must expose surviving mutations. Committed HTTP/application denial proof runs in task 2's disposable stack; do not activate the ordinary stack or accept mocked transport as final proof.
- [ ] Remove each obsolete caller/entry point and dead compatibility helper after tracing shared use. Reuse #9's existing activation revocations; extend forward migration only for gaps. Preserve the historical read paths and opaque cleanup/audit behavior. Convert old feature-success tests into current denial/history assertions where the feature is retired; keep migration settlement tests explicitly pre-cutover. Ensure qualification tooling cannot re-expose retired product operations or enable physical production use. Remove unused exports/config/dependencies only when this trace proves them unused.
- [ ] Rerun focused denial/read tests, type/lint checks and source trace; record each removal or narrow historical exception. Commit with `refactor: retire superseded product mutation paths`.

## Task 2: Rehearse committed activation, preservation and failure recovery

**Files:** New disposable fixture/browser config/test, retirement record and any forward safeguard changes; existing `package-migration.test.ts` remains useful rollback-only coverage, not the committed rehearsal.

- [ ] Add the cutover config and default exclusion **before** executing the new test. Run `npx playwright test --config playwright.config.ts --list`, then the same command with `playwright.booth.config.ts`, `playwright.admin-booth.config.ts` and `playwright.cutover.config.ts`. Save the file lists under trace F8-01: default omits the three specialized files; each specialized config selects only its intended file. Listing has no provisioning side effects.
- [ ] In `package-cutover.spec.ts`, name the environment guard case `cutover refuses the ordinary stack and leaves its baseline unchanged`. Reject the wrong config/base URL before fixture setup; test fixture rejection of wrong project/container/API/occupied ports before owner SQL or cleanup. Snapshot the ordinary stack read-only before/after a successful rehearsal and prove it is unchanged. Fixture identity and cleanup tests must pass before committed activation is attempted.

- [ ] Create synthetic legacy terminal rows with original non-package totals, Test/waste history, receipts, deleted/redacted records, a matching Draft, a mismatched Draft, unfinished run/unknown attempt, finished-but-Live Event and pending media cleanup. Add rejection/preservation tests and before/after snapshots. Core oracles:

  ```ts
  expect(preflight.ready).toBe(false); // until every legacy blocker is resolved
  expect(after.legacyTerminalAccounting).toEqual(before.legacyTerminalAccounting);
  expect(after.mismatchedDraft.booking_review_required).toBe(true);
  expect(after.active_creation_version).toBe(2);
  ```

  Assert the mismatched Draft is booking-blocked until an explicit real review and that review clears only that blocker; a matching Draft needs no review. Positive simulator-backed Start is proved by F4’s development suite; the production-built cutover app must still deny unqualified/simulated printing. Keep booking eligibility distinct from equipment/release readiness. Backup verification must include Auth/data/required private media for this synthetic environment, not merely a successful dump command.

- [ ] Run `npx playwright test --config playwright.cutover.config.ts` to demonstrate the missing coordinated behavior or preserve an existing passing scenario; the fixture must abort on unexpected stack identity. Keep Guest screenshots/traces/video off.
- [ ] Implement the rehearsal sequence in the fixture/runbook: stop new starts/application mutations; inspect read-only preflight; settle pending legacy output honestly under the old contract; finish old runs; complete/cancel old Live Events; finish legacy media cleanup; take and verify backup; stop the old application; invoke existing owner activation; start the candidate; verify history, Draft conversion and all obsolete-write denials. Guard the maintenance interval at the serving/deployment boundary; do not add an Admin maintenance product feature. Final runtime removal is coordinated with this switch, not applied to the settlement application early.
- [ ] Exercise failure before any application v2 write: keep unavailable and restore the verified pre-cutover backup, then rehearse again. Exercise failure after an application v2 write: the restore helper must refuse; preserve rows/receipts and keep unavailable until a reviewed forward fix passes. Never downgrade old versions or automatically activate based on elapsed time. Tear down only the disposable fixture once evidence is recorded.
- [ ] Rerun cutover browser/integration tests and local SQL lint. Expected: committed activation, preserved original history/media, correct Draft review, denied old mutations and both recovery branches pass. Record exact revision, commands and limitations. Commit with `test: rehearse coordinated package application cutover`.

## Task 3: Verify the complete candidate and record #10 acceptance

**Files:** All capability acceptance tests, browser configs/fixtures, `docs/implementation/issue-10-retirement-and-acceptance.md`; update active docs' implementation status only to match actual evidence. No new behavior except fixes to a failing approved acceptance case.

- [ ] Audit the [existing acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) accumulated by F1–F7, including the 17-sheet coverage map. Verify every row has its owner's actual revision, exact command/config/environment and passing evidence; resolve missing/stale coverage before final acceptance. Preserve #9's accepted evidence separately. In particular, inspect F2's early mechanics/deletion proof, F4's post-navigation readiness, F5's persisted new-Guest admission after purchase, F6's blocked variants and F7's approved three-of-four monthly count. Do not replace pending rows with inherited #9 pass counts.
- [ ] Add only missing combined regressions. Two-device simulator acceptance must use real handlers/database, not request mocks or manual success flags. Verify media/Guest privacy, current-session authorization, private/no-store responses, keyboard/status/focus, both Admin themes, Booth dark, responsive layouts, 200% zoom, safe areas and reduced motion. Production-built tests must reject simulation/evidence endpoints even if the simulator environment flag is supplied.
- [ ] Run every command in the [index verification list](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules), including the dedicated cutover config, serially. All must exit 0 on the final reviewed candidate. Record failures, fixes and exact reruns; do not substitute a passing single test for a required full-suite failure. Review must leave no unresolved acceptance finding.
- [ ] Update the retirement/evidence record and affected active status docs with actual pass counts/revision, migration result, preserved-history evidence and remaining #17/#7 gates. Leave simulator results explicitly nonphysical and production activation unperformed. Never copy an old test count as new evidence.
- [ ] Commit the verified fixes/evidence with `docs: record issue 10 nonproduction acceptance`. Do not close #10, deploy or enable physical printing without the later corresponding instruction/gate.

**Done:** F1–F7 integrated behavior, coordinated committed cutover, all eight retirements and required verification pass on the final reviewed revision in nonproduction. Real automatic ejection/recovery remains #17; actual-iPad release remains #7. Any failing required check means F8 is still open.
