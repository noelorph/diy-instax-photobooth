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
