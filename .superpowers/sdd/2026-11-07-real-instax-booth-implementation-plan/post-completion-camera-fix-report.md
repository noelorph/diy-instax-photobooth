# Post-completion camera lifecycle fix — 2026-11-09

## Root cause and scope

The ordinary transition after matching Printed acknowledgement, the 3000 ms confirmation, and matching session-end acknowledgement can remain unavailable while old-job safety or fresh admission readiness is pending. BoothClient previously stopped the camera for every unavailable phase after Guest work. Reporting that deliberately stopped stream converted the ordinary wait into a persistent camera blocker.

Changed only `src/features/booth/flow.ts`, `src/features/booth/booth-client.tsx`, and new controlled component regression `tests/components/booth-completion-camera.test.tsx` (plus this report). Flow now exposes an optional completionAdmissionWaiting projection after successful normal session closure. It is restricted to an Active run with positive available capacity, no unresolved/pending attempt, live fresh camera observation, reachable server, bound fresh printer connection, no load fault, and blockers limited to printer safety/readiness staleness. Printer clearing must belong to the existing completed attempt, or the printer must already report ready. This projection changes camera lifecycle only; it never grants admission.

Client retains the live camera for that narrow wait. The effect also observes retention changes so a real fault while already unavailable still stops it. Fault handling revokes retention; Pause/Finish/access/end/exhaustion behavior remains blocking. No automatic camera restart, permission request, printer action or photo resend was added. No detector, revision, correlation, accounting, confirmation timer, session receipt validation or next-Guest readiness/safety condition changed.

## Regression and verification

RED: new real-Flow + real-simulator component test failed against the original source at the first post-end assertion: expected camera.stop not to be called, received one call. The four initial fault/Pause cases passed against that source.

GREEN: `npx vitest run tests/components/booth-completion-camera.test.tsx tests/components/booth-flow.test.tsx tests/unit/booth-flow.test.ts` — 3 files, 120 tests passed. New regression file has 11 cases:

- Confirmation remains at 2999 ms; normal end begins at 3000 ms; held matching end response blocks a second Guest.
- After end acknowledgement, withheld safety and readiness keep Start blocked without stopping the live camera; releasing both returns Welcome without Enable Camera.
- One send, one full-ejection observation, one Printed increment and one normal end request.
- Pause, offline, camera loss and printer disconnect during both held-end and post-end waits retain blocking/camera-stop behavior.
- Post-end load fault and booked-capacity exhaustion stop the camera.

`npx tsc --noEmit` passed. Targeted ESLint on both source files and the new test passed. `git diff --check` passed.

## Limits and handoff

Database/browser execution belongs to the coordinator's serial runtime verification slot and was not run here. The coordinator will run the final combined suite on the reviewed candidate; this report does not claim that broader acceptance. No physical action, qualification claim, important product-document change, dependency, or unrelated edit was made. Existing dated physical evidence and release gates are unchanged. The pre-existing Next-generated AGENTS.md block deletion was left untouched and excluded from this commit. No meaningful Next.js-specific feedback candidate arose.

## Review round 1 — correlated generic printer fault

Addressed the P2 in `post-completion-camera-review.md` on base `b4e73bb`. Verified that the real adapter's `unknown()` retains connection while making the job unsafe and emitting `outcome_unknown`, and that a terminal Printed attempt records subsequent observations as diagnostics. Such a fault therefore cannot rely on a server Pending blocker to revoke camera retention.

The existing synchronous printer observer now revokes completion retention with a generic printer fault only when `outcome_unknown` matches the outstanding completed attempt, current dispatch, bound printer ID and connection generation, while the Guest is confirmed or waiting after normal closure. Observation journaling/reporting still proceeds normally; no terminal accounting or physical-safety acknowledgement is substituted. All unrelated faults and ordinary clearing behavior remain as before.

Added five controlled component cases for matching and individually mismatched attempt ID, dispatch ID, printer ID and connection generation. The test holds the generic-fault observation response, advances no clock after emission and asserts that the matching connected fault stops the camera while unavailable remains unavailable, with Start blocked, one send and one Printed count. Each mismatched fault leaves the camera untouched before its response. The original normal clearing/readiness recovery regression remains passing.

Exact verification commands and results:

- RED: `npx vitest run tests/components/booth-completion-camera.test.tsx` — exit 1; `Test Files 1 failed (1)`, `Tests 1 failed | 15 passed (16)`. Matching generic-fault case failed: `AssertionError: expected "vi.fn()" to be called at least once` at the immediate camera-stop assertion. Four mismatch guards and original 11 cases passed.
- GREEN: `npx vitest run tests/components/booth-completion-camera.test.tsx tests/components/booth-flow.test.tsx tests/unit/booth-flow.test.ts` — exit 0; `Test Files 3 passed (3)`, `Tests 125 passed (125)`, duration 22.76s.
- `npx tsc --noEmit` — exit 0, no diagnostics.
- `npx eslint src/features/booth/flow.ts src/features/booth/booth-client.tsx tests/components/booth-completion-camera.test.tsx` — exit 0, no diagnostics.
- `npx prettier --write src/features/booth/flow.ts tests/components/booth-completion-camera.test.tsx` — both files unchanged by formatting.
- `git diff --check` — exit 0, no diagnostics.

This follow-up changes only Flow, its controlled component regression and this report. No database/browser/full-suite or physical checks were run, consistent with coordinator ownership. AGENTS.md remains untouched/excluded. No Next.js-specific feedback candidate arose.
