# Issue #9 package-contract implementation review

## Task 10: local cutover rehearsal (2026-10-22)

The forward migration `20261021201454_package_contract_cutover.sql` installs an owner-only preflight and activation function. Installation does **not** switch the local or hosted database to version 2. The isolated local stack on ports 56321–56329 remained at `active_creation_version=1` before and after every test. No hosted database or shared database reset was used.

### Procedure

1. Keep new starts closed at the release boundary. Before invoking activation, run `select private.package_cutover_preflight()` as the database owner and retain its JSON report. Resolve all version-1 Reserved, Accepted and Uncertain attempts under the old contract; finish all old runs; complete or cancel every finished-but-Live old Event; finish every pending version-1 media removal using the old redaction flow and verify its Storage deletion before marking cleanup complete; correct invalid Draft package counts and revisions. Require `blockingLegacyWork.pendingMediaCleanup=0`. Do not infer a NotPrinted outcome from missing evidence.
2. Take and verify a pre-cutover backup. Record counts and identifiers for terminal Events, Test and Guest attempts, stock entries, additional-print entries, wasted-film evidence, activities and receipts. Compare the preflight `immutableHistory` totals against the backup.
3. In a reviewed maintenance window, call `select private.activate_package_accounting()` as owner. It locks the global guard first, drains in-flight writes with table locks, rechecks the complete preflight, snapshots terminal version-1 accounting, converts only visible never-started Drafts, switches the creation default to version 2, and revokes legacy mutation RPC grants. The operation is atomic; any blocker aborts the transaction.
4. Inspect the returned report and compare immutable version-1 rows and `private.legacy_accounting_snapshots` with the backup. A converted Draft with an independent allowance mismatch requires authenticated booking review. The receipt records actor, original allowance, acknowledged packages and proposed capacity. A later package-count edit reopens review. The old Test/audit rows linked to a converted Draft remain version 1.
5. Promote the coordinated application release only after the database gate and the new v2 creation, review and Booth paths are ready. Do not resume old accounting after new v2 writes. If a post-cutover defect appears, keep the application unavailable and apply a reviewed forward fix. Restore a verified pre-cutover backup only when no v2 writes exist. There is no destructive down migration.

### Disposable rehearsal evidence

`npm test -- tests/integration/package-migration.test.ts` passed 9/9. Each activation case ran inside a single `BEGIN … ROLLBACK` connection; the guard was checked afterward at version 1. Fixtures included an unresolved old Test attempt, an unfinished old run, a finished run under a Live Event, an out-of-range Draft package count, a terminal Event with one old stock and one audit row, a mismatched Draft with a linked terminal old Test attempt, a matched Draft subsequently edited, and redacted/deleted records awaiting media removal. The blocked cases returned `ready=false` and left no snapshot. Pending v1 media cleanup blocked activation; after the fixture rows were marked complete, preflight and activation succeeded. That fixture represents completed cleanup state and does not exercise Storage deletion. The successful case preserved terminal `originalPrintAllowance=17`, `stockRows=1`, `auditRows=1`, and the linked Test attempt at version 1. It converted the mismatched Draft to v2 with allowance `NULL`, original allowance `25`, proposed capacity `20`, and booking review required. A fresh Draft created inside the activated transaction defaulted to v2 with no independent allowance; a converted Draft package edit reopened review; a terminal v1 mutation was denied. Redacted contact and deleted Draft identity stayed erased. All test rows and activation changes rolled back.

After disposable activation, six representative retired public RPC calls (stock, Test, waste, redaction, handoff and guest) were executed as `service_role` and each returned a database function-permission denial. The old stock-addition HTTP handler was also invoked with a transaction-backed RPC adapter; its actual retired RPC call was denied inside the activated transaction, and the handler returned HTTP 503 `operation_unavailable`. The adapter simulated Admin authority and translated the database denial into the client error shape, so this establishes route response behavior and database denial in a rollback-only rehearsal, not a committed end-to-end rollout.

`package-http-contracts.test.ts` passed 74/74, including strict booking-review input, origin and body-size checks. The targeted live `package-http-access.test.ts` booking-review case passed 1/1: missing Admin authority was denied; stale package acknowledgement was rejected; a successful response yielded a receipt; same-payload replay returned it; a changed-payload replay conflicted. The full HTTP access file stalled during an inherited test and was stopped; it is not claimed as a pass. A serial package regression attempt reached `package-lifecycle.test.ts`, where `does not reuse a reported setup window for a second run` timed out after 30 seconds; the run was stopped. An earlier broad attempt found three `package-schema-access.test.ts` failures caused by orphan Live and Reserved fixture rows left by the interrupted HTTP suite. Those exact local `Package fixture` Event IDs were removed with scoped cleanup; no database reset was used. A combined legacy regression command gave no test result after 90 seconds; an isolated `accounting-ledger.test.ts` attempt also gave none after 30 seconds. Both were stopped and are not claimed as passes. No active fixture Event remained after these stops. TypeScript and changed-file ESLint passed. Local database lint exited successfully with seven warnings in pre-existing functions and none in this migration.

### Limits for Task 11

This rehearsal does not activate the local stack globally, simulate a hosted rollout, exercise old HTTP routes against a committed activated database, verify actual Storage deletion, or qualify physical printer completion. Task 11 supplies the broader serial regression and browser evidence below; coordinated application cutover remains issue #10 work.

## Task 11: requirement and route traceability

The implementation range entering this acceptance pass was `4c583a4..8debfdc`; the Task 11 route, fixture and record changes are in the acceptance commit containing this review. The coordinator's independent whole-branch review remains a separate gate.

The tests below exercise version-2 contracts in the isolated local simulator/database unless stated otherwise. Their names identify coverage; the verification log below determines whether each suite passed in this review. Browser UI and physical printer behavior remain separate gates.

| Approved contract section | Owning evidence | Remaining boundary |
| --- | --- | --- |
| 1. Scope and operating model | `package-schema-access`, `package-accounting`, `package-migration`, `package-http-contracts` | Existing Admin/Booth UI still uses legacy controls; #10 removes them. |
| 2. Event/run/attempt states, readiness, formulas | `package-accounting`, `package-lifecycle`, `package-readiness`, `package-dispatch`, `package-outcomes`, `package-grants` | Physical ejection and live equipment readiness require #17. |
| 3. Guest journey | `package-late-capture`, `package-print-dispatch`, legacy `booth-flow` | #10 must implement and browser-test the new montage, capture/review, timers, completion and privacy flow. |
| 4. Fault, reload and stop recovery | `package-readiness`, `package-dispatch`, `package-outcomes`, `package-grants`, `package-print-journal`, `package-print-dispatch` | #10 orchestrates these contracts in Booth/phone UI; #17 qualifies physical safe clearing. |
| 5. Database, access and privacy | `package-schema-access`, `package-http-access`, `package-http-contracts`, `package-draft-deletion`, `package-late-capture` | Hosted activation and actual-device privacy checks remain open. |
| 6. Endpoints | Route matrix below, `package-http-contracts`, `package-http-access` | Existing legacy consumers switch in #10. |
| 7. Provisional printer adapter | `package-printer`, `package-print-journal`, `package-print-dispatch`, `package-outcomes` | Simulator evidence cannot enable a physical adapter. |
| 8. Retention and migration | `package-migration`, `package-draft-deletion`, `package-schema-access` | Owner activation and coordinated application promotion have not occurred. |
| 9. Acceptance | The preceding suites cover server contracts; this review's command log records results. | #10 UI acceptance and #17/#7 physical release acceptance remain open. |

`package-http-contracts` covers the mutation rows below for request shape, receipt mapping, origin and body-size rejection, except Draft deletion, whose HTTP origin, body-size and replay assertions live in `package-draft-deletion`. The other suites exercise state changes and authority through real local database functions/handlers.

| Section 6 endpoint | Transition/authority evidence |
| --- | --- |
| `POST /api/admin/events/{eventId}/booth/start` | `package-lifecycle`, `package-readiness`, `package-http-access` |
| `POST /api/booth/handoff/confirm` | `package-grants`, `package-http-access` |
| `POST /api/admin/events/{eventId}/booth/recover-access` | `package-grants`, `package-http-contracts` |
| `POST /api/admin/events/{eventId}/booth/pause` | `package-lifecycle`, `package-dispatch`, `package-http-access` |
| `POST /api/admin/events/{eventId}/booth/resume` | `package-lifecycle`, `package-readiness` |
| `POST /api/admin/events/{eventId}/booth/finish` | `package-lifecycle`, `package-dispatch`, `package-outcomes` |
| `POST /api/admin/events/{eventId}/complete` / `cancel` | `package-lifecycle`, `package-draft-deletion` |
| `POST /api/admin/events/{eventId}/delete-draft` | `package-draft-deletion` |
| `POST /api/admin/events/{eventId}/film-packages` | `package-accounting`, `package-http-access` |
| `POST /api/admin/events/{eventId}/reload-confirmations` | `package-readiness`, `package-outcomes` |
| `POST /api/admin/print-attempts/{attemptId}/recover` | `package-dispatch`, `package-http-access` |
| `POST /api/admin/print-attempts/{attemptId}/resolve` | `package-outcomes`, `package-http-access` |
| `POST /api/booth/sessions` | `package-dispatch`, `package-http-access` |
| `POST /api/booth/captures` | `package-dispatch`, `package-late-capture`, `package-http-access` |
| `POST /api/booth/sessions/{sessionId}/end` | `package-dispatch`, `package-outcomes` |
| `POST /api/booth/print-attempts` | `package-dispatch`, `package-readiness` |
| `POST /api/booth/print-attempts/{attemptId}/dispatch` | `package-dispatch`, `package-print-dispatch` |
| `POST /api/booth/print-attempts/{attemptId}/reconcile` | `package-dispatch`, `package-http-access` |
| `POST /api/booth/print-attempts/{attemptId}/observations` | `package-outcomes`, `package-http-contracts` |
| `POST /api/booth/readiness` | `package-readiness`, `package-http-contracts` |
| `GET /api/booth/state`, `/api/booth/operations/{operationId}` | `package-http-access`, `package-grants` |
| `GET /api/admin/events/{eventId}/operations/{operationId}` and Event state | `package-http-access`, `package-accounting`, `package-readiness` |

Additional implemented routes support setup readiness, reload requests and converted Draft booking review; `package-http-contracts`, `package-readiness`, `package-migration` and `package-http-access` cover them. Route presence is not proof that the old UI invokes them.

| Cross-boundary case | Owning assertion |
| --- | --- |
| Camera and printer faults overlap; clearing one cannot hide the other | `package-readiness` overlapping-blocker and reload-confirmation tests |
| Admin Pause/Finish wins before dispatch; dispatch wins before either stop | `package-dispatch` four guard-race tests and two session-end races |
| Lost reserve/dispatch response cannot leave an invisible new hold or create a second send | `package-dispatch` session-end barrier/receipt tests; `package-print-dispatch` journal and response-loss tests; `package-http-access` receipt recovery |
| 49 Printed plus one Pending under five packages | `package-outcomes` explicit zero-availability case and inspected release to one available |
| Stale reload confirmation across a reconnect or another load-fault episode | `package-readiness` generation and episode/revision tests |
| Same-run grant replacement after lost access cannot resume or replace possible output | `package-grants` recovery/handoff tests; `package-http-access` grant scope tests |
| Terminal late Capture accepts only pre-stop shutter metadata for two minutes | `package-late-capture` and `package-http-access` narrow exception tests |

### Schema and authority matrix

| Record or function boundary | Version-2 rule | Evidence |
| --- | --- | --- |
| `events` and `private.booth_contract_guard` | Versioned creation/cutover; one Live Event; Draft identity edits only through validated Admin RLS; lifecycle, allowance, review flag and capacity cannot be directly written by browser or service role. | `package-schema-access`, `package-migration`, `package-lifecycle` |
| `additional_film_package_entries` | Immutable positive whole-package entries and actor/operation identity; additions only through a trusted transaction. Legacy individual-print rows do not enter v2 counts. | `package-accounting`, `package-schema-access` |
| `booth_runs`, grants and handoffs | Version-matched Event/run/device links; one unfinished run, bounded grant scope/expiry, one-use handoff. Direct application-role writes denied. | `package-schema-access`, `package-grants`, `package-lifecycle` |
| Readiness windows and reload requests | Private, current actor/device/generation windows; Admin confirmation changes only the matching request. Direct application-role writes denied. | `package-readiness`, `package-schema-access` |
| Sessions, Captures and Print Attempts | Matching v2 parent links, one open session and globally exclusive unresolved attempt; Dispatching, Accepted and Pending remain held. Direct application-role writes denied. | `package-schema-access`, `package-dispatch`, `package-outcomes` |
| Attempt evidence, activity and receipts | Scoped immutable audit/receipt rows; receipt replay checks actor and payload, including after ambiguous responses. No Guest photo payload. | `package-schema-access`, `package-http-access`, `package-outcomes` |
| Public operation wrappers and private functions | Trusted `service_role` invokes named wrappers; private transaction functions recheck live Admin session or hashed run grant under lock. `anon`/`authenticated` cannot call private functions, and service execution is limited to named dispatcher/read implementations. | `package-schema-access`, `package-http-access`, `package-http-contracts` |

### Review Focus audit

| Failure class | Evidence inspected in this review | Residual limit |
| --- | --- | --- |
| Duplicate delivery or abandoned holds | `package-dispatch` stop/dispatch and end-session races; `package-print-dispatch` and `package-print-journal` response-loss/crash behavior; `package-http-access` receipt recovery. | Existing legacy UI has not adopted this journal in #10. |
| Incorrect capacity or rewritten history | `package-accounting` additions and overflow; `package-dispatch` final reserved unit; `package-outcomes` immutable/49+1 holds; rollback-only `package-migration` legacy snapshots. | Hosted cutover and historical backup comparison remain open. |
| Recovery unexpectedly resumes or clears another fault | `package-lifecycle` pause/Finish; `package-readiness` overlap, expiry, reload episode/generation; `package-grants` recovery into Paused. | Physical safe reload and UI orchestration remain open. |
| Authority or privacy escape | `package-schema-access` grants/RLS; `package-http-access` real Auth, ownership and replay; `package-late-capture` terminal exception; shared-route legacy authorization regression. | Browser UI and actual-device media/privacy review remain #10/#7. |
| Unsupported hardware confidence | `package-outcomes` distinguishes acceptance, unknown and qualified ejection; `package-print-dispatch` one send; production simulator gate tests; readiness old-job clearing. | Physical automatic full ejection and safe recovery remain #17; disabled policy remains in force. |

The owner-only cutover rehearsal in the Task 10 section is rollback-only. The installed migrations leave `active_creation_version=1`; no hosted activation, historical data rewrite or production policy switch is asserted. The version-2 software contracts can be tested locally while the current UI still follows version 1.

### Task 11 verification log (2026-10-22)

All database runs used this worktree's isolated local Supabase stack on ports 56321–56329. The local creation guard remained at version 1; v2 fixtures were owner-seeded and removed. No hosted project or physical printer was used.

Under the focused AGENTS.md documentation question, the user authorized implementation-status wording changes in `PRD.md`, `ARCHITECTURE.md` and this approved replacement spec after verification, with behavior unchanged and #10/#17/#7 still pending. No glossary or ADR decision was changed.

| Command or check | Result |
| --- | --- |
| `npm test -- tests/integration/package-readiness.test.ts tests/integration/package-dispatch.test.ts` | Readiness 9/9 passed; dispatch 18/18 initially failed at setup because its suite omitted simulated policy setup. The dispatch fixture now saves, enables and restores that policy. |
| `npm test -- tests/integration/package-dispatch.test.ts` | 18/18 passed after policy setup, before the DB-clock Capture fixture edit. Final full-suite evidence is required for that edit. |
| `npm test -- tests/integration/package-outcomes.test.ts -t 'keeps 49 Printed and one Pending'` | New regression failed before the fixture seeded 49 Printed attempts; passed 1/1 after the fixture correction. |
| `npm test -- tests/integration/admin-operation-routes.test.ts -t 'keeps the legacy'` | New regression failed 5/5 on shared version-lookup authorization mapping, then passed 5/5 after the route fix. |
| `npm test -- tests/integration/package-http-access.test.ts -t 'maps a revoked Admin to the v2 error'` | Five new real-database shared-route cases failed 5/5 with legacy `forbidden`, then passed 5/5 after resource-version-aware error mapping. The existing Admin attempt recovery/replay case also passed alone. |
| `npm test -- tests/integration/admin-operation-routes.test.ts -t 'blocks production inspected'` | Four inherited cases failed in the pre-fix broad run: the v2-only simulator gate rejected legacy `unused` recovery. After the route fix, a stopped-test orphan Live fixture blocked initial reservation; it was identified as this suite's local `Safe title` Event and removed by the suite's exact ID-scoped cleanup order. Rerun passed 4/4: production ejection remains denied, legacy `unused` recovery succeeds. |
| `npm test -- tests/integration/package-http-contracts.test.ts -t 'keeps inspected resolution and printer observations behind the simulator gate'` | Passed 1/1 after route fix; v2's simulator gate remains in `runPackageAdminOperation`. |
| `npm test -- tests/integration/package-http-contracts.test.ts` | Passed 74/74 after the version-aware response fix. |
| `npm test -- tests/integration/package-late-capture.test.ts` | Initially failed 4/4 at `start_session` with `not_ready` because the suite inherited disabled policy. After saving/enabling/restoring simulated policy in that suite, passed 4/4; the two-minute and pre-stop shutter rules were unchanged. |
| `npm test -- tests/integration/redaction-and-deletion.test.ts -t 'keeps failed media removal pending'` | Passed 1/1 after exact deletion of two old v1 `Ledger fixture` Draft rows left by an earlier interrupted local test. Their IDs, title, state and absence of dependent rows were verified before cleanup. |
| `npm test -- --reporter=verbose` (clean full rerun) | **Passed 52/52 files and 832/832 tests**, exit 0, in 2505.48 seconds. This includes the dispatch DB-clock Capture fixtures, the 1-second readiness positive case with stale 5.001-second denial, the 49 Printed plus one Pending case, all five legacy and five v2 shared-route authorization regressions, all four legacy production inspected-resolution cases, and the four terminal late-Capture cases. |
| `npm run test:e2e` | **Passed 19/19** production-built browser tests, exit 0, in 7.5 minutes. The configured fixture built and served the app. These are existing legacy UI regressions, not #10 screen acceptance. |
| `npx playwright test --config playwright.booth.config.ts` | **Passed 2/2** simulator browser tests, exit 0, in 22.7 seconds. |
| `npx playwright test --config playwright.admin-booth.config.ts` | First run timed out its one test after 90 seconds while `Test Print` stayed disabled after `Connect simulator`. A focused action-logged rerun passed 1/1 in 40.3 seconds; the exact command passed **1/1**, exit 0, on the next rerun in 36.2 seconds. This is an observed development-browser timing flake, not an unqualified clean first pass. |
| `npm run lint`; `npx tsc --noEmit`; `npm run format:check`; `git diff --check` | All exited 0 after the final route and test edits. |
| `npm run build` | Failed twice before source compilation when Turbopack's CSS worker could not bind a local port (`Operation not permitted`), including with elevated local execution. A final exact rerun **passed**, exit 0: optimized Turbopack compilation, TypeScript, and 29/29 static pages. The earlier local process-permission failures remain part of the verification history. |
| `npx next build --webpack` | Passed optimized compilation, TypeScript, 29 static pages and build traces during diagnosis of the transient Turbopack worker failure. The required Turbopack command later passed as recorded above. |

The initial broad `npm test` could not write local Supabase telemetry or reach Docker inside the default sandbox. An elevated verbose run progressed normally but showed the shared-route failures above, so it was stopped before a post-fix full rerun. Its final completed legacy `print-outcomes` file passed 25/25. The stopped run left one Live fixture, which was removed by the existing suite cleanup order with its exact Event ID; no database reset or unrelated row deletion was used.

The first complete elevated `npm test -- --reporter=verbose` ran 52 files and 827 tests in 2618.62 seconds: 49 files and 821 tests passed; six failed in three files. One inherited Draft-list assertion encountered the two old Ledger fixtures; the revoked v2 Admin recovery route returned the legacy `forbidden` code; four terminal late-Capture tests failed at `start_session` before reaching their assertions because their suite did not set simulated policy. The route and fixture regressions were repaired with the failing cases above. The second clean full run passed 832/832. The production and Booth simulator browser suites passed first run; the Admin Booth simulator suite passed after one development-browser timeout, as recorded above.

### Issue #9 completion comparison and handoff

The live issue #9 body was read with `gh issue view 9 --json title,body,state,labels` on 2026-10-22; it remains **OPEN**. Its older stock/redaction wording is superseded by ADR-0025 and the replacement contract, while its executable obligations remain: complete transitions and authority, duplicate/uncertain/concurrent contract tests, and a printer adapter that distinguishes command acceptance from full ejection without resending an uncertain job. The version-2 records/functions/handlers and provisional simulator address those obligations only to the extent the verification log below passes. Do not close #9 while required contract tests or review findings remain.

Issue #10 owns the current application cutover: Draft/package/history UI, phone setup/reload/inspection/stop controls, Guest capture/review/timers/completion, fault orchestration, media/accessibility and browser acceptance. The approved #10 outline is in the [implementation plan](../superpowers/plans/2026-10-21-issue-9-package-contracts-implementation.md#5-issue-10-handoff-outline--not-an-execution-plan-yet). Existing UI routes and version-1 creation still make the present application unsuitable for a version-2 owner activation. #17 must qualify automatic full ejection and safe real-printer recovery; #7 must qualify the integrated release on the actual iPad. No simulator or Chromium run satisfies those physical gates.

| Delivery boundary | Recorded status |
| --- | --- |
| Implemented and tested locally | Version-2 schema, trusted operations/routes, provisional one-send simulator, rollback-only migration rehearsal, 832 passing Vitest cases, 19 passing production browser cases and 2 passing Booth simulator cases. The Admin Booth simulator passed on rerun after one 90-second timeout. |
| Issue #10 integration remaining | Version-2 Admin/Guest UI consumers, coordinated creation-default cutover, retirement of legacy controls in the application, new screen acceptance and hosted activation rehearsal. |
| Issues #17/#7 physically unproven | Automatic normal full ejection, safe printer recovery and actual iPad end-to-end release. The physical proof boxes remain open. |

### Final whole-branch review fixes (2026-10-22)

Final review reproduced six gaps: a fresh reservation could reuse a terminal Guest Session; evidence/qualification blockers could project Welcome; legacy redaction could erase v2 History; legacy Test did not share the v2 start lock or exclude Paused v2 runs; inspected-outcome receipts could not replay after Event completion; and Draft deletion HTTP evidence was attributed to the wrong suite. The forward migration `20261021233012_package_final_review_guards.sql` and the Booth state projection fix address these findings without changing the approved contract.

The legacy compatibility check also found direct v2 writes through individual-print additions and legacy observation handling. The migration now rejects v2 Events in the existing legacy mutation implementations: guest operations, Test/waste, print outcomes, individual-print additions, Event lifecycle, handoff preparation/issue/confirmation, Capture recording, pause/reconnect, and redaction begin/completion. These functions take the common package guard before Event locks; new legacy Test, handoff preparation and guest admission/reservation reject unfinished v2 runs. Existing v1 receipts, current actor checks and payload conflicts remain covered. No public signature, execution grant or creation default changed.

| Final fix verification | Result |
| --- | --- |
| Targeted RED regressions | Reproduced duplicate terminal reservation, terminal inspected-receipt rejection, incorrect Welcome projection, direct legacy v2 redaction, Paused-run Test admission, and both missing Test/start lock orderings. |
| Affected integration gate | **253/253 tests passed across 14 files**, exit 0, in 1759.00 seconds: `package-outcomes`, `package-dispatch`, `package-http-access`, `package-legacy-boundary`, `accounting-ledger`, `event-run-transitions`, `guest-reservations`, `print-outcomes`, `test-and-wasted-film`, `redaction-and-deletion`, `booth-late-capture`, `booth-pause`, `package-schema-access`, and `package-migration`. |
| Static and database checks | TypeScript, ESLint, repository/focused formatting, whitespace checks, local SQL lint and local security/performance advisors passed. |
| Local state after verification | `active_creation_version=1`, printer completion policy `disabled`, and no remaining Package fixture Events. |

The first focused post-fix run passed 25/27 cases; both remaining cases had already passed terminal receipt replay and conflict/immutability assertions, then expected the wrong revoked-session code. The expectation was corrected to the existing `access_required` contract, and the complete affected gate above passed. Initial malformed test-cookie and RPC-argument fixtures were corrected before relying on their results. The full 832-test, build and browser results earlier in this record predate these final fixes; those gates were not rerun in this scoped pass. No hosted activation or physical qualification occurred.

#### Scoped handoff expiry correction

Scoped re-review found that legacy handoff issuance and confirmation still compared deadlines with request-start time after waiting on the newly shared guard. `20261022001206_package_handoff_clock_checks.sql` changes only the eight deadline comparisons in `finish_booth_handoff` and `confirm_booth_handoff` to `clock_timestamp()`, including successful receipt replay. Function signatures, actor checks, receipt digests, conflict rules and state transitions are unchanged. The CLI-generated `20261022001139_package_legacy_handoff_expiry.sql` was applied empty after a local extraction assertion failed; it is retained unchanged as applied history. Neither migration was applied to hosted infrastructure.

Six deterministic regressions hold the shared guard, observe the queued RPC in `pg_stat_activity`, and arrange expiry after request start but before releasing the lock. They cover fresh issuance/confirmation, issuance replay before confirmation, issuance/confirmation replay after activation, and requested grant expiry. All six failed before the correction. After the correction, the full `event-run-transitions` suite passed **24/24**, exit 0, in 153.25 seconds. This includes the existing v1 lifecycle, authorization, replay, conflict and revocation regressions.

The focused direct v2 boundary check also passed **2/2** (`package-legacy-boundary -t 'finish_booth_handoff|confirm_booth_handoff'`), exit 0, in 12.78 seconds. TypeScript, ESLint, focused formatting and whitespace checks passed. Local SQL lint exited 0 with existing warnings outside these two functions; local advisors reported no issues. Final owner read confirmed creation version 1, disabled printer policy, and zero Package/Lifecycle fixture Events. The earlier 253-test and full-suite/build/browser results predate this narrow correction and were not rerun.
