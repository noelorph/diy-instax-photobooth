# F5 Task 3 report — 2026-11-03

## Change

- Added 75-second inactivity warning and focused Continue action, with a 90-second preview/review stop. Countdown, encoding and printing do not run a Guest inactivity timer. Timeout discards the image, closes the old session and permits a fresh session only after readiness is restored.
- Camera, network and printer-connection faults stop active Guest interaction before an asynchronous readiness read. The photo and Capture leave the view immediately. A printer send already authorized retains its buffer until transport settles, while the attempt remains independently reconcilable. Failed session closure prevents fresh admission.
- Used the full PRD capacity and connection messages in the unavailable state, including camera loss while a print outcome is pending.
- Added real two-device F5-04 coverage for exhaustion, denied Start, phone purchase, refreshed +10 counts and a new persisted Guest Session with zero inherited Captures or photo. Separate paused and pending-outcome variants keep admission denied.
- Retired orphaned version-1 Booth Guest/bootstrap/connection routes, old printer adapter/simulator, Wasted Film route and their obsolete success tests. No caller remains in source or tests. Shared version switches, schema/RPCs and negative legacy-boundary tests remain for F8.

## Red/green evidence

- Focused baseline: **78 passed** in three files. The 75/90-second clock test failed on missing warning state, then passed. The Continue component test failed on missing warning/action, then passed.
- Immediate camera/offline stop tests failed with `review`/`capturing` still visible, then passed. The adapter connection callback test failed with `review` still visible, then passed. The reservation-failure test exposed a stale `blob:` URL in the unavailable view, then passed after clearing it. A pending-outcome camera message test failed on the generic unavailable title, then passed with the exact camera message.
- A countdown/printing timer test initially failed because its fixture let readiness expire before dispatch; separate fresh fixtures passed. The authorized in-flight send and late-encoded photo tests passed against the existing one-send/image-ownership boundary after the immediate stop change.
- The new real two-device exhaustion/addition case passed by name. Its first version repeated a live final print after nine SQL-seeded outcomes and was unstable around simulator camera readiness; the existing final-unit test already covers that print. The final case seeds ten persisted Printed attempts and verifies the unique cross-device capacity/session contract. Paused and pending-outcome variants passed **2/2** by name.

Red/green commands used for the new behaviors included `npm test -- tests/unit/booth-flow.test.ts -t 'warns at 75 seconds'`, `npm test -- tests/unit/booth-flow.test.ts -t 'stops a reviewed|discards a late encoded'`, `npm test -- tests/unit/booth-flow.test.ts -t 'stops a reviewed Guest on an adapter'`, `npm test -- tests/unit/booth-flow.test.ts -t 'closes the old session before clearing'`, and `npm test -- tests/components/booth-flow.test.tsx -t 'offers an accessible Continue|announces camera loss'`. Each missing behavior was observed failing before its implementation and passing afterward.

## Verification

- `npm test -- tests/unit/booth-flow.test.ts tests/components/booth-flow.test.tsx tests/unit/booth-camera.test.ts tests/unit/package-print-dispatch.test.ts tests/unit/package-print-journal.test.ts`: **116 passed in 5 files** on the final code.
- `npx playwright test --config playwright.booth.config.ts --reporter=line`: **2 passed** on the final code, including request/storage/console payload checks. Browser configs set screenshots, traces and video to `off`.
- `npx playwright test --config playwright.admin-booth.config.ts --reporter=line`: **18 passed, 2 failed** in the first full run. The new case timed out on a camera-reenable race; the existing phone Pause/Resume case also timed out. After narrowing the new case, the second full run had **19 passed, 1 failed**; only the existing phone Pause/Resume case timed out waiting for Welcome after camera reenable. That fixture now waits for a successful camera-live readiness POST before Resume and checks durable Pause status instead of a transient command message. The named Pause/Resume rerun then **passed (1/1)**. A third full Admin config was not run after the fixture adjustment.
- `npm test -- tests/integration/test-and-wasted-film.test.ts`: **28 failed** at fixture creation because version-2 `events_version_allowance_check` rejects the suite's `original_print_allowance` write. The file tested retired Test Print, shared stock and Wasted Film success behavior and was deleted.
- `npm test -- --reporter=dot` without escalation: **24 files passed, 28 failed; 501 tests passed, 46 failed, 322 skipped**. All failing integration files hit sandbox `EPERM` from Supabase CLI telemetry under `~/.supabase`; this was not an assertion result. The escalated serial real-DB rerun continued for about 20 minutes and was stopped with exit **130** while still progressing after `tests/integration/package-late-capture.test.ts`; dot output had failure markers but no final assertion-file names. The full suite is **incomplete**, not passing evidence.
- `npx next typegen`, `npx tsc --noEmit`, changed-file ESLint, Prettier and `git diff --check`: **passed** on the final code.

## Limits and F8 handoff

- Simulator and browser checks do not qualify real automatic ejection or actual iPad release. Enabled Event Media remains under #30.
- F8 owns shared SQL/version branches (including the shared observation route), `mark_wasted_film`, `film_stock_entries`/`film_stock_balance`, legacy RPC/schema removal and the package-only fresh baseline. This task did not edit root or `docs/` authority files or the acceptance trace, per the user’s scope instruction.

Commit: `feat: complete guest timeouts and safe fault boundaries` (this commit).
