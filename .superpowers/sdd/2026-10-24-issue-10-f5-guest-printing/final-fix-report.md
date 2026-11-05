# F5 final review fix — 2026-11-03

Commit: this report's commit, `fix: hold print confirmation and release pending capture photos`.

## Scope

- `BoothFlow.project()` keeps an acknowledged `Print complete` screen through the 3,000 ms timer when a fresh state poll reports ordinary next-Guest blockers: booked capacity exhausted or the previous job not yet ready. Paused/Finishing/Finished state, access loss, offline/camera/printer-connection faults and other blockers still stop it. An offline equipment fault now ends confirmation synchronously.
- `BoothFlow.shutter()` tracks the encoded photo while Capture metadata acknowledgement is pending. Stop, fault or disposal discards that image immediately; encoding that finishes after stop also discards immediately. The metadata request and journal acknowledgement continue, and an authorized printer send retains its separate transport ownership.
- Touched the controller and its existing unit seam only. No routes, contracts, UI components, fixtures outside that test file, configuration, exports, dependencies or root/docs authority files changed. The test fixture now models server exhaustion after its final Printed attempt.

## Red/green

- Both mid-confirmation poll tests failed with `unavailable` instead of `confirmed` before the projection change and passed after it. One uses the final booked unit and `ready_for_new_job`; the other keeps the completed job not ready. Both assert no early Guest Session end and the correct unavailable result after 3,000 ms.
- With a held Capture response and already encoded image, the Pause test failed because disposal had not occurred before response release; it passed after pending-image ownership was added. The offline-fault and disposal variants pass with the same held-response boundary and exactly-once disposal after release. A further test confirms an image encoded *after* disposal is released before the held response. These tests check that Capture requests contain no image URL.
- A separate confirmation fault test failed because an offline observation left `confirmed` visible; it passed when `stopForBlocker()` included confirmation.

## Verification

- `npm test -- tests/unit/booth-flow.test.ts -t 'keeps the final booked print confirmation|keeps confirmation visible while the printer'` — **2 passed** after both first failed.
- `npm test -- tests/unit/booth-flow.test.ts -t 'discards an encoded photo immediately when Pause'` — **1 passed** after first failing at disposal count 0.
- `npm test -- tests/unit/booth-flow.test.ts -t 'ends confirmation immediately on a genuine offline fault'` — **1 passed** after first failing at `confirmed` versus `unavailable`.
- `npm test -- tests/unit/booth-flow.test.ts tests/components/booth-flow.test.tsx tests/unit/booth-camera.test.ts tests/unit/package-print-dispatch.test.ts tests/unit/package-print-journal.test.ts` — **125 passed in 5 files** on final code.
- `npx playwright test --config playwright.booth.config.ts --reporter=line` — initial sandbox run could not start its web server because Supabase CLI could not write `~/.supabase/telemetry.json`; approved rerun outside the sandbox **passed 2 tests** (portrait/landscape Booth flow and invalid grant).
- `npx tsc --noEmit`, `npx eslint src/features/booth/flow.ts tests/unit/booth-flow.test.ts`, `npx prettier --check src/features/booth/flow.ts tests/unit/booth-flow.test.ts`, and `git diff --check` — passed.

Parent owns the full suites and scoped re-review. Browser tests exercise the current Booth flow but do not simulate a two-second refresh on the confirmation screen; the controller tests cover that timing. Real printer and actual iPad qualification remain open.
