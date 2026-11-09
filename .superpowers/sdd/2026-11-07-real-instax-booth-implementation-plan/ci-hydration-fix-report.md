# CI Booth controls hydration fix — 2026-11-09

Scope: the Admin equipment-status hydration error in Verify physical adapter synthetic Bluetooth, on candidate `d426fda`. Other CI browser failures remain separate work.

## Cause and minimal correction

`BoothControls` initialized its equipment clock with `useState(Date.now)`. Client Components render for both server HTML and browser hydration. The five-second readiness expiry can fall between those independent clock samples; server HTML says Camera Ready / `data-ready=true`, while hydration says Needs check / no data-ready. This matches the two errors in the failed CI log (05:09:47 and 05:13:59). Opposite server/client clock skew can reverse the mismatch.

The only caller is the Admin operational panel. Initialize the equipment clock to null, rendering Needs check on both initial renders. Sample the browser clock in the existing post-mount animation frame that restores command storage. The existing expiry timer, five-second server-supplied expiry, Resume permission, unresolved-outcome checks, command restoration and server mutation authority are unchanged. Resume remains disabled before restoration or when readiness is stale. No SSR disabling, hydration suppression or wider timeout is used. No database, adapter, configuration, dependencies or product decisions changed.

## Red / green proof

Added `tests/components/booth-controls-hydration.test.tsx` using the real component, `renderToString` and `hydrateRoot` with deterministic clocks and timers. Before the production change both cases failed with React recoverable hydration errors and the exact Ready/Needs check mismatch. After the change both pass. The regression covers expiry between SSR and hydration, opposite clock skew, fail-closed initial markup/buttons, fresh browser readiness and Resume becoming disabled when that same readiness expires.

## Checks

- `npx --no-install vitest run tests/components/booth-controls-hydration.test.tsx tests/components/admin-operations-pages.test.tsx`: 2 files, 10 tests passed.
- `npx --no-install eslint src/features/admin/operations/booth-controls.tsx tests/components/booth-controls-hydration.test.tsx`: passed.
- `npx --no-install tsc --noEmit`: passed.
- Playwright CLI, real Chromium, temporary Vite SSR/hydration harness importing the real BoothControls, synthetic props only: desktop 1280×900 and phone 390×900 both reported no recoverable hydration errors or page errors, Camera Needs check and Resume disabled with a clock sampled after expiry. No database, guest images, traces or video. Harness setup initially had Vite-only module import errors; corrected normal module resolution and reran successfully. Temporary harness source removed and server stopped.
- Next.js feedback pass: no qualifying framework candidate; this was application render nondeterminism. No feedback command needed.

## Limits

Full unit/integration/Admin/physical-adapter suites were not rerun locally under the requested CI-only full-suite scope. The other nine failed browser cases are unchanged. CI rerun is owned by the coordinator after review; this report does not claim CI or physical/iPad qualification. Initial equipment status now conservatively displays Needs check until the first client frame.
