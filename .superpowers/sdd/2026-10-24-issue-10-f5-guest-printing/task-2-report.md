# F5 Task 2 report — 2026-11-03

Implementation commit: this report's commit, `feat: integrate one send printing and confirmed completion`.

## Change

- `BoothFlow.print()` now supplies scoped #9 reserve and dispatch HTTP operations to `dispatchReservedAttempt`. The helper retains its durable reservation/dispatch intent, one-send guard, fresh readiness checks and image release. The controller does not retry or resend a photo.
- Printer observations go through `recordAndReportObservation` and the metadata journal. Command acceptance stays in `printing`. Only an acknowledged `Printed` observation shows `Print complete`, for 3,000 ms. The final booked unit dispatches with zero available after its Reserved hold; it exits to the booked-prints message after confirmation.
- `reconcilePending` reads scoped operation receipts and current pending attempt state. It closes the old session before clearing a reservation that has no receipt, reconciles possible delivery to Pending, and keeps unknown outcomes unavailable even with an empty local journal. Receipt kind and operation ID are checked before journal acknowledgement.
- Healthy admission-readiness writes pause while the authorized printer job is busy. Negative camera/network/equipment observations still invalidate admission. The image remains owned by transport until `sendOnce` settles, then is discarded once.
- The simulator ejection controls are exposed only by the nonproduction browser fixture flag. Guest-photo bytes are absent from request bodies and the journal.

## Red/green evidence

- New controller test first failed at `commandCount` 0 versus 1 after Print; it passed after helper integration.
- Empty-journal reload test first failed because no server reconciliation request occurred; it passed after boot reconciliation.
- Busy-printer test first failed with `unavailable` instead of `printing` after a readiness rejection; it passed after skipping healthy readiness writes during printing.
- Additional passing tests cover final-unit dispatch, duplicate Print, lost reserve and dispatch responses, dropped ejection acknowledgement, receipt replay, and image disposal.

## Verification

- Required four-file command: `npm test -- tests/unit/package-print-dispatch.test.ts tests/unit/package-print-journal.test.ts tests/unit/booth-flow.test.ts tests/integration/package-dispatch.test.ts` — **102 passed in 4 files**, serial DB run. The first overlapping invocation had 19 integration failures from the single-Live-Event fixture constraint; a read-only DB check found zero Live Events, then the serial rerun passed.
- After the final changes: focused controller test — **48 passed**; controller/dispatch/journal/component gate — **87 passed in 4 files**. `npx tsc --noEmit`, changed-file ESLint, Prettier and `git diff --check` passed.
- `npx playwright test --config playwright.booth.config.ts` — **2 passed**. Portrait and landscape mock flow now reaches real controller dispatch while keeping request/storage payloads metadata-only.
- Named real Admin/Booth browser case, `--grep 'final booked unit'` — **1 passed**. It seeded five packages and 49 Printed attempts, created exactly one new attempt, observed zero available with its Reserved hold, saw no completion on dispatch acceptance, emitted one simulator full-ejection observation, verified acknowledged Printed at 50/50, and exited to booked-print exhaustion.
- Full Admin/Booth config: **11 passed, 2 failed, 4 unrun** before stopping. The existing `phone Pause, receipt recovery, Resume and pending Finish retain scoped safety` timed out at 90 seconds with the Booth still paused and `Enable Camera` visible. Playwright gave no assertion line; the likely wait is the Welcome assertion after phone Resume. Task 1 did not establish a pre-Task-2 pass for this config. The next test failed separately at fixture startup because local Supabase reported stopped auxiliary services. No Live Event remained after interruption. The complete Admin config is not claimed green.

## Remaining limits

- F6 still owns complete recovery presentation and retries for pending receipts; this task blocks admission and resend while outcomes are unknown.
- The broad project suite was not rerun at the parent agent's direction; Task 1 already recorded obsolete legacy Test/Wasted Film failures. Physical printer and actual iPad qualification remain open. Simulator observation and browser tests are nonproduction evidence only.

## Review fixes — 2026-11-03

Follow-up commit: `fix: reconcile printer observations and recovery safely`.

- Four new tests were red before code changes: `ready_for_new_job` was dropped and a second Guest print could not proceed; `command_accepted` could display completion when a reply said Printed; an ejection observation with a missing receipt was not replayed; and a malformed journal prevented a server pending-attempt check. All four passed after the changes. The second-print test also found that the #9 helper intentionally refuses to proceed on old journal entries even after reconciliation; the controller now clears confirmed old entries before invoking it for a new session.
- Attempt-scoped `ready_for_new_job` and `connection_changed` observations now use the existing #9 observation route and metadata journal. The former allows the server to confirm old-job safety after Printed. Ejection completion requires a matching attempt and dispatch ID, the `full_ejection_confirmed` observation kind, and an acknowledged Printed receipt. A missing observation receipt replays the original journaled operation ID and body before any generic pending reconciliation.
- Boot reads the scoped server pending attempt even if local journal parsing fails, while malformed local state continues to block admission. The Admin Pause/Resume browser test now explicitly re-enables the stopped camera and awaits scoped readiness before phone Resume.
- Verification after review fixes: unit/dispatch/journal/component gate **91 passed in 4 files**; `tests/integration/package-outcomes.test.ts` **40 passed**; `tests/integration/package-dispatch.test.ts` **26 passed**; named Admin Pause/Resume browser test **1 passed**; named real final-unit browser test **1 passed**; Booth browser config **2 passed**. TypeScript, changed-file ESLint, Prettier and `git diff --check` passed.
- Full Admin browser config was not rerun after the named Pause/Resume fix. Local `supabase status` exited successfully with core API/DB available but still listed realtime, imgproxy, edge runtime, analytics, vector and pooler as stopped. No shared stack restart was attempted. The prior full-config result above remains the only full run; no full Admin pass is claimed.

## Re-review fixes — 2026-11-03

Follow-up commit: `fix: retain late printer safety and fence observation replay`.

- A late `ready_for_new_job` test failed after the three-second completion timer because the controller had cleared its attempt ID. It now retains only the attempt ID needed to correlate job-safety feedback after the photo and Guest Session are released, then clears that ID and dispatch ID after acknowledged safety reporting. The test passed. The existing immediate-ready/two-consecutive-print test also passed.
- A stale ejection journal test failed because its observation was posted to a different current pending attempt. Reconciliation now rejects mismatched attempt correlation before reading or replaying that entry; the test passed and the stale journal remains pending for safe recovery.
- The Admin setup test's camera response wait targeted `/api/booth/readiness` while still in Admin setup. It now waits for the actual `/setup-readiness` POST. The affected named browser case passed.
- Final scoped verification: controller/dispatch/journal/component **93 passed in 4 files**; Booth browser config **2 passed**; named Admin setup case **1 passed**; named real final-unit case **1 passed**. TypeScript, changed-file ESLint, Prettier and `git diff --check` passed. The #9 integration gates from the preceding review round remained **40/40** package outcomes and **26/26** package dispatch; no #9 backend files changed in this round.
- The full Admin browser config remains unverified because the local stack still reports stopped auxiliary services; no shared stack restart was attempted.
