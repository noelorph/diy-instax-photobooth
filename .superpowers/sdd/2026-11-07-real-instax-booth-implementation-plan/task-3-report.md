# Task 3 — physical Booth wiring

Status: implementation and available software verification complete; database-backed browser acceptance remains blocked by local Docker/Supabase availability. Independent coordinator review is required. No physical qualification claim.

## Scope and implementation

- Server EventPage passes the server-selected mode through OperationsPanel to BoothSetup. Disabled setup creates no adapter and offers no Connect/Start actions. Existing simulator test callers now select their mode explicitly.
- `getBoothPrinter(mode)` retains a single selected adapter across setup → handoff → Guest route. A mode change while owned fails instead of substituting another adapter. The physical wrapper opens Bluetooth only on Connect. `releaseBoothPrinter()` performs terminal teardown and discards the registry entry; React subscription cleanup does neither.
- Acknowledged handoff uses client navigation to preserve Bluetooth ownership. The validated UUID `entry` query value is only a React remount key, cleared from the visible URL by the mounted client. It forces a fresh controller even for same-run access replacement or a cached disposed route. It supplies no authority, exposes no cookie/hash, and never invokes confirmation again. The existing activation acknowledgement/recovery still precedes navigation.
- BoothEntry derives physical/simulator ownership from authenticated pinned evidence when present. A current-mode mismatch mounts reconciliation-only. Disabled entry without valid scoped access creates no owner. Production always returns BoothPaused. The controller independently blocks Start and send authorization in reconciliation-only mode; server state still applies database-policy blockers.
- The browser reports camera/network conditions; the controller combines these with measured printer connection/readiness/old-job safety, including snapshot safety in admission and acknowledgement checks. Expected printer busy status does not end an active print. Camera/network loss blocks synchronously; an asynchronous healthy sample started before that loss cannot restore admission.
- Reused Task 1's strengthened metadata journal and observation serializer unchanged: printer/attempt/dispatch/generation/observation/evidence identity is durable before HTTP, original receipt payloads replay without sending, corrupt/old journals reconcile authoritative pending work and remain fail-closed. Existing delayed-reservation/session-end fencing stays intact. No photo data enters these interfaces.
- Added a synthetic Web Bluetooth boundary with modeled device-info/print/status services, checksum/framing validation and recorded FI033/0102 payload excerpts. It records counters only, never upload bytes, and replaces `navigator.bluetooth` before startup without host fallback. Real MiniLink3PrinterV2/transport execute the image path.
- Added eight DB-backed browser cases: normal, delayed acknowledgement, known-empty/error and disconnect/reconnect, each at 820×1180 and 1180×820. They cover setup/sign-out/owner handoff, capture/Retake/upload, acceptance remaining unconfirmed, ejection/acknowledgement/three-second close, one execute/one Printed, no simulator controls and metadata-only HTTP/journal. Error/reconnect cases never gain another send.
- Added port 1441 Instax config with one worker, no reuse, fake camera and screenshots/traces/video off. Runner fixes 1438/1439 to simulation and 1441 to physical development with simulator controls false. Default production discovery excludes all three specialized files. CI runs physical synthetic suite serially and production denial with both requested modes. Production denial assertions include Start, dispatch and physical evidence.
- The existing `createPackageBrowserFixture` already reads all three policy values and restores the exact original policy in its disposal `finally`; physical cases set only fixture-owned local policy and always dispose. No extra fixture abstraction was needed.

## Red/green and verification

Initial red command:

```sh
npm test -- tests/unit/booth-equipment.test.ts tests/unit/booth-page.test.tsx
```

Result: three failed, two passed. Failures independently exposed simulator-only owner, missing explicit terminal release and denied pinned physical reconciliation. After wiring, the required scoped seven files passed 161/161.

A later stale-measurement red test failed with `expected 'welcome' to be 'unavailable'` when an earlier healthy asynchronous printer read completed after camera loss. The equipment epoch check fixed the root race; flow/page checks then passed 93/93. Handoff-key red test exposed null/equal keys; validated entry keys fixed it. Added page-operations mock for the newly introduced server-mode dependency after broad verification exposed that import boundary.

The delayed-ack timing oracle drains microtasks at zero fake-clock advance before checking 2,999 ms; `vi.waitFor` would itself advance the fake clock and produce an invalid duration assertion. The passing oracle checks no confirmation/local Printed increment before acknowledgement, confirmation at 2,999 ms afterwards, and exactly one session end at 3,000 ms. Existing final-unit, Pause/Finish, camera-loss, receipt replay, wrong identity, journal failure, corrupt journal, duplicate/conflicting observation and recovery tests remain in the scoped runs.

Scoped expanded command before final handoff refinements:

```sh
npm test -- tests/unit/booth-equipment.test.ts tests/unit/booth-flow.test.ts tests/unit/package-print-dispatch.test.ts tests/unit/package-print-journal.test.ts tests/unit/booth-page.test.tsx tests/components/booth-setup.test.tsx tests/components/booth-flow.test.tsx tests/components/admin-operations.test.tsx tests/unit/instax-printer.test.ts tests/unit/package-printer.test.ts
```

Result: 267/267 passed in ten files. After the final refinements, the affected page/controller/component runs passed (including 28/28 across page entry, page operations and keyed client remount). Final broad command and result:

```text
npm test -- tests/unit tests/components src/features
Test Files 35 passed (35)
Tests 626 passed (626)
Duration 107.58s
```

A final React-state retention correction includes mode in the setup key and mode/reconciliation policy in the Booth key. Its focused final run passed 57/57 (page entry and Admin operations). No code changed after that run.

```text
npx tsc --noEmit   exit 0
npm run lint      exit 0; 13 existing unused-variable warnings in design-reference artifacts, zero errors
npm run format:check   all matched files use Prettier code style
git diff --check  exit 0
```

These checks exclude database-dependent integration tests, which remain blocked by the same local stack failure.

Actual Chromium synthetic-boundary check (temporary `/private/tmp/task3-chromium-smoke.cjs`, no app/DB replacement oracle): bundled the actual adapter and fixture using installed esbuild, fulfilled a loopback page in memory, connected and sent the existing synthetic baseline JPEG, supplied active then idle status, asserted one execute and safe completion, and disconnected in `finally`.

```text
{"chromiumSyntheticAdapter":"passed","events":["command_accepted","full_ejection_confirmed","ready_for_new_job"],"counts":{"executeCount":1,"chooserCount":1},"safe":true}
```

Sandbox Chromium launch initially exited SIGTRAP; authorized elevated launch worked. An initial about:blank smoke lacked secure-context Web Crypto; the final loopback in-memory page supplied the correct browser context. These are test-environment adjustments, not product workarounds. No screenshot, trace, video or photo artifact was written.

Discovery commands all passed and started no app/database operation:

```text
npx playwright test --config playwright.config.ts --list             34 tests / 8 files; no specialized files
npx playwright test --config playwright.booth.config.ts --list        2 tests / booth-simulator.spec.ts only
npx playwright test --config playwright.admin-booth.config.ts --list 20 tests / admin-booth-simulator.spec.ts only
npx playwright test --config playwright.instax.config.ts --list       8 tests / booth-instax.spec.ts only
```

Required execution attempts (serial, with all fixture guards retained):

```text
npx playwright test --config playwright.instax.config.ts
npx playwright test --config playwright.booth.config.ts
npx playwright test --config playwright.admin-booth.config.ts
BOOTH_PRINTER_MODE=simulated npx playwright test --config playwright.config.ts tests/e2e/admin-booth-handoff.spec.ts
BOOTH_PRINTER_MODE=instax-development npx playwright test --config playwright.config.ts tests/e2e/admin-booth-handoff.spec.ts
```

Every attempt exited 1 before starting the app: `supabase status -o json` → `failed to inspect container health: EOF`. Initial sandbox attempt also encountered a Supabase telemetry EPERM; elevated execution established the real Docker failure for every required config. No database mutation, reset, fixture bypass or owner environment edit occurred. Authored HTTP/database assertions remain unexecuted, not passed. The Chromium transport check does not replace them.

## Self-review and handoff

Reviewed every getBoothPrinter/BoothClient/BoothSetup/OperationsPanel caller, the server/client boundary, route-cache lifecycle, connection generation/identity checks, observation journal serialization/replay, image ownership/disposal, specialized config isolation and CI ordering. Existing Task 1/2 serializer/adapter behavior was reused rather than duplicated. No dependency, new generic recovery framework, Task 4 reload work, authority-document decision, physical command or hosted change was introduced.

Remaining verification: once the existing isolated stack is healthy, execute the eight real-HTTP/DB physical browser cases, both simulator suites and production denial under both mode requests. This must prove actual Next navigation/scoped authority with local Auth and policy restoration; source/component/Chromium boundary checks cannot establish that acceptance. Physical printer/actual-iPad/F6/F8/media qualification remains separate. Accepted November normal-ejection, final-used-sheet, known-empty-negative and normal-reload trial checks remain preserved and were not repeated.

Next feedback reporting pass: reviewed encountered friction; no qualifying Next.js issue candidate. No reporting command required.
